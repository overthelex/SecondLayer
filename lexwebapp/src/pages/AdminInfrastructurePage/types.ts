/**
 * Types, constants, and utility functions for AdminInfrastructurePage
 */

// ── Types ──────────────────────────────────────────────

export type TimeRange = '1h' | '6h' | '24h';

export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface Recommendation {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}

// ── Formatters ─────────────────────────────────────────

export function formatUSD(n: number | null | undefined): string {
  if (n == null) return '$0.00';
  return `$${Number(n).toFixed(4)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTime(ts: any): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Colors ─────────────────────────────────────────────

export const COLORS = {
  blue: '#60a5fa',
  emerald: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
  purple: '#a78bfa',
  indigo: '#818cf8',
  cyan: '#22d3ee',
  pink: '#f472b6',
  slate: '#94a3b8',
  orange: '#fb923c',
};

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { fontSize: '11px', color: '#6b7280' },
};

// ── Recommendations Generator ──────────────────────────

export function generateRecommendations(data: any): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (!data) return recommendations;

  const cpuSeries = data?.cpu?.series || [];
  const memPct = data?.memory?.used_pct || 0;
  const pgCacheHit = data?.pg?.cache_hit_ratio || 0;
  const redisEvictedSeries = data?.redis?.evicted_keys?.series || [];

  const lastCpu = cpuSeries.length > 0 ? cpuSeries[cpuSeries.length - 1] : null;
  const cpuIowait = lastCpu?.iowait || 0;

  if (memPct > 80) {
    recommendations.push({
      severity: memPct > 90 ? 'critical' : 'warning',
      title: 'High Memory Usage',
      description: `Memory usage is at ${memPct.toFixed(1)}%. Consider adding more RAM or optimizing memory usage.`,
    });
  }

  if (pgCacheHit < 0.95 && pgCacheHit > 0) {
    recommendations.push({
      severity: pgCacheHit < 0.90 ? 'critical' : 'warning',
      title: 'Low PostgreSQL Cache Hit Ratio',
      description: `Cache hit ratio is ${(pgCacheHit * 100).toFixed(1)}%. Increase shared_buffers to 25% of RAM (currently 8GB).`,
    });
  }

  if (cpuIowait > 0.2) {
    recommendations.push({
      severity: cpuIowait > 0.4 ? 'critical' : 'warning',
      title: 'High CPU Iowait',
      description: `CPU iowait is ${(cpuIowait * 100).toFixed(1)}%. Consider using SSD for database or optimizing disk I/O.`,
    });
  }

  if (redisEvictedSeries.length > 1) {
    const lastEvicted = redisEvictedSeries[redisEvictedSeries.length - 1]?.value || 0;
    const prevEvicted = redisEvictedSeries[redisEvictedSeries.length - 2]?.value || 0;
    const evictedRate = lastEvicted - prevEvicted;
    if (evictedRate > 0) {
      recommendations.push({
        severity: 'warning',
        title: 'Redis Key Evictions',
        description: `Redis is evicting keys (volatile-lru policy). Consider increasing maxmemory or reviewing TTL coverage on cached keys.`,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      severity: 'info',
      title: 'All Systems Healthy',
      description: 'No infrastructure issues detected. Keep monitoring regularly.',
    });
  }

  return recommendations;
}
