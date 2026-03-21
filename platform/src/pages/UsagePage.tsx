import { useState, useEffect } from 'react';
import { api } from '@/utils/api-client';
import { Loader2, BarChart3 } from 'lucide-react';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export function UsagePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<{ balance: number; lifetimePurchased: number; lifetimeUsed: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [txRes, balRes] = await Promise.all([
          api.get('/keys/transactions?limit=50'),
          api.get('/keys/balance').catch(() => ({ data: {} })),
        ]);
        setTransactions(txRes.data.transactions || []);
        setBalance({
          balance: balRes.data.balance || 0,
          lifetimePurchased: balRes.data.lifetimePurchased || 0,
          lifetimeUsed: balRes.data.lifetimeUsed || 0,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">Usage</h1>
        <p className="text-sm text-txt-muted mt-1">
          Аналітика використання API та кредитів
        </p>
      </div>

      {/* Balance cards */}
      {balance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="text-sm text-txt-muted mb-1">Поточний баланс</div>
            <div className="text-2xl font-bold text-txt-primary">${balance.balance.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="text-sm text-txt-muted mb-1">Всього поповнено</div>
            <div className="text-2xl font-bold text-green-600">${balance.lifetimePurchased.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="text-sm text-txt-muted mb-1">Всього витрачено</div>
            <div className="text-2xl font-bold text-txt-secondary">${balance.lifetimeUsed.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-light bg-surface-secondary">
          <h2 className="text-sm font-semibold text-txt-primary">Історія транзакцій</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center">
            <BarChart3 className="w-10 h-10 text-txt-muted mx-auto mb-3" />
            <p className="text-sm text-txt-muted">Ще немає транзакцій</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-2">Дата</th>
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-2">Тип</th>
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-2">Опис</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-2">Сума</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border-light last:border-0 hover:bg-surface-secondary/50">
                  <td className="px-4 py-2.5 text-xs text-txt-muted">
                    {new Date(tx.created_at).toLocaleString('uk-UA')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tx.type === 'purchase' ? 'bg-green-50 text-green-700' :
                      tx.type === 'usage' ? 'bg-blue-50 text-blue-700' :
                      'bg-gray-50 text-gray-700'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-txt-secondary">{tx.description}</td>
                  <td className={`px-4 py-2.5 text-sm font-medium text-right ${
                    tx.amount > 0 ? 'text-green-600' : 'text-txt-primary'
                  }`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
