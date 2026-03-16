import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Scale,
  FileText,
  BarChart3,
  Clock,
  Info,
} from 'lucide-react';
import type { JudgeProfile } from '../../services/api/JudgesService';

interface JudgeProfilePageProps {
  profile: JudgeProfile;
  onBack: () => void;
  children?: React.ReactNode;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function computeExperience(firstSeen: string | null): string | null {
  if (!firstSeen) return null;
  const start = new Date(firstSeen);
  const now = new Date();
  const years = now.getFullYear() - start.getFullYear();
  const months = now.getMonth() - start.getMonth();
  const totalMonths = years * 12 + months;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m} міс.`;
  if (m === 0) return `${y} р.`;
  return `${y} р. ${m} міс.`;
}

export function JudgeProfilePage({ profile, onBack, children }: JudgeProfilePageProps) {
  const { basic, court_history, stats } = profile;

  const initials = basic.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');

  const experience = computeExperience(basic.first_seen);
  const maxDecisions = stats
    ? Math.max(...stats.by_justice_kind.map((s) => s.count), 1)
    : 1;
  const maxFormCount = stats
    ? Math.max(...stats.by_judgment_form.map((s) => s.count), 1)
    : 1;
  const maxYearCount = stats
    ? Math.max(...stats.year_activity.map((y) => y.count), 1)
    : 1;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors group"
        >
          <ArrowLeft
            size={18}
            className="group-hover:-translate-x-1 transition-transform"
          />
          <span className="font-sans text-sm">Назад до списку</span>
        </button>

        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative bg-white rounded-2xl p-6 md:p-8 border border-claude-border shadow-sm overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-claude-accent/10 to-claude-bg" />

          <div className="relative flex flex-col md:flex-row items-start md:items-end gap-6 pt-12">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-claude-sidebar border-4 border-white shadow-md flex items-center justify-center text-3xl font-serif text-claude-subtext">
              {initials}
            </div>

            <div className="flex-1 mb-2">
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight">
                {basic.full_name}
              </h1>
              {basic.court_name && (
                <p className="text-claude-subtext mt-1 font-sans flex items-center gap-1.5">
                  <Building2 size={14} className="flex-shrink-0" />
                  {basic.court_name}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {basic.dossier_number && (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-claude-bg text-claude-subtext border border-claude-border">
                    Досьє: {basic.dossier_number}
                  </span>
                )}
                {experience && (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-claude-accent/10 text-claude-accent border border-claude-accent/20">
                    <Clock size={14} className="mr-1.5" />
                    {experience}
                  </span>
                )}
                {basic.first_seen && (
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm text-claude-subtext bg-claude-bg border border-claude-border">
                    <Calendar size={14} className="mr-1.5" />
                    з {formatDate(basic.first_seen)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Court History */}
        {court_history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
          >
            <h2 className="text-xl font-serif text-claude-text mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-claude-accent" />
              Історія призначень
            </h2>
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-claude-border" />
              <div className="space-y-4">
                {court_history.map((entry, i) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full bg-claude-accent border-2 border-white shadow-sm" />
                    <div className="flex-1 p-3 bg-claude-bg rounded-xl">
                      <h3 className="font-sans font-medium text-claude-text text-sm">
                        {entry.court_name}
                      </h3>
                      <p className="text-xs text-claude-subtext font-sans mt-1">
                        {formatDate(entry.first_seen)} — {formatDate(entry.last_seen)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats Section */}
        {stats ? (
          <>
            {/* Total Decisions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
            >
              <h2 className="text-xl font-serif text-claude-text mb-4 flex items-center gap-2">
                <Scale size={20} className="text-claude-accent" />
                Судові рішення
              </h2>
              <div className="text-center py-4">
                <p className="text-5xl font-serif font-medium text-claude-text">
                  {stats.total_decisions.toLocaleString('uk-UA')}
                </p>
                <p className="text-sm text-claude-subtext mt-1 font-sans">
                  загальна кількість рішень
                </p>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* By Justice Kind */}
              {stats.by_justice_kind.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
                >
                  <h2 className="text-lg font-serif text-claude-text mb-4 flex items-center gap-2">
                    <BarChart3 size={18} className="text-claude-accent" />
                    За видом судочинства
                  </h2>
                  <div className="space-y-3">
                    {stats.by_justice_kind.map((jk) => (
                      <div key={jk.id}>
                        <div className="flex justify-between text-sm font-sans mb-1">
                          <span className="text-claude-text">{jk.name}</span>
                          <span className="text-claude-subtext">{jk.count.toLocaleString('uk-UA')}</span>
                        </div>
                        <div className="h-2 bg-claude-bg rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(jk.count / maxDecisions) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="h-full bg-claude-accent rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* By Judgment Form */}
              {stats.by_judgment_form.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                  className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
                >
                  <h2 className="text-lg font-serif text-claude-text mb-4 flex items-center gap-2">
                    <FileText size={18} className="text-claude-accent" />
                    За формою рішення
                  </h2>
                  <div className="space-y-3">
                    {stats.by_judgment_form.map((jf) => (
                      <div key={jf.id}>
                        <div className="flex justify-between text-sm font-sans mb-1">
                          <span className="text-claude-text">{jf.name}</span>
                          <span className="text-claude-subtext">{jf.count.toLocaleString('uk-UA')}</span>
                        </div>
                        <div className="h-2 bg-claude-bg rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(jf.count / maxFormCount) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="h-full bg-claude-accent/70 rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Year Activity */}
            {stats.year_activity.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
              >
                <h2 className="text-lg font-serif text-claude-text mb-4 flex items-center gap-2">
                  <Calendar size={18} className="text-claude-accent" />
                  Активність за роками
                </h2>
                <div className="flex items-end gap-3 h-40">
                  {stats.year_activity.map((ya) => (
                    <div key={ya.year} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-sans text-claude-subtext">
                        {ya.count > 0 ? ya.count.toLocaleString('uk-UA') : '—'}
                      </span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{
                          height: ya.count > 0 ? `${Math.max((ya.count / maxYearCount) * 100, 4)}%` : '2%',
                        }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className={`w-full rounded-t-lg ${ya.count > 0 ? 'bg-claude-accent' : 'bg-claude-border'}`}
                      />
                      <span className="text-xs font-sans text-claude-subtext font-medium">
                        {ya.year}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recent Decisions */}
            {stats.recent_decisions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
              >
                <h2 className="text-lg font-serif text-claude-text mb-4 flex items-center gap-2">
                  <FileText size={18} className="text-claude-accent" />
                  Останні рішення
                </h2>
                <div className="space-y-3">
                  {stats.recent_decisions.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 border border-claude-border/50 rounded-xl hover:bg-claude-bg/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {d.case_number && (
                            <p className="text-sm font-medium text-claude-text font-sans truncate">
                              {d.case_number}
                            </p>
                          )}
                          {d.snippet && (
                            <p className="text-xs text-claude-subtext font-sans mt-0.5 line-clamp-2">
                              {d.snippet}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {d.justice_kind && (
                              <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-0.5 rounded font-sans">
                                {d.justice_kind}
                              </span>
                            )}
                            {d.doc_type && (
                              <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-0.5 rounded font-sans">
                                {d.doc_type}
                              </span>
                            )}
                          </div>
                        </div>
                        {d.adjudication_date && (
                          <span className="text-xs text-claude-subtext font-sans whitespace-nowrap">
                            {formatDate(d.adjudication_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        ) : (
          /* No ZO data fallback */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
          >
            <div className="flex items-start gap-3 text-claude-subtext">
              <Info size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-sans text-sm font-medium text-claude-text">
                  Статистика рішень недоступна
                </p>
                <p className="font-sans text-sm mt-1">
                  Не вдалося знайти цього суддю в реєстрі судових рішень ZakonOnline.
                  Базова інформація отримана з досьє ВККС.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Additional content (e.g. analytics) */}
        {children}
      </div>
    </div>
  );
}
