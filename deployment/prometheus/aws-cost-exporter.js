#!/usr/bin/env node
'use strict';

/*
 * AWS cost + activity exporter for Prometheus.
 *
 * Why this exists
 * ---------------
 * We want a Grafana dashboard with per-service AWS spend (today / yesterday /
 * month-to-date), promo-credit burn-down, and a "who is doing what" panel from
 * CloudTrail — without shipping the whole AWS SDK into a container. This is a
 * tiny, dependency-free (Node stdlib only) exporter in the same style as
 * qdrant-edrsr-metrics-cache.js: slow BACKGROUND refresh loops populate
 * last-good in-memory state, and /metrics is served instantly from that state
 * so Prometheus scrapes never block on (or flap with) the AWS APIs.
 *
 * What it does
 * ------------
 *   - Polls Cost Explorer (GetCostAndUsage) every CE_INTERVAL_SECONDS
 *     (default 1h — each refresh is 2 paid API calls at $0.01 each):
 *       Call A: DAILY, RECORD_TYPE=Usage, grouped by SERVICE, current month.
 *       Call B: MONTHLY, RECORD_TYPE=Credit, since 2026-02-01 (credit burn).
 *   - Polls CloudTrail (LookupEvents) every CT_INTERVAL_SECONDS (default 15m)
 *     over a CT_LOOKBACK_MINUTES window and aggregates event counts by
 *     (event_source, event_name, username).
 *   - Serves Prometheus text format on 0.0.0.0:EXPORTER_PORT (default 9199)
 *     at /metrics, plus /healthz -> 200 "ok".
 *
 * Auth: hand-rolled SigV4 (node:crypto). Credentials from env
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY [/ AWS_SESSION_TOKEN]) or the
 * EC2 instance metadata service (IMDSv2 with IMDSv1 fallback), with role
 * credentials cached and refreshed when <10 min to expiry.
 *
 * Config (env)
 * ------------
 *   EXPORTER_PORT        default 9199
 *   AWS_REGION           default eu-central-1 (CloudTrail region; CE is always us-east-1)
 *   CE_INTERVAL_SECONDS  default 3600
 *   CT_INTERVAL_SECONDS  default 900
 *   CT_LOOKBACK_MINUTES  default 60
 *   CREDITS_TOTAL_USD    default 25000 (for aws_credits_remaining_usd)
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const EXPORTER_PORT = parseInt(process.env.EXPORTER_PORT || '9199', 10);
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const CE_INTERVAL_MS = parseInt(process.env.CE_INTERVAL_SECONDS || '3600', 10) * 1000;
const CT_INTERVAL_MS = parseInt(process.env.CT_INTERVAL_SECONDS || '900', 10) * 1000;
const CT_LOOKBACK_MINUTES = parseInt(process.env.CT_LOOKBACK_MINUTES || '60', 10);
const CREDITS_TOTAL_USD = parseFloat(process.env.CREDITS_TOTAL_USD || '25000');

const CREDITS_SINCE = '2026-02-01'; // start of promo-credit tracking window
const IMDS_HOST = '169.254.169.254';
const IMDS_TIMEOUT_MS = 2000;
const HTTP_TIMEOUT_MS = 30000;
const CT_MAX_PAGES = 20;
const CT_PAGE_SLEEP_MS = 700; // LookupEvents throttles at 2 rps
const CT_MAX_SERIES = 400;
const MIN_COST_USD = 0.001;

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

function log(...args) {
  console.log(new Date().toISOString(), '[aws-cost-exporter]', ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Last-good state (what /metrics is rendered from)
// ---------------------------------------------------------------------------

const state = {
  ce: {
    // service -> { today, yesterday, mtd }
    services: new Map(),
    monthTotal: 0,
    creditsMonth: 0,
    creditsSpentTotal: 0,
    lastSuccess: 0, // unix seconds
  },
  ct: {
    // 'source\x00name\x00user' -> count
    counts: new Map(),
    lastSuccess: 0, // unix seconds
  },
  errors: {
    cost_explorer: 0,
    cloudtrail: 0,
  },
};

// ---------------------------------------------------------------------------
// Credentials: env -> EC2 instance metadata (IMDSv2, IMDSv1 fallback)
// ---------------------------------------------------------------------------

let cachedCreds = null; // { accessKeyId, secretAccessKey, sessionToken, expiration(ms|0) }

/** Minimal raw HTTP request against the IMDS endpoint. */
function imdsRequest(method, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: IMDS_HOST, method, path, headers: headers || {}, timeout: IMDS_TIMEOUT_MS },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error('IMDS ' + method + ' ' + path + ' -> HTTP ' + res.statusCode));
            return;
          }
          resolve(body);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('IMDS timeout after ' + IMDS_TIMEOUT_MS + 'ms')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchImdsCredentials() {
  // IMDSv2 token; may fail due to hop limit (e.g. containers) -> IMDSv1.
  let tokenHeaders = {};
  try {
    const token = await imdsRequest('PUT', '/latest/api/token', {
      'X-aws-ec2-metadata-token-ttl-seconds': '21600',
    });
    tokenHeaders = { 'X-aws-ec2-metadata-token': token };
  } catch (err) {
    log('IMDSv2 token failed (' + err.message + '), falling back to IMDSv1');
  }
  const role = (await imdsRequest('GET', '/latest/meta-data/iam/security-credentials/', tokenHeaders))
    .split('\n')[0].trim();
  if (!role) throw new Error('IMDS returned no IAM role name');
  const doc = JSON.parse(
    await imdsRequest('GET', '/latest/meta-data/iam/security-credentials/' + role, tokenHeaders)
  );
  if (!doc.AccessKeyId || !doc.SecretAccessKey) {
    throw new Error('IMDS role credentials missing AccessKeyId/SecretAccessKey');
  }
  return {
    accessKeyId: doc.AccessKeyId,
    secretAccessKey: doc.SecretAccessKey,
    sessionToken: doc.Token || '',
    expiration: doc.Expiration ? Date.parse(doc.Expiration) : 0,
  };
}

async function getCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || '',
      expiration: 0,
    };
  }
  // Reuse cached IMDS creds until <10 min to expiry.
  if (cachedCreds && (!cachedCreds.expiration || cachedCreds.expiration - Date.now() > 10 * 60 * 1000)) {
    return cachedCreds;
  }
  cachedCreds = await fetchImdsCredentials();
  log('refreshed IMDS role credentials, expire',
    cachedCreds.expiration ? new Date(cachedCreds.expiration).toISOString() : 'never');
  return cachedCreds;
}

// ---------------------------------------------------------------------------
// SigV4-signed JSON-RPC POST
// ---------------------------------------------------------------------------

function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function signHeaders({ host, region, service, target, body, creds }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const headers = {
    'content-type': 'application/x-amz-json-1.1',
    host: host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((h) => h + ':' + headers[h] + '\n').join('');
  const signedHeaders = signedNames.join(';');
  const canonicalRequest =
    ['POST', '/', '', canonicalHeaders, signedHeaders, sha256hex(body)].join('\n');
  const scope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign =
    ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  let key = hmac('AWS4' + creds.secretAccessKey, dateStamp);
  key = hmac(key, region);
  key = hmac(key, service);
  key = hmac(key, 'aws4_request');
  const signature = hmac(key, stringToSign).toString('hex');

  headers['authorization'] =
    'AWS4-HMAC-SHA256 Credential=' + creds.accessKeyId + '/' + scope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return headers;
}

/** One signed AWS JSON-RPC call. Throws Error with .statusCode/.awsType on failure. */
async function awsCall({ host, region, service, target }, request) {
  const creds = await getCredentials();
  const body = JSON.stringify(request);
  const headers = signHeaders({ host, region, service, target, body, creds });
  headers['content-length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, method: 'POST', path: '/', headers, timeout: HTTP_TIMEOUT_MS },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch (_) { /* non-JSON error body */ }
          if (res.statusCode === 200 && json) {
            resolve(json);
            return;
          }
          const awsType = (json && (json.__type || json.code)) || '';
          const message = (json && (json.message || json.Message)) || text.slice(0, 300);
          const err = new Error(target + ' HTTP ' + res.statusCode +
            (awsType ? ' ' + awsType : '') + ': ' + message);
          err.statusCode = res.statusCode;
          err.awsType = awsType;
          reject(err);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(target + ' timeout after ' + HTTP_TIMEOUT_MS + 'ms')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Exponential-backoff retry (3 attempts) on throttling / 5xx. */
async function withRetry(label, fn) {
  let delayMs = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const throttled = /Throttl|TooManyRequests|Rate exceeded/i.test(
        (err.awsType || '') + ' ' + err.message);
      const retriable = throttled || err.statusCode === 429 || (err.statusCode >= 500);
      if (attempt >= 3 || !retriable) throw err;
      log(label, 'attempt', attempt, 'failed (' + err.message + '), retrying in', delayMs + 'ms');
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Cost Explorer collector
// ---------------------------------------------------------------------------

const CE_ENDPOINT = { host: 'ce.us-east-1.amazonaws.com', region: 'us-east-1', service: 'ce' };
const CE_TARGET = 'AWSInsightsIndexService.GetCostAndUsage';

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

async function ceGetAllPages(baseRequest) {
  const results = [];
  let nextToken;
  do {
    const req = nextToken ? { ...baseRequest, NextPageToken: nextToken } : baseRequest;
    const resp = await withRetry('cost_explorer', () =>
      awsCall({ ...CE_ENDPOINT, target: CE_TARGET }, req));
    for (const r of resp.ResultsByTime || []) results.push(r);
    nextToken = resp.NextPageToken;
  } while (nextToken);
  return results;
}

async function refreshCostExplorer() {
  const now = new Date();
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 3600 * 1000));
  const monthStart = today.slice(0, 8) + '01';
  const tomorrow = isoDay(new Date(now.getTime() + 24 * 3600 * 1000));

  // Call A: per-service daily Usage costs for the current month.
  const daily = await ceGetAllPages({
    TimePeriod: { Start: monthStart, End: tomorrow },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } },
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  });

  const services = new Map(); // service -> { today, yesterday, mtd }
  let monthTotal = 0;
  for (const period of daily) {
    const day = period.TimePeriod && period.TimePeriod.Start;
    for (const group of period.Groups || []) {
      const name = (group.Keys && group.Keys[0]) || 'unknown';
      const amount = parseFloat(
        group.Metrics && group.Metrics.UnblendedCost && group.Metrics.UnblendedCost.Amount) || 0;
      let entry = services.get(name);
      if (!entry) {
        entry = { today: 0, yesterday: 0, mtd: 0 };
        services.set(name, entry);
      }
      entry.mtd += amount;
      monthTotal += amount;
      if (day === today) entry.today += amount;
      // If yesterday fell in the previous month it is simply absent -> stays 0.
      if (day === yesterday) entry.yesterday += amount;
    }
  }

  // Call B: monthly Credit totals since CREDITS_SINCE (credits burn-down).
  const monthly = await ceGetAllPages({
    TimePeriod: { Start: CREDITS_SINCE, End: tomorrow },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } },
  });

  let creditsSpentTotal = 0;
  let creditsMonth = 0;
  for (const period of monthly) {
    const amount = Math.abs(parseFloat(
      period.Total && period.Total.UnblendedCost && period.Total.UnblendedCost.Amount) || 0);
    creditsSpentTotal += amount;
    if (period.TimePeriod && period.TimePeriod.Start === monthStart) creditsMonth = amount;
  }

  state.ce.services = services;
  state.ce.monthTotal = monthTotal;
  state.ce.creditsMonth = creditsMonth;
  state.ce.creditsSpentTotal = creditsSpentTotal;
  state.ce.lastSuccess = Math.floor(Date.now() / 1000);
  log('cost explorer refresh ok:', services.size, 'services, month total $' + monthTotal.toFixed(2) +
    ', credits spent total $' + creditsSpentTotal.toFixed(2));
}

// ---------------------------------------------------------------------------
// CloudTrail collector
// ---------------------------------------------------------------------------

const CT_ENDPOINT = {
  host: 'cloudtrail.' + AWS_REGION + '.amazonaws.com',
  region: AWS_REGION,
  service: 'cloudtrail',
};
const CT_TARGET = 'CloudTrail_20131101.LookupEvents';

async function refreshCloudTrail() {
  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - CT_LOOKBACK_MINUTES * 60;

  const counts = new Map();
  let nextToken;
  let pages = 0;
  let events = 0;
  do {
    const req = { StartTime: startSec, EndTime: endSec, MaxResults: 50 };
    if (nextToken) req.NextToken = nextToken;
    const resp = await withRetry('cloudtrail', () =>
      awsCall({ ...CT_ENDPOINT, target: CT_TARGET }, req));
    for (const ev of resp.Events || []) {
      let detail = {};
      try { detail = JSON.parse(ev.CloudTrailEvent || '{}'); } catch (_) { /* skip bad JSON */ }
      const source = String(detail.eventSource || ev.EventSource || '?')
        .replace(/\.amazonaws\.com$/, '');
      const name = String(detail.eventName || ev.EventName || '?');
      const identity = detail.userIdentity || {};
      const username = identity.userName || identity.type || '?';
      const key = source + '\x00' + name + '\x00' + username;
      counts.set(key, (counts.get(key) || 0) + 1);
      events++;
    }
    nextToken = resp.NextToken;
    pages++;
    if (nextToken && pages < CT_MAX_PAGES) await sleep(CT_PAGE_SLEEP_MS);
  } while (nextToken && pages < CT_MAX_PAGES);

  state.ct.counts = counts;
  state.ct.lastSuccess = Math.floor(Date.now() / 1000);
  log('cloudtrail refresh ok:', events, 'events,', counts.size, 'series,', pages, 'page(s)');
}

// ---------------------------------------------------------------------------
// Refresh loops (never throw)
// ---------------------------------------------------------------------------

const inFlight = { cost_explorer: false, cloudtrail: false };

async function safeRefresh(collector, fn) {
  if (inFlight[collector]) {
    log('skip', collector, 'refresh — previous run still in flight');
    return;
  }
  inFlight[collector] = true;
  try {
    await fn();
  } catch (err) {
    state.errors[collector]++;
    log(collector, 'refresh FAILED:', err.message, '(serving last-good data)');
  } finally {
    inFlight[collector] = false;
  }
}

// ---------------------------------------------------------------------------
// Prometheus rendering
// ---------------------------------------------------------------------------

function escapeLabel(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function fmt(n) {
  return Number.isFinite(n) ? String(+n.toFixed(6)) : '0';
}

function renderMetrics() {
  const out = [];
  const push = (line) => out.push(line);

  // --- Cost Explorer: per-service gauges ---
  const perService = [];
  for (const [name, e] of state.ce.services) {
    if (e.today < MIN_COST_USD && e.yesterday < MIN_COST_USD && e.mtd < MIN_COST_USD) continue;
    perService.push([escapeLabel(name), e]);
  }
  perService.sort((a, b) => b[1].mtd - a[1].mtd);

  push('# HELP aws_cost_service_today_usd Unblended usage cost (USD) for today (UTC), per AWS service.');
  push('# TYPE aws_cost_service_today_usd gauge');
  for (const [name, e] of perService) {
    push('aws_cost_service_today_usd{service="' + name + '"} ' + fmt(e.today));
  }
  push('# HELP aws_cost_service_yesterday_usd Unblended usage cost (USD) for yesterday (UTC), per AWS service.');
  push('# TYPE aws_cost_service_yesterday_usd gauge');
  for (const [name, e] of perService) {
    push('aws_cost_service_yesterday_usd{service="' + name + '"} ' + fmt(e.yesterday));
  }
  push('# HELP aws_cost_service_mtd_usd Unblended usage cost (USD) month-to-date, per AWS service.');
  push('# TYPE aws_cost_service_mtd_usd gauge');
  for (const [name, e] of perService) {
    push('aws_cost_service_mtd_usd{service="' + name + '"} ' + fmt(e.mtd));
  }

  push('# HELP aws_cost_month_total_usd Total unblended usage cost (USD) month-to-date across all services.');
  push('# TYPE aws_cost_month_total_usd gauge');
  push('aws_cost_month_total_usd ' + fmt(state.ce.monthTotal));

  // --- Credits ---
  push('# HELP aws_credits_month_usd Promo credits (USD, absolute) applied in the current month.');
  push('# TYPE aws_credits_month_usd gauge');
  push('aws_credits_month_usd ' + fmt(state.ce.creditsMonth));
  push('# HELP aws_credits_spent_total_usd Promo credits (USD, absolute) applied since ' + CREDITS_SINCE + '.');
  push('# TYPE aws_credits_spent_total_usd gauge');
  push('aws_credits_spent_total_usd ' + fmt(state.ce.creditsSpentTotal));
  push('# HELP aws_credits_remaining_usd Promo credits (USD) remaining out of CREDITS_TOTAL_USD (' + CREDITS_TOTAL_USD + ').');
  push('# TYPE aws_credits_remaining_usd gauge');
  push('aws_credits_remaining_usd ' + fmt(Math.max(0, CREDITS_TOTAL_USD - state.ce.creditsSpentTotal)));

  // --- CloudTrail: event counts in the lookback window (capped) ---
  const ctSeries = [...state.ct.counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CT_MAX_SERIES);
  push('# HELP aws_cloudtrail_events CloudTrail management events in the last ' + CT_LOOKBACK_MINUTES + ' minutes, by source/name/username.');
  push('# TYPE aws_cloudtrail_events gauge');
  for (const [key, count] of ctSeries) {
    const [source, name, username] = key.split('\x00');
    push('aws_cloudtrail_events{event_source="' + escapeLabel(source) +
      '",event_name="' + escapeLabel(name) +
      '",username="' + escapeLabel(username) + '"} ' + count);
  }

  // --- Exporter self-metrics ---
  push('# HELP aws_exporter_last_success_timestamp Unix time of the last successful refresh, per collector.');
  push('# TYPE aws_exporter_last_success_timestamp gauge');
  push('aws_exporter_last_success_timestamp{collector="cost_explorer"} ' + state.ce.lastSuccess);
  push('aws_exporter_last_success_timestamp{collector="cloudtrail"} ' + state.ct.lastSuccess);
  push('# HELP aws_exporter_scrape_errors_total Failed refresh attempts, per collector.');
  push('# TYPE aws_exporter_scrape_errors_total counter');
  push('aws_exporter_scrape_errors_total{collector="cost_explorer"} ' + state.errors.cost_explorer);
  push('aws_exporter_scrape_errors_total{collector="cloudtrail"} ' + state.errors.cloudtrail);

  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }
  if (req.url.startsWith('/metrics')) {
    res.writeHead(200, { 'Content-Type': CONTENT_TYPE });
    res.end(renderMetrics());
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found\n');
});

server.listen(EXPORTER_PORT, '0.0.0.0', () => {
  log('listening on :' + EXPORTER_PORT,
    '| CE every', CE_INTERVAL_MS / 1000 + 's',
    '| CloudTrail every', CT_INTERVAL_MS / 1000 + 's',
    '(lookback', CT_LOOKBACK_MINUTES + 'min, region', AWS_REGION + ')',
    '| credits pool $' + CREDITS_TOTAL_USD);
  // Warm both collectors immediately, then loop.
  safeRefresh('cost_explorer', refreshCostExplorer);
  safeRefresh('cloudtrail', refreshCloudTrail);
  setInterval(() => safeRefresh('cost_explorer', refreshCostExplorer), CE_INTERVAL_MS);
  setInterval(() => safeRefresh('cloudtrail', refreshCloudTrail), CT_INTERVAL_MS);
});

// Belt-and-braces: never let an unexpected async error kill the exporter.
process.on('unhandledRejection', (err) => {
  log('unhandledRejection:', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  log('uncaughtException:', err && err.message ? err.message : err);
});
