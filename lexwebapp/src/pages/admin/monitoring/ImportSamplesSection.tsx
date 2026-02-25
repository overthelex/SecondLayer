import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import type { ImportSamplesData } from './types';
import { formatDate, formatNumber, SectionLoader, SectionError } from './shared';
import { DocumentModal } from './DocumentModal';

export function ImportSamplesSection() {
  const [data, setData] = useState<ImportSamplesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchSamples = useCallback(async (h: number = hours) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getImportSamples(h, 5);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  const toggleSource = (source: string) => {
    const newSet = new Set(expandedSources);
    if (newSet.has(source)) {
      newSet.delete(source);
    } else {
      newSet.add(source);
    }
    setExpandedSources(newSet);
  };

  const openDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDocumentId(null);
  };

  if (loading && !data) return <SectionLoader />;
  if (error && !data) return <SectionError message={error} onRetry={() => fetchSamples()} />;

  const hasAnyData = data && data.samples && data.samples.length > 0;

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={hours}
          onChange={(e) => {
            const h = Number(e.target.value);
            setHours(h);
            fetchSamples(h);
          }}
          className="text-xs border border-claude-border rounded-lg px-2 py-1.5 bg-white text-claude-text"
        >
          <option value={1}>Остання година</option>
          <option value={6}>Останні 6 годин</option>
          <option value={12}>Останні 12 годин</option>
          <option value={24}>Останні 24 години</option>
          <option value={48}>Останні 2 дні</option>
          <option value={72}>Останні 3 дні</option>
          <option value={168}>Останній тиждень</option>
        </select>
        <button
          onClick={() => fetchSamples()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-claude-border rounded-lg hover:bg-claude-bg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Оновити
        </button>
        {data && (
          <span className="text-xs text-claude-subtext">
            Знайдено {data.samples.length} джерел
          </span>
        )}
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-claude-border p-3">
            <div className="text-lg font-semibold text-claude-text font-mono">{formatNumber(data.summary.court_decisions)}</div>
            <div className="text-[10px] text-claude-subtext">Судові рішення</div>
          </div>
          <div className="bg-white rounded-lg border border-claude-border p-3">
            <div className="text-lg font-semibold text-claude-text font-mono">{formatNumber(data.summary.legislation)}</div>
            <div className="text-[10px] text-claude-subtext">Законодавство</div>
          </div>
          <div className="bg-white rounded-lg border border-claude-border p-3">
            <div className="text-lg font-semibold text-claude-text font-mono">{formatNumber(data.summary.embeddings)}</div>
            <div className="text-[10px] text-claude-subtext">Вектори</div>
          </div>
          <div className="bg-white rounded-lg border border-claude-border p-3">
            <div className="text-lg font-semibold text-claude-text font-mono">{formatNumber(data.summary.user_uploads)}</div>
            <div className="text-[10px] text-claude-subtext">Завантаження</div>
          </div>
        </div>
      )}

      {/* Samples by source */}
      {hasAnyData ? (
        <div className="space-y-3">
          {data?.samples.map((sample) => (
            <div key={sample.source} className="bg-white rounded-xl border border-claude-border overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggleSource(sample.source)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedSources.has(sample.source) ? (
                    <ChevronUp size={14} className="text-claude-subtext" />
                  ) : (
                    <ChevronDown size={14} className="text-claude-subtext" />
                  )}
                  <span className="font-medium text-sm text-claude-text">{sample.source_name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                    {formatNumber(sample.count)}
                  </span>
                </div>
                <span className="text-[10px] text-claude-subtext">
                  {formatDate(sample.last_import)}
                </span>
              </button>

              {/* Records */}
              {expandedSources.has(sample.source) && (
                <div className="border-t border-claude-border/30">
                  {sample.records.map((record, idx) => (
                    <div key={`${record.id}-${idx}`} className="px-4 py-2 border-b border-claude-border/20 last:border-b-0 hover:bg-gray-50/30">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {record.title && (
                            <div className="text-xs text-claude-text truncate cursor-pointer hover:text-blue-600" title={record.title} onClick={() => openDocument(record.id)}>
                              {record.title}
                            </div>
                          )}
                          {record.document_title && (
                            <div className="text-xs text-claude-text truncate" title={record.document_title}>
                              {record.document_title}
                            </div>
                          )}
                          {record.name && (
                            <div className="text-xs text-claude-text truncate">
                              {record.name}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-claude-subtext">
                            {record.court && <span>{record.court}</span>}
                            {record.case_number && <span className="font-mono">{record.case_number}</span>}
                            {record.category && <span className="text-blue-600">{record.category}</span>}
                            {record.justice_kind && <span className="text-purple-600">Вид: {record.justice_kind}</span>}
                            {record.type && <span className="text-green-600">{record.type}</span>}
                            {record.rada_id && <span className="font-mono">ID: {record.rada_id}</span>}
                            {record.status && <span className="text-orange-600">{record.status}</span>}
                            {record.vector_id && <span className="font-mono text-xs">{record.vector_id.substring(0, 20)}...</span>}
                            {record.document_section_id && <span className="text-gray-500">Секція</span>}
                            {record.user_email && <span>{record.user_email}</span>}
                            {record.user_name && <span>{record.user_name}</span>}
                            {record.domain && <span className="text-gray-500">{record.domain}</span>}
                            <span className="text-gray-400">{formatDate(record.created_at)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => openDocument(record.id)}
                          className="flex-shrink-0 p-1.5 text-claude-subtext hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Переглянути документ"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="bg-white rounded-xl border border-claude-border p-8 text-center">
          <Database size={24} className="mx-auto mb-2 text-claude-subtext" />
          <p className="text-sm text-claude-subtext">Немає нових даних за обраний період</p>
          <p className="text-[10px] text-claude-subtext/70 mt-1">
            Скрипти імпорту не запускалися або не додали нових записів за {hours} год
          </p>
        </div>
      ) : null}

      {/* Document Modal */}
      <DocumentModal
        documentId={selectedDocumentId}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </div>
  );
}
