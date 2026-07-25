import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Wrench,
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import { getErrorMessage } from '../../../utils/errors';

interface ToolUsageRow {
  tool_name: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  avg_time_ms: number;
  total_cost_usd: number;
  first_used: string;
  last_used: string;
  unique_users: number;
}

interface ToolUsageData {
  tools: ToolUsageRow[];
  total_calls: number;
  period_days: number;
}

type SortKey = 'total_calls' | 'success_calls' | 'failed_calls' | 'avg_time_ms' | 'total_cost_usd' | 'unique_users' | 'last_used' | 'tool_name';

const PERIOD_OPTIONS = [
  { value: 1, label: 'Сьогодні' },
  { value: 7, label: '7 днів' },
  { value: 30, label: '30 днів' },
  { value: 90, label: '90 днів' },
  { value: 365, label: '1 рік' },
  { value: 0, label: 'Весь час' },
];

function formatNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

function successRate(row: ToolUsageRow): number {
  if (row.total_calls === 0) return 0;
  return (row.success_calls / row.total_calls) * 100;
}

function rateColor(pct: number): string {
  if (pct >= 98) return 'text-green-700 bg-green-50';
  if (pct >= 90) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

export function AdminMonitoringPage() {
  const [data, setData] = useState<ToolUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>('total_calls');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getToolUsage(d);
      setData(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-claude-subtext/40" />;
    return sortAsc
      ? <ChevronUp size={12} className="text-claude-text" />
      : <ChevronDown size={12} className="text-claude-text" />;
  };

  const filtered = (data?.tools || []).filter(t =>
    t.tool_name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    if (sortKey === 'tool_name') return dir * a.tool_name.localeCompare(b.tool_name);
    if (sortKey === 'last_used') return dir * (new Date(a.last_used).getTime() - new Date(b.last_used).getTime());
    return dir * ((a[sortKey] as number) - (b[sortKey] as number));
  });

  const totalCalls = data?.total_calls || 0;
  const totalTools = filtered.length;
  const totalCost = filtered.reduce((s, t) => s + t.total_cost_usd, 0);
  const maxUsers = Math.max(...(filtered.map(t => t.unique_users)), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-claude-text font-sans">Використання інструментів</h1>
          <p className="text-sm text-claude-subtext mt-1">Частота викликів MCP-інструментів у чаті</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm border border-claude-border rounded-lg px-3 py-2 bg-white text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => fetchData(days)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Оновити
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-claude-bg rounded-lg"><Wrench size={16} className="text-claude-text" /></div>
          </div>
          <div className="text-xl font-semibold text-claude-text font-mono">{loading ? '...' : formatNumber(totalTools)}</div>
          <div className="text-xs text-claude-subtext mt-0.5">Інструментів</div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-claude-bg rounded-lg"><TrendingUp size={16} className="text-claude-text" /></div>
          </div>
          <div className="text-xl font-semibold text-claude-text font-mono">{loading ? '...' : formatNumber(totalCalls)}</div>
          <div className="text-xs text-claude-subtext mt-0.5">Всього викликів</div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-claude-bg rounded-lg"><DollarSign size={16} className="text-claude-text" /></div>
          </div>
          <div className="text-xl font-semibold text-claude-text font-mono">{loading ? '...' : formatCost(totalCost)}</div>
          <div className="text-xs text-claude-subtext mt-0.5">Загальна вартість</div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-claude-bg rounded-lg"><Users size={16} className="text-claude-text" /></div>
          </div>
          <div className="text-xl font-semibold text-claude-text font-mono">{loading ? '...' : formatNumber(maxUsers)}</div>
          <div className="text-xs text-claude-subtext mt-0.5">Макс. унікальних користувачів</div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Пошук інструменту..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm text-sm border border-claude-border rounded-lg px-3 py-2 bg-white text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-white rounded-xl border border-claude-border p-6 text-center mb-6">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <button onClick={() => fetchData(days)} className="text-xs px-3 py-1.5 border border-claude-border rounded-lg hover:bg-gray-50 transition-colors">
            Повторити
          </button>
        </div>
      )}

      {/* Table */}
      {loading && !data ? (
        <div className="bg-white rounded-xl border border-claude-border p-8 flex items-center justify-center">
          <RefreshCw size={18} className="text-claude-subtext animate-spin mr-2" />
          <span className="text-sm text-claude-subtext">Завантаження...</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-claude-border p-8 text-center">
          <p className="text-sm text-claude-subtext">Немає даних за обраний період</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-claude-border bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs w-8">#</th>
                  <th
                    className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('tool_name')}
                  >
                    <div className="flex items-center gap-1">Інструмент <SortIcon col="tool_name" /></div>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('total_calls')}
                  >
                    <div className="flex items-center justify-end gap-1">Виклики <SortIcon col="total_calls" /></div>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Успіх</th>
                  <th
                    className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('failed_calls')}
                  >
                    <div className="flex items-center justify-end gap-1">Помилки <SortIcon col="failed_calls" /></div>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('avg_time_ms')}
                  >
                    <div className="flex items-center justify-end gap-1">Сер. час <SortIcon col="avg_time_ms" /></div>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('total_cost_usd')}
                  >
                    <div className="flex items-center justify-end gap-1">Вартість <SortIcon col="total_cost_usd" /></div>
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('unique_users')}
                  >
                    <div className="flex items-center justify-end gap-1">Юзери <SortIcon col="unique_users" /></div>
                  </th>
                  <th
                    className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs cursor-pointer hover:text-claude-text select-none"
                    onClick={() => handleSort('last_used')}
                  >
                    <div className="flex items-center gap-1">Останній виклик <SortIcon col="last_used" /></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const rate = successRate(t);
                  const pct = totalCalls > 0 ? (t.total_calls / totalCalls) * 100 : 0;
                  return (
                    <tr key={t.tool_name} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-xs text-claude-subtext">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-claude-text text-xs font-mono">{t.tool_name}</div>
                        <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5 max-w-[120px]">
                          <div
                            className="bg-claude-accent/60 h-1 rounded-full"
                            style={{ width: `${Math.min(pct * 2, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs font-medium text-claude-text">{formatNumber(t.total_calls)}</span>
                        <span className="text-[10px] text-claude-subtext ml-1">({pct.toFixed(1)}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${rateColor(rate)}`}>
                          {rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono text-xs ${t.failed_calls > 0 ? 'text-red-600' : 'text-claude-subtext'}`}>
                          {formatNumber(t.failed_calls)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Clock size={11} className="text-claude-subtext flex-shrink-0" />
                          <span className="font-mono text-xs text-claude-subtext">{formatDuration(t.avg_time_ms)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs text-claude-text">{formatCost(t.total_cost_usd)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs text-claude-text">{formatNumber(t.unique_users)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-claude-subtext">{formatDate(t.last_used)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
