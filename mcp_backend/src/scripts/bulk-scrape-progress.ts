/**
 * Bulk Scrape Progress Monitor
 *
 * Polls SQS queue depth, S3 object count, and PG document stats.
 * Displays a live dashboard of the distributed scraping pipeline.
 *
 * Env vars:
 *   SQS_QUEUE_URL    - SQS queue URL (optional — skips SQS stats if missing)
 *   S3_BUCKET        - S3 bucket name (optional — skips S3 stats if missing)
 *   AWS_REGION       - AWS region (default: eu-central-1)
 *   POLL_INTERVAL    - Seconds between updates (default: 30)
 *   ONCE             - If "true", print once and exit (default: false)
 */

import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Database } from '../database/database.js';
import { logger } from '../utils/logger.js';

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const SQS_DLQ_URL = process.env.SQS_DLQ_URL;
const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30', 10);
const ONCE = process.env.ONCE === 'true';

interface ProgressSnapshot {
  timestamp: string;
  sqs?: {
    queueDepth: number;
    inFlight: number;
    dlqDepth: number;
  };
  s3?: {
    rawCount: number;
  };
  pg: {
    totalCourt: number;
    withFullText: number;
    withSections: number;
    withoutFullText: number;
  };
  jobs: Array<{
    job_id: string;
    phase: string;
    status: string;
    processed_docs: number;
    total_docs: number;
    failed_docs: number;
  }>;
}

async function getProgress(
  sqs: SQSClient | null,
  s3: S3Client | null,
  db: Database
): Promise<ProgressSnapshot> {
  const snapshot: ProgressSnapshot = {
    timestamp: new Date().toISOString(),
    pg: { totalCourt: 0, withFullText: 0, withSections: 0, withoutFullText: 0 },
    jobs: [],
  };

  // SQS stats
  if (sqs && SQS_QUEUE_URL) {
    try {
      const attrs = await sqs.send(new GetQueueAttributesCommand({
        QueueUrl: SQS_QUEUE_URL,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      }));
      const queueDepth = parseInt(attrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
      const inFlight = parseInt(attrs.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10);

      let dlqDepth = 0;
      if (SQS_DLQ_URL) {
        const dlqAttrs = await sqs.send(new GetQueueAttributesCommand({
          QueueUrl: SQS_DLQ_URL,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }));
        dlqDepth = parseInt(dlqAttrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
      }

      snapshot.sqs = { queueDepth, inFlight, dlqDepth };
    } catch (err: any) {
      logger.warn(`SQS stats error: ${err.message}`);
    }
  }

  // S3 stats (count objects in raw/ prefix)
  if (s3 && S3_BUCKET) {
    try {
      let rawCount = 0;
      let token: string | undefined;
      // Use a few pages to estimate, not full listing for 1.6M objects
      for (let page = 0; page < 5; page++) {
        const resp = await s3.send(new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: 'raw/',
          MaxKeys: 1000,
          ContinuationToken: token,
        }));
        rawCount += (resp.Contents?.length || 0);
        token = resp.NextContinuationToken;
        if (!token) break;
      }
      // If we hit 5 pages (5000 objects), estimate total
      if (rawCount === 5000) {
        // Use S3 inventory or just note it's 5000+
        snapshot.s3 = { rawCount: -1 }; // -1 = "5000+ (counting...)"
      } else {
        snapshot.s3 = { rawCount };
      }
    } catch (err: any) {
      logger.warn(`S3 stats error: ${err.message}`);
    }
  }

  // PG stats
  try {
    const pgStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%') as total_court,
        COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%' AND full_text IS NOT NULL AND length(full_text) > 100) as with_full_text,
        COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%' AND full_text IS NULL) as without_full_text
      FROM documents
    `);
    const row = pgStats.rows[0];
    snapshot.pg.totalCourt = parseInt(row.total_court, 10);
    snapshot.pg.withFullText = parseInt(row.with_full_text, 10);
    snapshot.pg.withoutFullText = parseInt(row.without_full_text, 10);

    // Section count
    const sectionStats = await db.query(`
      SELECT COUNT(DISTINCT document_id) as with_sections
      FROM document_sections ds
      JOIN documents d ON d.id = ds.document_id
      WHERE d.zakononline_id LIKE 'court_%'
    `);
    snapshot.pg.withSections = parseInt(sectionStats.rows[0].with_sections, 10);
  } catch (err: any) {
    logger.warn(`PG stats error: ${err.message}`);
  }

  // Active jobs
  try {
    const jobs = await db.query(
      `SELECT job_id, phase, status, processed_docs, total_docs, failed_docs
       FROM bulk_scrape_jobs
       ORDER BY created_at DESC
       LIMIT 10`
    );
    snapshot.jobs = jobs.rows;
  } catch { /* table may not exist */ }

  return snapshot;
}

function printProgress(p: ProgressSnapshot): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Bulk Scrape Progress — ${p.timestamp}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (p.sqs) {
    console.log(`\n  SQS Queue:`);
    console.log(`    Pending:    ${p.sqs.queueDepth.toLocaleString()}`);
    console.log(`    In-flight:  ${p.sqs.inFlight.toLocaleString()}`);
    console.log(`    DLQ:        ${p.sqs.dlqDepth.toLocaleString()}`);
  }

  if (p.s3) {
    const rawDisplay = p.s3.rawCount === -1 ? '5,000+ (counting...)' : p.s3.rawCount.toLocaleString();
    console.log(`\n  S3 Raw Files: ${rawDisplay}`);
  }

  console.log(`\n  PostgreSQL:`);
  console.log(`    Total court docs:    ${p.pg.totalCourt.toLocaleString()}`);
  console.log(`    With full text:      ${p.pg.withFullText.toLocaleString()}`);
  console.log(`    Without full text:   ${p.pg.withoutFullText.toLocaleString()}`);
  console.log(`    With sections:       ${p.pg.withSections.toLocaleString()}`);

  const pct = p.pg.totalCourt > 0
    ? ((p.pg.withFullText / p.pg.totalCourt) * 100).toFixed(1)
    : '0.0';
  console.log(`    Completion:          ${pct}%`);

  if (p.jobs.length > 0) {
    console.log(`\n  Recent Jobs:`);
    for (const j of p.jobs) {
      console.log(`    [${j.phase}] ${j.status} — ${j.processed_docs}/${j.total_docs} (${j.failed_docs} failed) — ${j.job_id}`);
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
}

async function main(): Promise<void> {
  const sqs = SQS_QUEUE_URL ? new SQSClient({ region: REGION }) : null;
  const s3 = S3_BUCKET ? new S3Client({ region: REGION }) : null;
  const db = new Database();

  try {
    if (ONCE) {
      const progress = await getProgress(sqs, s3, db);
      printProgress(progress);
      return;
    }

    logger.info(`Monitoring every ${POLL_INTERVAL}s. Press Ctrl+C to stop.`);

    let running = true;
    process.on('SIGINT', () => { running = false; });
    process.on('SIGTERM', () => { running = false; });

    while (running) {
      const progress = await getProgress(sqs, s3, db);
      printProgress(progress);

      // Check if download phase is complete
      if (progress.sqs && progress.sqs.queueDepth === 0 && progress.sqs.inFlight === 0) {
        console.log('\n  ** SQS queue is empty — download phase may be complete **');
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 1000));
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
