import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { settings, spreadState, virtualPage, totalPages } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { pageUrlMap, pageImageMap, viewerDataCache } from '../src/content/navigation.js';
import { renderSpread } from '../src/content/spread.js';

const GALLERY_URL = 'https://e-hentai.org/g/999/abcdef/';
const PAGE_URL = (page: number) => 'https://e-hentai.org/s/key' + page + '/999-' + page;
const IMAGE_URL = (page: number) => 'https://img.example/page' + page + '.jpg';

function setupViewerDom(page: number, total: number) {
  document.body.innerHTML = `
    <div id="i1">
      <div id="i3"><a href="${PAGE_URL(page + 1)}"><img id="img" src="${IMAGE_URL(page)}" /></a></div>
      <div id="i5"><a href="${GALLERY_URL}">Back to gallery</a></div>
      <div class="sn"><span>${page} / ${total}</span></div>
      <a id="prev" href="${PAGE_URL(page - 1)}">&lt;</a>
      <a id="next" href="${PAGE_URL(page + 1)}">&gt;</a>
    </div>
  `;
}

let locationStub: { href: string };

beforeEach(() => {
  settings.value = {
    ...DEFAULT_SETTINGS,
    overlayView: true,
    spreadView: true,
    spreadCoverAlone: true,
    preloadAheadCount: 0
  };
  virtualPage.value = 0;
  totalPages.value = 0;
  spreadState.value = {
    active: false,
    leftSrc: '',
    rightSrc: '',
    rightFallbackSrc: '',
    single: false
  };
  Object.keys(pageUrlMap).forEach((k) => delete pageUrlMap[k]);
  Object.keys(pageImageMap).forEach((k) => delete pageImageMap[k]);
  viewerDataCache.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function stubLocation(page: number) {
  locationStub = { href: PAGE_URL(page) };
  vi.stubGlobal('location', locationStub);
}

describe('renderSpread landing on the left half of a spread', () => {
  test('shows the spread containing page 3 (2|3) with cover alone, without navigating', () => {
    setupViewerDom(3, 40);
    stubLocation(3);
    pageUrlMap[2] = PAGE_URL(2);
    pageImageMap[2] = IMAGE_URL(2);

    renderSpread();

    expect(locationStub.href).toBe(PAGE_URL(3));
    expect(virtualPage.value).toBe(2);
    expect(spreadState.value.single).toBe(false);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(2));
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(3));
  });

  test('shows the spread containing page 4 (3|4) without cover alone', () => {
    settings.value = { ...settings.value, spreadCoverAlone: false };
    setupViewerDom(4, 40);
    stubLocation(4);
    pageUrlMap[3] = PAGE_URL(3);
    pageImageMap[3] = IMAGE_URL(3);

    renderSpread();

    expect(locationStub.href).toBe(PAGE_URL(4));
    expect(virtualPage.value).toBe(3);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(3));
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(4));
  });

  test('resolves the missing right page from the viewer prev link on a cold start', async () => {
    setupViewerDom(3, 40);
    stubLocation(3);

    const fetchMock = vi.fn((url: string) => {
      if (url !== PAGE_URL(2)) return Promise.reject(new Error('unexpected fetch: ' + url));
      return Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(`<a href="${PAGE_URL(3)}"><img id="img" src="${IMAGE_URL(2)}" /></a>`)
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSpread();

    await vi.waitFor(() => expect(spreadState.value.rightSrc).toBe(IMAGE_URL(2)));
    expect(fetchMock).toHaveBeenCalledWith(PAGE_URL(2), expect.anything());
    expect(virtualPage.value).toBe(2);
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(3));
  });
});

describe('renderSpread landing on the right half of a spread', () => {
  test('renders the current page as the right half and pairs the next page', () => {
    setupViewerDom(2, 40);
    stubLocation(2);
    pageUrlMap[3] = PAGE_URL(3);
    pageImageMap[3] = IMAGE_URL(3);

    renderSpread();

    expect(locationStub.href).toBe(PAGE_URL(2));
    expect(virtualPage.value).toBe(2);
    expect(totalPages.value).toBe(40);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(2));
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(3));
  });

  test('renders the cover alone', () => {
    setupViewerDom(1, 40);
    stubLocation(1);

    renderSpread();

    expect(virtualPage.value).toBe(1);
    expect(spreadState.value.single).toBe(true);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(1));
  });
});
