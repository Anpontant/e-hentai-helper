import { DEFAULT_SETTINGS } from '../shared/constants.js';
import type { Settings } from '../shared/types.js';

let settings: Settings = { ...DEFAULT_SETTINGS };

function queryActiveTab() {
  return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    return tabs && tabs.length ? tabs[0] : null;
  });
}

function sendToContent(type: string) {
  return queryActiveTab().then(function (tab) {
    if (!tab || !tab.id) return null;
    return browser.tabs
      .sendMessage(tab.id, { target: 'eh-helper-content', type: type })
      .catch(function () {
        return null;
      });
  });
}

function showHint(key: string) {
  document.getElementById('hint')!.textContent = browser.i18n.getMessage(key) || key;
}

function getViewMode(): string {
  if (settings.spreadView) return 'spread';
  if (settings.overlayView) return 'single';
  return 'off';
}

function updateUI() {
  document.querySelectorAll<HTMLElement>('.segmented').forEach(function (seg) {
    const key = seg.dataset.setting!;
    const current = key === 'viewMode' ? getViewMode() : String(settings[key as keyof Settings]);
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(function (btn) {
      btn.className = btn.dataset.value === current ? 'active' : '';
    });
  });

  const preloadInput = document.getElementById('preloadAheadCount') as HTMLInputElement | null;
  if (preloadInput) {
    preloadInput.value = String(settings.preloadAheadCount);
  }

  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(function (input) {
    if (input.id in settings) {
      input.checked = settings[input.id as keyof Settings] as boolean;
    }
  });

  const coverLabel = document.getElementById('coverAloneLabel');
  if (coverLabel) {
    coverLabel.style.display = settings.spreadView ? '' : 'none';
  }
}

function savePatch(patch: Partial<Settings>) {
  return browser.storage.local
    .set(patch)
    .then(function () {
      return browser.storage.local.get(DEFAULT_SETTINGS);
    })
    .then(function (stored) {
      settings = stored as Settings;
      updateUI();
      return sendToContent('reload-settings');
    })
    .then(function () {
      showHint('popupSaved');
    });
}

function init() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(function (el) {
    el.textContent = browser.i18n.getMessage(el.dataset.i18n!) || el.dataset.i18n!;
  });

  document.getElementById('version-number')!.textContent = browser.runtime.getManifest().version;

  document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const seg = btn.closest('.segmented') as HTMLElement;
      const key = seg.dataset.setting!;
      if (key === 'viewMode') {
        const mode = btn.dataset.value!;
        if (mode === 'off') {
          savePatch({ overlayView: false, spreadView: false });
        } else if (mode === 'single') {
          savePatch({ overlayView: true, spreadView: false });
        } else if (mode === 'spread') {
          savePatch({ overlayView: true, spreadView: true });
        }
        return;
      }
      savePatch({ [key]: btn.dataset.value! } as Partial<Settings>);
    });
  });

  const preloadInput = document.getElementById('preloadAheadCount') as HTMLInputElement | null;
  if (preloadInput) {
    preloadInput.addEventListener('change', function () {
      const val = Math.max(0, Math.min(5, Math.floor(Number(preloadInput.value) || 0)));
      preloadInput.value = String(val);
      savePatch({ preloadAheadCount: val });
    });
  }

  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(function (input) {
    if (input.id in DEFAULT_SETTINGS) {
      input.addEventListener('change', function () {
        savePatch({ [input.id]: input.checked } as Partial<Settings>);
      });
    }
  });

  document.getElementById('btn-scroll')!.addEventListener('click', function () {
    sendToContent('scroll-to-image').then(function () {
      showHint('popupScrolled');
    });
  });

  document.getElementById('btn-fullscreen')!.addEventListener('click', function () {
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
    settings = stored as Settings;
    updateUI();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
