import { useEffect } from 'preact/hooks';
import { spreadState, settings } from '../state.js';
import { advanceSpread, retreatSpread, exitOverlay } from '../spread.js';
import { applySpreadFit } from '../fit.js';

export function SpreadOverlay() {
  const state = spreadState.value;

  useEffect(
    function () {
      if (state.active) {
        applySpreadFit(state.single);
      }
    },
    [state.active, state.single, settings.value.fitMode]
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

  function handleRightError() {
    if (state.rightFallbackSrc && state.rightSrc !== state.rightFallbackSrc) {
      spreadState.value = {
        ...spreadState.value,
        rightSrc: state.rightFallbackSrc,
        rightFallbackSrc: ''
      };
    }
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
      <img id="eh-helper-spread-left" src={state.leftSrc || undefined} />
      <img
        id="eh-helper-spread-right"
        src={state.rightSrc || undefined}
        onError={handleRightError}
      />
    </div>
  );
}
