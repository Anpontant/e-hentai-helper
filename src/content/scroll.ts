import { settings } from './state.js';
import { SCROLL_OFFSET, MAX_SCROLL_RETRIES, SCROLL_RETRY_DELAY_MS } from '../shared/constants.js';
import { getMainImage } from './navigation.js';
import { applyImageFit } from './fit.js';
import { isOverlayActive, showStatus } from './status.js';

export function scrollToImage(retryCount?: number) {
  if (isOverlayActive()) return;
  retryCount = retryCount || 0;
  const img = getMainImage();
  if (!img) {
    if (retryCount < MAX_SCROLL_RETRIES) {
      window.setTimeout(function () {
        scrollToImage(retryCount! + 1);
      }, SCROLL_RETRY_DELAY_MS);
      return;
    }
    showStatus('EH: image not found');
    return;
  }

  const theImg = img;
  function scrollNow() {
    applyImageFit();
    if (settings.value.autoScroll) {
      const y = theImg.getBoundingClientRect().top + window.pageYOffset - SCROLL_OFFSET;
      window.scrollTo(0, Math.max(0, y));
    }
    showStatus('EH: ready');
  }

  if (theImg.complete) {
    scrollNow();
    return;
  }

  theImg.addEventListener('load', scrollNow, { once: true });
}
