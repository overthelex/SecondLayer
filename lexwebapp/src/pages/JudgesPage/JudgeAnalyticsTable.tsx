import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { useJudgeAnalytics } from '../../hooks/queries/useJudgeAnalytics';
import { JudgeAnalyticsFilters, JudgeAnalyticsRecord } from '../../services/api/JudgeAnalyticsService';
import { generateRoute } from '../../router/routes';

const PAGE_SIZE = 25;

// EDRSR instance codes: 1=Касаційна, 2=Апеляційна, 3=Перша інстанція
const INSTANCE_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Всі' },
  { value: '3', label: 'Перша інстанція' },
  { value: '2', label: 'Апеляційна' },
  { value: '1', label: 'Касаційна' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'total_decisions', label: 'Рішень' },
  { value: 'appeal_rate', label: 'Оскарження %' },
  { value: 'cases_appealed', label: 'Оскаржено' },
  { value: 'unique_cases', label: 'Справ' },
  { value: 'judge_name', label: "Ім'я" },
];

function getAppealRateColor(rate: number): string {
  if (rate <= 0) return 'text-claude-subtext';
  if (rate < 20) return 'text-green-600';
  if (rate < 40) return 'text-yellow-600';
  return 'text-red-600';
}

function getAppealRateBg(rate: number): string {
  if (rate <= 0) return 'bg-claude-bg';
  if (rate < 20) return 'bg-green-50';
  if (rate < 40) return 'bg-yellow-50';
  return 'bg-red-50';
}

function getOverturnedCount(outcomes: JudgeAnalyticsRecord['appeal_outcomes']): number {
  return (outcomes?.overturned || 0) + (outcomes?.modified || 0);
}

function getDeadlineViolations(vkksu: Record<string, unknown>): number {
  const violations = vkksu?.deadline_violations as Record<string, number> | undefined;
  if (!violations) return 0;
  return Object.values(violations).reduce((sum, v) => sum + (v || 0), 0);
}

export function JudgeAnalyticsTable() {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('total_decisions');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [instanceFilter, setInstanceFilter] = useState('');
  const [courtFilter, setCourtFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    setDebounceTimer(timer);
  };

  const filters: JudgeAnalyticsFilters = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    court_name: courtFilter.trim() || undefined,
    instance_code: instanceFilter ? parseInt(instanceFilter) : undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [debouncedSearch, courtFilter, instanceFilter, sortBy, sortOrder, page]);

  const { data, isLoading, isError, error } = useJudgeAnalytics(filters);
  const judges = data?.judges ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const handleJudgeClick = (judge: JudgeAnalyticsRecord) => {
    const id = judge.dossier_number || String(judge.id);
    navigate(generateRoute.judgeDetail(id));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown size={14} className="text-claude-subtext/50" />;
    return sortOrder === 'desc'
      ? <ChevronDown size={14} className="text-claude-accent" />
      : <ChevronUp size={14} className="text-claude-accent" />;
  };

  // Appeal rate column label depends on instance filter
  const appealColumnLabel = instanceFilter === '1'
    ? 'Оскарження %'  // Cassation — rare, Grand Chamber
    : instanceFilter === '2'
      ? 'Касація %'    // Appellate — appealed to cassation
      : 'Апеляція %';  // First instance or all

  return (
    <div className="space-y-4">
      {/* Instance Tabs */}
      <div className="flex items-center gap-1 p-1 bg-claude-bg rounded-xl border border-claude-border">
        {INSTANCE_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setInstanceFilter(tab.value); setPage(0); }}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-sans transition-all ${
              instanceFilter === tab.value
                ? 'bg-white text-claude-text shadow-sm font-medium'
                : 'text-claude-subtext hover:text-claude-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isLoading ? (
              <Loader2 className="h-4 w-4 text-claude-subtext animate-spin" />
            ) : (
              <Search className="h-4 w-4 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
            )}
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-4 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
            placeholder="Пошук за прізвищем судді..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-sans transition-all ${
            showFilters || courtFilter
              ? 'bg-claude-accent text-white border-claude-accent'
              : 'bg-white text-claude-subtext border-claude-border hover:border-claude-subtext/30'
          }`}
        >
          <Filter size={16} />
          Фільтри
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex flex-col sm:flex-row gap-3 p-4 bg-white rounded-xl border border-claude-border"
        >
          <div className="flex-1">
            <label className="block text-xs text-claude-subtext mb-1 font-sans">Суд</label>
            <input
              type="text"
              value={courtFilter}
              onChange={(e) => { setCourtFilter(e.target.value); setPage(0); }}
              placeholder="Назва суду..."
              className="w-full px-3 py-2 bg-claude-bg border border-claude-border rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-claude-subtext mb-1 font-sans">Сортування</label>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
              className="w-full px-3 py-2 bg-claude-bg border border-claude-border rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {isError && (
        <div className="text-center py-6">
          <p className="text-red-500 text-sm font-sans">
            Помилка завантаження: {(error as any)?.message || 'Невідома помилка'}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-claude-bg/50">
                <th className="px-3 py-3 text-left font-sans font-medium text-claude-subtext w-10">#</th>
                <th
                  className="px-3 py-3 text-left font-sans font-medium text-claude-subtext cursor-pointer hover:text-claude-text transition-colors"
                  onClick={() => handleSort('judge_name')}
                >
                  <span className="flex items-center gap-1">Суддя <SortIcon column="judge_name" /></span>
                </th>
                <th className="px-3 py-3 text-left font-sans font-medium text-claude-subtext hidden lg:table-cell">Суд</th>
                <th className="px-3 py-3 text-left font-sans font-medium text-claude-subtext hidden md:table-cell">Інстанція</th>
                <th
                  className="px-3 py-3 text-right font-sans font-medium text-claude-subtext cursor-pointer hover:text-claude-text transition-colors"
                  onClick={() => handleSort('total_decisions')}
                >
                  <span className="flex items-center justify-end gap-1">Рішень <SortIcon column="total_decisions" /></span>
                </th>
                <th
                  className="px-3 py-3 text-right font-sans font-medium text-claude-subtext cursor-pointer hover:text-claude-text transition-colors hidden sm:table-cell"
                  onClick={() => handleSort('unique_cases')}
                >
                  <span className="flex items-center justify-end gap-1">Справ <SortIcon column="unique_cases" /></span>
                </th>
                <th
                  className="px-3 py-3 text-right font-sans font-medium text-claude-subtext cursor-pointer hover:text-claude-text transition-colors"
                  onClick={() => handleSort('appeal_rate')}
                >
                  <span className="flex items-center justify-end gap-1">{appealColumnLabel} <SortIcon column="appeal_rate" /></span>
                </th>
                <th className="px-3 py-3 text-right font-sans font-medium text-claude-subtext hidden md:table-cell">Скасовано</th>
                <th className="px-3 py-3 text-right font-sans font-medium text-claude-subtext hidden lg:table-cell">Порушення строків</th>
                <th className="px-3 py-3 text-right font-sans font-medium text-claude-subtext hidden sm:table-cell">Ранг</th>
              </tr>
            </thead>
            <tbody>
              {judges.map((judge, index) => (
                <motion.tr
                  key={judge.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                  onClick={() => handleJudgeClick(judge)}
                  className="border-b border-claude-border/50 hover:bg-claude-bg/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 text-claude-subtext font-sans">
                    {page * PAGE_SIZE + index + 1}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-claude-text font-serif hover:text-claude-accent transition-colors">
                      {judge.judge_name}
                    </div>
                    <div className="text-xs text-claude-subtext font-sans lg:hidden mt-0.5 line-clamp-1">
                      {judge.court_name || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-claude-subtext font-sans text-xs max-w-[200px] truncate hidden lg:table-cell">
                    {judge.court_name || '—'}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-sans bg-claude-bg text-claude-subtext border border-claude-border/50">
                      {judge.instance_name || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium font-serif text-claude-text">
                    {judge.total_decisions.toLocaleString('uk-UA')}
                  </td>
                  <td className="px-3 py-3 text-right font-sans text-claude-subtext hidden sm:table-cell">
                    {judge.unique_cases.toLocaleString('uk-UA')}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium font-sans ${getAppealRateColor(judge.appeal_rate)} ${getAppealRateBg(judge.appeal_rate)}`}>
                      {judge.appeal_rate > 0 ? `${judge.appeal_rate}%` : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-sans text-claude-subtext hidden md:table-cell">
                    {getOverturnedCount(judge.appeal_outcomes) || '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-sans hidden lg:table-cell">
                    {(() => {
                      const v = getDeadlineViolations(judge.vkksu_data);
                      return v > 0
                        ? <span className="text-red-500 font-medium">{v}</span>
                        : <span className="text-claude-subtext">—</span>;
                    })()}
                  </td>
                  <td className="px-3 py-3 text-right font-sans text-claude-subtext hidden sm:table-cell">
                    {judge.peer_rank_in_court && judge.peer_total_in_court
                      ? `${judge.peer_rank_in_court}/${judge.peer_total_in_court}`
                      : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Loading overlay */}
        {isLoading && judges.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-claude-accent animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && judges.length === 0 && !isError && (
          <div className="text-center py-12">
            <p className="text-claude-subtext font-sans">Суддів не знайдено</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-claude-border bg-claude-bg/30">
            <p className="text-xs text-claude-subtext font-sans">
              {(page * PAGE_SIZE + 1).toLocaleString('uk-UA')}–{Math.min((page + 1) * PAGE_SIZE, total).toLocaleString('uk-UA')} з {total.toLocaleString('uk-UA')}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-sans text-claude-subtext px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
