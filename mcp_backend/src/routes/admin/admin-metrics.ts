/**
 * Admin Metrics Routes — Prometheus metrics, cost breakdown, container metrics,
 * infrastructure metrics, upload pipeline, backend detail, cost realtime,
 * infrastructure health, pg monitoring
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import type { IDatabase } from '../../domain/ports/index.js';
import { PrometheusService } from '../../services/prometheus-service.js';
import { logger } from '../../utils/logger.js';

/**
 * Helper: parse range param and compute start/end/step
 */
function parseRange(range: string) {
  const rangeSeconds: Record<string, number> = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000 };
  const seconds = rangeSeconds[range] || 3600;
  const step = seconds <= 3600 ? '30s' : seconds <= 21600 ? '2m' : seconds <= 86400 ? '5m' : seconds <= 604800 ? '30m' : '2h';
  const end = Math.floor(Date.now() / 1000);
  const start = end - seconds;
  return { start, end, step };
}

/**
 * Helper: extract series from prometheus range query result
 */
function extractSeries(results: any[], valueKey = 'value') {
  return results[0]?.values?.map(([ts, val]: [number, string]) => ({
    timestamp: ts,
    [valueKey]: parseFloat(val) || 0,
  })) || [];
}

export function createAdminMetricsRoutes(
  db: IDatabase,
  prometheus: PrometheusService,
): Router {
  const router = Router();

  // ========================================
  // PROMETHEUS METRICS
  // ========================================

  router.get('/metrics/traffic', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const rangeSeconds: Record<string, number> = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000 };
      const seconds = rangeSeconds[range] || 3600;
      const step = seconds <= 3600 ? '30s' : seconds <= 21600 ? '2m' : seconds <= 86400 ? '5m' : seconds <= 604800 ? '30m' : '2h';
      const end = Math.floor(Date.now() / 1000);
      const start = end - seconds;

      const [rpsResults, errorResults] = await Promise.all([
        prometheus.queryRange('sum(rate(http_requests_total[1m]))', start, end, step),
        prometheus.queryRange('sum(rate(http_requests_total{status_code=~"5.."}[1m]))', start, end, step),
      ]);

      const rps = rpsResults[0]?.values?.map(([ts, val]) => ({
        timestamp: ts,
        value: parseFloat(val) || 0,
      })) || [];

      const errors = errorResults[0]?.values?.map(([ts, val]) => ({
        timestamp: ts,
        value: parseFloat(val) || 0,
      })) || [];

      res.json({ rps, errors, range });
    } catch (error: any) {
      logger.error('Failed to get traffic metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve traffic metrics' });
    }
  });

  router.get('/metrics/latency', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const rangeSeconds: Record<string, number> = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000 };
      const seconds = rangeSeconds[range] || 3600;
      const step = seconds <= 3600 ? '30s' : seconds <= 21600 ? '2m' : seconds <= 86400 ? '5m' : seconds <= 604800 ? '30m' : '2h';
      const end = Math.floor(Date.now() / 1000);
      const start = end - seconds;

      const [p50Results, p95Results, p99Results] = await Promise.all([
        prometheus.queryRange(
          'histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
          start, end, step
        ),
        prometheus.queryRange(
          'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
          start, end, step
        ),
        prometheus.queryRange(
          'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
          start, end, step
        ),
      ]);

      const format = (results: any[]) =>
        results[0]?.values?.map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          value: (parseFloat(val) || 0) * 1000,
        })) || [];

      res.json({
        p50: format(p50Results),
        p95: format(p95Results),
        p99: format(p99Results),
        range,
      });
    } catch (error: any) {
      logger.error('Failed to get latency metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve latency metrics' });
    }
  });

  router.get('/metrics/services', async (req: Request, res: Response) => {
    try {
      const upResults = await prometheus.queryInstant('up');

      const services = upResults.map((r) => ({
        job: r.metric.job || r.metric.instance || 'unknown',
        instance: r.metric.instance || '',
        up: r.value[1] === '1',
      }));

      res.json({ services });
    } catch (error: any) {
      logger.error('Failed to get service health', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve service health' });
    }
  });

  router.get('/metrics/system', async (req: Request, res: Response) => {
    try {
      const [pgPool, redisMem, redisMaxMem, uploadQueue] = await Promise.all([
        prometheus.queryInstant('pg_pool_active_connections'),
        prometheus.queryInstant('redis_memory_used_bytes'),
        prometheus.queryInstant('redis_memory_max_bytes'),
        prometheus.queryInstant('upload_queue_depth'),
      ]);

      const pgActive = parseFloat(pgPool[0]?.value?.[1] || '0');
      const pgMax = 500;
      const redisUsed = parseFloat(redisMem[0]?.value?.[1] || '0');
      const redisMax = parseFloat(redisMaxMem[0]?.value?.[1] || '1');
      const queueDepth = parseFloat(uploadQueue[0]?.value?.[1] || '0');

      res.json({
        pg_pool: { active: pgActive, max: pgMax, utilization_pct: (pgActive / pgMax) * 100 },
        redis: {
          used_bytes: redisUsed,
          max_bytes: redisMax,
          utilization_pct: redisMax > 0 ? (redisUsed / redisMax) * 100 : 0,
        },
        upload_queue: { depth: queueDepth },
      });
    } catch (error: any) {
      logger.error('Failed to get system metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve system metrics' });
    }
  });

  // ========================================
  // CONTAINER METRICS (cAdvisor)
  // ========================================

  router.get('/metrics/containers', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const rangeSeconds: Record<string, number> = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000 };
      const seconds = rangeSeconds[range] || 3600;
      const step = seconds <= 3600 ? '30s' : seconds <= 21600 ? '2m' : seconds <= 86400 ? '5m' : seconds <= 604800 ? '30m' : '2h';
      const end = Math.floor(Date.now() / 1000);
      const start = end - seconds;

      const nameFilter = 'name=~".+",name!~".*cadvisor.*|.*POD.*|.*pause.*"';

      const [
        cpuRateResults,
        memUsageResults,
        memLimitResults,
        netRxResults,
        netTxResults,
      ] = await Promise.all([
        prometheus.queryRange(`rate(container_cpu_usage_seconds_total{${nameFilter}}[1m])`, start, end, step),
        prometheus.queryRange(`container_memory_usage_bytes{${nameFilter}}`, start, end, step),
        prometheus.queryInstant(`container_spec_memory_limit_bytes{${nameFilter}}`),
        prometheus.queryRange(`rate(container_network_receive_bytes_total{${nameFilter}}[1m])`, start, end, step),
        prometheus.queryRange(`rate(container_network_transmit_bytes_total{${nameFilter}}[1m])`, start, end, step),
      ]);

      const memLimitMap: Record<string, number> = {};
      for (const r of memLimitResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        const val = parseFloat(r.value?.[1] || '0');
        if (val > 0) memLimitMap[name] = val;
      }

      const containersMap: Record<string, any> = {};

      for (const r of cpuRateResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        const values = r.values || [];
        const lastVal = values.length > 0 ? parseFloat(values[values.length - 1][1]) * 100 : 0;
        if (!containersMap[name]) containersMap[name] = { name };
        containersMap[name].cpuPercent = Math.round(lastVal * 100) / 100;
      }

      for (const r of memUsageResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        const values = r.values || [];
        const lastVal = values.length > 0 ? parseFloat(values[values.length - 1][1]) : 0;
        if (!containersMap[name]) containersMap[name] = { name };
        containersMap[name].memoryBytes = Math.round(lastVal);
        containersMap[name].memoryLimitBytes = memLimitMap[name] || 0;
        containersMap[name].memoryPercent = memLimitMap[name] > 0
          ? Math.round((lastVal / memLimitMap[name]) * 10000) / 100
          : 0;
      }

      for (const r of netRxResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        const values = r.values || [];
        const lastVal = values.length > 0 ? parseFloat(values[values.length - 1][1]) : 0;
        if (!containersMap[name]) containersMap[name] = { name };
        containersMap[name].networkRxBytesPerSec = Math.round(lastVal);
      }

      for (const r of netTxResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        const values = r.values || [];
        const lastVal = values.length > 0 ? parseFloat(values[values.length - 1][1]) : 0;
        if (!containersMap[name]) containersMap[name] = { name };
        containersMap[name].networkTxBytesPerSec = Math.round(lastVal);
      }

      const containers = Object.values(containersMap).map((c: any) => ({
        name: c.name,
        cpuPercent: c.cpuPercent || 0,
        memoryBytes: c.memoryBytes || 0,
        memoryLimitBytes: c.memoryLimitBytes || 0,
        memoryPercent: c.memoryPercent || 0,
        networkRxBytesPerSec: c.networkRxBytesPerSec || 0,
        networkTxBytesPerSec: c.networkTxBytesPerSec || 0,
      }));

      const cpuHistory: Record<string, { timestamp: number; value: number }[]> = {};
      for (const r of cpuRateResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        cpuHistory[name] = (r.values || []).map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          value: (parseFloat(val) || 0) * 100,
        }));
      }

      const memoryHistory: Record<string, { timestamp: number; value: number }[]> = {};
      for (const r of memUsageResults) {
        const name = r.metric.name || r.metric.container_label_com_docker_compose_service || 'unknown';
        memoryHistory[name] = (r.values || []).map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          value: parseFloat(val) || 0,
        }));
      }

      res.json({ containers, cpuHistory, memoryHistory, range });
    } catch (error: any) {
      logger.error('Failed to get container metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve container metrics' });
    }
  });

  // ========================================
  // INFRASTRUCTURE METRICS
  // ========================================

  router.get('/metrics/infrastructure', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const { start, end, step } = parseRange(range);

      const [
        cpuUser, cpuSystem, cpuIowait,
        memUsedPct, memTotal, memAvailable,
        diskRead, diskWrite,
        netRx, netTx,
        pgActive, pgIdle, pgIdleTx,
        pgCommits, pgRollbacks,
        pgCacheHit,
        redisMem, redisMaxMem,
        redisClients, redisCommands, redisEvicted,
      ] = await Promise.all([
        prometheus.queryRange('avg(rate(node_cpu_seconds_total{mode="user"}[1m]))', start, end, step),
        prometheus.queryRange('avg(rate(node_cpu_seconds_total{mode="system"}[1m]))', start, end, step),
        prometheus.queryRange('avg(rate(node_cpu_seconds_total{mode="iowait"}[1m]))', start, end, step),
        prometheus.queryInstant('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'),
        prometheus.queryInstant('node_memory_MemTotal_bytes'),
        prometheus.queryInstant('node_memory_MemAvailable_bytes'),
        prometheus.queryRange('rate(node_disk_read_bytes_total[1m])', start, end, step),
        prometheus.queryRange('rate(node_disk_written_bytes_total[1m])', start, end, step),
        prometheus.queryRange('rate(node_network_receive_bytes_total{device!="lo"}[1m])', start, end, step),
        prometheus.queryRange('rate(node_network_transmit_bytes_total{device!="lo"}[1m])', start, end, step),
        prometheus.queryRange('pg_stat_activity_count{state="active"}', start, end, step),
        prometheus.queryRange('pg_stat_activity_count{state="idle"}', start, end, step),
        prometheus.queryRange('pg_stat_activity_count{state="idle in transaction"}', start, end, step),
        prometheus.queryRange('rate(pg_stat_database_xact_commit{datname!=""}[1m])', start, end, step),
        prometheus.queryRange('rate(pg_stat_database_xact_rollback{datname!=""}[1m])', start, end, step),
        prometheus.queryInstant('pg_stat_database_blks_hit{datname!=""} / (pg_stat_database_blks_hit{datname!=""} + pg_stat_database_blks_read{datname!=""})'),
        prometheus.queryRange('redis_memory_used_bytes', start, end, step),
        prometheus.queryRange('redis_memory_max_bytes', start, end, step),
        prometheus.queryRange('redis_connected_clients', start, end, step),
        prometheus.queryRange('rate(redis_commands_processed_total[1m])', start, end, step),
        prometheus.queryRange('redis_evicted_keys_total', start, end, step),
      ]);

      const cpuUserSeries = cpuUser[0]?.values || [];
      const cpuSystemSeries = cpuSystem[0]?.values || [];
      const cpuIowaitSeries = cpuIowait[0]?.values || [];
      const cpuSeries = cpuUserSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        user: parseFloat(val) || 0,
        system: parseFloat(cpuSystemSeries[i]?.[1] || '0'),
        iowait: parseFloat(cpuIowaitSeries[i]?.[1] || '0'),
      }));

      const pgActiveSeries = pgActive[0]?.values || [];
      const pgIdleSeries = pgIdle[0]?.values || [];
      const pgIdleTxSeries = pgIdleTx[0]?.values || [];
      const pgConnSeries = pgActiveSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        active: parseFloat(val) || 0,
        idle: parseFloat(pgIdleSeries[i]?.[1] || '0'),
        idle_in_tx: parseFloat(pgIdleTxSeries[i]?.[1] || '0'),
      }));

      const pgCommitsSeries = pgCommits[0]?.values || [];
      const pgRollbacksSeries = pgRollbacks[0]?.values || [];
      const pgTxSeries = pgCommitsSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        commits: parseFloat(val) || 0,
        rollbacks: parseFloat(pgRollbacksSeries[i]?.[1] || '0'),
      }));

      const redisMemSeries = redisMem[0]?.values || [];
      const redisMaxSeries = redisMaxMem[0]?.values || [];
      const redisMemMerged = redisMemSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        used: parseFloat(val) || 0,
        max: parseFloat(redisMaxSeries[i]?.[1] || '0'),
      }));

      const diskReadSeries = diskRead[0]?.values || [];
      const diskWriteSeries = diskWrite[0]?.values || [];
      const diskSeries = diskReadSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        read_bytes: parseFloat(val) || 0,
        write_bytes: parseFloat(diskWriteSeries[i]?.[1] || '0'),
      }));

      const netRxSeries = netRx[0]?.values || [];
      const netTxSeries = netTx[0]?.values || [];
      const networkSeries = netRxSeries.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        rx_bytes: parseFloat(val) || 0,
        tx_bytes: parseFloat(netTxSeries[i]?.[1] || '0'),
      }));

      res.json({
        cpu: { series: cpuSeries },
        memory: {
          used_pct: parseFloat(memUsedPct[0]?.value?.[1] || '0'),
          total_bytes: parseFloat(memTotal[0]?.value?.[1] || '0'),
          available_bytes: parseFloat(memAvailable[0]?.value?.[1] || '0'),
        },
        disk_io: { series: diskSeries },
        network: { series: networkSeries },
        pg: {
          connections: { series: pgConnSeries },
          transactions: { series: pgTxSeries },
          cache_hit_ratio: parseFloat(pgCacheHit[0]?.value?.[1] || '0'),
        },
        redis: {
          memory: { series: redisMemMerged },
          clients: { series: extractSeries(redisClients) },
          commands_rate: { series: extractSeries(redisCommands) },
          evicted_keys: { series: extractSeries(redisEvicted) },
        },
        range,
      });
    } catch (error: any) {
      logger.error('Failed to get infrastructure metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve infrastructure metrics' });
    }
  });

  router.get('/metrics/upload-pipeline', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const { start, end, step } = parseRange(range);

      const [
        jobsCompleted, jobsFailed, jobsActive, jobsWaiting, jobsDelayed,
        durationP50, durationP95, durationP99,
        queueDepth,
        concurrencyActive, concurrencyMax,
      ] = await Promise.all([
        prometheus.queryRange('bullmq_jobs{status="completed"}', start, end, step),
        prometheus.queryRange('bullmq_jobs{status="failed"}', start, end, step),
        prometheus.queryRange('bullmq_jobs{status="active"}', start, end, step),
        prometheus.queryRange('bullmq_jobs{status="waiting"}', start, end, step),
        prometheus.queryRange('bullmq_jobs{status="delayed"}', start, end, step),
        prometheus.queryRange('histogram_quantile(0.50, rate(upload_processing_duration_seconds_bucket[5m]))', start, end, step),
        prometheus.queryRange('histogram_quantile(0.95, rate(upload_processing_duration_seconds_bucket[5m]))', start, end, step),
        prometheus.queryRange('histogram_quantile(0.99, rate(upload_processing_duration_seconds_bucket[5m]))', start, end, step),
        prometheus.queryRange('upload_queue_depth', start, end, step),
        prometheus.queryRange('upload_processing_active', start, end, step),
        prometheus.queryRange('cpu_adaptive_concurrency', start, end, step),
      ]);

      const completedVals = jobsCompleted[0]?.values || [];
      const failedVals = jobsFailed[0]?.values || [];
      const activeVals = jobsActive[0]?.values || [];
      const waitingVals = jobsWaiting[0]?.values || [];
      const delayedVals = jobsDelayed[0]?.values || [];
      const jobsSeries = completedVals.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        completed: parseFloat(val) || 0,
        failed: parseFloat(failedVals[i]?.[1] || '0'),
        active: parseFloat(activeVals[i]?.[1] || '0'),
        waiting: parseFloat(waitingVals[i]?.[1] || '0'),
        delayed: parseFloat(delayedVals[i]?.[1] || '0'),
      }));

      const p50Vals = durationP50[0]?.values || [];
      const p95Vals = durationP95[0]?.values || [];
      const p99Vals = durationP99[0]?.values || [];
      const durationSeries = p50Vals.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        p50: (parseFloat(val) || 0) * 1000,
        p95: (parseFloat(p95Vals[i]?.[1] || '0')) * 1000,
        p99: (parseFloat(p99Vals[i]?.[1] || '0')) * 1000,
      }));

      const activeConc = concurrencyActive[0]?.values || [];
      const maxConc = concurrencyMax[0]?.values || [];
      const concurrencySeries = activeConc.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        active: parseFloat(val) || 0,
        max: parseFloat(maxConc[i]?.[1] || '0'),
      }));

      res.json({
        jobs: { series: jobsSeries },
        processing_duration: { series: durationSeries },
        queue_depth: { series: extractSeries(queueDepth) },
        concurrency: { series: concurrencySeries },
        range,
      });
    } catch (error: any) {
      logger.error('Failed to get upload pipeline metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve upload pipeline metrics' });
    }
  });

  router.get('/metrics/backend-detail', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      const { start, end, step } = parseRange(range);

      const [
        byRouteResults,
        status2xx, status3xx, status4xx, status5xx,
        externalCalls, externalDuration,
      ] = await Promise.all([
        prometheus.queryRange('sum(rate(http_requests_total[1m])) by (route)', start, end, step),
        prometheus.queryRange('sum(rate(http_requests_total{status_code=~"2.."}[1m]))', start, end, step),
        prometheus.queryRange('sum(rate(http_requests_total{status_code=~"3.."}[1m]))', start, end, step),
        prometheus.queryRange('sum(rate(http_requests_total{status_code=~"4.."}[1m]))', start, end, step),
        prometheus.queryRange('sum(rate(http_requests_total{status_code=~"5.."}[1m]))', start, end, step),
        prometheus.queryRange('sum(rate(external_api_calls_total[1m])) by (service)', start, end, step),
        prometheus.queryRange('histogram_quantile(0.95, sum(rate(external_api_duration_seconds_bucket[5m])) by (le, service))', start, end, step),
      ]);

      const byRoute = byRouteResults.map((r: any) => ({
        route: r.metric?.route || 'unknown',
        series: (r.values || []).map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          rps: parseFloat(val) || 0,
        })),
      }));

      const s2xx = status2xx[0]?.values || [];
      const s3xx = status3xx[0]?.values || [];
      const s4xx = status4xx[0]?.values || [];
      const s5xx = status5xx[0]?.values || [];
      const statusSeries = s2xx.map(([ts, val]: [number, string], i: number) => ({
        timestamp: ts,
        '2xx': parseFloat(val) || 0,
        '3xx': parseFloat(s3xx[i]?.[1] || '0'),
        '4xx': parseFloat(s4xx[i]?.[1] || '0'),
        '5xx': parseFloat(s5xx[i]?.[1] || '0'),
      }));

      const externalCallsSeries = externalCalls.map((r: any) => ({
        service: r.metric?.service || 'unknown',
        series: (r.values || []).map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          value: parseFloat(val) || 0,
        })),
      }));

      const externalDurationSeries = externalDuration.map((r: any) => ({
        service: r.metric?.service || 'unknown',
        series: (r.values || []).map(([ts, val]: [number, string]) => ({
          timestamp: ts,
          value: (parseFloat(val) || 0) * 1000,
        })),
      }));

      res.json({
        by_route: byRoute,
        status_codes: { series: statusSeries },
        external_apis: {
          calls: externalCallsSeries,
          duration_p95: externalDurationSeries,
        },
        range,
      });
    } catch (error: any) {
      logger.error('Failed to get backend detail metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve backend detail metrics' });
    }
  });

  router.get('/metrics/cost-realtime', async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '6h';

      const lastHourResult = await db.query(`
        SELECT COALESCE(SUM(
          COALESCE(openai_cost_usd, 0) + COALESCE(anthropic_cost_usd, 0) +
          COALESCE(secondlayer_cost_usd, 0)
        ), 0) as total
        FROM cost_tracking
        WHERE created_at >= NOW() - INTERVAL '1 hour'
          AND status = 'completed'
      `);
      const costPerHour = parseFloat(lastHourResult.rows[0]?.total || '0');
      const costPerDay = costPerHour * 24;
      const costPerMonth = costPerDay * 30;

      const costByModelResult = await db.query(`
        SELECT
          date_trunc('hour', created_at) as hour,
          elem->>'model' as model,
          SUM((elem->>'cost')::numeric) as cost
        FROM cost_tracking,
          jsonb_array_elements(
            CASE WHEN openai_calls IS NOT NULL AND openai_calls != 'null'::jsonb AND jsonb_typeof(openai_calls) = 'array'
              THEN openai_calls ELSE '[]'::jsonb END
            ||
            CASE WHEN anthropic_calls IS NOT NULL AND anthropic_calls != 'null'::jsonb AND jsonb_typeof(anthropic_calls) = 'array'
              THEN anthropic_calls ELSE '[]'::jsonb END
          ) AS elem
        WHERE created_at >= NOW() - INTERVAL '${range === '24h' ? '24 hours' : range === '6h' ? '6 hours' : '1 hour'}'
          AND status = 'completed'
          AND elem->>'model' IS NOT NULL
        GROUP BY hour, model
        ORDER BY hour
      `);

      const modelMap = new Map<number, Record<string, number>>();
      for (const row of costByModelResult.rows) {
        const ts = Math.floor(new Date(row.hour).getTime() / 1000);
        if (!modelMap.has(ts)) modelMap.set(ts, {});
        const entry = modelMap.get(ts)!;
        entry[row.model] = parseFloat(row.cost) || 0;
      }
      const byModelSeries = Array.from(modelMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([ts, models]) => ({ timestamp: ts, ...models }));

      const topToolsResult = await db.query(`
        SELECT
          tool_name,
          SUM(
            COALESCE(openai_cost_usd, 0) + COALESCE(anthropic_cost_usd, 0) +
            COALESCE(secondlayer_cost_usd, 0)
          ) as total_cost
        FROM cost_tracking
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND status = 'completed'
          AND tool_name IS NOT NULL
        GROUP BY tool_name
        ORDER BY total_cost DESC
        LIMIT 10
      `);

      const topTools = topToolsResult.rows.map((r: any) => ({
        tool: r.tool_name,
        cost: parseFloat(r.total_cost) || 0,
      }));

      res.json({
        cost_per_hour: costPerHour,
        cost_per_day: costPerDay,
        cost_per_month: costPerMonth,
        by_model: { series: byModelSeries },
        top_tools: topTools,
      });
    } catch (error: any) {
      logger.error('Failed to get cost realtime metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve cost realtime metrics' });
    }
  });

  // =========== INFRASTRUCTURE HEALTH ===========

  router.get('/infrastructure-health', async (_req: Request, res: Response) => {
    try {
      const checks: Record<string, { ok: boolean; error?: string }> = {};

      try {
        await db.query('SELECT 1');
        checks.postgres = { ok: true };
      } catch (err: any) {
        checks.postgres = { ok: false, error: err.message };
      }

      let redisOk = false;
      try {
        const { getRedisClient } = await import('../../utils/redis-client.js');
        const redis = await getRedisClient();
        if (redis) {
          await redis.ping();
          redisOk = true;
        }
      } catch {}
      checks.redis = redisOk ? { ok: true } : { ok: false, error: 'not connected' };

      try {
        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
        const resp = await axios.get(`${qdrantUrl}/collections`, { timeout: 3000 });
        checks.qdrant = resp.status === 200 ? { ok: true } : { ok: false, error: `status ${resp.status}` };
      } catch (err: any) {
        checks.qdrant = { ok: false, error: err.message };
      }

      try {
        const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
        const minioPort = parseInt(process.env.MINIO_PORT || '9000');
        const resp = await axios.get(`http://${minioEndpoint}:${minioPort}/minio/health/live`, { timeout: 3000 });
        checks.minio = resp.status === 200 ? { ok: true } : { ok: false, error: `status ${resp.status}` };
      } catch (err: any) {
        checks.minio = { ok: false, error: err.message };
      }

      let scrapeWorker = { in_flight: 0, pending: 0, max_concurrent: 10 };
      const docServiceUrl = process.env.DOCUMENT_SERVICE_URL;
      if (docServiceUrl) {
        try {
          const resp = await axios.get(`${docServiceUrl}/health`, { timeout: 3000 });
          if (resp.data?.checks) {
            scrapeWorker = {
              in_flight: resp.data.queue?.in_flight ?? 0,
              pending: resp.data.queue?.pending ?? 0,
              max_concurrent: 10,
            };
          }
        } catch {}
      }

      res.json({ ...checks, scrapeWorker });
    } catch (error: any) {
      logger.error('Failed to get infrastructure health', { error: error.message });
      res.status(500).json({ error: 'Failed to check infrastructure health' });
    }
  });

  // ========================================
  // PG MONITORING — EDRSR stats
  // ========================================
  let pgMonitoringCache: { data: any; timestamp: number } | null = null;
  const PG_MONITORING_CACHE_TTL_MS = 5 * 60 * 1000;

  router.get('/pg-monitoring', async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (pgMonitoringCache && (now - pgMonitoringCache.timestamp) < PG_MONITORING_CACHE_TTL_MS) {
        return res.json(pgMonitoringCache.data);
      }

      const tablesExist = await db.query(`
        SELECT
          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='edrsr_documents') AS has_docs,
          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='edrsr_fulltext') AS has_ft
      `);
      const { has_docs, has_ft } = tablesExist.rows[0];

      let localByYear: Array<{ year: number | null; total: number; with_fulltext: number }> = [];

      if (has_docs) {
        const docsResult = await db.query(`
          SELECT
            EXTRACT(YEAR FROM adjudication_date)::int AS year,
            COUNT(*)::int AS total
          FROM edrsr_documents
          GROUP BY year
          ORDER BY year NULLS LAST
        `);

        if (has_ft) {
          const ftResult = await db.transaction(async (client: any) => {
            await client.query("SET LOCAL work_mem = '32MB'");
            return client.query(`
              SELECT
                EXTRACT(YEAR FROM d.adjudication_date)::int AS year,
                COUNT(*)::int AS with_fulltext
              FROM edrsr_fulltext f
              JOIN edrsr_documents d ON d.doc_id = f.doc_id
              GROUP BY year
              ORDER BY year NULLS LAST
            `);
          });
          const ftMap = new Map<number | null, number>(ftResult.rows.map((r: any) => [r.year, r.with_fulltext]));
          localByYear = docsResult.rows.map((r: any) => ({
            year: r.year,
            total: r.total,
            with_fulltext: ftMap.get(r.year) || 0,
          }));
        } else {
          localByYear = docsResult.rows.map((r: any) => ({
            year: r.year,
            total: r.total,
            with_fulltext: 0,
          }));
        }
      }

      let localStandaloneFulltext = 0;
      if (has_ft) {
        const ftTotal = await db.query('SELECT COUNT(*)::int AS cnt FROM edrsr_fulltext');
        localStandaloneFulltext = ftTotal.rows[0]?.cnt || 0;
      }

      let totalDocs = 0;
      let totalFulltext = 0;
      if (has_docs) {
        const r = await db.query('SELECT COUNT(*)::int AS cnt FROM edrsr_documents');
        totalDocs = r.rows[0]?.cnt || 0;
      }
      if (has_ft) {
        const r = await db.query('SELECT COUNT(*)::int AS cnt FROM edrsr_fulltext');
        totalFulltext = r.rows[0]?.cnt || 0;
      }

      const localData = {
        byYear: localByYear,
        totalDocuments: totalDocs,
        totalFulltext: totalFulltext,
        standaloneFulltext: localStandaloneFulltext,
        timestamp: new Date().toISOString(),
      };

      const stageBackendUrl = process.env.STAGE_BACKEND_URL || 'https://stage.legal.org.ua';
      const stageApiKey = process.env.STAGE_API_KEY ||
        process.env.SECONDARY_LAYER_KEYS?.split(',')[0]?.trim() || '';
      const prodBackendUrl = process.env.PROD_BACKEND_URL || 'https://mcp.legal.org.ua';
      const prodApiKey = process.env.PROD_API_KEY ||
        process.env.SECONDARY_LAYER_KEYS?.split(',')[0]?.trim() || '';

      const fetchRemote = async (url: string, apiKey: string) => {
        try {
          const resp = await axios.get(`${url}/api/internal/edrsr-stats`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 30000,
          });
          return resp.data;
        } catch (err: any) {
          logger.warn('pg-monitoring: failed to fetch remote EDRSR stats', { url, error: err.message });
          return null;
        }
      };

      const [stageData, prodData] = await Promise.all([
        fetchRemote(stageBackendUrl, stageApiKey),
        fetchRemote(prodBackendUrl, prodApiKey),
      ]);

      const responseData = {
        local: localData,
        stage: stageData,
        prod: prodData,
        timestamp: new Date().toISOString(),
      };

      pgMonitoringCache = { data: responseData, timestamp: now };

      return res.json(responseData);
    } catch (error: any) {
      logger.error('pg-monitoring failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch PG monitoring data' });
    }
  });

  return router;
}
