import { useEffect } from 'preact/hooks';
import { menuOpen, settings } from '../state.js';
import { saveSetting } from '../settings.js';
import { scrollToImage } from '../scroll.js';
import { Segmented } from '../../shared/components/Segmented.jsx';
import { Checkbox } from '../../shared/components/Checkbox.jsx';

function msg(key) {
  return browser.i18n.getMessage(key) || key;
}

function MenuPanel() {
  return (
    <div id="eh-helper-menu-panel" style={{ display: 'grid' }}>
      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupPreload')}</div>
        <Segmented
          setting="preloadAheadCount"
          current={settings.value.preloadAheadCount}
          onSave={saveSetting}
          className="eh-menu-seg"
          options={[
            { value: '0', label: msg('popupOff') },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
            { value: '3', label: '+3' }
          ]}
        />
        <div class="eh-menu-group-checks">
          <Checkbox
            id="eh-menu-showStatus"
            setting="showStatus"
            checked={settings.value.showStatus}
            onSave={saveSetting}
            label={msg('popupStatus')}
          />
          <Checkbox
            id="eh-menu-showPreloadThumbs"
            setting="showPreloadThumbs"
            checked={settings.value.showPreloadThumbs}
            onSave={saveSetting}
            label={msg('popupPreloadThumbs')}
          />
        </div>
      </div>

      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupFit')}</div>
        <Segmented
          setting="fitMode"
          current={settings.value.fitMode}
          onSave={saveSetting}
          className="eh-menu-seg"
          options={[
            { value: 'height', label: msg('popupHeight') },
            { value: 'width', label: msg('popupWidth') },
            { value: 'original', label: '1:1' }
          ]}
        />
        <Checkbox
          id="eh-menu-autoScroll"
          setting="autoScroll"
          checked={settings.value.autoScroll}
          onSave={saveSetting}
          label={msg('popupAutoScroll')}
        />
      </div>

      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupOverlay')}</div>
        <Checkbox
          id="eh-menu-overlayView"
          setting="overlayView"
          checked={settings.value.overlayView}
          onSave={saveSetting}
          label={msg('popupOverlayView')}
        />
        <div class="eh-menu-group-checks">
          <Checkbox
            id="eh-menu-spreadView"
            setting="spreadView"
            checked={settings.value.spreadView}
            onSave={saveSetting}
            label={msg('popupSpreadView')}
          />
          <Checkbox
            id="eh-menu-spreadCoverAlone"
            setting="spreadCoverAlone"
            checked={settings.value.spreadCoverAlone}
            onSave={saveSetting}
            label={msg('popupSpreadCoverAlone')}
          />
        </div>
      </div>

      <div class="eh-menu-actions">
        <button
          type="button"
          onClick={function () {
            scrollToImage();
          }}
        >
          {msg('popupScroll')}
        </button>
        <button
          type="button"
          onClick={function () {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }}
        >
          {msg('popupFullscreen')}
        </button>
      </div>
    </div>
  );
}

export function Menu() {
  var open = menuOpen.value;

  useEffect(
    function () {
      if (!open) return;
      function handleClick(e) {
        var btn = document.getElementById('eh-helper-menu-btn');
        var panel = document.getElementById('eh-helper-menu-panel');
        if (btn && btn.contains(e.target)) return;
        if (panel && panel.contains(e.target)) return;
        menuOpen.value = false;
      }
      document.addEventListener('click', handleClick, true);
      return function () {
        document.removeEventListener('click', handleClick, true);
      };
    },
    [open]
  );

  return (
    <>
      <button
        id="eh-helper-menu-btn"
        type="button"
        class={open ? 'eh-menu-open' : ''}
        aria-label={msg('menuSettingsLabel')}
        onClick={function (e) {
          e.preventDefault();
          e.stopPropagation();
          menuOpen.value = !menuOpen.value;
        }}
      >
        ☰
      </button>
      {open && <MenuPanel />}
    </>
  );
}
