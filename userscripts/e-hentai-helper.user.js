// ==UserScript==
// @name         E-Hentai scroll and preload helper
// @namespace    local.e-hentai-helper
// @version      0.6.0
// @description  Scroll the main image to the top and preload the next E-Hentai image/page after in-page navigation.
// @match        https://e-hentai.org/s/*
// @match        https://exhentai.org/s/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  var LOG = true;
  var SCROLL_OFFSET = 0;
  var PRELOAD_DELAY_MS = 500;
  var CHANGE_DEBOUNCE_MS = 250;
  var STORAGE_PREFIX = 'ehHelper.';
  var PRELOAD_OPTIONS = [0, 1, 2, 3];
  var FIT_OPTIONS = ['height', 'width', 'original'];

  var lastHandledKey = '';
  var lastPreloadRootKey = '';
  var changeTimer = 0;
  var preloadAheadCount = readNumberSetting('preloadAheadCount', 2);
  var fitMode = readStringSetting('fitMode', 'height');
  var preloadState = {};

  if (PRELOAD_OPTIONS.indexOf(preloadAheadCount) === -1) preloadAheadCount = 2;
  if (FIT_OPTIONS.indexOf(fitMode) === -1) fitMode = 'height';

  function log() {
    if (!LOG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[EH helper]');
    console.log.apply(console, args);
  }

  function showStatus(text) {
    var statusEl = getUiStatusElement();
    statusEl.textContent = text;
  }

  function readStringSetting(name, fallback) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + name) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function readNumberSetting(name, fallback) {
    var value = parseInt(readStringSetting(name, String(fallback)), 10);
    return isNaN(value) ? fallback : value;
  }

  function writeSetting(name, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + name, String(value));
    } catch (error) {
      log('cannot save setting:', name, error);
    }
  }

  function getUiRoot() {
    var root = document.getElementById('eh-helper-ui');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'eh-helper-ui';
    root.style.cssText = [
      'position:fixed',
      'right:8px',
      'bottom:8px',
      'z-index:999999',
      'display:flex',
      'align-items:center',
      'flex-wrap:wrap',
      'justify-content:flex-end',
      'gap:6px',
      'max-width:calc(100vw - 16px)',
      'font:12px/1.3 sans-serif'
    ].join(';');

    document.documentElement.appendChild(root);
    return root;
  }

  function getUiStatusElement() {
    var root = getUiRoot();
    var el = document.getElementById('eh-helper-status');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-status';
    el.style.cssText = [
      'padding:4px 7px',
      'font:12px/1.3 sans-serif',
      'color:#fff',
      'background:rgba(0,0,0,.72)',
      'border-radius:4px',
      'pointer-events:none',
      'white-space:nowrap'
    ].join(';');
    root.appendChild(el);
    return el;
  }

  function makeButton(id, text, title, onClick) {
    var button = document.getElementById(id);
    if (button) return button;

    button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.style.cssText = [
      'min-width:30px',
      'height:24px',
      'padding:2px 6px',
      'font:12px/1.2 sans-serif',
      'color:#fff',
      'background:rgba(0,0,0,.78)',
      'border:1px solid rgba(255,255,255,.45)',
      'border-radius:4px',
      'cursor:pointer'
    ].join(';');

    button.addEventListener('click', onClick);
    getUiRoot().appendChild(button);
    return button;
  }

  function setButtonActive(button, active) {
    button.style.background = active ? 'rgba(48,105,180,.92)' : 'rgba(0,0,0,.78)';
    button.style.borderColor = active ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.45)';
  }

  function updatePreloadButtons() {
    for (var i = 0; i < PRELOAD_OPTIONS.length; i += 1) {
      var value = PRELOAD_OPTIONS[i];
      var button = document.getElementById('eh-helper-preload-' + value);
      if (button) setButtonActive(button, preloadAheadCount === value);
    }
  }

  function updateFitButtons() {
    for (var i = 0; i < FIT_OPTIONS.length; i += 1) {
      var mode = FIT_OPTIONS[i];
      var button = document.getElementById('eh-helper-fit-' + mode);
      if (button) setButtonActive(button, fitMode === mode);
    }
  }

  function setPreloadAheadCount(value) {
    preloadAheadCount = value;
    writeSetting('preloadAheadCount', value);
    updatePreloadButtons();
    lastPreloadRootKey = '';
    removeOldPreloadFrames();
    preloadState = {};
    showStatus('EH: preload +' + value);
    if (value > 0) window.setTimeout(preloadNext, 50);
  }

  function setFitMode(mode) {
    fitMode = mode;
    writeSetting('fitMode', mode);
    updateFitButtons();
    applyImageFit();
    showStatus('EH: fit ' + mode);
  }

  function ensurePreloadButtons() {
    for (var i = 0; i < PRELOAD_OPTIONS.length; i += 1) {
      (function (value) {
        makeButton(
          'eh-helper-preload-' + value,
          value === 0 ? 'P0' : 'P' + value,
          value === 0 ? 'Disable preload' : 'Preload ' + value + ' page(s) ahead',
          function () {
            setPreloadAheadCount(value);
          }
        );
      }(PRELOAD_OPTIONS[i]));
    }
    updatePreloadButtons();
  }

  function ensureFitButtons() {
    makeButton('eh-helper-fit-height', 'H', 'Fit image to viewport height', function () {
      setFitMode('height');
    });
    makeButton('eh-helper-fit-width', 'W', 'Fit image to viewport width', function () {
      setFitMode('width');
    });
    makeButton('eh-helper-fit-original', '1:1', 'Show original image size', function () {
      setFitMode('original');
    });
    updateFitButtons();
  }

  function updateFullscreenButton() {
    var button = document.getElementById('eh-helper-fullscreen');
    if (!button) return;
    var active = Boolean(document.fullscreenElement);
    button.textContent = active ? 'Exit' : 'Full';
    button.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  }

  function toggleFullscreen() {
    var promise;
    if (document.fullscreenElement) {
      promise = document.exitFullscreen();
    } else {
      promise = document.documentElement.requestFullscreen();
    }

    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (error) {
        log('fullscreen failed:', error);
        showStatus('EH: fullscreen failed');
      });
    }
  }

  function ensureFullscreenButton() {
    makeButton('eh-helper-fullscreen', 'Full', 'Enter fullscreen', toggleFullscreen);
  }

  function getMainImage() {
    return document.getElementById('img');
  }

  function applyImageFit() {
    var img = getMainImage();
    if (!img) return;

    img.style.setProperty('object-fit', 'contain', 'important');

    if (fitMode === 'height') {
      img.style.setProperty('max-height', '100vh', 'important');
      img.style.setProperty('max-width', 'none', 'important');
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      return;
    }

    if (fitMode === 'width') {
      img.style.setProperty('max-width', '100vw', 'important');
      img.style.setProperty('max-height', 'none', 'important');
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      return;
    }

    img.style.setProperty('max-height', 'none', 'important');
    img.style.setProperty('max-width', 'none', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('object-fit', 'fill', 'important');
  }

  function isViewerUrl(url) {
    return typeof url === 'string' && /\/s\//.test(url);
  }

  function normalizeUrl(url) {
    return String(url || '').split('#')[0];
  }

  function getViewerPageFromUrl(url) {
    var match = normalizeUrl(url).match(/\/s\/[^/]+\/[^/]+-(\d+)/);
    return match ? match[1] : '';
  }

  function getCurrentPageLabel() {
    var fromUrl = getViewerPageFromUrl(location.href);
    if (fromUrl) return fromUrl;

    var pageText = document.body ? document.body.textContent.match(/(\d+)\s*\/\s*(\d+)/) : null;
    if (pageText) return pageText[1] + '/' + pageText[2];

    return '?';
  }

  function getUrlTail(url) {
    var parts = normalizeUrl(url).split('/');
    return parts.length ? parts[parts.length - 1] : '?';
  }

  function getPageStatus(nextUrl) {
    var current = getCurrentPageLabel();
    var next = getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl);
    return 'p.' + current + ' -> p.' + next;
  }

  function getCurrentKey() {
    var img = getMainImage();
    return normalizeUrl(location.href) + '|' + (img ? img.src : '');
  }

  function getNextPageUrlFromDocument(doc, docUrl) {
    var img = doc.getElementById('img');
    var fromImageLink = img && img.parentNode && img.parentNode.tagName === 'A'
      ? img.parentNode.href
      : '';

    if (isViewerUrl(fromImageLink) && normalizeUrl(fromImageLink) !== normalizeUrl(docUrl)) {
      return fromImageLink;
    }

    var nextById = '';
    var directNext = doc.getElementById('next');
    if (directNext && directNext.href) nextById = directNext.href;
    if (!nextById) {
      var nextContainer = doc.querySelector('#next a');
      if (nextContainer && nextContainer.href) nextById = nextContainer.href;
    }

    if (isViewerUrl(nextById) && normalizeUrl(nextById) !== normalizeUrl(docUrl)) {
      return nextById;
    }

    var links = doc.querySelectorAll('a[href*="/s/"]');
    var current = normalizeUrl(docUrl);
    for (var i = 0; i < links.length; i += 1) {
      if (links[i].href && normalizeUrl(links[i].href) !== current) {
        return links[i].href;
      }
    }

    return '';
  }

  function getNextPageUrl() {
    return getNextPageUrlFromDocument(document, location.href);
  }

  function scrollToImage() {
    var img = getMainImage();
    if (!img) {
      log('main image not found');
      showStatus('EH: image not found');
      return;
    }

    function scrollNow() {
      applyImageFit();
      var y = img.getBoundingClientRect().top + window.pageYOffset - SCROLL_OFFSET;
      window.scrollTo(0, Math.max(0, y));
      log('scrolled to image');
      showStatus('EH: p.' + getCurrentPageLabel() + ' scrolled');
    }

    if (img.complete) {
      scrollNow();
      return;
    }

    img.addEventListener('load', scrollNow, { once: true });
  }

  function removeOldPreloadFrames() {
    var frames = document.querySelectorAll('.eh-helper-preload-frame');
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].parentNode) frames[i].parentNode.removeChild(frames[i]);
    }
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function updatePreloadStatus() {
    var parts = [];
    for (var i = 1; i <= preloadAheadCount; i += 1) {
      var item = preloadState[i];
      if (!item) continue;

      if (item.status === 'loading') {
        parts.push('+' + i + ' loading p.' + item.page);
      } else if (item.status === 'loaded') {
        parts.push('+' + i + ' loaded p.' + item.page + ' ' + formatDuration(item.duration));
      } else if (item.status === 'failed') {
        parts.push('+' + i + ' failed p.' + item.page);
      }
    }

    if (parts.length) {
      showStatus('EH: ' + parts.join(' | '));
    }
  }

  function createHiddenFrame(nextUrl, depth, onLoaded) {
    log('preloading page by hidden frame:', depth, nextUrl);
    var startedAt = Date.now();
    preloadState[depth] = {
      status: 'loading',
      page: getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl),
      duration: 0,
      url: nextUrl
    };
    updatePreloadStatus();

    var frameEl = document.createElement('iframe');
    frameEl.className = 'eh-helper-preload-frame';
    frameEl.id = 'eh-helper-preload-frame-' + depth;
    frameEl.src = nextUrl;
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute('referrerpolicy', 'same-origin');
    frameEl.style.cssText = [
      'position:absolute',
      'width:1px',
      'height:1px',
      'left:-99999px',
      'top:-99999px',
      'opacity:0',
      'pointer-events:none',
      'border:0'
    ].join(';');

    frameEl.addEventListener('load', function () {
      preloadState[depth].status = 'loaded';
      preloadState[depth].duration = Date.now() - startedAt;
      log('hidden frame loaded:', depth, nextUrl);
      updatePreloadStatus();
      if (typeof onLoaded === 'function') onLoaded(frameEl);
    }, { once: true });

    frameEl.addEventListener('error', function () {
      preloadState[depth].status = 'failed';
      preloadState[depth].duration = Date.now() - startedAt;
      log('hidden frame failed:', depth, nextUrl);
      updatePreloadStatus();
    }, { once: true });

    document.documentElement.appendChild(frameEl);
    return frameEl;
  }

  function preloadAheadFrom(nextUrl, depth) {
    if (!nextUrl || depth > preloadAheadCount) return;

    createHiddenFrame(nextUrl, depth, function (frameEl) {
      var frameDoc = null;
      try {
        frameDoc = frameEl.contentDocument || frameEl.contentWindow.document;
      } catch (error) {
        log('cannot read hidden frame document:', error);
      }

      if (!frameDoc) return;

      var followingUrl = getNextPageUrlFromDocument(frameDoc, nextUrl);
      if (!followingUrl || normalizeUrl(followingUrl) === normalizeUrl(nextUrl)) return;

      preloadAheadFrom(followingUrl, depth + 1);
    });
  }

  function preloadNext() {
    if (preloadAheadCount <= 0) {
      removeOldPreloadFrames();
      preloadState = {};
      showStatus('EH: preload off');
      return;
    }

    var rootKey = getCurrentKey();
    if (rootKey === lastPreloadRootKey) return;
    lastPreloadRootKey = rootKey;
    removeOldPreloadFrames();
    preloadState = {};

    var nextUrl = getNextPageUrl();
    if (!nextUrl) {
      log('next page not found');
      showStatus('EH: next not found');
      return;
    }
    preloadAheadFrom(nextUrl, 1);
  }

  function handlePageStateChange(reason) {
    clearTimeout(changeTimer);
    changeTimer = window.setTimeout(function () {
      var key = getCurrentKey();
      if (key === lastHandledKey) return;
      lastHandledKey = key;

      log('handling page state:', reason, key);
      scrollToImage();
      window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
    }, CHANGE_DEBOUNCE_MS);
  }

  function patchHistoryMethod(name) {
    var original = history[name];
    if (typeof original !== 'function') return;

    history[name] = function () {
      var result = original.apply(this, arguments);
      handlePageStateChange(name);
      return result;
    };
  }

  function observeImageAndDomChanges() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === 'childList' || mutations[i].type === 'attributes') {
          handlePageStateChange('mutation');
          return;
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href']
    });
  }

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');
  window.addEventListener('popstate', function () {
    handlePageStateChange('popstate');
  });
  window.addEventListener('hashchange', function () {
    handlePageStateChange('hashchange');
  });
  document.addEventListener('fullscreenchange', updateFullscreenButton);

  ensurePreloadButtons();
  ensureFitButtons();
  ensureFullscreenButton();
  updateFullscreenButton();
  applyImageFit();
  observeImageAndDomChanges();
  handlePageStateChange('initial');
})();
