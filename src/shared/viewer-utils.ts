import type { FitMode, PagePair, Settings, SpreadPageInfo } from './types.js';

export const PRELOAD_MIN = 0;
export const PRELOAD_MAX = 5;
export const FIT_OPTIONS: FitMode[] = ['height', 'width', 'original'];

export function normalizeUrl(url: string) {
  return String(url || '').split('#')[0];
}

export function isViewerUrl(url: string) {
  return typeof url === 'string' && /\/s\//.test(url);
}

export function getViewerPageFromUrl(url: string) {
  const match = normalizeUrl(url).match(/\/s\/[^/]+\/[^/]+-(\d+)/);
  return match ? match[1] : '';
}

export function getGalleryIdFromUrl(url: string) {
  const match = normalizeUrl(url).match(/\/s\/[^/]+\/(\d+)-\d+/);
  return match ? match[1] : '';
}

export function parsePagePair(text: string): PagePair | null {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\.(?:jpg|jpeg|png|gif|webp)\b/i.test(normalized)) return null;

  const match = normalized.match(/^(?:[^\d]*)?(\d{1,5})\s*\/\s*(\d{1,5})(?:[^\d]*)?$/);
  if (!match) return null;

  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (!current || !total || current > total) return null;

  return {
    current: String(current),
    total: String(total)
  };
}

export function getUrlTail(url: string) {
  const parts = normalizeUrl(url).split('/');
  return parts.length ? parts[parts.length - 1] : '?';
}

export function formatDuration(ms: number) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

export function getSpreadPageInfo(
  currentPage: number,
  totalPages: number,
  coverAlone: boolean
): SpreadPageInfo {
  if (currentPage < 1) {
    return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  }

  let isRightPage;
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

  const partner = currentPage + 1;
  if (totalPages > 0 && partner > totalPages) {
    return { partnerPage: null, pagesInSpread: 1, isRightPage: true };
  }
  return { partnerPage: partner, pagesInSpread: 2, isRightPage: true };
}

export function resolveSpreadPage(
  page: number,
  total: number,
  coverAlone: boolean
): { rightPage: number; info: SpreadPageInfo } {
  const info = getSpreadPageInfo(page, total, coverAlone);
  if (info.isRightPage) return { rightPage: page, info: info };
  const rightPage = Math.max(1, page - 1);
  return { rightPage: rightPage, info: getSpreadPageInfo(rightPage, total, coverAlone) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getOverlayClickZone(fraction: number): 'next' | 'menu' | 'prev' {
  const f = clamp(fraction, 0, 1);
  if (f < 0.4) return 'next';
  if (f > 0.6) return 'prev';
  return 'menu';
}

export function pageFromSeekFraction(fraction: number, total: number): number {
  if (total <= 0) return 1;
  const f = clamp(fraction, 0, 1);
  const page = Math.round(f * (total - 1)) + 1;
  return clamp(page, 1, total);
}

export function seekFractionFromPage(page: number, total: number): number {
  if (total <= 1) return 0;
  return clamp((page - 1) / (total - 1), 0, 1);
}

export function normalizeSettings(stored: Partial<Settings>, defaults: Settings): Settings {
  const settings = Object.assign({}, defaults, stored || {});
  settings.preloadAheadCount = Math.max(
    PRELOAD_MIN,
    Math.min(
      PRELOAD_MAX,
      Math.floor(Number(settings.preloadAheadCount) || defaults.preloadAheadCount)
    )
  );
  if (FIT_OPTIONS.indexOf(settings.fitMode) === -1) {
    settings.fitMode = defaults.fitMode;
  }
  return settings;
}
