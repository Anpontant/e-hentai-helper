import { render } from 'preact';
import { signal } from '@preact/signals';
import { DEFAULT_SETTINGS } from '../shared/constants.js';
import { Segmented } from '../shared/components/Segmented.jsx';
import { Checkbox } from '../shared/components/Checkbox.jsx';

var settings = signal({ ...DEFAULT_SETTINGS });
var message = signal('');

function msg(name) {
  return browser.i18n.getMessage(name) || name;
}

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

function savePatch(patch) {
  return browser.storage.local
    .set(patch)
    .then(function () {
      return browser.storage.local.get(DEFAULT_SETTINGS);
    })
    .then(function (stored) {
      settings.value = stored;
      return sendToContent('reload-settings');
    })
    .then(function () {
      message.value = msg('popupSaved');
    });
}

function PopupApp() {
  return (
    <main class="popup">
      <section class="group">
        <div class="label">{msg('popupPreload')}</div>
        <Segmented
          setting="preloadAheadCount"
          current={settings.value.preloadAheadCount}
          onSave={savePatch}
          options={[
            { value: '0', label: msg('popupOff') },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
            { value: '3', label: '+3' }
          ]}
        />
        <div class="group-checks">
          <Checkbox
            id="showStatus"
            setting="showStatus"
            checked={settings.value.showStatus}
            onSave={savePatch}
            label={msg('popupStatus')}
          />
          <Checkbox
            id="showPreloadThumbs"
            setting="showPreloadThumbs"
            checked={settings.value.showPreloadThumbs}
            onSave={savePatch}
            label={msg('popupPreloadThumbs')}
          />
        </div>
      </section>

      <section class="group">
        <div class="label">{msg('popupFit')}</div>
        <Segmented
          setting="fitMode"
          current={settings.value.fitMode}
          onSave={savePatch}
          options={[
            { value: 'height', label: msg('popupHeight') },
            { value: 'width', label: msg('popupWidth') },
            { value: 'original', label: '1:1' }
          ]}
        />
        <Checkbox
          id="autoScroll"
          setting="autoScroll"
          checked={settings.value.autoScroll}
          onSave={savePatch}
          label={msg('popupAutoScroll')}
        />
      </section>

      <section class="group">
        <div class="label">{msg('popupOverlay')}</div>
        <Checkbox
          id="overlayView"
          setting="overlayView"
          checked={settings.value.overlayView}
          onSave={savePatch}
          label={msg('popupOverlayView')}
        />
        <div class="group-checks">
          <Checkbox
            id="spreadView"
            setting="spreadView"
            checked={settings.value.spreadView}
            onSave={savePatch}
            label={msg('popupSpreadView')}
          />
          <Checkbox
            id="spreadCoverAlone"
            setting="spreadCoverAlone"
            checked={settings.value.spreadCoverAlone}
            onSave={savePatch}
            label={msg('popupSpreadCoverAlone')}
          />
        </div>
      </section>

      <section class="actions">
        <button
          type="button"
          onClick={function () {
            sendToContent('scroll-to-image').then(function () {
              message.value = msg('popupScrolled');
            });
          }}
        >
          {msg('popupScroll')}
        </button>
        <button
          type="button"
          onClick={function () {
            browser.windows
              .getCurrent()
              .then(function (win) {
                return browser.windows.update(win.id, {
                  state: win.state === 'fullscreen' ? 'normal' : 'fullscreen'
                });
              })
              .then(function () {
                message.value = msg('popupFullscreenToggled');
              });
          }}
        >
          {msg('popupFullscreen')}
        </button>
      </section>

      <div class="hint">{message.value}</div>
      <footer class="version">
        <span>{msg('popupVersion')}</span>
        <span>{browser.runtime.getManifest().version}</span>
      </footer>
    </main>
  );
}

function init() {
  browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
    settings.value = stored;
  });
  render(<PopupApp />, document.getElementById('popup-root'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
