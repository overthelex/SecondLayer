/**
 * Upload Pipeline section - BullMQ jobs, processing duration, queue depth, concurrency
 */

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { COLORS, tooltipStyle, formatTime } from './types';
import { ChartCard } from './SharedComponents';

export function UploadPipelineSection({ data }: { data: any }) {
  const jobs = data?.jobs?.series || [];
  const duration = data?.processing_duration?.series || [];
  const queueDepth = data?.queue_depth?.series || [];
  const concurrency = data?.concurrency?.series || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Jobs by status */}
      <ChartCard title="BullMQ Jobs by Status">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={jobs}>
            <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="completed" stackId="1" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.6} />
            <Area type="monotone" dataKey="active" stackId="1" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.6} />
            <Area type="monotone" dataKey="waiting" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.6} />
            <Area type="monotone" dataKey="delayed" stackId="1" stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.6} />
            <Area type="monotone" dataKey="failed" stackId="1" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Processing duration percentiles */}
      <ChartCard title="Processing Duration (ms)">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={duration}>
            <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="p50" stroke={COLORS.emerald} dot={false} strokeWidth={1.5} name="P50" />
            <Line type="monotone" dataKey="p95" stroke={COLORS.amber} dot={false} strokeWidth={1.5} name="P95" />
            <Line type="monotone" dataKey="p99" stroke={COLORS.red} dot={false} strokeWidth={1.5} name="P99" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Queue depth */}
      <ChartCard title="Queue Depth">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={queueDepth}>
            <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Area type="monotone" dataKey="value" stroke={COLORS.indigo} fill={COLORS.indigo} fillOpacity={0.3} name="Queue Depth" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Concurrency */}
      <ChartCard title="Concurrency">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={concurrency}>
            <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="active" stroke={COLORS.blue} dot={false} strokeWidth={1.5} name="Active" />
            <Line type="monotone" dataKey="max" stroke={COLORS.slate} dot={false} strokeWidth={1.5} strokeDasharray="5 5" name="Max" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
