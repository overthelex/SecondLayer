import type { UseProfileReturn } from './types';

type BillingSectionProps = Pick<UseProfileReturn, 'billing' | 'stats'>;

export function BillingSection({ billing, stats }: BillingSectionProps) {
  return (
    <section className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
      <h2 className="text-xl font-serif text-claude-text mb-6">
        Activity
      </h2>
      <div className="space-y-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 p-3 rounded-xl hover:bg-claude-bg/50 transition-colors border border-transparent hover:border-claude-border/50">
            <div className="p-2.5 rounded-lg bg-claude-accent/10 text-claude-accent">
              <stat.icon size={18} />
            </div>
            <div>
              <div className="text-2xl font-serif text-claude-text leading-none mb-1">
                {stat.value}
              </div>
              <div className="text-xs font-medium text-claude-subtext uppercase tracking-wide">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {billing && (
        <div className="mt-6 pt-6 border-t border-claude-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-claude-text">
              Monthly Spend
            </span>
            <span className="text-sm text-claude-subtext">
              ${Number(billing.month_spent_usd).toFixed(2)} / ${Number(billing.monthly_limit_usd).toFixed(2)}
            </span>
          </div>
          <div className="h-2 w-full bg-claude-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-claude-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, (Number(billing.month_spent_usd) / Number(billing.monthly_limit_usd)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-claude-subtext mt-2">
            Daily limit: ${Number(billing.daily_limit_usd).toFixed(2)} • Today: ${Number(billing.today_spent_usd).toFixed(2)}
          </p>
        </div>
      )}
    </section>
  );
}
