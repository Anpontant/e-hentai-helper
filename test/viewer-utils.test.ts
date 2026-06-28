import { describe, test, expect } from 'vitest';
import * as utils from '../src/shared/viewer-utils.js';

describe('normalizeUrl', () => {
  test('strips the hash fragment', () => {
    expect(utils.normalizeUrl('https://e-hentai.org/s/abc/123-4#foo')).toBe(
      'https://e-hentai.org/s/abc/123-4'
    );
    expect(utils.normalizeUrl('https://e-hentai.org/s/abc/123-4')).toBe(
      'https://e-hentai.org/s/abc/123-4'
    );
    expect(utils.normalizeUrl(undefined as unknown as string)).toBe('');
    expect(utils.normalizeUrl(null as unknown as string)).toBe('');
  });
});

describe('isViewerUrl', () => {
  test('detects viewer (/s/) URLs only', () => {
    expect(utils.isViewerUrl('https://e-hentai.org/s/abc/123-4')).toBe(true);
    expect(utils.isViewerUrl('https://exhentai.org/s/def/999-12')).toBe(true);
    expect(utils.isViewerUrl('https://e-hentai.org/g/123/abc/')).toBe(false);
    expect(utils.isViewerUrl(undefined as unknown as string)).toBe(false);
    expect(utils.isViewerUrl(42 as unknown as string)).toBe(false);
  });
});

describe('getViewerPageFromUrl', () => {
  test('extracts the trailing page number', () => {
    expect(utils.getViewerPageFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7')).toBe('7');
    expect(utils.getViewerPageFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7#x')).toBe('7');
    expect(utils.getViewerPageFromUrl('https://e-hentai.org/g/3019721/abc/')).toBe('');
    expect(utils.getViewerPageFromUrl('')).toBe('');
  });
});

describe('parsePagePair', () => {
  test('parses "current / total" labels', () => {
    expect(utils.parsePagePair('3 / 40')).toEqual({ current: '3', total: '40' });
    expect(utils.parsePagePair('Page 12/345')).toEqual({ current: '12', total: '345' });
    expect(utils.parsePagePair('  7  /  7  ')).toEqual({ current: '7', total: '7' });
  });

  test('rejects invalid or non-page text', () => {
    expect(utils.parsePagePair('image_1280x720.jpg / something')).toBeNull();
    expect(utils.parsePagePair('50 / 40')).toBeNull();
    expect(utils.parsePagePair('0 / 40')).toBeNull();
    expect(utils.parsePagePair('3 / 0')).toBeNull();
    expect(utils.parsePagePair('no numbers here')).toBeNull();
    expect(utils.parsePagePair('')).toBeNull();
    expect(utils.parsePagePair(undefined as unknown as string)).toBeNull();
  });
});

describe('getUrlTail', () => {
  test('returns the last path segment', () => {
    expect(utils.getUrlTail('https://e-hentai.org/s/abc/3019721-7')).toBe('3019721-7');
    expect(utils.getUrlTail('https://e-hentai.org/s/abc/3019721-7#h')).toBe('3019721-7');
    expect(utils.getUrlTail('')).toBe('');
  });
});

describe('formatDuration', () => {
  test('formats ms below 1s and seconds above', () => {
    expect(utils.formatDuration(0)).toBe('0ms');
    expect(utils.formatDuration(999)).toBe('999ms');
    expect(utils.formatDuration(1000)).toBe('1.0s');
    expect(utils.formatDuration(2500)).toBe('2.5s');
  });
});

describe('normalizeSettings', () => {
  const defaults = {
    preloadAheadCount: 2,
    fitMode: 'height' as const,
    showStatus: true,
    autoScroll: true,
    overlayView: false,
    spreadView: false,
    spreadCoverAlone: true,
    showPreloadThumbs: false
  };

  test('merges defaults and clamps invalid values', () => {
    expect(
      utils.normalizeSettings(undefined as unknown as Record<string, unknown>, defaults)
    ).toEqual(defaults);
    expect(utils.normalizeSettings({}, defaults)).toEqual(defaults);

    expect(utils.normalizeSettings({ preloadAheadCount: 3 }, defaults).preloadAheadCount).toBe(3);
    expect(utils.normalizeSettings({ fitMode: 'width' }, defaults).fitMode).toBe('width');

    expect(utils.normalizeSettings({ preloadAheadCount: 99 }, defaults).preloadAheadCount).toBe(2);
    expect(
      utils.normalizeSettings({ fitMode: 'bogus' as unknown as 'height' }, defaults).fitMode
    ).toBe('height');

    expect(utils.normalizeSettings({ showStatus: false }, defaults).showStatus).toBe(false);
  });
});

describe('getSpreadPageInfo', () => {
  test('coverAlone=true shows page 1 alone', () => {
    expect(utils.getSpreadPageInfo(1, 40, true)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: true
    });
  });

  test('coverAlone=true pairs even pages as right', () => {
    expect(utils.getSpreadPageInfo(2, 40, true)).toEqual({
      partnerPage: 3,
      pagesInSpread: 2,
      isRightPage: true
    });
    expect(utils.getSpreadPageInfo(4, 40, true)).toEqual({
      partnerPage: 5,
      pagesInSpread: 2,
      isRightPage: true
    });
  });

  test('coverAlone=true marks odd pages > 1 as left', () => {
    expect(utils.getSpreadPageInfo(3, 40, true)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: false
    });
    expect(utils.getSpreadPageInfo(5, 40, true)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: false
    });
  });

  test('coverAlone=false pairs odd pages as right', () => {
    expect(utils.getSpreadPageInfo(1, 40, false)).toEqual({
      partnerPage: 2,
      pagesInSpread: 2,
      isRightPage: true
    });
    expect(utils.getSpreadPageInfo(3, 40, false)).toEqual({
      partnerPage: 4,
      pagesInSpread: 2,
      isRightPage: true
    });
  });

  test('coverAlone=false marks even pages as left', () => {
    expect(utils.getSpreadPageInfo(2, 40, false)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: false
    });
    expect(utils.getSpreadPageInfo(4, 40, false)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: false
    });
  });

  test('returns single when partner exceeds total', () => {
    expect(utils.getSpreadPageInfo(40, 40, true)).toEqual({
      partnerPage: null,
      pagesInSpread: 1,
      isRightPage: true
    });
    expect(utils.getSpreadPageInfo(39, 40, false)).toEqual({
      partnerPage: 40,
      pagesInSpread: 2,
      isRightPage: true
    });
  });

  test('unknown total pairs right pages', () => {
    expect(utils.getSpreadPageInfo(4, 0, true)).toEqual({
      partnerPage: 5,
      pagesInSpread: 2,
      isRightPage: true
    });
    expect(utils.getSpreadPageInfo(1, 0, false)).toEqual({
      partnerPage: 2,
      pagesInSpread: 2,
      isRightPage: true
    });
  });

  test('handles invalid currentPage', () => {
    const zero = utils.getSpreadPageInfo(0, 40, true);
    expect(zero.partnerPage).toBeNull();
    expect(zero.isRightPage).toBe(true);
    const neg = utils.getSpreadPageInfo(-1, 40, false);
    expect(neg.partnerPage).toBeNull();
    expect(neg.isRightPage).toBe(true);
  });
});

describe('getGalleryIdFromUrl', () => {
  test('extracts the gallery ID', () => {
    expect(utils.getGalleryIdFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7')).toBe(
      '3019721'
    );
    expect(utils.getGalleryIdFromUrl('https://exhentai.org/s/abc123/999-12')).toBe('999');
    expect(utils.getGalleryIdFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7#x')).toBe(
      '3019721'
    );
  });

  test('returns empty for non-viewer URLs', () => {
    expect(utils.getGalleryIdFromUrl('https://e-hentai.org/g/3019721/abc/')).toBe('');
    expect(utils.getGalleryIdFromUrl('')).toBe('');
    expect(utils.getGalleryIdFromUrl(undefined as unknown as string)).toBe('');
  });
});
