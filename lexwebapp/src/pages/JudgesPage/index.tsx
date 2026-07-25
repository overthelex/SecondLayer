import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Scale,
  ChevronRight,
  Calendar,
  LayoutGrid,
  List,
  Loader2,
  BarChart3,
  Users,
} from 'lucide-react';
import { useJudges } from '../../hooks/queries/useJudges';
import { Judge } from '../../services/api/JudgesService';
import { generateRoute } from '../../router/routes';
import { JudgeAnalyticsTable } from './JudgeAnalyticsTable';

type TabType = 'analytics' | 'search';

export function JudgesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('analytics');

  const handleSelectJudge = (judge: Judge) => {
    navigate(generateRoute.judgeDetail(judge.dossier_number || judge.full_name), {
      state: {
        person: {
          type: 'judge',
          data: {
            id: judge.id,
            name: judge.full_name,
            position: judge.court_name,
            dossier_number: judge.dossier_number,
          },
        },
      },
    });
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<'comfortable' | 'compact'>('comfortable');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
    setDebounceTimer(timer);
  };

  const searchParams = useMemo(
    () => (debouncedSearch.trim() ? { search: debouncedSearch.trim(), limit: 50 } : { limit: 50 }),
    [debouncedSearch]
  );

  const { data, isLoading, isError, error } = useJudges(searchParams);

  const judges = data?.judges ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
                Судді
              </h1>
              <p className="text-claude-subtext font-sans">
                Аналітика та пошук по суддівському корпусу
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-claude-subtext bg-white px-3 py-1.5 rounded-lg border border-claude-border shadow-sm">
              <Scale size={16} />
              <span className="font-sans">
                {total.toLocaleString('uk-UA')} суддів у базі
              </span>
            </div>
          </div>

          {/* Tab Toggle */}
          <div className="flex bg-white border border-claude-border rounded-xl p-1 w-fit">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans transition-all ${
                activeTab === 'analytics'
                  ? 'bg-claude-accent text-white shadow-sm'
                  : 'text-claude-subtext hover:text-claude-text'
              }`}
            >
              <BarChart3 size={16} />
              Аналітика
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans transition-all ${
                activeTab === 'search'
                  ? 'bg-claude-accent text-white shadow-sm'
                  : 'text-claude-subtext hover:text-claude-text'
              }`}
            >
              <Users size={16} />
              Пошук суддів
            </button>
          </div>
        </motion.div>

        {/* Analytics Tab */}
        {activeTab === 'analytics' && <JudgeAnalyticsTable />}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <>
            {/* Search Bar */}
            <div className="flex gap-3">
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 text-claude-subtext animate-spin" />
                  ) : (
                    <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
                  )}
                </div>
                <input
                  type="text"
                  className="block w-full pl-11 pr-4 py-4 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
                  placeholder="Пошук за прізвищем судді або назвою суду..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex bg-white border border-claude-border rounded-xl p-1">
                <button
                  onClick={() => setViewMode('comfortable')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'comfortable' ? 'bg-claude-accent text-white' : 'text-claude-subtext hover:text-claude-text'}`}
                  title="Зручний вигляд"
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

            {/* Error State */}
            {isError && (
              <div className="text-center py-8">
                <p className="text-red-500 font-sans">
                  Помилка завантаження: {(error as any)?.message || 'Невідома помилка'}
                </p>
              </div>
            )}

            {/* Results Grid */}
            <div
              className={`grid ${viewMode === 'compact' ? 'grid-cols-1 gap-2' : 'grid-cols-1 md:grid-cols-2 gap-4'}`}
            >
              {judges.map((judge, index) => (
                <motion.div
                  key={judge.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 + 0.2 }}
                  onClick={() => handleSelectJudge(judge)}
                  className={`group bg-white rounded-2xl border border-claude-border shadow-sm hover:shadow-md hover:border-claude-subtext/30 transition-all cursor-pointer relative overflow-hidden ${viewMode === 'compact' ? 'p-3' : 'p-5'}`}
                >
                  <div className="absolute top-0 right-0 p-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-x-2 group-hover:translate-x-0">
                    <ChevronRight className="text-claude-subtext" />
                  </div>

                  <div className={`flex items-start gap-3 ${viewMode === 'compact' ? 'mb-2' : 'mb-4'}`}>
                    {viewMode === 'comfortable' && (
                      <div className="w-14 h-14 rounded-full bg-claude-sidebar border-2 border-white shadow-sm flex items-center justify-center text-xl font-serif text-claude-subtext flex-shrink-0">
                        {judge.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </div>
                    )}
                    <div className="flex-1">
                      <h3
                        className={`font-serif font-medium text-claude-text group-hover:text-claude-accent transition-colors ${viewMode === 'compact' ? 'text-base' : 'text-lg'}`}
                      >
                        {judge.full_name}
                      </h3>
                      <p
                        className={`text-claude-subtext font-sans mt-0.5 line-clamp-1 ${viewMode === 'compact' ? 'text-xs' : 'text-sm'}`}
                      >
                        {judge.court_name || 'Суд не вказано'}
                      </p>
                      {judge.dossier_number && (
                        <div
                          className={`mt-2 inline-flex items-center px-2 py-0.5 rounded font-medium font-sans bg-claude-bg text-claude-subtext border border-claude-border/50 ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}
                        >
                          Досьє: {judge.dossier_number}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-3 gap-2 pt-3 border-t border-claude-border/50 ${viewMode === 'compact' ? 'text-xs' : ''}`}
                  >
                    <div className="text-center">
                      <div
                        className={`flex items-center justify-center gap-1 text-claude-subtext mb-1 font-sans ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}
                      >
                        <Calendar size={viewMode === 'compact' ? 10 : 12} />
                        <span>Перший запис</span>
                      </div>
                      <div
                        className={`font-medium text-claude-text font-serif ${viewMode === 'compact' ? 'text-sm' : 'text-base'}`}
                      >
                        {judge.first_seen
                          ? new Date(judge.first_seen).toLocaleDateString('uk-UA', { year: 'numeric', month: 'short' })
                          : '—'}
                      </div>
                    </div>
                    <div className="text-center border-l border-claude-border/50">
                      <div
                        className={`flex items-center justify-center gap-1 text-claude-subtext mb-1 font-sans ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}
                      >
                        <Calendar size={viewMode === 'compact' ? 10 : 12} />
                        <span>Останній</span>
                      </div>
                      <div
                        className={`font-medium text-claude-text font-serif ${viewMode === 'compact' ? 'text-sm' : 'text-base'}`}
                      >
                        {judge.last_seen
                          ? new Date(judge.last_seen).toLocaleDateString('uk-UA', { year: 'numeric', month: 'short' })
                          : '—'}
                      </div>
                    </div>
                    <div className="text-center border-l border-claude-border/50">
                      <div
                        className={`flex items-center justify-center gap-1 text-claude-subtext mb-1 font-sans ${viewMode === 'compact' ? 'text-[10px]' : 'text-xs'}`}
                      >
                        <Scale size={viewMode === 'compact' ? 10 : 12} />
                        <span>Знімків</span>
                      </div>
                      <div
                        className={`font-medium text-claude-text font-serif ${viewMode === 'compact' ? 'text-sm' : 'text-base'}`}
                      >
                        {judge.snapshot_count}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {!isLoading && judges.length === 0 && (
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
                  Спробуйте змінити параметри пошуку або перевірити написання
                  прізвища
                </p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
