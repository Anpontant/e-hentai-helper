import { signal } from '@preact/signals';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import type { Settings, SpreadState } from '../shared/types.js';

export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const menuOpen = signal(false);
export const controlsVisible = signal(false);
export const statusLines = signal<string[]>([]);
export const preloadThumbs = signal<HTMLImageElement[]>([]);
export const spreadState = signal<SpreadState>({
  active: false,
  leftSrc: '',
  rightSrc: '',
  rightFallbackSrc: '',
  single: false
});
export const virtualPage = signal(0);
export const totalPages = signal(0);
