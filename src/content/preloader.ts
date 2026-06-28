import { settings, preloadThumbs, virtualPage, totalPages } from './state.js';
import { PRELOAD_DELAY_MS, LOG, IMAGE_PRELOAD_TIMEOUT_MS } from '../shared/constants.js';
import {
  normalizeUrl,
  getViewerPageFromUrl,
  getUrlTail,
  getSpreadPageInfo,
  formatDuration
} from '../shared/viewer-utils.js';
import {
  getMainImage,
  getCurrentKey,
  getNextPageUrl,
  getNextPageUrlFromDocument,
  getImageUrlFromDocument,
  getPageLabelFromDocument,
  fetchViewerDocument,
  getTotalPageLabel,
  viewerDocCache,
  pageUrlMap,
  pageImageMap,
  persistPageMaps
} from './navigation.js';
import type { PreloadStateEntry } from '../shared/types.js';
import { isOverlayActive, showStatus, showStatusLines } from './status.js';

let lastPreloadRootKey = '';
let preloadState: Record<number, PreloadStateEntry> = {};
let preloadRunId = 0;
let preloadedImages: HTMLImageElement[] = [];
let preloadAbortController: AbortController | null = null;

function log(...args: unknown[]) {
  if (!LOG || !window.console) return;
  console.log.apply(console, ['[EH helper]', ...args]);
}

export function abortActivePreload() {
  if (preloadAbortController) {
    preloadAbortController.abort();
    preloadAbortController = null;
  }
  preloadRunId += 1;
}

export function resetPreloadRootKey() {
  lastPreloadRootKey = '';
}

function removeOldPreloadFrames() {
  const frames = document.querySelectorAll('.eh-helper-preload-frame');
  for (let i = 0; i < frames.length; i += 1) {
    frames[i].remove();
  }
  preloadedImages = [];
  preloadThumbs.value = [];
}

function updatePreloadStatus() {
  const parts: string[] = [];
  for (let i = 1; i <= settings.value.preloadAheadCount; i += 1) {
    const item = preloadState[i];
    if (!item) continue;

    if (item.status === 'loading') {
      parts.push('EH: +' + i + ' loading p.' + item.page);
    } else if (item.status === 'loaded') {
      parts.push(
        'EH: +' +
          i +
          ' loaded p.' +
          item.page +
          ' ' +
          formatDuration(item.duration) +
          ' ' +
          item.method
      );
    } else if (item.status === 'failed') {
      parts.push('EH: +' + i + ' failed p.' + item.page);
    }
  }

  if (parts.length) showStatusLines(parts);
  if (settings.value.showPreloadThumbs) {
    preloadThumbs.value = preloadedImages.filter(function (img) {
      return img.src;
    });
  }
}

function setPreloadState(depth: number, patch: Partial<PreloadStateEntry>) {
  preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
  if (settings.value.showStatus) updatePreloadStatus();
}

function preloadImage(imageUrl: string) {
  return new Promise<void>(function (resolve, reject) {
    const image = new Image();
    const timeout = window.setTimeout(function () {
      reject(new Error('image preload timeout'));
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    image.onload = function () {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = function () {
      window.clearTimeout(timeout);
      reject(new Error('image preload failed'));
    };
    image.decoding = 'async';
    image.src = imageUrl;
    preloadedImages.push(image);
  });
}

function preloadByHiddenFrame(nextUrl: string, depth: number, startedAt: number, runId: number) {
  return new Promise<string>(function (resolve) {
    if (runId !== preloadRunId) {
      resolve('');
      return;
    }

    setPreloadState(depth, {
      status: 'loading',
      page: getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl),
      duration: 0,
      url: nextUrl,
      method: 'iframe'
    });

    const frameEl = document.createElement('iframe');
    frameEl.className = 'eh-helper-preload-frame';
    frameEl.id = 'eh-helper-preload-frame-' + depth;
    frameEl.src = nextUrl;
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute('referrerpolicy', 'same-origin');

    frameEl.addEventListener(
      'load',
      function () {
        let followingUrl = '';
        if (runId !== preloadRunId) {
          frameEl.remove();
          resolve('');
          return;
        }

        try {
          const frameDoc = frameEl.contentDocument || frameEl.contentWindow!.document;
          const page = getPageLabelFromDocument(frameDoc, nextUrl);
          followingUrl = getNextPageUrlFromDocument(frameDoc, nextUrl);
          setPreloadState(depth, {
            status: 'loaded',
            page: page,
            duration: Date.now() - startedAt,
            method: 'iframe'
          });
        } catch (error) {
          log('cannot read hidden frame document:', error);
          setPreloadState(depth, {
            status: 'failed',
            duration: Date.now() - startedAt,
            method: 'iframe'
          });
        }

        frameEl.remove();
        resolve(followingUrl);
      },
      { once: true }
    );

    frameEl.addEventListener(
      'error',
      function () {
        if (runId === preloadRunId) {
          setPreloadState(depth, {
            status: 'failed',
            duration: Date.now() - startedAt,
            method: 'iframe'
          });
        }
        frameEl.remove();
        resolve('');
      },
      { once: true }
    );

    document.documentElement.appendChild(frameEl);
  });
}

function preloadAheadFrom(nextUrl: string, depth: number) {
  if (!nextUrl || depth > settings.value.preloadAheadCount) return;

  const runId = preloadRunId;
  const startedAt = Date.now();
  const pageNum = parseInt(getViewerPageFromUrl(nextUrl), 10);
  if (pageNum) pageUrlMap[pageNum] = nextUrl;
  persistPageMaps();

  setPreloadState(depth, {
    status: 'loading',
    page: getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl),
    duration: 0,
    url: nextUrl,
    method: 'fetch'
  });

  fetchViewerDocument(nextUrl, preloadAbortController ? preloadAbortController.signal : undefined)
    .then(function (doc) {
      if (runId !== preloadRunId) return '';

      const page = getPageLabelFromDocument(doc, nextUrl);
      const imageUrl = getImageUrlFromDocument(doc, nextUrl);
      const followingUrl = getNextPageUrlFromDocument(doc, nextUrl);

      if (!imageUrl) throw new Error('next image url not found');

      if (pageNum) pageImageMap[pageNum] = imageUrl;
      if (followingUrl) {
        const followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
        if (followingPage) pageUrlMap[followingPage] = followingUrl;
      }
      persistPageMaps();

      return preloadImage(imageUrl).then(function () {
        if (runId !== preloadRunId) return '';
        setPreloadState(depth, {
          status: 'loaded',
          page: page,
          duration: Date.now() - startedAt,
          method: 'img'
        });
        return followingUrl;
      });
    })
    .catch(function (error) {
      if (error && error.name === 'AbortError') return '';
      log('fetch/image preload failed, falling back to iframe:', error);
      return preloadByHiddenFrame(nextUrl, depth, startedAt, runId);
    })
    .then(function (followingUrl) {
      if (runId !== preloadRunId) return;
      if (!followingUrl || normalizeUrl(followingUrl) === normalizeUrl(nextUrl)) return;
      preloadAheadFrom(followingUrl, depth + 1);
    });
}

export function preloadNext() {
  if (settings.value.preloadAheadCount <= 0) {
    abortActivePreload();
    removeOldPreloadFrames();
    preloadState = {};
    showStatus('EH: preload off');
    return;
  }

  const rootKey = getCurrentKey();
  if (rootKey === lastPreloadRootKey) return;
  lastPreloadRootKey = rootKey;
  abortActivePreload();
  preloadAbortController = new AbortController();
  removeOldPreloadFrames();
  preloadState = {};

  if (isOverlayActive() && virtualPage.value > 0) {
    const currentPage = virtualPage.value;
    const total = totalPages.value;
    const info = settings.value.spreadView
      ? getSpreadPageInfo(currentPage, total, settings.value.spreadCoverAlone)
      : { pagesInSpread: 1 };
    const afterSpreadPage = currentPage + info.pagesInSpread;
    const afterSpreadUrl = pageUrlMap[afterSpreadPage];
    if (afterSpreadUrl) {
      preloadAheadFrom(afterSpreadUrl, 1);
    }
    return;
  }

  const nextUrl = getNextPageUrl();
  if (!nextUrl) {
    showStatus('EH: next not found');
    return;
  }

  if (isOverlayActive()) {
    const currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
    const totalStr = getTotalPageLabel();
    const total = parseInt(totalStr, 10) || 0;
    const info = settings.value.spreadView
      ? getSpreadPageInfo(currentPage, total, settings.value.spreadCoverAlone)
      : { pagesInSpread: 1 };
    const afterSpreadPage = currentPage + info.pagesInSpread + 1;
    const afterSpreadUrl = pageUrlMap[afterSpreadPage];
    if (afterSpreadUrl) {
      preloadAheadFrom(afterSpreadUrl, 1);
      return;
    }

    const cachedDoc = viewerDocCache.get(nextUrl);
    if (cachedDoc) {
      const afterPartner = getNextPageUrlFromDocument(cachedDoc, nextUrl);
      if (afterPartner) {
        preloadAheadFrom(afterPartner, 1);
      }
      return;
    }
  }

  preloadAheadFrom(nextUrl, 1);
}

export function schedulePreloadAfterCurrentImage() {
  const img = getMainImage();
  if (!img || img.complete) {
    window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
    return;
  }

  img.addEventListener(
    'load',
    function () {
      window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
    },
    { once: true }
  );
}
