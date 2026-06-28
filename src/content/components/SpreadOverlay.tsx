import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { spreadState, settings } from '../state.js';
import { advanceSpread, retreatSpread, exitOverlay, retryImage } from '../spread.js';
import { applySpreadFit } from '../fit.js';

const leftError = signal(false);
const rightError = signal(false);

export function SpreadOverlay() {
  const state = spreadState.value;
  const hasLeftError = leftError.value;
  const hasRightError = rightError.value;

  useEffect(
    function () {
      if (state.active) {
        applySpreadFit(state.single);
      }
    },
    [state.active, state.single, settings.value.fitMode]
  );

  useEffect(
    function () {
      leftError.value = false;
    },
    [state.leftSrc]
  );

  useEffect(
    function () {
      rightError.value = false;
    },
    [state.rightSrc]
  );

  if (!state.active) return null;

  function handleClick(event: MouseEvent) {
    if ((event.target as HTMLElement).id === 'eh-helper-spread-close') return;
    event.preventDefault();
    event.stopPropagation();
    const overlay = document.getElementById('eh-helper-spread-overlay');
    const midX = overlay ? overlay.clientWidth / 2 : window.innerWidth / 2;
    if (event.clientX < midX) {
      advanceSpread();
    } else {
      retreatSpread();
    }
  }

  function handleClose(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    exitOverlay();
  }

  function handleMouseMove(event: MouseEvent) {
    const overlay = event.currentTarget as HTMLElement;
    const midX = overlay.clientWidth / 2;
    const cls = event.clientX < midX ? 'eh-cursor-left' : 'eh-cursor-right';
    if (!overlay.classList.contains(cls)) {
      overlay.classList.remove('eh-cursor-left', 'eh-cursor-right');
      overlay.classList.add(cls);
    }
  }

  function handleLeftError() {
    leftError.value = true;
  }

  function handleRightError() {
    if (state.rightFallbackSrc && state.rightSrc !== state.rightFallbackSrc) {
      spreadState.value = {
        ...spreadState.value,
        rightSrc: state.rightFallbackSrc,
        rightFallbackSrc: ''
      };
      return;
    }
    rightError.value = true;
  }

  return (
    <div
      id="eh-helper-spread-overlay"
      class={state.single ? 'eh-spread-single' : ''}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    >
      <button id="eh-helper-spread-close" onClick={handleClose}>
        ×
      </button>
      <img id="eh-helper-spread-left" src={state.leftSrc || undefined} onError={handleLeftError} />
      <img
        id="eh-helper-spread-right"
        src={state.rightSrc || undefined}
        onError={handleRightError}
      />
      {hasLeftError && !state.single && (
        <button
          class="eh-retry-hint eh-retry-left"
          onClick={function (e) {
            e.stopPropagation();
            retryImage('left');
          }}
        >
          {'↻'}
        </button>
      )}
      {hasRightError && (
        <button
          class={'eh-retry-hint' + (state.single ? ' eh-retry-single' : ' eh-retry-right')}
          onClick={function (e) {
            e.stopPropagation();
            retryImage('right');
          }}
        >
          {'↻'}
        </button>
      )}
    </div>
  );
}
