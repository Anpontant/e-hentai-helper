export type FitMode = 'height' | 'width' | 'original';

export interface Settings {
  preloadAheadCount: number;
  fitMode: FitMode;
  showStatus: boolean;
  autoScroll: boolean;
  overlayView: boolean;
  spreadView: boolean;
  spreadCoverAlone: boolean;
  showPreloadThumbs: boolean;
}

export interface SpreadState {
  active: boolean;
  leftSrc: string;
  rightSrc: string;
  rightFallbackSrc: string;
  single: boolean;
}

export interface SpreadPageInfo {
  partnerPage: number | null;
  pagesInSpread: number;
  isRightPage: boolean;
}

export interface PagePair {
  current: string;
  total: string;
}

export interface PreloadStateEntry {
  status: 'loading' | 'loaded' | 'failed';
  page: string;
  duration: number;
  url?: string;
  method: string;
}
