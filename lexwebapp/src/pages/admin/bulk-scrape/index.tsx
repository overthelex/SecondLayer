import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Database, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '../../../utils/api-client';
import { SectionLoader, SectionError, formatNumber, formatDate } from '../monitoring/shared';
import type { BulkScrapeStatusResponse, BulkScrapeJob, CourtBreakdown, JusticeKindBreakdown } from './types';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: 'Виконується', cls: 'bg-blue-50 text-blue-700' },
    completed: { label: 'Завершено', cls: 'bg-green-50 text-green-700' },
    done: { label: 'Завершено', cls: 'bg-green-50 text-green-700' },
    failed: { label: 'Помилка', cls: 'bg-red-50 text-red-700' },
    pending: { label: 'Очікує', cls: 'bg-gray-100 text-gray-600' },
    interrupted: { label: 'Перервано', cls: 'bg-yellow-50 text-yellow-700' },
  };
  const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-claude-bg rounded-lg">
          <Icon size={16} className="text-claude-text" />
        </div>
      </div>
      <div className="text-xl font-semibold text-claude-text font-mono">{value}</div>
      <div className="text-xs text-claude-subtext mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-claude-subtext/70 mt-1">{sub}</div>}
    </div>
  );
}

function duration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '\u2014';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export function AdminBulkScrapePage() {
  const [data, setData] = useState<BulkScrapeStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const resp = await api.admin.getBulkScrapeStatus();
      setData(resp.data as BulkScrapeStatusResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-poll when any job is running
  useEffect(() => {
    const hasRunning = data?.jobs?.some(j => j.status === 'running') ?? false;
    if (hasRunning && !polling) {
      setPolling(true);
      intervalRef.current = setInterval(() => fetchData(true), 5000);
    } else if (!hasRunning && polling) {
      setPolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.jobs, polling, fetchData]);

  if (loading && !data) return <div className="p-6"><SectionLoader /></div>;
  if (error && !data) return <div className="p-6"><SectionError message={error} onRetry={() => fetchData()} /></div>;

  const stats = data?.stats;
  const jobs = data?.jobs ?? [];
  const courtBreakdown = data?.court_breakdown ?? [];
  const justiceKindBreakdown = data?.justice_kind_breakdown ?? [];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-lg font-semibold text-claude-text">Пайплайн збору даних</h1>
            <p className="text-xs text-claude-subtext">Discovery &rarr; Enqueue &rarr; Download &rarr; Process</p>
          </div>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-claude-border hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Оновити
        </button>
      </div>

      {data?.message && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <AlertCircle size={16} />
          {data.message}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={Database}
            label="Всього документів"
            value={formatNumber(stats.total_court_docs)}
            sub="court_* в documents"
          />
          <KpiCard
            icon={FileText}
            label="З повним текстом"
            value={formatNumber(stats.with_full_text)}
            sub={`${formatNumber(stats.with_sections)} з секціями`}
          />
          <KpiCard
            icon={Clock}
            label="Без тексту (pending)"
            value={formatNumber(stats.without_full_text)}
            sub="Потребують завантаження"
          />
          <KpiCard
            icon={CheckCircle}
            label="Готовність"
            value={`${stats.completion_pct}%`}
            sub={`${formatNumber(stats.with_full_text)} / ${formatNumber(stats.total_court_docs)}`}
          />
        </div>
      )}

      {/* Jobs Table */}
      {jobs.length > 0 && (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-claude-border bg-gray-50">
            <h2 className="text-sm font-semibold text-claude-text">Jobs (bulk_scrape_jobs)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-claude-border bg-gray-50/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Job ID</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Phase</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Status</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Docs</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Failed</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Skipped</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Duration</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: BulkScrapeJob) => (
                  <tr key={job.job_id} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs text-claude-text">{job.job_id.slice(0, 12)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-claude-text">{job.phase || '\u2014'}</td>
                    <td className="px-4 py-2"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {job.status === 'running'
                        ? `${formatNumber(job.processed_docs)}/${formatNumber(job.total_docs)}`
                        : formatNumber(job.total_docs || job.processed_docs)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {job.failed_docs > 0 ? (
                        <span className="text-red-600">{formatNumber(job.failed_docs)}</span>
                      ) : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {job.skipped_docs > 0 ? formatNumber(job.skipped_docs) : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-xs text-claude-subtext">
                      {duration(job.started_at, job.completed_at)}
                    </td>
                    <td className="px-4 py-2 text-xs text-claude-subtext">{formatDate(job.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Court Breakdown */}
      {courtBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-claude-border bg-gray-50">
            <h2 className="text-sm font-semibold text-claude-text">По судам</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-claude-border bg-gray-50/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Суд</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Всього</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">З текстом</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Pending</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">%</th>
                </tr>
              </thead>
              <tbody>
                {courtBreakdown.map((row: CourtBreakdown) => {
                  const pct = row.total > 0 ? ((row.pending / row.total) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={row.court_name} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-xs text-claude-text max-w-[300px] truncate">{row.court_name}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(row.total)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{formatNumber(row.has_text)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-amber-700">{formatNumber(row.pending)}</td>
                      <td className="px-4 py-2 text-right text-xs text-claude-subtext">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Justice Kind Breakdown */}
      {justiceKindBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-claude-border bg-gray-50">
            <h2 className="text-sm font-semibold text-claude-text">По видам судочинства</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-claude-border bg-gray-50/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Вид</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Всього</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">З текстом</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Pending</th>
                </tr>
              </thead>
              <tbody>
                {justiceKindBreakdown.map((row: JusticeKindBreakdown) => (
                  <tr key={row.justice_kind} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-xs text-claude-text">{row.justice_kind}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(row.total)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{formatNumber(row.has_text)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-amber-700">{formatNumber(row.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {polling && (
        <div className="text-center text-xs text-claude-subtext">
          Auto-refresh кожні 5 секунд (є активні jobs)
        </div>
      )}
    </div>
  );
}
