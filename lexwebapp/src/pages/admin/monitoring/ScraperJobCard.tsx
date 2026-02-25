import { useState } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Square,
  X,
} from 'lucide-react';
import type { ScraperJob } from './types';

export function ScraperJobCard({ job, onStop, onDelete }: { job: ScraperJob; onStop: (id: string) => void; onDelete: (id: string) => void }) {
  const isActive = job.status === 'running' || job.status === 'queued';
  const [logsOpen, setLogsOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-3 ${isActive ? 'border-blue-200 bg-blue-50' : job.status === 'completed' ? 'border-green-100 bg-green-50' : job.status === 'stopped' ? 'border-yellow-100 bg-yellow-50' : 'border-red-100 bg-red-50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isActive ? (
            <RefreshCw size={13} className="text-blue-600 animate-spin shrink-0" />
          ) : job.status === 'completed' ? (
            <CheckCircle size={13} className="text-green-600 shrink-0" />
          ) : job.status === 'stopped' ? (
            <Square size={13} className="text-yellow-600 shrink-0" />
          ) : (
            <XCircle size={13} className="text-red-600 shrink-0" />
          )}
          <span className="text-xs font-medium text-gray-800">{job.justice_kind}</span>
          <span className="text-[10px] text-gray-500">від {job.date_from}</span>
          {job.proxy ? (
            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] bg-orange-100 text-orange-700 font-medium">Proxy</span>
          ) : (
            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] bg-gray-100 text-gray-500">Direct</span>
          )}
          <span className="text-[10px] text-gray-400">{job.concurrency}×</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <button
              onClick={() => onStop(job.job_id)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-red-700 bg-red-100 border border-red-200 rounded hover:bg-red-200 transition-colors"
            >
              <Square size={9} /> Стоп
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => onDelete(job.job_id)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-500 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors"
              title="Видалити задачу"
            >
              <X size={9} /> Видалити
            </button>
          )}
          {job.current_logs && job.current_logs.length > 0 && (
            <button onClick={() => setLogsOpen(v => !v)} className="text-[10px] text-blue-600 hover:underline">
              {logsOpen ? 'Сховати' : 'Логи'}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] font-mono">
        <span className="text-gray-500">Стор: <span className="text-gray-800">{job.pages_processed}</span></span>
        <span className="text-gray-500">↓ <span className="text-blue-700">{job.downloaded}</span></span>
        <span className="text-gray-500">БД: <span className="text-green-700">{job.saved_to_db}</span></span>
        <span className="text-gray-500">Пропуск: <span className="text-yellow-700">{job.skipped}</span></span>
        {job.errors > 0 && <span className="text-red-600">Помилок: {job.errors}</span>}
      </div>
      {logsOpen && job.current_logs && job.current_logs.length > 0 && (
        <div className="mt-2 p-2 bg-slate-900 rounded text-[10px] font-mono text-green-400 max-h-28 overflow-y-auto">
          {job.current_logs.map((log, i) => <div key={i} className="truncate">{log}</div>)}
        </div>
      )}
    </div>
  );
}
