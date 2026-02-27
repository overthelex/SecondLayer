#!/usr/bin/env node
/**
 * Local Slow Scraper: SQS → reyestr.court.gov.ua → S3
 *
 * Runs from a residential IP (178.150.37.129) with slow/polite settings.
 * 3 concurrent workers, ~0.3 req/s each = ~1 req/s total.
 *
 * Env vars:
 *   SQS_QUEUE_URL   - SQS queue URL (required)
 *   S3_BUCKET       - S3 bucket name (required)
 *   AWS_REGION      - AWS region (default: eu-central-1)
 *   CONCURRENCY     - Parallel workers (default: 3)
 *   LOCAL_IP        - Local IP to bind (default: 178.150.37.129)
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY - AWS creds
 *   BACKEND_URL     - Backend URL for heartbeats (e.g., https://legal.org.ua)
 *   API_KEY         - Backend API key (SECONDARY_LAYER_KEYS value)
 *   WORKER_REGION   - Region label (default: Kyiv-UA)
 *   PROXY_TYPE      - datacenter or residential (default: residential)
 */

const https = require('https');
const http = require('http');
const os = require('os');

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// --- Config ---
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);
const LOCAL_IP = process.env.LOCAL_IP || '';
const WORKER_ID = process.env.WORKER_ID || `local-${os.hostname()}-${process.pid}`;
const BACKEND_URL = process.env.BACKEND_URL || '';
const API_KEY = process.env.API_KEY || '';
const WORKER_REGION = process.env.WORKER_REGION || 'Kyiv-UA';
const PROXY_TYPE = process.env.PROXY_TYPE || 'residential';

const BASE_URL = 'https://reyestr.court.gov.ua/Review/';

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

// --- Stats ---
const stats = {
  received: 0,
  downloaded: 0,
  uploaded: 0,
  errors: 0,
  captchas: 0,
  rateLimited: 0,
  startTime: Date.now(),
};

let shuttingDown = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function jitter(min, max) { return min + Math.random() * (max - min); }

function log(msg) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  console.log(`[${WORKER_ID}][${elapsed}s] ${msg}`);
}

function logStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.uploaded / Math.max(elapsed, 1);
  const eta = stats.uploaded > 0
    ? ((333367 - stats.uploaded) / rate / 3600).toFixed(1) + 'h'
    : '?';
  log(`Stats: recv=${stats.received} dl=${stats.downloaded} up=${stats.uploaded} err=${stats.errors} captcha=${stats.captchas} rate=${rate.toFixed(3)}/s ETA=${eta}`);
}

// --- Content detection ---
// The court registry embeds the full decision HTML inside <textarea id="txtdepository">.
// Every page includes "captcha" in its JS/CSS — that's normal, not a block.
// A page WITH a decision has txtdepository with content (>100 chars inside).
// A page WITHOUT a decision (blocked/restricted) has no txtdepository or it's empty.
function hasDecisionContent(html) {
  const match = html.match(/<textarea id="txtdepository">([\s\S]*?)<\/textarea>/);
  if (!match) return false;
  return match[1].trim().length > 100;
}

function isActuallyCaptchaBlocked(html) {
  // If page is tiny (<2KB) and has captcha keywords, it's a real captcha block
  if (html.length < 2000 && /captcha/i.test(html)) return true;
  return false;
}

// --- HTTP fetch bound to local IP ---
function fetchHTML(registryId, retries = 3) {
  return new Promise((resolve) => {
    let attempt = 0;

    function tryFetch() {
      attempt++;
      const url = `${BASE_URL}${registryId}`;

      const fetchOpts = {
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.5',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
        },
        timeout: 30000,
      };
      if (LOCAL_IP) fetchOpts.localAddress = LOCAL_IP;

      const req = https.get(url, fetchOpts, (res) => {
        if (res.statusCode === 429) {
          stats.rateLimited++;
          if (attempt < retries) {
            log(`429 on ${registryId}, waiting 60s (${attempt}/${retries})`);
            setTimeout(tryFetch, 60000 + jitter(0, 10000));
            res.resume();
            return;
          }
          res.resume();
          resolve(null);
          return;
        }

        if (res.statusCode === 404) {
          res.resume();
          resolve('__404__');
          return;
        }

        if (res.statusCode >= 500) {
          res.resume();
          if (attempt < retries) {
            const backoff = 10000 * attempt + jitter(0, 5000);
            log(`${res.statusCode} on ${registryId}, retry in ${(backoff/1000).toFixed(0)}s`);
            setTimeout(tryFetch, backoff);
            return;
          }
          resolve(null);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          if (attempt < retries) {
            setTimeout(tryFetch, 5000);
            return;
          }
          resolve(null);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8');

          if (isActuallyCaptchaBlocked(html)) {
            stats.captchas++;
            if (attempt < retries) {
              log(`CAPTCHA block on ${registryId}, pausing 120s (${attempt}/${retries})`);
              setTimeout(tryFetch, 120000 + jitter(0, 30000));
              return;
            }
            resolve(null);
            return;
          }

          if (/Сервер перевантажений/i.test(html)) {
            if (attempt < retries) {
              setTimeout(tryFetch, 15000 + jitter(0, 10000));
              return;
            }
            resolve(null);
            return;
          }

          // Check for actual decision content in txtdepository
          if (!hasDecisionContent(html)) {
            // Page loaded but no decision text — restricted access or empty doc
            if (attempt < retries) {
              log(`No content for ${registryId} (${html.length}B), retry ${attempt}/${retries}`);
              setTimeout(tryFetch, 10000 + jitter(0, 5000));
              return;
            }
            resolve(null);
            return;
          }

          // Extract just the txtdepository content (decision HTML)
          const match = html.match(/<textarea id="txtdepository">([\s\S]*?)<\/textarea>/);
          resolve(match ? match[1].trim() : html);
        });
        res.on('error', () => {
          if (attempt < retries) setTimeout(tryFetch, 5000 * attempt);
          else resolve(null);
        });
      });

      req.on('error', (err) => {
        if (attempt < retries) {
          log(`Network error on ${registryId}: ${err.code}, retry ${attempt}/${retries}`);
          setTimeout(tryFetch, 5000 * attempt);
        } else resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt < retries) setTimeout(tryFetch, 5000 * attempt);
        else resolve(null);
      });
    }

    tryFetch();
  });
}

// --- Worker loop ---
async function workerLoop(sqs, s3, id) {
  log(`Worker ${id} started`);

  while (!shuttingDown) {
    let messages;
    try {
      const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 600,
      }));
      messages = resp.Messages || [];
    } catch (err) {
      log(`SQS error: ${err.message}`);
      await sleep(10000);
      continue;
    }

    if (messages.length === 0) continue;

    for (const msg of messages) {
      if (shuttingDown) break;

      const registryId = msg.Body.trim();
      stats.received++;

      // Slow: 3-6s between requests per worker
      await sleep(3000 + jitter(0, 3000));

      const html = await fetchHTML(registryId);

      if (html === '__404__') {
        // Not found — delete from queue, skip
        try {
          await sqs.send(new DeleteMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
          }));
        } catch {}
        continue;
      }

      if (!html) {
        stats.errors++;
        try {
          await sqs.send(new ChangeMessageVisibilityCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
            VisibilityTimeout: 600,
          }));
        } catch {}
        continue;
      }

      stats.downloaded++;

      // Upload to S3
      try {
        await s3.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `raw/${registryId}.html`,
          Body: html,
          ContentType: 'text/html; charset=utf-8',
          Metadata: {
            'registry-id': registryId,
            'worker-id': WORKER_ID,
            'scraped-at': new Date().toISOString(),
          },
        }));
        stats.uploaded++;
      } catch (err) {
        log(`S3 error for ${registryId}: ${err.message}`);
        stats.errors++;
        continue;
      }

      // Delete from SQS
      try {
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle,
        }));
      } catch (err) {
        log(`SQS delete error: ${err.message}`);
      }

      if (stats.uploaded % 50 === 0) logStats();
    }
  }
}

// --- Heartbeat to backend ---
let workerStatus = 'starting';

function sendHeartbeat() {
  if (!BACKEND_URL || !API_KEY) return;

  const payload = JSON.stringify({
    worker_id: WORKER_ID,
    ip: LOCAL_IP,
    received: stats.received,
    downloaded: stats.downloaded,
    uploaded: stats.uploaded,
    errors: stats.errors,
    captchas: stats.captchas,
    rate_limited: stats.rateLimited,
    uptime_s: Math.round((Date.now() - stats.startTime) / 1000),
    region: WORKER_REGION,
    proxy_type: PROXY_TYPE,
    status: workerStatus,
  });

  const url = new URL('/api/workers/heartbeat', BACKEND_URL);
  const mod = url.protocol === 'https:' ? https : http;

  const req = mod.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 5000,
  }, (res) => { res.resume(); });
  req.on('error', () => { /* silent */ });
  req.on('timeout', () => { req.destroy(); });
  req.write(payload);
  req.end();
}

// --- Health check ---
function startHealthCheck() {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', worker: WORKER_ID, stats, uptime: (Date.now() - stats.startTime) / 1000 }));
  });
  srv.listen(8081, '0.0.0.0', () => log('Health on :8081'));
  srv.on('error', () => { /* ignore if port busy */ });
}

// --- Main ---
async function main() {
  if (!SQS_QUEUE_URL || !S3_BUCKET) {
    console.error('Missing: SQS_QUEUE_URL, S3_BUCKET');
    process.exit(1);
  }

  log('=== Local Slow Scraper Starting ===');
  log(`  Queue:       ${SQS_QUEUE_URL}`);
  log(`  Bucket:      ${S3_BUCKET}`);
  log(`  Region:      ${REGION}`);
  log(`  Concurrency: ${CONCURRENCY}`);
  log(`  Local IP:    ${LOCAL_IP}`);
  log(`  Region:      ${WORKER_REGION}`);
  log(`  Proxy type:  ${PROXY_TYPE}`);
  log(`  Heartbeat:   ${BACKEND_URL ? BACKEND_URL + '/api/workers/heartbeat' : 'disabled'}`);

  const sqs = new SQSClient({ region: REGION });
  const s3 = new S3Client({ region: REGION });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down...');
    logStats();
    setTimeout(() => process.exit(0), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startHealthCheck();

  // Start heartbeat reporting
  sendHeartbeat();
  const heartbeatInterval = setInterval(sendHeartbeat, 10000);

  workerStatus = 'scraping';
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(workerLoop(sqs, s3, i));
  }

  setInterval(() => { if (!shuttingDown) logStats(); }, 60000);
  await Promise.all(workers);

  workerStatus = 'idle';
  sendHeartbeat();
  clearInterval(heartbeatInterval);

  log('=== Done ===');
  logStats();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
