import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Play,
  Download,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import type { CompletenessResult, BackfillJob } from './types';
import { formatDate, formatNumber, completenessColor, completenessBg } from './shared';
import { BackfillProgress } from './BackfillProgress';

export function DocumentCompletenessSection() {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Backfill state
  const [backfillJob, setBackfillJob] = useState<BackfillJob | null>(null);
  const [backfillStarting, setBackfillStarting] = useState(false);
  const [backfillConfig, setBackfillConfig] = useState({
    justice_kind_code: 'all',
    limit: 200,
    concurrency: 1,
    proxy: 'none',
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollBackfillStatus = useCallback((jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.admin.getBackfillStatus(jobId);
        const job = res.data;
        setBackfillJob(job);
        if (job.status !== 'running' && job.status !== 'queued') {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, 2000);
  }, [stopPolling]);

  // Check for active backfill on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.admin.getBackfillStatus();
        if (res.data.active && res.data.job) {
          setBackfillJob(res.data.job);
          pollBackfillStatus(res.data.job.job_id);
        } else if (res.data.job && res.data.job.status !== 'running' && res.data.job.status !== 'queued') {
          // Show last completed job briefly
          setBackfillJob(res.data.job);
        }
      } catch { /* no active job */ }
    })();
    return stopPolling;
  }, [pollBackfillStatus, stopPolling]);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.runDocumentCompletenessCheck();
      setResult(res.data);
      if (res.data.runs_today >= res.data.max_runs_per_day) {
        setLimitReached(true);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setLimitReached(true);
        setError(err.response?.data?.error || 'Ліміт вичерпано');
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const startBackfill = async (justiceKindCode?: string) => {
    setBackfillStarting(true);
    try {
      const res = await api.admin.startBackfillFulltext({
        justice_kind_code: justiceKindCode || backfillConfig.justice_kind_code,
        limit: backfillConfig.limit,
        concurrency: backfillConfig.concurrency,
        proxy: backfillConfig.proxy,
      });
      const job = { ...res.data, processed: 0, scraped: 0, errors: 0, error_details: [], started_at: new Date().toISOString() } as BackfillJob;
      setBackfillJob(job);
      pollBackfillStatus(res.data.job_id);
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Already running — fetch status
        try {
          const statusRes = await api.admin.getBackfillStatus();
          if (statusRes.data.job) {
            setBackfillJob(statusRes.data.job);
            pollBackfillStatus(statusRes.data.job.job_id);
          }
        } catch { /* ignore */ }
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setBackfillStarting(false);
    }
  };

  const stopBackfill = async () => {
    if (!backfillJob) return;
    try {
      await api.admin.stopBackfill(backfillJob.job_id);
    } catch { /* ignore */ }
  };

  const deleteBackfill = async () => {
    if (!backfillJob) return;
    try {
      await api.admin.deleteBackfillJob(backfillJob.job_id);
      setBackfillJob(null);
      stopPolling();
    } catch { /* ignore */ }
  };

  const isBackfillActive = backfillJob && (backfillJob.status === 'running' || backfillJob.status === 'queued');

  const displayData = backfillJob?.completeness ?? result;

  return (
    <div>
      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={runCheck}
          disabled={loading || limitReached}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {limitReached ? 'Ліміт вичерпано' : 'Запустити перевірку'}
        </button>

        {result && result.summary.missing_both > 0 && !isBackfillActive && (
          <button
            onClick={() => startBackfill()}
            disabled={backfillStarting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backfillStarting ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Докачати всі ({formatNumber(result.summary.missing_both)})
          </button>
        )}

        {result && (
          <span className="text-xs text-claude-subtext">
            {result.runs_today}/{result.max_runs_per_day} перевірок сьогодні · {formatDate(result.checked_at)}
          </span>
        )}
      </div>

      {/* Backfill Configuration */}
      {!isBackfillActive && (
        <div className="bg-gray-50 border border-claude-border rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-claude-text mb-3">Конфігурація докачування</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-claude-subtext mb-1">Вид права</label>
              <select
                value={backfillConfig.justice_kind_code}
                onChange={(e) => setBackfillConfig(c => ({ ...c, justice_kind_code: e.target.value }))}
                className="w-full text-xs border border-claude-border rounded px-2 py-1.5 bg-white text-claude-text"
              >
                <option value="all">Всі види</option>
                {result?.by_justice_kind.map(jk => (
                  <option key={jk.justice_kind_code} value={jk.justice_kind_code}>
                    {jk.justice_kind} ({formatNumber(jk.missing_both)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-claude-subtext mb-1">Лімит документів</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={backfillConfig.limit}
                onChange={(e) => setBackfillConfig(c => ({ ...c, limit: Math.min(1000, Math.max(1, parseInt(e.target.value) || 200)) }))}
                className="w-full text-xs border border-claude-border rounded px-2 py-1.5 bg-white text-claude-text"
              />
            </div>
            <div>
              <label className="block text-xs text-claude-subtext mb-1">Потоків: {backfillConfig.concurrency}</label>
              <input
                type="range"
                min={1}
                max={10}
                value={backfillConfig.concurrency}
                onChange={(e) => setBackfillConfig(c => ({ ...c, concurrency: parseInt(e.target.value) }))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-claude-subtext mb-1">Проксі</label>
              <select
                value={backfillConfig.proxy}
                onChange={(e) => setBackfillConfig(c => ({ ...c, proxy: e.target.value }))}
                className="w-full text-xs border border-claude-border rounded px-2 py-1.5 bg-white text-claude-text"
              >
                <option value="none">Без проксі</option>
                <option value="mail">Mail Server (порт 8888)</option>
                <option value="localdev">LocalDev (порт 8888)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Backfill progress */}
      {backfillJob && (
        <BackfillProgress
          job={backfillJob}
          onStop={stopBackfill}
          onRefresh={() => setBackfillJob(null)}
          onDelete={deleteBackfill}
        />
      )}

      {error && !result && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {(result || (backfillJob?.completeness)) && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-claude-border p-3">
              <div className="text-lg font-semibold text-claude-text font-mono">
                {formatNumber(backfillJob?.completeness?.summary.total_documents ?? result?.summary.total_documents)}
              </div>
              <div className="text-[10px] text-claude-subtext">Всього документів</div>
            </div>
            <div className={`rounded-lg border border-claude-border p-3 ${completenessBg(backfillJob?.completeness?.summary.completeness_pct ?? result?.summary.completeness_pct ?? 0)}`}>
              <div className={`text-lg font-semibold font-mono ${completenessColor(backfillJob?.completeness?.summary.completeness_pct ?? result?.summary.completeness_pct ?? 0)}`}>
                {backfillJob?.completeness?.summary.completeness_pct ?? result?.summary.completeness_pct ?? 0}%
              </div>
              <div className="text-[10px] text-claude-subtext">Повнота (обидва поля)</div>
            </div>
            <div className="bg-white rounded-lg border border-claude-border p-3">
              <div className="text-lg font-semibold text-green-700 font-mono">
                {formatNumber(backfillJob?.completeness?.summary.with_both ?? result?.summary.with_both ?? 0)}
              </div>
              <div className="text-[10px] text-claude-subtext">З обома полями</div>
            </div>
            <div className="bg-white rounded-lg border border-claude-border p-3">
              <div className="text-lg font-semibold text-orange-700 font-mono">
                {formatNumber(backfillJob?.completeness?.summary.with_only_html ?? result?.summary.with_only_html ?? 0)}
              </div>
              <div className="text-[10px] text-claude-subtext">Тільки HTML</div>
            </div>
            <div className={`rounded-lg border border-claude-border p-3 ${(backfillJob?.completeness?.summary.missing_both ?? result?.summary.missing_both ?? 0) > 0 ? 'bg-red-50' : 'bg-white'}`}>
              <div className={`text-lg font-semibold font-mono ${(backfillJob?.completeness?.summary.missing_both ?? result?.summary.missing_both ?? 0) > 0 ? 'text-red-600' : 'text-claude-text'}`}>
                {formatNumber(backfillJob?.completeness?.summary.missing_both ?? result?.summary.missing_both ?? 0)}
              </div>
              <div className="text-[10px] text-claude-subtext">Без обох полів</div>
            </div>
          </div>

          {/* Breakdown table */}
          <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-claude-border bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Вид права</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Всього</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Plaintext</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Тільки HTML</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Обидва</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Відсутні</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Повнота %</th>
                    <th className="text-center px-4 py-2.5 font-medium text-claude-subtext text-xs">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData?.by_justice_kind.map((row) => (
                    <tr key={row.justice_kind_code} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-xs text-claude-text">{row.justice_kind}</div>
                        <div className="text-[10px] text-claude-subtext font-mono">{row.justice_kind_code}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{formatNumber(row.total)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{formatNumber(row.has_plaintext)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-orange-700">{formatNumber(row.has_only_html ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-green-700">{formatNumber(row.has_both)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        <span className={row.missing_both > 0 ? 'text-red-600' : ''}>{formatNumber(row.missing_both)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${completenessBg(row.completeness_pct)} ${completenessColor(row.completeness_pct)}`}>
                          {row.completeness_pct}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.missing_both > 0 && !isBackfillActive && (
                          <button
                            onClick={() => startBackfill(row.justice_kind_code)}
                            disabled={backfillStarting}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                            title={`Докачати ${row.missing_both} документів`}
                          >
                            <Download size={10} />
                            Докачати
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Summary row */}
                  <tr className="border-t-2 border-claude-border bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5 text-xs text-claude-text">Всього</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{formatNumber(displayData?.summary.total_documents ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{formatNumber(displayData?.summary.with_plaintext ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-orange-700">{formatNumber(displayData?.summary.with_only_html ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-green-700">{formatNumber(displayData?.summary.with_both ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <span className={(displayData?.summary.missing_both ?? 0) > 0 ? 'text-red-600' : ''}>{formatNumber(displayData?.summary.missing_both ?? 0)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${completenessBg(displayData?.summary.completeness_pct ?? 0)} ${completenessColor(displayData?.summary.completeness_pct ?? 0)}`}>
                        {displayData?.summary.completeness_pct ?? 0}%
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
