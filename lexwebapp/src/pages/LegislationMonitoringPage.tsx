import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  Eye,
  Bell,
  BellOff,
  FileText,
  Calendar,
  CheckCircle,
  ArrowLeft,
  ExternalLink,
  Printer,
  Share2,
  BookOpen,
  History,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Clock,
  GitCompareArrows } from
'lucide-react';
import apiClient from '../utils/api-client';
import showToast from '../utils/toast';
import { toastT } from '../i18n/toast-i18n';
import { ChangeFeed } from '../components/legislation/ChangeFeed';

interface LegislationDocument {
  id: string;
  title: string;
  number: string;
  date: string;
  status: 'active' | 'amended' | 'repealed';
  type: string;
  rada_id: string;
  total_articles?: number;
  url?: string;
  effective_date?: string;
  last_amended_date?: string;
}

interface LegislationStructure {
  rada_id: string;
  title: string;
  short_title: string | null;
  type: string | null;
  total_articles: number;
  structure: any;
  articles: Array<{
    article_number: string;
    title: string;
    section_number: string | null;
    chapter_number: string | null;
    byte_size: number;
  }>;
  table_of_contents: any[];
}

interface ArticleContent {
  rada_id: string;
  article_number: string;
  title: string;
  full_text: string;
  full_text_html?: string;
  url: string;
}

interface HistoryEntry {
  article_number: string;
  title: string | null;
  version_date: string | null;
  created_at: string;
}

interface LegislationMonitoringPageProps {
  onBack?: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active: {
    label: 'Чинний',
    color: 'bg-green-50 text-green-700 border-green-200',
    icon: <CheckCircle size={12} className="text-green-600" />
  },
  amended: {
    label: 'Зі змінами',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock size={12} className="text-amber-600" />
  },
  repealed: {
    label: 'Втратив чинність',
    color: 'bg-red-50 text-red-700 border-red-200',
    icon: <XCircle size={12} className="text-red-600" />
  }
};

const typeLabels: Record<string, string> = {
  code: 'Кодекс',
  law: 'Закон',
  regulation: 'Постанова',
  constitution: 'Конституція',
};

const PAGE_SIZE = 50;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function LegislationMonitoringPage({
  onBack
}: LegislationMonitoringPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<LegislationDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const [selectedDocument, setSelectedDocument] = useState<LegislationDocument | null>(null);
  const [docStructure, setDocStructure] = useState<LegislationStructure | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  const [selectedArticle, setSelectedArticle] = useState<ArticleContent | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'text' | 'card' | 'history' | 'changes'>('card');
  const [filters, setFilters] = useState({
    type: '',
    dateFrom: '',
    dateTo: ''
  });

  // Stats from server
  const [stats, setStats] = useState<{ total: number; active: number; totalArticles: number } | null>(null);

  // Available types from server
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  // Subscriptions (server-side)
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  const [subscriptionLoading, setSubscriptionLoading] = useState<string | null>(null);

  // Top-level view tab
  const [viewTab, setViewTab] = useState<'list' | 'changes'>('list');

  // History tab
  const [amendmentHistory, setAmendmentHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Debounce timer for date filters
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stats, types, and subscriptions on mount
  useEffect(() => {
    apiClient.get('/api/legislation/stats').then(r => setStats(r.data)).catch(() => {});
    apiClient.get('/api/legislation/types').then(r => setAvailableTypes(r.data.types || [])).catch(() => {});
    apiClient.get('/api/legislation/monitoring/subscriptions').then(r => {
      const subs = new Set<string>((r.data.subscriptions || []).map((s: any) => s.rada_id));
      setSubscriptions(subs);
    }).catch(() => {});
  }, []);

  // Load legislation list
  const loadLegislation = useCallback(async (search?: string, currentOffset?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: currentOffset ?? offset,
      };
      if (search) params.search = search;
      if (filters.type) params.type = filters.type;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const response = await apiClient.get('/api/legislation', { params });
      const data = response.data;

      const mapped: LegislationDocument[] = data.items.map((item: any) => ({
        id: item.rada_id,
        title: item.title || item.short_title || item.rada_id,
        number: item.rada_id,
        date: formatDate(item.adoption_date || item.effective_date),
        status: item.status || 'active',
        type: item.type || '',
        rada_id: item.rada_id,
        total_articles: item.total_articles,
        url: item.url,
        effective_date: item.effective_date,
        last_amended_date: item.last_amended_date,
      }));

      setDocuments(mapped);
      setTotalCount(data.total);
    } catch (err: unknown) {
      console.error('Failed to load legislation:', err);
      setError('Не вдалося завантажити список законодавства');
    } finally {
      setLoading(false);
    }
  }, [offset, filters]);

  useEffect(() => {
    loadLegislation(searchQuery || undefined);
  }, [loadLegislation]);

  // Reload on filter changes (debounced for dates)
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setOffset(0);
  };

  const handleDateFilterChange = (key: 'dateFrom' | 'dateTo', value: string) => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    filterDebounceRef.current = setTimeout(() => {
      setOffset(0);
    }, 500);
  };

  // Search handler
  const handleSearch = () => {
    setOffset(0);
    loadLegislation(searchQuery || undefined, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Pagination
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  const handlePrevPage = () => {
    if (offset > 0) setOffset(offset - PAGE_SIZE);
  };

  const handleNextPage = () => {
    if (offset + PAGE_SIZE < totalCount) setOffset(offset + PAGE_SIZE);
  };

  // Subscriptions
  const toggleSubscription = async (radaId: string) => {
    setSubscriptionLoading(radaId);
    try {
      if (subscriptions.has(radaId)) {
        await apiClient.delete(`/api/legislation/monitoring/subscriptions/${encodeURIComponent(radaId)}`);
        setSubscriptions(prev => { const next = new Set(prev); next.delete(radaId); return next; });
        showToast.success(toastT('subscriptionCancelled'));
      } else {
        await apiClient.post('/api/legislation/monitoring/subscriptions', { rada_id: radaId });
        setSubscriptions(prev => { const next = new Set(prev); next.add(radaId); return next; });
        showToast.success(toastT('subscribedToChanges'));
      }
    } catch (err: any) {
      showToast.error(toastT('subscriptionChangeFailed'));
    } finally {
      setSubscriptionLoading(null);
    }
  };

  // Load document structure when selecting a document
  const handleSelectDocument = async (doc: LegislationDocument) => {
    setSelectedDocument(doc);
    setActiveTab('card');
    setSelectedArticle(null);
    setDocStructure(null);
    setAmendmentHistory([]);
    setStructureLoading(true);

    try {
      const response = await apiClient.get(`/api/legislation/${encodeURIComponent(doc.rada_id)}/structure`);
      setDocStructure(response.data);
    } catch (err: unknown) {
      console.error('Failed to load structure:', err);
    } finally {
      setStructureLoading(false);
    }
  };

  // Load article text
  const handleLoadArticle = async (articleNumber: string) => {
    if (!selectedDocument) return;
    setArticleLoading(true);
    setActiveTab('text');

    try {
      const response = await apiClient.get(
        `/api/legislation/${encodeURIComponent(selectedDocument.rada_id)}/article/${encodeURIComponent(articleNumber)}`
      );
      setSelectedArticle(response.data);
    } catch (err: unknown) {
      console.error('Failed to load article:', err);
      setSelectedArticle(null);
    } finally {
      setArticleLoading(false);
    }
  };

  // Load amendment history
  const handleLoadHistory = async () => {
    if (!selectedDocument || amendmentHistory.length > 0) return;
    setHistoryLoading(true);
    try {
      const response = await apiClient.get(`/api/legislation/${encodeURIComponent(selectedDocument.rada_id)}/history`);
      setAmendmentHistory(response.data.history || []);
    } catch (err: unknown) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // Share
  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      showToast.success(toastT('linkCopied'));
    }).catch(() => {
      showToast.error(toastT('copyFailed'));
    });
  };

  // ==================== DETAIL VIEW ====================
  if (selectedDocument) {
    return (
      <div className="flex-1 h-full overflow-y-auto bg-claude-bg">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-claude-border">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setSelectedDocument(null); setDocStructure(null); setSelectedArticle(null); setAmendmentHistory([]); }}
                className="p-2 hover:bg-claude-bg rounded-lg transition-colors">
                <ArrowLeft size={20} className="text-claude-text" />
              </button>
              <div className="flex-1">
                <h1 className="text-2xl font-sans text-claude-text font-medium">
                  {selectedDocument.title}
                </h1>
                <p className="text-sm text-claude-subtext font-sans">
                  № {selectedDocument.number} від {selectedDocument.date}
                  {selectedDocument.total_articles && ` | ${selectedDocument.total_articles} статей`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocument.url && (
                  <a
                    href={selectedDocument.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                    title="Відкрити на zakon.rada.gov.ua">
                    <ExternalLink size={20} />
                  </a>
                )}
                <button
                  onClick={() => toggleSubscription(selectedDocument.rada_id)}
                  disabled={subscriptionLoading === selectedDocument.rada_id}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors disabled:opacity-50"
                  title={subscriptions.has(selectedDocument.rada_id) ? 'Відписатися від змін' : 'Підписатися на зміни'}>
                  {subscriptionLoading === selectedDocument.rada_id
                    ? <Loader2 size={20} className="animate-spin" />
                    : subscriptions.has(selectedDocument.rada_id)
                      ? <Bell size={20} className="fill-claude-accent text-claude-accent" />
                      : <BellOff size={20} />
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {/* Tabs */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
            <div className="flex border-b border-claude-border">
              {[
                { id: 'card', label: 'Картка', icon: BookOpen },
                { id: 'text', label: 'Текст', icon: FileText },
                { id: 'changes', label: 'Зміни', icon: GitCompareArrows },
                { id: 'history', label: 'Історія', icon: History },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      if (tab.id === 'history') handleLoadHistory();
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium font-sans transition-colors relative ${activeTab === tab.id ? 'text-claude-accent bg-claude-accent/5' : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'}`}>
                    <Icon size={16} />
                    {tab.label}
                    {activeTab === tab.id &&
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-claude-accent" />
                    }
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {/* Card tab */}
              {activeTab === 'card' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6">

                  {/* Metadata */}
                  <div>
                    <h3 className="text-lg font-sans font-medium text-claude-text mb-4">
                      Метадані
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-claude-bg rounded-xl border border-claude-border">
                        <p className="text-xs text-claude-subtext font-sans mb-1">Тип документа</p>
                        <p className="text-sm font-medium text-claude-text font-sans">
                          {typeLabels[docStructure?.type || selectedDocument.type] || docStructure?.type || selectedDocument.type || '\u2014'}
                        </p>
                      </div>
                      <div className="p-4 bg-claude-bg rounded-xl border border-claude-border">
                        <p className="text-xs text-claude-subtext font-sans mb-1">Статус</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${statusConfig[selectedDocument.status]?.color || statusConfig.active.color}`}>
                          {statusConfig[selectedDocument.status]?.icon || statusConfig.active.icon}{' '}
                          {statusConfig[selectedDocument.status]?.label || selectedDocument.status}
                        </span>
                      </div>
                      <div className="p-4 bg-claude-bg rounded-xl border border-claude-border">
                        <p className="text-xs text-claude-subtext font-sans mb-1">Кількість статей</p>
                        <p className="text-sm font-medium text-claude-text font-sans">
                          {docStructure?.total_articles || selectedDocument.total_articles || '\u2014'}
                        </p>
                      </div>
                      <div className="p-4 bg-claude-bg rounded-xl border border-claude-border">
                        <p className="text-xs text-claude-subtext font-sans mb-1">Набув чинності</p>
                        <p className="text-sm font-medium text-claude-text font-sans">
                          {selectedDocument.effective_date ? formatDate(selectedDocument.effective_date) : selectedDocument.date}
                        </p>
                      </div>
                      {selectedDocument.last_amended_date && (
                        <div className="p-4 bg-claude-bg rounded-xl border border-claude-border md:col-span-2">
                          <p className="text-xs text-claude-subtext font-sans mb-1">Останні зміни</p>
                          <p className="text-sm font-medium text-claude-text font-sans">
                            {formatDate(selectedDocument.last_amended_date)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content Structure */}
                  <div>
                    <h3 className="text-lg font-sans font-medium text-claude-text mb-4">
                      Зміст документа
                    </h3>
                    {structureLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 size={24} className="animate-spin text-claude-accent" />
                        <span className="ml-2 text-sm text-claude-subtext font-sans">Завантаження структури...</span>
                      </div>
                    ) : docStructure?.articles && docStructure.articles.length > 0 ? (
                      <div className="space-y-1 max-h-96 overflow-y-auto">
                        {docStructure.articles.map((article) => (
                          <button
                            key={article.article_number}
                            onClick={() => handleLoadArticle(article.article_number)}
                            className="w-full flex items-center gap-3 p-3 bg-white border border-claude-border rounded-xl hover:border-claude-accent/30 hover:bg-claude-bg transition-all text-left group">
                            <FileText size={16} className="text-claude-subtext flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-sans text-claude-text">
                                Стаття {article.article_number}
                                {article.title && `. ${article.title}`}
                              </span>
                            </div>
                            <ChevronRight size={14} className="text-claude-subtext opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-claude-subtext font-sans text-sm">
                        Структура недоступна
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 pt-4 border-t border-claude-border">
                    {selectedDocument.url && (
                      <a
                        href={selectedDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors">
                        <ExternalLink size={16} />
                        Відкрити на Раді
                      </a>
                    )}
                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium font-sans hover:bg-claude-bg transition-colors">
                      <Printer size={16} />
                      Друк
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium font-sans hover:bg-claude-bg transition-colors">
                      <Share2 size={16} />
                      Поділитися
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Text tab */}
              {activeTab === 'text' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="prose max-w-none">
                  {articleLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-claude-accent" />
                      <span className="ml-2 text-sm text-claude-subtext font-sans">Завантаження статті...</span>
                    </div>
                  ) : selectedArticle ? (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-sans font-medium text-claude-text">
                          Стаття {selectedArticle.article_number}
                          {selectedArticle.title && `. ${selectedArticle.title}`}
                        </h3>
                        {selectedArticle.url && (
                          <a
                            href={selectedArticle.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-claude-accent hover:underline text-sm font-sans flex items-center gap-1">
                            <ExternalLink size={14} />
                            Джерело
                          </a>
                        )}
                      </div>
                      {selectedArticle.full_text_html ? (
                        <div
                          className="text-sm font-sans text-claude-text leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: selectedArticle.full_text_html }}
                        />
                      ) : (
                        <pre className="text-sm font-sans text-claude-text leading-relaxed whitespace-pre-wrap">
                          {selectedArticle.full_text}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <p className="text-claude-subtext font-sans">
                      Оберіть статтю у вкладці "Картка" для перегляду тексту
                    </p>
                  )}
                </motion.div>
              )}

              {/* Changes tab */}
              {activeTab === 'changes' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ChangeFeed radaId={selectedDocument.rada_id} />
                </motion.div>
              )}

              {/* History tab */}
              {activeTab === 'history' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-claude-accent" />
                      <span className="ml-2 text-sm text-claude-subtext font-sans">Завантаження історії...</span>
                    </div>
                  ) : amendmentHistory.length > 0 ? (
                    <div className="space-y-2">
                      {amendmentHistory.map((entry, i) => (
                        <div key={i} className="p-3 bg-claude-bg rounded-xl border border-claude-border">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-sans text-claude-text font-medium">
                              Стаття {entry.article_number}
                              {entry.title && `. ${entry.title}`}
                            </span>
                            <span className="text-xs text-claude-subtext font-sans">
                              {entry.version_date ? formatDate(entry.version_date) : formatDate(entry.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-claude-subtext font-sans text-sm">
                      Для цього документа немає збереженої історії змін.
                    </p>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>

          <div className="flex items-center gap-4 mb-6">
            {onBack &&
              <button
                onClick={onBack}
                className="p-2 hover:bg-white rounded-lg transition-colors border border-claude-border">
                <ArrowLeft size={20} className="text-claude-text" />
              </button>
            }
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BookOpen size={32} className="text-claude-accent" />
                <h1 className="text-3xl md:text-4xl font-sans text-claude-text font-medium tracking-tight">
                  Моніторинг законодавства
                </h1>
              </div>
              <p className="text-claude-subtext font-sans text-sm">
                Відстеження змін у законах та кодексах України
              </p>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
                </div>
                <input
                  id="legislation-search"
                  name="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Пошук законів, кодексів або статей..."
                  className="block w-full pl-11 pr-4 py-3 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans" />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors shadow-sm font-sans flex items-center gap-2 disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                Пошук
              </button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="legislation-date-from" className="block text-sm font-medium text-claude-text font-sans mb-2 flex items-center gap-2">
                  <Calendar size={16} />
                  Період
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="legislation-date-from"
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleDateFilterChange('dateFrom', e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans text-sm" />
                  <input
                    id="legislation-date-to"
                    name="dateTo"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleDateFilterChange('dateTo', e.target.value)}
                    className="w-full px-3 pr-8 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans text-sm" />
                </div>
              </div>

              <div>
                <label htmlFor="legislation-doc-type" className="block text-sm font-medium text-claude-text font-sans mb-2 flex items-center gap-2">
                  <Filter size={16} />
                  Тип документа
                </label>
                <select
                  id="legislation-doc-type"
                  name="documentType"
                  value={filters.type}
                  onChange={(e) => handleFilterChange({ ...filters, type: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans">
                  <option value="">Всі типи</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>{typeLabels[type] || type}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-claude-subtext font-sans mb-1">Всього документів</p>
                <p className="text-3xl font-sans font-bold text-claude-text">
                  {stats ? stats.total : '...'}
                </p>
              </div>
              <div className="p-2 bg-claude-accent/10 rounded-lg">
                <FileText size={20} className="text-claude-accent" />
              </div>
            </div>
            <p className="text-sm text-claude-subtext font-sans">в базі даних</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-claude-subtext font-sans mb-1">Чинних</p>
                <p className="text-3xl font-sans font-bold text-claude-text">
                  {stats ? stats.active : '...'}
                </p>
              </div>
              <div className="p-2 bg-claude-accent/10 rounded-lg">
                <CheckCircle size={20} className="text-claude-accent" />
              </div>
            </div>
            <p className="text-sm text-claude-subtext font-sans">в базі даних</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-claude-subtext font-sans mb-1">Статей</p>
                <p className="text-3xl font-sans font-bold text-claude-text">
                  {stats ? stats.totalArticles.toLocaleString('uk-UA') : '...'}
                </p>
              </div>
              <div className="p-2 bg-claude-accent/10 rounded-lg">
                <BookOpen size={20} className="text-claude-accent" />
              </div>
            </div>
            <p className="text-sm text-claude-subtext font-sans">проіндексовано</p>
          </motion.div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 font-sans">{error}</p>
            <button
              onClick={() => loadLegislation()}
              className="ml-auto text-sm text-red-600 hover:text-red-800 font-medium font-sans">
              Спробувати знову
            </button>
          </div>
        )}

        {/* View tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewTab('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium font-sans transition-colors ${viewTab === 'list' ? 'bg-claude-accent text-white' : 'bg-white border border-claude-border text-claude-text hover:bg-claude-bg'}`}>
            <FileText size={16} />
            Документи
          </button>
          <button
            onClick={() => setViewTab('changes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium font-sans transition-colors ${viewTab === 'changes' ? 'bg-claude-accent text-white' : 'bg-white border border-claude-border text-claude-text hover:bg-claude-bg'}`}>
            <GitCompareArrows size={16} />
            Зміни
            {subscriptions.size > 0 && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{subscriptions.size}</span>
            )}
          </button>
        </div>

        {viewTab === 'changes' ? (
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
            <ChangeFeed />
          </div>
        ) : (
        <>
        {/* Results Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-claude-subtext font-sans">
            Показано: {documents.length} з {totalCount}
          </p>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-claude-accent" />
                <span className="ml-3 text-claude-subtext font-sans">Завантаження...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <FileText size={48} className="text-claude-subtext/30 mb-4" />
                <p className="text-claude-subtext font-sans">
                  {searchQuery ? 'Нічого не знайдено' : 'Немає завантажених документів'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setOffset(0); loadLegislation(undefined, 0); }}
                    className="mt-2 text-sm text-claude-accent hover:underline font-sans">
                    Очистити пошук
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-claude-bg border-b border-claude-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      № з/п
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      Назва документа
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      Номер
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      Тип
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-claude-border">
                  {documents.map((doc, index) => (
                    <motion.tr
                      key={doc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.03, 0.5) }}
                      className="hover:bg-claude-bg transition-colors cursor-pointer"
                      onClick={() => handleSelectDocument(doc)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-subtext font-sans">
                        {offset + index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-claude-text font-sans font-medium">
                        <div>
                          {doc.title}
                          {doc.total_articles && (
                            <span className="ml-2 text-xs text-claude-subtext">
                              ({doc.total_articles} ст.)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-text font-sans">
                        {doc.number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-subtext font-sans">
                        {typeLabels[doc.type] || doc.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${statusConfig[doc.status]?.color || statusConfig.active.color}`}>
                          {statusConfig[doc.status]?.icon || statusConfig.active.icon}{' '}
                          {statusConfig[doc.status]?.label || doc.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectDocument(doc); }}
                            className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded transition-colors"
                            title="Переглянути">
                            <Eye size={16} />
                          </button>
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded transition-colors"
                              title="Відкрити на zakon.rada.gov.ua">
                              <ExternalLink size={16} />
                            </a>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSubscription(doc.rada_id); }}
                            disabled={subscriptionLoading === doc.rada_id}
                            className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded transition-colors disabled:opacity-50"
                            title={subscriptions.has(doc.rada_id) ? 'Відписатися від змін' : 'Підписатися на зміни'}>
                            {subscriptionLoading === doc.rada_id
                              ? <Loader2 size={16} className="animate-spin" />
                              : subscriptions.has(doc.rada_id)
                                ? <Bell size={16} className="fill-claude-accent text-claude-accent" />
                                : <BellOff size={16} />
                            }
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && !loading && documents.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-claude-border bg-claude-bg">
              <button
                onClick={handlePrevPage}
                disabled={offset === 0}
                className="flex items-center gap-1 px-3 py-2 text-sm font-sans text-claude-text bg-white border border-claude-border rounded-lg hover:bg-claude-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft size={16} />
                Попередня
              </button>
              <span className="text-sm text-claude-subtext font-sans">
                Сторінка {currentPage} з {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={offset + PAGE_SIZE >= totalCount}
                className="flex items-center gap-1 px-3 py-2 text-sm font-sans text-claude-text bg-white border border-claude-border rounded-lg hover:bg-claude-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Наступна
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
