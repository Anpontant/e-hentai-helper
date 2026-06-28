interface CheckboxProps {
  id: string;
  setting: string;
  checked: boolean;
  label: string;
  onSave: (patch: Record<string, boolean>) => void;
}

export function Checkbox({ id, setting, checked, label, onSave }: CheckboxProps) {
  return (
    <label>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={function (e) {
          onSave({ [setting]: (e.target as HTMLInputElement).checked });
        }}
      />
      <span>{label}</span>
    </label>
  );
}
