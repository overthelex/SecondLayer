import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import toast from 'react-hot-toast';
import type { Transaction, Pagination } from './types';
import { PAGE_SIZE } from './constants';
import { formatDate } from './formatters';

export function TransactionsSection() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txPagination, setTxPagination] = useState<Pagination>({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [txLoading, setTxLoading] = useState(true);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txStatusFilter, setTxStatusFilter] = useState('');

  const fetchTransactions = useCallback(async (offset = 0) => {
    setTxLoading(true);
    try {
      const params: any = { limit: PAGE_SIZE, offset };
      if (txTypeFilter) params.type = txTypeFilter;
      if (txStatusFilter) params.status = txStatusFilter;
      const res = await api.admin.getTransactions(params);
      setTransactions(res.data?.transactions || []);
      setTxPagination(res.data?.pagination || { limit: PAGE_SIZE, offset, total: 0 });
    } catch (err: any) {
      // non-critical — toast only
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setTxLoading(false);
    }
  }, [txTypeFilter, txStatusFilter]);

  useEffect(() => {
    fetchTransactions(0);
  }, [fetchTransactions]);

  const handleRefund = async (txId: string) => {
    const reason = prompt('Refund reason:');
    if (!reason) return;
    try {
      await api.admin.refundTransaction(txId, reason);
      toast.success('Transaction refunded');
      fetchTransactions(txPagination.offset);
    } catch {
      toast.error('Failed to refund');
    }
  };

  const txTotalPages = Math.ceil(txPagination.total / PAGE_SIZE);
  const txCurrentPage = Math.floor(txPagination.offset / PAGE_SIZE) + 1;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign size={18} className="text-claude-subtext" />
          <h2 className="text-lg font-semibold text-claude-text font-sans">Transactions</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={txTypeFilter}
            onChange={(e) => setTxTypeFilter(e.target.value)}
            className="px-3 py-1.5 border border-claude-border rounded-lg text-sm bg-white"
          >
            <option value="">All Types</option>
            <option value="charge">Charge</option>
            <option value="topup">Top-up</option>
            <option value="refund">Refund</option>
            <option value="adjustment">Adjustment</option>
          </select>
          <select
            value={txStatusFilter}
            onChange={(e) => setTxStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-claude-border rounded-lg text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Date</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">User</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Type</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Status</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Actions</th>
              </tr>
            </thead>
            <tbody>
              {txLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-claude-subtext">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Loading...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-claude-subtext">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-claude-border/50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-claude-subtext">{formatDate(tx.created_at)}</td>
                    <td className="px-4 py-3 text-xs">{tx.user_email || tx.user_id?.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-xs">{tx.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.status === 'completed'
                            ? 'bg-green-50 text-green-700'
                            : tx.status === 'refunded'
                            ? 'bg-amber-50 text-amber-700'
                            : tx.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-gray-50 text-gray-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">${Number(tx.amount_usd || 0).toFixed(4)}</td>
                    <td className="px-4 py-3">
                      {tx.status === 'completed' && tx.type === 'charge' && (
                        <button
                          onClick={() => handleRefund(tx.id)}
                          className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions Pagination */}
      {txTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-claude-subtext">
            Page {txCurrentPage} of {txTotalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTransactions(txPagination.offset - PAGE_SIZE)}
              disabled={txPagination.offset === 0}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => fetchTransactions(txPagination.offset + PAGE_SIZE)}
              disabled={txPagination.offset + PAGE_SIZE >= txPagination.total}
              className="p-2 border border-claude-border rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
