export function Segmented({ setting, options, current, onSave, className }) {
  return (
    <div class={className || 'segmented'} data-setting={setting}>
      {options.map(function (opt) {
        return (
          <button
            key={opt.value}
            type="button"
            class={String(current) === String(opt.value) ? 'active' : ''}
            onClick={function () {
              var val = setting === 'preloadAheadCount' ? parseInt(opt.value, 10) : opt.value;
              onSave({ [setting]: val });
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
