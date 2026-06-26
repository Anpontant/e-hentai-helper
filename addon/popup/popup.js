(function () {
  'use strict';

  var DEFAULT_SETTINGS = {
    preloadAheadCount: 2,
    fitMode: 'height',
    showStatus: true,
    autoScroll: true
  };

  function setMessage(text) {
    document.getElementById('message').textContent = text;
  }

  function queryActiveTab() {
    return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      return tabs && tabs.length ? tabs[0] : null;
    });
  }

  function sendToContent(type) {
    return queryActiveTab().then(function (tab) {
      if (!tab || !tab.id) return null;
      return browser.tabs.sendMessage(tab.id, {
        target: 'eh-helper-content',
        type: type
      }).catch(function () {
        return null;
      });
    });
  }

  function toggleWindowFullscreen() {
    return browser.windows.getCurrent().then(function (win) {
      return browser.windows.update(win.id, {
        state: win.state === 'fullscreen' ? 'normal' : 'fullscreen'
      });
    });
  }

  function updateSegmented(setting, value) {
    var group = document.querySelector('[data-setting="' + setting + '"]');
    if (!group) return;

    var buttons = group.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].classList.toggle('active', buttons[i].dataset.value === String(value));
    }
  }

  function render(settings) {
    updateSegmented('preloadAheadCount', settings.preloadAheadCount);
    updateSegmented('fitMode', settings.fitMode);
    document.getElementById('autoScroll').checked = Boolean(settings.autoScroll);
    document.getElementById('showStatus').checked = Boolean(settings.showStatus);
  }

  function savePatch(patch) {
    return browser.storage.local.set(patch)
      .then(function () {
        return browser.storage.local.get(DEFAULT_SETTINGS);
      })
      .then(function (settings) {
        render(settings);
        return sendToContent('reload-settings');
      })
      .then(function () {
        setMessage('Saved');
      });
  }

  function setupSegmented(setting) {
    var group = document.querySelector('[data-setting="' + setting + '"]');
    if (!group) return;

    group.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;

      var value = button.dataset.value;
      var patch = {};
      patch[setting] = setting === 'preloadAheadCount' ? parseInt(value, 10) : value;
      savePatch(patch);
    });
  }

  function setupCheckbox(id, setting) {
    document.getElementById(id).addEventListener('change', function (event) {
      var patch = {};
      patch[setting] = Boolean(event.target.checked);
      savePatch(patch);
    });
  }

  function init() {
    browser.storage.local.get(DEFAULT_SETTINGS).then(render);

    setupSegmented('preloadAheadCount');
    setupSegmented('fitMode');
    setupCheckbox('autoScroll', 'autoScroll');
    setupCheckbox('showStatus', 'showStatus');

    document.getElementById('scrollToImage').addEventListener('click', function () {
      sendToContent('scroll-to-image').then(function () {
        setMessage('Scrolled');
      });
    });

    document.getElementById('fullscreen').addEventListener('click', function () {
      toggleWindowFullscreen().then(function () {
        setMessage('Fullscreen toggled');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
