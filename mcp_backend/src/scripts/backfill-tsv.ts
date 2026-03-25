/**
 * backfill-tsv.ts — Populate edrsr_fulltext.tsv column using all available CPU cores.
 *
 * Strategy (hybrid Plan A+B):
 *  1. DROP the GIN index (eliminates index maintenance overhead during UPDATE)
 *  2. Run N parallel workers, each doing batch UPDATEs with FOR UPDATE SKIP LOCKED
 *  3. Recreate GIN index with max parallel workers
 *  4. VACUUM ANALYZE
 *
 * Usage:
 *   WORKERS=14 BATCH_SIZE=5000 DATABASE_URL=postgres://... npx ts-node src/scripts/backfill-tsv.ts
 *
 * Env vars:
 *   DATABASE_URL   — Direct PG connection (NOT through PgBouncer!)
 *   WORKERS        — Number of parallel workers (default: 14)
 *   BATCH_SIZE     — Rows per UPDATE batch (default: 5000)
 *   DRY_RUN        — If "true", only show progress without modifying (default: false)
 *   SKIP_DROP_INDEX — If "true", skip dropping/recreating GIN index (default: false)
 */

import { Pool } from 'pg';
import type { Pool as PoolType } from 'pg';

// ─── Config ────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const WORKERS = parseInt(process.env.WORKERS || '14', 10);
const BATCH_SIZE = Math.min(Math.max(parseInt(process.env.BATCH_SIZE || '5000', 10), 100), 50000);
const DRY_RUN = process.env.DRY_RUN === 'true';
const SKIP_DROP_INDEX = process.env.SKIP_DROP_INDEX === 'true';
const INDEX_NAME = 'idx_edrsr_fulltext_tsv';
const TABLE = 'edrsr_fulltext';
const PROGRESS_INTERVAL_MS = 10_000; // log progress every 10s

// ─── State ─────────────────────────────────────────────────────────────────
let totalIndexed = 0;
let workersActive = 0;
let startTime = 0;
let allDone = false;

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
    max: WORKERS + 2, // workers + admin queries
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 0, // no timeout for long-running UPDATEs
  } as any);
}

// ─── Get progress from DB ──────────────────────────────────────────────────
async function getProgress(pool: PoolType): Promise<{ total: number; indexed: number; remaining: number }> {
  const result = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(tsv)::bigint AS indexed,
      (COUNT(*) FILTER (WHERE tsv IS NULL AND full_text IS NOT NULL))::bigint AS remaining
    FROM ${TABLE}
  `);
  const row = result.rows[0];
  return {
    total: Number(row.total),
    indexed: Number(row.indexed),
    remaining: Number(row.remaining),
  };
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

  // Increase parallel workers for index creation
  const client = await pool.connect();
  try {
    await client.query(`SET max_parallel_maintenance_workers = 8`);
    await client.query(`SET maintenance_work_mem = '4GB'`);
    await client.query(`CREATE INDEX ${INDEX_NAME} ON ${TABLE} USING gin(tsv)`);
  } finally {
    client.release();
  }

  const elapsed = ((Date.now() - indexStart) / 1000 / 60).toFixed(1);
  log(`Index created in ${elapsed} minutes`);
}

// ─── Worker: process batches until none remain ─────────────────────────────
async function worker(id: number, pool: PoolType): Promise<number> {
  let workerTotal = 0;
  workersActive++;

  let consecutiveErrors = 0;
  try {
    while (!allDone) {
      try {
        const result = await pool.query(`
          WITH batch AS (
            SELECT doc_id
            FROM ${TABLE}
            WHERE tsv IS NULL AND full_text IS NOT NULL
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE ${TABLE} f
          SET tsv = to_tsvector('simple', LEFT(f.full_text, 500000))
          FROM batch
          WHERE f.doc_id = batch.doc_id
        `, [BATCH_SIZE]);

        const count = result.rowCount || 0;
        if (count === 0) break;

        workerTotal += count;
        totalIndexed += count;
        consecutiveErrors = 0;
      } catch (err: any) {
        consecutiveErrors++;
        log(`Worker ${id} batch error (${consecutiveErrors}): ${err.message}`);
        if (consecutiveErrors >= 5) {
          log(`Worker ${id} giving up after ${consecutiveErrors} consecutive errors`);
          break;
        }
      }
    }
  } catch (err: any) {
    log(`Worker ${id} fatal error: ${err.message}`);
  } finally {
    workersActive--;
  }

  return workerTotal;
}

// ─── Progress reporter ─────────────────────────────────────────────────────
async function progressReporter(pool: PoolType): Promise<void> {
  while (!allDone) {
    await new Promise(resolve => setTimeout(resolve, PROGRESS_INTERVAL_MS));
    if (allDone) break;

    try {
      const elapsedMs = Date.now() - startTime;
      const ratePerSec = totalIndexed / (elapsedMs / 1000);
      const { total, indexed, remaining } = await getProgress(pool);
      const pct = total > 0 ? ((indexed / total) * 100).toFixed(2) : '0';
      const eta = formatEta(remaining, ratePerSec);

      log(
        `Progress: ${indexed.toLocaleString()} / ${total.toLocaleString()} (${pct}%) | ` +
        `Rate: ${formatRate(totalIndexed, elapsedMs)} rows/sec | ` +
        `Remaining: ${remaining.toLocaleString()} | ETA: ${eta} | ` +
        `Workers: ${workersActive}/${WORKERS}`
      );
    } catch {
      // ignore progress query errors
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('=== EDRSR TSV Backfill ===');
  log(`Workers: ${WORKERS} | Batch size: ${BATCH_SIZE} | Dry run: ${DRY_RUN}`);
  log(`Skip drop index: ${SKIP_DROP_INDEX}`);

  const pool = createPool();

  try {
    // 1. Show initial state
    const initial = await getProgress(pool);
    log(`Initial state: ${initial.indexed.toLocaleString()} indexed / ${initial.total.toLocaleString()} total`);
    log(`Remaining: ${initial.remaining.toLocaleString()} rows to process`);

    if (initial.remaining === 0) {
      log('Nothing to do — all rows are indexed!');
      return;
    }

    if (DRY_RUN) {
      log('DRY_RUN=true — exiting without changes');
      return;
    }

    // 2. Drop GIN index (if not skipped)
    if (!SKIP_DROP_INDEX) {
      await dropIndex(pool);
    }

    // 3. Tune session-level PG settings for bulk writes
    log('Setting checkpoint/WAL params for bulk operation...');
    // These are session-level hints; global settings come from docker-compose
    try {
      await pool.query(`SET synchronous_commit = off`); // faster, safe for backfill
    } catch {
      log('Could not set synchronous_commit (non-critical)');
    }

    // 4. Launch workers
    startTime = Date.now();
    log(`Launching ${WORKERS} workers...`);

    const progressPromise = progressReporter(pool);
    const workerPromises = Array.from({ length: WORKERS }, (_, i) => worker(i, pool));
    const results = await Promise.all(workerPromises);

    allDone = true;
    await progressPromise;

    const elapsedMs = Date.now() - startTime;
    const totalDone = results.reduce((a, b) => a + b, 0);
    log(`All workers done. Total indexed: ${totalDone.toLocaleString()} in ${(elapsedMs / 1000 / 60).toFixed(1)} minutes`);
    log(`Average rate: ${formatRate(totalDone, elapsedMs)} rows/sec`);

    // 5. Recreate GIN index
    if (!SKIP_DROP_INDEX) {
      await createIndex(pool);
    }

    // 6. VACUUM ANALYZE
    log('Running VACUUM ANALYZE...');
    const vacStart = Date.now();
    await pool.query(`VACUUM ANALYZE ${TABLE}`);
    log(`VACUUM ANALYZE done in ${((Date.now() - vacStart) / 1000 / 60).toFixed(1)} minutes`);

    // 7. Final state
    const final = await getProgress(pool);
    log(`Final state: ${final.indexed.toLocaleString()} indexed / ${final.total.toLocaleString()} total`);
    log(`Remaining: ${final.remaining.toLocaleString()}`);
    log('=== Done ===');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
