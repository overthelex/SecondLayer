/**
 * Shared UI components used across infrastructure sections
 */

import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { formatPct, generateRecommendations } from './types';

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
      <h3 className="text-sm font-medium text-claude-text mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
      <div className="text-xs text-claude-subtext mb-1">{label}</div>
      <div className="text-xl font-semibold text-claude-text font-sans">{value}</div>
      {sub && <div className="text-xs text-claude-subtext mt-1">{sub}</div>}
    </div>
  );
}

export function GaugeBar({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const barColor = pct > 80 ? 'bg-red-400' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-claude-subtext">{label}</span>
        <span className="text-sm font-semibold text-claude-text">{formatPct(pct)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="text-xs text-claude-subtext">{detail}</div>
    </div>
  );
}

export function RecommendationsSection({ data }: { data: any }) {
  const recommendations = generateRecommendations(data);

  return (
    <div className="space-y-3">
      {recommendations.map((rec, idx) => (
        <div
          key={idx}
          className={`flex items-start gap-3 p-4 rounded-xl border ${
            rec.severity === 'critical'
              ? 'bg-red-50 border-red-200'
              : rec.severity === 'warning'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          {rec.severity === 'info' ? (
            <Lightbulb size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle size={18} className={rec.severity === 'critical' ? 'text-red-600 mt-0.5 flex-shrink-0' : 'text-amber-600 mt-0.5 flex-shrink-0'} />
          )}
          <div>
            <div className={`text-sm font-medium ${
              rec.severity === 'critical' ? 'text-red-800' : rec.severity === 'warning' ? 'text-amber-800' : 'text-emerald-800'
            }`}>
              {rec.title}
            </div>
            <div className={`text-xs mt-0.5 ${
              rec.severity === 'critical' ? 'text-red-600' : rec.severity === 'warning' ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {rec.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({
  title,
  icon: Icon,
  open,
  onToggle,
}: {
  title: string;
  icon: React.ElementType;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-3 px-1 text-left group"
    >
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-claude-subtext" />
        <h2 className="text-lg font-semibold text-claude-text">{title}</h2>
      </div>
      {open ? (
        <ChevronUp size={18} className="text-claude-subtext" />
      ) : (
        <ChevronDown size={18} className="text-claude-subtext" />
      )}
    </button>
  );
}

export function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-12 text-claude-subtext">
      <RefreshCw size={18} className="animate-spin mr-2" />
      Завантаження...
    </div>
  );
}

export function ErrorPlaceholder({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-red-500 text-sm">
      {message}
    </div>
  );
}
