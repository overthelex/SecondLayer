/**
 * Abuse Report Page
 * Public page for reporting violations — forbidden content, copyright issues, illegal use.
 * No authentication required.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { abuseService, type AbuseReportPayload } from '../services/api/AbuseService';

type AbuseType = AbuseReportPayload['type'];

const ABUSE_TYPES: { value: AbuseType; label: string }[] = [
  { value: 'forbidden_content', label: 'Заборонений контент' },
  { value: 'copyright', label: 'Порушення авторських прав' },
  { value: 'illegal_use', label: 'Незаконне використання платформи' },
  { value: 'other', label: 'Інше' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AbuseReportPage() {
  const navigate = useNavigate();

  useDocumentMeta({
    title: 'Повідомити про порушення | LEX AI',
    description: 'Повідомте про заборонений контент, порушення авторських прав або незаконне використання платформи LEX AI.',
    ogTitle: 'Повідомити про порушення | LEX AI',
    ogDescription: 'Канал для повідомлень про порушення на платформі LEX AI.',
  });

  const [type, setType] = useState<AbuseType>('forbidden_content');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = EMAIL_RE.test(email.trim()) && description.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      await abuseService.submitReport({
        type,
        email: email.trim(),
        description: description.trim(),
        contentUrl: contentUrl.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || err?.details?.error || 'Не вдалося надіслати повідомлення. Спробуйте пізніше.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-claude-bg">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-claude-border sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <Link to="/" className="font-serif text-lg font-semibold text-claude-text tracking-tight">
                LEX AI
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <ShieldAlert size={22} className="text-red-600" />
            </div>
          </div>
          <h1 className="font-serif text-2xl sm:text-4xl font-semibold text-claude-text leading-tight tracking-tight mb-3">
            Повідомити про порушення
          </h1>
          <p className="text-sm sm:text-base text-claude-subtext leading-relaxed max-w-2xl">
            Цей канал призначений для повідомлень про порушення на платформі LEX AI.
            Ви можете повідомити про заборонений контент, порушення авторських прав,
            незаконне використання платформи або інші порушення.
            Усі повідомлення розглядаються оператором платформи.
          </p>
        </div>

        {submitted ? (
          /* Success state */
          <div className="bg-white rounded-xl border border-claude-border p-6 sm:p-8 text-center">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-serif font-semibold text-claude-text mb-2">
              Дякуємо за повідомлення
            </h2>
            <p className="text-claude-subtext text-sm mb-6">
              Ми розглянемо ваше повідомлення найближчим часом. За потреби зв'яжемося з вами
              за вказаною email-адресою.
            </p>
            <button
              onClick={() => navigate('/')}
              className="text-sm text-claude-accent hover:underline"
            >
              Повернутися на головну
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-claude-border p-6 sm:p-8 space-y-6">
            {/* Type */}
            <div>
              <label htmlFor="abuse-type" className="block text-sm font-medium text-claude-text mb-1.5">
                Тип порушення <span className="text-red-500">*</span>
              </label>
              <select
                id="abuse-type"
                value={type}
                onChange={(e) => setType(e.target.value as AbuseType)}
                className="w-full rounded-lg border border-claude-border bg-white px-3 py-2.5 text-sm text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent transition-colors"
              >
                {ABUSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="abuse-email" className="block text-sm font-medium text-claude-text mb-1.5">
                Email для зворотного зв'язку <span className="text-red-500">*</span>
              </label>
              <input
                id="abuse-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full rounded-lg border border-claude-border bg-white px-3 py-2.5 text-sm text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="abuse-description" className="block text-sm font-medium text-claude-text mb-1.5">
                Опис порушення <span className="text-red-500">*</span>
              </label>
              <textarea
                id="abuse-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Детально опишіть порушення, яке ви хочете повідомити..."
                required
                rows={5}
                maxLength={5000}
                className="w-full rounded-lg border border-claude-border bg-white px-3 py-2.5 text-sm text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent transition-colors resize-y min-h-[120px]"
              />
              <p className="text-xs text-claude-subtext mt-1">
                {description.length}/5000 символів (мінімум 10)
              </p>
            </div>

            {/* Content URL */}
            <div>
              <label htmlFor="abuse-url" className="block text-sm font-medium text-claude-text mb-1.5">
                URL або ідентифікатор контенту
                <span className="text-claude-subtext font-normal ml-1">(необов'язково)</span>
              </label>
              <input
                id="abuse-url"
                type="text"
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                placeholder="https://legal.org.ua/... або ідентифікатор документа"
                className="w-full rounded-lg border border-claude-border bg-white px-3 py-2.5 text-sm text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-claude-text text-white text-sm font-medium hover:bg-claude-text/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={15} />
              {submitting ? 'Надсилання...' : 'Надіслати повідомлення'}
            </button>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-8 space-y-4 text-sm text-claude-subtext">
          <p>
            Також ви можете надіслати повідомлення безпосередньо на{' '}
            <a href="mailto:abuse@legal.org.ua" className="text-claude-text underline underline-offset-2 decoration-claude-accent/40 hover:decoration-claude-accent">
              abuse@legal.org.ua
            </a>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/ua/terms" className="hover:text-claude-text transition-colors underline underline-offset-2 decoration-claude-border hover:decoration-claude-accent">
              Умови використання
            </Link>
            <Link to="/ua/ai-usage" className="hover:text-claude-text transition-colors underline underline-offset-2 decoration-claude-border hover:decoration-claude-accent">
              Політика використання AI
            </Link>
            <Link to="/ua/privacy" className="hover:text-claude-text transition-colors underline underline-offset-2 decoration-claude-border hover:decoration-claude-accent">
              Конфіденційність
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
