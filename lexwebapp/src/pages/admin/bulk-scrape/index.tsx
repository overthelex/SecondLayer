import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Database, FileText, CheckCircle, Clock, AlertCircle, Cloud, Server } from 'lucide-react';
import { api } from '../../../utils/api-client';
import { SectionLoader, SectionError, formatNumber, formatDate } from '../monitoring/shared';
import type { BulkScrapeStatusResponse, BulkScrapeJob, CourtBreakdown, JusticeKindBreakdown, WorkerStats } from './types';
import { InfrastructureDiagram } from './InfrastructureDiagram';

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

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function WorkerTable({ workers }: { workers: WorkerStats[] }) {
  const onlineCount = workers.filter(w => w.online).length;
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-claude-border bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-purple-500" />
          <h2 className="text-sm font-semibold text-claude-text">EC2 Workers</h2>
        </div>
        <span className="text-xs text-claude-subtext">{onlineCount}/{workers.length} online</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-claude-border bg-gray-50/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext"></th>
              <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Worker</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">IP</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-claude-subtext">Uptime</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Recv</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">DL</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">UP</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Err</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">CAPTCHA</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Rate</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-claude-subtext">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.worker_id} className={`border-b border-claude-border/30 hover:bg-gray-50/50 ${!w.online ? 'opacity-40' : ''}`}>
                <td className="px-4 py-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${w.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                </td>
                <td className="px-4 py-2 font-mono text-xs text-claude-text">{w.worker_id_short}</td>
                <td className="px-4 py-2 font-mono text-xs text-claude-subtext">{w.ip || '\u2014'}</td>
                <td className="px-4 py-2 text-xs text-claude-subtext">{formatUptime(w.uptime_s)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(w.received)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(w.downloaded)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-green-700">{formatNumber(w.uploaded)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {w.errors > 0 ? <span className="text-red-600">{formatNumber(w.errors)}</span> : '\u2014'}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {w.captchas > 0 ? <span className="text-amber-600">{formatNumber(w.captchas)}</span> : '\u2014'}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-blue-600">{w.rate_docs_per_s.toFixed(2)}/s</td>
                <td className="px-4 py-2 text-right text-xs text-claude-subtext">{w.last_seen_s}s ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

  // Auto-poll when any job is running or AWS pipeline is active
  useEffect(() => {
    const hasRunning = data?.jobs?.some(j => j.status === 'running') ?? false;
    const awsActive = data?.aws_pipeline?.active ?? false;
    const hasWorkers = (data?.workers?.length ?? 0) > 0;
    const shouldPoll = hasRunning || awsActive || hasWorkers;
    if (shouldPoll && !polling) {
      setPolling(true);
      intervalRef.current = setInterval(() => fetchData(true), 10000);
    } else if (!shouldPoll && polling) {
      setPolling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.jobs, data?.aws_pipeline?.active, data?.workers?.length, polling, fetchData]);

  if (loading && !data) return <div className="p-6"><SectionLoader /></div>;
  if (error && !data) return <div className="p-6"><SectionError message={error} onRetry={() => fetchData()} /></div>;

  const stats = data?.stats;
  const jobs = data?.jobs ?? [];
  const awsPipeline = data?.aws_pipeline;
  const workers = data?.workers ?? [];
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

      {/* Infrastructure Diagram */}
      <InfrastructureDiagram hasRunningJob={(data?.jobs?.some(j => j.status === 'running') ?? false) || (data?.aws_pipeline?.active ?? false)} />

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

      {/* AWS Pipeline Stats */}
      {awsPipeline && (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-claude-border bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud size={14} className="text-blue-500" />
              <h2 className="text-sm font-semibold text-claude-text">AWS Pipeline (SQS → EC2 → S3)</h2>
            </div>
            {awsPipeline.active && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Active
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
            <div>
              <div className="text-xs text-claude-subtext mb-1">SQS Pending</div>
              <div className="text-lg font-semibold font-mono text-claude-text">{formatNumber(awsPipeline.sqs_pending)}</div>
              <div className="text-[10px] text-claude-subtext/70">In queue</div>
            </div>
            <div>
              <div className="text-xs text-claude-subtext mb-1">SQS In-Flight</div>
              <div className="text-lg font-semibold font-mono text-blue-600">{formatNumber(awsPipeline.sqs_in_flight)}</div>
              <div className="text-[10px] text-claude-subtext/70">Being processed</div>
            </div>
            <div>
              <div className="text-xs text-claude-subtext mb-1">S3 Downloaded</div>
              <div className="text-lg font-semibold font-mono text-green-600">{formatNumber(awsPipeline.s3_downloaded)}</div>
              <div className="text-[10px] text-claude-subtext/70">Raw HTML files</div>
            </div>
            <div>
              <div className="text-xs text-claude-subtext mb-1">DLQ (Failed)</div>
              <div className={`text-lg font-semibold font-mono ${awsPipeline.sqs_dlq > 0 ? 'text-red-600' : 'text-claude-text'}`}>
                {formatNumber(awsPipeline.sqs_dlq)}
              </div>
              <div className="text-[10px] text-claude-subtext/70">Dead letter queue</div>
            </div>
          </div>
          {awsPipeline.active && awsPipeline.sqs_pending > 0 && (
            <div className="px-4 pb-3">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, ((awsPipeline.s3_downloaded) / (awsPipeline.s3_downloaded + awsPipeline.sqs_pending + awsPipeline.sqs_in_flight)) * 100).toFixed(1)}%`
                  }}
                />
              </div>
              <div className="text-[10px] text-claude-subtext mt-1 text-right">
                {((awsPipeline.s3_downloaded) / (awsPipeline.s3_downloaded + awsPipeline.sqs_pending + awsPipeline.sqs_in_flight) * 100).toFixed(1)}% downloaded
              </div>
            </div>
          )}
        </div>
      )}

      {/* Worker Stats */}
      {workers.length > 0 && <WorkerTable workers={workers} />}

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
          Auto-refresh кожні 10 секунд
        </div>
      )}
    </div>
  );
}
