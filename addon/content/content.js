(function () {
  'use strict';

  var LOG = true;
  var SCROLL_OFFSET = 0;
  var PRELOAD_DELAY_MS = 500;
  var CHANGE_DEBOUNCE_MS = 250;
  var DEFAULT_SETTINGS = {
    preloadAheadCount: 2,
    fitMode: 'height',
    showStatus: true,
    autoScroll: true
  };
  var PRELOAD_OPTIONS = [0, 1, 2, 3];
  var FIT_OPTIONS = ['height', 'width', 'original'];

  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var lastHandledKey = '';
  var lastPreloadRootKey = '';
  var changeTimer = 0;
  var preloadState = {};

  function log() {
    if (!LOG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[EH helper]');
    console.log.apply(console, args);
  }

  function loadSettings() {
    return browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
      settings = Object.assign({}, DEFAULT_SETTINGS, stored || {});
      if (PRELOAD_OPTIONS.indexOf(settings.preloadAheadCount) === -1) {
        settings.preloadAheadCount = DEFAULT_SETTINGS.preloadAheadCount;
      }
      if (FIT_OPTIONS.indexOf(settings.fitMode) === -1) {
        settings.fitMode = DEFAULT_SETTINGS.fitMode;
      }
      updateFitStyle();
      applyImageFit();
      updateStatusVisibility();
      lastPreloadRootKey = '';
      preloadNext();
    });
  }

  function showStatus(text) {
    if (!settings.showStatus) return;
    showStatusLines([text]);
  }

  function showStatusLines(lines) {
    if (!settings.showStatus) return;
    var statusEl = getStatusElement();
    statusEl.textContent = '';

    var allLines = [getProgressLabel()].concat(lines || []);
    for (var i = 0; i < allLines.length; i += 1) {
      var line = document.createElement('div');
      line.className = i === 0 ? 'eh-helper-status-progress' : 'eh-helper-status-line';
      line.textContent = allLines[i];
      statusEl.appendChild(line);
    }
  }

  function getStatusElement() {
    var el = document.getElementById('eh-helper-status');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-status';
    document.documentElement.appendChild(el);
    return el;
  }

  function updateStatusVisibility() {
    var el = document.getElementById('eh-helper-status');
    if (!el) return;
    el.style.display = settings.showStatus ? '' : 'none';
  }

  function getHeadOrRoot() {
    return document.head || document.documentElement;
  }

  function updateFitStyle() {
    var parent = getHeadOrRoot();
    if (!parent) return;

    var styleEl = document.getElementById('eh-helper-fit-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'eh-helper-fit-style';
      parent.appendChild(styleEl);
    }

    if (settings.fitMode === 'height') {
      styleEl.textContent = [
        '#img {',
        'max-height: 100vh !important;',
        'max-width: none !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    if (settings.fitMode === 'width') {
      styleEl.textContent = [
        '#img {',
        'max-width: 100vw !important;',
        'max-height: none !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    styleEl.textContent = [
      '#img {',
      'max-height: none !important;',
      'max-width: none !important;',
      'width: auto !important;',
      'height: auto !important;',
      'object-fit: fill !important;',
      '}'
    ].join('\n');
  }

  function getMainImage() {
    return document.getElementById('img');
  }

  function applyImageFit() {
    var img = getMainImage();
    updateFitStyle();
    if (!img) return;

    img.style.setProperty('object-fit', 'contain', 'important');

    if (settings.fitMode === 'height') {
      img.style.setProperty('max-height', '100vh', 'important');
      img.style.setProperty('max-width', 'none', 'important');
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      return;
    }

    if (settings.fitMode === 'width') {
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

  function getPageTextMatch() {
    if (!document.body) return null;
    return document.body.textContent.match(/(?:^|\D)(\d+)\s*\/\s*(\d+)(?:\D|$)/);
  }

  function getCurrentPageLabel() {
    var fromUrl = getViewerPageFromUrl(location.href);
    if (fromUrl) return fromUrl;

    var pageText = getPageTextMatch();
    if (pageText) return pageText[1] + '/' + pageText[2];

    return '?';
  }

  function getTotalPageLabel() {
    var pageText = getPageTextMatch();
    return pageText ? pageText[2] : '?';
  }

  function getProgressLabel() {
    var current = getViewerPageFromUrl(location.href);
    var total = getTotalPageLabel();
    if (!current) {
      var pageText = getPageTextMatch();
      current = pageText ? pageText[1] : '?';
    }
    return 'Page ' + current + '/' + total;
  }

  function getUrlTail(url) {
    var parts = normalizeUrl(url).split('/');
    return parts.length ? parts[parts.length - 1] : '?';
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
      showStatus('EH: image not found');
      return;
    }

    function scrollNow() {
      applyImageFit();
      if (settings.autoScroll) {
        var y = img.getBoundingClientRect().top + window.pageYOffset - SCROLL_OFFSET;
        window.scrollTo(0, Math.max(0, y));
      }
      showStatus('EH: ready');
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
    for (var i = 1; i <= settings.preloadAheadCount; i += 1) {
      var item = preloadState[i];
      if (!item) continue;

      if (item.status === 'loading') {
        parts.push('EH: +' + i + ' loading p.' + item.page);
      } else if (item.status === 'loaded') {
        parts.push('EH: +' + i + ' loaded p.' + item.page + ' ' + formatDuration(item.duration));
      } else if (item.status === 'failed') {
        parts.push('EH: +' + i + ' failed p.' + item.page);
      }
    }

    if (parts.length) showStatusLines(parts);
  }

  function createHiddenFrame(nextUrl, depth, onLoaded) {
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

    frameEl.addEventListener('load', function () {
      preloadState[depth].status = 'loaded';
      preloadState[depth].duration = Date.now() - startedAt;
      updatePreloadStatus();
      if (typeof onLoaded === 'function') onLoaded(frameEl);
    }, { once: true });

    frameEl.addEventListener('error', function () {
      preloadState[depth].status = 'failed';
      preloadState[depth].duration = Date.now() - startedAt;
      updatePreloadStatus();
    }, { once: true });

    document.documentElement.appendChild(frameEl);
    return frameEl;
  }

  function preloadAheadFrom(nextUrl, depth) {
    if (!nextUrl || depth > settings.preloadAheadCount) return;

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
    if (settings.preloadAheadCount <= 0) {
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

    if (!document.documentElement) return;

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href']
    });
  }

  function setupMessageHandlers() {
    browser.runtime.onMessage.addListener(function (message) {
      if (!message || message.target !== 'eh-helper-content') return undefined;

      if (message.type === 'reload-settings') {
        loadSettings();
        return Promise.resolve({ ok: true });
      }

      if (message.type === 'scroll-to-image') {
        scrollToImage();
        return Promise.resolve({ ok: true });
      }

      if (message.type === 'toggle-fullscreen') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        return Promise.resolve({ ok: true });
      }

      return undefined;
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

  setupMessageHandlers();
  updateFitStyle();

  if (document.documentElement) {
    observeImageAndDomChanges();
  } else {
    document.addEventListener('DOMContentLoaded', observeImageAndDomChanges, { once: true });
  }

  loadSettings().then(function () {
    handlePageStateChange('initial');
  });
})();
