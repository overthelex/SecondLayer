import { useState, useEffect } from 'react';
import { api } from '@/utils/api-client';
import { Loader2, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DailyData { date: string; calls: number; cost_usd: number; tokens: number }
interface ToolData { tool_name: string; calls: number; cost_usd: number; tokens: number; avg_time_ms: number }
interface Transaction { id: string; type: string; amount: number; description: string; created_at: string }
interface Balance { balance: number; lifetimePurchased: number; lifetimeUsed: number }

type DateRange = 7 | 30 | 90;

export function UsagePage() {
  const [days, setDays] = useState<DateRange>(30);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [byTool, setByTool] = useState<ToolData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [dailyRes, toolRes, txRes, balRes] = await Promise.all([
          api.get(`/usage/daily?days=${days}`).catch(() => ({ data: { data: [] } })),
          api.get(`/usage/by-tool?days=${days}`).catch(() => ({ data: { data: [] } })),
          api.get('/keys/transactions?limit=20').catch(() => ({ data: { transactions: [] } })),
          api.get('/keys/balance').catch(() => ({ data: {} })),
        ]);
        setDaily(dailyRes.data.data || []);
        setByTool(toolRes.data.data || []);
        setTransactions(txRes.data.transactions || []);
        setBalance({
          balance: balRes.data.balance || 0,
          lifetimePurchased: balRes.data.lifetimePurchased || 0,
          lifetimeUsed: balRes.data.lifetimeUsed || 0,
        });
      } catch { /* ignore */ } finally { setLoading(false); }
    }
    load();
  }, [days]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  const totalCalls = daily.reduce((s, d) => s + d.calls, 0);
  const totalCost = daily.reduce((s, d) => s + d.cost_usd, 0);
  const totalTokens = daily.reduce((s, d) => s + d.tokens, 0);

  const chartData = daily.map(d => ({
    date: new Date(d.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }),
    calls: d.calls,
    cost: Number(d.cost_usd.toFixed(4)),
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Usage</h1>
          <p className="text-sm text-txt-muted mt-1">Аналітика використання API та кредитів</p>
        </div>
        <div className="flex gap-1 bg-surface-tertiary rounded-lg p-0.5">
          {([7, 30, 90] as DateRange[]).map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === d ? 'bg-white text-txt-primary shadow-sm' : 'text-txt-muted hover:text-txt-primary'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card label="Запити" value={totalCalls.toLocaleString()} />
        <Card label="Витрати" value={`$${totalCost.toFixed(4)}`} />
        <Card label="Токени" value={totalTokens.toLocaleString()} />
        <Card label="Баланс" value={`$${(balance?.balance || 0).toFixed(2)}`} color="text-green-600" />
      </div>

      {/* Daily chart */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-txt-primary mb-4">Запити за день</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#868e96" />
              <YAxis tick={{ fontSize: 11 }} stroke="#868e96" />
              <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #dee2e6', borderRadius: 8 }} />
              <Bar dataKey="calls" fill="#4c6ef5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-txt-muted">
            <BarChart3 size={32} className="mb-2" />
            <p className="text-sm">Немає даних за обраний період</p>
          </div>
        )}
      </div>

      {/* By tool */}
      {byTool.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border-light bg-surface-secondary">
            <h2 className="text-sm font-semibold text-txt-primary">Використання за інструментом</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-2">Інструмент</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-2">Запити</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-2">Витрати</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-2">Токени</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-2">Сер. час</th>
              </tr>
            </thead>
            <tbody>
              {byTool.map((t) => (
                <tr key={t.tool_name} className="border-b border-border-light last:border-0 hover:bg-surface-secondary/50">
                  <td className="px-4 py-2.5"><code className="text-xs font-mono text-brand-700">{t.tool_name}</code></td>
                  <td className="px-4 py-2.5 text-sm text-txt-primary text-right">{t.calls.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-sm text-txt-secondary text-right">${t.cost_usd.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-xs text-txt-muted text-right">{t.tokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs text-txt-muted text-right">{(t.avg_time_ms / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Balance */}
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

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border-light bg-surface-secondary">
          <h2 className="text-sm font-semibold text-txt-primary">Історія транзакцій</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-txt-muted">Ще немає транзакцій</p></div>
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
                  <td className="px-4 py-2.5 text-xs text-txt-muted">{new Date(tx.created_at).toLocaleString('uk-UA')}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tx.type === 'purchase' ? 'bg-green-50 text-green-700' : tx.type === 'usage' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'}`}>{tx.type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-txt-secondary">{tx.description}</td>
                  <td className={`px-4 py-2.5 text-sm font-medium text-right ${tx.amount > 0 ? 'text-green-600' : 'text-txt-primary'}`}>
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

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="text-xs text-txt-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color || 'text-txt-primary'}`}>{value}</div>
    </div>
  );
}
