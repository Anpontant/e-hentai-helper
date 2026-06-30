import { useEffect } from 'preact/hooks';
import { menuOpen, settings, controlsVisible, spreadState } from '../state.js';
import { saveSetting } from '../settings.js';
import { scrollToImage } from '../scroll.js';
import { Segmented } from '../../shared/components/Segmented.jsx';
import { Checkbox } from '../../shared/components/Checkbox.jsx';
import { NumberInput } from '../../shared/components/NumberInput.jsx';

function msg(key: string) {
  return browser.i18n.getMessage(key) || key;
}

function MenuPanel() {
  return (
    <div id="eh-helper-menu-panel" style={{ display: 'grid' }}>
      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupPreload')}</div>
        <NumberInput
          setting="preloadAheadCount"
          value={settings.value.preloadAheadCount}
          min={0}
          max={5}
          onSave={saveSetting}
          className="eh-menu-number-input"
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
        <div class="eh-menu-label">{msg('popupViewMode')}</div>
        <Segmented
          setting="viewMode"
          current={
            settings.value.spreadView ? 'spread' : settings.value.overlayView ? 'single' : 'off'
          }
          onSave={function (patch) {
            const mode = patch.viewMode as string;
            if (mode === 'off') {
              saveSetting({ overlayView: false, spreadView: false });
            } else if (mode === 'single') {
              saveSetting({ overlayView: true, spreadView: false });
            } else if (mode === 'spread') {
              saveSetting({ overlayView: true, spreadView: true });
            }
          }}
          className="eh-menu-seg"
          options={[
            { value: 'off', label: msg('popupOff') },
            { value: 'single', label: msg('popupViewSingle') },
            { value: 'spread', label: msg('popupViewSpread') }
          ]}
        />
        {settings.value.spreadView && (
          <Checkbox
            id="eh-menu-spreadCoverAlone"
            setting="spreadCoverAlone"
            checked={settings.value.spreadCoverAlone}
            onSave={saveSetting}
            label={msg('popupSpreadCoverAlone')}
          />
        )}
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
              document.exitFullscreen().catch(function () {});
            } else {
              document.documentElement.requestFullscreen().catch(function () {});
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
  const open = menuOpen.value;
  const overlayActive = spreadState.value.active;
  const hideButton = overlayActive && !controlsVisible.value;

  useEffect(
    function () {
      if (!open) return;
      function handleClick(e: MouseEvent) {
        const btn = document.getElementById('eh-helper-menu-btn');
        if (btn && btn.contains(e.target as Node)) {
          e.stopPropagation();
          menuOpen.value = false;
          return;
        }
        const panel = document.getElementById('eh-helper-menu-panel');
        if (panel && panel.contains(e.target as Node)) return;
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
      {!hideButton && (
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
      )}
      {open && <MenuPanel />}
    </>
  );
}
