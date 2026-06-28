import { useEffect } from 'preact/hooks';
import { menuOpen, settings } from '../state.js';
import { saveSetting } from '../settings.js';
import { scrollToImage } from '../scroll.js';

function msg(key) {
  return browser.i18n.getMessage(key) || key;
}

function Segmented({ setting, options }) {
  var current = settings.value[setting];
  return (
    <div class="eh-menu-seg" data-setting={setting}>
      {options.map(function (opt) {
        return (
          <button
            key={opt.value}
            type="button"
            class={String(current) === String(opt.value) ? 'active' : ''}
            onClick={function () {
              var val = setting === 'preloadAheadCount' ? parseInt(opt.value, 10) : opt.value;
              saveSetting({ [setting]: val });
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
          saveSetting({ [setting]: e.target.checked });
        }}
      />
      <span>{label}</span>
    </label>
  );
}

function MenuPanel() {
  return (
    <div id="eh-helper-menu-panel" style={{ display: 'grid' }}>
      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupPreload')}</div>
        <Segmented
          setting="preloadAheadCount"
          options={[
            { value: '0', label: msg('popupOff') },
            { value: '1', label: '+1' },
            { value: '2', label: '+2' },
            { value: '3', label: '+3' }
          ]}
        />
      </div>

      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupFit')}</div>
        <Segmented
          setting="fitMode"
          options={[
            { value: 'height', label: msg('popupHeight') },
            { value: 'width', label: msg('popupWidth') },
            { value: 'original', label: '1:1' }
          ]}
        />
      </div>

      <div class="eh-menu-section">
        <div class="eh-menu-label">{msg('popupOverlay')}</div>
        <Checkbox id="eh-menu-overlayView" setting="overlayView" label={msg('popupOverlayView')} />
        <Checkbox id="eh-menu-spreadView" setting="spreadView" label={msg('popupSpreadView')} />
        <Checkbox
          id="eh-menu-spreadCoverAlone"
          setting="spreadCoverAlone"
          label={msg('popupSpreadCoverAlone')}
        />
      </div>

      <div class="eh-menu-checks">
        <Checkbox id="eh-menu-autoScroll" setting="autoScroll" label={msg('popupAutoScroll')} />
        <Checkbox id="eh-menu-showStatus" setting="showStatus" label={msg('popupStatus')} />
        <Checkbox
          id="eh-menu-showPreloadThumbs"
          setting="showPreloadThumbs"
          label={msg('popupPreloadThumbs')}
        />
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
