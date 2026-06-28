import { settings, spreadState, virtualPage, totalPages } from './state.js';
import {
  getViewerPageFromUrl,
  getSpreadPageInfo,
  resolveSpreadPage
} from '../shared/viewer-utils.js';
import {
  getMainImage,
  getNextPageUrl,
  getNextPageUrlFromDocument,
  getGalleryBaseUrl,
  fetchGalleryPageUrls,
  getImageUrlFromDocument,
  getTotalPageLabel,
  fetchViewerDocument,
  pageUrlMap,
  pageImageMap,
  persistPageMaps,
  clearPageMapsStorage
} from './navigation.js';
import { applyImageFit } from './fit.js';
import { removeSpreadFitStyle } from './fit.js';
import { scrollToImage } from './scroll.js';
import { schedulePreloadAfterCurrentImage } from './preloader.js';

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

  virtualPage.value = currentPage;
  totalPages.value = total;
}

function resolvePageImage(page: number): Promise<string> {
  const cached = pageImageMap[page];
  if (cached) return Promise.resolve(cached);

  const url = pageUrlMap[page];
  if (url) {
    return fetchViewerDocument(url)
      .then(function (doc) {
        const imageUrl = getImageUrlFromDocument(doc, url);
        if (imageUrl) pageImageMap[page] = imageUrl;
        const nextUrl = getNextPageUrlFromDocument(doc, url);
        if (nextUrl) {
          const nextPage = parseInt(getViewerPageFromUrl(nextUrl), 10);
          if (nextPage) pageUrlMap[nextPage] = nextUrl;
        }
        persistPageMaps();
        return imageUrl;
      })
      .catch(function () {
        return '';
      });
  }

  const galleryUrl = getGalleryBaseUrl();
  if (!galleryUrl) return Promise.resolve('');

  return fetchGalleryPageUrls(galleryUrl, page).then(function () {
    const resolved = pageUrlMap[page];
    if (!resolved) return '';
    return resolvePageImage(page);
  });
}

function renderSpreadAtPage(targetPage: number, updateVirtualPage?: boolean) {
  const s = settings.value;
  const total = totalPages.value;

  const resolved = s.spreadView
    ? resolveSpreadPage(targetPage, total, s.spreadCoverAlone)
    : {
        rightPage: targetPage,
        info: { partnerPage: null, pagesInSpread: 1, isRightPage: true as const }
      };
  const rightPage = resolved.rightPage;
  const info = resolved.info;

  if (updateVirtualPage !== false) {
    virtualPage.value = rightPage;
  }
  spreadRenderRunId += 1;
  const runId = spreadRenderRunId;

  const cachedRight = pageImageMap[rightPage] || '';
  const cachedLeft = info.partnerPage ? pageImageMap[info.partnerPage] || '' : '';

  spreadState.value = {
    active: true,
    leftSrc: cachedLeft,
    rightSrc: cachedRight,
    rightFallbackSrc: '',
    single: !info.partnerPage
  };

  if (!cachedRight) {
    resolvePageImage(rightPage).then(function (src) {
      if (runId !== spreadRenderRunId) return;
      if (src) {
        spreadState.value = { ...spreadState.value, rightSrc: src };
      }
    });
  }

  if (info.partnerPage && !cachedLeft) {
    const partner = info.partnerPage;
    resolvePageImage(partner).then(function (src) {
      if (runId !== spreadRenderRunId) return;
      if (src) {
        spreadState.value = { ...spreadState.value, leftSrc: src };
      }
    });
  }

  persistPageMaps();
  schedulePreloadAfterCurrentImage();
}

export function advanceSpread() {
  const s = settings.value;
  const currentPage = virtualPage.value || parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const total = totalPages.value;
  const info = s.spreadView
    ? getSpreadPageInfo(currentPage, total, s.spreadCoverAlone)
    : { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  const targetPage = currentPage + info.pagesInSpread;

  if (total > 0 && targetPage > total) return;

  renderSpreadAtPage(targetPage);
}

export function retreatSpread() {
  const currentPage = virtualPage.value || parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const targetPage = Math.max(1, currentPage - 2);
  if (targetPage >= currentPage) return;

  renderSpreadAtPage(targetPage);
}

export function exitOverlay() {
  const galleryUrl = getGalleryBaseUrl();

  settings.value = { ...settings.value, overlayView: false, spreadView: false };
  browser.storage.local.set({ overlayView: false, spreadView: false });
  removeSpreadOverlayState();
  clearPageMapsStorage();

  if (galleryUrl) {
    location.href = galleryUrl;
  } else {
    applyImageFit();
    scrollToImage();
  }
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

  virtualPage.value = 0;
  totalPages.value = 0;

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
    if (virtualPage.value > 0) {
      renderSpreadAtPage(virtualPage.value, false);
    } else {
      const skipSnap = lastSpreadActive && s.spreadView;
      renderSpread(skipSnap);
    }
    lastSpreadActive = s.spreadView;
  } else {
    const actualPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
    const vp = virtualPage.value;
    const targetUrl = vp && vp !== actualPage ? pageUrlMap[vp] : '';

    removeSpreadOverlayState();
    clearPageMapsStorage();
    lastSpreadActive = false;

    if (targetUrl) {
      location.href = targetUrl;
    } else {
      applyImageFit();
      scrollToImage();
    }
  }
}
