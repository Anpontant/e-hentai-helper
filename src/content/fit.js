import { settings } from './state.js';
import { getMainImage } from './navigation.js';

function getHeadOrRoot() {
  return document.head || document.documentElement;
}

export function updateFitStyle() {
  var parent = getHeadOrRoot();
  if (!parent) return;

  var styleEl = document.getElementById('eh-helper-fit-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'eh-helper-fit-style';
    parent.appendChild(styleEl);
  }

  var mode = settings.value.fitMode;

  if (mode === 'height') {
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

  if (mode === 'width') {
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

export function applyImageFit() {
  var img = getMainImage();
  updateFitStyle();
  if (!img) return;

  var mode = settings.value.fitMode;
  img.style.setProperty('object-fit', 'contain', 'important');

  if (mode === 'height') {
    img.style.setProperty('max-height', '100vh', 'important');
    img.style.setProperty('max-width', 'none', 'important');
    img.style.setProperty('width', 'auto', 'important');
    img.style.setProperty('height', 'auto', 'important');
    return;
  }

  if (mode === 'width') {
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

export function applySpreadFit(isSingle) {
  var parent = getHeadOrRoot();
  if (!parent) return;

  var styleEl = document.getElementById('eh-helper-spread-fit-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'eh-helper-spread-fit-style';
    parent.appendChild(styleEl);
  }

  var mode = settings.value.fitMode;
  var maxW = isSingle ? '100vw' : '50vw';

  if (mode === 'height') {
    styleEl.textContent = [
      '#eh-helper-spread-left, #eh-helper-spread-right {',
      'max-height: 100vh !important;',
      'max-width: ' + maxW + ' !important;',
      'width: auto !important;',
      'height: auto !important;',
      'object-fit: contain !important;',
      '}'
    ].join('\n');
    return;
  }

  if (mode === 'width') {
    styleEl.textContent = [
      '#eh-helper-spread-left, #eh-helper-spread-right {',
      'max-width: ' + maxW + ' !important;',
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

export function removeSpreadFitStyle() {
  var fitStyle = document.getElementById('eh-helper-spread-fit-style');
  if (fitStyle && fitStyle.parentNode) fitStyle.parentNode.removeChild(fitStyle);
}
