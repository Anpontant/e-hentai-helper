import { settings, preloadThumbs } from './state.js';
import { PRELOAD_DELAY_MS } from '../shared/constants.js';
import { LOG } from '../shared/constants.js';
import {
  normalizeUrl,
  getViewerPageFromUrl,
  getUrlTail,
  getSpreadPageInfo,
  formatDuration
} from '../shared/viewer-utils.mjs';
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
import { isOverlayActive, showStatus, showStatusLines } from './status.js';

var lastPreloadRootKey = '';
var preloadState = {};
var preloadRunId = 0;
var preloadedImages = [];
var preloadAbortController = null;

function log() {
  if (!LOG || !window.console) return;
  var args = Array.prototype.slice.call(arguments);
  args.unshift('[EH helper]');
  console.log.apply(console, args);
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
  var frames = document.querySelectorAll('.eh-helper-preload-frame');
  for (var i = 0; i < frames.length; i += 1) {
    if (frames[i].parentNode) frames[i].parentNode.removeChild(frames[i]);
  }
  preloadedImages = [];
  preloadThumbs.value = [];
}

function updatePreloadStatus() {
  var parts = [];
  for (var i = 1; i <= settings.value.preloadAheadCount; i += 1) {
    var item = preloadState[i];
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

function setPreloadState(depth, patch) {
  preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
  if (settings.value.showStatus) updatePreloadStatus();
}

function preloadImage(imageUrl) {
  return new Promise(function (resolve, reject) {
    var image = new Image();
    var timeout = window.setTimeout(function () {
      reject(new Error('image preload timeout'));
    }, 5000);

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

function preloadByHiddenFrame(nextUrl, depth, startedAt, runId) {
  return new Promise(function (resolve) {
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

    var frameEl = document.createElement('iframe');
    frameEl.className = 'eh-helper-preload-frame';
    frameEl.id = 'eh-helper-preload-frame-' + depth;
    frameEl.src = nextUrl;
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute('referrerpolicy', 'same-origin');

    frameEl.addEventListener(
      'load',
      function () {
        var followingUrl = '';
        if (runId !== preloadRunId) {
          frameEl.remove();
          resolve('');
          return;
        }

        try {
          var frameDoc = frameEl.contentDocument || frameEl.contentWindow.document;
          var page = getPageLabelFromDocument(frameDoc, nextUrl);
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

function preloadAheadFrom(nextUrl, depth) {
  if (!nextUrl || depth > settings.value.preloadAheadCount) return;

  var runId = preloadRunId;
  var startedAt = Date.now();
  var pageNum = parseInt(getViewerPageFromUrl(nextUrl), 10);
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

      var page = getPageLabelFromDocument(doc, nextUrl);
      var imageUrl = getImageUrlFromDocument(doc, nextUrl);
      var followingUrl = getNextPageUrlFromDocument(doc, nextUrl);

      if (!imageUrl) throw new Error('next image url not found');

      if (pageNum) pageImageMap[pageNum] = imageUrl;
      if (followingUrl) {
        var followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
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

  var rootKey = getCurrentKey();
  if (rootKey === lastPreloadRootKey) return;
  lastPreloadRootKey = rootKey;
  abortActivePreload();
  preloadAbortController = new AbortController();
  removeOldPreloadFrames();
  preloadState = {};

  var nextUrl = getNextPageUrl();
  if (!nextUrl) {
    showStatus('EH: next not found');
    return;
  }

  if (isOverlayActive()) {
    var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
    var totalStr = getTotalPageLabel();
    var total = parseInt(totalStr, 10) || 0;
    var info = settings.value.spreadView
      ? getSpreadPageInfo(currentPage, total, settings.value.spreadCoverAlone)
      : { pagesInSpread: 1 };
    var afterSpreadPage = currentPage + info.pagesInSpread + 1;
    var afterSpreadUrl = pageUrlMap[afterSpreadPage];
    if (afterSpreadUrl) {
      preloadAheadFrom(afterSpreadUrl, 1);
      return;
    }

    var cachedDoc = viewerDocCache.get(nextUrl);
    if (cachedDoc) {
      var afterPartner = getNextPageUrlFromDocument(cachedDoc, nextUrl);
      if (afterPartner) {
        preloadAheadFrom(afterPartner, 1);
      }
      return;
    }
  }

  preloadAheadFrom(nextUrl, 1);
}

export function schedulePreloadAfterCurrentImage() {
  var img = getMainImage();
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
