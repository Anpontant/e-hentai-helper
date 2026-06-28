import { statusLines } from '../state.js';

export function StatusDisplay() {
  var lines = statusLines.value;
  if (!lines.length) return null;

  return (
    <div id="eh-helper-status">
      {lines.map(function (line, i) {
        var cls = i === lines.length - 1 ? 'eh-helper-status-progress' : 'eh-helper-status-line';
        return (
          <div key={i} class={cls}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
