import { describe, test, expect, beforeEach } from 'vitest';
import { settings, statusLines } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import {
  isOverlayActive,
  showStatus,
  showStatusLines,
  clearStatus
} from '../src/content/status.js';

beforeEach(() => {
  settings.value = { ...DEFAULT_SETTINGS };
  statusLines.value = [];
});

describe('isOverlayActive', () => {
  test('returns false when neither overlayView nor spreadView is active', () => {
    settings.value = { ...DEFAULT_SETTINGS, overlayView: false, spreadView: false };
    expect(isOverlayActive()).toBe(false);
  });

  test('returns true when overlayView is active', () => {
    settings.value = { ...DEFAULT_SETTINGS, overlayView: true };
    expect(isOverlayActive()).toBe(true);
  });

  test('returns true when spreadView is active', () => {
    settings.value = { ...DEFAULT_SETTINGS, spreadView: true };
    expect(isOverlayActive()).toBe(true);
  });
});

describe('showStatus', () => {
  test('updates statusLines when showStatus setting is true', () => {
    settings.value = { ...DEFAULT_SETTINGS, showStatus: true };
    showStatus('EH: ready');
    expect(statusLines.value.length).toBeGreaterThanOrEqual(1);
    expect(statusLines.value[0]).toBe('EH: ready');
  });

  test('does not update statusLines when showStatus setting is false', () => {
    settings.value = { ...DEFAULT_SETTINGS, showStatus: false };
    showStatus('EH: ready');
    expect(statusLines.value).toEqual([]);
  });
});

describe('showStatusLines', () => {
  test('appends progress label to provided lines', () => {
    settings.value = { ...DEFAULT_SETTINGS, showStatus: true };
    showStatusLines(['line1', 'line2']);
    expect(statusLines.value.length).toBe(3);
    expect(statusLines.value[0]).toBe('line1');
    expect(statusLines.value[1]).toBe('line2');
  });

  test('does not update when showStatus is false', () => {
    settings.value = { ...DEFAULT_SETTINGS, showStatus: false };
    showStatusLines(['line1']);
    expect(statusLines.value).toEqual([]);
  });
});

describe('clearStatus', () => {
  test('resets statusLines to empty array', () => {
    statusLines.value = ['some', 'lines'];
    clearStatus();
    expect(statusLines.value).toEqual([]);
  });
});
