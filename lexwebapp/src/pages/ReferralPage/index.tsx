/**
 * ReferralPage
 * Dashboard showing referral link, stats, and list of referred users.
 * Requires FOP/TOV/Attorney verification to participate.
 */

import { useState, useEffect } from 'react';
import { Copy, Check, UserPlus, Gift, Users, TrendingUp, Award, DollarSign, Link2, ShieldCheck, Building2, Briefcase, Scale } from 'lucide-react';
import { ReferralService, ReferralStats, ReferralEntry, ReferrerStatus, ReferrerType } from '../../services/api/ReferralService';
import { showToast } from '../../utils/toast';

const referralService = new ReferralService();

const REFERRER_TYPE_LABELS: Record<ReferrerType, string> = {
  fop: 'ФОП (фізична особа-підприємець)',
  tov: 'ТОВ (товариство з обмеженою відповідальністю)',
  attorney: 'Адвокат (свідоцтво ЄРАУ)',
};

const REFERRER_TYPE_ICONS: Record<ReferrerType, typeof Building2> = {
  fop: Briefcase,
  tov: Building2,
  attorney: Scale,
};

function VerificationForm({ onVerified }: { onVerified: () => void }) {
  const [referrerType, setReferrerType] = useState<ReferrerType | null>(null);
  const [businessCode, setBusinessCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!referrerType || !businessCode.trim()) {
      showToast.error('Заповніть всі поля');
      return;
    }
    setSubmitting(true);
    try {
      await referralService.submitVerification(referrerType, businessCode.trim());
      showToast.success('Верифікацію пройдено');
      onVerified();
    } catch {
      showToast.error('Не вдалося пройти верифікацію');
    } finally {
      setSubmitting(false);
    }
  };

  const codeLabel = referrerType === 'attorney' ? 'Номер свідоцтва ЄРАУ' : 'Код ЄДРПОУ';
  const codePlaceholder = referrerType === 'attorney' ? 'Наприклад: 12345' : 'Наприклад: 12345678';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:px-8 lg:px-12">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
          Реферальна програма
        </h1>
        <p className="text-sm text-claude-subtext">
          Для участі необхідна верифікація як ФОП, ТОВ або Адвокат
        </p>
      </div>

      <div className="bg-white rounded-xl border border-claude-border p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 bg-claude-accent/10 rounded-lg">
            <ShieldCheck size={16} className="text-claude-accent" />
          </div>
          <h2 className="text-sm font-semibold text-claude-text uppercase tracking-wide">
            Верифікація учасника
          </h2>
        </div>

        <p className="text-sm text-claude-subtext mb-6 leading-relaxed">
          Реферальна програма доступна для верифікованих ФОП, ТОВ та адвокатів.
          Це необхідно для коректного оформлення виплат відповідно до податкового законодавства.
        </p>

        <div className="space-y-3 mb-6">
          {(['fop', 'tov', 'attorney'] as ReferrerType[]).map((type) => {
            const Icon = REFERRER_TYPE_ICONS[type];
            const isSelected = referrerType === type;
            return (
              <button
                key={type}
                onClick={() => setReferrerType(type)}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                  isSelected
                    ? 'border-claude-accent bg-claude-accent/5'
                    : 'border-claude-border hover:border-claude-subtext/30 hover:bg-claude-bg/50'
                }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-claude-accent/10' : 'bg-claude-bg'}`}>
                  <Icon size={16} className={isSelected ? 'text-claude-accent' : 'text-claude-subtext'} />
                </div>
                <span className={`text-sm font-medium ${isSelected ? 'text-claude-text' : 'text-claude-subtext'}`}>
                  {REFERRER_TYPE_LABELS[type]}
                </span>
              </button>
            );
          })}
        </div>

        {referrerType && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-claude-subtext uppercase tracking-wide mb-1.5">
                {codeLabel}
              </label>
              <input
                type="text"
                value={businessCode}
                onChange={(e) => setBusinessCode(e.target.value)}
                placeholder={codePlaceholder}
                className="w-full px-4 py-2.5 rounded-lg border border-claude-border bg-white text-sm text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !businessCode.trim()}
              className="w-full px-4 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-claude-accent/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Верифікація...' : 'Підтвердити та отримати реферальний код'}
            </button>
          </div>
        )}
      </div>

      {/* Program Terms preview */}
      <div className="bg-white rounded-xl border border-claude-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 bg-claude-accent/10 rounded-lg">
            <Award size={16} className="text-claude-accent" />
          </div>
          <h2 className="text-sm font-semibold text-claude-text uppercase tracking-wide">
            Умови програми
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-claude-accent/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-claude-accent" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-medium text-claude-text">До 20% від кожного платежу</h3>
              <p className="text-xs text-claude-subtext mt-1 leading-relaxed">
                Ви отримуєте до 20% реферальної винагороди з кожного платежу клієнта, якого ви привели на платформу. Винагорода нараховується постійно, поки клієнт залишається активним.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-claude-accent/10 flex items-center justify-center">
              <Award size={16} className="text-claude-accent" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-medium text-claude-text">Equity Share для топ-рефералів</h3>
              <p className="text-xs text-claude-subtext mt-1 leading-relaxed">
                Якщо за 3 місяці ви запросите 10+ клієнтів, кожен з яких платить від $500/міс — вся сума виплачених вам реферальних відсотків додатково конвертується в equity share компанії.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReferralPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [verification, setVerification] = useState<ReferrerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadData = async () => {
    try {
      const verStatus = await referralService.getVerificationStatus();
      setVerification(verStatus);

      if (verStatus.isVerified) {
        const [s, r] = await Promise.all([
          referralService.getStats(),
          referralService.getReferrals(),
        ]);
        setStats(s);
        setReferrals(r);
      }
    } catch (err) {
      console.error('Failed to load referral data', err);
      showToast.error('Не вдалося завантажити дані');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const referralLink = stats ? `${window.location.origin}/r/${stats.referralCode}` : '';

  const handleCopyCode = async () => {
    if (!stats?.referralCode) return;
    try {
      await navigator.clipboard.writeText(stats.referralCode);
      setCopiedCode(true);
      showToast.success('Код скопійовано');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast.error('Не вдалося скопіювати');
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      showToast.success('Посилання скопійовано');
      setTimeout(() => setCopiedLink(false), 2000);
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

  // Show verification form if not verified
  if (!verification?.isVerified) {
    return <VerificationForm onVerified={() => { setLoading(true); loadData(); }} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:px-8 lg:px-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
          Реферальна програма
        </h1>
        <p className="text-sm text-claude-subtext">
          Запрошуйте колег та отримуйте винагороду за кожного активного клієнта
        </p>
      </div>

      {/* Referral Code */}
      <div className="bg-white rounded-xl border border-claude-border p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-claude-accent/10 rounded-lg">
            <Link2 size={16} className="text-claude-accent" />
          </div>
          <h2 className="text-sm font-semibold text-claude-text uppercase tracking-wide">
            Ваше реферальне посилання
          </h2>
          <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck size={10} />
            {verification.referrerType === 'attorney' ? 'Адвокат' : verification.referrerType?.toUpperCase()}
          </span>
        </div>

        <div className="space-y-3">
          {/* Code */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-claude-bg rounded-lg border border-claude-border px-4 py-2.5">
              <span className="text-sm font-mono text-claude-text tracking-wider select-all">
                {stats?.referralCode ?? '—'}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-claude-accent/90 transition-colors text-xs font-medium"
            >
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              {copiedCode ? 'Скопійовано' : 'Копіювати'}
            </button>
          </div>

          {/* Full link */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-claude-bg rounded-lg border border-claude-border px-4 py-2.5 overflow-hidden">
              <span className="text-xs text-claude-subtext truncate block select-all">{referralLink}</span>
            </div>
            <button
              onClick={handleCopyLink}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 border border-claude-border text-claude-text rounded-lg hover:bg-claude-bg transition-colors text-xs font-medium"
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              Посилання
            </button>
          </div>
        </div>

        <p className="text-xs text-claude-subtext mt-4">
          Поділіться кодом або посиланням з колегами. Ви отримуватимете до 20% від кожного платежу запрошеного клієнта.
        </p>
      </div>

      {/* Program Terms */}
      <div className="bg-white rounded-xl border border-claude-border p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 bg-claude-accent/10 rounded-lg">
            <Award size={16} className="text-claude-accent" />
          </div>
          <h2 className="text-sm font-semibold text-claude-text uppercase tracking-wide">
            Умови програми
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-claude-accent/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-claude-accent" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-medium text-claude-text">До 20% від кожного платежу</h3>
              <p className="text-xs text-claude-subtext mt-1 leading-relaxed">
                Ви отримуєте до 20% реферальної винагороди з кожного платежу клієнта, якого ви привели на платформу. Винагорода нараховується постійно, поки клієнт залишається активним.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-claude-accent/10 flex items-center justify-center">
              <Award size={16} className="text-claude-accent" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-medium text-claude-text">Equity Share для топ-рефералів</h3>
              <p className="text-xs text-claude-subtext mt-1 leading-relaxed">
                Якщо за 3 місяці ви запросите 10+ клієнтів, кожен з яких платить від $500/міс — вся сума виплачених вам реферальних відсотків додатково конвертується в equity share компанії.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Users, label: 'Запрошено', value: String(stats?.totalReferrals ?? 0) },
          { icon: DollarSign, label: 'Оплачено рефералами', value: `$${referrals.reduce((sum, r) => sum + (r.totalPaidUsd ?? 0), 0).toFixed(2)}` },
          { icon: Gift, label: 'Зароблено (USD)', value: `$${(stats?.totalEarnedUsd ?? 0).toFixed(2)}` },
          { icon: Gift, label: 'Зароблено (UAH)', value: `₴${(stats?.totalEarnedUah ?? 0).toFixed(2)}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-claude-border p-5 hover:shadow-md hover:border-claude-subtext/30 transition-all">
            <div className="flex items-center gap-2 text-claude-subtext mb-2">
              <Icon size={16} strokeWidth={2} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-2xl font-serif font-medium text-claude-text">
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Referrals Table */}
      <div className="bg-white rounded-xl border border-claude-border overflow-hidden">
        <div className="px-6 py-4 border-b border-claude-border">
          <h2 className="text-base font-serif font-medium text-claude-text">Мої реферали</h2>
        </div>
        {referrals.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 bg-claude-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus size={24} className="text-claude-accent" />
            </div>
            <p className="text-sm text-claude-subtext">
              Поки що немає рефералів. Поділіться посиланням, щоб запросити друзів!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-claude-bg text-claude-subtext text-[11px] uppercase tracking-wide">
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
                      <div className="font-medium text-claude-text text-sm">
                        {r.referredName || r.referredEmail}
                      </div>
                      {r.referredName && (
                        <div className="text-xs text-claude-subtext">{r.referredEmail}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-claude-subtext text-sm">
                      {new Date(r.registeredAt).toLocaleDateString('uk-UA')}
                    </td>
                    <td className="px-6 py-3">
                      {r.hasToppedUp ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Поповнив баланс
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-claude-bg text-claude-subtext border border-claude-border">
                          Зареєстрований
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right text-claude-subtext font-mono text-xs">
                      {r.totalPaidUsd > 0
                        ? `$${r.totalPaidUsd.toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-claude-text text-sm">
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
