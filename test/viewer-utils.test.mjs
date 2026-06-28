import test from 'node:test';
import assert from 'node:assert/strict';

import utils from '../addon/content/viewer-utils.js';

test('normalizeUrl strips the hash fragment', () => {
  assert.equal(
    utils.normalizeUrl('https://e-hentai.org/s/abc/123-4#foo'),
    'https://e-hentai.org/s/abc/123-4'
  );
  assert.equal(
    utils.normalizeUrl('https://e-hentai.org/s/abc/123-4'),
    'https://e-hentai.org/s/abc/123-4'
  );
  assert.equal(utils.normalizeUrl(undefined), '');
  assert.equal(utils.normalizeUrl(null), '');
});

test('isViewerUrl detects viewer (/s/) URLs only', () => {
  assert.equal(utils.isViewerUrl('https://e-hentai.org/s/abc/123-4'), true);
  assert.equal(utils.isViewerUrl('https://exhentai.org/s/def/999-12'), true);
  assert.equal(utils.isViewerUrl('https://e-hentai.org/g/123/abc/'), false);
  assert.equal(utils.isViewerUrl(undefined), false);
  assert.equal(utils.isViewerUrl(42), false);
});

test('getViewerPageFromUrl extracts the trailing page number', () => {
  assert.equal(utils.getViewerPageFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7'), '7');
  assert.equal(utils.getViewerPageFromUrl('https://e-hentai.org/s/c9bb9f7ae6/3019721-7#x'), '7');
  assert.equal(utils.getViewerPageFromUrl('https://e-hentai.org/g/3019721/abc/'), '');
  assert.equal(utils.getViewerPageFromUrl(''), '');
});

test('parsePagePair parses "current / total" labels', () => {
  assert.deepEqual(utils.parsePagePair('3 / 40'), { current: '3', total: '40' });
  assert.deepEqual(utils.parsePagePair('Page 12/345'), { current: '12', total: '345' });
  assert.deepEqual(utils.parsePagePair('  7  /  7  '), { current: '7', total: '7' });
});

test('parsePagePair rejects invalid or non-page text', () => {
  assert.equal(utils.parsePagePair('image_1280x720.jpg / something'), null);
  assert.equal(utils.parsePagePair('50 / 40'), null); // current > total
  assert.equal(utils.parsePagePair('0 / 40'), null); // zero current
  assert.equal(utils.parsePagePair('3 / 0'), null); // zero total
  assert.equal(utils.parsePagePair('no numbers here'), null);
  assert.equal(utils.parsePagePair(''), null);
  assert.equal(utils.parsePagePair(undefined), null);
});

test('getUrlTail returns the last path segment', () => {
  assert.equal(utils.getUrlTail('https://e-hentai.org/s/abc/3019721-7'), '3019721-7');
  assert.equal(utils.getUrlTail('https://e-hentai.org/s/abc/3019721-7#h'), '3019721-7');
  assert.equal(utils.getUrlTail(''), '');
});

test('formatDuration formats ms below 1s and seconds above', () => {
  assert.equal(utils.formatDuration(0), '0ms');
  assert.equal(utils.formatDuration(999), '999ms');
  assert.equal(utils.formatDuration(1000), '1.0s');
  assert.equal(utils.formatDuration(2500), '2.5s');
});

test('normalizeSettings merges defaults and clamps invalid values', () => {
  const defaults = {
    preloadAheadCount: 2,
    fitMode: 'height',
    showStatus: true,
    autoScroll: true
  };

  assert.deepEqual(utils.normalizeSettings(undefined, defaults), defaults);
  assert.deepEqual(utils.normalizeSettings({}, defaults), defaults);

  // valid overrides pass through
  assert.equal(utils.normalizeSettings({ preloadAheadCount: 3 }, defaults).preloadAheadCount, 3);
  assert.equal(utils.normalizeSettings({ fitMode: 'width' }, defaults).fitMode, 'width');

  // invalid values fall back to defaults
  assert.equal(utils.normalizeSettings({ preloadAheadCount: 99 }, defaults).preloadAheadCount, 2);
  assert.equal(utils.normalizeSettings({ fitMode: 'bogus' }, defaults).fitMode, 'height');

  // unrelated stored keys are preserved
  assert.equal(utils.normalizeSettings({ showStatus: false }, defaults).showStatus, false);
});
