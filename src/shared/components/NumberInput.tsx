interface NumberInputProps {
  setting: string;
  value: number;
  min: number;
  max: number;
  onSave: (patch: Record<string, number>) => void;
  className?: string;
}

export function NumberInput({ setting, value, min, max, onSave, className }: NumberInputProps) {
  return (
    <input
      type="number"
      class={className}
      value={value}
      min={min}
      max={max}
      step={1}
      onChange={function (e) {
        const raw = Math.floor(Number((e.target as HTMLInputElement).value) || 0);
        const clamped = Math.max(min, Math.min(max, raw));
        onSave({ [setting]: clamped });
      }}
    />
  );
}
