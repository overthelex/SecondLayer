import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Database,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Server,
  HardDrive,
  Clock,
  Layers,
  Scale,
  Download,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import { getErrorMessage } from '../../../utils/errors';
import type { BackendData, ServiceData, CourtDocsData, SectionState } from './types';
import {
  formatNumber,
  formatDate,
  ServiceStatusBadge,
  SummaryCard,
  SectionLoader,
  SectionError,
  DataTable,
  toTableInfoArray,
} from './shared';
import { CourtDocsSection } from './CourtDocsSection';
import { CourtDataMapSection } from './CourtDataMapSection';
import { DocumentCompletenessSection } from './DocumentCompletenessSection';
import { ImportSamplesSection } from './ImportSamplesSection';

export function AdminMonitoringPage() {
  const [backend, setBackend] = useState<SectionState<BackendData>>({ data: null, loading: true, error: null });
  const [rada, setRada] = useState<SectionState<ServiceData>>({ data: null, loading: true, error: null });
  const [openreyestr, setOpenreyestr] = useState<SectionState<ServiceData>>({ data: null, loading: true, error: null });
  const [courtDocs, setCourtDocs] = useState<SectionState<CourtDocsData>>({ data: null, loading: true, error: null });
  const [courtDocsDays, setCourtDocsDays] = useState(30);

  const fetchBackend = useCallback(async () => {
    setBackend(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.admin.getDataSources('backend');
      setBackend({ data: res.data, loading: false, error: null });
    } catch (err: unknown) {
      setBackend(prev => ({ ...prev, loading: false, error: getErrorMessage(err) }));
    }
  }, []);

  const fetchRada = useCallback(async () => {
    setRada(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.admin.getDataSources('rada');
      const d = res.data;
      if (d.error && Object.keys(d.tables || {}).length === 0) {
        setRada({ data: null, loading: false, error: d.error });
      } else {
        setRada({ data: d, loading: false, error: null });
      }
    } catch (err: unknown) {
      setRada(prev => ({ ...prev, loading: false, error: getErrorMessage(err) }));
    }
  }, []);

  const fetchOpenreyestr = useCallback(async () => {
    setOpenreyestr(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.admin.getDataSources('openreyestr');
      const d = res.data;
      if (d.error && Object.keys(d.tables || {}).length === 0) {
        setOpenreyestr({ data: null, loading: false, error: d.error });
      } else {
        setOpenreyestr({ data: d, loading: false, error: null });
      }
    } catch (err: unknown) {
      setOpenreyestr(prev => ({ ...prev, loading: false, error: getErrorMessage(err) }));
    }
  }, []);

  const fetchCourtDocs = useCallback(async (days?: number) => {
    const d = days ?? courtDocsDays;
    setCourtDocs(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.admin.getRecentCourtDocs(d, 5);
      setCourtDocs({ data: res.data, loading: false, error: null });
    } catch (err: unknown) {
      setCourtDocs(prev => ({ ...prev, loading: false, error: getErrorMessage(err) }));
    }
  }, [courtDocsDays]);

  const fetchAll = useCallback(() => {
    fetchBackend();
    fetchRada();
    fetchOpenreyestr();
    fetchCourtDocs();
  }, [fetchBackend, fetchRada, fetchOpenreyestr, fetchCourtDocs]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const anyLoading = backend.loading || rada.loading || openreyestr.loading;

  const backendRows = backend.data?.tables?.reduce((s, t) => s + t.rows, 0) || 0;
  const radaTables = rada.data ? toTableInfoArray(rada.data.tables) : [];
  const radaRows = radaTables.reduce((s, t) => s + t.rows, 0);
  const orTables = openreyestr.data ? toTableInfoArray(openreyestr.data.tables) : [];
  const orRows = orTables.reduce((s, t) => s + t.rows, 0);
  const totalRows = backendRows + radaRows + orRows;
  const totalTables = (backend.data?.tables?.length || 0) + radaTables.length + orTables.length;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-claude-text font-sans">Моніторинг джерел даних</h1>
        </div>
        <button
          onClick={fetchAll}
          disabled={anyLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={anyLoading ? 'animate-spin' : ''} />
          Оновити
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={Layers}
          label="Всього записів"
          value={formatNumber(totalRows)}
          sub={`${totalTables} таблиць`}
          loading={anyLoading && totalRows === 0}
        />
        <SummaryCard
          icon={HardDrive}
          label="Backend DB"
          value={`${backend.data?.dbSizeMb || 0} MB`}
          sub={`${formatNumber(backendRows)} записів`}
          status={backend.loading ? 'loading' : 'online'}
        />
        <SummaryCard
          icon={Server}
          label="RADA DB"
          value={rada.data ? `${rada.data.dbSizeMb || 0} MB` : '—'}
          sub={rada.loading ? 'Завантаження...' : rada.data ? `${formatNumber(radaRows)} записів` : 'Недоступний'}
          status={rada.loading ? 'loading' : rada.data ? 'online' : 'offline'}
        />
        <SummaryCard
          icon={Database}
          label="OpenReyestr DB"
          value={openreyestr.data ? `${openreyestr.data.dbSizeMb || 0} MB` : '—'}
          sub={openreyestr.loading ? 'Завантаження...' : openreyestr.data ? `${formatNumber(orRows)} записів` : 'Недоступний'}
          status={openreyestr.loading ? 'loading' : openreyestr.data ? 'online' : 'offline'}
        />
      </div>

      {/* Backend Sources */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-claude-subtext" />
            <h2 className="text-lg font-semibold text-claude-text font-sans">Backend (mcp_backend)</h2>
            {!backend.loading && <ServiceStatusBadge available={!backend.error} />}
          </div>
          {backend.data && (
            <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-1 rounded-full">
              PostgreSQL :5432 · {backend.data.dbSizeMb} MB
            </span>
          )}
        </div>
        {backend.loading ? (
          <SectionLoader />
        ) : backend.error ? (
          <SectionError message={backend.error} onRetry={fetchBackend} />
        ) : backend.data ? (
          <DataTable tables={backend.data.tables} />
        ) : null}
      </section>

      {/* Court Documents by Practice Area */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-claude-subtext" />
            <h2 className="text-lg font-semibold text-claude-text font-sans">Судові рішення за видами права</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={courtDocsDays}
              onChange={(e) => {
                const d = Number(e.target.value);
                setCourtDocsDays(d);
                fetchCourtDocs(d);
              }}
              className="text-xs border border-claude-border rounded-lg px-2 py-1.5 bg-white text-claude-text"
            >
              <option value={7}>7 днів</option>
              <option value={30}>30 днів</option>
              <option value={90}>90 днів</option>
              <option value={365}>1 рік</option>
            </select>
          </div>
        </div>
        <CourtDocsSection state={courtDocs} onRetry={() => fetchCourtDocs()} />
      </section>

      {/* Document Completeness Check */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle size={18} className="text-claude-subtext" />
          <h2 className="text-lg font-semibold text-claude-text font-sans">Перевірка повноти документів</h2>
        </div>
        <DocumentCompletenessSection />
      </section>

      {/* Court Registry Scraper */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Download size={18} className="text-claude-subtext" />
          <h2 className="text-lg font-semibold text-claude-text font-sans">Докачати документи з реєстру</h2>
        </div>
        <CourtDataMapSection />
      </section>

      {/* Import Samples - Recent Script Uploads */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-claude-subtext" />
          <h2 className="text-lg font-semibold text-claude-text font-sans">Зразки даних з останніх завантажень</h2>
        </div>
        <ImportSamplesSection />
      </section>

      {/* RADA Sources */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-claude-subtext" />
            <h2 className="text-lg font-semibold text-claude-text font-sans">RADA Server (mcp_rada)</h2>
            {!rada.loading && <ServiceStatusBadge available={!!rada.data} />}
          </div>
          {rada.data && (
            <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-1 rounded-full">
              PostgreSQL :5433 · {rada.data.dbSizeMb} MB
            </span>
          )}
        </div>
        {rada.loading ? (
          <SectionLoader />
        ) : rada.error ? (
          <SectionError message={rada.error} onRetry={fetchRada} />
        ) : radaTables.length > 0 ? (
          <DataTable tables={radaTables} />
        ) : (
          <div className="bg-white rounded-xl border border-claude-border p-8 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 text-yellow-500" />
            <p className="text-sm text-claude-subtext">RADA сервер не повертає статистику</p>
          </div>
        )}
      </section>

      {/* OpenReyestr Sources */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-claude-subtext" />
            <h2 className="text-lg font-semibold text-claude-text font-sans">OpenReyestr Server (mcp_openreyestr)</h2>
            {!openreyestr.loading && <ServiceStatusBadge available={!!openreyestr.data} />}
          </div>
          {openreyestr.data && (
            <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-1 rounded-full">
              PostgreSQL :5435 · {openreyestr.data.dbSizeMb} MB
            </span>
          )}
        </div>
        {openreyestr.loading ? (
          <SectionLoader />
        ) : openreyestr.error ? (
          <SectionError message={openreyestr.error} onRetry={fetchOpenreyestr} />
        ) : orTables.length > 0 ? (
          <DataTable tables={orTables} />
        ) : (
          <div className="bg-white rounded-xl border border-claude-border p-8 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 text-yellow-500" />
            <p className="text-sm text-claude-subtext">OpenReyestr сервер не повертає статистику</p>
          </div>
        )}
      </section>

      {/* Recent Imports (OpenReyestr) */}
      {openreyestr.data?.recentImports && openreyestr.data.recentImports.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-claude-subtext" />
            <h2 className="text-lg font-semibold text-claude-text font-sans">Останні імпорти (OpenReyestr)</h2>
          </div>
          <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-claude-border bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Реєстр</th>
                    <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Статус</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Імпортовано</th>
                    <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Помилок</th>
                    <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Завершено</th>
                  </tr>
                </thead>
                <tbody>
                  {openreyestr.data.recentImports.map((imp: any, i: number) => (
                    <tr key={i} className="border-b border-claude-border/30 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-xs font-medium text-claude-text">{imp.registry_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          imp.status === 'completed' ? 'bg-green-50 text-green-700' :
                          imp.status === 'failed' ? 'bg-red-50 text-red-700' :
                          'bg-yellow-50 text-yellow-700'
                        }`}>
                          {imp.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono">{formatNumber(imp.records_imported)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-mono">
                        <span className={imp.records_failed > 0 ? 'text-red-600' : ''}>{formatNumber(imp.records_failed)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-claude-subtext">{formatDate(imp.import_completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
