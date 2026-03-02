/**
 * Backend Performance section - HTTP status codes, request rates, external APIs
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

export function BackendDetailSection({ data }: { data: any }) {
  const statusCodes = data?.status_codes?.series || [];
  const byRoute = (data?.by_route || []).slice(0, 8); // Top 8 routes

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Status codes stacked area */}
      <ChartCard title="HTTP Status Codes">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={statusCodes}>
            <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="2xx" stackId="1" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.6} />
            <Area type="monotone" dataKey="3xx" stackId="1" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.6} />
            <Area type="monotone" dataKey="4xx" stackId="1" stroke={COLORS.amber} fill={COLORS.amber} fillOpacity={0.6} />
            <Area type="monotone" dataKey="5xx" stackId="1" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Request rate by route */}
      <ChartCard title="Request Rate by Route (RPS)">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart>
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              tick={{ fontSize: 11 }}
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {byRoute.map((route: any, i: number) => (
              <Line
                key={route.route}
                data={route.series}
                dataKey="rps"
                name={route.route}
                stroke={Object.values(COLORS)[i % 10]}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* External API calls */}
      {data?.external_apis?.calls?.length > 0 && (
        <ChartCard title="External API Calls (rate/s)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} type="number" domain={['dataMin', 'dataMax']} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(data.external_apis.calls || []).map((svc: any, i: number) => (
                <Line key={svc.service} data={svc.series} dataKey="value" name={svc.service} stroke={Object.values(COLORS)[i % 10]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* External API latency P95 */}
      {data?.external_apis?.duration_p95?.length > 0 && (
        <ChartCard title="External API Latency P95 (ms)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} tick={{ fontSize: 11 }} type="number" domain={['dataMin', 'dataMax']} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} labelFormatter={formatTime} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(data.external_apis.duration_p95 || []).map((svc: any, i: number) => (
                <Line key={svc.service} data={svc.series} dataKey="value" name={svc.service} stroke={Object.values(COLORS)[(i + 3) % 10]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
