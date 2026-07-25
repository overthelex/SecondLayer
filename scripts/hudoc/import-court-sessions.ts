#!/usr/bin/env npx tsx
/**
 * Import court-sessions-revisions CSVs into PostgreSQL court_sessions table.
 *
 * Each CSV is a daily full snapshot of scheduled court sessions from data.gov.ua.
 * Deduplicates by (case_number, session_date, court_name, judge_name).
 * Tracks first_seen_date and last_seen_date for each unique session.
 *
 * Usage:
 *   npx tsx scripts/hudoc/import-court-sessions.ts --data /media/vovkes/bulk-storage/court-sessions-revisions --workers 50
 */

import { createReadStream, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import pg from 'pg';

interface Config {
  dataDir: string;
  dbUrl: string;
  workers: number;
  batchSize: number;
  fileWorkers: number; // concurrent file readers (keep low to avoid OOM)
}

const DEFAULT_CONFIG: Config = {
  dataDir: '/media/vovkes/bulk-storage/court-sessions-revisions',
  dbUrl: 'postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local',
  workers: 50,
  batchSize: 1000,
  fileWorkers: 5, // only 5 files read concurrently, but each pushes batches to PG pool
};

interface SessionRow {
  sessionDate: string | null; // YYYY-MM-DD
  sessionTime: string;
  judges: string;
  caseNumber: string;
  courtName: string;
  courtRoom: string;
  caseInvolved: string;
  caseDescription: string;
}

class Stats {
  inserted = 0;
  errors = 0;
  filesProcessed = 0;
  rowsProcessed = 0;
  startTime = Date.now();

  print(totalFiles: number) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const pct = totalFiles > 0 ? (this.filesProcessed / totalFiles * 100).toFixed(1) : '?';
    const fps = elapsed > 0 ? (this.filesProcessed / elapsed).toFixed(2) : '0';
    const rps = elapsed > 0 ? (this.rowsProcessed / elapsed).toFixed(0) : '0';
    const eta = this.filesProcessed > 0 && totalFiles > this.filesProcessed
      ? formatDuration((totalFiles - this.filesProcessed) / (this.filesProcessed / elapsed))
      : '-';
    process.stdout.write(
      `\r[import] files=${this.filesProcessed}/${totalFiles} (${pct}%) | rows=${(this.rowsProcessed / 1e6).toFixed(1)}M ins=${(this.inserted / 1e6).toFixed(2)}M err=${this.errors} | ${fps} f/s ${rps} r/s | ETA ${eta}      `
    );
  }
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function parseDatetime(dateStr: string): { date: string | null; time: string } {
  if (!dateStr) return { date: null, time: '' };
  const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*(\d{2}:\d{2})?/);
  if (!match) return { date: null, time: '' };
  const [, day, month, year, time] = match;
  return { date: `${year}-${month}-${day}`, time: time || '' };
}

function extractRevisionDate(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.csv$/);
  return match ? match[1] : null;
}

async function processFileStreaming(
  pool: pg.Pool,
  filePath: string,
  revisionDate: string,
  batchSize: number,
  stats: Stats,
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 }),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  let batch: SessionRow[] = [];
  const pendingInserts: Promise<void>[] = [];

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    // Parse TSV line
    const fields = line.split('\t').map(f => {
      let v = f.trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return v.replace(/""/g, '"');
    });

    if (fields.length < 4) continue;

    const { date, time } = parseDatetime(fields[0]);
    batch.push({
      sessionDate: date,
      sessionTime: time,
      judges: fields[1] || '',
      caseNumber: fields[2] || '',
      courtName: fields[3] || '',
      courtRoom: fields[4] || '',
      caseInvolved: fields[5] || '',
      caseDescription: fields[6] || '',
    });

    if (batch.length >= batchSize) {
      const toInsert = batch;
      batch = [];
      // Limit concurrent pending inserts to avoid backpressure
      if (pendingInserts.length >= 10) {
        await Promise.all(pendingInserts);
        pendingInserts.length = 0;
      }
      pendingInserts.push(insertBatch(pool, toInsert, revisionDate, stats));
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    pendingInserts.push(insertBatch(pool, batch, revisionDate, stats));
  }
  await Promise.all(pendingInserts);

  stats.filesProcessed++;
}

async function insertBatch(
  pool: pg.Pool,
  batch: SessionRow[],
  revisionDate: string,
  stats: Stats,
): Promise<void> {
  // Deduplicate within batch by conflict key (case_number + session_date + court_name + judge_name)
  const seen = new Map<string, SessionRow>();
  for (const row of batch) {
    if (!row.caseNumber) continue; // skip rows without case number
    const key = `${row.caseNumber}\t${row.sessionDate}\t${row.courtName}\t${row.judges}`;
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }

  const dedupBatch = Array.from(seen.values());
  if (dedupBatch.length === 0) return;

  stats.rowsProcessed += batch.length;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const row of dedupBatch) {
    placeholders.push(
      `(gen_random_uuid(), $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, NOW(), NOW())`
    );
    values.push(
      row.caseNumber,
      row.courtName || null,
      row.judges || null,
      row.sessionDate,
      row.sessionTime || null,
      row.courtRoom || null,
      row.caseInvolved || null,
      revisionDate,
      revisionDate,
    );
    paramIdx += 9;
  }

  const query = `
    INSERT INTO court_sessions (
      id, case_number, court_name, judge_name, session_date,
      session_time, session_place, involved_parties,
      first_seen_date, last_seen_date, created_at, updated_at
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (case_number, session_date, court_name, judge_name)
    DO UPDATE SET
      last_seen_date = GREATEST(court_sessions.last_seen_date, EXCLUDED.last_seen_date),
      updated_at = NOW()
    WHERE court_sessions.last_seen_date IS NULL OR court_sessions.last_seen_date < EXCLUDED.last_seen_date
  `;

  try {
    const result = await pool.query(query, values);
    stats.inserted += result.rowCount || 0;
  } catch (err) {
    stats.errors++;
    if (stats.errors <= 10) {
      console.error(`\nBatch error: ${(err as Error).message.slice(0, 300)}`);
    }
  }
}

async function main() {
  const cfg = parseArgs();

  console.log(`Court Sessions → PostgreSQL Importer`);
  console.log(`  Data dir:     ${cfg.dataDir}`);
  console.log(`  DB:           ${cfg.dbUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  PG pool:      ${cfg.workers}`);
  console.log(`  File workers: ${cfg.fileWorkers}`);
  console.log(`  Batch size:   ${cfg.batchSize}`);

  const allFiles = readdirSync(cfg.dataDir)
    .filter(f => f.endsWith('.csv'))
    .sort();

  console.log(`\nFound ${allFiles.length} CSV files`);
  if (allFiles.length === 0) return;
  console.log(`  First: ${allFiles[0]}, Last: ${allFiles[allFiles.length - 1]}`);

  const pool = new pg.Pool({
    connectionString: cfg.dbUrl,
    max: cfg.workers,
    idleTimeoutMillis: 60000,
  });

  const testResult = await pool.query('SELECT count(*) FROM court_sessions');
  console.log(`Current rows in court_sessions: ${testResult.rows[0].count}`);

  const stats = new Stats();
  const progressInterval = setInterval(() => stats.print(allFiles.length), 3000);

  const fileJobs = allFiles
    .map(f => ({
      path: join(cfg.dataDir, f),
      revisionDate: extractRevisionDate(f),
      name: f,
    }))
    .filter(j => j.revisionDate !== null);

  // Process files with limited concurrency (fileWorkers)
  const mutex = { idx: 0 };

  async function fileWorker() {
    while (true) {
      const idx = mutex.idx++;
      if (idx >= fileJobs.length) break;

      const job = fileJobs[idx];
      try {
        await processFileStreaming(pool, job.path, job.revisionDate!, cfg.batchSize, stats);
      } catch (err) {
        stats.errors++;
        console.error(`\nFile error ${job.name}: ${(err as Error).message.slice(0, 200)}`);
      }
    }
  }

  const workers: Promise<void>[] = [];
  const actualFileWorkers = Math.min(cfg.fileWorkers, fileJobs.length);
  console.log(`Starting ${actualFileWorkers} file workers (${cfg.workers} PG connections)...\n`);

  for (let i = 0; i < actualFileWorkers; i++) {
    workers.push(fileWorker());
  }

  await Promise.all(workers);

  clearInterval(progressInterval);
  stats.print(allFiles.length);

  console.log(`\n\nRestoring WAL logging...`);
  await pool.query('ALTER TABLE court_sessions SET LOGGED');

  const finalCount = await pool.query('SELECT count(*) FROM court_sessions');
  console.log(`\nImport complete.`);
  console.log(`  Files processed: ${stats.filesProcessed}`);
  console.log(`  Rows processed:  ${(stats.rowsProcessed / 1e6).toFixed(2)}M`);
  console.log(`  Inserted/upd:    ${(stats.inserted / 1e6).toFixed(2)}M`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`  Total in DB:     ${finalCount.rows[0].count}`);

  await pool.end();
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const cfg = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--data': cfg.dataDir = next; i++; break;
      case '--db': cfg.dbUrl = next; i++; break;
      case '--workers': cfg.workers = parseInt(next); i++; break;
      case '--batch': cfg.batchSize = parseInt(next); i++; break;
      case '--file-workers': cfg.fileWorkers = parseInt(next); i++; break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          process.exit(1);
        }
    }
  }

  return cfg;
}

main().catch(err => {
  console.error(`\nFatal: ${err}`);
  process.exit(1);
});
