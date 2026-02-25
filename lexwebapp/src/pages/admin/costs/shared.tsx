import type { ReactNode, ElementType } from 'react';

export function KPICard({
  label,
  value,
  icon: Icon,
  color,
  subLabel,
  subValue,
}: {
  label: string;
  value: string;
  icon: ElementType;
  color: string;
  subLabel?: string;
  subValue?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-claude-subtext">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-claude-text font-sans">{value}</div>
      {subLabel && (
        <div className="text-xs text-claude-subtext mt-1">
          {subLabel}: <span className="font-medium text-claude-text">{subValue}</span>
        </div>
      )}
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
      <h3 className="text-sm font-medium text-claude-text mb-4">{title}</h3>
      {children}
    </div>
  );
}
