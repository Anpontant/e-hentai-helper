export function Checkbox({ id, setting, checked, label, onSave }) {
  return (
    <label>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={function (e) {
          onSave({ [setting]: e.target.checked });
        }}
      />
      <span>{label}</span>
    </label>
  );
}
