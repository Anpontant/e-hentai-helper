import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  spreadState,
  settings,
  controlsVisible,
  menuOpen,
  virtualPage,
  totalPages
} from '../state.js';
import { advanceSpread, retreatSpread, exitOverlay, retryImage, seekToPage } from '../spread.js';
import { applySpreadFit } from '../fit.js';
import {
  getOverlayClickZone,
  pageFromSeekFraction,
  seekFractionFromPage
} from '../../shared/viewer-utils.js';
import { WHEEL_COOLDOWN_MS } from '../../shared/constants.js';

const leftError = signal(false);
const rightError = signal(false);
let lastWheelAt = 0;
const seekPreview = signal<number | null>(null);

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

  function pageFromPointer(event: PointerEvent): number {
    const track = document.getElementById('eh-helper-seek-track');
    const total = totalPages.value;
    if (!track || total <= 0) return virtualPage.value || 1;
    const rect = track.getBoundingClientRect();
    const fraction = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return pageFromSeekFraction(fraction, total);
  }

  function handleSeekDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (totalPages.value <= 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    seekPreview.value = pageFromPointer(event);
  }

  function handleSeekMove(event: PointerEvent) {
    if (seekPreview.value === null) return;
    event.preventDefault();
    seekPreview.value = pageFromPointer(event);
  }

  function handleSeekUp(event: PointerEvent) {
    if (seekPreview.value === null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = seekPreview.value;
    seekPreview.value = null;
    seekToPage(target);
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
      {controlsVisible.value && (
        <div id="eh-helper-spread-controls" onClick={(e) => e.stopPropagation()}>
          <div
            id="eh-helper-seek-track"
            class={totalPages.value <= 0 ? 'eh-seek-disabled' : ''}
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
          >
            <div
              id="eh-helper-seek-fill"
              style={{
                width:
                  seekFractionFromPage(seekPreview.value ?? virtualPage.value, totalPages.value) *
                    100 +
                  '%'
              }}
            />
            <div
              id="eh-helper-seek-thumb"
              style={{
                left:
                  seekFractionFromPage(seekPreview.value ?? virtualPage.value, totalPages.value) *
                    100 +
                  '%'
              }}
            />
          </div>
          <div id="eh-helper-seek-count">
            {(seekPreview.value ?? virtualPage.value) || 0}
            {' / '}
            {totalPages.value > 0 ? totalPages.value : '-'}
          </div>
        </div>
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
