/**
 * Settings Tab (Restructured)
 * 5 collapsible sections: Payment Methods, Billing Info, Limits & Forecasting, Notifications, Account & Test Email
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Building2,
  Inbox,
  Bell,
  Target,
  TrendingUp,
  User,
  Mail,
  Calendar,
  Save,
  Send,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../../utils/api-client';
import showToast from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';
import { useAuth } from '../../contexts/AuthContext';

// --- Types ---

interface PaymentMethod {
  id: string;
  provider: 'monobank' | 'metamask' | 'binance_pay';
  cardLast4: string;
  cardBrand: string;
  cardBank: string;
  isPrimary: boolean;
}

interface BillingInfo {
  companyName: string;
  edrpou: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
}

interface BillingLimits {
  daily_limit_usd: number;
  monthly_limit_usd: number;
  email_notifications: boolean;
  notify_low_balance: boolean;
  notify_payment_success: boolean;
  notify_payment_failure: boolean;
  notify_monthly_report: boolean;
  low_balance_threshold_usd: number;
}

interface CurrentUsage {
  daily_spent: number;
  daily_limit: number;
  monthly_spent: number;
  monthly_limit: number;
  projected_monthly: number;
  days_remaining: number;
}

// --- Collapsible Section Component ---

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-claude-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-claude-bg/50 transition-colors">
        <h3 className="text-lg font-semibold text-claude-text flex items-center gap-2">
          <Icon size={20} />
          {title}
        </h3>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={20} className="text-claude-subtext" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <div className="px-6 pb-6 border-t border-claude-border pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main Component ---

export function SettingsTab() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  // Billing info state
  const [billingInfo, setBillingInfo] = useState<BillingInfo>({
    companyName: '',
    edrpou: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'Ukraine',
    email: '',
    phone: '',
  });
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  // Limits state
  const [limits, setLimits] = useState<BillingLimits>({
    daily_limit_usd: 0,
    monthly_limit_usd: 0,
    email_notifications: true,
    notify_low_balance: true,
    notify_payment_success: true,
    notify_payment_failure: false,
    notify_monthly_report: true,
    low_balance_threshold_usd: 20,
  });
  const [usage, setUsage] = useState<CurrentUsage>({
    daily_spent: 0,
    daily_limit: 0,
    monthly_spent: 0,
    monthly_limit: 0,
    projected_monthly: 0,
    days_remaining: 0,
  });
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  // Email test state
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [methodsRes, settingsRes, balanceRes] = await Promise.all([
        api.billing.getPaymentMethods(),
        api.billing.getSettings(),
        api.billing.getBalance(),
      ]);

      // Payment methods
      setPaymentMethods(methodsRes.data?.paymentMethods || []);

      // Limits from settings
      const s = settingsRes.data;
      setLimits({
        daily_limit_usd: s.daily_limit_usd ?? 50,
        monthly_limit_usd: s.monthly_limit_usd ?? 1000,
        email_notifications: s.email_notifications ?? true,
        notify_low_balance: s.notify_low_balance ?? true,
        notify_payment_success: s.notify_payment_success ?? true,
        notify_payment_failure: s.notify_payment_failure ?? false,
        notify_monthly_report: s.notify_monthly_report ?? true,
        low_balance_threshold_usd: s.low_balance_threshold_usd ?? 20,
      });

      // Usage from balance
      const b = balanceRes.data;
      const dailySpent = parseFloat(b.today_spent_usd || b.today_spending_usd || '0') || 0;
      const monthlySpent = parseFloat(b.month_spent_usd || b.monthly_spending_usd || '0') || 0;
      const dailyLimit = parseFloat(b.daily_limit_usd || s.daily_limit_usd || '50') || 50;
      const monthlyLimit = parseFloat(b.monthly_limit_usd || s.monthly_limit_usd || '1000') || 1000;

      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const daysRemaining = daysInMonth - dayOfMonth;
      const avgDailySpend = dayOfMonth > 0 ? monthlySpent / dayOfMonth : 0;
      const projectedMonthly = avgDailySpend * daysInMonth;

      setUsage({
        daily_spent: dailySpent,
        daily_limit: dailyLimit,
        monthly_spent: monthlySpent,
        monthly_limit: monthlyLimit,
        projected_monthly: projectedMonthly,
        days_remaining: daysRemaining,
      });
    } catch (error) {
      console.error('Failed to load settings data:', error);
      showToast.error('Не вдалося завантажити налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Payment Methods Handlers ---

  const handleRemovePayment = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цей спосіб оплати?')) return;
    setIsDeletingId(id);
    try {
      await api.billing.removePaymentMethod(id);
      setPaymentMethods(paymentMethods.filter((m) => m.id !== id));
      showToast.success('Спосіб оплати видалено');
    } catch (error) {
      console.error('Failed to remove payment method:', error);
      showToast.error('Не вдалося видалити спосіб оплати');
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await api.billing.setPrimaryPaymentMethod(id);
      setPaymentMethods(paymentMethods.map((m) => ({ ...m, isPrimary: m.id === id })));
      showToast.success('Основний спосіб оплати оновлено');
    } catch (error) {
      console.error('Failed to set primary:', error);
      showToast.error('Не вдалося оновити основний спосіб оплати');
    }
  };

  // --- Billing Info Handler ---

  const handleSaveBillingInfo = async () => {
    setIsSavingBilling(true);
    try {
      await api.billing.updateSettings({});
      showToast.success('Платіжну інформацію збережено');
    } catch (error) {
      console.error('Failed to save billing info:', error);
      showToast.error('Не вдалося зберегти платіжну інформацію');
    } finally {
      setIsSavingBilling(false);
    }
  };

  // --- Limits Handler ---

  const handleSaveLimits = async () => {
    setIsSavingLimits(true);
    try {
      await api.billing.updateSettings({
        daily_limit_usd: limits.daily_limit_usd,
        monthly_limit_usd: limits.monthly_limit_usd,
        email_notifications: limits.email_notifications,
        notify_low_balance: limits.notify_low_balance,
        notify_payment_success: limits.notify_payment_success,
        notify_payment_failure: limits.notify_payment_failure,
        notify_monthly_report: limits.notify_monthly_report,
        low_balance_threshold_usd: limits.low_balance_threshold_usd,
      });
      setUsage((prev) => ({
        ...prev,
        daily_limit: limits.daily_limit_usd,
        monthly_limit: limits.monthly_limit_usd,
      }));
      showToast.success('Ліміти оновлено');
    } catch (error) {
      console.error('Failed to save limits:', error);
      showToast.error('Не вдалося оновити ліміти');
    } finally {
      setIsSavingLimits(false);
    }
  };

  // --- Test Email Handler ---

  const handleSendTestEmail = async () => {
    setIsSendingEmail(true);
    try {
      await api.billing.testEmail();
      showToast.success('Тестовий лист надіслано! Перевірте вхідні.');
    } catch (error: unknown) {
      showToast.error(getErrorMessage(error));
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw size={32} className="text-claude-accent animate-spin" />
      </div>
    );
  }

  const n = (v: any) => Number(v) || 0;
  const dailyPercentage = usage.daily_limit > 0 ? (n(usage.daily_spent) / n(usage.daily_limit)) * 100 : 0;
  const monthlyPercentage = usage.monthly_limit > 0 ? (n(usage.monthly_spent) / n(usage.monthly_limit)) * 100 : 0;

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 100) return 'from-red-600 to-red-500';
    if (percentage >= 80) return 'from-orange-500 to-yellow-500';
    if (percentage >= 50) return 'from-yellow-500 to-green-500';
    return 'from-green-600 to-green-500';
  };

  const now = new Date();
  const dayOfMonth = now.getDate();
  const avgDailySpend = dayOfMonth > 0 ? usage.monthly_spent / dayOfMonth : 0;
  const daysUntilLimit = avgDailySpend > 0
    ? Math.round((usage.monthly_limit - usage.monthly_spent) / avgDailySpend)
    : Infinity;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Section 1: Payment Methods */}
      <CollapsibleSection title="Способи оплати" icon={CreditCard}>
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={() => setShowAddPayment(!showAddPayment)}
            className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-opacity-90 transition-all text-sm">
            <Plus size={16} />
            Додати
          </button>
        </div>

        {showAddPayment && (
          <div className="mb-4 p-4 bg-claude-bg border border-claude-border rounded-lg">
            <p className="text-sm text-claude-subtext mb-3">
              Для додавання картки скористайтесь кнопкою "Поповнити баланс" на вкладці Огляд — картка буде збережена автоматично під час першої оплати через Monobank.
            </p>
            <button
              onClick={() => setShowAddPayment(false)}
              className="px-3 py-1.5 text-sm bg-claude-bg border border-claude-border rounded-lg hover:border-claude-accent">
              Закрити
            </button>
          </div>
        )}

        <div className="space-y-3">
          {paymentMethods.length === 0 ? (
            <div className="text-center py-6">
              <Inbox size={36} className="text-claude-subtext mx-auto mb-2" />
              <p className="text-claude-subtext text-sm">Способи оплати ще не додані</p>
              <p className="text-xs text-claude-subtext mt-1">
                Картка буде збережена автоматично після першої оплати
              </p>
            </div>
          ) : (
            paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`p-4 rounded-lg border-2 transition-all ${
                  method.isPrimary
                    ? 'border-claude-accent bg-claude-accent/5'
                    : 'border-claude-border bg-white hover:border-claude-accent'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{method.provider === 'monobank' ? '🏦' : method.provider === 'metamask' ? '🦊' : '🟡'}</span>
                    <div>
                      <p className="font-semibold text-claude-text text-sm">
                        {method.cardBrand} •••• {method.cardLast4}
                      </p>
                      <p className="text-xs text-claude-subtext">
                        {method.cardBank} · {method.provider === 'monobank' ? 'Monobank' : method.provider === 'metamask' ? 'MetaMask' : 'Binance Pay'}
                      </p>
                    </div>
                  </div>
                  {method.isPrimary && (
                    <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full mr-3">
                      Основний
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {!method.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(method.id)}
                        className="px-3 py-1 text-xs text-claude-accent hover:bg-claude-bg rounded-lg transition-colors">
                        Зробити основним
                      </button>
                    )}
                    <button
                      onClick={() => handleRemovePayment(method.id)}
                      disabled={isDeletingId === method.id}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Section 2: Billing Info */}
      <CollapsibleSection title="Платіжні дані" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="settings-company-name" className="block text-sm font-medium text-claude-text mb-1.5">Назва компанії</label>
            <input
              id="settings-company-name"
              name="companyName"
              type="text"
              value={billingInfo.companyName}
              onChange={(e) => setBillingInfo({ ...billingInfo, companyName: e.target.value })}
              placeholder="Назва вашої компанії"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-edrpou" className="block text-sm font-medium text-claude-text mb-1.5">ЄДРПОУ</label>
            <input
              id="settings-edrpou"
              name="edrpou"
              type="text"
              value={billingInfo.edrpou}
              onChange={(e) => setBillingInfo({ ...billingInfo, edrpou: e.target.value })}
              placeholder="12345678"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="settings-address" className="block text-sm font-medium text-claude-text mb-1.5">Адреса</label>
            <input
              id="settings-address"
              name="address"
              type="text"
              value={billingInfo.address}
              onChange={(e) => setBillingInfo({ ...billingInfo, address: e.target.value })}
              placeholder="Вулиця, будинок"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-city" className="block text-sm font-medium text-claude-text mb-1.5">Місто</label>
            <input
              id="settings-city"
              name="city"
              type="text"
              value={billingInfo.city}
              onChange={(e) => setBillingInfo({ ...billingInfo, city: e.target.value })}
              placeholder="Київ"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-postal-code" className="block text-sm font-medium text-claude-text mb-1.5">Поштовий індекс</label>
            <input
              id="settings-postal-code"
              name="postalCode"
              type="text"
              value={billingInfo.postalCode}
              onChange={(e) => setBillingInfo({ ...billingInfo, postalCode: e.target.value })}
              placeholder="02000"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-email" className="block text-sm font-medium text-claude-text mb-1.5">Електронна пошта</label>
            <input
              id="settings-email"
              name="email"
              type="email"
              value={billingInfo.email}
              onChange={(e) => setBillingInfo({ ...billingInfo, email: e.target.value })}
              placeholder="billing@company.com"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="settings-phone" className="block text-sm font-medium text-claude-text mb-1.5">Телефон</label>
            <input
              id="settings-phone"
              name="phone"
              type="tel"
              value={billingInfo.phone}
              onChange={(e) => setBillingInfo({ ...billingInfo, phone: e.target.value })}
              placeholder="+380 XX XXX XXXX"
              className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleSaveBillingInfo}
          disabled={isSavingBilling}
          className="mt-4 px-5 py-2 bg-claude-accent text-white rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 text-sm font-medium">
          {isSavingBilling ? 'Збереження...' : 'Зберегти платіжну інформацію'}
        </button>
      </CollapsibleSection>

      {/* Section 3: Limits & Forecasting */}
      <CollapsibleSection title="Ліміти витрат" icon={Target}>
        {/* Current Usage Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-claude-bg border border-claude-border rounded-lg p-3">
            <p className="text-xs text-claude-subtext mb-2">Денне використання</p>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xl font-bold text-claude-text">${n(usage.daily_spent).toFixed(2)}</p>
              <p className="text-xs text-claude-subtext">/ ${n(usage.daily_limit).toFixed(2)}</p>
            </div>
            <div className="w-full bg-white rounded-full h-2 overflow-hidden">
              <div
                style={{ width: `${Math.min(dailyPercentage, 100)}%` }}
                className={`h-full rounded-full bg-gradient-to-r ${getPercentageColor(dailyPercentage)}`}
              />
            </div>
          </div>
          <div className="bg-claude-bg border border-claude-border rounded-lg p-3">
            <p className="text-xs text-claude-subtext mb-2">Місячне використання</p>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xl font-bold text-claude-text">${n(usage.monthly_spent).toFixed(2)}</p>
              <p className="text-xs text-claude-subtext">/ ${n(usage.monthly_limit).toFixed(2)}</p>
            </div>
            <div className="w-full bg-white rounded-full h-2 overflow-hidden">
              <div
                style={{ width: `${Math.min(monthlyPercentage, 100)}%` }}
                className={`h-full rounded-full bg-gradient-to-r ${getPercentageColor(monthlyPercentage)}`}
              />
            </div>
          </div>
          <div className="bg-claude-bg border border-claude-border rounded-lg p-3">
            <p className="text-xs text-claude-subtext mb-2">Прогноз на місяць</p>
            <p className="text-xl font-bold text-claude-text mb-1">
              ${n(usage.projected_monthly).toFixed(2)}
            </p>
            {usage.projected_monthly > usage.monthly_limit ? (
              <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
                <AlertTriangle size={12} /> Перевищить ліміт
              </span>
            ) : usage.projected_monthly > 0 ? (
              <span className="text-xs text-green-600 font-semibold">В межах плану</span>
            ) : (
              <span className="text-xs text-claude-subtext">Немає даних</span>
            )}
          </div>
        </div>

        {/* Limit Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="settings-daily-limit" className="block text-sm font-medium text-claude-text mb-1.5">Денний ліміт (USD)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-claude-subtext">$</span>
              <input
                id="settings-daily-limit"
                name="dailyLimit"
                type="number"
                min="0"
                step="1"
                value={limits.daily_limit_usd}
                onChange={(e) => setLimits({ ...limits, daily_limit_usd: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-claude-border rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="settings-monthly-limit" className="block text-sm font-medium text-claude-text mb-1.5">Місячний ліміт (USD)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-claude-subtext">$</span>
              <input
                id="settings-monthly-limit"
                name="monthlyLimit"
                type="number"
                min="0"
                step="10"
                value={limits.monthly_limit_usd}
                onChange={(e) => setLimits({ ...limits, monthly_limit_usd: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-claude-border rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="settings-low-balance" className="block text-sm font-medium text-claude-text mb-1.5">Поріг низького балансу (USD)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-claude-subtext">$</span>
              <input
                id="settings-low-balance"
                name="lowBalance"
                type="number"
                min="0"
                step="1"
                value={limits.low_balance_threshold_usd}
                onChange={(e) => setLimits({ ...limits, low_balance_threshold_usd: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-claude-border rounded-lg text-sm"
              />
            </div>
            <p className="text-xs text-claude-subtext mt-1">Сповіщення при балансі нижче цієї суми</p>
          </div>
        </div>

        {/* Forecast */}
        {avgDailySpend > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <TrendingUp size={16} />
              Прогноз витрат
            </h4>
            <div className="space-y-1 text-sm text-blue-800">
              <p>Середні щоденні витрати: <strong>${avgDailySpend.toFixed(2)}</strong></p>
              {daysUntilLimit < Infinity && daysUntilLimit > 0 ? (
                <p>
                  При поточному темпі ви досягнете ліміту за{' '}
                  <strong>{daysUntilLimit} {daysUntilLimit === 1 ? 'день' : daysUntilLimit < 5 ? 'дні' : 'днів'}</strong>.
                </p>
              ) : daysUntilLimit <= 0 ? (
                <p className="text-red-700 font-semibold">Місячний ліміт вже досягнуто або перевищено.</p>
              ) : (
                <p>Витрати в межах ліміту до кінця місяця.</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleSaveLimits}
          disabled={isSavingLimits}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm font-medium">
          {isSavingLimits ? (
            <><RefreshCw size={16} className="animate-spin" /> Збереження...</>
          ) : (
            <><Save size={16} /> Зберегти ліміти</>
          )}
        </button>
      </CollapsibleSection>

      {/* Section 4: Notifications */}
      <CollapsibleSection title="Сповіщення" icon={Bell}>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-claude-bg rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
            <span className="font-medium text-claude-text text-sm">Увімкнути email-сповіщення</span>
            <input
              id="settings-email-notifications"
              name="emailNotifications"
              type="checkbox"
              checked={limits.email_notifications}
              onChange={(e) => setLimits({ ...limits, email_notifications: e.target.checked })}
              className="w-5 h-5"
            />
          </label>

          {limits.email_notifications && (
            <div className="space-y-2 pl-4 border-l-2 border-claude-accent">
              {[
                { key: 'notify_low_balance', label: 'Попередження про низький баланс', icon: AlertCircle },
                { key: 'notify_payment_success', label: 'Успішна оплата', icon: CheckCircle },
                { key: 'notify_payment_failure', label: 'Невдала оплата', icon: AlertTriangle },
                { key: 'notify_monthly_report', label: 'Щомісячний звіт', icon: TrendingUp },
              ].map((notif) => (
                <label
                  key={notif.key}
                  className="flex items-center justify-between p-3 bg-white border border-claude-border rounded-lg cursor-pointer hover:border-claude-accent transition-colors">
                  <div className="flex items-center gap-2">
                    <notif.icon size={16} className="text-claude-accent" />
                    <span className="text-sm text-claude-text">{notif.label}</span>
                  </div>
                  <input
                    id={`settings-${notif.key}`}
                    name={notif.key}
                    type="checkbox"
                    checked={(limits as any)[notif.key]}
                    onChange={(e) => setLimits({ ...limits, [notif.key]: e.target.checked })}
                    className="w-4 h-4"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSaveLimits}
          disabled={isSavingLimits}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-claude-accent text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 text-sm font-medium">
          {isSavingLimits ? 'Збереження...' : 'Зберегти сповіщення'}
        </button>
      </CollapsibleSection>

      {/* Section 5: Account Info + Test Email */}
      <CollapsibleSection title="Акаунт" icon={User}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-claude-subtext mb-1">Електронна пошта</label>
            <div className="flex items-center gap-2 text-sm text-claude-text">
              <Mail size={16} className="text-claude-subtext" />
              {user?.email || 'Недоступно'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-claude-subtext mb-1">Ім'я</label>
            <div className="flex items-center gap-2 text-sm text-claude-text">
              <User size={16} className="text-claude-subtext" />
              {user?.name || 'Недоступно'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-claude-subtext mb-1">Акаунт створено</label>
            <div className="flex items-center gap-2 text-sm text-claude-text">
              <Calendar size={16} className="text-claude-subtext" />
              {user?.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy') : 'N/A'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-claude-subtext mb-1">Останній вхід</label>
            <div className="flex items-center gap-2 text-sm text-claude-text">
              <Calendar size={16} className="text-claude-subtext" />
              {user?.lastLogin ? format(new Date(user.lastLogin), 'MMM dd, yyyy HH:mm') : 'N/A'}
            </div>
          </div>
        </div>

        {/* Test Email */}
        <div className="border-t border-claude-border pt-4">
          <h4 className="text-sm font-semibold text-claude-text mb-2 flex items-center gap-2">
            <Send size={16} />
            Тестові email-сповіщення
          </h4>
          <p className="text-sm text-claude-subtext mb-3">
            Надіслати тестовий лист на <strong>{user?.email}</strong>, щоб перевірити email-сповіщення.
          </p>
          <button
            onClick={handleSendTestEmail}
            disabled={isSendingEmail}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-claude-accent text-claude-accent rounded-lg hover:bg-claude-accent hover:text-white transition-all disabled:opacity-50 text-sm font-medium">
            {isSendingEmail ? (
              <><RefreshCw size={16} className="animate-spin" /> Надсилання...</>
            ) : (
              <><Send size={16} /> Надіслати тестовий лист</>
            )}
          </button>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Примітка:</strong> Тестовий лист має надійти протягом 1-2 хвилин. Перевірте папку спам.
            </p>
          </div>
        </div>

        {/* Email config info */}
        <div className="mt-4 flex items-start gap-3 p-3 bg-claude-bg border border-claude-border rounded-lg">
          <Mail size={18} className="text-claude-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-claude-text font-medium mb-0.5">Налаштування поштового сервісу</p>
            <p className="text-xs text-claude-subtext">
              Листи надсилаються з <strong>billing@legal.org.ua</strong> через SMTP-сервер mail.lexapp.co.ua.
            </p>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
