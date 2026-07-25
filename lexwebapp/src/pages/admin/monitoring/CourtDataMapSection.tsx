import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  RefreshCw,
  Plus,
  X,
  Play,
  Grid3X3,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import { getErrorMessage } from '../../../utils/errors';
import type { ScraperJob, CoverageMapData } from './types';
import { ScraperJobCard } from './ScraperJobCard';
import { JUSTICE_KINDS, DOC_FORMS, MONTHS_SHORT } from './constants';

export function CourtDataMapSection() {
  const [jobs, setJobs] = useState<ScraperJob[]>([]);
  const [mapData, setMapData] = useState<CoverageMapData | null>(null);
  const [mapYears, setMapYears] = useState(3);
  const [mapLoading, setMapLoading] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [starting, setStarting] = useState(false);
  const [config, setConfig] = useState({
    justice_kind: 'Кримінальне',
    justice_kind_id: '5',
    doc_form: '__all__',
    date_from: '01.01.2020',
    max_docs: 10000,
    concurrency: 5,
    proxy: 'none',
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.admin.getAllScraperJobs();
      setJobs(res.data.jobs || []);
    } catch { /* ignore */ }
  }, []);

  const loadMap = useCallback(async (years: number) => {
    setMapLoading(true);
    try {
      const res = await api.admin.getRegistryCoverageMap(years);
      setMapData(res.data);
    } catch { /* ignore */ } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMap(mapYears);
    loadJobs();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
    if (hasActive) {
      pollRef.current = setInterval(() => loadJobs(), 2500);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobs, loadJobs]);

  const handleCellClick = (jk: string, period: string) => {
    const [year, month] = period.split('-');
    const date_from = `01.${month}.${year}`;
    const found = JUSTICE_KINDS.find(k => k.id === jk);
    if (found) {
      setConfig(c => ({ ...c, justice_kind: found.value, justice_kind_id: found.id, date_from }));
    } else {
      setConfig(c => ({ ...c, date_from }));
    }
    setShowAddBatch(true);
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await api.admin.startCourtScraper(config);
      setShowAddBatch(false);
      await loadJobs();
    } catch (e: unknown) {
      alert(getErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (jobId: string) => {
    try { await api.admin.stopCourtScraper(jobId); await loadJobs(); } catch { /* ignore */ }
  };

  const handleDelete = async (jobId: string) => {
    try { await api.admin.deleteCourtScraperJob(jobId); await loadJobs(); } catch { /* ignore */ }
  };

  // Group periods by year for header rendering
  const periodsByYear = useMemo(() => {
    if (!mapData) return {} as Record<string, string[]>;
    const groups: Record<string, string[]> = {};
    for (const p of mapData.periods) {
      const year = p.split('-')[0];
      if (!groups[year]) groups[year] = [];
      groups[year].push(p);
    }
    return groups;
  }, [mapData]);

  const sortedYears = Object.keys(periodsByYear).sort();
  const activeCount = jobs.filter(j => j.status === 'running' || j.status === 'queued').length;

  // Build set of cell keys that have active (running/queued) jobs -> used for blink animation
  const activeCellKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const job of jobs) {
      if (job.status !== 'running' && job.status !== 'queued') continue;
      // date_from format: dd.mm.yyyy -> convert to YYYY-MM
      const parts = job.date_from.split('.');
      if (parts.length === 3) {
        const period = `${parts[2]}-${parts[1]}`;
        keys.add(`${job.justice_kind_id}-${period}`);
      }
    }
    return keys;
  }, [jobs]);

  return (
    <div className="space-y-4">
      {/* Coverage Map Card */}
      <div className="bg-white rounded-xl border border-claude-border p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Grid3X3 size={15} className="text-claude-subtext" />
            <span className="text-sm font-medium text-claude-text">Карта покриття реєстру</span>
            <select
              value={mapYears}
              onChange={e => { const y = Number(e.target.value); setMapYears(y); loadMap(y); }}
              className="text-xs border border-claude-border rounded px-1.5 py-0.5 bg-white text-claude-text"
            >
              <option value={2}>2 роки</option>
              <option value={3}>3 роки</option>
              <option value={5}>5 років</option>
            </select>
            <button onClick={() => loadMap(mapYears)} title="Оновити" className="text-claude-subtext hover:text-claude-text transition-colors">
              <RefreshCw size={13} className={mapLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <button
            onClick={() => setShowAddBatch(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} />
            Новий батч
            {activeCount > 0 && (
              <span className="ml-1 bg-blue-400 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">{activeCount}</span>
            )}
          </button>
        </div>

        {mapLoading && !mapData ? (
          <div className="h-24 flex items-center justify-center text-gray-400">
            <RefreshCw size={20} className="animate-spin" />
          </div>
        ) : mapData && mapData.justice_kinds.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Year header row */}
              <div className="flex mb-0.5">
                <div className="w-32 shrink-0" />
                {sortedYears.map(year => (
                  <div
                    key={year}
                    style={{ width: `${periodsByYear[year].length * 18}px` }}
                    className="text-center text-[9px] text-gray-400 font-medium border-l border-gray-200 px-1 overflow-hidden"
                  >
                    {year}
                  </div>
                ))}
              </div>

              {/* Month labels */}
              <div className="flex items-center mb-1.5">
                <div className="w-32 shrink-0" />
                {mapData.periods.map(period => {
                  const month = parseInt(period.split('-')[1]) - 1;
                  return (
                    <div key={period} className="w-[16px] mr-[2px] text-[8px] text-center text-gray-300 leading-none">
                      {MONTHS_SHORT[month]}
                    </div>
                  );
                })}
              </div>

              {/* Data rows: one per justice kind */}
              {mapData.justice_kinds.map(jk => (
                <div key={jk} className="flex items-center mb-[3px]">
                  <div className="w-32 text-[11px] text-right pr-3 text-gray-600 shrink-0 truncate" title={mapData.kind_labels[jk] || jk}>
                    {mapData.kind_labels[jk] || jk}
                  </div>
                  {mapData.periods.map(period => {
                    const count = mapData.cells[jk]?.[period] ?? 0;
                    const isActive = activeCellKeys.has(`${jk}-${period}`);
                    return (
                      <div
                        key={period}
                        onClick={() => handleCellClick(jk, period)}
                        title={`${mapData.kind_labels[jk] || jk} · ${period}: ${count.toLocaleString('uk')} документів\nКлік — запустити батч`}
                        className={`w-[16px] h-[16px] mr-[2px] rounded-[2px] cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-0 transition-all ${
                          isActive ? 'animate-pulse ring-2 ring-amber-400 ring-offset-0' : ''
                        } ${
                          count === 0 ? 'bg-gray-100 hover:bg-gray-200' :
                          count < 50 ? 'bg-sky-100' :
                          count < 200 ? 'bg-sky-300' :
                          count < 1000 ? 'bg-sky-500' :
                          count < 5000 ? 'bg-sky-700' :
                          'bg-sky-900'
                        }`}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-1.5 mt-3 ml-32">
                <span className="text-[9px] text-gray-400">0</span>
                {['bg-gray-100', 'bg-sky-100', 'bg-sky-300', 'bg-sky-500', 'bg-sky-700', 'bg-sky-900'].map(cls => (
                  <div key={cls} className={`w-3 h-3 rounded-[2px] ${cls} border border-gray-100`} />
                ))}
                <span className="text-[9px] text-gray-400">5000+</span>
                <span className="text-[9px] text-gray-300 ml-3">Клік на клітинку → запустити батч</span>
              </div>
            </div>
          </div>
        ) : !mapLoading ? (
          <div className="h-16 flex items-center justify-center text-xs text-gray-400">
            Даних для карти немає — запустіть перший батч скрапінгу
          </div>
        ) : null}
      </div>

      {/* Add Batch Form */}
      {showAddBatch && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-blue-900">Новий батч скрапінгу</span>
            <button onClick={() => setShowAddBatch(false)} className="text-blue-400 hover:text-blue-600 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-blue-700 mb-1">Вид судочинства</label>
              <select
                className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 bg-white"
                value={config.justice_kind}
                onChange={e => {
                  const found = JUSTICE_KINDS.find(k => k.value === e.target.value);
                  setConfig(c => ({ ...c, justice_kind: e.target.value, justice_kind_id: found?.id || '1' }));
                }}
              >
                {JUSTICE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">Форма документа</label>
              <select
                className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 bg-white"
                value={config.doc_form}
                onChange={e => setConfig(c => ({ ...c, doc_form: e.target.value }))}
              >
                {DOC_FORMS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">Дата від</label>
              <input
                type="text"
                className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 bg-white"
                placeholder="дд.мм.рррр"
                value={config.date_from}
                onChange={e => setConfig(c => ({ ...c, date_from: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">Макс. документів</label>
              <input
                type="number"
                className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 bg-white"
                min={100} max={50000} step={100}
                value={config.max_docs}
                onChange={e => setConfig(c => ({ ...c, max_docs: parseInt(e.target.value) || 10000 }))}
              />
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">Потоків: {config.concurrency}</label>
              <input
                type="range" min={1} max={8} step={1}
                value={config.concurrency}
                onChange={e => setConfig(c => ({ ...c, concurrency: parseInt(e.target.value) }))}
                className="w-full mt-1.5"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">З'єднання</label>
              <select
                className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 bg-white"
                value={config.proxy}
                onChange={e => setConfig(c => ({ ...c, proxy: e.target.value }))}
              >
                <option value="none">Без проксі (Direct)</option>
                <option value="mail">Проксі: mail.legal.org.ua</option>
                <option value="localdev">Проксі: local.legal.org.ua</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Play size={14} />
            {starting ? 'Запуск...' : 'Запустити батч'}
          </button>
        </div>
      )}

      {/* Active & Recent Jobs */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-claude-subtext">
              Батчі ({activeCount} активних з {jobs.length})
            </span>
            <button onClick={loadJobs} className="text-claude-subtext hover:text-claude-text transition-colors" title="Оновити">
              <RefreshCw size={11} />
            </button>
          </div>
          {jobs.slice(0, 10).map(job => (
            <ScraperJobCard key={job.job_id} job={job} onStop={handleStop} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
