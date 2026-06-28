(function () {
  'use strict';

  var utils = (typeof self !== 'undefined' ? self : window).EHHelperUtils;
  var normalizeUrl = utils.normalizeUrl;
  var isViewerUrl = utils.isViewerUrl;
  var getViewerPageFromUrl = utils.getViewerPageFromUrl;
  var parsePagePair = utils.parsePagePair;
  var getUrlTail = utils.getUrlTail;
  var formatDuration = utils.formatDuration;

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

  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var lastHandledKey = '';
  var lastPreloadRootKey = '';
  var changeTimer = 0;
  var preloadState = {};
  var preloadRunId = 0;
  var preloadedImages = [];
  var viewerDocCache = new Map();
  var preloadAbortController = null;
  var lastStatusText = '';
  var observer = null;
  var observerTargetSignature = '';

  function log() {
    if (!LOG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[EH helper]');
    console.log.apply(console, args);
  }

  function loadSettings() {
    return browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
      settings = utils.normalizeSettings(stored, DEFAULT_SETTINGS);
      updateFitStyle();
      applyImageFit();
      updateStatusVisibility();
      lastStatusText = '';
      lastPreloadRootKey = '';
      schedulePreloadAfterCurrentImage();
    });
  }

  function showStatus(text) {
    if (!settings.showStatus) return;
    showStatusLines([text]);
  }

  function showStatusLines(lines) {
    if (!settings.showStatus) return;
    var allLines = (lines || []).concat([getProgressLabel()]);
    var nextStatusText = allLines.join('\n');
    if (nextStatusText === lastStatusText) return;
    lastStatusText = nextStatusText;

    var statusEl = getStatusElement();
    statusEl.textContent = '';

    for (var i = 0; i < allLines.length; i += 1) {
      var line = document.createElement('div');
      line.className =
        i === allLines.length - 1 ? 'eh-helper-status-progress' : 'eh-helper-status-line';
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
    if (!settings.showStatus) lastStatusText = '';
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

  function getPageTextMatch() {
    if (!document.body) return null;

    var pageNodes = document.querySelectorAll('.sn');
    for (var i = 0; i < pageNodes.length; i += 1) {
      var parsedPageNode = parsePagePair(pageNodes[i].textContent);
      if (parsedPageNode) return parsedPageNode;
    }

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!text || text.length > 32 || text.indexOf('/') === -1) continue;

      var parsed = parsePagePair(text);
      if (parsed) return parsed;
    }

    return null;
  }

  function getTotalPageLabel() {
    var pageText = getPageTextMatch();
    var total = pageText ? pageText.total : '';
    var current = parseInt(
      getViewerPageFromUrl(location.href) || (pageText ? pageText.current : ''),
      10
    );

    if (total && (!current || parseInt(total, 10) >= current)) return total;
    return '?';
  }

  function getProgressLabel() {
    var current = getViewerPageFromUrl(location.href);
    var total = getTotalPageLabel();
    if (!current) {
      var pageText = getPageTextMatch();
      current = pageText ? pageText.current : '?';
    }
    return 'Page ' + current + '/' + total;
  }

  function getCurrentKey() {
    var img = getMainImage();
    return normalizeUrl(location.href) + '|' + (img ? img.src : '');
  }

  function getNextPageUrlFromDocument(doc, docUrl) {
    var img = doc.getElementById('img');
    var fromImageLink =
      img && img.parentNode && img.parentNode.tagName === 'A' ? img.parentNode.href : '';

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

  function scrollToImage(retryCount) {
    retryCount = retryCount || 0;
    var img = getMainImage();
    if (!img) {
      if (retryCount < 20) {
        window.setTimeout(function () {
          scrollToImage(retryCount + 1);
        }, 100);
        return;
      }
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
    preloadedImages = [];
  }

  function pruneViewerDocCache() {
    while (viewerDocCache.size > 12) {
      var firstKey = viewerDocCache.keys().next().value;
      viewerDocCache.delete(firstKey);
    }
  }

  function abortActivePreload() {
    if (preloadAbortController) {
      preloadAbortController.abort();
      preloadAbortController = null;
    }
    preloadRunId += 1;
  }

  function updatePreloadStatus() {
    var parts = [];
    for (var i = 1; i <= settings.preloadAheadCount; i += 1) {
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
  }

  function setPreloadState(depth, patch) {
    preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
    if (settings.showStatus) updatePreloadStatus();
  }

  function getImageUrlFromDocument(doc, docUrl) {
    var img = doc.getElementById('img');
    if (!img) return '';

    var src = img.getAttribute('src') || img.src || '';
    if (!src) return '';

    try {
      return new URL(src, docUrl).href;
    } catch (error) {
      log('cannot resolve image url:', error);
      return src;
    }
  }

  function getPageLabelFromDocument(doc, fallbackUrl) {
    var pageNode = doc.querySelector('.sn');
    var parsed = parsePagePair(pageNode ? pageNode.textContent : '');
    return parsed ? parsed.current : getViewerPageFromUrl(fallbackUrl) || getUrlTail(fallbackUrl);
  }

  function fetchViewerDocument(pageUrl, signal) {
    var cached = viewerDocCache.get(pageUrl);
    if (cached) return Promise.resolve(cached);

    return fetch(pageUrl, {
      credentials: 'include',
      cache: 'force-cache',
      signal: signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed: ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        viewerDocCache.set(pageUrl, doc);
        pruneViewerDocCache();
        return doc;
      });
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
    if (!nextUrl || depth > settings.preloadAheadCount) return;

    var runId = preloadRunId;
    var startedAt = Date.now();
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

  function preloadNext() {
    if (settings.preloadAheadCount <= 0) {
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
    preloadAheadFrom(nextUrl, 1);
  }

  function schedulePreloadAfterCurrentImage() {
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

  function handlePageStateChange(reason) {
    clearTimeout(changeTimer);
    changeTimer = window.setTimeout(function () {
      var key = getCurrentKey();
      if (key === lastHandledKey) return;
      lastHandledKey = key;

      log('handling page state:', reason, key);
      scrollToImage();
      schedulePreloadAfterCurrentImage();
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
    if (observer) observer.disconnect();

    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === 'childList' || mutations[i].type === 'attributes') {
          if (observerTargetSignature === 'bootstrap') {
            window.setTimeout(observeImageAndDomChanges, 0);
          }
          handlePageStateChange('mutation');
          return;
        }
      }
    });

    var targets = [];
    var img = getMainImage();
    if (img) targets.push(img);
    var imageContainer = document.getElementById('i3');
    if (imageContainer) targets.push(imageContainer);
    var pageContainer = document.getElementById('i1');
    if (pageContainer) targets.push(pageContainer);

    if (!targets.length) {
      var bootstrapTarget = document.body || document.documentElement;
      if (!bootstrapTarget) return;
      observerTargetSignature = 'bootstrap';
      observer.observe(bootstrapTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href']
      });
      return;
    }

    observerTargetSignature = targets
      .map(function (target) {
        return target.id || target.tagName;
      })
      .join('|');

    for (var i = 0; i < targets.length; i += 1) {
      observer.observe(targets[i], {
        childList: true,
        subtree: targets[i].id !== 'img',
        attributes: true,
        attributeFilter: ['src', 'href']
      });
    }
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
