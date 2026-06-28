import { settings, spreadState } from './state.js';
import { getViewerPageFromUrl, getSpreadPageInfo } from '../shared/viewer-utils.mjs';
import {
  getMainImage,
  getNextPageUrl,
  getNextPageUrlFromDocument,
  getImageUrlFromDocument,
  getTotalPageLabel,
  fetchViewerDocument,
  viewerDocCache,
  pageUrlMap,
  pageImageMap,
  persistPageMaps,
  clearPageMapsStorage
} from './navigation.js';
import { applyImageFit } from './fit.js';
import { removeSpreadFitStyle } from './fit.js';
import { scrollToImage } from './scroll.js';

var spreadRenderRunId = 0;
var lastSpreadActive = false;

function loadPartnerImage(partnerPage, runId, callback) {
  var cachedImage = pageImageMap[partnerPage];
  if (cachedImage) {
    callback(cachedImage);
    return;
  }

  var partnerUrl = pageUrlMap[partnerPage] || getNextPageUrl();
  if (!partnerUrl) {
    callback('');
    return;
  }

  pageUrlMap[partnerPage] = partnerUrl;
  persistPageMaps();

  fetchViewerDocument(partnerUrl)
    .then(function (doc) {
      if (runId !== spreadRenderRunId) return;
      var imageUrl = getImageUrlFromDocument(doc, partnerUrl);
      if (imageUrl) {
        pageImageMap[partnerPage] = imageUrl;
        callback(imageUrl);
      }
      var followingUrl = getNextPageUrlFromDocument(doc, partnerUrl);
      if (followingUrl) {
        var followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
        if (followingPage) pageUrlMap[followingPage] = followingUrl;
      }
      persistPageMaps();
    })
    .catch(function () {
      if (runId !== spreadRenderRunId) return;
      callback('');
    });
}

export function renderSpread(skipSnap) {
  var s = settings.value;
  if (!s.overlayView && !s.spreadView) return;

  var mainImg = getMainImage();
  if (!mainImg) return;

  var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  var totalStr = getTotalPageLabel();
  var total = parseInt(totalStr, 10) || 0;
  var useSpread = s.spreadView;
  var info = useSpread
    ? getSpreadPageInfo(currentPage, total, s.spreadCoverAlone)
    : { partnerPage: null, pagesInSpread: 1, isRightPage: true };

  if (!info.isRightPage) {
    if (skipSnap) {
      info = { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    } else {
      var snapUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
      if (snapUrl) location.href = snapUrl;
      return;
    }
  }

  pageUrlMap[currentPage] = location.href;
  if (mainImg.src && !pageImageMap[currentPage]) pageImageMap[currentPage] = mainImg.src;
  persistPageMaps();

  spreadRenderRunId += 1;
  var runId = spreadRenderRunId;

  var cachedSrc = pageImageMap[currentPage];
  var rightSrc = cachedSrc || mainImg.src || '';
  var rightFallbackSrc = cachedSrc ? mainImg.src || '' : '';

  if (!mainImg.complete) {
    mainImg.addEventListener(
      'load',
      function () {
        if (runId !== spreadRenderRunId) return;
        if (!cachedSrc && mainImg.src) {
          pageImageMap[currentPage] = mainImg.src;
          persistPageMaps();
          spreadState.value = {
            ...spreadState.value,
            rightSrc: mainImg.src || ''
          };
        }
      },
      { once: true }
    );
  }

  if (info.partnerPage) {
    spreadState.value = {
      active: true,
      leftSrc: '',
      rightSrc: rightSrc,
      rightFallbackSrc: rightFallbackSrc,
      single: false
    };
    loadPartnerImage(info.partnerPage, runId, function (src) {
      if (runId !== spreadRenderRunId) return;
      spreadState.value = { ...spreadState.value, leftSrc: src };
    });
  } else {
    spreadState.value = {
      active: true,
      leftSrc: '',
      rightSrc: rightSrc,
      rightFallbackSrc: rightFallbackSrc,
      single: true
    };
  }
}

export function advanceSpread() {
  var s = settings.value;
  var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  var totalStr = getTotalPageLabel();
  var total = parseInt(totalStr, 10) || 0;
  var info = s.spreadView
    ? getSpreadPageInfo(currentPage, total, s.spreadCoverAlone)
    : { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  var targetPage = currentPage + info.pagesInSpread;

  var mapped = pageUrlMap[targetPage];
  if (mapped) {
    location.href = mapped;
    return;
  }

  if (info.pagesInSpread === 1) {
    var nextUrl = getNextPageUrl();
    if (nextUrl) location.href = nextUrl;
    return;
  }

  var partnerUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
  if (!partnerUrl) return;

  var cached = viewerDocCache.get(partnerUrl);
  if (cached) {
    var target = getNextPageUrlFromDocument(cached, partnerUrl);
    location.href = target || partnerUrl;
    return;
  }

  fetchViewerDocument(partnerUrl)
    .then(function (doc) {
      var target = getNextPageUrlFromDocument(doc, partnerUrl);
      location.href = target || partnerUrl;
    })
    .catch(function () {
      location.href = partnerUrl;
    });
}

export function exitOverlay() {
  settings.value = { ...settings.value, overlayView: false, spreadView: false };
  browser.storage.local.set({ overlayView: false, spreadView: false });
  removeSpreadOverlayState();
  clearPageMapsStorage();
  applyImageFit();
  scrollToImage();
}

function removeSpreadOverlayState() {
  spreadRenderRunId += 1;
  spreadState.value = {
    active: false,
    leftSrc: '',
    rightSrc: '',
    rightFallbackSrc: '',
    single: false
  };

  Object.keys(pageUrlMap).forEach(function (k) {
    delete pageUrlMap[k];
  });
  Object.keys(pageImageMap).forEach(function (k) {
    delete pageImageMap[k];
  });
  removeSpreadFitStyle();
}

export function updateSpreadVisibility() {
  var s = settings.value;
  if (s.overlayView || s.spreadView) {
    var skipSnap = lastSpreadActive && s.spreadView;
    renderSpread(skipSnap);
    lastSpreadActive = s.spreadView;
  } else {
    removeSpreadOverlayState();
    lastSpreadActive = false;
  }
}
