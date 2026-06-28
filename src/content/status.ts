import { settings, statusLines } from './state.js';
import { getProgressLabel } from './navigation.js';

export function isOverlayActive() {
  const s = settings.value;
  return s.overlayView || s.spreadView;
}

export function showStatus(text: string) {
  if (!settings.value.showStatus) return;
  showStatusLines([text]);
}

export function showStatusLines(lines: string[]) {
  if (!settings.value.showStatus) return;
  const allLines = (lines || []).concat([getProgressLabel()]);
  statusLines.value = allLines;
}

export function clearStatus() {
  statusLines.value = [];
}
