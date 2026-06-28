import { signal } from '@preact/signals';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

export const settings = signal({ ...DEFAULT_SETTINGS });
export const menuOpen = signal(false);
export const statusLines = signal([]);
export const preloadThumbs = signal([]);
export const spreadState = signal({
  active: false,
  leftSrc: '',
  rightSrc: '',
  single: false
});
