interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function ParamJsonEditor({ value, onChange }: Props) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={10}
      className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y bg-white"
      placeholder="{}"
      spellCheck={false}
    />
  );
}
