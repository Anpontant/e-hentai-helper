import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SpreadOverlay } from '../src/content/components/SpreadOverlay.js';
import { settings, spreadState, totalPages, virtualPage } from '../src/content/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/constants.js';

let container: HTMLDivElement;

function getPreactEventHandler(element: Element, eventType: string) {
  const properties = element as unknown as Record<string, unknown>;
  for (const propertyName of Object.getOwnPropertyNames(element)) {
    const value = properties[propertyName];
    if (!value || typeof value !== 'object') continue;

    const listeners = value as Record<string, unknown>;
    for (const listenerName of Object.keys(listeners)) {
      const listener = listeners[listenerName];
      if (listenerName.startsWith(eventType) && typeof listener === 'function') {
        return listener as (event: Event) => void;
      }
    }
  }
  throw new Error('Preact ' + eventType + ' handler not found');
}

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
    rightFallbackSrc: 'https://img.example/page2-fallback.jpg',
    single: false
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    render(h(SpreadOverlay, {}), container);
  });
});

afterEach(() => {
  act(() => {
    render(null, container);
  });
  container.remove();
  vi.restoreAllMocks();
});

describe('SpreadOverlay image replacement', () => {
  test('still handles errors from the currently mounted images', async () => {
    const left = document.getElementById('eh-helper-spread-left')!;
    const right = document.getElementById('eh-helper-spread-right')!;

    act(() => {
      left.dispatchEvent(new Event('error'));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.eh-retry-left')).not.toBeNull();
    });

    act(() => {
      right.dispatchEvent(new Event('error'));
    });

    await vi.waitFor(() => {
      expect(spreadState.value.rightSrc).toBe('https://img.example/page2-fallback.jpg');
    });

    act(() => {
      document.getElementById('eh-helper-spread-right')!.dispatchEvent(new Event('error'));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.eh-retry-right')).not.toBeNull();
    });
  });

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

  test('ignores late errors from image elements removed by navigation', async () => {
    const previousLeft = document.getElementById('eh-helper-spread-left')!;
    const previousRight = document.getElementById('eh-helper-spread-right')!;
    const previousLeftError = getPreactEventHandler(previousLeft, 'error');
    const previousRightError = getPreactEventHandler(previousRight, 'error');

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

    previousLeftError({ currentTarget: previousLeft } as unknown as Event);
    previousRightError({ currentTarget: previousRight } as unknown as Event);
    await Promise.resolve();

    expect(spreadState.value.leftSrc).toBe('https://img.example/page5.jpg');
    expect(spreadState.value.rightSrc).toBe('https://img.example/page4.jpg');
    expect(document.querySelector('.eh-retry-left')).toBeNull();
    expect(document.querySelector('.eh-retry-right')).toBeNull();
  });
});
