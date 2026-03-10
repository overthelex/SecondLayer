import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  ExternalLink,
  Gavel,
  Loader2,
  AlertCircle,
  Download,
  CheckCircle2,
  Eye,
  DownloadCloud,
} from 'lucide-react';
import { mcpService } from '../services';
import showToast from '../utils/toast';
import { useShallow } from 'zustand/react/shallow';
import { useDecisionsSearchStore } from '../stores/decisionsSearchStore';
import { useUIStore } from '../stores';
import { getErrorMessage } from '../utils/errors';

interface SearchFilters {
  query: string;
  dateFrom: string;
  dateTo: string;
  procedureCode: string;
  courtLevel: string;
}

interface CourtDecision {
  doc_id: number;
  court: string;
  chamber: string;
  date: string;
  case_number: string;
  url: string;
  snippets: string[];
}

const procedureCodes = [
  { value: '', label: 'Всі кодекси' },
  { value: 'gpc', label: 'Господарський (ГПК)' },
  { value: 'cpc', label: 'Цивільний (ЦПК)' },
  { value: 'cac', label: 'Адміністративний (КАС)' },
  { value: 'crpc', label: 'Кримінальний (КПК)' },
];

const courtLevels = [
  { value: '', label: 'Всі рівні' },
  { value: 'SC', label: 'Верховний Суд' },
  { value: 'AC', label: 'Апеляційні суди' },
  { value: 'FC', label: 'Суди першої інстанції' },
];

export function DecisionsSearchPage() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<'comfortable' | 'compact'>('comfortable');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<CourtDecision[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    dateFrom: '',
    dateTo: '',
    procedureCode: '',
    courtLevel: '',
  });

  const { downloadStatus, downloadedDecisions, availableInDB } = useDecisionsSearchStore(
    useShallow(s => ({
      downloadStatus: s.downloadStatus,
      downloadedDecisions: s.downloadedDecisions,
      availableInDB: s.availableInDB,
    }))
  );
  const checkAvailability = useDecisionsSearchStore(s => s.checkAvailability);
  const fetchFullText = useDecisionsSearchStore(s => s.fetchFullText);
  const fetchBatch = useDecisionsSearchStore(s => s.fetchBatch);

  const setRightPanelOpen = useUIStore(s => s.setRightPanelOpen);

  const handleSearch = async () => {
    if (!filters.query.trim()) {
      showToast.error('Введіть пошуковий запит');
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const params: any = {
        query: filters.query.trim(),
        limit: 20,
      };

      if (filters.procedureCode) {
        params.procedure_code = filters.procedureCode;
      }

      if (filters.courtLevel) {
        params.court_level = filters.courtLevel;
      }

      if (filters.dateFrom || filters.dateTo) {
        params.time_range = {};
        if (filters.dateFrom) params.time_range.from = filters.dateFrom;
        if (filters.dateTo) params.time_range.to = filters.dateTo;
      }

      const response = await mcpService.callTool('search_supreme_court_practice', params);

      let parsed: any = null;
      if (response?.result?.content?.[0]?.text) {
        parsed = JSON.parse(response.result.content[0].text);
      }

      if (parsed?.results) {
        setResults(parsed.results);
        setTotalResults(parsed.total_returned || parsed.results.length);

        // Check which results are already cached in DB
        const docIds = parsed.results
          .map((r: CourtDecision) => String(r.doc_id))
          .filter((id: string) => /^\d+$/.test(id));
        if (docIds.length > 0) {
          checkAvailability(docIds);
        }
      } else {
        setResults([]);
        setTotalResults(0);
      }
    } catch (err: unknown) {
      console.error('Search failed:', err);
      setError(getErrorMessage(err));
      setResults([]);
      setTotalResults(0);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
  };

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      query: '',
      dateFrom: '',
      dateTo: '',
      procedureCode: '',
      courtLevel: '',
    });
    setResults([]);
    setHasSearched(false);
    setError(null);
  };

  const handleDownload = async (docId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = await fetchFullText(docId);
    if (doc) {
      setSelectedDocId(docId);
      setRightPanelOpen(true);
    }
  };

  const handleView = (docId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedDocId(docId);
    setRightPanelOpen(true);
  };

  const handleBatchDownload = async () => {
    const numericIds = results
      .map(r => String(r.doc_id))
      .filter(id => /^\d+$/.test(id))
      .filter(id => downloadStatus[id] !== 'done' && downloadStatus[id] !== 'downloading');

    if (numericIds.length === 0) {
      showToast.error('Всі рішення вже завантажено');
      return;
    }

    await fetchBatch(numericIds.slice(0, 10));
  };

  const getStatusForDoc = (docId: string): string => {
    if (downloadStatus[docId]) return downloadStatus[docId];
    if (availableInDB.has(docId)) return 'cached';
    return 'idle';
  };

  // Expose selected decision for RightPanel to consume
  useEffect(() => {
    if (selectedDocId && downloadedDecisions[selectedDocId]) {
      // Decision available — RightPanel reads from store
    }
  }, [selectedDocId, downloadedDecisions]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
                Пошук судових рішень
              </h1>
              <p className="text-claude-subtext font-sans text-sm">
                Пошук в базі судових рішень України через ZakonOnline
              </p>
            </div>
          </div>

          {/* Search Form */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 space-y-4">
            {/* Single Search Input */}
            <div>
              <label className="block text-sm font-medium text-claude-text font-sans mb-2">
                Пошуковий запит
              </label>
              <input
                id="decisions-search-query"
                name="query"
                type="text"
                value={filters.query}
                onChange={(e) => updateFilter('query', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="номер справи, ключові слова, тема спору..."
                className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                autoFocus
              />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-claude-accent hover:text-[#C66345] transition-colors font-sans"
            >
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              Розширені фільтри
            </button>

            {/* Advanced Filters */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden space-y-4 pt-4 border-t border-claude-border"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-claude-text font-sans mb-2">
                        Процесуальний кодекс
                      </label>
                      <select
                        id="decisions-procedure-code"
                        name="procedureCode"
                        value={filters.procedureCode}
                        onChange={(e) => updateFilter('procedureCode', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                      >
                        {procedureCodes.map((pc) => (
                          <option key={pc.value} value={pc.value}>
                            {pc.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-claude-text font-sans mb-2">
                        Рівень суду
                      </label>
                      <select
                        id="decisions-court-level"
                        name="courtLevel"
                        value={filters.courtLevel}
                        onChange={(e) => updateFilter('courtLevel', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                      >
                        {courtLevels.map((cl) => (
                          <option key={cl.value} value={cl.value}>
                            {cl.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-claude-text font-sans mb-2">
                        Дата від
                      </label>
                      <input
                        id="decisions-date-from"
                        name="dateFrom"
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => updateFilter('dateFrom', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-claude-text font-sans mb-2">
                        Дата до
                      </label>
                      <input
                        id="decisions-date-to"
                        name="dateTo"
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => updateFilter('dateTo', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search Button */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="flex items-center gap-2 px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors shadow-sm font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Search size={18} />
                )}
                {isSearching ? 'Пошук...' : 'Знайти рішення'}
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-3 text-claude-text hover:bg-claude-bg rounded-xl transition-colors font-sans font-medium"
              >
                Скинути
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-sans">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* Results Header */}
        {hasSearched && !error && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-serif text-claude-text font-medium">
                Результати пошуку
              </h2>
              <span className="text-sm text-claude-subtext font-sans">
                {isSearching ? 'Пошук...' : `${totalResults} рішень знайдено`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Batch Download Button */}
              {results.length > 0 && (
                <button
                  onClick={handleBatchDownload}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-claude-accent hover:bg-claude-accent/10 rounded-lg transition-colors font-sans"
                  title="Завантажити всі (до 10)"
                >
                  <DownloadCloud size={16} />
                  <span className="hidden sm:inline">Завантажити всі</span>
                </button>
              )}

              {/* View Mode Toggle */}
              <div className="flex bg-white border border-claude-border rounded-xl p-1">
                <button
                  onClick={() => setViewMode('comfortable')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'comfortable' ? 'bg-claude-accent text-white' : 'text-claude-subtext hover:text-claude-text'}`}
                  title="Комфортний вигляд"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('compact')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'compact' ? 'bg-claude-accent text-white' : 'text-claude-subtext hover:text-claude-text'}`}
                  title="Компактний вигляд"
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isSearching && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={40} className="text-claude-accent animate-spin mb-4" />
            <p className="text-claude-subtext font-sans text-sm">Шукаємо судові рішення...</p>
          </div>
        )}

        {/* Empty State */}
        {hasSearched && !isSearching && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Gavel size={48} className="text-claude-border mb-4" />
            <h3 className="text-lg font-serif text-claude-text mb-2">Нічого не знайдено</h3>
            <p className="text-claude-subtext font-sans text-sm max-w-md">
              Спробуйте змінити пошуковий запит або розширити фільтри
            </p>
          </div>
        )}

        {/* Results */}
        {!isSearching && results.length > 0 && (
          <div className={viewMode === 'compact' ? 'space-y-2' : 'space-y-3'}>
            {results.map((decision, index) => {
              const docIdStr = String(decision.doc_id);
              const isNumeric = /^\d+$/.test(docIdStr);
              const status = getStatusForDoc(docIdStr);

              return (
                <motion.div
                  key={decision.doc_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className={`group block bg-white rounded-2xl border border-claude-border shadow-sm hover:shadow-md hover:border-claude-subtext/30 transition-all ${viewMode === 'compact' ? 'p-3' : 'p-5'} ${selectedDocId === docIdStr ? 'ring-2 ring-claude-accent/30' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    {viewMode === 'comfortable' && (
                      <div className="w-12 h-12 rounded-xl bg-claude-sidebar border-2 border-white shadow-sm flex items-center justify-center flex-shrink-0">
                        <Gavel size={20} className="text-claude-subtext" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3
                              className={`font-serif font-medium text-claude-text group-hover:text-claude-accent transition-colors ${viewMode === 'compact' ? 'text-base' : 'text-lg'}`}
                            >
                              {decision.case_number}
                            </h3>
                            {(status === 'done' || status === 'cached') && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded-full">
                                <CheckCircle2 size={10} />
                                {status === 'cached' ? 'В базі' : 'Завантажено'}
                              </span>
                            )}
                          </div>
                          <p className={`text-claude-text font-sans ${viewMode === 'compact' ? 'text-xs' : 'text-sm'}`}>
                            {decision.court}
                            {decision.chamber && decision.chamber !== decision.court && ` • ${decision.chamber}`}
                          </p>
                          {decision.snippets?.length > 0 && viewMode === 'comfortable' && (
                            <p className="text-sm text-claude-subtext font-sans mt-1 line-clamp-2">
                              {decision.snippets[0]}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          {/* Download/View button */}
                          {isNumeric && status !== 'done' && status !== 'cached' && (
                            <button
                              onClick={(e) => handleDownload(docIdStr, e)}
                              disabled={status === 'downloading'}
                              className="p-2 text-claude-accent hover:bg-claude-accent/10 rounded-lg transition-colors disabled:opacity-50"
                              title="Завантажити повний текст"
                            >
                              {status === 'downloading' ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Download size={16} />
                              )}
                            </button>
                          )}

                          {/* View button (for downloaded or cached) */}
                          {isNumeric && (status === 'done' || status === 'cached') && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // If cached but not yet fetched into store, fetch it
                                if (status === 'cached' && !downloadedDecisions[docIdStr]) {
                                  handleDownload(docIdStr, e);
                                } else {
                                  handleView(docIdStr, e);
                                }
                              }}
                              className="p-2 text-claude-accent hover:bg-claude-accent/10 rounded-lg transition-colors"
                              title="Переглянути"
                            >
                              <Eye size={16} />
                            </button>
                          )}

                          {/* External link */}
                          <a
                            href={decision.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Відкрити на ZakonOnline"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 ${viewMode === 'compact' ? 'text-xs' : 'text-sm'}`}>
                        <span className="text-claude-subtext font-sans">
                          {decision.date
                            ? new Date(decision.date).toLocaleDateString('uk-UA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })
                            : '—'}
                        </span>
                        <span className="text-claude-border">•</span>
                        <span className="text-claude-subtext font-sans text-xs">
                          ID: {decision.doc_id}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
