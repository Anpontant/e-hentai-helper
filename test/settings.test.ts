import { describe, test, expect, beforeEach } from 'vitest';
import { settings } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { loadSettings, saveSetting } from '../src/content/settings.js';
import { resetBrowserMock } from './helpers/browser-mock.js';

beforeEach(() => {
  settings.value = { ...DEFAULT_SETTINGS };
  resetBrowserMock();
});

describe('loadSettings', () => {
  test('loads default settings when storage is empty', async () => {
    await loadSettings();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  test('merges stored settings with defaults', async () => {
    await browser.storage.local.set({ fitMode: 'width' });
    await loadSettings();
    expect(settings.value.fitMode).toBe('width');
    expect(settings.value.preloadAheadCount).toBe(DEFAULT_SETTINGS.preloadAheadCount);
  });

  test('clamps invalid stored values to defaults', async () => {
    await browser.storage.local.set({ fitMode: 'invalid', preloadAheadCount: 99 });
    await loadSettings();
    expect(settings.value.fitMode).toBe('height');
    expect(settings.value.preloadAheadCount).toBe(5);
  });
});

describe('saveSetting', () => {
  test('persists a setting and reloads', async () => {
    await saveSetting({ fitMode: 'width' });
    expect(settings.value.fitMode).toBe('width');
  });

  test('preserves other settings when saving one', async () => {
    await saveSetting({ showStatus: false });
    expect(settings.value.showStatus).toBe(false);
    expect(settings.value.fitMode).toBe('height');
    expect(settings.value.preloadAheadCount).toBe(2);
  });
});
