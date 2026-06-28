interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedProps {
  setting: string;
  options: SegmentedOption[];
  current: string | number;
  onSave: (patch: Record<string, string | number>) => void;
  className?: string;
}

export function Segmented({ setting, options, current, onSave, className }: SegmentedProps) {
  return (
    <div class={className || 'segmented'} data-setting={setting}>
      {options.map(function (opt) {
        return (
          <button
            key={opt.value}
            type="button"
            class={String(current) === String(opt.value) ? 'active' : ''}
            onClick={function () {
              const val = setting === 'preloadAheadCount' ? parseInt(opt.value, 10) : opt.value;
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
