import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, Shield, Zap, Upload, Archive, CreditCard,
  Bot, Globe, Info, Users, Database, Clock, Terminal, FileText, Layers,
} from 'lucide-react';
import { adminApi } from '../utils/api/admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimit {
  id: string;
  name: string;
  max: number;
  window: string;
  windowMs: number;
  keyBy: string;
  description: string;
  severity: string;
}

interface LLMLimit {
  id: string;
  name: string;
  max: number | null;
  current: number | null;
  unit: string;
  description: string;
  severity: string;
  status?: string;
}

interface ChatLimit {
  id: string;
  name: string;
  maxTokens: number;
  maxToolCalls: number;
  maxContextChars: number;
  maxResultChars: number;
  description: string;
}

interface GenericLimit {
  id: string;
  name: string;
  max?: number;
  min?: number;
  maxFormatted?: string;
  current?: number | null;
  unit?: string;
  window?: string;
  description: string;
  severity?: string;
}

interface EscrowInfo {
  paymentsInEscrow: number;
  totalEscrowUah: number;
  autoReleaseDays: number;
  description: string;
}

interface LimitsData {
  rateLimits: RateLimit[];
  llmLimits: LLMLimit[];
  chatLimits: ChatLimit[];
  uploadLimits: GenericLimit[];
  archiveLimits: GenericLimit[];
  billingLimits: GenericLimit[];
  scrapingLimits: GenericLimit[];
  connectionLimits: GenericLimit[];
  cacheTtls: GenericLimit[];
  concurrencyLimits: GenericLimit[];
  processingLimits: GenericLimit[];
  escrow: EscrowInfo;
  currentUsage: {
    activeUploadSessions: number;
    todayTotalTokens: number;
    todayBedrockTokens: number;
    todayOpenaiTokens: number;
    todayTotalRequests: number;
    escrowPayments: number;
    escrowTotalUah: number;
    activeUsers24h: number;
    concurrentUsersNow: number;
    pgActiveConnections: number;
    pgMaxConnections: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[severity] || 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gauge component — circular progress
// ---------------------------------------------------------------------------

function GaugeCircle({ value, max, label, sub, color = '#3b82f6' }: {
  value: number;
  max: number;
  label: string;
  sub?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const gaugeColor = pct > 80 ? '#ef4444' : pct > 50 ? '#eab308' : color;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={gaugeColor} strokeWidth="6"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-claude-text">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-sm font-medium text-claude-text">{label}</div>
        <div className="text-xs text-claude-subtext">{formatNumber(value)} / {formatNumber(max)}</div>
        {sub && <div className="text-xs text-claude-subtext">{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ icon: Icon, label, value, sub, color = 'text-claude-text', pulse }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  pulse?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm p-5">
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`w-5 h-5 text-claude-subtext ${pulse ? 'animate-pulse' : ''}`} />
        <span className="text-sm text-claude-subtext">{label}</span>
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-claude-subtext mt-1">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, icon: Icon, badge, children }: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-claude-border/50 flex items-center gap-2">
        <Icon className="w-5 h-5 text-claude-subtext" />
        <h2 className="text-lg font-semibold text-claude-text font-sans">{title}</h2>
        {badge && <span className="ml-auto px-2 py-0.5 bg-claude-bg rounded-full text-xs text-claude-subtext">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Limit row with progress bar
// ---------------------------------------------------------------------------

function LimitRow({ name, max, current, window, unit, description, severity, maxFormatted }: {
  name: string;
  max?: number | null;
  current?: number | null;
  window?: string;
  unit?: string;
  description: string;
  severity?: string;
  maxFormatted?: string;
}) {
  const pct = max && current != null ? Math.min((current / max) * 100, 100) : null;
  const barColor = pct != null
    ? pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'
    : 'bg-gray-300';

  return (
    <div className="py-3 border-b border-claude-border/20 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-claude-text">{name}</span>
            {severity && <SeverityBadge severity={severity} />}
            {window && <span className="text-xs text-claude-subtext bg-gray-50 px-2 py-0.5 rounded">{window}</span>}
          </div>
          <p className="text-xs text-claude-subtext leading-relaxed">{description}</p>
        </div>
        <div className="text-right shrink-0 w-40">
          {max != null ? (
            <div className="text-sm font-mono text-claude-text">
              {current != null ? formatNumber(current) + ' / ' : ''}{maxFormatted || formatNumber(max)}{unit ? ' ' + unit : ''}
            </div>
          ) : current != null ? (
            <div className="text-sm font-mono text-claude-text">{formatNumber(current)}{unit ? ' ' + unit : ''}</div>
          ) : (
            <div className="text-xs text-claude-subtext italic">зовнішній ліміт</div>
          )}
          {pct != null && (
            <div className="mt-1.5 w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rate limit bar chart visualization
// ---------------------------------------------------------------------------

function RateLimitBars({ limits }: { limits: RateLimit[] }) {
  const maxVal = Math.max(...limits.map(l => l.max));
  const severityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
  };
  return (
    <div className="mb-6 bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-claude-subtext mb-3 font-medium">Порівняння rate limits (запитів за вікно)</div>
      <div className="space-y-2">
        {limits.map(rl => {
          const pct = (rl.max / maxVal) * 100;
          return (
            <div key={rl.id} className="flex items-center gap-3">
              <div className="w-32 text-xs text-claude-subtext truncate text-right shrink-0">{rl.name}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-4 relative overflow-hidden">
                <div
                  className="h-4 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: severityColors[rl.severity] || '#6b7280' }}
                />
              </div>
              <div className="w-16 text-xs font-mono text-claude-text text-right">{formatNumber(rl.max)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export function AdminLimitsPage() {
  const [data, setData] = useState<LimitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getLimits();
      setData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetch_, 30000);
    return () => clearInterval(interval);
  }, [fetch_]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-claude-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button onClick={fetch_} className="text-sm text-red-600 underline mt-2">Спробувати знову</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const u = data.currentUsage;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-claude-text font-sans">Ліміти системи</h1>
            <p className="text-sm text-claude-subtext mt-1">Реалтайм моніторинг лімітів та поточного використання</p>
          </div>
          <button
            onClick={fetch_}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-claude-bg border border-claude-border rounded-lg text-sm text-claude-text hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>

        {/* KPI Cards — top row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard icon={Users} label="Онлайн зараз" value={String(u.concurrentUsersNow)} sub="користувачів за 5 хв" pulse={u.concurrentUsersNow > 0} color={u.concurrentUsersNow > 10 ? 'text-orange-600' : 'text-claude-text'} />
          <KpiCard icon={Users} label="Активні за 24г" value={String(u.activeUsers24h)} sub="унікальних юзерів" />
          <KpiCard icon={Zap} label="Токени за 24г" value={formatNumber(u.todayTotalTokens)} sub={`Bedrock: ${formatNumber(u.todayBedrockTokens)} | OpenAI: ${formatNumber(u.todayOpenaiTokens)}`} />
          <KpiCard icon={Globe} label="Запити за 24г" value={formatNumber(u.todayTotalRequests)} />
          <KpiCard icon={CreditCard} label="В escrow" value={`${data.escrow.totalEscrowUah} грн`} sub={`${data.escrow.paymentsInEscrow} платежів`} color={data.escrow.paymentsInEscrow > 0 ? 'text-orange-600' : 'text-claude-text'} />
        </div>

        {/* Gauges row — key resource utilization */}
        {(u.pgMaxConnections > 0 || u.activeUploadSessions > 0) && (
          <div className="bg-white rounded-xl border border-claude-border shadow-sm p-6">
            <h2 className="text-sm font-medium text-claude-subtext mb-4">Використання ресурсів</h2>
            <div className="flex items-start justify-around flex-wrap gap-6">
              <GaugeCircle value={u.pgActiveConnections} max={u.pgMaxConnections} label="PostgreSQL" sub="з'єднання" />
              <GaugeCircle value={u.activeUploadSessions} max={50} label="Upload сесії" sub="на користувача макс 50" color="#8b5cf6" />
              <GaugeCircle value={u.concurrentUsersNow} max={100} label="Користувачі онлайн" sub="за останні 5 хв" color="#06b6d4" />
              <GaugeCircle value={u.todayTotalRequests} max={50000} label="Запити / 24г" sub="відносно ~50К норми" color="#f59e0b" />
            </div>
          </div>
        )}

        {/* Rate Limits */}
        <Section title="Rate Limits (запити)" icon={Shield} badge={`${data.rateLimits.length} лімітів`}>
          <RateLimitBars limits={data.rateLimits} />
          {data.rateLimits.map(rl => (
            <LimitRow
              key={rl.id}
              name={rl.name}
              max={rl.max}
              window={rl.window}
              description={rl.description}
              severity={rl.severity}
            />
          ))}
        </Section>

        {/* LLM Provider Limits */}
        <Section title="LLM провайдери" icon={Bot}>
          <div className="mb-4 flex items-start gap-2 bg-blue-50 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">Ліміти LLM провайдерів налаштовуються в зовнішніх консолях (AWS Bedrock Service Quotas, OpenAI Dashboard). Тут показано поточне використання за 24 години.</p>
          </div>
          {data.llmLimits.map(ll => (
            <LimitRow
              key={ll.id}
              name={ll.name}
              max={ll.max}
              current={ll.current}
              unit={ll.unit}
              description={ll.description}
              severity={ll.severity}
            />
          ))}
        </Section>

        {/* Chat Budget Limits */}
        <Section title="Бюджети чату" icon={Zap}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-claude-subtext border-b border-claude-border/50">
                  <th className="pb-2 font-medium">Бюджет</th>
                  <th className="pb-2 font-medium text-right">Токени</th>
                  <th className="pb-2 font-medium text-right">Tool Calls</th>
                  <th className="pb-2 font-medium text-right">Контекст</th>
                  <th className="pb-2 font-medium text-right">Результат</th>
                </tr>
              </thead>
              <tbody>
                {data.chatLimits.map(cl => (
                  <tr key={cl.id} className="border-b border-claude-border/20 last:border-0">
                    <td className="py-3">
                      <div className="font-medium text-claude-text">{cl.name}</div>
                      <div className="text-xs text-claude-subtext mt-0.5">{cl.description}</div>
                    </td>
                    <td className="py-3 text-right font-mono">{formatNumber(cl.maxTokens)}</td>
                    <td className="py-3 text-right font-mono">{cl.maxToolCalls}</td>
                    <td className="py-3 text-right font-mono">{formatNumber(cl.maxContextChars)}</td>
                    <td className="py-3 text-right font-mono">{formatNumber(cl.maxResultChars)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Connection & DB Limits */}
        <Section title="З'єднання та БД" icon={Database}>
          {data.connectionLimits.map(cl => (
            <LimitRow
              key={cl.id}
              name={cl.name}
              max={cl.max}
              current={cl.current}
              unit={cl.unit}
              description={cl.description}
              severity={cl.severity}
            />
          ))}
        </Section>

        {/* Concurrency Limits */}
        <Section title="Конкурентність обробки" icon={Layers}>
          {data.concurrencyLimits.map(cl => (
            <LimitRow
              key={cl.id}
              name={cl.name}
              max={cl.max}
              current={cl.current}
              unit={cl.unit}
              description={cl.description}
            />
          ))}
        </Section>

        {/* Processing Limits */}
        <Section title="Обробка документів" icon={FileText}>
          {data.processingLimits.map(pl => (
            <LimitRow
              key={pl.id}
              name={pl.name}
              max={pl.max}
              maxFormatted={pl.maxFormatted}
              unit={pl.unit}
              description={pl.description}
            />
          ))}
        </Section>

        {/* Upload Limits */}
        <Section title="Завантаження файлів" icon={Upload}>
          {data.uploadLimits.map(ul => (
            <LimitRow
              key={ul.id}
              name={ul.name}
              max={ul.max}
              maxFormatted={ul.maxFormatted}
              current={ul.current}
              unit={ul.unit}
              window={ul.window}
              description={ul.description}
            />
          ))}
        </Section>

        {/* Archive Limits */}
        <Section title="Захист від zip-bomb" icon={Archive}>
          {data.archiveLimits.map(al => (
            <LimitRow
              key={al.id}
              name={al.name}
              max={al.max}
              maxFormatted={al.maxFormatted}
              unit={al.unit}
              description={al.description}
            />
          ))}
        </Section>

        {/* Cache TTLs */}
        <Section title="Кеш (TTL)" icon={Clock}>
          {data.cacheTtls.map(ct => (
            <LimitRow
              key={ct.id}
              name={ct.name}
              max={ct.max}
              unit={ct.unit}
              description={ct.description}
            />
          ))}
        </Section>

        {/* Billing Limits */}
        <Section title="Біллінг" icon={CreditCard}>
          {data.billingLimits.map(bl => (
            <LimitRow
              key={bl.id}
              name={bl.name}
              description={bl.description}
              severity={bl.severity}
            />
          ))}
        </Section>

        {/* Scraping Limits */}
        <Section title="Скрейпінг" icon={Globe}>
          {data.scrapingLimits.map(sl => (
            <LimitRow
              key={sl.id}
              name={sl.name}
              max={sl.max}
              unit={sl.unit}
              window={sl.window}
              description={sl.description}
            />
          ))}
        </Section>

        {/* Escrow Info */}
        <Section title="Escrow (платежі)" icon={CreditCard}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-semibold text-claude-text">{data.escrow.paymentsInEscrow}</div>
              <div className="text-xs text-claude-subtext mt-1">платежів в escrow</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-semibold text-claude-text">{data.escrow.totalEscrowUah} грн</div>
              <div className="text-xs text-claude-subtext mt-1">загальна сума</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-semibold text-claude-text">{data.escrow.autoReleaseDays} днів</div>
              <div className="text-xs text-claude-subtext mt-1">авто-реліз після completed</div>
            </div>
          </div>
          <p className="text-xs text-claude-subtext">{data.escrow.description}</p>
        </Section>

        {/* Terminal Limits */}
        <Section title="Термінал" icon={Terminal}>
          <LimitRow name="Сесії на адміна" max={2} description="Максимум 2 одночасні термінальні сесії для одного адміністратора." />
          <LimitRow name="Розмір введення" max={4096} unit="символів" description="Максимальна довжина одного PTY-повідомлення." />
        </Section>

      </div>
    </div>
  );
}
