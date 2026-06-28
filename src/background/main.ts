import { DEFAULT_SETTINGS } from '../shared/constants.js';

let enabled = DEFAULT_SETTINGS.exhRedirect;

function loadEnabled() {
  return browser.storage.local
    .get({ exhRedirect: DEFAULT_SETTINGS.exhRedirect })
    .then(function (stored) {
      enabled = !!(stored as { exhRedirect: boolean }).exhRedirect;
    });
}

browser.storage.onChanged.addListener(function (changes) {
  if (changes.exhRedirect) {
    enabled = !!changes.exhRedirect.newValue;
  }
});

if (typeof browser.webRequest !== 'undefined') {
  browser.webRequest.onBeforeRequest.addListener(
    function (details) {
      if (!enabled) return {};

      return browser.cookies
        .get({ url: 'https://exhentai.org/', name: 'igneous' })
        .then(function (cookie) {
          if (cookie && cookie.value && cookie.value !== 'mystery') return {};
          return { redirectUrl: details.url.replace('exhentai.org', 'e-hentai.org') };
        });
    },
    { urls: ['*://exhentai.org/*'], types: ['main_frame'] },
    ['blocking']
  );
}

loadEnabled();
