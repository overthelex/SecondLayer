/**
 * B2B Invoice Request Modal
 * Form for requesting a new B2B invoice (bank transfer)
 */

import { useState, useEffect } from 'react';
import { X, FileText, AlertCircle } from 'lucide-react';
import { b2bInvoiceApi, billingApi } from '../../utils/api/billing';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

interface TierOption {
  tier_key: string;
  display_name: string;
  monthly_price_usd: number;
}

const billingCycles = [
  { value: 'monthly', label: 'Щомісячно', months: 1 },
  { value: 'quarterly', label: 'Щоквартально', months: 3 },
  { value: 'annual', label: 'Щорічно', months: 12 },
];

// Approximate USD/UAH rate for display (actual rate applied server-side)
const DISPLAY_UAH_RATE = 41.5;
const VAT_RATE = 0.20;

export function B2BInvoiceRequestModal({ onClose, onCreated }: Props) {
  const [invoiceType, setInvoiceType] = useState<'subscription' | 'topup'>('topup');
  const [tierKey, setTierKey] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [amountUah, setAmountUah] = useState('');
  const [notes, setNotes] = useState('');
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch available tiers
    billingApi.getPricingInfo().then(res => {
      const data = res.data;
      if (data.tiers) {
        setTiers(data.tiers.filter((t: TierOption) => t.tier_key !== 'free' && t.tier_key !== 'internal'));
        if (data.tiers.length > 0) {
          const firstPaid = data.tiers.find((t: TierOption) => t.tier_key !== 'free' && t.tier_key !== 'internal');
          if (firstPaid) setTierKey(firstPaid.tier_key);
        }
      }
    }).catch(() => {});
  }, []);

  const selectedTier = tiers.find(t => t.tier_key === tierKey);
  const selectedCycle = billingCycles.find(c => c.value === billingCycle);

  // Calculate estimated amount
  let estimatedUah = 0;
  let estimatedVat = 0;
  let estimatedTotal = 0;

  if (invoiceType === 'subscription' && selectedTier && selectedCycle) {
    estimatedUah = selectedTier.monthly_price_usd * selectedCycle.months * DISPLAY_UAH_RATE;
    estimatedVat = estimatedUah * VAT_RATE;
    estimatedTotal = estimatedUah + estimatedVat;
  } else if (invoiceType === 'topup') {
    const amt = parseFloat(amountUah) || 0;
    estimatedUah = amt;
    estimatedVat = amt * VAT_RATE;
    estimatedTotal = amt + estimatedVat;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload: { invoice_type: string; tier_key?: string; billing_cycle?: string; amount_uah?: number; notes?: string } = {
        invoice_type: invoiceType,
        notes: notes || undefined,
      };

      if (invoiceType === 'subscription') {
        payload.tier_key = tierKey;
        payload.billing_cycle = billingCycle;
      } else {
        const amt = parseFloat(amountUah);
        if (!amt || amt < 500) {
          setError('Мінімальна сума поповнення — 500 грн');
          setLoading(false);
          return;
        }
        payload.amount_uah = amt;
      }

      await b2bInvoiceApi.create(payload);
      onCreated();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Помилка створення рахунку';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-claude-border">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-claude-accent" />
            <h2 className="text-lg font-semibold text-claude-text">Запросити рахунок</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-claude-bg rounded-lg">
            <X size={20} className="text-claude-subtext" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Invoice type toggle */}
          <div>
            <label className="block text-sm font-medium text-claude-text mb-2">Тип рахунку</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInvoiceType('topup')}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  invoiceType === 'topup'
                    ? 'bg-claude-accent text-white border-claude-accent'
                    : 'bg-white text-claude-subtext border-claude-border hover:border-claude-accent'
                }`}>
                Поповнення балансу
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType('subscription')}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  invoiceType === 'subscription'
                    ? 'bg-claude-accent text-white border-claude-accent'
                    : 'bg-white text-claude-subtext border-claude-border hover:border-claude-accent'
                }`}>
                Підписка
              </button>
            </div>
          </div>

          {/* Topup amount */}
          {invoiceType === 'topup' && (
            <div>
              <label className="block text-sm font-medium text-claude-text mb-2">
                Сума поповнення, грн
              </label>
              <input
                type="number"
                min="500"
                step="100"
                value={amountUah}
                onChange={(e) => setAmountUah(e.target.value)}
                placeholder="Мінімум 500 грн"
                className="w-full px-4 py-2.5 border border-claude-border rounded-lg text-sm focus:outline-none focus:border-claude-accent"
                required
              />
              <p className="text-xs text-claude-subtext mt-1">Мінімальна сума — 500 грн</p>
            </div>
          )}

          {/* Subscription: tier + cycle */}
          {invoiceType === 'subscription' && (
            <>
              <div>
                <label className="block text-sm font-medium text-claude-text mb-2">Тариф</label>
                <select
                  value={tierKey}
                  onChange={(e) => setTierKey(e.target.value)}
                  className="w-full px-4 py-2.5 border border-claude-border rounded-lg text-sm focus:outline-none focus:border-claude-accent"
                  required>
                  <option value="">Оберіть тариф</option>
                  {tiers.map((t) => (
                    <option key={t.tier_key} value={t.tier_key}>
                      {t.display_name} — ${t.monthly_price_usd}/міс
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-claude-text mb-2">Період оплати</label>
                <div className="flex gap-2">
                  {billingCycles.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setBillingCycle(c.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        billingCycle === c.value
                          ? 'bg-claude-accent text-white border-claude-accent'
                          : 'bg-white text-claude-subtext border-claude-border hover:border-claude-accent'
                      }`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-claude-text mb-2">
              Примітки <span className="text-claude-subtext font-normal">(необов&apos;язково)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-claude-border rounded-lg text-sm focus:outline-none focus:border-claude-accent resize-none"
              placeholder="Додаткова інформація..."
            />
          </div>

          {/* Calculation preview */}
          {estimatedTotal > 0 && (
            <div className="bg-claude-bg/50 border border-claude-border rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-claude-subtext">Сума</span>
                <span>{estimatedUah.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-claude-subtext">ПДВ 20%</span>
                <span>{estimatedVat.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн</span>
              </div>
              <div className="border-t border-claude-border pt-2 flex justify-between text-sm font-semibold">
                <span>Всього до оплати</span>
                <span>{estimatedTotal.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн</span>
              </div>
              <p className="text-xs text-claude-subtext">
                * Точна сума буде розрахована при формуванні рахунку
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-claude-accent text-white rounded-lg font-medium text-sm hover:bg-claude-accent/90 transition-colors disabled:opacity-50">
            {loading ? 'Створення...' : 'Створити рахунок'}
          </button>
        </form>
      </div>
    </div>
  );
}
