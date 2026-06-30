import { settings, preloadThumbs, virtualPage, totalPages } from './state.js';
import { PRELOAD_DELAY_MS, LOG, IMAGE_PRELOAD_TIMEOUT_MS } from '../shared/constants.js';
import {
  getViewerPageFromUrl,
  getSpreadPageInfo,
  getPreloadWindowPages,
  formatDuration
} from '../shared/viewer-utils.js';
import {
  getMainImage,
  getCurrentKey,
  getGalleryBaseUrl,
  fetchGalleryPageUrls,
  getTotalPageLabel,
  resolvePageData,
  pageUrlMap,
  pageImageMap
} from './navigation.js';
import type { PreloadStateEntry } from '../shared/types.js';
import { isOverlayActive, showStatus, showStatusLines } from './status.js';

let lastPreloadRootKey = '';
let preloadState: Record<number, PreloadStateEntry> = {};
let preloadRunId = 0;
// Persistent byte-warm tracker for the current overlay/gallery session: page numbers
// whose image bytes have been fetched into the HTTP cache. Survives advances so that
// overlapping preload windows skip re-fetching. Cleared only on overlay teardown.
const preloadedPages = new Set<number>();
// Image elements for the CURRENT window only (for the off-by-default thumb strip).
// Reset on every preloadNext().
let windowImages: Map<number, HTMLImageElement> = new Map();
let currentWindowPages: number[] = [];
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

// Reset only the per-window state, NOT the persistent byte-warm tracker.
function resetWindowState() {
  windowImages = new Map();
  currentWindowPages = [];
  preloadThumbs.value = [];
}

// Clear the persistent byte-warm tracker + window state + abort in-flight preloads.
// Call on overlay teardown (gallery/session change).
export function resetPreloadCache() {
  abortActivePreload();
  preloadedPages.clear();
  resetWindowState();
  preloadState = {};
  lastPreloadRootKey = '';
}

function updatePreloadThumbs() {
  if (!settings.value.showPreloadThumbs) return;
  const thumbs: HTMLImageElement[] = [];
  for (let i = 0; i < currentWindowPages.length; i += 1) {
    const img = windowImages.get(currentWindowPages[i]);
    if (img && img.src) thumbs.push(img);
  }
  preloadThumbs.value = thumbs;
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
  updatePreloadThumbs();
}

function setPreloadState(depth: number, patch: Partial<PreloadStateEntry>) {
  preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
  if (settings.value.showStatus) updatePreloadStatus();
}

function preloadImage(page: number, imageUrl: string, runId: number) {
  return new Promise<void>(function (resolve, reject) {
    const image = new Image();
    // Only the first of load/error/timeout takes effect. Without this, a late
    // onload after a timeout would still mark the page warm (status failed but
    // later reported as cache).
    let settled = false;
    const timeout = window.setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error('image preload timeout'));
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    image.onload = function () {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (runId === preloadRunId) {
        preloadedPages.add(page);
        windowImages.set(page, image);
      }
      resolve();
    };
    image.onerror = function () {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error('image preload failed'));
    };
    image.decoding = 'async';
    image.src = imageUrl;
  });
}

function markLoaded(depth: number, page: number, startedAt: number) {
  setPreloadState(depth, {
    status: 'loaded',
    page: String(page),
    duration: Date.now() - startedAt,
    method: 'img'
  });
}

function markFailed(depth: number, page: number, startedAt: number, method: string) {
  setPreloadState(depth, {
    status: 'failed',
    page: String(page),
    duration: Date.now() - startedAt,
    method: method
  });
}

function prefetchOnePage(page: number, depth: number, runId: number) {
  if (runId !== preloadRunId) return Promise.resolve();

  if (preloadedPages.has(page)) {
    // Reconstruct the thumb (off by default) for already-warm pages so the strip
    // stays complete across overlapping windows. The Image is served from cache.
    if (settings.value.showPreloadThumbs && !windowImages.has(page)) {
      const cachedUrl = pageImageMap[page];
      if (cachedUrl) {
        const thumb = new Image();
        thumb.src = cachedUrl;
        windowImages.set(page, thumb);
      }
    }
    setPreloadState(depth, { status: 'loaded', page: String(page), duration: 0, method: 'cache' });
    return Promise.resolve();
  }

  const startedAt = Date.now();
  setPreloadState(depth, { status: 'loading', page: String(page), duration: 0, method: 'fetch' });

  // Image URL already known → skip the doc fetch, warm bytes directly.
  const knownImageUrl = pageImageMap[page];
  if (knownImageUrl) {
    return preloadImage(page, knownImageUrl, runId)
      .then(function () {
        if (runId !== preloadRunId) return;
        markLoaded(depth, page, startedAt);
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return;
        log('parallel preload failed:', error);
        if (runId === preloadRunId) markFailed(depth, page, startedAt, 'img');
      });
  }

  const url = pageUrlMap[page];
  if (!url) {
    markFailed(depth, page, startedAt, 'fetch');
    return Promise.resolve();
  }

  return resolvePageData(url, preloadAbortController ? preloadAbortController.signal : undefined)
    .then(function (data) {
      if (runId !== preloadRunId) return;
      if (!data.imageUrl) throw new Error('next image url not found');
      return preloadImage(page, data.imageUrl, runId).then(function () {
        if (runId !== preloadRunId) return;
        markLoaded(depth, page, startedAt);
      });
    })
    .catch(function (error) {
      if (error && error.name === 'AbortError') return;
      log('parallel preload failed:', error);
      if (runId === preloadRunId) markFailed(depth, page, startedAt, 'fetch');
    });
}

// Fetch gallery list pages until every window page has a URL (or no progress is made).
function ensureWindowUrls(pages: number[], runId: number): Promise<void> {
  const galleryUrl = getGalleryBaseUrl();
  if (!galleryUrl) return Promise.resolve();

  function step(): Promise<void> {
    if (runId !== preloadRunId) return Promise.resolve();
    const missing = pages.filter(function (page) {
      return !pageUrlMap[page];
    });
    if (!missing.length) return Promise.resolve();
    const before = missing.length;
    const signal = preloadAbortController ? preloadAbortController.signal : undefined;
    return fetchGalleryPageUrls(galleryUrl, missing[0], signal)
      .catch(function () {})
      .then(function () {
        if (runId !== preloadRunId) return;
        const after = pages.filter(function (page) {
          return !pageUrlMap[page];
        }).length;
        if (after >= before) return; // no progress → stop to avoid an infinite loop
        return step();
      });
  }

  return step();
}

function preloadPagesAhead(pages: number[], runId: number) {
  return ensureWindowUrls(pages, runId).then(function () {
    if (runId !== preloadRunId) return;
    // prefetchOnePage never rejects (handles its own errors). Promise.all ties
    // the per-page lifetimes to this promise for future observability.
    return Promise.all(
      pages.map(function (page, index) {
        return prefetchOnePage(page, index + 1, runId);
      })
    );
  });
}

export function preloadNext() {
  if (settings.value.preloadAheadCount <= 0) {
    abortActivePreload();
    resetWindowState();
    preloadState = {};
    showStatus('EH: preload off');
    return;
  }

  if (!isOverlayActive()) return;

  const rootKey = getCurrentKey();
  if (rootKey === lastPreloadRootKey) return;
  lastPreloadRootKey = rootKey;
  abortActivePreload();
  preloadAbortController = new AbortController();
  resetWindowState();
  preloadState = {};

  const runId = preloadRunId;
  const currentPage = virtualPage.value || parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const total = totalPages.value || parseInt(getTotalPageLabel(), 10) || 0;
  const info = settings.value.spreadView
    ? getSpreadPageInfo(currentPage, total, settings.value.spreadCoverAlone)
    : { pagesInSpread: 1 };
  const pages = getPreloadWindowPages(
    currentPage,
    info.pagesInSpread,
    total,
    settings.value.preloadAheadCount
  );
  currentWindowPages = pages;
  // Fire-and-forget; per-page errors are handled inside prefetchOnePage.
  void preloadPagesAhead(pages, runId);
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
