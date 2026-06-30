import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { spreadState, settings, controlsVisible, menuOpen } from '../state.js';
import { advanceSpread, retreatSpread, exitOverlay, retryImage } from '../spread.js';
import { applySpreadFit } from '../fit.js';
import { getOverlayClickZone } from '../../shared/viewer-utils.js';
import { WHEEL_COOLDOWN_MS } from '../../shared/constants.js';

const leftError = signal(false);
const rightError = signal(false);
let lastWheelAt = 0;

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

  function handleZone(clientX: number) {
    const overlay = document.getElementById('eh-helper-spread-overlay');
    const width = overlay ? overlay.clientWidth : window.innerWidth;
    const zone = getOverlayClickZone(width > 0 ? clientX / width : 0.5);
    if (zone === 'next') {
      advanceSpread();
    } else if (zone === 'prev') {
      retreatSpread();
    } else {
      const next = !controlsVisible.value;
      controlsVisible.value = next;
      if (!next) menuOpen.value = false;
    }
  }

  function handleClick(event: MouseEvent) {
    if ((event.target as HTMLElement).id === 'eh-helper-spread-close') return;
    event.preventDefault();
    event.stopPropagation();
    handleZone(event.clientX);
  }

  function handleTouchEnd(event: TouchEvent) {
    if ((event.target as HTMLElement).id === 'eh-helper-spread-close') return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    event.stopPropagation();
    handleZone(touch.clientX);
  }

  function handleClose(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    exitOverlay();
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    if (Math.abs(event.deltaY) < 1) return;
    const now = Date.now();
    if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
    lastWheelAt = now;
    if (event.deltaY > 0) {
      advanceSpread();
    } else {
      retreatSpread();
    }
  }

  function handleMouseMove(event: MouseEvent) {
    const overlay = event.currentTarget as HTMLElement;
    const width = overlay.clientWidth;
    const zone = getOverlayClickZone(width > 0 ? event.clientX / width : 0.5);
    const cls = zone === 'next' ? 'eh-cursor-left' : zone === 'prev' ? 'eh-cursor-right' : '';
    overlay.classList.remove('eh-cursor-left', 'eh-cursor-right');
    if (cls) overlay.classList.add(cls);
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
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
    >
      {controlsVisible.value && (
        <button id="eh-helper-spread-close" onClick={handleClose}>
          ×
        </button>
      )}
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
