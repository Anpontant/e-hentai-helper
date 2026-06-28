import { settings } from './state.js';
import { SCROLL_OFFSET, MAX_SCROLL_RETRIES, SCROLL_RETRY_DELAY_MS } from '../shared/constants.js';
import { getMainImage } from './navigation.js';
import { applyImageFit } from './fit.js';
import { isOverlayActive, showStatus } from './status.js';

export function scrollToImage(retryCount) {
  if (isOverlayActive()) return;
  retryCount = retryCount || 0;
  var img = getMainImage();
  if (!img) {
    if (retryCount < MAX_SCROLL_RETRIES) {
      window.setTimeout(function () {
        scrollToImage(retryCount + 1);
      }, SCROLL_RETRY_DELAY_MS);
      return;
    }
    showStatus('EH: image not found');
    return;
  }

  function scrollNow() {
    applyImageFit();
    if (settings.value.autoScroll) {
      var y = img.getBoundingClientRect().top + window.pageYOffset - SCROLL_OFFSET;
      window.scrollTo(0, Math.max(0, y));
    }
    showStatus('EH: ready');
  }

  if (img.complete) {
    scrollNow();
    return;
  }

  img.addEventListener('load', scrollNow, { once: true });
}
