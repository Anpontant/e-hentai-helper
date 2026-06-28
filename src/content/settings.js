import { settings } from './state.js';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { normalizeSettings } from '../shared/viewer-utils.mjs';

export function loadSettings() {
  return browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
    settings.value = normalizeSettings(stored, DEFAULT_SETTINGS);
  });
}

export function saveSetting(patch) {
  return browser.storage.local.set(patch).then(function () {
    return loadSettings();
  });
}
