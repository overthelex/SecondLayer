import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Award,
  MapPin,
  Calendar,
  LayoutGrid,
  List,
  ExternalLink,
  Loader2,
  Clock,
  X,
  Trash2,
} from 'lucide-react';
import { erauService, ERAULawyer, SearchHistoryEntry } from '../../services/api/ERAUService';
import { generateRoute } from '../../router/routes';
import { useAuth } from '../../contexts/AuthContext';

export function LawyersPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleSelectLawyer = (lawyer: ERAULawyer) => {
    const name = [lawyer.surname, lawyer.firstname, lawyer.middlename].filter(Boolean).join(' ');
    navigate(generateRoute.lawyerDetail(String(lawyer.id)), {
      state: {
        person: {
          type: 'lawyer',
          data: {
            id: String(lawyer.id),
            name,
            region: lawyer.racalc,
            certnum: lawyer.certnum,
            certat: lawyer.certat,
          },
        },
      },
    });
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ERAULawyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<'comfortable' | 'compact'>('comfortable');

  // History state
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount for authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      setHistoryLoading(true);
      erauService.getSearchHistory(20).then((data) => {
        setHistory(data);
        setHistoryLoading(false);
      }).catch(() => setHistoryLoading(false));
    }
  }, [isAuthenticated]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setShowHistory(false);

    try {
      const data = await erauService.searchLawyers(trimmed);
      setResults(data);

      // Save to history (fire-and-forget)
      if (isAuthenticated) {
        erauService.saveSearchHistory(trimmed, data.length).then((/* void */) => {
          // Refresh history list
          erauService.getSearchHistory(20).then(setHistory).catch(() => {});
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Не вдалося виконати пошук. Спробуйте пізніше.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryClick = (entry: SearchHistoryEntry) => {
    setSearchQuery(entry.query);
    setShowHistory(false);
    // Trigger search immediately
    setLoading(true);
    setError(null);
    setHasSearched(true);

    erauService.searchLawyers(entry.query).then((data) => {
      setResults(data);
      if (isAuthenticated) {
        erauService.saveSearchHistory(entry.query, data.length).then(() => {
          erauService.getSearchHistory(20).then(setHistory).catch(() => {});
        });
      }
    }).catch((err: any) => {
      setError(err?.message || 'Не вдалося виконати пошук. Спробуйте пізніше.');
      setResults([]);
    }).finally(() => {
      setLoading(false);
    });
  };

  const handleDeleteHistoryEntry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((h) => h.id !== id));
    await erauService.deleteSearchHistoryEntry(id);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    setShowHistory(false);
    await erauService.clearSearchHistory();
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatHistoryDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'щойно';
      if (minutes < 60) return `${minutes} хв тому`;
      if (hours < 24) return `${hours} год тому`;
      if (days < 7) return `${days} дн тому`;
      return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  const fullName = (l: ERAULawyer) =>
    [l.surname, l.firstname, l.middlename].filter(Boolean).join(' ');

  const initials = (l: ERAULawyer) => {
    const parts = [l.surname, l.firstname].filter(Boolean);
    return parts.map((p) => p[0]).join('');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
                Реєстр адвокатів
              </h1>
              <p className="text-claude-subtext font-sans">
                Пошук у Єдиному реєстрі адвокатів України (ЄРАУ)
              </p>
            </div>

            {hasSearched && results.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-claude-subtext bg-white px-3 py-1.5 rounded-lg border border-claude-border shadow-sm">
                <Award size={16} />
                <span className="font-sans">
                  {results.length} {results.length === 1 ? 'результат' : results.length < 5 ? 'результати' : 'результатів'}
                </span>
              </div>
            )}
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                {loading ? (
                  <Loader2 className="h-5 w-5 text-claude-accent animate-spin" />
                ) : (
                  <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
                )}
              </div>
              <input
                type="text"
                className="block w-full pl-11 pr-4 py-4 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
                placeholder="Введіть прізвище адвоката..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (isAuthenticated && history.length > 0 && !hasSearched) {
                    setShowHistory(true);
                  }
                }}
                disabled={loading}
              />

              {/* History Dropdown */}
              <AnimatePresence>
                {showHistory && history.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-claude-border rounded-xl shadow-lg z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-claude-border/50">
                      <span className="text-xs font-sans font-medium text-claude-subtext flex items-center gap-1.5">
                        <Clock size={12} />
                        Останні пошуки
                      </span>
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="text-xs text-claude-subtext hover:text-red-500 transition-colors font-sans flex items-center gap-1"
                      >
                        <Trash2 size={11} />
                        Очистити
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {history.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => handleHistoryClick(entry)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-claude-bg transition-colors text-left group/item"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Clock size={14} className="text-claude-subtext/50 flex-shrink-0" />
                            <span className="text-sm font-sans text-claude-text truncate">
                              {entry.query}
                            </span>
                            <span className="text-xs text-claude-subtext/60 font-sans flex-shrink-0">
                              {entry.result_count} рез.
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-claude-subtext/40 font-sans">
                              {formatHistoryDate(entry.created_at)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteHistoryEntry(e, entry.id)}
                              className="opacity-0 group-hover/item:opacity-100 p-0.5 text-claude-subtext/40 hover:text-red-400 transition-all"
                              title="Видалити"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={loading || searchQuery.trim().length < 2}
              className="px-6 py-4 bg-claude-accent text-white rounded-xl font-sans font-medium hover:bg-claude-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Шукати
            </button>

            {/* View Mode Toggle */}
            <div className="flex bg-white border border-claude-border rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewMode('comfortable')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'comfortable' ? 'bg-claude-accent text-white' : 'text-claude-subtext hover:text-claude-text'}`}
                title="Зручний вигляд"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'compact' ? 'bg-claude-accent text-white' : 'text-claude-subtext hover:text-claude-text'}`}
                title="Компактний вигляд"
              >
                <List size={18} />
              </button>
            </div>
          </form>
        </motion.div>

        {/* Click-away to close history dropdown */}
        {showHistory && (
          <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-sans"
          >
            {error}
          </motion.div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className={`grid ${viewMode === 'compact' ? 'grid-cols-1 gap-2' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}>
            {results.map((lawyer, index) => (
              <motion.div
                key={lawyer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 + 0.2 }}
                onClick={() => handleSelectLawyer(lawyer)}
                className={`group bg-white rounded-2xl border border-claude-border shadow-sm hover:shadow-md hover:border-claude-subtext/30 transition-all cursor-pointer relative overflow-hidden ${viewMode === 'compact' ? 'p-3' : 'p-5'}`}
              >
                <div className={`flex items-start gap-3 ${viewMode === 'compact' ? 'mb-2' : 'mb-4'}`}>
                  {viewMode === 'comfortable' && (
                    <div className="w-14 h-14 rounded-full bg-claude-sidebar border-2 border-white shadow-sm flex items-center justify-center text-xl font-serif text-claude-subtext flex-shrink-0">
                      {initials(lawyer)}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className={`font-serif font-medium text-claude-text group-hover:text-claude-accent transition-colors ${viewMode === 'compact' ? 'text-base' : 'text-lg'}`}>
                      {fullName(lawyer)}
                    </h3>
                    {lawyer.racalc && (
                      <p className={`text-claude-subtext font-sans mt-0.5 flex items-center gap-1 ${viewMode === 'compact' ? 'text-xs' : 'text-sm'}`}>
                        <MapPin size={viewMode === 'compact' ? 10 : 12} />
                        {lawyer.racalc}
                      </p>
                    )}
                  </div>
                  <a
                    href={`https://erau.unba.org.ua/profile/${lawyer.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-claude-subtext hover:text-claude-accent"
                    title="Відкрити в ЄРАУ"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>

                <div className={`grid grid-cols-2 gap-2 pt-3 border-t border-claude-border/50 ${viewMode === 'compact' ? 'text-xs' : ''}`}>
                  <div>
                    <div className={`flex items-center gap-1 text-claude-subtext mb-1 font-sans ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}>
                      <Award size={viewMode === 'compact' ? 10 : 12} />
                      <span>Свідоцтво</span>
                    </div>
                    <div className={`font-medium text-claude-text font-sans ${viewMode === 'compact' ? 'text-sm' : 'text-sm'}`}>
                      {lawyer.certnum || '—'}
                    </div>
                  </div>
                  <div className="border-l border-claude-border/50 pl-2">
                    <div className={`flex items-center gap-1 text-claude-subtext mb-1 font-sans ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}>
                      <Calendar size={viewMode === 'compact' ? 10 : 12} />
                      <span>Дата видачі</span>
                    </div>
                    <div className={`font-medium text-claude-text font-sans ${viewMode === 'compact' ? 'text-sm' : 'text-sm'}`}>
                      {formatDate(lawyer.certat)}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state - before search (with history) */}
        {!hasSearched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 bg-claude-bg rounded-full flex items-center justify-center mx-auto mb-4 text-claude-subtext border border-claude-border">
              <Search size={24} />
            </div>
            <h3 className="text-lg font-serif text-claude-text mb-2">
              Пошук адвокатів
            </h3>
            <p className="text-claude-subtext font-sans max-w-md mx-auto">
              Введіть прізвище адвоката для пошуку в Єдиному реєстрі адвокатів України
            </p>

            {/* Recent searches below empty state */}
            {isAuthenticated && !historyLoading && history.length > 0 && (
              <div className="mt-8 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-sans font-medium text-claude-subtext flex items-center gap-1.5">
                    <Clock size={12} />
                    Останні пошуки
                  </span>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-claude-subtext hover:text-red-500 transition-colors font-sans flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    Очистити
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {history.slice(0, 8).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => handleHistoryClick(entry)}
                      className="group/chip flex items-center gap-1.5 px-3 py-1.5 bg-white border border-claude-border rounded-full text-sm font-sans text-claude-text hover:border-claude-accent hover:text-claude-accent transition-all shadow-sm"
                    >
                      <Clock size={12} className="text-claude-subtext/40" />
                      {entry.query}
                      <span className="text-[10px] text-claude-subtext/50">({entry.result_count})</span>
                      <button
                        onClick={(e) => handleDeleteHistoryEntry(e, entry.id)}
                        className="opacity-0 group-hover/chip:opacity-100 ml-0.5 p-0.5 text-claude-subtext/40 hover:text-red-400 transition-all"
                      >
                        <X size={11} />
                      </button>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Empty state - no results */}
        {hasSearched && !loading && results.length === 0 && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 bg-claude-bg rounded-full flex items-center justify-center mx-auto mb-4 text-claude-subtext">
              <Search size={24} />
            </div>
            <h3 className="text-lg font-serif text-claude-text mb-2">
              Нічого не знайдено
            </h3>
            <p className="text-claude-subtext font-sans max-w-md mx-auto">
              Спробуйте змінити прізвище або перевірити правильність написання
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
