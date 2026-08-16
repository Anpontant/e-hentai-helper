import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SpreadOverlay } from '../src/content/components/SpreadOverlay.js';
import { settings, spreadState, totalPages, virtualPage } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';

let container: HTMLDivElement;

beforeEach(() => {
  settings.value = {
    ...DEFAULT_SETTINGS,
    overlayView: true,
    spreadView: true,
    spreadCoverAlone: true
  };
  virtualPage.value = 2;
  totalPages.value = 40;
  spreadState.value = {
    active: true,
    leftSrc: 'https://img.example/page3.jpg',
    rightSrc: 'https://img.example/page2.jpg',
    rightFallbackSrc: '',
    single: false
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  render(h(SpreadOverlay, {}), container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
});

describe('SpreadOverlay image replacement', () => {
  test('replaces loaded image elements immediately when the page changes', async () => {
    const previousLeft = document.getElementById('eh-helper-spread-left');
    const previousRight = document.getElementById('eh-helper-spread-right');

    virtualPage.value = 4;
    spreadState.value = {
      active: true,
      leftSrc: 'https://img.example/page5.jpg',
      rightSrc: 'https://img.example/page4.jpg',
      rightFallbackSrc: '',
      single: false
    };

    await vi.waitFor(() => {
      expect(document.getElementById('eh-helper-spread-left')).not.toBe(previousLeft);
      expect(document.getElementById('eh-helper-spread-right')).not.toBe(previousRight);
    });
  });

  test('removes the previous image elements while the target spread is unresolved', async () => {
    const previousLeft = document.getElementById('eh-helper-spread-left');
    const previousRight = document.getElementById('eh-helper-spread-right');

    virtualPage.value = 4;
    spreadState.value = {
      active: true,
      leftSrc: '',
      rightSrc: '',
      rightFallbackSrc: '',
      single: false
    };

    await vi.waitFor(() => {
      expect(document.getElementById('eh-helper-spread-left')).toBeNull();
      expect(document.getElementById('eh-helper-spread-right')).toBeNull();
    });

    spreadState.value = {
      ...spreadState.value,
      leftSrc: 'https://img.example/page5.jpg',
      rightSrc: 'https://img.example/page4.jpg'
    };

    await vi.waitFor(() => {
      expect(document.getElementById('eh-helper-spread-left')).not.toBe(previousLeft);
      expect(document.getElementById('eh-helper-spread-right')).not.toBe(previousRight);
    });
  });
});
