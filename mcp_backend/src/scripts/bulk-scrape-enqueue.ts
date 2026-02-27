/**
 * Bulk Scrape Enqueue: PG → SQS
 *
 * Reads documents with null full_text from PostgreSQL and enqueues their
 * registry IDs into SQS for distributed downloading by EC2 spot workers.
 *
 * Env vars:
 *   SQS_QUEUE_URL    - SQS queue URL (required)
 *   AWS_REGION       - AWS region (default: eu-central-1)
 *   BATCH_SIZE       - SQS SendMessageBatch size (default: 10, max 10)
 *   DRY_RUN          - If "true", count only, don't enqueue (default: false)
 *   LIMIT            - Max docs to enqueue, 0 = unlimited (default: 0)
 */

import { SQSClient, SendMessageBatchCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { Database } from '../database/database.js';
import { logger } from '../utils/logger.js';

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const BATCH_SIZE = Math.min(parseInt(process.env.BATCH_SIZE || '10', 10), 10);
const DRY_RUN = process.env.DRY_RUN === 'true';
const LIMIT = parseInt(process.env.LIMIT || '0', 10);

async function main(): Promise<void> {
  if (!SQS_QUEUE_URL && !DRY_RUN) {
    logger.error('SQS_QUEUE_URL is required (or set DRY_RUN=true)');
    process.exit(1);
  }

  logger.info('=== Bulk Scrape Enqueue: PG → SQS ===');
  logger.info(`  Queue:      ${SQS_QUEUE_URL || '(dry run)'}`);
  logger.info(`  Region:     ${REGION}`);
  logger.info(`  Batch size: ${BATCH_SIZE}`);
  logger.info(`  Dry run:    ${DRY_RUN}`);
  logger.info(`  Limit:      ${LIMIT || 'unlimited'}`);

  const db = new Database();
  const sqs = SQS_QUEUE_URL ? new SQSClient({ region: REGION }) : null;

  try {
    // Count total documents needing download
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM documents
       WHERE full_text IS NULL
         AND type = 'court_decision'`
    );
    const totalAvailable = parseInt(countResult.rows[0].total, 10);
    logger.info(`  Documents needing download: ${totalAvailable}`);

    if (totalAvailable === 0) {
      logger.info('Nothing to enqueue.');
      return;
    }

    // Record job in bulk_scrape_jobs
    const jobId = `enqueue-${Date.now()}`;
    await db.query(
      `INSERT INTO bulk_scrape_jobs (job_id, phase, status, total_docs, started_at)
       VALUES ($1, 'enqueue', 'running', $2, NOW())`,
      [jobId, totalAvailable]
    );

    // Stream documents in chunks to avoid loading 1.6M rows into memory
    const chunkSize = 10000;
    let offset = 0;
    let enqueued = 0;
    let errors = 0;

    while (true) {
      if (LIMIT > 0 && enqueued >= LIMIT) break;

      const effectiveLimit = LIMIT > 0
        ? Math.min(chunkSize, LIMIT - enqueued)
        : chunkSize;

      const result = await db.query(
        `SELECT zakononline_id FROM documents
         WHERE full_text IS NULL
           AND type = 'court_decision'
         ORDER BY zakononline_id
         OFFSET $1 LIMIT $2`,
        [offset, effectiveLimit]
      );

      if (result.rows.length === 0) break;

      // Extract registry IDs (strip 'court_' prefix if present, use as-is otherwise)
      const registryIds: string[] = result.rows.map(
        (r: { zakononline_id: string }) => r.zakononline_id.replace(/^court_/, '')
      );

      if (DRY_RUN) {
        enqueued += registryIds.length;
        offset += chunkSize;
        if (enqueued % 50000 === 0) {
          logger.info(`  [DRY_RUN] Counted ${enqueued} so far...`);
        }
        continue;
      }

      // Send in batches of BATCH_SIZE (max 10 for SQS)
      for (let i = 0; i < registryIds.length; i += BATCH_SIZE) {
        const batch = registryIds.slice(i, i + BATCH_SIZE);
        const entries = batch.map((id, idx) => ({
          Id: String(idx),
          MessageBody: id,
        }));

        try {
          const resp = await sqs!.send(new SendMessageBatchCommand({
            QueueUrl: SQS_QUEUE_URL!,
            Entries: entries,
          }));

          enqueued += (resp.Successful?.length || 0);
          errors += (resp.Failed?.length || 0);

          if (resp.Failed && resp.Failed.length > 0) {
            for (const f of resp.Failed) {
              logger.warn(`  SQS batch send failure: ${f.Code} ${f.Message}`);
            }
          }
        } catch (err: any) {
          logger.error(`SQS batch error: ${err.message}`);
          errors += batch.length;
        }
      }

      offset += chunkSize;

      if (enqueued % 50000 === 0) {
        logger.info(`  Enqueued ${enqueued} / ${totalAvailable} (${((enqueued / totalAvailable) * 100).toFixed(1)}%)`);
      }
    }

    // Check queue depth
    if (sqs) {
      try {
        const attrs = await sqs.send(new GetQueueAttributesCommand({
          QueueUrl: SQS_QUEUE_URL!,
          AttributeNames: ['ApproximateNumberOfMessages'],
        }));
        logger.info(`  Queue depth: ~${attrs.Attributes?.ApproximateNumberOfMessages || 'unknown'}`);
      } catch { /* ignore */ }
    }

    // Update job record
    await db.query(
      `UPDATE bulk_scrape_jobs
       SET status = 'completed',
           processed_docs = $1,
           failed_docs = $2,
           completed_at = NOW()
       WHERE job_id = $3`,
      [enqueued, errors, jobId]
    );

    logger.info('');
    logger.info('=== Enqueue Complete ===');
    logger.info(`  Enqueued: ${enqueued}`);
    logger.info(`  Errors:   ${errors}`);
    logger.info(`  Dry run:  ${DRY_RUN}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
