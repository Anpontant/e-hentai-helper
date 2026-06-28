import type { Settings } from '../shared/types.js';
import { settings } from './state.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { normalizeSettings } from '../shared/viewer-utils.js';

export function loadSettings() {
  return browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
    settings.value = normalizeSettings(stored as Partial<Settings>, DEFAULT_SETTINGS);
  });
}

export function saveSetting(patch: Partial<Settings>) {
  return browser.storage.local.set(patch).then(function () {
    return loadSettings();
  });
}
