/**
 * Infrastructure section - CPU, memory, PG, Redis, disk I/O, network
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
import { COLORS, tooltipStyle, formatTime, formatBytes } from './types';
import { ChartCard, GaugeBar } from './SharedComponents';

export function InfrastructureSection({ data }: { data: any }) {
  const cpuSeries = data?.cpu?.series || [];
  const memPct = data?.memory?.used_pct || 0;
  const memTotal = data?.memory?.total_bytes || 0;
  const memAvailable = data?.memory?.available_bytes || 0;
  const diskSeries = data?.disk_io?.series || [];
  const networkSeries = data?.network?.series || [];
  const pgConn = data?.pg?.connections?.series || [];
  const pgTx = data?.pg?.transactions?.series || [];
  const pgCacheHit = data?.pg?.cache_hit_ratio || 0;
  const redisMem = data?.redis?.memory?.series || [];
  const redisClients = data?.redis?.clients?.series || [];
  const redisCommands = data?.redis?.commands_rate?.series || [];

  return (
    <div className="space-y-4">
      {/* Gauge row: CPU + Memory + PG Cache */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GaugeBar
          label="CPU Usage"
          pct={cpuSeries.length > 0 ? (cpuSeries[cpuSeries.length - 1].user + cpuSeries[cpuSeries.length - 1].system) * 100 : 0}
          detail={cpuSeries.length > 0 ? `user: ${(cpuSeries[cpuSeries.length - 1].user * 100).toFixed(1)}%, sys: ${(cpuSeries[cpuSeries.length - 1].system * 100).toFixed(1)}%` : 'No data'}
        />
        <GaugeBar
          label="Memory"
          pct={memPct}
          detail={`${formatBytes(memTotal - memAvailable)} / ${formatBytes(memTotal)}`}
        />
        <GaugeBar
          label="PG Cache Hit"
          pct={pgCacheHit * 100}
          detail={`${(pgCacheHit * 100).toFixed(2)}% hit ratio`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* CPU time series */}
        <ChartCard title="CPU Usage">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cpuSeries}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} formatter={(v: any) => `${(v * 100).toFixed(1)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="user" stackId="1" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.5} name="User" />
              <Area type="monotone" dataKey="system" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.5} name="System" />
              <Area type="monotone" dataKey="iowait" stackId="1" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.5} name="IO Wait" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* PG connections */}
        <ChartCard title="PostgreSQL Connections">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={pgConn}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="active" stackId="1" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.5} name="Active" />
              <Area type="monotone" dataKey="idle" stackId="1" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.5} name="Idle" />
              <Area type="monotone" dataKey="idle_in_tx" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.5} name="Idle in TX" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* PG transactions */}
        <ChartCard title="PostgreSQL Transactions (rate/s)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={pgTx}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="commits" stroke={COLORS.emerald} dot={false} strokeWidth={1.5} name="Commits" />
              <Line type="monotone" dataKey="rollbacks" stroke={COLORS.red} dot={false} strokeWidth={1.5} name="Rollbacks" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Redis memory */}
        <ChartCard title="Redis Memory">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={redisMem}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v)} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} formatter={(v: any) => formatBytes(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="used" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.3} name="Used" />
              <Area type="monotone" dataKey="max" stroke={COLORS.slate} fill="none" strokeDasharray="5 5" name="Max" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Redis commands + clients */}
        <ChartCard title="Redis Commands Rate (/s)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={redisCommands}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Line type="monotone" dataKey="value" stroke={COLORS.indigo} dot={false} strokeWidth={1.5} name="Commands/s" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Disk I/O */}
        <ChartCard title="Disk I/O (bytes/s)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={diskSeries}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v)} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} formatter={(v: any) => formatBytes(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="read_bytes" stroke={COLORS.blue} dot={false} strokeWidth={1.5} name="Read" />
              <Line type="monotone" dataKey="write_bytes" stroke={COLORS.orange} dot={false} strokeWidth={1.5} name="Write" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Network */}
        <ChartCard title="Network (bytes/s)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={networkSeries}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v)} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} formatter={(v: any) => formatBytes(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="rx_bytes" stroke={COLORS.emerald} dot={false} strokeWidth={1.5} name="Receive" />
              <Line type="monotone" dataKey="tx_bytes" stroke={COLORS.purple} dot={false} strokeWidth={1.5} name="Transmit" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Redis clients + evicted */}
        <ChartCard title="Redis Clients & Evictions">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={redisClients}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="value" stroke={COLORS.cyan} dot={false} strokeWidth={1.5} name="Clients" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
