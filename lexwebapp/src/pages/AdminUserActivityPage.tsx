/**
 * Admin User Activity Page
 * Live feed of recent user activity — who was last online and what they did
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Clock,
  Users,
  DollarSign,
  Activity,
  ChevronDown,
  ChevronRight,
  Zap,
  AlertCircle,
  CheckCircle2,
  Timer,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '../utils/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentRequest {
  id: string;
  tool_name: string;
  user_query: string | null;
  total_cost_usd: number;
  execution_time_ms: number | null;
  status: string | null;
  created_at: string;
}

interface UserActivity {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  pricing_tier: string;
  balance_usd: number;
  requests_in_period: number;
  cost_in_period: number;
  last_request_at: string;
  recent_requests: RecentRequest[];
}

interface ActivityStats {
  active_users: number;
  total_requests: number;
  total_cost: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: '1 год', hours: 1 },
  { label: '6 год', hours: 6 },
  { label: '24 год', hours: 24 },
  { label: '3 дні', hours: 72 },
  { label: '7 днів', hours: 168 },
];

const TIER_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  startup: 'bg-blue-100 text-blue-700',
  business: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
  internal: 'bg-green-100 text-green-700',
};

const TOOL_COLORS: Record<string, string> = {
  search_court_decisions: 'text-blue-600',
  get_court_decision: 'text-blue-500',
  semantic_search: 'text-indigo-600',
  get_legislation: 'text-emerald-600',
  get_legislation_structure: 'text-emerald-500',
  openreyestr_search_entity: 'text-orange-600',
  openreyestr_get_beneficiaries: 'text-orange-500',
  rada_get_deputies: 'text-rose-600',
  rada_search_laws: 'text-rose-500',
  ai_chat: 'text-violet-600',
};

function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || 'text-slate-600';
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  if (hours < 24) return `${hours} год тому`;
  return `${days} дн тому`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }
  return email[0].toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
    'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function StatusDot({ status }: { status: string | null }) {
  if (!status || status === 'success' || status === 'completed') {
    return <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />;
  }
  if (status === 'error' || status === 'failed') {
    return <AlertCircle size={12} className="text-red-500 flex-shrink-0" />;
  }
  return <div className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RequestRow({ req }: { req: RecentRequest }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
      <StatusDot status={req.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${getToolColor(req.tool_name)}`}>
            {formatToolName(req.tool_name)}
          </span>
          {req.execution_time_ms != null && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5">
              <Timer size={10} />
              {req.execution_time_ms < 1000
                ? `${req.execution_time_ms}мс`
                : `${(req.execution_time_ms / 1000).toFixed(1)}с`}
            </span>
          )}
          {req.total_cost_usd > 0 && (
            <span className="text-xs text-slate-400">
              ${req.total_cost_usd.toFixed(4)}
            </span>
          )}
        </div>
        {req.user_query && (
          <p className="text-xs text-slate-500 mt-0.5 truncate" title={req.user_query}>
            {req.user_query}
          </p>
        )}
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
        {formatTime(req.created_at)}
      </span>
    </div>
  );
}

function UserCard({
  user,
  expanded,
  onToggle,
}: {
  user: UserActivity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ago = timeAgo(user.last_request_at);
  const isRecent = Date.now() - new Date(user.last_request_at).getTime() < 15 * 60_000;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name || user.email}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${avatarColor(user.email)}`}
            >
              {initials(user.name, user.email)}
            </div>
          )}
          {/* Online indicator */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
              isRecent ? 'bg-green-400' : 'bg-slate-300'
            }`}
          />
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-slate-900 truncate">
              {user.name || user.email}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                TIER_COLORS[user.pricing_tier] || 'bg-slate-100 text-slate-600'
              }`}
            >
              {user.pricing_tier}
            </span>
          </div>
          {user.name && (
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-right">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {user.requests_in_period}
            </div>
            <div className="text-xs text-slate-400">запитів</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              ${user.cost_in_period.toFixed(3)}
            </div>
            <div className="text-xs text-slate-400">витрати</div>
          </div>
          <div>
            <div className={`text-sm font-semibold ${isRecent ? 'text-green-600' : 'text-slate-500'}`}>
              {ago}
            </div>
            <div className="text-xs text-slate-400">остання дія</div>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 text-slate-400 ml-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Mobile stats */}
      <div className="sm:hidden flex gap-3 px-4 pb-2 text-xs text-slate-500">
        <span>{user.requests_in_period} запитів</span>
        <span>•</span>
        <span>${user.cost_in_period.toFixed(3)}</span>
        <span>•</span>
        <span className={isRecent ? 'text-green-600' : ''}>{ago}</span>
      </div>

      {/* Expanded requests */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Останні дії
            </span>
            <span className="text-xs text-slate-400">
              Баланс: ${user.balance_usd.toFixed(2)}
            </span>
          </div>
          {user.recent_requests.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 pb-3">Немає даних</p>
          ) : (
            <div className="px-2 pb-2 space-y-0.5">
              {user.recent_requests.map((req) => (
                <RequestRow key={req.id} req={req} />
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
            Перший запит у вибраному діапазоні:{' '}
            {user.recent_requests.length > 0
              ? formatDate(
                  user.recent_requests[user.recent_requests.length - 1].created_at
                )
              : '—'}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminUserActivityPage() {
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.admin.getUserActivity({ hours, limit: 50, recent: 8 });
      setUsers(res.data.users || []);
      setStats(res.data.stats || null);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Помилка завантаження даних');
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(load, 30_000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, load]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
  });

  const handleToggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity size={24} className="text-blue-600" />
            Активність користувачів
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Хто був онлайн та що робив за вибраний період
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
              autoRefresh
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
            title="Оновлення кожні 30 секунд"
          >
            {autoRefresh ? <Wifi size={14} /> : <WifiOff size={14} />}
            {autoRefresh ? 'Live' : 'Авто'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => { setLoading(true); load(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Оновити
          </button>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500 flex items-center gap-1">
          <Clock size={14} /> Період:
        </span>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => { setHours(r.hours); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hours === r.hours
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {lastUpdated && (
          <span className="text-xs text-slate-400 ml-2">
            Оновлено: {lastUpdated.toLocaleTimeString('uk-UA')}
          </span>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-500" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Активних
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.active_users}</div>
            <div className="text-xs text-slate-400">унікальних користувачів</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-amber-500" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Запитів
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.total_requests.toLocaleString()}</div>
            <div className="text-xs text-slate-400">за вибраний період</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-green-500" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Витрати
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              ${stats.total_cost.toFixed(4)}
            </div>
            <div className="text-xs text-slate-400">загальна вартість API</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Пошук по email або імені..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User cards */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">
                {search ? 'Нічого не знайдено' : 'Немає активних користувачів за цей період'}
              </p>
              {!search && (
                <p className="text-sm mt-1">Спробуйте збільшити діапазон часу</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 font-medium">
                {filtered.length} {filtered.length === 1 ? 'користувач' : 'користувачів'} — натисніть щоб побачити деталі
              </div>
              {filtered.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  expanded={expandedId === user.id}
                  onToggle={() => handleToggle(user.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
