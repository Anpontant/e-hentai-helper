import {
  normalizeUrl,
  isViewerUrl,
  getViewerPageFromUrl,
  getGalleryIdFromUrl,
  parsePagePair,
  getUrlTail
} from '../shared/viewer-utils.mjs';
import { MAX_VIEWER_DOC_CACHE, GALLERY_ITEMS_PER_PAGE } from '../shared/constants.js';

export const viewerDocCache = new Map();
export const pageUrlMap = {};
export const pageImageMap = {};

export function getMainImage() {
  return document.getElementById('img');
}

export function getPageTextMatch() {
  if (!document.body) return null;

  var pageNodes = document.querySelectorAll('.sn');
  for (var i = 0; i < pageNodes.length; i += 1) {
    var parsedPageNode = parsePagePair(pageNodes[i].textContent);
    if (parsedPageNode) return parsedPageNode;
  }

  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    var text = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (!text || text.length > 32 || text.indexOf('/') === -1) continue;

    var parsed = parsePagePair(text);
    if (parsed) return parsed;
  }

  return null;
}

export function getTotalPageLabel() {
  var pageText = getPageTextMatch();
  var total = pageText ? pageText.total : '';
  var current = parseInt(
    getViewerPageFromUrl(location.href) || (pageText ? pageText.current : ''),
    10
  );

  if (total && (!current || parseInt(total, 10) >= current)) return total;
  return '?';
}

export function getProgressLabel() {
  var current = getViewerPageFromUrl(location.href);
  var total = getTotalPageLabel();
  if (!current) {
    var pageText = getPageTextMatch();
    current = pageText ? pageText.current : '?';
  }
  return 'Page ' + current + '/' + total;
}

export function getCurrentKey() {
  var img = getMainImage();
  return normalizeUrl(location.href) + '|' + (img ? img.src : '');
}

export function getNextPageUrlFromDocument(doc, docUrl) {
  var img = doc.getElementById('img');
  var fromImageLink =
    img && img.parentNode && img.parentNode.tagName === 'A' ? img.parentNode.href : '';

  if (isViewerUrl(fromImageLink) && normalizeUrl(fromImageLink) !== normalizeUrl(docUrl)) {
    return fromImageLink;
  }

  var nextById = '';
  var directNext = doc.getElementById('next');
  if (directNext && directNext.href) nextById = directNext.href;
  if (!nextById) {
    var nextContainer = doc.querySelector('#next a');
    if (nextContainer && nextContainer.href) nextById = nextContainer.href;
  }

  if (isViewerUrl(nextById) && normalizeUrl(nextById) !== normalizeUrl(docUrl)) {
    return nextById;
  }

  var links = doc.querySelectorAll('a[href*="/s/"]');
  var current = normalizeUrl(docUrl);
  for (var i = 0; i < links.length; i += 1) {
    if (links[i].href && normalizeUrl(links[i].href) !== current) {
      return links[i].href;
    }
  }

  return '';
}

export function getNextPageUrl() {
  return getNextPageUrlFromDocument(document, location.href);
}

export function getPrevPageUrlFromDocument(doc, docUrl) {
  var prevById = '';
  var directPrev = doc.getElementById('prev');
  if (directPrev && directPrev.href) prevById = directPrev.href;
  if (!prevById) {
    var prevContainer = doc.querySelector('#prev a');
    if (prevContainer && prevContainer.href) prevById = prevContainer.href;
  }

  if (isViewerUrl(prevById) && normalizeUrl(prevById) !== normalizeUrl(docUrl)) {
    return prevById;
  }

  return '';
}

export function getPrevPageUrl() {
  return getPrevPageUrlFromDocument(document, location.href);
}

export function getImageUrlFromDocument(doc, docUrl) {
  var img = doc.getElementById('img');
  if (!img) return '';

  var src = img.getAttribute('src') || img.src || '';
  if (!src) return '';

  try {
    return new URL(src, docUrl).href;
  } catch (error) {
    return src;
  }
}

export function getPageLabelFromDocument(doc, fallbackUrl) {
  var pageNode = doc.querySelector('.sn');
  var parsed = parsePagePair(pageNode ? pageNode.textContent : '');
  return parsed ? parsed.current : getViewerPageFromUrl(fallbackUrl) || getUrlTail(fallbackUrl);
}

function pruneViewerDocCache() {
  while (viewerDocCache.size > MAX_VIEWER_DOC_CACHE) {
    var firstKey = viewerDocCache.keys().next().value;
    viewerDocCache.delete(firstKey);
  }
}

export function fetchViewerDocument(pageUrl, signal) {
  var cached = viewerDocCache.get(pageUrl);
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
      var doc = new DOMParser().parseFromString(html, 'text/html');
      viewerDocCache.set(pageUrl, doc);
      pruneViewerDocCache();
      return doc;
    });
}

function getStorageKey() {
  var galleryId = getGalleryIdFromUrl(location.href);
  return galleryId ? 'eh-helper-maps-' + galleryId : '';
}

export function persistPageMaps() {
  try {
    var key = getStorageKey();
    if (!key) return;
    sessionStorage.setItem(key, JSON.stringify({ images: pageImageMap, urls: pageUrlMap }));
  } catch (_e) {
    // sessionStorage unavailable
  }
}

export function restorePageMaps() {
  try {
    var key = getStorageKey();
    if (!key) return;
    var raw = sessionStorage.getItem(key);
    if (!raw) return;
    var data = JSON.parse(raw);
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
  } catch (_e) {
    // sessionStorage unavailable or corrupt
  }
}

export function getGalleryBaseUrl() {
  var i5 = document.getElementById('i5');
  if (!i5) return '';
  var link = i5.querySelector('a[href*="/g/"]');
  return link ? link.href : '';
}

var galleryItemsPerPage = GALLERY_ITEMS_PER_PAGE;

export function fetchGalleryPageUrls(galleryBaseUrl, targetPage) {
  var pageIndex = Math.floor((targetPage - 1) / galleryItemsPerPage);
  var url = pageIndex > 0 ? galleryBaseUrl + '?p=' + pageIndex : galleryBaseUrl;

  return fetch(url, { credentials: 'include', cache: 'force-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('gallery fetch failed: ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var gdt = doc.getElementById('gdt');
      if (!gdt) return;

      var links = gdt.querySelectorAll('a[href*="/s/"]');
      var count = 0;
      for (var i = 0; i < links.length; i += 1) {
        var href = links[i].href;
        var page = parseInt(getViewerPageFromUrl(href), 10);
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
    var key = getStorageKey();
    if (key) sessionStorage.removeItem(key);
  } catch (_e) {
    // sessionStorage unavailable
  }
}
