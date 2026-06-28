import type { Settings } from './types.js';

export const LOG = true;
export const SCROLL_OFFSET = 0;
export const PRELOAD_DELAY_MS = 500;
export const CHANGE_DEBOUNCE_MS = 250;
export const IMAGE_PRELOAD_TIMEOUT_MS = 5000;
export const MAX_VIEWER_DOC_CACHE = 12;
export const GALLERY_ITEMS_PER_PAGE = 20;
export const MAX_SCROLL_RETRIES = 20;
export const SCROLL_RETRY_DELAY_MS = 100;

export const DEFAULT_SETTINGS: Settings = {
  preloadAheadCount: 2,
  fitMode: 'height',
  showStatus: true,
  autoScroll: true,
  overlayView: false,
  spreadView: false,
  spreadCoverAlone: true,
  showPreloadThumbs: false,
  exhRedirect: false
};
