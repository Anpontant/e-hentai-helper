import { describe, test, expect, beforeEach } from 'vitest';
import { settings } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import {
  updateFitStyle,
  applyImageFit,
  applySpreadFit,
  removeSpreadFitStyle
} from '../src/content/fit.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  settings.value = { ...DEFAULT_SETTINGS };
});

describe('updateFitStyle', () => {
  test('creates a style element with id eh-helper-fit-style', () => {
    updateFitStyle();
    const style = document.getElementById('eh-helper-fit-style');
    expect(style).not.toBeNull();
    expect(style!.tagName).toBe('STYLE');
  });

  test('applies height fit mode CSS', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'height' };
    updateFitStyle();
    const style = document.getElementById('eh-helper-fit-style')!;
    expect(style.textContent).toContain('max-height: 100vh');
    expect(style.textContent).toContain('max-width: none');
  });

  test('applies width fit mode CSS', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'width' };
    updateFitStyle();
    const style = document.getElementById('eh-helper-fit-style')!;
    expect(style.textContent).toContain('max-height: none');
    expect(style.textContent).toContain('max-width: 100vw');
  });

  test('applies original fit mode CSS', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'original' };
    updateFitStyle();
    const style = document.getElementById('eh-helper-fit-style')!;
    expect(style.textContent).toContain('max-height: none');
    expect(style.textContent).toContain('max-width: none');
  });

  test('reuses existing style element on subsequent calls', () => {
    updateFitStyle();
    updateFitStyle();
    const styles = document.querySelectorAll('#eh-helper-fit-style');
    expect(styles.length).toBe(1);
  });
});

describe('applyImageFit', () => {
  test('sets inline styles on #img element', () => {
    document.body.innerHTML = '<img id="img" src="test.jpg" />';
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'height' };
    applyImageFit();

    const img = document.getElementById('img') as HTMLImageElement;
    expect(img.style.maxHeight).toBe('100vh');
    expect(img.style.maxWidth).toBe('none');
    expect(img.style.width).toBe('auto');
    expect(img.style.height).toBe('auto');
  });

  test('does not throw when #img is absent', () => {
    expect(() => applyImageFit()).not.toThrow();
  });

  test('also creates the fit style element', () => {
    document.body.innerHTML = '<img id="img" src="test.jpg" />';
    applyImageFit();
    expect(document.getElementById('eh-helper-fit-style')).not.toBeNull();
  });
});

describe('applySpreadFit', () => {
  test('creates spread fit style element', () => {
    applySpreadFit(false);
    const style = document.getElementById('eh-helper-spread-fit-style');
    expect(style).not.toBeNull();
  });

  test('uses 50vw max-width for double-page spread in width mode', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'width' };
    applySpreadFit(false);
    const style = document.getElementById('eh-helper-spread-fit-style')!;
    expect(style.textContent).toContain('max-width: 50vw');
  });

  test('uses 100vw max-width for single-page spread in width mode', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'width' };
    applySpreadFit(true);
    const style = document.getElementById('eh-helper-spread-fit-style')!;
    expect(style.textContent).toContain('max-width: 100vw');
  });

  test('keeps max-width none for height mode regardless of single', () => {
    settings.value = { ...DEFAULT_SETTINGS, fitMode: 'height' };
    applySpreadFit(false);
    const style = document.getElementById('eh-helper-spread-fit-style')!;
    expect(style.textContent).toContain('max-width: none');
  });
});

describe('removeSpreadFitStyle', () => {
  test('removes the spread fit style element', () => {
    applySpreadFit(false);
    expect(document.getElementById('eh-helper-spread-fit-style')).not.toBeNull();
    removeSpreadFitStyle();
    expect(document.getElementById('eh-helper-spread-fit-style')).toBeNull();
  });

  test('does not throw when element does not exist', () => {
    expect(() => removeSpreadFitStyle()).not.toThrow();
  });
});
