(function () {
  'use strict';

  var utils = (typeof self !== 'undefined' ? self : window).EHHelperUtils;
  var normalizeUrl = utils.normalizeUrl;
  var isViewerUrl = utils.isViewerUrl;
  var getViewerPageFromUrl = utils.getViewerPageFromUrl;
  var parsePagePair = utils.parsePagePair;
  var getUrlTail = utils.getUrlTail;
  var formatDuration = utils.formatDuration;
  var getSpreadPageInfo = utils.getSpreadPageInfo;

  var LOG = true;
  var SCROLL_OFFSET = 0;
  var PRELOAD_DELAY_MS = 500;
  var CHANGE_DEBOUNCE_MS = 250;
  var DEFAULT_SETTINGS = {
    preloadAheadCount: 2,
    fitMode: 'height',
    showStatus: true,
    autoScroll: true,
    overlayView: false,
    spreadView: false,
    spreadCoverAlone: true,
    showPreloadThumbs: false
  };

  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var lastHandledKey = '';
  var lastPreloadRootKey = '';
  var changeTimer = 0;
  var preloadState = {};
  var preloadRunId = 0;
  var preloadedImages = [];
  var viewerDocCache = new Map();
  var preloadAbortController = null;
  var lastStatusText = '';
  var observer = null;
  var observerTargetSignature = '';
  var spreadRenderRunId = 0;
  var pageUrlMap = {};
  var pageImageMap = {};
  var menuOpen = false;
  var lastSpreadActive = false;

  function log() {
    if (!LOG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[EH helper]');
    console.log.apply(console, args);
  }

  function loadSettings() {
    return browser.storage.local.get(DEFAULT_SETTINGS).then(function (stored) {
      settings = utils.normalizeSettings(stored, DEFAULT_SETTINGS);
      updateFitStyle();
      applyImageFit();
      updateStatusVisibility();
      updateSpreadVisibility();
      updatePreloadThumbsVisibility();
      lastStatusText = '';
      lastPreloadRootKey = '';
      schedulePreloadAfterCurrentImage();
      renderMenuState();
    });
  }

  function showStatus(text) {
    if (!settings.showStatus) return;
    showStatusLines([text]);
  }

  function showStatusLines(lines) {
    if (!settings.showStatus) return;
    var allLines = (lines || []).concat([getProgressLabel()]);
    var nextStatusText = allLines.join('\n');
    if (nextStatusText === lastStatusText) return;
    lastStatusText = nextStatusText;

    var statusEl = getStatusElement();
    statusEl.textContent = '';

    for (var i = 0; i < allLines.length; i += 1) {
      var line = document.createElement('div');
      line.className =
        i === allLines.length - 1 ? 'eh-helper-status-progress' : 'eh-helper-status-line';
      line.textContent = allLines[i];
      statusEl.appendChild(line);
    }
  }

  function getStatusElement() {
    var el = document.getElementById('eh-helper-status');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-status';
    document.documentElement.appendChild(el);
    return el;
  }

  function updateStatusVisibility() {
    var el = document.getElementById('eh-helper-status');
    if (!el) return;
    el.style.display = settings.showStatus ? '' : 'none';
    if (!settings.showStatus) lastStatusText = '';
  }

  function getHeadOrRoot() {
    return document.head || document.documentElement;
  }

  function updateFitStyle() {
    var parent = getHeadOrRoot();
    if (!parent) return;

    var styleEl = document.getElementById('eh-helper-fit-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'eh-helper-fit-style';
      parent.appendChild(styleEl);
    }

    if (settings.fitMode === 'height') {
      styleEl.textContent = [
        '#img {',
        'max-height: 100vh !important;',
        'max-width: none !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    if (settings.fitMode === 'width') {
      styleEl.textContent = [
        '#img {',
        'max-width: 100vw !important;',
        'max-height: none !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    styleEl.textContent = [
      '#img {',
      'max-height: none !important;',
      'max-width: none !important;',
      'width: auto !important;',
      'height: auto !important;',
      'object-fit: fill !important;',
      '}'
    ].join('\n');
  }

  function getMainImage() {
    return document.getElementById('img');
  }

  function applyImageFit() {
    var img = getMainImage();
    updateFitStyle();
    if (!img) return;

    img.style.setProperty('object-fit', 'contain', 'important');

    if (settings.fitMode === 'height') {
      img.style.setProperty('max-height', '100vh', 'important');
      img.style.setProperty('max-width', 'none', 'important');
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      return;
    }

    if (settings.fitMode === 'width') {
      img.style.setProperty('max-width', '100vw', 'important');
      img.style.setProperty('max-height', 'none', 'important');
      img.style.setProperty('width', 'auto', 'important');
      img.style.setProperty('height', 'auto', 'important');
      return;
    }

    img.style.setProperty('max-height', 'none', 'important');
    img.style.setProperty('max-width', 'none', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    img.style.setProperty('object-fit', 'fill', 'important');
  }

  function getPageTextMatch() {
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

  function getTotalPageLabel() {
    var pageText = getPageTextMatch();
    var total = pageText ? pageText.total : '';
    var current = parseInt(
      getViewerPageFromUrl(location.href) || (pageText ? pageText.current : ''),
      10
    );

    if (total && (!current || parseInt(total, 10) >= current)) return total;
    return '?';
  }

  function getProgressLabel() {
    var current = getViewerPageFromUrl(location.href);
    var total = getTotalPageLabel();
    if (!current) {
      var pageText = getPageTextMatch();
      current = pageText ? pageText.current : '?';
    }
    return 'Page ' + current + '/' + total;
  }

  function getCurrentKey() {
    var img = getMainImage();
    return normalizeUrl(location.href) + '|' + (img ? img.src : '');
  }

  function getNextPageUrlFromDocument(doc, docUrl) {
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

  function getNextPageUrl() {
    return getNextPageUrlFromDocument(document, location.href);
  }

  function scrollToImage(retryCount) {
    if (isOverlayActive()) return;
    retryCount = retryCount || 0;
    var img = getMainImage();
    if (!img) {
      if (retryCount < 20) {
        window.setTimeout(function () {
          scrollToImage(retryCount + 1);
        }, 100);
        return;
      }
      showStatus('EH: image not found');
      return;
    }

    function scrollNow() {
      applyImageFit();
      if (settings.autoScroll) {
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

  function getSpreadOverlay() {
    var el = document.getElementById('eh-helper-spread-overlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-spread-overlay';

    var closeBtn = document.createElement('button');
    closeBtn.id = 'eh-helper-spread-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      exitOverlay();
    });

    var leftImg = document.createElement('img');
    leftImg.id = 'eh-helper-spread-left';

    var rightImg = document.createElement('img');
    rightImg.id = 'eh-helper-spread-right';

    el.appendChild(closeBtn);
    el.appendChild(leftImg);
    el.appendChild(rightImg);

    el.addEventListener('click', function (event) {
      if (event.target === closeBtn) return;
      event.preventDefault();
      event.stopPropagation();
      advanceSpread();
    });

    document.documentElement.appendChild(el);
    return el;
  }

  function isOverlayActive() {
    return settings.overlayView || settings.spreadView;
  }

  function exitOverlay() {
    settings.overlayView = false;
    settings.spreadView = false;
    browser.storage.local.set({ overlayView: false, spreadView: false });
    removeSpreadOverlay();
    applyImageFit();
    scrollToImage();
  }

  function removeSpreadOverlay() {
    var el = document.getElementById('eh-helper-spread-overlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    spreadRenderRunId += 1;
    pageUrlMap = {};
    pageImageMap = {};

    var fitStyle = document.getElementById('eh-helper-spread-fit-style');
    if (fitStyle && fitStyle.parentNode) fitStyle.parentNode.removeChild(fitStyle);
  }

  function updateSpreadVisibility() {
    if (isOverlayActive()) {
      var skipSnap = lastSpreadActive && settings.spreadView;
      renderSpread(skipSnap);
      lastSpreadActive = settings.spreadView;
    } else {
      removeSpreadOverlay();
      lastSpreadActive = false;
    }
  }

  function applySpreadFit() {
    var overlay = document.getElementById('eh-helper-spread-overlay');
    if (!overlay) return;

    var parent = getHeadOrRoot();
    if (!parent) return;

    var styleEl = document.getElementById('eh-helper-spread-fit-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'eh-helper-spread-fit-style';
      parent.appendChild(styleEl);
    }

    var isSingle = overlay.classList.contains('eh-spread-single');

    if (settings.fitMode === 'height') {
      styleEl.textContent = [
        '#eh-helper-spread-left, #eh-helper-spread-right {',
        'max-height: 100vh !important;',
        'max-width: ' + (isSingle ? '100vw' : '50vw') + ' !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    if (settings.fitMode === 'width') {
      styleEl.textContent = [
        '#eh-helper-spread-left, #eh-helper-spread-right {',
        'max-width: ' + (isSingle ? '100vw' : '50vw') + ' !important;',
        'max-height: none !important;',
        'width: auto !important;',
        'height: auto !important;',
        'object-fit: contain !important;',
        '}'
      ].join('\n');
      return;
    }

    styleEl.textContent = [
      '#eh-helper-spread-left, #eh-helper-spread-right {',
      'max-height: none !important;',
      'max-width: none !important;',
      'width: auto !important;',
      'height: auto !important;',
      'object-fit: fill !important;',
      '}'
    ].join('\n');
  }

  function loadPartnerImage(imgElement, partnerPage, runId) {
    var cachedImage = pageImageMap[partnerPage];
    if (cachedImage) {
      imgElement.src = cachedImage;
      return;
    }

    var partnerUrl = pageUrlMap[partnerPage] || getNextPageUrl();
    if (!partnerUrl) {
      imgElement.removeAttribute('src');
      return;
    }

    pageUrlMap[partnerPage] = partnerUrl;

    fetchViewerDocument(
      partnerUrl,
      preloadAbortController ? preloadAbortController.signal : undefined
    )
      .then(function (doc) {
        if (runId !== spreadRenderRunId) return;
        var imageUrl = getImageUrlFromDocument(doc, partnerUrl);
        if (imageUrl) {
          pageImageMap[partnerPage] = imageUrl;
          imgElement.src = imageUrl;
        }
        var followingUrl = getNextPageUrlFromDocument(doc, partnerUrl);
        if (followingUrl) {
          var followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
          if (followingPage) pageUrlMap[followingPage] = followingUrl;
        }
      })
      .catch(function () {
        if (runId !== spreadRenderRunId) return;
        log('spread: partner image load failed');
        imgElement.removeAttribute('src');
      });
  }

  function renderSpread(skipSnap) {
    if (!isOverlayActive()) return;

    var mainImg = getMainImage();
    if (!mainImg) return;

    var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
    var totalStr = getTotalPageLabel();
    var total = parseInt(totalStr, 10) || 0;
    var useSpread = settings.spreadView;
    var info = useSpread
      ? getSpreadPageInfo(currentPage, total, settings.spreadCoverAlone)
      : { partnerPage: null, pagesInSpread: 1, isRightPage: true };

    if (!info.isRightPage) {
      if (skipSnap) {
        info = { partnerPage: null, pagesInSpread: 1, isRightPage: true };
      } else {
        var snapUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
        if (snapUrl) location.href = snapUrl;
        return;
      }
    }

    pageUrlMap[currentPage] = location.href;
    if (mainImg.src) pageImageMap[currentPage] = mainImg.src;

    spreadRenderRunId += 1;
    var runId = spreadRenderRunId;

    var overlay = getSpreadOverlay();
    var rightImg = document.getElementById('eh-helper-spread-right');
    var leftImg = document.getElementById('eh-helper-spread-left');

    rightImg.src = mainImg.src || '';

    if (!mainImg.complete) {
      mainImg.addEventListener(
        'load',
        function () {
          if (runId !== spreadRenderRunId) return;
          rightImg.src = mainImg.src || '';
          if (mainImg.src) pageImageMap[currentPage] = mainImg.src;
        },
        { once: true }
      );
    }

    if (info.partnerPage) {
      overlay.classList.remove('eh-spread-single');
      loadPartnerImage(leftImg, info.partnerPage, runId);
    } else {
      overlay.classList.add('eh-spread-single');
      leftImg.removeAttribute('src');
    }

    applySpreadFit();
  }

  function advanceSpread() {
    var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
    var totalStr = getTotalPageLabel();
    var total = parseInt(totalStr, 10) || 0;
    var info = settings.spreadView
      ? getSpreadPageInfo(currentPage, total, settings.spreadCoverAlone)
      : { partnerPage: null, pagesInSpread: 1, isRightPage: true };
    var targetPage = currentPage + info.pagesInSpread;

    var mapped = pageUrlMap[targetPage];
    if (mapped) {
      location.href = mapped;
      return;
    }

    if (info.pagesInSpread === 1) {
      var nextUrl = getNextPageUrl();
      if (nextUrl) location.href = nextUrl;
      return;
    }

    var partnerUrl = pageUrlMap[currentPage + 1] || getNextPageUrl();
    if (!partnerUrl) return;

    var cached = viewerDocCache.get(partnerUrl);
    if (cached) {
      var target = getNextPageUrlFromDocument(cached, partnerUrl);
      if (target) {
        location.href = target;
      } else {
        location.href = partnerUrl;
      }
      return;
    }

    fetchViewerDocument(partnerUrl)
      .then(function (doc) {
        var target = getNextPageUrlFromDocument(doc, partnerUrl);
        location.href = target || partnerUrl;
      })
      .catch(function () {
        location.href = partnerUrl;
      });
  }

  function getPreloadThumbsPanel() {
    var el = document.getElementById('eh-helper-preload-thumbs');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-preload-thumbs';
    document.documentElement.appendChild(el);
    return el;
  }

  function updatePreloadThumbs() {
    if (!settings.showPreloadThumbs) return;

    var panel = getPreloadThumbsPanel();
    panel.textContent = '';

    for (var i = 0; i < preloadedImages.length; i += 1) {
      if (!preloadedImages[i].src) continue;
      var thumb = document.createElement('img');
      thumb.src = preloadedImages[i].src;
      panel.appendChild(thumb);
    }
  }

  function updatePreloadThumbsVisibility() {
    var el = document.getElementById('eh-helper-preload-thumbs');
    if (!el && !settings.showPreloadThumbs) return;
    if (!el && settings.showPreloadThumbs) {
      getPreloadThumbsPanel();
      updatePreloadThumbs();
      return;
    }
    el.style.display = settings.showPreloadThumbs ? '' : 'none';
  }

  function clearPreloadThumbs() {
    var el = document.getElementById('eh-helper-preload-thumbs');
    if (el) el.textContent = '';
  }

  function msg(key) {
    return browser.i18n.getMessage(key) || key;
  }

  function createMenuSection(labelText) {
    var section = document.createElement('div');
    section.className = 'eh-menu-section';
    var label = document.createElement('div');
    label.className = 'eh-menu-label';
    label.textContent = labelText;
    section.appendChild(label);
    return section;
  }

  function createMenuSegmented(settingName, options) {
    var seg = document.createElement('div');
    seg.className = 'eh-menu-seg';
    seg.setAttribute('data-setting', settingName);

    for (var i = 0; i < options.length; i += 1) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-value', options[i].value);
      btn.textContent = options[i].label;
      seg.appendChild(btn);
    }

    seg.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('button') : null;
      if (!button) return;
      var value = button.getAttribute('data-value');
      var patch = {};
      patch[settingName] = settingName === 'preloadAheadCount' ? parseInt(value, 10) : value;
      saveMenuPatch(patch);
    });

    return seg;
  }

  function createMenuCheckbox(id, settingName, labelText) {
    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    var span = document.createElement('span');
    span.textContent = labelText;
    label.appendChild(input);
    label.appendChild(span);

    input.addEventListener('change', function () {
      var patch = {};
      patch[settingName] = Boolean(input.checked);
      saveMenuPatch(patch);
    });

    return label;
  }

  function saveMenuPatch(patch) {
    browser.storage.local.set(patch).then(function () {
      return loadSettings();
    });
  }

  function setMenuCheckbox(id, value) {
    var el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  }

  function updateMenuSegmented(panel, setting, value) {
    var seg = panel.querySelector('[data-setting="' + setting + '"]');
    if (!seg) return;
    var buttons = seg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute('data-value') === String(value)) {
        buttons[i].classList.add('active');
      } else {
        buttons[i].classList.remove('active');
      }
    }
  }

  function renderMenuState() {
    var panel = document.getElementById('eh-helper-menu-panel');
    if (!panel) return;

    updateMenuSegmented(panel, 'preloadAheadCount', settings.preloadAheadCount);
    updateMenuSegmented(panel, 'fitMode', settings.fitMode);

    setMenuCheckbox('eh-menu-overlayView', settings.overlayView);
    setMenuCheckbox('eh-menu-spreadView', settings.spreadView);
    setMenuCheckbox('eh-menu-spreadCoverAlone', settings.spreadCoverAlone);
    setMenuCheckbox('eh-menu-autoScroll', settings.autoScroll);
    setMenuCheckbox('eh-menu-showStatus', settings.showStatus);
    setMenuCheckbox('eh-menu-showPreloadThumbs', settings.showPreloadThumbs);
  }

  function getMenuPanel() {
    var el = document.getElementById('eh-helper-menu-panel');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'eh-helper-menu-panel';

    var preloadSection = createMenuSection(msg('popupPreload'));
    preloadSection.appendChild(
      createMenuSegmented('preloadAheadCount', [
        { value: '0', label: msg('popupOff') },
        { value: '1', label: '+1' },
        { value: '2', label: '+2' },
        { value: '3', label: '+3' }
      ])
    );
    el.appendChild(preloadSection);

    var fitSection = createMenuSection(msg('popupFit'));
    fitSection.appendChild(
      createMenuSegmented('fitMode', [
        { value: 'height', label: msg('popupHeight') },
        { value: 'width', label: msg('popupWidth') },
        { value: 'original', label: '1:1' }
      ])
    );
    el.appendChild(fitSection);

    var overlaySection = createMenuSection(msg('popupOverlay'));
    overlaySection.appendChild(
      createMenuCheckbox('eh-menu-overlayView', 'overlayView', msg('popupOverlayView'))
    );
    overlaySection.appendChild(
      createMenuCheckbox('eh-menu-spreadView', 'spreadView', msg('popupSpreadView'))
    );
    overlaySection.appendChild(
      createMenuCheckbox(
        'eh-menu-spreadCoverAlone',
        'spreadCoverAlone',
        msg('popupSpreadCoverAlone')
      )
    );
    el.appendChild(overlaySection);

    var checks = document.createElement('div');
    checks.className = 'eh-menu-checks';
    checks.appendChild(
      createMenuCheckbox('eh-menu-autoScroll', 'autoScroll', msg('popupAutoScroll'))
    );
    checks.appendChild(createMenuCheckbox('eh-menu-showStatus', 'showStatus', msg('popupStatus')));
    checks.appendChild(
      createMenuCheckbox(
        'eh-menu-showPreloadThumbs',
        'showPreloadThumbs',
        msg('popupPreloadThumbs')
      )
    );
    el.appendChild(checks);

    var actions = document.createElement('div');
    actions.className = 'eh-menu-actions';
    var scrollBtn = document.createElement('button');
    scrollBtn.type = 'button';
    scrollBtn.textContent = msg('popupScroll');
    scrollBtn.addEventListener('click', function () {
      scrollToImage();
    });
    actions.appendChild(scrollBtn);
    var fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.textContent = msg('popupFullscreen');
    fsBtn.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    actions.appendChild(fsBtn);
    el.appendChild(actions);

    document.documentElement.appendChild(el);
    return el;
  }

  function getMenuButton() {
    var el = document.getElementById('eh-helper-menu-btn');
    if (el) return el;

    el = document.createElement('button');
    el.id = 'eh-helper-menu-btn';
    el.type = 'button';
    el.textContent = '☰';
    el.setAttribute('aria-label', msg('menuSettingsLabel'));
    el.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function toggleMenu() {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function openMenu() {
    getMenuPanel();
    renderMenuState();
    menuOpen = true;
    var btn = document.getElementById('eh-helper-menu-btn');
    var panel = document.getElementById('eh-helper-menu-panel');
    if (btn) btn.classList.add('eh-menu-open');
    if (panel) panel.style.display = 'grid';
  }

  function closeMenu() {
    menuOpen = false;
    var btn = document.getElementById('eh-helper-menu-btn');
    var panel = document.getElementById('eh-helper-menu-panel');
    if (btn) btn.classList.remove('eh-menu-open');
    if (panel) panel.style.display = 'none';
  }

  function removeOldPreloadFrames() {
    var frames = document.querySelectorAll('.eh-helper-preload-frame');
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].parentNode) frames[i].parentNode.removeChild(frames[i]);
    }
    preloadedImages = [];
    clearPreloadThumbs();
  }

  function pruneViewerDocCache() {
    while (viewerDocCache.size > 12) {
      var firstKey = viewerDocCache.keys().next().value;
      viewerDocCache.delete(firstKey);
    }
  }

  function abortActivePreload() {
    if (preloadAbortController) {
      preloadAbortController.abort();
      preloadAbortController = null;
    }
    preloadRunId += 1;
  }

  function updatePreloadStatus() {
    var parts = [];
    for (var i = 1; i <= settings.preloadAheadCount; i += 1) {
      var item = preloadState[i];
      if (!item) continue;

      if (item.status === 'loading') {
        parts.push('EH: +' + i + ' loading p.' + item.page);
      } else if (item.status === 'loaded') {
        parts.push(
          'EH: +' +
            i +
            ' loaded p.' +
            item.page +
            ' ' +
            formatDuration(item.duration) +
            ' ' +
            item.method
        );
      } else if (item.status === 'failed') {
        parts.push('EH: +' + i + ' failed p.' + item.page);
      }
    }

    if (parts.length) showStatusLines(parts);
    if (settings.showPreloadThumbs) updatePreloadThumbs();
  }

  function setPreloadState(depth, patch) {
    preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
    if (settings.showStatus) updatePreloadStatus();
  }

  function getImageUrlFromDocument(doc, docUrl) {
    var img = doc.getElementById('img');
    if (!img) return '';

    var src = img.getAttribute('src') || img.src || '';
    if (!src) return '';

    try {
      return new URL(src, docUrl).href;
    } catch (error) {
      log('cannot resolve image url:', error);
      return src;
    }
  }

  function getPageLabelFromDocument(doc, fallbackUrl) {
    var pageNode = doc.querySelector('.sn');
    var parsed = parsePagePair(pageNode ? pageNode.textContent : '');
    return parsed ? parsed.current : getViewerPageFromUrl(fallbackUrl) || getUrlTail(fallbackUrl);
  }

  function fetchViewerDocument(pageUrl, signal) {
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

  function preloadImage(imageUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var timeout = window.setTimeout(function () {
        reject(new Error('image preload timeout'));
      }, 5000);

      image.onload = function () {
        window.clearTimeout(timeout);
        resolve();
      };
      image.onerror = function () {
        window.clearTimeout(timeout);
        reject(new Error('image preload failed'));
      };
      image.decoding = 'async';
      image.src = imageUrl;
      preloadedImages.push(image);
    });
  }

  function preloadByHiddenFrame(nextUrl, depth, startedAt, runId) {
    return new Promise(function (resolve) {
      if (runId !== preloadRunId) {
        resolve('');
        return;
      }

      setPreloadState(depth, {
        status: 'loading',
        page: getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl),
        duration: 0,
        url: nextUrl,
        method: 'iframe'
      });

      var frameEl = document.createElement('iframe');
      frameEl.className = 'eh-helper-preload-frame';
      frameEl.id = 'eh-helper-preload-frame-' + depth;
      frameEl.src = nextUrl;
      frameEl.setAttribute('loading', 'eager');
      frameEl.setAttribute('referrerpolicy', 'same-origin');

      frameEl.addEventListener(
        'load',
        function () {
          var followingUrl = '';
          if (runId !== preloadRunId) {
            frameEl.remove();
            resolve('');
            return;
          }

          try {
            var frameDoc = frameEl.contentDocument || frameEl.contentWindow.document;
            var page = getPageLabelFromDocument(frameDoc, nextUrl);
            followingUrl = getNextPageUrlFromDocument(frameDoc, nextUrl);
            setPreloadState(depth, {
              status: 'loaded',
              page: page,
              duration: Date.now() - startedAt,
              method: 'iframe'
            });
          } catch (error) {
            log('cannot read hidden frame document:', error);
            setPreloadState(depth, {
              status: 'failed',
              duration: Date.now() - startedAt,
              method: 'iframe'
            });
          }

          frameEl.remove();
          resolve(followingUrl);
        },
        { once: true }
      );

      frameEl.addEventListener(
        'error',
        function () {
          if (runId === preloadRunId) {
            setPreloadState(depth, {
              status: 'failed',
              duration: Date.now() - startedAt,
              method: 'iframe'
            });
          }
          frameEl.remove();
          resolve('');
        },
        { once: true }
      );

      document.documentElement.appendChild(frameEl);
    });
  }

  function preloadAheadFrom(nextUrl, depth) {
    if (!nextUrl || depth > settings.preloadAheadCount) return;

    var runId = preloadRunId;
    var startedAt = Date.now();
    var pageNum = parseInt(getViewerPageFromUrl(nextUrl), 10);
    if (pageNum) pageUrlMap[pageNum] = nextUrl;

    setPreloadState(depth, {
      status: 'loading',
      page: getViewerPageFromUrl(nextUrl) || getUrlTail(nextUrl),
      duration: 0,
      url: nextUrl,
      method: 'fetch'
    });

    fetchViewerDocument(nextUrl, preloadAbortController ? preloadAbortController.signal : undefined)
      .then(function (doc) {
        if (runId !== preloadRunId) return '';

        var page = getPageLabelFromDocument(doc, nextUrl);
        var imageUrl = getImageUrlFromDocument(doc, nextUrl);
        var followingUrl = getNextPageUrlFromDocument(doc, nextUrl);

        if (!imageUrl) throw new Error('next image url not found');

        if (pageNum) pageImageMap[pageNum] = imageUrl;
        if (followingUrl) {
          var followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
          if (followingPage) pageUrlMap[followingPage] = followingUrl;
        }

        return preloadImage(imageUrl).then(function () {
          if (runId !== preloadRunId) return '';
          setPreloadState(depth, {
            status: 'loaded',
            page: page,
            duration: Date.now() - startedAt,
            method: 'img'
          });
          return followingUrl;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return '';
        log('fetch/image preload failed, falling back to iframe:', error);
        return preloadByHiddenFrame(nextUrl, depth, startedAt, runId);
      })
      .then(function (followingUrl) {
        if (runId !== preloadRunId) return;
        if (!followingUrl || normalizeUrl(followingUrl) === normalizeUrl(nextUrl)) return;
        preloadAheadFrom(followingUrl, depth + 1);
      });
  }

  function preloadNext() {
    if (settings.preloadAheadCount <= 0) {
      abortActivePreload();
      removeOldPreloadFrames();
      preloadState = {};
      showStatus('EH: preload off');
      return;
    }

    var rootKey = getCurrentKey();
    if (rootKey === lastPreloadRootKey) return;
    lastPreloadRootKey = rootKey;
    abortActivePreload();
    preloadAbortController = new AbortController();
    removeOldPreloadFrames();
    preloadState = {};

    var nextUrl = getNextPageUrl();
    if (!nextUrl) {
      showStatus('EH: next not found');
      return;
    }

    if (isOverlayActive()) {
      var currentPage = parseInt(getViewerPageFromUrl(location.href), 10) || 0;
      var totalStr = getTotalPageLabel();
      var total = parseInt(totalStr, 10) || 0;
      var info = settings.spreadView
        ? getSpreadPageInfo(currentPage, total, settings.spreadCoverAlone)
        : { pagesInSpread: 1 };
      var afterSpreadPage = currentPage + info.pagesInSpread + 1;
      var afterSpreadUrl = pageUrlMap[afterSpreadPage];
      if (afterSpreadUrl) {
        preloadAheadFrom(afterSpreadUrl, 1);
        return;
      }

      var cachedDoc = viewerDocCache.get(nextUrl);
      if (cachedDoc) {
        var afterPartner = getNextPageUrlFromDocument(cachedDoc, nextUrl);
        if (afterPartner) {
          preloadAheadFrom(afterPartner, 1);
        }
        return;
      }
    }

    preloadAheadFrom(nextUrl, 1);
  }

  function schedulePreloadAfterCurrentImage() {
    var img = getMainImage();
    if (!img || img.complete) {
      window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
      return;
    }

    img.addEventListener(
      'load',
      function () {
        window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
      },
      { once: true }
    );
  }

  function handlePageStateChange(reason) {
    clearTimeout(changeTimer);
    changeTimer = window.setTimeout(function () {
      var key = getCurrentKey();
      if (key === lastHandledKey) return;
      lastHandledKey = key;

      log('handling page state:', reason, key);
      scrollToImage();
      schedulePreloadAfterCurrentImage();
      if (isOverlayActive()) renderSpread();
    }, CHANGE_DEBOUNCE_MS);
  }

  function patchHistoryMethod(name) {
    var original = history[name];
    if (typeof original !== 'function') return;

    history[name] = function () {
      var result = original.apply(this, arguments);
      handlePageStateChange(name);
      return result;
    };
  }

  function observeImageAndDomChanges() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === 'childList' || mutations[i].type === 'attributes') {
          if (observerTargetSignature === 'bootstrap') {
            window.setTimeout(observeImageAndDomChanges, 0);
          }
          handlePageStateChange('mutation');
          return;
        }
      }
    });

    var targets = [];
    var img = getMainImage();
    if (img) targets.push(img);
    var imageContainer = document.getElementById('i3');
    if (imageContainer) targets.push(imageContainer);
    var pageContainer = document.getElementById('i1');
    if (pageContainer) targets.push(pageContainer);

    if (!targets.length) {
      var bootstrapTarget = document.body || document.documentElement;
      if (!bootstrapTarget) return;
      observerTargetSignature = 'bootstrap';
      observer.observe(bootstrapTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href']
      });
      return;
    }

    observerTargetSignature = targets
      .map(function (target) {
        return target.id || target.tagName;
      })
      .join('|');

    for (var i = 0; i < targets.length; i += 1) {
      observer.observe(targets[i], {
        childList: true,
        subtree: targets[i].id !== 'img',
        attributes: true,
        attributeFilter: ['src', 'href']
      });
    }
  }

  function setupMessageHandlers() {
    browser.runtime.onMessage.addListener(function (message) {
      if (!message || message.target !== 'eh-helper-content') return undefined;

      if (message.type === 'reload-settings') {
        loadSettings();
        return Promise.resolve({ ok: true });
      }

      if (message.type === 'scroll-to-image') {
        scrollToImage();
        return Promise.resolve({ ok: true });
      }

      if (message.type === 'toggle-fullscreen') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        return Promise.resolve({ ok: true });
      }

      return undefined;
    });
  }

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');
  window.addEventListener('popstate', function () {
    handlePageStateChange('popstate');
  });
  window.addEventListener('hashchange', function () {
    handlePageStateChange('hashchange');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !document.fullscreenElement) {
      if (menuOpen) {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (isOverlayActive()) {
        event.preventDefault();
        exitOverlay();
      }
    }
  });

  document.addEventListener(
    'click',
    function (event) {
      if (!menuOpen) return;
      var btn = document.getElementById('eh-helper-menu-btn');
      var panel = document.getElementById('eh-helper-menu-panel');
      if (btn && btn.contains(event.target)) return;
      if (panel && panel.contains(event.target)) return;
      closeMenu();
    },
    true
  );

  setupMessageHandlers();
  updateFitStyle();
  getMenuButton();

  if (document.documentElement) {
    observeImageAndDomChanges();
  } else {
    document.addEventListener('DOMContentLoaded', observeImageAndDomChanges, { once: true });
  }

  loadSettings().then(function () {
    handlePageStateChange('initial');
  });
})();
