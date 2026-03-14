/**
 * ReferralPage
 * Dashboard showing referral link, stats, and list of referred users
 */

import { useState, useEffect } from 'react';
import { Copy, Check, UserPlus, Gift, Users, TrendingUp, Award, DollarSign, Hash } from 'lucide-react';
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

      {/* Referral Code — crypto style */}
      <div className="bg-gray-950 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Hash size={14} className="text-emerald-400" />
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Ваш реферальний код
          </h2>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 px-4 py-3 mb-3 flex items-center justify-between gap-3">
          <code className="text-emerald-400 text-sm font-mono tracking-wider break-all select-all">
            {stats?.referralCode ?? '—'}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors text-xs font-mono"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'OK' : 'COPY'}
          </button>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-gray-500 text-xs font-mono truncate">{referralLink}</span>
          <button
            onClick={async () => {
              if (!referralLink) return;
              try {
                await navigator.clipboard.writeText(referralLink);
                showToast.success('Посилання скопійовано');
              } catch {
                showToast.error('Не вдалося скопіювати');
              }
            }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-400 border border-gray-700 rounded-md hover:bg-gray-700 transition-colors text-xs font-mono"
          >
            <Copy size={12} />
            LINK
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Поділіться кодом або посиланням з колегами. Ви отримуватимете до 20% від кожного платежу запрошеного клієнта.
        </p>
      </div>

      {/* Program Terms */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-amber-900 mb-4 uppercase tracking-wide flex items-center gap-2">
          <Award size={16} />
          Умови реферальної програми
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <TrendingUp size={16} className="text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-claude-text">До 20% від кожного платежу</h3>
              <p className="text-xs text-claude-subtext mt-1">
                Ви отримуєте до 20% реферальної винагороди з кожного платежу клієнта, якого ви привели на платформу. Винагорода нараховується постійно, поки клієнт залишається активним.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <Award size={16} className="text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-claude-text">Equity Share для топ-рефералів</h3>
              <p className="text-xs text-claude-subtext mt-1">
                Якщо за 3 місяці ви запросите 10+ клієнтів, кожен з яких платить від $500/міс — вся сума виплачених вам реферальних відсотків додатково конвертується в equity share компанії.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
            <DollarSign size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Оплачено рефералами</span>
          </div>
          <div className="text-2xl font-bold text-claude-text">
            ${referrals.reduce((sum, r) => sum + (r.totalPaidUsd ?? 0), 0).toFixed(2)}
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
                  <th className="px-6 py-3 text-right font-semibold">Оплачено</th>
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
                    <td className="px-6 py-3 text-right text-claude-subtext font-mono text-xs">
                      {(r.totalPaidUsd ?? 0) > 0
                        ? `$${r.totalPaidUsd.toFixed(2)}`
                        : '—'}
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
