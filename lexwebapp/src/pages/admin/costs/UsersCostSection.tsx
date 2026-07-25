import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Users,
  ChevronDown,
  User,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../../utils/errors';
import type { UserCostSummary } from './types';
import { TIER_COLORS } from './constants';
import { formatDate } from './formatters';

export function UsersCostSection({
  days,
  onSelectUser,
}: {
  days: number;
  onSelectUser: (user: UserCostSummary) => void;
}) {
  const [users, setUsers] = useState<UserCostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.getUsersCostsSummary(days);
      setUsers(res.data?.users || []);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const totalCost = filtered.reduce((s, u) => s + u.total_cost_usd, 0) || 1;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-claude-subtext" />
          <h2 className="text-lg font-semibold text-claude-text font-sans">По користувачам</h2>
          {!loading && (
            <span className="text-xs text-claude-subtext bg-gray-100 px-2 py-0.5 rounded-full">
              {filtered.length} активних
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за email..."
            className="px-3 py-1.5 border border-claude-border rounded-lg text-sm bg-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-claude-border rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Користувач</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Тариф</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Запити</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">OpenAI</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">ZO</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Anthropic</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Всього</th>
                <th className="px-4 py-3 font-medium text-claude-subtext">Частка</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Останній</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-claude-subtext">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Завантаження...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-claude-subtext">
                    {search ? 'Користувачів не знайдено' : 'Немає даних за цей період'}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => {
                  const pct = (user.total_cost_usd / totalCost) * 100;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-claude-border/50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => onSelectUser(user)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-blue-600" />
                          </div>
                          <div>
                            {user.name && (
                              <div className="text-xs font-medium text-claude-text">{user.name}</div>
                            )}
                            <div className="text-xs text-claude-subtext">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `${TIER_COLORS[user.pricing_tier] || '#9ca3af'}20`,
                            color: TIER_COLORS[user.pricing_tier] || '#9ca3af',
                          }}
                        >
                          {user.pricing_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{user.request_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {user.openai_cost_usd > 0 ? `$${user.openai_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {user.zakononline_cost_usd > 0 ? `$${user.zakononline_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {user.anthropic_cost_usd > 0 ? `$${user.anthropic_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-claude-text">
                        {`$${user.total_cost_usd.toFixed(4)}`}
                      </td>
                      <td className="px-4 py-3 w-28">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-xs text-claude-subtext w-9 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-claude-subtext whitespace-nowrap">
                        {formatDate(user.last_request_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronDown size={14} className="text-claude-subtext rotate-[-90deg]" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
