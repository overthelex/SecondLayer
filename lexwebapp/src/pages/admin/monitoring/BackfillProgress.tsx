import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Square,
  X,
} from 'lucide-react';
import type { BackfillJob } from './types';

export function BackfillProgress({ job, onStop, onRefresh, onDelete }: { job: BackfillJob; onStop: () => void; onRefresh: () => void; onDelete: () => void }) {
  const isActive = job.status === 'running' || job.status === 'queued';
  const progressPct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isActive ? (
            <RefreshCw size={14} className="text-blue-600 animate-spin" />
          ) : job.status === 'completed' ? (
            <CheckCircle size={14} className="text-green-600" />
          ) : job.status === 'stopped' ? (
            <Square size={14} className="text-yellow-600" />
          ) : (
            <XCircle size={14} className="text-red-600" />
          )}
          <span className="text-sm font-medium text-blue-900">
            {isActive ? 'Докачування...' : job.status === 'completed' ? 'Завершено' : job.status === 'stopped' ? 'Зупинено' : 'Помилка'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-700 bg-red-100 border border-red-200 rounded hover:bg-red-200 transition-colors"
            >
              <Square size={10} />
              Зупинити
            </button>
          )}
          {!isActive && (
            <>
              <button
                onClick={onDelete}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors"
                title="Видалити задачу"
              >
                <X size={10} /> Видалити
              </button>
              <button
                onClick={onRefresh}
                className="text-xs text-blue-600 hover:underline"
              >
                Приховати
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${job.status === 'completed' ? 'bg-green-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-blue-600'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs text-blue-800">
        <span>{job.processed}/{job.total} оброблено</span>
        <span className="text-green-700">{job.scraped} докачано</span>
        {job.errors > 0 && <span className="text-red-600">{job.errors} помилок</span>}
        <span className="text-blue-600">{progressPct}%</span>
        {(job.concurrency ?? 1) > 1 && <span className="text-purple-700">{job.concurrency} потоків</span>}
        {job.proxy && <span className="text-orange-700">проксі</span>}
      </div>

      {isActive && job.current_logs && job.current_logs.length > 0 && (
        <div className="mt-3 p-2 bg-slate-900 rounded text-[10px] font-mono text-green-400">
          {job.current_logs.map((log, i) => (
            <div key={i} className="truncate">{log}</div>
          ))}
        </div>
      )}

      {job.error_details.length > 0 && !isActive && (
        <details className="mt-2">
          <summary className="text-xs text-red-600 cursor-pointer">Деталі помилок ({job.error_details.length})</summary>
          <div className="mt-1 max-h-32 overflow-y-auto text-[10px] text-red-700 font-mono bg-red-50 p-2 rounded">
            {job.error_details.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}
