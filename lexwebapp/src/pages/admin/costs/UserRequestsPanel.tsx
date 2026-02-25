import { Fragment, useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import toast from 'react-hot-toast';
import type { UserCostSummary, UserRequest, Pagination } from './types';
import { TIER_COLORS, USER_REQ_PAGE } from './constants';
import { formatDate, formatUSDPrecise, formatMs } from './formatters';

export function UserRequestsPanel({
  user,
  days,
  onBack,
}: {
  user: UserCostSummary;
  days: number;
  onBack: () => void;
}) {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ limit: USER_REQ_PAGE, offset: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRequests = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const res = await api.admin.getUserRequests(user.id, { limit: USER_REQ_PAGE, offset, days });
      setRequests(res.data?.requests || []);
      setPagination(res.data?.pagination || { limit: USER_REQ_PAGE, offset, total: 0 });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [user.id, days]);

  useEffect(() => {
    fetchRequests(0);
  }, [fetchRequests]);

  const totalPages = Math.ceil(pagination.total / USER_REQ_PAGE);
  const currentPage = Math.floor(pagination.offset / USER_REQ_PAGE) + 1;

  return (
    <div>
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-claude-subtext hover:text-claude-text transition-colors"
        >
          <ArrowLeft size={16} />
          По користувачам
        </button>
        <span className="text-claude-subtext">/</span>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={14} className="text-blue-600" />
          </div>
          <div>
            <span className="text-sm font-medium text-claude-text">{user.name || user.email}</span>
            {user.name && (
              <span className="text-xs text-claude-subtext ml-2">{user.email}</span>
            )}
          </div>
        </div>
      </div>

      {/* User summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="text-xs text-claude-subtext mb-1">Всього витрат</div>
          <div className="text-xl font-semibold text-claude-text font-mono">{formatUSDPrecise(user.total_cost_usd)}</div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="text-xs text-claude-subtext mb-1">Запитів</div>
          <div className="text-xl font-semibold text-claude-text">{pagination.total > 0 ? pagination.total.toLocaleString() : user.request_count.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="text-xs text-claude-subtext mb-1">Тариф</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
              style={{
                backgroundColor: `${TIER_COLORS[user.pricing_tier] || '#9ca3af'}20`,
                color: TIER_COLORS[user.pricing_tier] || '#9ca3af',
              }}
            >
              {user.pricing_tier}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
          <div className="text-xs text-claude-subtext mb-1">Останній запит</div>
          <div className="text-sm text-claude-text">{formatDate(user.last_request_at)}</div>
        </div>
      </div>

      {/* Requests table */}
      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-claude-border bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-medium text-claude-text">
            Запити ({pagination.total.toLocaleString()})
          </h3>
          <button
            onClick={() => fetchRequests(pagination.offset)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Оновити
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-gray-50/50">
                <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Дата</th>
                <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Інструмент</th>
                <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Запит</th>
                <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">OpenAI</th>
                <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">ZO</th>
                <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Anthropic</th>
                <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Всього</th>
                <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Час</th>
                <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-claude-subtext">
                    <RefreshCw size={18} className="animate-spin inline-block mr-2" />
                    Завантаження...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-claude-subtext">
                    Немає запитів за цей період
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <Fragment key={req.id}>
                    <tr
                      className="border-b border-claude-border/50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === req.id ? null : req.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-claude-subtext whitespace-nowrap">
                        {formatDate(req.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-claude-text">
                          {req.tool_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        <span className="text-xs text-claude-subtext truncate block" title={req.user_query || ''}>
                          {req.user_query ? req.user_query.slice(0, 60) + (req.user_query.length > 60 ? '…' : '') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {req.openai_cost_usd > 0 ? `$${req.openai_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {req.zakononline_cost_usd > 0 ? `$${req.zakononline_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {req.anthropic_cost_usd > 0 ? `$${req.anthropic_cost_usd.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-medium">
                        {`$${req.total_cost_usd.toFixed(4)}`}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-claude-subtext whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1">
                          <Clock size={11} />
                          {formatMs(req.execution_time_ms)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${
                            req.status === 'completed'
                              ? 'bg-green-50 text-green-700'
                              : req.status === 'failed'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                    </tr>
                    {expanded === req.id && (
                      <tr className="bg-blue-50/40 border-b border-claude-border/50">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            {req.user_query && (
                              <div className="col-span-2 sm:col-span-4">
                                <div className="text-claude-subtext mb-1">Запит користувача</div>
                                <div className="bg-white border border-claude-border rounded p-2 text-claude-text font-mono text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                                  {req.user_query}
                                </div>
                              </div>
                            )}
                            <div>
                              <div className="text-claude-subtext mb-0.5">OpenAI токени</div>
                              <div className="font-medium text-claude-text">
                                {req.openai_total_tokens != null ? req.openai_total_tokens.toLocaleString() : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-claude-subtext mb-0.5">ZO дзвінків</div>
                              <div className="font-medium text-claude-text">
                                {req.zakononline_api_calls != null ? req.zakononline_api_calls : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-claude-subtext mb-0.5">Базова вартість</div>
                              <div className="font-mono font-medium text-claude-text">{formatUSDPrecise(req.base_cost_usd)}</div>
                            </div>
                            <div>
                              <div className="text-claude-subtext mb-0.5">Наценка</div>
                              <div className="font-mono font-medium text-claude-text">
                                {req.markup_percentage > 0 ? `${req.markup_percentage.toFixed(0)}% (+${formatUSDPrecise(req.markup_amount_usd)})` : '—'}
                              </div>
                            </div>
                            {req.voyage_cost_usd > 0 && (
                              <div>
                                <div className="text-claude-subtext mb-0.5">VoyageAI</div>
                                <div className="font-mono font-medium text-claude-text">{formatUSDPrecise(req.voyage_cost_usd)}</div>
                              </div>
                            )}
                            {req.secondlayer_cost_usd > 0 && (
                              <div>
                                <div className="text-claude-subtext mb-0.5">SecondLayer API</div>
                                <div className="font-mono font-medium text-claude-text">{formatUSDPrecise(req.secondlayer_cost_usd)}</div>
                              </div>
                            )}
                            <div>
                              <div className="text-claude-subtext mb-0.5">Тариф</div>
                              <div className="font-medium text-claude-text capitalize">{req.client_tier || '—'}</div>
                            </div>
                            <div>
                              <div className="text-claude-subtext mb-0.5">Request ID</div>
                              <div className="font-mono text-xs text-claude-subtext break-all">{req.request_id || req.id}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-claude-subtext">
            Сторінка {currentPage} з {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRequests(pagination.offset - USER_REQ_PAGE)}
              disabled={pagination.offset === 0}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => fetchRequests(pagination.offset + USER_REQ_PAGE)}
              disabled={pagination.offset + USER_REQ_PAGE >= pagination.total}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
