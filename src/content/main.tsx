import { render } from 'preact';
import { settings, menuOpen, virtualPage } from './state.js';
import { loadSettings } from './settings.js';
import { updateFitStyle } from './fit.js';
import { scrollToImage } from './scroll.js';
import { isOverlayActive } from './status.js';
import { schedulePreloadAfterCurrentImage, resetPreloadRootKey } from './preloader.js';
import {
  renderSpread,
  updateSpreadVisibility,
  advanceSpread,
  retreatSpread,
  exitOverlay
} from './spread.js';
import { getCurrentKey, getMainImage, restorePageMaps } from './navigation.js';
import { CHANGE_DEBOUNCE_MS } from '../shared/constants.js';
import { App } from './components/App.jsx';
import { effect } from '@preact/signals';

let lastHandledKey = '';
let changeTimer = 0;
let observer: MutationObserver | null = null;
let observerTargetSignature = '';

function handlePageStateChange() {
  if (virtualPage.value > 0 && isOverlayActive()) return;

  clearTimeout(changeTimer);
  changeTimer = window.setTimeout(function () {
    const key = getCurrentKey();
    if (key === lastHandledKey) return;
    lastHandledKey = key;

    scrollToImage();
    schedulePreloadAfterCurrentImage();
    if (isOverlayActive()) renderSpread();
  }, CHANGE_DEBOUNCE_MS);
}

function patchHistoryMethod(name: 'pushState' | 'replaceState') {
  const original = history[name];
  if (typeof original !== 'function') return;

  history[name] = function (...args: Parameters<typeof original>) {
    const result = original.apply(this, args);
    handlePageStateChange();
    return result;
  };
}

function observeImageAndDomChanges() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i += 1) {
      if (mutations[i].type === 'childList' || mutations[i].type === 'attributes') {
        if (observerTargetSignature === 'bootstrap') {
          window.setTimeout(observeImageAndDomChanges, 0);
        }
        handlePageStateChange();
        return;
      }
    }
  });

  const targets: HTMLElement[] = [];
  const img = getMainImage();
  if (img) targets.push(img);
  const imageContainer = document.getElementById('i3');
  if (imageContainer) targets.push(imageContainer);
  const pageContainer = document.getElementById('i1');
  if (pageContainer) targets.push(pageContainer);

  if (!targets.length) {
    const bootstrapTarget = document.body || document.documentElement;
    if (!bootstrapTarget) return;
    observerTargetSignature = 'bootstrap';
    observer.observe(bootstrapTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href']
    });
    return;
  }

  observerTargetSignature = targets
    .map(function (target) {
      return target.id || target.tagName;
    })
    .join('|');

  for (let i = 0; i < targets.length; i += 1) {
    observer.observe(targets[i], {
      childList: true,
      subtree: targets[i].id !== 'img',
      attributes: true,
      attributeFilter: ['src', 'href']
    });
  }
}

function setupMessageHandlers() {
  browser.runtime.onMessage.addListener(function (message) {
    if (!message || message.target !== 'eh-helper-content') return undefined;

    if (message.type === 'reload-settings') {
      loadSettings();
      return Promise.resolve({ ok: true });
    }

    if (message.type === 'scroll-to-image') {
      scrollToImage();
      return Promise.resolve({ ok: true });
    }

    if (message.type === 'toggle-fullscreen') {
      const p = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
      p.catch(function () {});
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });
}

// React to settings changes
effect(function () {
  const s = settings.value;
  updateFitStyle();
  updateSpreadVisibility();
  resetPreloadRootKey();
  schedulePreloadAfterCurrentImage();
  // read all fields to subscribe
  void s.fitMode;
  void s.preloadAheadCount;
  void s.showStatus;
  void s.overlayView;
  void s.spreadView;
  void s.spreadCoverAlone;
  void s.showPreloadThumbs;
});

// Setup non-UI event handling
patchHistoryMethod('pushState');
patchHistoryMethod('replaceState');
window.addEventListener('popstate', function () {
  handlePageStateChange();
});
window.addEventListener('hashchange', function () {
  handlePageStateChange();
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !document.fullscreenElement) {
    if (menuOpen.value) {
      event.preventDefault();
      menuOpen.value = false;
      return;
    }
    if (isOverlayActive()) {
      event.preventDefault();
      exitOverlay();
    }
  }
  if (isOverlayActive()) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      advanceSpread();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      retreatSpread();
    }
  }
});

setupMessageHandlers();
updateFitStyle();

// Mount Preact app
function mount() {
  const container = document.createElement('div');
  container.id = 'eh-helper-root';
  container.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none;';
  document.documentElement.appendChild(container);
  render(<App />, container);
}

if (document.documentElement) {
  mount();
} else {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
}

if (document.documentElement) {
  observeImageAndDomChanges();
} else {
  document.addEventListener('DOMContentLoaded', observeImageAndDomChanges, { once: true });
}

restorePageMaps();
loadSettings().then(function () {
  handlePageStateChange();
});
