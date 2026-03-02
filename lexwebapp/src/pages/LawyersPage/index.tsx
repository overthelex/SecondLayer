import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Award,
  MapPin,
  Calendar,
  LayoutGrid,
  List,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { erauService, ERAULawyer } from '../../services/api/ERAUService';
import { generateRoute } from '../../router/routes';

export function LawyersPage() {
  const navigate = useNavigate();

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

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await erauService.searchLawyers(trimmed);
      setResults(data);
    } catch (err: any) {
      setError(err?.message || 'Не вдалося виконати пошук. Спробуйте пізніше.');
      setResults([]);
    } finally {
      setLoading(false);
    }
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
                disabled={loading}
              />
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

        {/* Empty state - before search */}
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
