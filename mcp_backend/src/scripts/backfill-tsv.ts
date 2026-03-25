/**
 * backfill-tsv.ts — Populate edrsr_fulltext.tsv column using all available CPU cores.
 *
 * Strategy: Range-based parallel UPDATE.
 *  1. Get min/max doc_id
 *  2. Split into N ranges (one per worker)
 *  3. Each worker UPDATEs its range in batches — no locking contention
 *  4. Optionally create GIN index after all workers finish
 *
 * Usage:
 *   WORKERS=14 BATCH_SIZE=5000 DATABASE_URL=postgres://... npx tsx src/scripts/backfill-tsv.ts
 *
 * Env vars:
 *   DATABASE_URL     — Direct PG connection (NOT through PgBouncer!)
 *   WORKERS          — Number of parallel workers (default: 14)
 *   BATCH_SIZE       — Rows per UPDATE batch (default: 5000)
 *   DRY_RUN          — If "true", only show progress without modifying (default: false)
 *   SKIP_DROP_INDEX  — If "true", skip dropping/recreating GIN index (default: false)
 *   CREATE_INDEX_ONLY — If "true", only create the GIN index (default: false)
 */

import { Pool } from 'pg';
import type { Pool as PoolType } from 'pg';

// ─── Config ────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const WORKERS = parseInt(process.env.WORKERS || '14', 10);
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.BATCH_SIZE || '5000', 10), 100), 50000);
const DRY_RUN = process.env.DRY_RUN === 'true';
const SKIP_DROP_INDEX = process.env.SKIP_DROP_INDEX === 'true';
const CREATE_INDEX_ONLY = process.env.CREATE_INDEX_ONLY === 'true';
const INDEX_NAME = 'idx_edrsr_fulltext_tsv';
const TABLE = 'edrsr_fulltext';
const PROGRESS_INTERVAL_MS = 30_000; // log progress every 30s (COUNT is slow on 60M rows)

// ─── State ─────────────────────────────────────────────────────────────────
let totalIndexed = 0;
let workersActive = 0;
let startTime = 0;
let allDone = false;
let totalRemaining = 0;

function log(msg: string) {
  const elapsed = startTime ? ((Date.now() - startTime) / 1000).toFixed(0) : '0';
  console.log(`[${new Date().toISOString()}] [${elapsed}s] ${msg}`);
}

function formatRate(count: number, elapsedMs: number): string {
  if (elapsedMs <= 0) return '0';
  return (count / (elapsedMs / 1000)).toFixed(0);
}

function formatEta(remaining: number, ratePerSec: number): string {
  if (ratePerSec <= 0) return '∞';
  const seconds = remaining / ratePerSec;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Pool factory (direct PG, not PgBouncer) ──────────────────────────────
function createPool(): PoolType {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required (direct PG connection, NOT PgBouncer)');
  }
  return new Pool({
    connectionString: DATABASE_URL,
    max: WORKERS + 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 0,
  } as any);
}

// ─── Check if GIN index exists ─────────────────────────────────────────────
async function indexExists(pool: PoolType): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
    [INDEX_NAME]
  );
  return result.rowCount! > 0;
}

// ─── Drop GIN index ───────────────────────────────────────────────────────
async function dropIndex(pool: PoolType): Promise<void> {
  if (!(await indexExists(pool))) {
    log(`Index ${INDEX_NAME} does not exist, skipping drop`);
    return;
  }
  log(`Dropping GIN index ${INDEX_NAME}...`);
  await pool.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  log(`Index dropped`);
}

// ─── Create GIN index with parallel workers ────────────────────────────────
async function createIndex(pool: PoolType): Promise<void> {
  if (await indexExists(pool)) {
    log(`Index ${INDEX_NAME} already exists, skipping create`);
    return;
  }
  log(`Creating GIN index ${INDEX_NAME} with max_parallel_maintenance_workers...`);
  const indexStart = Date.now();

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = 0`);
    await client.query(`SET max_parallel_maintenance_workers = 8`);
    await client.query(`SET maintenance_work_mem = '4GB'`);
    await client.query(`CREATE INDEX ${INDEX_NAME} ON ${TABLE} USING gin(tsv)`);
  } finally {
    client.release();
  }

  const elapsed = ((Date.now() - indexStart) / 1000 / 60).toFixed(1);
  log(`Index created in ${elapsed} minutes`);
}

// ─── Range-based worker ────────────────────────────────────────────────────
async function worker(id: number, pool: PoolType, rangeStart: number, rangeEnd: number): Promise<number> {
  let workerTotal = 0;
  workersActive++;
  let offset = rangeStart;

  log(`Worker ${id}: doc_id range [${rangeStart}, ${rangeEnd}]`);

  try {
    const client = await pool.connect();
    try {
      await client.query(`SET statement_timeout = 0`);
      await client.query(`SET synchronous_commit = off`);

      while (offset < rangeEnd) {
        const batchEnd = Math.min(offset + BATCH_SIZE, rangeEnd);
        try {
          const result = await client.query(`
            UPDATE ${TABLE}
            SET tsv = to_tsvector('simple', LEFT(full_text, 500000))
            WHERE doc_id >= $1 AND doc_id < $2
              AND tsv IS NULL AND full_text IS NOT NULL
          `, [offset, batchEnd]);

          const count = result.rowCount || 0;
          workerTotal += count;
          totalIndexed += count;
        } catch (err: any) {
          log(`Worker ${id} error at offset ${offset}: ${err.message}`);
          // Continue to next batch instead of dying
        }
        offset = batchEnd;
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    log(`Worker ${id} fatal error: ${err.message}`);
  } finally {
    workersActive--;
  }

  log(`Worker ${id} done: ${workerTotal.toLocaleString()} rows indexed`);
  return workerTotal;
}

// ─── Progress reporter (uses in-memory counter, no slow COUNT) ─────────────
async function progressReporter(): Promise<void> {
  while (!allDone) {
    await new Promise(resolve => setTimeout(resolve, PROGRESS_INTERVAL_MS));
    if (allDone) break;

    const elapsedMs = Date.now() - startTime;
    const ratePerSec = totalIndexed / (elapsedMs / 1000);
    const remaining = totalRemaining - totalIndexed;
    const pct = totalRemaining > 0 ? ((totalIndexed / totalRemaining) * 100).toFixed(2) : '0';
    const eta = formatEta(remaining > 0 ? remaining : 0, ratePerSec);

    log(
      `Progress: ${totalIndexed.toLocaleString()} / ${totalRemaining.toLocaleString()} (${pct}%) | ` +
      `Rate: ${formatRate(totalIndexed, elapsedMs)} rows/sec | ` +
      `ETA: ${eta} | Workers: ${workersActive}/${WORKERS}`
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('=== EDRSR TSV Backfill (range-based) ===');
  log(`Workers: ${WORKERS} | Batch size: ${BATCH_SIZE} | Dry run: ${DRY_RUN}`);

  const pool = createPool();

  try {
    // Create index only mode
    if (CREATE_INDEX_ONLY) {
      await createIndex(pool);
      return;
    }

    // 1. Get doc_id range
    const rangeResult = await pool.query(`SELECT MIN(doc_id)::bigint AS min_id, MAX(doc_id)::bigint AS max_id FROM ${TABLE}`);
    const minId = Number(rangeResult.rows[0].min_id);
    const maxId = Number(rangeResult.rows[0].max_id);
    log(`Doc ID range: ${minId} to ${maxId} (span: ${(maxId - minId).toLocaleString()})`);

    // 2. Quick estimate of remaining (sample-based, not full COUNT)
    const estResult = await pool.query(`
      SELECT reltuples::bigint AS est_total FROM pg_class WHERE relname = '${TABLE}'
    `);
    const estTotal = Number(estResult.rows[0]?.est_total || 60000000);
    log(`Estimated total rows (pg_class): ${estTotal.toLocaleString()}`);

    if (DRY_RUN) {
      log('DRY_RUN=true — exiting without changes');
      return;
    }

    // 3. Drop GIN index (if not skipped)
    if (!SKIP_DROP_INDEX) {
      await dropIndex(pool);
    }

    // 4. Split range into worker chunks
    const rangeSpan = maxId - minId + 1;
    const chunkSize = Math.ceil(rangeSpan / WORKERS);
    totalRemaining = estTotal; // rough estimate for ETA

    // 5. Launch workers
    startTime = Date.now();
    log(`Launching ${WORKERS} workers with chunk size ~${chunkSize.toLocaleString()} doc_ids each...`);

    const progressPromise = progressReporter();
    const workerPromises = Array.from({ length: WORKERS }, (_, i) => {
      const rangeStart = minId + i * chunkSize;
      const rangeEnd = Math.min(minId + (i + 1) * chunkSize, maxId + 1);
      return worker(i, pool, rangeStart, rangeEnd);
    });

    const results = await Promise.all(workerPromises);
    allDone = true;
    await progressPromise;

    const elapsedMs = Date.now() - startTime;
    const totalDone = results.reduce((a, b) => a + b, 0);
    log(`All workers done. Total indexed: ${totalDone.toLocaleString()} in ${(elapsedMs / 1000 / 60).toFixed(1)} minutes`);
    log(`Average rate: ${formatRate(totalDone, elapsedMs)} rows/sec`);

    // 6. Recreate GIN index
    if (!SKIP_DROP_INDEX) {
      await createIndex(pool);
    }

    // 7. VACUUM ANALYZE
    log('Running VACUUM ANALYZE...');
    const vacStart = Date.now();
    const vacClient = await pool.connect();
    try {
      await vacClient.query(`SET statement_timeout = 0`);
      await vacClient.query(`VACUUM ANALYZE ${TABLE}`);
    } finally {
      vacClient.release();
    }
    log(`VACUUM ANALYZE done in ${((Date.now() - vacStart) / 1000 / 60).toFixed(1)} minutes`);

    log('=== Done ===');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
