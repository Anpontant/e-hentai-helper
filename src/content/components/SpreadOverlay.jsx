import { useEffect } from 'preact/hooks';
import { spreadState, settings } from '../state.js';
import { advanceSpread, exitOverlay } from '../spread.js';
import { applySpreadFit } from '../fit.js';

export function SpreadOverlay() {
  var state = spreadState.value;

  useEffect(
    function () {
      if (state.active) {
        applySpreadFit(state.single);
      }
    },
    [state.active, state.single, settings.value.fitMode]
  );

  if (!state.active) return null;

  function handleClick(event) {
    if (event.target.id === 'eh-helper-spread-close') return;
    event.preventDefault();
    event.stopPropagation();
    advanceSpread();
  }

  function handleClose(event) {
    event.preventDefault();
    event.stopPropagation();
    exitOverlay();
  }

  return (
    <div
      id="eh-helper-spread-overlay"
      class={state.single ? 'eh-spread-single' : ''}
      onClick={handleClick}
    >
      <button id="eh-helper-spread-close" onClick={handleClose}>
        ×
      </button>
      <img id="eh-helper-spread-left" src={state.leftSrc || undefined} />
      <img id="eh-helper-spread-right" src={state.rightSrc || undefined} />
    </div>
  );
}
