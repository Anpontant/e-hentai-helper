// Pure, DOM-free helpers shared by the content script and unit tests.
// Loaded as a classic content script (sets self.EHHelperUtils) and also
// require()-able from Node tests via module.exports (UMD).
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.EHHelperUtils = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRELOAD_OPTIONS = [0, 1, 2, 3];
  var FIT_OPTIONS = ['height', 'width', 'original'];

  function normalizeUrl(url) {
    return String(url || '').split('#')[0];
  }

  function isViewerUrl(url) {
    return typeof url === 'string' && /\/s\//.test(url);
  }

  function getViewerPageFromUrl(url) {
    var match = normalizeUrl(url).match(/\/s\/[^/]+\/[^/]+-(\d+)/);
    return match ? match[1] : '';
  }

  function parsePagePair(text) {
    var normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (/\.(?:jpg|jpeg|png|gif|webp)\b/i.test(normalized)) return null;

    var match = normalized.match(/^(?:[^\d]*)?(\d{1,5})\s*\/\s*(\d{1,5})(?:[^\d]*)?$/);
    if (!match) return null;

    var current = parseInt(match[1], 10);
    var total = parseInt(match[2], 10);
    if (!current || !total || current > total) return null;

    return {
      current: String(current),
      total: String(total)
    };
  }

  function getUrlTail(url) {
    var parts = normalizeUrl(url).split('/');
    return parts.length ? parts[parts.length - 1] : '?';
  }

  function formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function getSpreadPageInfo(currentPage, totalPages, coverAlone) {
    if (currentPage < 1) {
      return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    }

    var isRightPage;
    if (coverAlone) {
      if (currentPage === 1) {
        return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
      }
      // coverAlone: even pages are right/anchor ([2|3], [4|5], ...)
      isRightPage = currentPage % 2 === 0;
    } else {
      // paired cover: odd pages are right/anchor ([1|2], [3|4], ...)
      isRightPage = currentPage % 2 === 1;
    }

    if (!isRightPage) {
      return { partnerPage: null, pagesInSpread: 1, isRightPage: false };
    }

    var partner = currentPage + 1;
    if (totalPages > 0 && partner > totalPages) {
      return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    }
    return { partnerPage: partner, pagesInSpread: 2, isRightPage: true };
  }

  function normalizeSettings(stored, defaults) {
    var settings = Object.assign({}, defaults, stored || {});
    if (PRELOAD_OPTIONS.indexOf(settings.preloadAheadCount) === -1) {
      settings.preloadAheadCount = defaults.preloadAheadCount;
    }
    if (FIT_OPTIONS.indexOf(settings.fitMode) === -1) {
      settings.fitMode = defaults.fitMode;
    }
    return settings;
  }

  return {
    PRELOAD_OPTIONS: PRELOAD_OPTIONS,
    FIT_OPTIONS: FIT_OPTIONS,
    normalizeUrl: normalizeUrl,
    isViewerUrl: isViewerUrl,
    getViewerPageFromUrl: getViewerPageFromUrl,
    parsePagePair: parsePagePair,
    getUrlTail: getUrlTail,
    formatDuration: formatDuration,
    getSpreadPageInfo: getSpreadPageInfo,
    normalizeSettings: normalizeSettings
  };
});
