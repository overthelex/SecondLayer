import React from 'react';
import {
  RefreshCw, ChevronLeft, ChevronRight, KeyRound, Briefcase,
} from 'lucide-react';
import { UserRow, UserDetail, Pagination, PAGE_SIZE, formatDate } from './types';

interface UsersTableProps {
  users: UserRow[];
  loading: boolean;
  pagination: Pagination;
  totalPages: number;
  currentPage: number;
  selectedUserId: string | null;
  detail: UserDetail | null;
  detailLoading: boolean;
  loadDetail: (userId: string) => void;
  fetchUsers: (offset: number) => void;
  setTierAction: (v: { userId: string; tier: string }) => void;
  setBalanceAction: (v: { userId: string; amount: string; reason: string }) => void;
  setLimitsAction: (v: { userId: string; daily: string; monthly: string }) => void;
  handleToggleCrypto: (userId: string, enabled: boolean) => void;
  handleToggleTest: (userId: string, enabled: boolean) => void;
  setResetPasswordConfirm: (v: { userId: string; email: string }) => void;
  openAttorneyModal: (userId: string, email: string) => void;
}

export function UsersTable({
  users, loading, pagination, totalPages, currentPage,
  selectedUserId, detail, detailLoading,
  loadDetail, fetchUsers,
  setTierAction, setBalanceAction, setLimitsAction,
  handleToggleCrypto, handleToggleTest,
  setResetPasswordConfirm, openAttorneyModal,
}: UsersTableProps) {
  return (
    <>
      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Email</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Tier</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Balance</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Requests</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Last Active</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-claude-subtext">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-claude-subtext">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr
                      className={`border-b border-claude-border/50 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedUserId === u.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => loadDetail(u.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-claude-text">{u.email}</span>
                          {u.has_test_tag && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                              Test
                            </span>
                          )}
                        </div>
                        {u.name && <div className="text-xs text-claude-subtext">{u.name}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                          {u.pricing_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        ${Number(u.balance_usd || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(u.total_requests || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-claude-subtext text-xs">
                        {formatDate(u.last_request_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setTierAction({ userId: u.id, tier: u.pricing_tier })}
                            className="px-2 py-1 text-xs border border-claude-border rounded hover:bg-gray-100 transition-colors"
                          >
                            Tier
                          </button>
                          <button
                            onClick={() => setBalanceAction({ userId: u.id, amount: '', reason: '' })}
                            className="px-2 py-1 text-xs border border-claude-border rounded hover:bg-gray-100 transition-colors"
                          >
                            Balance
                          </button>
                          <button
                            onClick={() => setLimitsAction({ userId: u.id, daily: '', monthly: '' })}
                            className="px-2 py-1 text-xs border border-claude-border rounded hover:bg-gray-100 transition-colors"
                          >
                            Limits
                          </button>
                          <button
                            onClick={() => handleToggleCrypto(u.id, !!u.has_crypto_tag)}
                            className={`px-2 py-1 text-xs border rounded transition-colors ${
                              u.has_crypto_tag
                                ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                                : 'border-claude-border text-claude-subtext hover:bg-gray-100'
                            }`}
                          >
                            Crypto
                          </button>
                          <button
                            onClick={() => handleToggleTest(u.id, !!u.has_test_tag)}
                            className={`px-2 py-1 text-xs border rounded transition-colors ${
                              u.has_test_tag
                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'border-claude-border text-claude-subtext hover:bg-gray-100'
                            }`}
                          >
                            Test
                          </button>
                          <button
                            onClick={() => setResetPasswordConfirm({ userId: u.id, email: u.email })}
                            className="px-2 py-1 text-xs border border-claude-border rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                            title="Generate new password"
                          >
                            <KeyRound size={12} />
                          </button>
                          <button
                            onClick={() => openAttorneyModal(u.id, u.email)}
                            className="px-2 py-1 text-xs border border-claude-border rounded hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                            title="Attorney profile"
                          >
                            <Briefcase size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {selectedUserId === u.id && (
                      <tr>
                        <td colSpan={6} className="bg-blue-50/50 px-4 py-4">
                          {detailLoading ? (
                            <div className="text-center py-4 text-claude-subtext">
                              <RefreshCw size={16} className="animate-spin inline-block mr-2" />
                              Loading details...
                            </div>
                          ) : detail ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <div className="text-xs text-claude-subtext mb-1">Total Spent</div>
                                <div className="font-medium">${Number(detail.stats.total_spent || 0).toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-claude-subtext mb-1">Avg Cost/Request</div>
                                <div className="font-medium">${Number(detail.stats.avg_cost || 0).toFixed(4)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-claude-subtext mb-1">Total Requests</div>
                                <div className="font-medium">{(detail.stats.total_requests || 0).toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-xs text-claude-subtext mb-1">Last Request</div>
                                <div className="font-medium text-xs">{formatDate(detail.stats.last_request)}</div>
                              </div>
                              {detail.transactions.length > 0 && (
                                <div className="col-span-full">
                                  <div className="text-xs text-claude-subtext mb-2">Recent Transactions</div>
                                  <div className="space-y-1">
                                    {detail.transactions.slice(0, 5).map((tx: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-3 py-1.5 border border-claude-border/50">
                                        <span className="text-claude-subtext">{tx.type}</span>
                                        <span className="font-mono">${Number(tx.amount_usd || 0).toFixed(4)}</span>
                                        <span className="text-claude-subtext">{formatDate(tx.created_at)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-claude-subtext text-sm">Could not load details</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-claude-subtext">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchUsers(pagination.offset - PAGE_SIZE)}
              disabled={pagination.offset === 0}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => fetchUsers(pagination.offset + PAGE_SIZE)}
              disabled={pagination.offset + PAGE_SIZE >= pagination.total}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
