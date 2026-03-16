import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Award,
  Clock,
  Scale,
} from 'lucide-react';
import { JudgeAnalyticsRecord } from '../../services/api/JudgeAnalyticsService';

interface JudgeAnalyticsDetailProps {
  analytics: JudgeAnalyticsRecord;
}

function getAppealRateColor(rate: number): string {
  if (rate <= 0) return 'text-claude-subtext';
  if (rate < 20) return 'text-green-600';
  if (rate < 40) return 'text-yellow-600';
  return 'text-red-600';
}

function StatCard({ label, value, icon: Icon, subtext, color }: {
  label: string;
  value: string | number;
  icon: typeof BarChart3;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-claude-subtext" />
        <span className="text-xs text-claude-subtext font-sans">{label}</span>
      </div>
      <div className={`text-2xl font-serif font-medium ${color || 'text-claude-text'}`}>
        {typeof value === 'number' ? value.toLocaleString('uk-UA') : value}
      </div>
      {subtext && <p className="text-xs text-claude-subtext font-sans mt-1">{subtext}</p>}
    </div>
  );
}

export function JudgeAnalyticsDetail({ analytics }: JudgeAnalyticsDetailProps) {
  const outcomes = analytics.appeal_outcomes;
  const totalOutcomes = (outcomes?.analyzed || 0);
  const vkksu = analytics.vkksu_data || {};
  const deadlineViolations = vkksu.deadline_violations as Record<string, number> | undefined;
  const totalViolations = deadlineViolations
    ? Object.values(deadlineViolations).reduce((sum, v) => sum + (v || 0), 0)
    : 0;

  const yearEntries = Object.entries(analytics.decisions_by_year || {})
    .map(([year, count]) => ({ year: parseInt(year), count: count as number }))
    .sort((a, b) => a.year - b.year);

  const maxYearCount = Math.max(...yearEntries.map(e => e.count), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 mt-6"
    >
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <BarChart3 size={20} className="text-claude-accent" />
        <h2 className="text-xl font-serif font-medium text-claude-text">Аналітика ЄДРСР</h2>
        <span className="text-xs text-claude-subtext font-sans px-2 py-0.5 bg-claude-bg rounded-full border border-claude-border">
          {analytics.period_start} — {analytics.period_end}
        </span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Рішень"
          value={analytics.total_decisions}
          icon={Scale}
        />
        <StatCard
          label="Справ"
          value={analytics.unique_cases}
          icon={BarChart3}
        />
        <StatCard
          label="Апеляція %"
          value={analytics.appeal_rate > 0 ? `${analytics.appeal_rate}%` : '—'}
          icon={TrendingUp}
          color={getAppealRateColor(analytics.appeal_rate)}
        />
        <StatCard
          label="Ранг у суді"
          value={analytics.peer_rank_in_court && analytics.peer_total_in_court
            ? `${analytics.peer_rank_in_court} / ${analytics.peer_total_in_court}`
            : '—'}
          icon={Award}
          subtext={analytics.court_avg_decisions
            ? `Середня по суду: ${Math.round(analytics.court_avg_decisions)}`
            : undefined}
        />
      </div>

      {/* Appeal Outcomes */}
      {totalOutcomes > 0 && (
        <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
          <h3 className="text-sm font-sans font-medium text-claude-text mb-4">Результати апеляцій</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Залишено в силі', value: outcomes.upheld, color: 'bg-green-500' },
              { label: 'Скасовано', value: outcomes.overturned, color: 'bg-red-500' },
              { label: 'Змінено', value: outcomes.modified, color: 'bg-yellow-500' },
              { label: 'Не визначено', value: outcomes.unknown, color: 'bg-gray-300' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                  <span className="text-xs text-claude-subtext font-sans">{item.label}</span>
                </div>
                <div className="text-lg font-serif font-medium text-claude-text">{item.value}</div>
                {totalOutcomes > 0 && (
                  <div className="w-full bg-claude-bg rounded-full h-1.5 mt-1">
                    <div
                      className={`h-1.5 rounded-full ${item.color}`}
                      style={{ width: `${Math.round((item.value / totalOutcomes) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Year Trend */}
      {yearEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
          <h3 className="text-sm font-sans font-medium text-claude-text mb-4">Рішення по роках</h3>
          <div className="flex items-end gap-2 h-32">
            {yearEntries.map(entry => (
              <div key={entry.year} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-sans text-claude-text font-medium">
                  {entry.count.toLocaleString('uk-UA')}
                </span>
                <div
                  className="w-full bg-claude-accent/80 rounded-t-md transition-all"
                  style={{ height: `${Math.max((entry.count / maxYearCount) * 100, 4)}%` }}
                />
                <span className="text-[10px] font-sans text-claude-subtext">{entry.year}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VKKSU Efficiency */}
      {totalViolations > 0 && (
        <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-claude-subtext" />
            <h3 className="text-sm font-sans font-medium text-claude-text">Ефективність (ВККС)</h3>
          </div>
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-sans font-medium text-red-700">
                {totalViolations} порушень строків
              </p>
              <p className="text-xs text-red-500 font-sans mt-0.5">
                {deadlineViolations && Object.entries(deadlineViolations)
                  .filter(([, v]) => v > 0)
                  .map(([kind, v]) => `${kind}: ${v}`)
                  .join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Categories */}
      {analytics.top_categories && analytics.top_categories.length > 0 && (
        <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
          <h3 className="text-sm font-sans font-medium text-claude-text mb-3">Топ категорій справ</h3>
          <div className="space-y-2">
            {analytics.top_categories.slice(0, 7).map((cat, idx) => (
              <div key={cat.code} className="flex items-center gap-3">
                <span className="text-xs text-claude-subtext font-sans w-4 text-right">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-sans text-claude-text truncate">{cat.name}</span>
                    <span className="text-xs font-sans text-claude-subtext flex-shrink-0">{cat.count}</span>
                  </div>
                  <div className="w-full bg-claude-bg rounded-full h-1">
                    <div
                      className="h-1 rounded-full bg-claude-accent/60"
                      style={{ width: `${Math.round((cat.count / (analytics.top_categories[0]?.count || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
