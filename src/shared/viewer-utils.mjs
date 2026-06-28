export const PRELOAD_OPTIONS = [0, 1, 2, 3];
export const FIT_OPTIONS = ['height', 'width', 'original'];

export function normalizeUrl(url) {
  return String(url || '').split('#')[0];
}

export function isViewerUrl(url) {
  return typeof url === 'string' && /\/s\//.test(url);
}

export function getViewerPageFromUrl(url) {
  var match = normalizeUrl(url).match(/\/s\/[^/]+\/[^/]+-(\d+)/);
  return match ? match[1] : '';
}

export function getGalleryIdFromUrl(url) {
  var match = normalizeUrl(url).match(/\/s\/[^/]+\/(\d+)-\d+/);
  return match ? match[1] : '';
}

export function parsePagePair(text) {
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

export function getUrlTail(url) {
  var parts = normalizeUrl(url).split('/');
  return parts.length ? parts[parts.length - 1] : '?';
}

export function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

export function getSpreadPageInfo(currentPage, totalPages, coverAlone) {
  if (currentPage < 1) {
    return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  }

  var isRightPage;
  if (coverAlone) {
    if (currentPage === 1) {
      return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    }
    isRightPage = currentPage % 2 === 0;
  } else {
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

export function normalizeSettings(stored, defaults) {
  var settings = Object.assign({}, defaults, stored || {});
  if (PRELOAD_OPTIONS.indexOf(settings.preloadAheadCount) === -1) {
    settings.preloadAheadCount = defaults.preloadAheadCount;
  }
  if (FIT_OPTIONS.indexOf(settings.fitMode) === -1) {
    settings.fitMode = defaults.fitMode;
  }
  return settings;
}
