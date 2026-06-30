import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  getNextPageUrlFromDocument,
  getPrevPageUrlFromDocument,
  getImageUrlFromDocument,
  getPageLabelFromDocument,
  resolvePageData,
  viewerDataCache,
  pageUrlMap,
  pageImageMap
} from '../src/content/navigation.js';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('getNextPageUrlFromDocument', () => {
  test('extracts next URL from image parent link', () => {
    const doc = createDoc(`
      <a href="https://e-hentai.org/s/def456/3019721-8">
        <img id="img" src="image.jpg" />
      </a>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/def456/3019721-8');
  });

  test('skips image link when it points to the same page', () => {
    const doc = createDoc(`
      <a href="https://e-hentai.org/s/abc123/3019721-7">
        <img id="img" src="image.jpg" />
      </a>
      <a id="next" href="https://e-hentai.org/s/def456/3019721-8">Next</a>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/def456/3019721-8');
  });

  test('falls back to #next element', () => {
    const doc = createDoc(`
      <img id="img" src="image.jpg" />
      <a id="next" href="https://e-hentai.org/s/def456/3019721-8">Next</a>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/def456/3019721-8');
  });

  test('falls back to #next container with nested anchor', () => {
    const doc = createDoc(`
      <img id="img" src="image.jpg" />
      <div id="next"><a href="https://e-hentai.org/s/def456/3019721-8">Next</a></div>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/def456/3019721-8');
  });

  test('falls back to any /s/ link on the page', () => {
    const doc = createDoc(`
      <img id="img" src="image.jpg" />
      <a href="https://e-hentai.org/g/123/abc/">Gallery</a>
      <a href="https://e-hentai.org/s/xyz789/3019721-9">Page 9</a>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/xyz789/3019721-9');
  });

  test('returns empty when no next link exists', () => {
    const doc = createDoc('<img id="img" src="image.jpg" />');
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('');
  });

  test('ignores #next that points to same page', () => {
    const doc = createDoc(`
      <img id="img" src="image.jpg" />
      <a id="next" href="https://e-hentai.org/s/abc123/3019721-7">Next</a>
    `);
    const result = getNextPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('');
  });
});

describe('getPrevPageUrlFromDocument', () => {
  test('extracts previous URL from #prev element', () => {
    const doc = createDoc(`
      <a id="prev" href="https://e-hentai.org/s/abc123/3019721-6">Prev</a>
    `);
    const result = getPrevPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/abc123/3019721-6');
  });

  test('extracts from #prev container with nested anchor', () => {
    const doc = createDoc(`
      <div id="prev"><a href="https://e-hentai.org/s/abc123/3019721-6">Prev</a></div>
    `);
    const result = getPrevPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('https://e-hentai.org/s/abc123/3019721-6');
  });

  test('returns empty when no #prev element exists', () => {
    const doc = createDoc('<p>No navigation</p>');
    const result = getPrevPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('');
  });

  test('returns empty when #prev points to same page', () => {
    const doc = createDoc(`
      <a id="prev" href="https://e-hentai.org/s/abc123/3019721-7">Prev</a>
    `);
    const result = getPrevPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('');
  });

  test('returns empty when #prev is non-viewer URL', () => {
    const doc = createDoc(`
      <a id="prev" href="https://e-hentai.org/g/123/abc/">Gallery</a>
    `);
    const result = getPrevPageUrlFromDocument(doc, 'https://e-hentai.org/s/abc123/3019721-7');
    expect(result).toBe('');
  });
});

describe('getImageUrlFromDocument', () => {
  test('extracts image src from #img element', () => {
    const doc = createDoc('<img id="img" src="https://cdn.example.com/image.jpg" />');
    const result = getImageUrlFromDocument(doc, 'https://e-hentai.org/s/abc/123-1');
    expect(result).toBe('https://cdn.example.com/image.jpg');
  });

  test('resolves relative src against docUrl', () => {
    const doc = createDoc('<img id="img" src="/images/photo.jpg" />');
    const result = getImageUrlFromDocument(doc, 'https://e-hentai.org/s/abc/123-1');
    expect(result).toBe('https://e-hentai.org/images/photo.jpg');
  });

  test('returns empty when no #img element', () => {
    const doc = createDoc('<p>No image</p>');
    const result = getImageUrlFromDocument(doc, 'https://e-hentai.org/s/abc/123-1');
    expect(result).toBe('');
  });

  test('returns empty when #img has no src', () => {
    const doc = createDoc('<img id="img" />');
    const result = getImageUrlFromDocument(doc, 'https://e-hentai.org/s/abc/123-1');
    expect(result).toBe('');
  });
});

describe('getPageLabelFromDocument', () => {
  test('extracts page number from .sn element', () => {
    const doc = createDoc('<div class="sn"><span>3 / 40</span></div>');
    const result = getPageLabelFromDocument(doc, 'https://e-hentai.org/s/abc/123-3');
    expect(result).toBe('3');
  });

  test('falls back to URL page number', () => {
    const doc = createDoc('<p>No page info</p>');
    const result = getPageLabelFromDocument(doc, 'https://e-hentai.org/s/abc/123-5');
    expect(result).toBe('5');
  });

  test('falls back to URL tail when no page data at all', () => {
    const doc = createDoc('<p>No page info</p>');
    const result = getPageLabelFromDocument(doc, 'https://example.com/path/segment');
    expect(result).toBe('segment');
  });
});

describe('resolvePageData', () => {
  const pageUrl = 'https://e-hentai.org/s/abc123/3019721-7';
  const html =
    '<a href="https://e-hentai.org/s/def456/3019721-8">' +
    '<img id="img" src="https://img.example/page7.jpg"></a>';

  beforeEach(() => {
    viewerDataCache.clear();
    Object.keys(pageUrlMap).forEach((k) => delete pageUrlMap[k]);
    Object.keys(pageImageMap).forEach((k) => delete pageImageMap[k]);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(html) } as Response)
    );
  });

  test('extracts image + following URL and fills the page maps', async () => {
    const data = await resolvePageData(pageUrl);
    expect(data.imageUrl).toBe('https://img.example/page7.jpg');
    expect(data.followingUrl).toBe('https://e-hentai.org/s/def456/3019721-8');
    expect(pageImageMap[7]).toBe('https://img.example/page7.jpg');
    expect(pageUrlMap[8]).toBe('https://e-hentai.org/s/def456/3019721-8');
  });

  test('caches the extracted record (not the Document) and skips re-fetch on hit', async () => {
    await resolvePageData(pageUrl);
    await resolvePageData(pageUrl);
    expect(fetch).toHaveBeenCalledTimes(1);

    const cached = viewerDataCache.get(pageUrl);
    expect(cached).toEqual({
      imageUrl: 'https://img.example/page7.jpg',
      followingUrl: 'https://e-hentai.org/s/def456/3019721-8'
    });
  });
});
