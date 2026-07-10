#!/usr/bin/env node
'use strict';

/*
 * Caching /metrics sidecar for the bigbox EDRSR Qdrant instance.
 *
 * Why this exists
 * ---------------
 * Qdrant's /metrics endpoint for the ~296M-vector `edrsr_serving` collection
 * takes far longer than any safe Prometheus scrape timeout to generate — it is
 * I/O-bound scanning cold, mmap'd segments and was observed not completing even
 * in 240s (vs ~8-12s when the scrape job was first tuned). Prometheus timed out
 * at 30s on every scrape, marked `up{job=qdrant_edrsr}=0`, and the whole Grafana
 * dashboard read DOWN / "No data" even though Qdrant itself was healthy and
 * serving. Bumping the scrape timeout can't fix this: generation time is
 * unbounded and variable, so the target flaps no matter the timeout.
 *
 * What this does
 * --------------
 * A tiny, dependency-free (Node stdlib only) HTTP server that:
 *   - Refreshes the upstream Qdrant /metrics on a slow BACKGROUND loop, holding
 *     an in-flight lock so at most one expensive fetch runs at a time.
 *   - Serves the last-good cached body to Prometheus INSTANTLY on every scrape,
 *     decoupling the (fast) scrape from the (slow) generation. The target stays
 *     up; freshness is observable via the appended cache metrics below.
 *
 * It appends its own gauges so we can alert on staleness:
 *   qdrant_edrsr_metrics_cache_up                        1 if a cached body exists
 *   qdrant_edrsr_metrics_cache_last_scrape_success       1 if the last upstream fetch ok
 *   qdrant_edrsr_metrics_cache_age_seconds               age of the cached body
 *   qdrant_edrsr_metrics_cache_upstream_duration_seconds duration of last upstream fetch
 *
 * Config (env)
 * ------------
 *   UPSTREAM_URL           default http://10.88.0.6:6333/metrics
 *   QDRANT_EDRSR_API_KEY   Bearer token for the upstream (required for real data)
 *   REFRESH_INTERVAL_MS    default 120000 (2 min) — how often to try a refresh
 *   UPSTREAM_TIMEOUT_MS    default 300000 (5 min) — hard cap on one upstream fetch
 *   LISTEN_PORT            default 9109
 */

const http = require('http');
const { URL } = require('url');

const UPSTREAM_URL = process.env.UPSTREAM_URL || 'http://10.88.0.6:6333/metrics';
const API_KEY = process.env.QDRANT_EDRSR_API_KEY || '';
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS || '120000', 10);
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '300000', 10);
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || '9109', 10);

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

// Cache state.
const cache = {
  body: null,          // last-good upstream body (string)
  fetchedAt: 0,        // ms epoch of last successful fetch
  lastSuccess: false,  // whether the most recent fetch attempt succeeded
  lastDurationMs: 0,   // duration of the most recent fetch attempt
};
let refreshing = false;

function log(...args) {
  console.log(new Date().toISOString(), '[edrsr-metrics-cache]', ...args);
}

/** Fetch the upstream /metrics once. Resolves with the body string. */
function fetchUpstream() {
  return new Promise((resolve, reject) => {
    const u = new URL(UPSTREAM_URL);
    const headers = {};
    if (API_KEY) headers['Authorization'] = 'Bearer ' + API_KEY;

    const req = http.get(
      {
        hostname: u.hostname,
        port: u.port || 6333,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume(); // drain
          reject(new Error('upstream HTTP ' + res.statusCode));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );

    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      req.destroy(new Error('upstream timeout after ' + UPSTREAM_TIMEOUT_MS + 'ms'));
    });
    req.on('error', reject);
  });
}

/** Background refresh with an in-flight lock so fetches never overlap. */
async function refresh() {
  if (refreshing) {
    log('skip refresh — previous fetch still in flight');
    return;
  }
  refreshing = true;
  const started = Date.now();
  try {
    const body = await fetchUpstream();
    cache.body = body;
    cache.fetchedAt = Date.now();
    cache.lastSuccess = true;
    cache.lastDurationMs = Date.now() - started;
    log('refresh ok:', body.length, 'bytes in', (cache.lastDurationMs / 1000).toFixed(1) + 's');
  } catch (err) {
    cache.lastSuccess = false;
    cache.lastDurationMs = Date.now() - started;
    log('refresh FAILED after', (cache.lastDurationMs / 1000).toFixed(1) + 's:', err.message,
      '(serving last-good, age', ageSeconds() + 's)');
  } finally {
    refreshing = false;
  }
}

function ageSeconds() {
  return cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 1000) : -1;
}

/** Self-metrics appended to every response so staleness is alertable. */
function selfMetrics() {
  const up = cache.body ? 1 : 0;
  const ok = cache.lastSuccess ? 1 : 0;
  const age = cache.fetchedAt ? Math.round((Date.now() - cache.fetchedAt) / 1000) : 0;
  const dur = (cache.lastDurationMs / 1000).toFixed(3);
  return [
    '# HELP qdrant_edrsr_metrics_cache_up Whether a cached upstream /metrics body is available (1) or not (0).',
    '# TYPE qdrant_edrsr_metrics_cache_up gauge',
    'qdrant_edrsr_metrics_cache_up ' + up,
    '# HELP qdrant_edrsr_metrics_cache_last_scrape_success Whether the most recent upstream fetch succeeded (1) or failed (0).',
    '# TYPE qdrant_edrsr_metrics_cache_last_scrape_success gauge',
    'qdrant_edrsr_metrics_cache_last_scrape_success ' + ok,
    '# HELP qdrant_edrsr_metrics_cache_age_seconds Age of the cached upstream /metrics body in seconds.',
    '# TYPE qdrant_edrsr_metrics_cache_age_seconds gauge',
    'qdrant_edrsr_metrics_cache_age_seconds ' + age,
    '# HELP qdrant_edrsr_metrics_cache_upstream_duration_seconds Duration of the most recent upstream fetch in seconds.',
    '# TYPE qdrant_edrsr_metrics_cache_upstream_duration_seconds gauge',
    'qdrant_edrsr_metrics_cache_upstream_duration_seconds ' + dur,
    '',
  ].join('\n');
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }
  if (req.url.startsWith('/metrics')) {
    let out = cache.body || '';
    if (out && !out.endsWith('\n')) out += '\n';
    out += selfMetrics();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPE });
    res.end(out);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found\n');
});

server.listen(LISTEN_PORT, () => {
  log('listening on :' + LISTEN_PORT, '| upstream', UPSTREAM_URL,
    '| refresh', REFRESH_INTERVAL_MS + 'ms', '| timeout', UPSTREAM_TIMEOUT_MS + 'ms',
    '| key', API_KEY ? 'set' : 'MISSING');
  refresh(); // warm the cache immediately
  setInterval(refresh, REFRESH_INTERVAL_MS);
});
