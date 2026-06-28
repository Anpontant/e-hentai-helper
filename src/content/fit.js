import { settings } from './state.js';
import { getMainImage } from './navigation.js';

function getHeadOrRoot() {
  return document.head || document.documentElement;
}

function getFitProperties(mode) {
  if (mode === 'height') {
    return { maxHeight: '100vh', maxWidth: 'none', objectFit: 'contain' };
  }
  if (mode === 'width') {
    return { maxHeight: 'none', maxWidth: '100vw', objectFit: 'contain' };
  }
  return { maxHeight: 'none', maxWidth: 'none', objectFit: 'fill' };
}

function buildFitCss(selector, props) {
  return [
    selector + ' {',
    'max-height: ' + props.maxHeight + ' !important;',
    'max-width: ' + props.maxWidth + ' !important;',
    'width: auto !important;',
    'height: auto !important;',
    'object-fit: ' + props.objectFit + ' !important;',
    '}'
  ].join('\n');
}

function ensureStyleElement(id) {
  var parent = getHeadOrRoot();
  if (!parent) return null;

  var styleEl = document.getElementById(id);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    parent.appendChild(styleEl);
  }
  return styleEl;
}

export function updateFitStyle() {
  var styleEl = ensureStyleElement('eh-helper-fit-style');
  if (!styleEl) return;

  var props = getFitProperties(settings.value.fitMode);
  styleEl.textContent = buildFitCss('#img', props);
}

export function applyImageFit() {
  var img = getMainImage();
  updateFitStyle();
  if (!img) return;

  var props = getFitProperties(settings.value.fitMode);
  img.style.setProperty('max-height', props.maxHeight, 'important');
  img.style.setProperty('max-width', props.maxWidth, 'important');
  img.style.setProperty('width', 'auto', 'important');
  img.style.setProperty('height', 'auto', 'important');
  img.style.setProperty('object-fit', props.objectFit, 'important');
}

export function applySpreadFit(isSingle) {
  var styleEl = ensureStyleElement('eh-helper-spread-fit-style');
  if (!styleEl) return;

  var props = getFitProperties(settings.value.fitMode);
  if (props.maxWidth !== 'none') {
    props = { ...props, maxWidth: isSingle ? '100vw' : '50vw' };
  }
  styleEl.textContent = buildFitCss('#eh-helper-spread-left, #eh-helper-spread-right', props);
}

export function removeSpreadFitStyle() {
  var fitStyle = document.getElementById('eh-helper-spread-fit-style');
  if (fitStyle && fitStyle.parentNode) fitStyle.parentNode.removeChild(fitStyle);
}
