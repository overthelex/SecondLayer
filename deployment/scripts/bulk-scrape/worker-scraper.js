#!/usr/bin/env node
/**
 * SQS → S3 Court Decision Scraper Worker
 *
 * Polls SQS for registry IDs, fetches HTML from reyestr.court.gov.ua,
 * and writes raw HTML to S3. Designed to run on EC2 Spot instances.
 *
 * Plain JS — no build step required.
 *
 * Env vars:
 *   SQS_QUEUE_URL        - SQS queue URL (required)
 *   S3_BUCKET            - S3 bucket name (required)
 *   AWS_REGION           - AWS region (default: eu-central-1)
 *   CONCURRENCY          - Parallel downloads per instance (default: 5)
 *   RATE_LIMIT_RPS       - Requests per second per instance (default: 2)
 *   WORKER_ID            - Unique worker identifier (default: hostname)
 */

const https = require('https');
const http = require('http');
const os = require('os');

// Lazy-load AWS SDK (installed via userdata)
let SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand, GetQueueAttributesCommand;
let S3Client, PutObjectCommand;

function loadAWS() {
  const sqs = require('@aws-sdk/client-sqs');
  SQSClient = sqs.SQSClient;
  ReceiveMessageCommand = sqs.ReceiveMessageCommand;
  DeleteMessageCommand = sqs.DeleteMessageCommand;
  ChangeMessageVisibilityCommand = sqs.ChangeMessageVisibilityCommand;
  GetQueueAttributesCommand = sqs.GetQueueAttributesCommand;

  const s3 = require('@aws-sdk/client-s3');
  S3Client = s3.S3Client;
  PutObjectCommand = s3.PutObjectCommand;
}

// --- Config ---
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const RATE_LIMIT_RPS = parseFloat(process.env.RATE_LIMIT_RPS || '2');
const WORKER_ID = process.env.WORKER_ID || os.hostname();

const BASE_URL = 'https://reyestr.court.gov.ua/Review/';

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
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

// --- Helpers ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomJitter(minMs, maxMs) {
  return minMs + Math.random() * (maxMs - minMs);
}

function log(msg) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  console.log(`[${WORKER_ID}][${elapsed}s] ${msg}`);
}

function logStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.uploaded / Math.max(elapsed, 1);
  log(`Stats: recv=${stats.received} dl=${stats.downloaded} up=${stats.uploaded} err=${stats.errors} captcha=${stats.captchas} rate=${rate.toFixed(2)}/s`);
}

// --- HTTP fetch with retries ---
function fetchHTML(registryId, retries = 3) {
  return new Promise((resolve) => {
    let attempt = 0;

    function tryFetch() {
      attempt++;
      const url = `${BASE_URL}${registryId}`;

      const req = https.get(url, {
        headers: {
          'User-Agent': randomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'uk-UA,uk;q=0.9',
          'Accept-Encoding': 'identity',
        },
        timeout: 30000,
      }, (res) => {
        if (res.statusCode === 429) {
          stats.rateLimited++;
          if (attempt < retries) {
            log(`429 rate limited on ${registryId}, retrying in 30s (${attempt}/${retries})`);
            setTimeout(tryFetch, 30000);
            res.resume();
            return;
          }
          res.resume();
          resolve(null);
          return;
        }

        if (res.statusCode === 404) {
          res.resume();
          resolve(null);
          return;
        }

        if (res.statusCode >= 300 && res.statusCode < 400) {
          // Follow redirect
          const location = res.headers.location;
          res.resume();
          if (location && attempt < retries) {
            setTimeout(tryFetch, 1000);
            return;
          }
          resolve(null);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          if (attempt < retries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 15000);
            setTimeout(tryFetch, backoff);
            return;
          }
          resolve(null);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8');

          // CAPTCHA detection
          if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('recaptcha')) {
            stats.captchas++;
            if (attempt < retries) {
              log(`CAPTCHA on ${registryId}, pausing 60s (${attempt}/${retries})`);
              setTimeout(tryFetch, 60000);
              return;
            }
            resolve(null);
            return;
          }

          // Server overload page
          if (/Сервер перевантажений/i.test(html) || html.length < 500) {
            if (attempt < retries) {
              const backoff = 5000 + Math.random() * 5000;
              setTimeout(tryFetch, backoff);
              return;
            }
            resolve(null);
            return;
          }

          resolve(html);
        });
        res.on('error', () => {
          if (attempt < retries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 15000);
            setTimeout(tryFetch, backoff);
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        if (attempt < retries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 15000);
          setTimeout(tryFetch, backoff);
        } else {
          resolve(null);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempt < retries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 15000);
          setTimeout(tryFetch, backoff);
        } else {
          resolve(null);
        }
      });
    }

    tryFetch();
  });
}

// --- Main worker loop ---
async function workerLoop(sqs, s3, workerId) {
  const minDelayMs = 1000 / RATE_LIMIT_RPS;

  while (!shuttingDown) {
    let messages;
    try {
      const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 300,
      }));
      messages = resp.Messages || [];
    } catch (err) {
      log(`SQS receive error: ${err.message}`);
      await sleep(5000);
      continue;
    }

    if (messages.length === 0) {
      continue; // Long poll returned empty — queue might be done
    }

    for (const msg of messages) {
      if (shuttingDown) break;

      const registryId = msg.Body.trim();
      stats.received++;

      // Rate limit with jitter
      await sleep(minDelayMs + randomJitter(0, 2000));

      // Fetch HTML
      const html = await fetchHTML(registryId);
      if (!html) {
        stats.errors++;
        // Don't delete — let DLQ handle after 3 receives
        // But extend visibility to avoid immediate re-processing
        try {
          await sqs.send(new ChangeMessageVisibilityCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
            VisibilityTimeout: 300,
          }));
        } catch { /* ignore */ }
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
        log(`S3 upload error for ${registryId}: ${err.message}`);
        stats.errors++;
        continue;
      }

      // Delete from SQS on success
      try {
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle,
        }));
      } catch (err) {
        log(`SQS delete error for ${registryId}: ${err.message}`);
      }

      // Log progress periodically
      if (stats.uploaded % 100 === 0) {
        logStats();
      }
    }
  }
}

// --- Health check server ---
function startHealthCheck() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        worker: WORKER_ID,
        stats,
        uptime: (Date.now() - stats.startTime) / 1000,
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(8080, () => log('Health check on :8080'));
  return server;
}

// --- Main ---
async function main() {
  if (!SQS_QUEUE_URL || !S3_BUCKET) {
    console.error('Missing required env vars: SQS_QUEUE_URL, S3_BUCKET');
    process.exit(1);
  }

  loadAWS();

  log('=== Bulk Scrape Worker Starting ===');
  log(`  Queue:       ${SQS_QUEUE_URL}`);
  log(`  Bucket:      ${S3_BUCKET}`);
  log(`  Region:      ${REGION}`);
  log(`  Concurrency: ${CONCURRENCY}`);
  log(`  Rate limit:  ${RATE_LIMIT_RPS} req/s`);

  const sqs = new SQSClient({ region: REGION });
  const s3 = new S3Client({ region: REGION });

  // Graceful shutdown
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down gracefully...');
    logStats();
    setTimeout(() => process.exit(0), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start health check
  startHealthCheck();

  // Launch concurrent worker loops
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(workerLoop(sqs, s3, `${WORKER_ID}-${i}`));
  }

  // Stats logger
  const statsInterval = setInterval(() => {
    if (!shuttingDown) logStats();
  }, 60000);

  await Promise.all(workers);
  clearInterval(statsInterval);

  log('=== Worker Complete ===');
  logStats();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
