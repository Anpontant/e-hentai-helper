import { DEFAULT_SETTINGS } from '../shared/constants.js';

var settings = {};

function queryActiveTab() {
  return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    return tabs && tabs.length ? tabs[0] : null;
  });
}

function sendToContent(type) {
  return queryActiveTab().then(function (tab) {
    if (!tab || !tab.id) return null;
    return browser.tabs
      .sendMessage(tab.id, { target: 'eh-helper-content', type: type })
      .catch(function () {
        return null;
      });
  });
}

function showHint(key) {
  document.getElementById('hint').textContent = browser.i18n.getMessage(key) || key;
}

function updateUI() {
  document.querySelectorAll('.segmented').forEach(function (seg) {
    var current = String(settings[seg.dataset.setting]);
    seg.querySelectorAll('button').forEach(function (btn) {
      btn.className = btn.dataset.value === current ? 'active' : '';
    });
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
    if (input.id in settings) {
      input.checked = settings[input.id];
    }
  });
}

function savePatch(patch) {
  return browser.storage.local
    .set(patch)
    .then(function () {
      return browser.storage.local.get(DEFAULT_SETTINGS);
    })
    .then(function (stored) {
      settings = stored;
      updateUI();
      return sendToContent('reload-settings');
    })
    .then(function () {
      showHint('popupSaved');
    });
}

function init() {
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = browser.i18n.getMessage(el.dataset.i18n) || el.dataset.i18n;
  });

  document.getElementById('version-number').textContent = browser.runtime.getManifest().version;

  document.querySelectorAll('.segmented button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.closest('.segmented').dataset.setting;
      var val = key === 'preloadAheadCount' ? parseInt(btn.dataset.value, 10) : btn.dataset.value;
      savePatch({ [key]: val });
    });
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
    if (input.id in DEFAULT_SETTINGS) {
      input.addEventListener('change', function () {
        savePatch({ [input.id]: input.checked });
      });
    }
  });

  document.getElementById('btn-scroll').addEventListener('click', function () {
    sendToContent('scroll-to-image').then(function () {
      showHint('popupScrolled');
    });
  });

  document.getElementById('btn-fullscreen').addEventListener('click', function () {
    browser.windows
      .getCurrent()
      .then(function (win) {
        return browser.windows.update(win.id, {
          state: win.state === 'fullscreen' ? 'normal' : 'fullscreen'
        });
      })
      .then(function () {
        showHint('popupFullscreenToggled');
      });
  });

  browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
    settings = stored;
    updateUI();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
