/**
 * API Cost Trends section - cost rates, cost by model, top tools by cost
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { COLORS, tooltipStyle, formatTime, formatUSD } from './types';
import { ChartCard, StatCard } from './SharedComponents';

export function CostRealtimeSection({ data }: { data: any }) {
  const byModel = data?.by_model?.series || [];
  const topTools = data?.top_tools || [];

  // Extract all model keys from the first data point
  const modelKeys = byModel.length > 0
    ? Object.keys(byModel[0]).filter((k) => k !== 'timestamp')
    : [];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Вартість / годину" value={formatUSD(data?.cost_per_hour)} sub="Поточний рейт" />
        <StatCard label="Вартість / день" value={formatUSD(data?.cost_per_day)} sub="Екстраполяція" />
        <StatCard label="Вартість / місяць" value={`$${(data?.cost_per_month || 0).toFixed(2)}`} sub="Екстраполяція" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Cost by model trend */}
        <ChartCard title="Cost by Model">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={byModel}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(4)}`} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {modelKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={Object.values(COLORS)[i % 10]}
                  fill={Object.values(COLORS)[i % 10]}
                  fillOpacity={0.5}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top 10 tools horizontal bar */}
        <ChartCard title="Top 10 Tools by Cost (7d)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topTools} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <YAxis type="category" dataKey="tool" tick={{ fontSize: 10 }} width={150} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => `$${v.toFixed(4)}`} />
              <Bar dataKey="cost" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
