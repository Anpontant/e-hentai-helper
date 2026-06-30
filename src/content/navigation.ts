import {
  normalizeUrl,
  isViewerUrl,
  getViewerPageFromUrl,
  getGalleryIdFromUrl,
  parsePagePair,
  getUrlTail
} from '../shared/viewer-utils.js';
import { MAX_VIEWER_PAGE_CACHE, GALLERY_ITEMS_PER_PAGE } from '../shared/constants.js';
import { virtualPage, totalPages } from './state.js';

// Cache the extracted page data (image URL + following page URL) rather than the
// full parsed Document. We only ever read those two fields, so keeping whole DOM
// trees alive (up to MAX_VIEWER_PAGE_CACHE of them) wasted memory.
export interface ViewerPageData {
  imageUrl: string;
  followingUrl: string;
}
export const viewerDataCache = new Map<string, ViewerPageData>();
export const pageUrlMap: Record<string, string> = {};
export const pageImageMap: Record<string, string> = {};

export function getMainImage(): HTMLImageElement | null {
  return document.getElementById('img') as HTMLImageElement | null;
}

export function getPageTextMatch() {
  if (!document.body) return null;

  const pageNodes = document.querySelectorAll('.sn');
  for (let i = 0; i < pageNodes.length; i += 1) {
    const parsedPageNode = parsePagePair(pageNodes[i].textContent);
    if (parsedPageNode) return parsedPageNode;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 32 || text.indexOf('/') === -1) continue;

    const parsed = parsePagePair(text);
    if (parsed) return parsed;
  }

  return null;
}

export function getTotalPageLabel() {
  const pageText = getPageTextMatch();
  const total = pageText ? pageText.total : '';
  const current = parseInt(
    getViewerPageFromUrl(location.href) || (pageText ? pageText.current : ''),
    10
  );

  if (total && (!current || parseInt(total, 10) >= current)) return total;
  return '?';
}

export function getProgressLabel() {
  let current: string;
  let total: string;

  if (virtualPage.value > 0) {
    current = String(virtualPage.value);
    total = totalPages.value > 0 ? String(totalPages.value) : getTotalPageLabel();
  } else {
    current = getViewerPageFromUrl(location.href);
    total = getTotalPageLabel();
    if (!current) {
      const pageText = getPageTextMatch();
      current = pageText ? pageText.current : '?';
    }
  }

  return 'Page ' + current + '/' + total;
}

export function getCurrentKey() {
  if (virtualPage.value > 0) {
    return 'virtual-' + virtualPage.value + '|' + (pageImageMap[virtualPage.value] || '');
  }
  const img = getMainImage();
  return normalizeUrl(location.href) + '|' + (img ? img.src : '');
}

function findLinkById(doc: Document, docUrl: string, id: string) {
  const el = doc.getElementById(id) as HTMLAnchorElement | null;
  let href = el && el.href ? el.href : '';
  if (!href) {
    const container = doc.querySelector<HTMLAnchorElement>('#' + id + ' a');
    if (container && container.href) href = container.href;
  }
  if (href && isViewerUrl(href) && normalizeUrl(href) !== normalizeUrl(docUrl)) {
    return href;
  }
  return '';
}

export function getNextPageUrlFromDocument(doc: Document, docUrl: string) {
  const img = doc.getElementById('img');
  const parent = img && (img.parentNode as HTMLAnchorElement | null);
  const fromImageLink = parent && parent.tagName === 'A' && parent.href ? parent.href : '';

  if (isViewerUrl(fromImageLink) && normalizeUrl(fromImageLink) !== normalizeUrl(docUrl)) {
    return fromImageLink;
  }

  const nextById = findLinkById(doc, docUrl, 'next');
  if (nextById) return nextById;

  const links = doc.querySelectorAll<HTMLAnchorElement>('a[href*="/s/"]');
  const current = normalizeUrl(docUrl);
  for (let i = 0; i < links.length; i += 1) {
    if (links[i].href && normalizeUrl(links[i].href) !== current) {
      return links[i].href;
    }
  }

  return '';
}

export function getNextPageUrl() {
  return getNextPageUrlFromDocument(document, location.href);
}

export function getPrevPageUrlFromDocument(doc: Document, docUrl: string) {
  return findLinkById(doc, docUrl, 'prev');
}

export function getPrevPageUrl() {
  return getPrevPageUrlFromDocument(document, location.href);
}

export function getImageUrlFromDocument(doc: Document, docUrl: string) {
  const img = doc.getElementById('img') as HTMLImageElement | null;
  if (!img) return '';

  const src = img.getAttribute('src') || img.src || '';
  if (!src) return '';

  try {
    return new URL(src, docUrl).href;
  } catch {
    return src;
  }
}

export function getPageLabelFromDocument(doc: Document, fallbackUrl: string) {
  const pageNode = doc.querySelector('.sn');
  const parsed = parsePagePair(pageNode ? pageNode.textContent : '');
  return parsed ? parsed.current : getViewerPageFromUrl(fallbackUrl) || getUrlTail(fallbackUrl);
}

function pruneViewerDataCache() {
  while (viewerDataCache.size > MAX_VIEWER_PAGE_CACHE) {
    const firstKey = viewerDataCache.keys().next().value!;
    viewerDataCache.delete(firstKey);
  }
}

// Fetch a viewer page, parse it once, extract the fields we need, and cache the
// extracted record. The parsed Document is discarded so it can be GC'd.
function fetchViewerPageData(pageUrl: string, signal?: AbortSignal): Promise<ViewerPageData> {
  const cached = viewerDataCache.get(pageUrl);
  if (cached) return Promise.resolve(cached);

  return fetch(pageUrl, {
    credentials: 'include',
    cache: 'force-cache',
    signal: signal
  })
    .then(function (res) {
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      return res.text();
    })
    .then(function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const data: ViewerPageData = {
        imageUrl: getImageUrlFromDocument(doc, pageUrl),
        followingUrl: getNextPageUrlFromDocument(doc, pageUrl)
      };
      viewerDataCache.set(pageUrl, data);
      pruneViewerDataCache();
      return data;
    });
}

// Fetch a viewer page and cache-fill the page maps (image URL + the following
// page's URL), persisting them. These map writes are unconditional cache fills
// keyed by real page numbers (always-valid data), so callers that care about
// render staleness guard their own display updates — e.g. the spreadRenderRunId
// check around the callback in loadPartnerImage — not these writes.
export function resolvePageData(url: string, signal?: AbortSignal): Promise<ViewerPageData> {
  return fetchViewerPageData(url, signal).then(function (data) {
    const page = parseInt(getViewerPageFromUrl(url), 10);
    if (page && data.imageUrl) pageImageMap[page] = data.imageUrl;
    if (data.followingUrl) {
      const followingPage = parseInt(getViewerPageFromUrl(data.followingUrl), 10);
      if (followingPage) pageUrlMap[followingPage] = data.followingUrl;
    }
    persistPageMaps();
    return data;
  });
}

function getStorageKey() {
  const galleryId = getGalleryIdFromUrl(location.href);
  return galleryId ? 'eh-helper-maps-' + galleryId : '';
}

export function persistPageMaps() {
  try {
    const key = getStorageKey();
    if (!key) return;
    sessionStorage.setItem(key, JSON.stringify({ images: pageImageMap, urls: pageUrlMap }));
  } catch {
    // sessionStorage unavailable
  }
}

export function restorePageMaps() {
  try {
    const key = getStorageKey();
    if (!key) return;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.images) {
      Object.keys(data.images).forEach(function (k) {
        if (!pageImageMap[k]) pageImageMap[k] = data.images[k];
      });
    }
    if (data.urls) {
      Object.keys(data.urls).forEach(function (k) {
        if (!pageUrlMap[k]) pageUrlMap[k] = data.urls[k];
      });
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }
}

export function getGalleryBaseUrl() {
  const i5 = document.getElementById('i5');
  if (!i5) return '';
  const link = i5.querySelector<HTMLAnchorElement>('a[href*="/g/"]');
  return link ? link.href : '';
}

let galleryItemsPerPage = GALLERY_ITEMS_PER_PAGE;

export function fetchGalleryPageUrls(
  galleryBaseUrl: string,
  targetPage: number,
  signal?: AbortSignal
) {
  const pageIndex = Math.floor((targetPage - 1) / galleryItemsPerPage);
  const url = pageIndex > 0 ? galleryBaseUrl + '?p=' + pageIndex : galleryBaseUrl;

  return fetch(url, { credentials: 'include', cache: 'force-cache', signal: signal })
    .then(function (res) {
      if (!res.ok) throw new Error('gallery fetch failed: ' + res.status);
      return res.text();
    })
    .then(function (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const gdt = doc.getElementById('gdt');
      if (!gdt) return;

      const links = gdt.querySelectorAll<HTMLAnchorElement>('a[href*="/s/"]');
      let count = 0;
      for (let i = 0; i < links.length; i += 1) {
        const href = links[i].href;
        const page = parseInt(getViewerPageFromUrl(href), 10);
        if (page && !pageUrlMap[page]) {
          pageUrlMap[page] = href;
          count += 1;
        }
      }
      if (count > 0) {
        if (links.length > galleryItemsPerPage) galleryItemsPerPage = links.length;
        persistPageMaps();
      }
    });
}

export function clearPageMapsStorage() {
  try {
    const key = getStorageKey();
    if (key) sessionStorage.removeItem(key);
  } catch {
    // sessionStorage unavailable
  }
}
