import React from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
} from 'lucide-react';
import type { TableInfo } from './types';

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString('uk-UA');
}

export function ServiceStatusBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-green-600 bg-green-50">
      <CheckCircle size={12} />
      Онлайн
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50">
      <XCircle size={12} />
      Недоступний
    </span>
  );
}

export function SectionLoader() {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-8 flex items-center justify-center">
      <RefreshCw size={18} className="text-claude-subtext animate-spin mr-2" />
      <span className="text-sm text-claude-subtext">Завантаження...</span>
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-6 text-center">
      <XCircle size={20} className="mx-auto mb-2 text-red-400" />
      <p className="text-sm text-red-600 mb-3">{message}</p>
      <button onClick={onRetry} className="text-xs px-3 py-1.5 border border-claude-border rounded-lg hover:bg-gray-50 transition-colors">
        Повторити
      </button>
    </div>
  );
}

export function DataTable({ tables }: { tables: TableInfo[] }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-claude-border bg-gray-50">
              <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Таблиця</th>
              <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Записів</th>
              <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Джерело</th>
              <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Частота оновлення</th>
              <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Останнє оновлення</th>
              <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Завантажено</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-claude-text text-xs">{t.name}</div>
                  <div className="text-[10px] text-claude-subtext font-mono">{t.id}</div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`font-mono text-xs font-medium ${t.rows > 0 ? 'text-claude-text' : 'text-claude-subtext'}`}>
                    {formatNumber(t.rows)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-claude-text">{t.source}</span>
                    {t.sourceUrl && (
                      <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} className="text-claude-subtext flex-shrink-0" />
                    <span className="text-xs text-claude-subtext">{t.updateFrequency}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-claude-subtext">{formatDate(t.lastUpdate)}</td>
                <td className="px-4 py-2.5 text-right">
                  {t.lastBatchCount != null && t.lastBatchCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 font-mono">
                      +{formatNumber(t.lastBatchCount)}
                    </span>
                  ) : (
                    <span className="text-xs text-claude-subtext">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function toTableInfoArray(tables: Record<string, any>): TableInfo[] {
  return Object.entries(tables).map(([id, t]) => ({
    id,
    name: t.source?.split('—')[1]?.trim() || id,
    rows: t.rows || 0,
    source: t.source || '',
    sourceUrl: t.sourceUrl || '',
    updateFrequency: t.updateFrequency || '',
    lastUpdate: t.lastUpdate || null,
    lastBatchCount: t.lastBatchCount || 0,
  }));
}

export function SummaryCard({
  icon: Icon, label, value, sub, status, loading: isLoading,
}: {
  icon: React.ElementType; label: string; value: string; sub: string;
  status?: 'online' | 'offline' | 'loading'; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="p-2 bg-claude-bg rounded-lg">
          <Icon size={16} className="text-claude-text" />
        </div>
        {status === 'loading' || isLoading ? (
          <RefreshCw size={10} className="text-claude-subtext animate-spin" />
        ) : status ? (
          <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
        ) : null}
      </div>
      <div className="text-xl font-semibold text-claude-text font-mono">
        {isLoading ? <span className="text-claude-subtext text-base">...</span> : value}
      </div>
      <div className="text-xs text-claude-subtext mt-0.5">{label}</div>
      <div className="text-[10px] text-claude-subtext/70 mt-1">{sub}</div>
    </div>
  );
}

export function completenessColor(pct: number): string {
  if (pct >= 100) return 'text-green-700';
  if (pct >= 80) return 'text-yellow-600';
  return 'text-red-600';
}

export function completenessBg(pct: number): string {
  if (pct >= 100) return 'bg-green-50';
  if (pct >= 80) return 'bg-yellow-50';
  return 'bg-red-50';
}
