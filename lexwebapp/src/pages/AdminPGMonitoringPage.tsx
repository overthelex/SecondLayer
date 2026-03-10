import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Database, AlertCircle } from 'lucide-react';
import { adminApi } from '../utils/api/admin';

interface YearRow {
  year: number | null;
  total: number;
  with_fulltext: number;
}

interface EnvStats {
  byYear: YearRow[];
  totalDocuments: number;
  totalFulltext: number;
  standaloneFulltext: number;
  timestamp: string;
}

interface PGMonitoringData {
  local: EnvStats | null;
  stage: EnvStats | null;
  prod: EnvStats | null;
  timestamp: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

function EdrsrTable({ data, label }: { data: EnvStats; label: string }) {
  const rows = data.byYear.filter(r => r.year !== null && r.year > 1990 && r.year < 2100);
  const nullRow = data.byYear.find(r => r.year === null);

  const totalWithFt = rows.reduce((s, r) => s + r.with_fulltext, 0) + (nullRow?.with_fulltext || 0);
  const totalDocs = rows.reduce((s, r) => s + r.total, 0) + (nullRow?.total || 0);

  return (
    <div className="flex-1 min-w-[400px]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-claude-text-primary flex items-center gap-2">
          <Database className="w-5 h-5 text-claude-accent" />
          {label}
        </h3>
        <span className="text-xs text-claude-text-secondary">
          {new Date(data.timestamp).toLocaleTimeString('uk-UA')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-claude-bg-secondary rounded-lg p-3 border border-claude-border">
          <div className="text-xs text-claude-text-secondary">Метаданих</div>
          <div className="text-xl font-bold text-claude-text-primary">{formatNumber(data.totalDocuments)}</div>
        </div>
        <div className="bg-claude-bg-secondary rounded-lg p-3 border border-claude-border">
          <div className="text-xs text-claude-text-secondary">З fulltext</div>
          <div className="text-xl font-bold text-emerald-400">{formatNumber(data.totalFulltext)}</div>
        </div>
        <div className="bg-claude-bg-secondary rounded-lg p-3 border border-claude-border">
          <div className="text-xs text-claude-text-secondary">Покриття</div>
          <div className="text-xl font-bold text-amber-400">
            {totalDocs > 0 ? ((totalWithFt / totalDocs) * 100).toFixed(1) : '0'}%
          </div>
        </div>
      </div>

      <div className="border border-claude-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-claude-bg-secondary border-b border-claude-border">
              <th className="px-4 py-2.5 text-left text-sm font-semibold text-claude-text-primary">Рік</th>
              <th className="px-4 py-2.5 text-right text-sm font-semibold text-claude-text-primary">Метаданих</th>
              <th className="px-4 py-2.5 text-right text-sm font-semibold text-claude-text-primary">З fulltext</th>
              <th className="px-4 py-2.5 text-right text-sm font-semibold text-claude-text-primary">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = row.total > 0 ? (row.with_fulltext / row.total) * 100 : 0;
              return (
                <tr key={row.year} className="border-b border-claude-border/50 hover:bg-claude-bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 text-sm font-medium text-claude-text-primary">{row.year}</td>
                  <td className="px-4 py-2 text-sm text-right text-claude-text-secondary font-mono">
                    {formatNumber(row.total)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-mono">
                    <span className={row.with_fulltext > 0 ? 'text-emerald-400' : 'text-claude-text-secondary'}>
                      {formatNumber(row.with_fulltext)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-claude-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: pct > 50 ? '#34d399' : pct > 10 ? '#fbbf24' : '#6b7280',
                          }}
                        />
                      </div>
                      <span className="text-claude-text-secondary font-mono w-12 text-right">
                        {pct > 0 ? pct.toFixed(1) : '0'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {nullRow && (
              <tr className="border-b border-claude-border/50 hover:bg-claude-bg-secondary/50">
                <td className="px-4 py-2 text-sm font-medium text-claude-text-secondary italic">без дати</td>
                <td className="px-4 py-2 text-sm text-right text-claude-text-secondary font-mono">
                  {formatNumber(nullRow.total)}
                </td>
                <td className="px-4 py-2 text-sm text-right font-mono text-claude-text-secondary">
                  {formatNumber(nullRow.with_fulltext)}
                </td>
                <td className="px-4 py-2 text-sm text-right text-claude-text-secondary">—</td>
              </tr>
            )}
            {data.standaloneFulltext > 0 && (
              <tr className="hover:bg-claude-bg-secondary/50">
                <td className="px-4 py-2 text-sm font-medium text-amber-400 italic">fulltext без метаданих</td>
                <td className="px-4 py-2 text-sm text-right text-claude-text-secondary font-mono">—</td>
                <td className="px-4 py-2 text-sm text-right font-mono text-amber-400">
                  {formatNumber(data.standaloneFulltext)}
                </td>
                <td className="px-4 py-2 text-sm text-right text-claude-text-secondary">—</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-claude-bg-secondary border-t border-claude-border">
              <td className="px-4 py-2.5 text-sm font-bold text-claude-text-primary">Всього</td>
              <td className="px-4 py-2.5 text-sm text-right font-bold text-claude-text-primary font-mono">
                {formatNumber(totalDocs)}
              </td>
              <td className="px-4 py-2.5 text-sm text-right font-bold text-emerald-400 font-mono">
                {formatNumber(totalWithFt)}
              </td>
              <td className="px-4 py-2.5 text-sm text-right font-bold text-claude-text-primary font-mono">
                {totalDocs > 0 ? ((totalWithFt / totalDocs) * 100).toFixed(1) : '0'}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function AdminPGMonitoringPage() {
  const [data, setData] = useState<PGMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const resp = await adminApi.getPGMonitoring();
      setData(resp.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не вдалося завантажити дані';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-claude-text-primary">PG Моніторинг</h1>
          <p className="text-sm text-claude-text-secondary mt-1">
            ЄДРСР: метадані та повні тексти рішень по роках
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-claude-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-claude-border bg-claude-bg-secondary"
            />
            Авто-оновлення (30с)
          </label>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-claude-bg-secondary border border-claude-border rounded-lg hover:bg-claude-bg-tertiary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-claude-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="flex flex-wrap gap-6">
          {data.prod && <EdrsrTable data={data.prod} label="Production" />}
          {data.stage && <EdrsrTable data={data.stage} label="Stage" />}
          {data.local && <EdrsrTable data={data.local} label="Local" />}
          {!data.prod && !data.stage && !data.local && (
            <div className="text-claude-text-secondary text-sm py-10 text-center w-full">
              Немає даних з жодного середовища
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
