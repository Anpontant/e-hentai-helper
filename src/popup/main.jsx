import { render } from 'preact';
import { signal } from '@preact/signals';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

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

function Segmented({ setting, options }) {
  var current = settings.value[setting];
  return (
    <div class="segmented" data-setting={setting}>
      {options.map(function (opt) {
        return (
          <button
            key={opt.value}
            type="button"
            class={String(current) === String(opt.value) ? 'active' : ''}
            onClick={function () {
              var val = setting === 'preloadAheadCount' ? parseInt(opt.value, 10) : opt.value;
              savePatch({ [setting]: val });
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Checkbox({ id, setting, label }) {
  var checked = settings.value[setting];
  return (
    <label>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={function (e) {
          savePatch({ [setting]: e.target.checked });
        }}
      />
      <span>{label}</span>
    </label>
  );
}

function PopupApp() {
  return (
    <main class="popup">
      <section class="group">
        <div class="label">{msg('popupPreload')}</div>
        <Segmented
          setting="preloadAheadCount"
          options={[
            { value: '0', label: msg('popupOff') },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
            { value: '3', label: '+3' }
          ]}
        />
        <div class="group-checks">
          <Checkbox id="showStatus" setting="showStatus" label={msg('popupStatus')} />
          <Checkbox
            id="showPreloadThumbs"
            setting="showPreloadThumbs"
            label={msg('popupPreloadThumbs')}
          />
        </div>
      </section>

      <section class="group">
        <div class="label">{msg('popupFit')}</div>
        <Segmented
          setting="fitMode"
          options={[
            { value: 'height', label: msg('popupHeight') },
            { value: 'width', label: msg('popupWidth') },
            { value: 'original', label: '1:1' }
          ]}
        />
        <Checkbox id="autoScroll" setting="autoScroll" label={msg('popupAutoScroll')} />
      </section>

      <section class="group">
        <div class="label">{msg('popupOverlay')}</div>
        <Checkbox id="overlayView" setting="overlayView" label={msg('popupOverlayView')} />
        <div class="group-checks">
          <Checkbox id="spreadView" setting="spreadView" label={msg('popupSpreadView')} />
          <Checkbox
            id="spreadCoverAlone"
            setting="spreadCoverAlone"
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
