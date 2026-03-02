import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: { value: number; isPositive: boolean };
  subLabel?: string;
  subValue?: string;
  color?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  subLabel,
  subValue,
  color = 'bg-blue-50 text-blue-600',
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-claude-subtext">{label}</span>
        {trend && (
          <span
            className={`ml-auto flex items-center gap-1 text-xs font-medium ${
              trend.isPositive ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {trend.isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
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
