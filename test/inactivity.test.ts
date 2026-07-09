import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { settings, virtualPage, totalPages } from '../src/content/state.js';
import { DEFAULT_SETTINGS, INACTIVITY_URL_SYNC_MS } from '../src/shared/constants.js';
import { pageUrlMap, pageImageMap } from '../src/content/navigation.js';
import { updateSpreadVisibility } from '../src/content/spread.js';
import {
  initInactivityUrlSync,
  cancelInactivityUrlSync,
  stopInactivityUrlSync
} from '../src/content/inactivity.js';

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  settings.value = { ...DEFAULT_SETTINGS, overlayView: true };
  virtualPage.value = 0;
  totalPages.value = 0;
  Object.keys(pageUrlMap).forEach((k) => delete pageUrlMap[k]);
  Object.keys(pageImageMap).forEach((k) => delete pageImageMap[k]);
  replaceStateSpy = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  initInactivityUrlSync();
});

afterEach(() => {
  // Full teardown (not just cancelInactivityUrlSync) so the activity
  // listeners added by initInactivityUrlSync() don't accumulate across tests.
  stopInactivityUrlSync();
  replaceStateSpy.mockRestore();
  vi.useRealTimers();
});

describe('initInactivityUrlSync', () => {
  test('replaces the URL with the current virtual page URL after 30s of inactivity', () => {
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', 'https://e-hentai.org/s/abc123/999-5');
  });

  test('resets the timer on user activity', () => {
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS - 1000);
    document.dispatchEvent(new Event('keydown'));

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS - 1);
    expect(replaceStateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', 'https://e-hentai.org/s/abc123/999-5');
  });

  test('does not call replaceState when the URL already matches location.href', () => {
    virtualPage.value = 5;
    pageUrlMap[5] = location.href;

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  test('does nothing when the overlay is not active', () => {
    settings.value = { ...DEFAULT_SETTINGS, overlayView: false, spreadView: false };
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  test('does nothing when there is no URL mapped for the current virtual page', () => {
    virtualPage.value = 5;

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  test('does nothing when there is no active virtual page', () => {
    virtualPage.value = 0;

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  test('keeps syncing on subsequent inactivity windows after firing once', () => {
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';
    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('click'));
    virtualPage.value = 6;
    pageUrlMap[6] = 'https://e-hentai.org/s/abc123/999-6';

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);
    expect(replaceStateSpy).toHaveBeenCalledTimes(2);
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      null,
      '',
      'https://e-hentai.org/s/abc123/999-6'
    );
  });
});

describe('overlay reactivation without page navigation', () => {
  test('re-arms the timer via updateSpreadVisibility so sync fires again after deactivate -> reactivate', () => {
    // Overlay was active and then deactivated (e.g. exitOverlay / settings
    // turned overlayView off), which clears the pending timer the same way
    // removeSpreadOverlayState() -> cancelInactivityUrlSync() does.
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';
    cancelInactivityUrlSync();

    // Reactivated without any page navigation or user-activity event, e.g. a
    // popup settings change flips overlayView back on and
    // updateSpreadVisibility()'s active branch runs (spread.ts).
    settings.value = {
      ...DEFAULT_SETTINGS,
      overlayView: true,
      spreadView: false,
      preloadAheadCount: 0
    };
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';
    pageImageMap[5] = 'https://img.example/page5.jpg';

    updateSpreadVisibility();

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', 'https://e-hentai.org/s/abc123/999-5');
  });
});

describe('cancelInactivityUrlSync', () => {
  test('prevents a pending sync from firing', () => {
    virtualPage.value = 5;
    pageUrlMap[5] = 'https://e-hentai.org/s/abc123/999-5';

    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS - 1000);
    cancelInactivityUrlSync();
    vi.advanceTimersByTime(INACTIVITY_URL_SYNC_MS);

    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
