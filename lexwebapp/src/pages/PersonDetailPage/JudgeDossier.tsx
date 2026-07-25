import { motion } from 'framer-motion';
import {
  FileText,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';
import { JudgeAnalyticsRecord, PeerJudge } from '../../services/api/JudgeAnalyticsService';

interface JudgeDossierProps {
  analytics: JudgeAnalyticsRecord;
  peers: PeerJudge[];
  totalInCourt: number;
}

function fmt(n: number): string {
  return n.toLocaleString('uk-UA');
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

function getSpecialization(justiceKinds: Record<string, number>): string {
  const entries = Object.entries(justiceKinds);
  if (entries.length === 0) return '—';
  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const topShare = ((entries[0][1] / total) * 100).toFixed(0);
  return `${entries[0][0]} (${topShare}% справ)`;
}

function computeCompetenceAssessment(analytics: JudgeAnalyticsRecord): {
  label: string;
  level: 'good' | 'medium' | 'bad';
  details: string[];
} {
  const outcomes = analytics.appeal_outcomes;
  const analyzed = outcomes?.analyzed || 0;
  const overturned = (outcomes?.overturned || 0) + (outcomes?.modified || 0);
  const overturnedRate = analyzed > 0 ? (overturned / analyzed) * 100 : 0;

  const details: string[] = [];

  if (analyzed > 0) {
    details.push(
      `Рівень скасувань/змін в апеляції: ${overturnedRate.toFixed(1)}% від проаналізованих рішень`
    );
  }

  if (overturnedRate > 40) {
    return { label: 'Нижче за середню', level: 'bad', details };
  }
  if (overturnedRate > 20) {
    return { label: 'Середня', level: 'medium', details };
  }
  return { label: 'Вище за середню', level: 'good', details };
}

function computeEfficiencyAssessment(analytics: JudgeAnalyticsRecord): {
  label: string;
  level: 'good' | 'medium' | 'bad';
  details: string[];
} {
  const details: string[] = [];
  const vkksu = analytics.vkksu_data || {};
  const deadlineViolations = vkksu.deadline_violations as Record<string, number> | undefined;
  const totalViolations = deadlineViolations
    ? Object.values(deadlineViolations).reduce((sum, v) => sum + (v || 0), 0)
    : 0;

  const rank = analytics.peer_rank_in_court;
  const total = analytics.peer_total_in_court;

  if (rank && total) {
    const position = rank <= Math.ceil(total / 3) ? 'верхня третина' : rank <= Math.ceil((2 * total) / 3) ? 'середня третина' : 'нижня третина';
    details.push(`Ранг у суді: ${rank} з ${total} (${position})`);
  }

  if (totalViolations > 0) {
    details.push(`Порушення строків: ${fmt(totalViolations)}`);
  }

  if (totalViolations > 500) {
    return { label: 'Критичні проблеми зі строками', level: 'bad', details };
  }
  if (totalViolations > 100 || (rank && total && rank > Math.ceil((2 * total) / 3))) {
    return { label: 'Потребує покращення', level: 'medium', details };
  }
  return { label: 'Задовільна', level: 'good', details };
}

function AssessmentBadge({ level }: { level: 'good' | 'medium' | 'bad' }) {
  const config = {
    good: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: AlertTriangle },
    bad: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertTriangle },
  };
  return config[level];
}

function SectionCard({ title, delay, children }: { title: string; delay?: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay || 0 }}
      className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
    >
      <h3 className="text-lg font-serif font-medium text-claude-text mb-4">{title}</h3>
      {children}
    </motion.div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="border-b border-claude-border">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 text-xs text-claude-subtext font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-claude-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3 text-claude-text">
                  {typeof cell === 'number' ? fmt(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JudgeDossier({ analytics, peers, totalInCourt }: JudgeDossierProps) {
  const outcomes = analytics.appeal_outcomes;
  const vkksu = analytics.vkksu_data || {};
  const deadlineViolations = vkksu.deadline_violations as Record<string, number> | undefined;
  const totalViolations = deadlineViolations
    ? Object.values(deadlineViolations).reduce((sum, v) => sum + (v || 0), 0)
    : 0;

  const competence = computeCompetenceAssessment(analytics);
  const efficiency = computeEfficiencyAssessment(analytics);

  const yearEntries = Object.entries(analytics.decisions_by_year || {})
    .map(([year, count]) => ({ year, count: count as number }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const formEntries = Object.entries(analytics.decisions_by_form || {})
    .map(([name, count]) => ({ name, count: count as number }))
    .sort((a, b) => b.count - a.count);

  const totalFormCount = formEntries.reduce((s, e) => s + e.count, 0);

  const today = new Date().toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 mt-6"
    >
      {/* Dossier Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-claude-accent" />
          <h2 className="text-xl font-serif font-medium text-claude-text">Досьє судді</h2>
        </div>
        <span className="text-xs text-claude-subtext font-sans">
          Звіт від {today}
        </span>
      </div>

      {/* 1. General Profile */}
      <SectionCard title="1. Загальний профіль" delay={0.05}>
        <DataTable
          headers={['Параметр', 'Значення']}
          rows={[
            ['ПІБ', analytics.judge_name],
            ['Суд', analytics.court_name || '—'],
            ['Інстанція', analytics.instance_name || '—'],
            ['Спеціалізація', getSpecialization(analytics.decisions_by_justice_kind || {})],
            ['Загальна кількість документів', analytics.total_decisions],
            ['Унікальних справ', analytics.unique_cases],
            ['Період', `${analytics.period_start} — ${analytics.period_end}`],
          ]}
        />
      </SectionCard>

      {/* 2. Workload Dynamics */}
      <SectionCard title="2. Динаміка навантаження" delay={0.1}>
        {yearEntries.length > 0 && (
          <>
            <h4 className="text-sm font-sans font-medium text-claude-text mb-3">По роках</h4>
            <DataTable
              headers={['Рік', 'Документів']}
              rows={yearEntries.map((e) => [e.year, e.count])}
            />
          </>
        )}

        {formEntries.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-sans font-medium text-claude-text mb-3">Структура документів</h4>
            <DataTable
              headers={['Тип документа', 'Кількість', 'Частка']}
              rows={formEntries.map((e) => [e.name, e.count, pct(e.count, totalFormCount)])}
            />
          </div>
        )}
      </SectionCard>

      {/* 3. Thematic Specialization */}
      {analytics.top_categories && analytics.top_categories.length > 0 && (
        <SectionCard title="3. Тематична спеціалізація" delay={0.15}>
          <DataTable
            headers={['#', 'Категорія справ', 'Кількість', 'Частка']}
            rows={analytics.top_categories.map((cat, idx) => [
              idx + 1,
              cat.name,
              cat.count,
              pct(cat.count, analytics.total_decisions),
            ])}
          />
        </SectionCard>
      )}

      {/* 4. Appeal Analysis */}
      {(outcomes?.analyzed || 0) > 0 && (
        <SectionCard title="4. Апеляційний аналіз" delay={0.2}>
          <h4 className="text-sm font-sans font-medium text-claude-text mb-3">Загальна статистика</h4>
          <DataTable
            headers={['Показник', 'Значення']}
            rows={[
              ['Унікальних справ', analytics.unique_cases],
              ['Справи, що оскаржувались', `${fmt(analytics.cases_appealed)} (${analytics.appeal_rate}%)`],
            ]}
          />

          <div className="mt-6">
            <h4 className="text-sm font-sans font-medium text-claude-text mb-3">Результати апеляційного перегляду</h4>
            <DataTable
              headers={['Результат', 'Кількість', 'Частка']}
              rows={[
                ['Залишено без змін', outcomes.upheld, pct(outcomes.upheld, outcomes.analyzed)],
                ['Скасовано', outcomes.overturned, pct(outcomes.overturned, outcomes.analyzed)],
                ['Змінено', outcomes.modified, pct(outcomes.modified, outcomes.analyzed)],
                ['Не визначено', outcomes.unknown, pct(outcomes.unknown, outcomes.analyzed)],
              ]}
            />
          </div>

          {/* Visual breakdown */}
          <div className="mt-4 flex gap-1 h-4 rounded-full overflow-hidden">
            {[
              { value: outcomes.upheld, color: 'bg-green-500' },
              { value: outcomes.overturned, color: 'bg-red-500' },
              { value: outcomes.modified, color: 'bg-yellow-500' },
              { value: outcomes.unknown, color: 'bg-gray-300' },
            ].map((item, i) => (
              <div
                key={i}
                className={`${item.color} transition-all`}
                style={{ width: `${(item.value / outcomes.analyzed) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-xs font-sans text-claude-subtext">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Залишено</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Скасовано</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Змінено</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Не визн.</span>
          </div>
        </SectionCard>
      )}

      {/* 5. Peer Comparison */}
      {peers.length > 0 && (
        <SectionCard title="5. Порівняння з колегами по суду" delay={0.25}>
          {/* Judge vs court average */}
          {analytics.court_avg_decisions && (
            <div className="mb-6">
              <h4 className="text-sm font-sans font-medium text-claude-text mb-3">
                Показники vs середнє по суду
              </h4>
              <DataTable
                headers={['Показник', analytics.judge_name.split(' ')[0], 'Середнє по суду', 'Відхилення']}
                rows={[
                  [
                    'Рішень',
                    analytics.total_decisions,
                    Math.round(analytics.court_avg_decisions),
                    analytics.court_avg_decisions > 0
                      ? `${(((analytics.total_decisions - analytics.court_avg_decisions) / analytics.court_avg_decisions) * 100).toFixed(1)}%`
                      : '—',
                  ],
                  ...(totalViolations > 0
                    ? [
                        [
                          'Порушення строків' as string | number,
                          totalViolations as string | number,
                          '—' as string | number,
                          '—' as string | number,
                        ],
                      ]
                    : []),
                ]}
              />
              {analytics.peer_rank_in_court && analytics.peer_total_in_court && (
                <p className="text-sm font-sans text-claude-subtext mt-3">
                  <TrendingUp size={14} className="inline mr-1" />
                  Ранг у суді: <strong className="text-claude-text">{analytics.peer_rank_in_court}</strong> з {analytics.peer_total_in_court} суддів
                </p>
              )}
            </div>
          )}

          {/* Peers table */}
          <h4 className="text-sm font-sans font-medium text-claude-text mb-3">
            <Users size={14} className="inline mr-1" />
            Топ суддів суду за кількістю рішень
          </h4>
          <DataTable
            headers={['#', 'Суддя', 'Рішень', 'Апеляція %', 'Ранг']}
            rows={peers.map((p, idx) => [
              idx + 1,
              p.id === analytics.id ? `** ${p.judge_name} **` : p.judge_name,
              p.total_decisions,
              p.appeal_rate > 0 ? `${p.appeal_rate}%` : '—',
              p.peer_rank_in_court || '—',
            ])}
          />
          {totalInCourt > peers.length && (
            <p className="text-xs text-claude-subtext font-sans mt-2">
              Показано {peers.length} з {totalInCourt} суддів суду
            </p>
          )}
        </SectionCard>
      )}

      {/* 6. Conclusions */}
      <SectionCard title="6. Висновки" delay={0.3}>
        {/* Competence */}
        <div className={`p-4 rounded-lg border mb-4 ${AssessmentBadge({ level: competence.level }).bg} ${AssessmentBadge({ level: competence.level }).border}`}>
          <div className="flex items-center gap-2 mb-2">
            {(() => {
              const Icon = AssessmentBadge({ level: competence.level }).icon;
              const textColor = AssessmentBadge({ level: competence.level }).text;
              return <Icon size={18} className={textColor} />;
            })()}
            <h4 className={`text-sm font-sans font-medium ${AssessmentBadge({ level: competence.level }).text}`}>
              Компетентність: {competence.label}
            </h4>
          </div>
          {competence.details.map((d, i) => (
            <p key={i} className="text-sm font-sans text-claude-text ml-6">{d}</p>
          ))}
        </div>

        {/* Efficiency */}
        <div className={`p-4 rounded-lg border ${AssessmentBadge({ level: efficiency.level }).bg} ${AssessmentBadge({ level: efficiency.level }).border}`}>
          <div className="flex items-center gap-2 mb-2">
            {(() => {
              const Icon = AssessmentBadge({ level: efficiency.level }).icon;
              const textColor = AssessmentBadge({ level: efficiency.level }).text;
              return <Icon size={18} className={textColor} />;
            })()}
            <h4 className={`text-sm font-sans font-medium ${AssessmentBadge({ level: efficiency.level }).text}`}>
              Ефективність: {efficiency.label}
            </h4>
          </div>
          {efficiency.details.map((d, i) => (
            <p key={i} className="text-sm font-sans text-claude-text ml-6">{d}</p>
          ))}
        </div>
      </SectionCard>

      {/* 7. Methodology */}
      <SectionCard title="7. Методологічні обмеження" delay={0.35}>
        <div className="flex items-start gap-3 text-claude-subtext">
          <Info size={18} className="flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm font-sans">
            <p>1. <strong>Повнотекстовий аналіз</strong> — автоматична класифікація результатів апеляцій за ключовими словами. Точність ~90-93%.</p>
            <p>2. <strong>Неповнота даних</strong> — для частини апеляційних постанов може бути відсутній повний текст у базі.</p>
            <p>3. <strong>Дані ВККС</strong> — офіційна статистика може використовувати іншу методологію підрахунку скасувань.</p>
            <p>4. <strong>Апеляції останніх років</strong> — справи за останні 1-2 роки могли ще не пройти повний цикл оскарження.</p>
            <p>5. <strong>Причинність</strong> — високий % скасувань може бути пов'язаний зі специфікою категорій справ або активністю сторін.</p>
          </div>
        </div>
        <p className="text-xs text-claude-subtext font-sans mt-4 italic">
          Звіт підготовлений автоматично на основі аналізу {fmt(analytics.total_decisions)} документів з ЄДРСР.
          Для юридично значущих висновків рекомендується залучення кваліфікованого правника.
        </p>
      </SectionCard>
    </motion.div>
  );
}
