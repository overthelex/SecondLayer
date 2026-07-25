/**
 * partition-edrsr-tables.ts
 *
 * Migrates edrsr_documents and edrsr_fulltext from regular tables to
 * year-partitioned tables for faster bulk queries and partition pruning.
 *
 * Prerequisites:
 *   Migration 083 must have run first (creates empty partitioned tables).
 *
 * Usage:
 *   npx tsx src/scripts/partition-edrsr-tables.ts                    # full run
 *   npx tsx src/scripts/partition-edrsr-tables.ts --phase docs       # only edrsr_documents
 *   npx tsx src/scripts/partition-edrsr-tables.ts --phase fulltext   # only edrsr_fulltext
 *   npx tsx src/scripts/partition-edrsr-tables.ts --phase indexes    # only build indexes
 *   npx tsx src/scripts/partition-edrsr-tables.ts --phase swap       # only swap tables
 *   npx tsx src/scripts/partition-edrsr-tables.ts --phase validate   # only validate counts
 *   npx tsx src/scripts/partition-edrsr-tables.ts --dry-run          # show plan, no changes
 *
 * The script is idempotent and can be resumed — it skips already-copied ranges.
 *
 * Estimated times (82M docs, 125M fulltext on prod):
 *   - Phase docs:     30-60 min
 *   - Phase fulltext:  2-6 hours (4TB of TEXT data)
 *   - Phase indexes:  30-60 min
 *   - Phase swap:     < 5 seconds (rename in transaction)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ── Config ───────────────────────────────────────────────────────────────

const DOCS_BATCH_SIZE = 500_000;      // rows per INSERT batch for metadata
const FULLTEXT_BATCH_SIZE = 50_000;   // rows per INSERT batch for fulltext (large rows)
const PARALLEL_COPY_WORKERS = 4;      // concurrent COPY workers

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PHASE = args.find((_, i, a) => a[i - 1] === '--phase') || 'all';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: PARALLEL_COPY_WORKERS + 2,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
});

// ── Helpers ──────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function elapsed(startMs: number): string {
  const s = ((Date.now() - startMs) / 1000).toFixed(1);
  return `${s}s`;
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_class WHERE relname = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function tableRowCount(name: string): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::INTEGER AS cnt FROM ${name}`);
  return rows[0].cnt;
}

async function getDocIdRange(table: string): Promise<{ min: number; max: number }> {
  const { rows } = await pool.query(
    `SELECT MIN(doc_id)::BIGINT AS min, MAX(doc_id)::BIGINT AS max FROM ${table}`
  );
  return { min: Number(rows[0].min) || 0, max: Number(rows[0].max) || 0 };
}

// ── Phase 1: Copy edrsr_documents ────────────────────────────────────────

async function copyDocuments() {
  log('Phase DOCS: copying edrsr_documents → edrsr_documents_new');

  if (!(await tableExists('edrsr_documents_new'))) {
    throw new Error('edrsr_documents_new does not exist — run migration 083 first');
  }
  if (!(await tableExists('edrsr_documents'))) {
    throw new Error('edrsr_documents not found');
  }

  const existingCount = await tableRowCount('edrsr_documents_new');
  if (existingCount > 0) {
    log(`edrsr_documents_new already has ${existingCount.toLocaleString()} rows — resuming`);
  }

  const { min, max } = await getDocIdRange('edrsr_documents');
  const totalSource = await tableRowCount('edrsr_documents');
  log(`Source: ${totalSource.toLocaleString()} rows, doc_id range ${min}..${max}`);

  if (DRY_RUN) {
    const batches = Math.ceil((max - min + 1) / DOCS_BATCH_SIZE);
    log(`DRY RUN: would copy in ~${batches} batches of ${DOCS_BATCH_SIZE.toLocaleString()}`);
    return;
  }

  // Set session params for bulk load
  await pool.query("SET work_mem = '256MB'");

  const start = Date.now();
  let copied = 0;
  let batchNum = 0;

  for (let lo = min; lo <= max; lo += DOCS_BATCH_SIZE) {
    const hi = lo + DOCS_BATCH_SIZE;
    batchNum++;

    // Skip if batch already copied (resume support)
    const { rows: check } = await pool.query(
      `SELECT 1 FROM edrsr_documents_new WHERE doc_id >= $1 AND doc_id < $2 LIMIT 1`,
      [lo, hi]
    );
    if (check.length > 0) {
      continue; // already copied this range
    }

    const { rowCount } = await pool.query(`
      INSERT INTO edrsr_documents_new (
        doc_id, court_code, judgment_code, justice_kind, category_code,
        cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ
      )
      SELECT
        doc_id, court_code, judgment_code, justice_kind, category_code,
        cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ
      FROM edrsr_documents
      WHERE doc_id >= $1 AND doc_id < $2
    `, [lo, hi]);

    copied += rowCount || 0;

    if (batchNum % 10 === 0 || lo + DOCS_BATCH_SIZE > max) {
      const pct = ((lo - min) / (max - min) * 100).toFixed(1);
      log(`  docs batch ${batchNum}: ${copied.toLocaleString()} rows copied (${pct}%) [${elapsed(start)}]`);
    }
  }

  const finalCount = await tableRowCount('edrsr_documents_new');
  log(`Phase DOCS done: ${finalCount.toLocaleString()} rows in ${elapsed(start)}`);

  if (finalCount !== totalSource) {
    log(`⚠ WARNING: source=${totalSource.toLocaleString()}, target=${finalCount.toLocaleString()} — delta ${totalSource - finalCount}`);
  }
}

// ── Phase 2: Copy edrsr_fulltext ─────────────────────────────────────────

async function copyFulltext() {
  log('Phase FULLTEXT: copying edrsr_fulltext → edrsr_fulltext_new (with adj_year)');

  if (!(await tableExists('edrsr_fulltext_new'))) {
    throw new Error('edrsr_fulltext_new does not exist — run migration 083 first');
  }
  if (!(await tableExists('edrsr_fulltext'))) {
    throw new Error('edrsr_fulltext not found');
  }

  const existingCount = await tableRowCount('edrsr_fulltext_new');
  if (existingCount > 0) {
    log(`edrsr_fulltext_new already has ${existingCount.toLocaleString()} rows — resuming`);
  }

  const { min, max } = await getDocIdRange('edrsr_fulltext');
  const totalSource = await tableRowCount('edrsr_fulltext');
  log(`Source: ${totalSource.toLocaleString()} rows, doc_id range ${min}..${max}`);

  if (DRY_RUN) {
    const batches = Math.ceil((max - min + 1) / FULLTEXT_BATCH_SIZE);
    log(`DRY RUN: would copy in ~${batches} batches of ${FULLTEXT_BATCH_SIZE.toLocaleString()}`);
    return;
  }

  await pool.query("SET work_mem = '256MB'");

  const start = Date.now();
  let copied = 0;
  let batchNum = 0;

  // Build work queue of doc_id ranges
  const ranges: [number, number][] = [];
  for (let lo = min; lo <= max; lo += FULLTEXT_BATCH_SIZE) {
    ranges.push([lo, lo + FULLTEXT_BATCH_SIZE]);
  }

  // Process ranges with parallel workers
  let rangeIdx = 0;

  async function worker(workerId: number) {
    while (rangeIdx < ranges.length) {
      const idx = rangeIdx++;
      const [lo, hi] = ranges[idx];

      // Skip if batch already copied
      const { rows: check } = await pool.query(
        `SELECT 1 FROM edrsr_fulltext_new WHERE doc_id >= $1 AND doc_id < $2 LIMIT 1`,
        [lo, hi]
      );
      if (check.length > 0) continue;

      const { rowCount } = await pool.query(`
        INSERT INTO edrsr_fulltext_new (
          doc_id, full_text, text_length, tsv, adj_year, created_at
        )
        SELECT
          f.doc_id,
          f.full_text,
          f.text_length,
          f.tsv,
          EXTRACT(YEAR FROM d.adjudication_date)::SMALLINT AS adj_year,
          f.created_at
        FROM edrsr_fulltext f
        LEFT JOIN edrsr_documents d ON d.doc_id = f.doc_id
        WHERE f.doc_id >= $1 AND f.doc_id < $2
      `, [lo, hi]);

      copied += rowCount || 0;
      batchNum++;

      if (batchNum % 20 === 0) {
        const pct = (idx / ranges.length * 100).toFixed(1);
        log(`  fulltext w${workerId} batch ${batchNum}: ${copied.toLocaleString()} rows (${pct}%) [${elapsed(start)}]`);
      }
    }
  }

  const workers = Array.from({ length: PARALLEL_COPY_WORKERS }, (_, i) => worker(i));
  await Promise.all(workers);

  const finalCount = await tableRowCount('edrsr_fulltext_new');
  log(`Phase FULLTEXT done: ${finalCount.toLocaleString()} rows in ${elapsed(start)}`);

  if (finalCount !== totalSource) {
    log(`⚠ WARNING: source=${totalSource.toLocaleString()}, target=${finalCount.toLocaleString()} — delta ${totalSource - finalCount}`);
  }
}

// ── Phase 3: Build indexes ───────────────────────────────────────────────

async function buildIndexes() {
  log('Phase INDEXES: building per-partition indexes');

  if (DRY_RUN) {
    log('DRY RUN: would create indexes on all partitions');
    return;
  }

  const start = Date.now();

  // ── edrsr_documents_new indexes ──
  // Get partition names
  const { rows: docPartitions } = await pool.query(`
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'edrsr_documents_new'
    ORDER BY c.relname
  `);

  log(`Building indexes on ${docPartitions.length} document partitions...`);

  for (const { relname } of docPartitions) {
    const prefix = relname.replace('edrsr_documents_', 'idx_ed_');

    // Unique index on doc_id (required for ON CONFLICT in import scripts)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${prefix}_docid ON ${relname} (doc_id)`);

    // Filter indexes (same as original table)
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_court ON ${relname} (court_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_justice ON ${relname} (justice_kind)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_judgment ON ${relname} (judgment_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_category ON ${relname} (category_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_cause ON ${relname} (cause_num)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_judge ON ${relname} (judge)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_adj_date ON ${relname} (adjudication_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_receipt ON ${relname} (receipt_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_status ON ${relname} (status)`);

    log(`  ✓ ${relname}: 10 indexes`);
  }

  // ── edrsr_fulltext_new indexes ──
  const { rows: ftPartitions } = await pool.query(`
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'edrsr_fulltext_new'
    ORDER BY c.relname
  `);

  log(`Building indexes on ${ftPartitions.length} fulltext partitions...`);

  for (const { relname } of ftPartitions) {
    const prefix = relname.replace('edrsr_fulltext_', 'idx_ef_');

    // Unique index on doc_id (required for ON CONFLICT)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${prefix}_docid ON ${relname} (doc_id)`);

    // GIN index on tsvector for FTS
    await pool.query(`CREATE INDEX IF NOT EXISTS ${prefix}_tsv ON ${relname} USING gin (tsv)`);

    log(`  ✓ ${relname}: 2 indexes`);
  }

  log(`Phase INDEXES done in ${elapsed(start)}`);
}

// ── Phase 4: Validate counts ─────────────────────────────────────────────

async function validate(): Promise<boolean> {
  log('Phase VALIDATE: comparing row counts');

  const checks: { table: string; oldName: string; newName: string }[] = [
    { table: 'documents', oldName: 'edrsr_documents', newName: 'edrsr_documents_new' },
    { table: 'fulltext', oldName: 'edrsr_fulltext', newName: 'edrsr_fulltext_new' },
  ];

  let allMatch = true;

  for (const { table, oldName, newName } of checks) {
    if (!(await tableExists(oldName)) || !(await tableExists(newName))) {
      log(`  ${table}: one of the tables doesn't exist — skip`);
      continue;
    }

    const oldCount = await tableRowCount(oldName);
    const newCount = await tableRowCount(newName);
    const match = oldCount === newCount;

    log(`  ${table}: old=${oldCount.toLocaleString()}, new=${newCount.toLocaleString()} ${match ? '✓' : '✗ MISMATCH'}`);

    if (!match) allMatch = false;
  }

  // Per-partition distribution for documents
  if (await tableExists('edrsr_documents_new')) {
    const { rows: dist } = await pool.query(`
      SELECT
        COALESCE(EXTRACT(YEAR FROM adjudication_date)::TEXT, 'NULL') AS year,
        COUNT(*)::INTEGER AS cnt
      FROM edrsr_documents_new
      GROUP BY 1
      ORDER BY 1
    `);
    log('  Documents distribution by year:');
    for (const { year, cnt } of dist) {
      log(`    ${year}: ${cnt.toLocaleString()}`);
    }
  }

  return allMatch;
}

// ── Phase 5: Swap tables ─────────────────────────────────────────────────

async function swapTables() {
  log('Phase SWAP: renaming tables (old → _old, new → production)');

  // Validate first
  const valid = await validate();
  if (!valid) {
    throw new Error('Row count mismatch — aborting swap. Fix data and re-run --phase validate');
  }

  if (DRY_RUN) {
    log('DRY RUN: would rename tables in a transaction');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock both old tables to prevent concurrent writes during swap
    await client.query('LOCK TABLE edrsr_documents IN ACCESS EXCLUSIVE MODE');
    await client.query('LOCK TABLE edrsr_fulltext IN ACCESS EXCLUSIVE MODE');

    // Copy any rows inserted into old tables after our data copy started
    // (catch-up: rows that arrived during migration)
    const { rowCount: lateDocsCount } = await client.query(`
      INSERT INTO edrsr_documents_new (
        doc_id, court_code, judgment_code, justice_kind, category_code,
        cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ
      )
      SELECT
        doc_id, court_code, judgment_code, justice_kind, category_code,
        cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ
      FROM edrsr_documents old
      WHERE NOT EXISTS (
        SELECT 1 FROM edrsr_documents_new n WHERE n.doc_id = old.doc_id
      )
    `);
    if (lateDocsCount && lateDocsCount > 0) {
      log(`  Catch-up: ${lateDocsCount} late documents copied`);
    }

    const { rowCount: lateFtCount } = await client.query(`
      INSERT INTO edrsr_fulltext_new (
        doc_id, full_text, text_length, tsv, adj_year, created_at
      )
      SELECT
        f.doc_id, f.full_text, f.text_length, f.tsv,
        EXTRACT(YEAR FROM d.adjudication_date)::SMALLINT,
        f.created_at
      FROM edrsr_fulltext f
      LEFT JOIN edrsr_documents d ON d.doc_id = f.doc_id
      WHERE NOT EXISTS (
        SELECT 1 FROM edrsr_fulltext_new n WHERE n.doc_id = f.doc_id
      )
    `);
    if (lateFtCount && lateFtCount > 0) {
      log(`  Catch-up: ${lateFtCount} late fulltext rows copied`);
    }

    // Rename: old → _old
    await client.query('ALTER TABLE edrsr_documents RENAME TO edrsr_documents_old');
    await client.query('ALTER TABLE edrsr_fulltext RENAME TO edrsr_fulltext_old');

    // Rename: new → production
    await client.query('ALTER TABLE edrsr_documents_new RENAME TO edrsr_documents');
    await client.query('ALTER TABLE edrsr_fulltext_new RENAME TO edrsr_fulltext');

    await client.query('COMMIT');
    log('Phase SWAP done — tables swapped successfully');
    log('Old tables preserved as edrsr_documents_old and edrsr_fulltext_old');
    log('Drop them manually after verifying everything works:');
    log('  DROP TABLE edrsr_documents_old;');
    log('  DROP TABLE edrsr_fulltext_old;');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  log('=== EDRSR Table Partitioning ===');
  log(`Phase: ${PHASE}, Dry run: ${DRY_RUN}`);
  const start = Date.now();

  try {
    // Disable statement timeout for bulk operations
    await pool.query('SET statement_timeout = 0');

    switch (PHASE) {
      case 'all':
        await copyDocuments();
        await copyFulltext();
        await buildIndexes();
        await swapTables();
        break;
      case 'docs':
        await copyDocuments();
        break;
      case 'fulltext':
        await copyFulltext();
        break;
      case 'indexes':
        await buildIndexes();
        break;
      case 'validate':
        await validate();
        break;
      case 'swap':
        await swapTables();
        break;
      default:
        console.error(`Unknown phase: ${PHASE}`);
        console.error('Valid phases: all, docs, fulltext, indexes, validate, swap');
        process.exit(1);
    }

    log(`=== Completed in ${elapsed(start)} ===`);
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
