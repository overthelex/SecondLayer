/**
 * ReferralPage
 * Dashboard showing referral link, stats, and list of referred users
 */

import { useState, useEffect } from 'react';
import { Copy, Check, UserPlus, Gift, Users } from 'lucide-react';
import { ReferralService, ReferralStats, ReferralEntry } from '../../services/api/ReferralService';
import { showToast } from '../../utils/toast';

const referralService = new ReferralService();

export function ReferralPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [s, r] = await Promise.all([
          referralService.getStats(),
          referralService.getReferrals(),
        ]);
        setStats(s);
        setReferrals(r);
      } catch (err) {
        console.error('Failed to load referral data', err);
        showToast.error('Не вдалося завантажити дані');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const referralLink = stats ? `${window.location.origin}/r/${stats.referralCode}` : '';

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      showToast.success('Посилання скопійовано');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error('Не вдалося скопіювати');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-claude-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-claude-text mb-6 font-sans flex items-center gap-2">
        <UserPlus size={24} />
        Реферальна програма
      </h1>

      {/* Referral Link */}
      <div className="bg-white rounded-xl border border-claude-border p-6 mb-6">
        <h2 className="text-sm font-semibold text-claude-subtext mb-3 uppercase tracking-wide">
          Ваше реферальне посилання
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 px-4 py-2.5 bg-claude-bg rounded-lg border border-claude-border text-sm text-claude-text font-mono"
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-claude-accent/90 transition-colors text-sm font-medium"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>
        <p className="text-xs text-claude-subtext mt-3">
          Поділіться цим посиланням з друзями. Коли вони зареєструються та поповнять баланс, ви отримаєте 20% від їх першого поповнення.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-claude-border p-5">
          <div className="flex items-center gap-2 text-claude-subtext mb-2">
            <Users size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Запрошено</span>
          </div>
          <div className="text-2xl font-bold text-claude-text">
            {stats?.totalReferrals ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-5">
          <div className="flex items-center gap-2 text-claude-subtext mb-2">
            <Gift size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Зароблено (USD)</span>
          </div>
          <div className="text-2xl font-bold text-claude-text">
            ${(stats?.totalEarnedUsd ?? 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-claude-border p-5">
          <div className="flex items-center gap-2 text-claude-subtext mb-2">
            <Gift size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Зароблено (UAH)</span>
          </div>
          <div className="text-2xl font-bold text-claude-text">
            ₴{(stats?.totalEarnedUah ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white rounded-xl border border-claude-border overflow-hidden">
        <div className="px-6 py-4 border-b border-claude-border">
          <h2 className="text-sm font-semibold text-claude-text">Мої реферали</h2>
        </div>
        {referrals.length === 0 ? (
          <div className="px-6 py-12 text-center text-claude-subtext text-sm">
            Поки що немає рефералів. Поділіться посиланням, щоб запросити друзів!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-claude-bg text-claude-subtext text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-semibold">Користувач</th>
                  <th className="px-6 py-3 text-left font-semibold">Дата реєстрації</th>
                  <th className="px-6 py-3 text-left font-semibold">Статус</th>
                  <th className="px-6 py-3 text-right font-semibold">Винагорода</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claude-border">
                {referrals.map((r) => (
                  <tr key={r.referredId} className="hover:bg-claude-bg/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-claude-text">
                        {r.referredName || r.referredEmail}
                      </div>
                      {r.referredName && (
                        <div className="text-xs text-claude-subtext">{r.referredEmail}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-claude-subtext">
                      {new Date(r.registeredAt).toLocaleDateString('uk-UA')}
                    </td>
                    <td className="px-6 py-3">
                      {r.hasToppedUp ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Поповнив баланс
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Зареєстрований
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-claude-text">
                      {r.rewardAmountUsd > 0
                        ? `$${r.rewardAmountUsd.toFixed(2)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
