import type { FitMode } from '../shared/types.js';
import { settings } from './state.js';
import { getMainImage } from './navigation.js';

function getHeadOrRoot() {
  return document.head || document.documentElement;
}

interface FitProperties {
  maxHeight: string;
  maxWidth: string;
  objectFit: string;
}

function getFitProperties(mode: FitMode): FitProperties {
  if (mode === 'height') {
    return { maxHeight: '100vh', maxWidth: 'none', objectFit: 'contain' };
  }
  if (mode === 'width') {
    return { maxHeight: 'none', maxWidth: '100vw', objectFit: 'contain' };
  }
  return { maxHeight: 'none', maxWidth: 'none', objectFit: 'fill' };
}

function buildFitCss(selector: string, props: FitProperties) {
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

function ensureStyleElement(id: string) {
  const parent = getHeadOrRoot();
  if (!parent) return null;

  let styleEl = document.getElementById(id);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    parent.appendChild(styleEl);
  }
  return styleEl;
}

export function updateFitStyle() {
  const styleEl = ensureStyleElement('eh-helper-fit-style');
  if (!styleEl) return;

  const props = getFitProperties(settings.value.fitMode);
  styleEl.textContent = buildFitCss('#img', props);
}

export function applyImageFit() {
  const img = getMainImage();
  updateFitStyle();
  if (!img) return;

  const props = getFitProperties(settings.value.fitMode);
  img.style.setProperty('max-height', props.maxHeight, 'important');
  img.style.setProperty('max-width', props.maxWidth, 'important');
  img.style.setProperty('width', 'auto', 'important');
  img.style.setProperty('height', 'auto', 'important');
  img.style.setProperty('object-fit', props.objectFit, 'important');
}

export function applySpreadFit(isSingle: boolean) {
  const styleEl = ensureStyleElement('eh-helper-spread-fit-style');
  if (!styleEl) return;

  let props = getFitProperties(settings.value.fitMode);
  if (props.maxWidth !== 'none') {
    props = { ...props, maxWidth: isSingle ? '100vw' : '50vw' };
  }
  styleEl.textContent = buildFitCss('#eh-helper-spread-left, #eh-helper-spread-right', props);
}

export function removeSpreadFitStyle() {
  const fitStyle = document.getElementById('eh-helper-spread-fit-style');
  if (fitStyle && fitStyle.parentNode) fitStyle.parentNode.removeChild(fitStyle);
}
