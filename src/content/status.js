import { settings, statusLines } from './state.js';
import { getProgressLabel } from './navigation.js';

export function isOverlayActive() {
  var s = settings.value;
  return s.overlayView || s.spreadView;
}

export function showStatus(text) {
  if (!settings.value.showStatus) return;
  showStatusLines([text]);
}

export function showStatusLines(lines) {
  if (!settings.value.showStatus) return;
  var allLines = (lines || []).concat([getProgressLabel()]);
  statusLines.value = allLines;
}

export function clearStatus() {
  statusLines.value = [];
}
