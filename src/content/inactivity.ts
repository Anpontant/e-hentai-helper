import { virtualPage } from './state.js';
import { isOverlayActive } from './status.js';
import { pageUrlMap } from './navigation.js';
import { normalizeUrl } from '../shared/viewer-utils.js';
import { INACTIVITY_URL_SYNC_MS } from '../shared/constants.js';

// Events that count as "user activity" for the purposes of resetting the
// inactivity timer. Captured at the document level so we don't need to wire
// listeners into every interactive element.
const ACTIVITY_EVENTS = ['keydown', 'click', 'wheel', 'pointerdown', 'touchend'];

let inactivityTimer = 0;

// Fired after INACTIVITY_URL_SYNC_MS of no user activity. Rewrites the address
// bar to match the currently displayed virtual page so a browser reload resumes
// from the right place instead of restarting at the first-loaded page. Never
// performs a real navigation (no location.href assignment).
function syncUrlToVirtualPage() {
  inactivityTimer = 0;
  if (!isOverlayActive()) return;

  const page = virtualPage.value;
  if (!page) return;

  const url = pageUrlMap[page];
  if (!url) return;

  if (normalizeUrl(url) === normalizeUrl(location.href)) return;

  history.replaceState(null, '', url);
}

function armInactivityTimer() {
  window.clearTimeout(inactivityTimer);
  inactivityTimer = window.setTimeout(syncUrlToVirtualPage, INACTIVITY_URL_SYNC_MS);
}

// Cancels any pending sync without detaching the activity listeners, so the
// next user action (or the ones already wired up) can re-arm it later.
export function cancelInactivityUrlSync() {
  window.clearTimeout(inactivityTimer);
  inactivityTimer = 0;
}

// (Re-)starts the countdown without touching the activity listeners. The
// overlay can (re)activate without any user-activity event occurring in
// between — e.g. a popup settings change flips overlayView back on via
// updateSpreadVisibility()'s active branch (spread.ts). Since a prior
// deactivation may have called cancelInactivityUrlSync(), that path must
// explicitly re-arm the timer or inactivity URL sync stays dead until the
// next keypress/click/etc.
export function armInactivityUrlSync() {
  armInactivityTimer();
}

// Wires up the activity listeners and starts the countdown. Intended to be
// called once for the lifetime of the content script (mirrors the other
// document/window listeners set up in main.tsx), the timer itself is
// re-armed on every user action and keeps repeating indefinitely.
export function initInactivityUrlSync() {
  for (let i = 0; i < ACTIVITY_EVENTS.length; i += 1) {
    document.addEventListener(ACTIVITY_EVENTS[i], armInactivityTimer, true);
  }
  armInactivityTimer();
}

// Full teardown (cancels the timer and detaches the activity listeners).
// Not used by production code — the listeners are meant to live for the
// content script's whole page lifetime, same as the other document/window
// listeners set up in main.tsx. Exported so tests can avoid accumulating
// duplicate listeners across repeated initInactivityUrlSync() calls.
export function stopInactivityUrlSync() {
  cancelInactivityUrlSync();
  for (let i = 0; i < ACTIVITY_EVENTS.length; i += 1) {
    document.removeEventListener(ACTIVITY_EVENTS[i], armInactivityTimer, true);
  }
}
