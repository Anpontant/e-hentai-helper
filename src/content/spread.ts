import { settings, spreadState } from './state.js';
import { getViewerPageFromUrl, getSpreadPageInfo } from '../shared/viewer-utils.js';
import {
  getMainImage,
  getNextPageUrl,
  getNextPageUrlFromDocument,
  getPrevPageUrl,
  getPrevPageUrlFromDocument,
  getGalleryBaseUrl,
  fetchGalleryPageUrls,
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

let spreadRenderRunId = 0;
let lastSpreadActive = false;

function loadPartnerImage(partnerPage: number, runId: number, callback: (src: string) => void) {
  const cachedImage = pageImageMap[partnerPage];
  if (cachedImage) {
    callback(cachedImage);
    return;
  }

  const partnerUrl = pageUrlMap[partnerPage] || getNextPageUrl();
  if (!partnerUrl) {
    callback('');
    return;
  }

  pageUrlMap[partnerPage] = partnerUrl;
  persistPageMaps();

  fetchViewerDocument(partnerUrl)
    .then(function (doc) {
      if (runId !== spreadRenderRunId) return;
      const imageUrl = getImageUrlFromDocument(doc, partnerUrl);
      if (imageUrl) {
        pageImageMap[partnerPage] = imageUrl;
        callback(imageUrl);
      }
      const followingUrl = getNextPageUrlFromDocument(doc, partnerUrl);
      if (followingUrl) {
        const followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
        if (followingPage) pageUrlMap[followingPage] = followingUrl;
      }
      persistPageMaps();
    })
    .catch(function () {
      if (runId !== spreadRenderRunId) return;
      callback('');
    });
}

export function renderSpread(skipSnap?: boolean) {
  const s = settings.value;
  if (!s.overlayView && !s.spreadView) return;

  const mainImg = getMainImage();
  if (!mainImg) return;
  const img = mainImg;

  const currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const totalStr = getTotalPageLabel();
  const total = parseInt(totalStr, 10) || 0;
  const useSpread = s.spreadView;
  let info = useSpread
    ? getSpreadPageInfo(currentPage, total, s.spreadCoverAlone)
    : { partnerPage: null, pagesInSpread: 1, isRightPage: true };

  if (!info.isRightPage) {
    if (skipSnap) {
      info = { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    } else {
      const snapUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
      if (snapUrl) location.href = snapUrl;
      return;
    }
  }

  pageUrlMap[currentPage] = location.href;
  if (img.src && !pageImageMap[currentPage]) pageImageMap[currentPage] = img.src;
  persistPageMaps();

  spreadRenderRunId += 1;
  const runId = spreadRenderRunId;

  const cachedSrc = pageImageMap[currentPage];
  const rightSrc = cachedSrc || img.src || '';
  const rightFallbackSrc = cachedSrc ? img.src || '' : '';

  if (!img.complete) {
    img.addEventListener(
      'load',
      function () {
        if (runId !== spreadRenderRunId) return;
        if (!cachedSrc && img.src) {
          pageImageMap[currentPage] = img.src;
          persistPageMaps();
          spreadState.value = {
            ...spreadState.value,
            rightSrc: img.src || ''
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

function navigateViaGalleryMap(targetPage: number, fallback: () => void) {
  const galleryUrl = getGalleryBaseUrl();
  if (!galleryUrl) {
    fallback();
    return;
  }
  fetchGalleryPageUrls(galleryUrl, targetPage)
    .then(function () {
      const url = pageUrlMap[targetPage];
      if (url) {
        location.href = url;
      } else {
        fallback();
      }
    })
    .catch(function () {
      fallback();
    });
}

function fetchAndNavigate(
  adjacentUrl: string,
  getUrlFromDoc: (doc: Document, url: string) => string
) {
  const cached = viewerDocCache.get(adjacentUrl);
  if (cached) {
    const target = getUrlFromDoc(cached, adjacentUrl);
    location.href = target || adjacentUrl;
    return;
  }

  fetchViewerDocument(adjacentUrl)
    .then(function (doc) {
      const target = getUrlFromDoc(doc, adjacentUrl);
      location.href = target || adjacentUrl;
    })
    .catch(function () {
      location.href = adjacentUrl;
    });
}

export function advanceSpread() {
  const s = settings.value;
  const currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const totalStr = getTotalPageLabel();
  const total = parseInt(totalStr, 10) || 0;
  const info = s.spreadView
    ? getSpreadPageInfo(currentPage, total, s.spreadCoverAlone)
    : { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  const targetPage = currentPage + info.pagesInSpread;

  const mapped = pageUrlMap[targetPage];
  if (mapped) {
    location.href = mapped;
    return;
  }

  navigateViaGalleryMap(targetPage, function () {
    if (info.pagesInSpread === 1) {
      const nextUrl = getNextPageUrl();
      if (nextUrl) location.href = nextUrl;
      return;
    }

    const partnerUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
    if (!partnerUrl) return;

    fetchAndNavigate(partnerUrl, getNextPageUrlFromDocument);
  });
}

export function retreatSpread() {
  const currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const targetPage = Math.max(1, currentPage - 2);
  if (targetPage >= currentPage) return;

  const mapped = pageUrlMap[targetPage];
  if (mapped) {
    location.href = mapped;
    return;
  }

  navigateViaGalleryMap(targetPage, function () {
    const prevUrl = getPrevPageUrl();
    if (!prevUrl) return;

    if (currentPage - targetPage === 1) {
      location.href = prevUrl;
      return;
    }

    fetchAndNavigate(prevUrl, getPrevPageUrlFromDocument);
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
  const s = settings.value;
  if (s.overlayView || s.spreadView) {
    const skipSnap = lastSpreadActive && s.spreadView;
    renderSpread(skipSnap);
    lastSpreadActive = s.spreadView;
  } else {
    removeSpreadOverlayState();
    lastSpreadActive = false;
  }
}
