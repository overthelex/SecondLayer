import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Shield, Zap, Upload, Archive, CreditCard, Bot, Globe, Info } from 'lucide-react';
import { adminApi } from '../utils/api/admin';

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
  };
}

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

function KpiCard({ icon: Icon, label, value, sub, color = 'text-claude-text' }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm p-5">
      <div className="flex items-center gap-3 mb-2">
        <Icon className="w-5 h-5 text-claude-subtext" />
        <span className="text-sm text-claude-subtext">{label}</span>
      </div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-claude-subtext mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-claude-border/50 flex items-center gap-2">
        <Icon className="w-5 h-5 text-claude-subtext" />
        <h2 className="text-lg font-semibold text-claude-text font-sans">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

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
        <div className="text-right shrink-0 w-36">
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
            <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button onClick={fetch_} className="text-sm text-red-600 underline mt-2">Спробувати знову</button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const u = data.currentUsage;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Zap} label="Токени за 24г" value={formatNumber(u.todayTotalTokens)} sub={`Bedrock: ${formatNumber(u.todayBedrockTokens)} | OpenAI: ${formatNumber(u.todayOpenaiTokens)}`} />
        <KpiCard icon={Globe} label="Запити за 24г" value={formatNumber(u.todayTotalRequests)} sub={`Активних юзерів: ${u.activeUsers24h}`} />
        <KpiCard icon={CreditCard} label="В escrow" value={`${data.escrow.totalEscrowUah} грн`} sub={`${data.escrow.paymentsInEscrow} платежів`} color={data.escrow.paymentsInEscrow > 0 ? 'text-orange-600' : 'text-claude-text'} />
        <KpiCard icon={Upload} label="Активні завантаження" value={String(u.activeUploadSessions)} sub="сесій" />
      </div>

      {/* Rate Limits */}
      <Section title="Rate Limits (запити)" icon={Shield}>
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
    </div>
  );
}
