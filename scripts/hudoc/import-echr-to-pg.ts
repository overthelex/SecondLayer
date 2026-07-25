#!/usr/bin/env npx tsx
/**
 * Import HUDOC ECHR data (metadata + full texts) into PostgreSQL echr_cases table.
 *
 * Usage:
 *   npx tsx scripts/hudoc/import-echr-to-pg.ts --data /home/vovkes/hudoc-storage --workers 50
 *   npx tsx scripts/hudoc/import-echr-to-pg.ts --data /home/vovkes/hudoc-storage --workers 50 --db postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_local
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

// ── Config ──────────────────────────────────────────────────────────────────

interface Config {
  dataDir: string;
  dbUrl: string;
  workers: number;
  batchSize: number; // rows per INSERT batch
}

const DEFAULT_CONFIG: Config = {
  dataDir: '/home/vovkes/hudoc-storage',
  dbUrl: 'postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_local',
  workers: 50,
  batchSize: 50,
};

// ── Types ───────────────────────────────────────────────────────────────────

interface MetadataRecord {
  itemid: string;
  appno: string;
  docname: string;
  respondent: string;
  languageisocode: string;
  kpdate: string;
  conclusion: string;
  importance: string;
  doctype: string;
  originatingbody: string;
  typedescription: string;
  extractedappno: string;
  documentcollectionid: string;
  documentcollectionid2: string;
  isplaceholder: string;
  [key: string]: string;
}

interface ImportJob {
  meta: MetadataRecord;
  htmlPath: string | null;
  txtPath: string | null;
}

// ── Stats ───────────────────────────────────────────────────────────────────

class Stats {
  inserted = 0;
  skipped = 0;
  errors = 0;
  startTime = Date.now();

  print(total: number) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const done = this.inserted + this.skipped;
    const pct = total > 0 ? (done / total * 100).toFixed(1) : '?';
    const rps = elapsed > 0 ? (done / elapsed).toFixed(0) : '0';
    const eta = done > 0 && total > done
      ? formatDuration((total - done) / (done / elapsed))
      : '-';
    process.stdout.write(
      `\r[import] ${done}/${total} (${pct}%) | ins=${this.inserted} skip=${this.skipped} err=${this.errors} | ${rps} r/s | ETA ${eta}   `
    );
  }
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '?';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = parseArgs();

  console.log(`ECHR → PostgreSQL Importer`);
  console.log(`  Data dir:   ${cfg.dataDir}`);
  console.log(`  DB:         ${cfg.dbUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  Workers:    ${cfg.workers}`);
  console.log(`  Batch size: ${cfg.batchSize}`);

  // Load metadata
  const metaPath = join(cfg.dataDir, 'meta', 'metadata-UKR.ndjson');
  if (!existsSync(metaPath)) {
    console.error(`Metadata file not found: ${metaPath}`);
    process.exit(1);
  }

  const lines = readFileSync(metaPath, 'utf-8').split('\n').filter(Boolean);
  console.log(`\nLoaded ${lines.length} metadata records`);

  // Parse metadata
  const allMeta: MetadataRecord[] = [];
  for (const line of lines) {
    try {
      allMeta.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }

  // Build file index
  const htmlDir = join(cfg.dataDir, 'html');
  const txtDir = join(cfg.dataDir, 'txt');
  const htmlFiles = new Set(existsSync(htmlDir) ? readdirSync(htmlDir) : []);
  const txtFiles = new Set(existsSync(txtDir) ? readdirSync(txtDir) : []);

  console.log(`HTML files: ${htmlFiles.size}, TXT files: ${txtFiles.size}`);

  // Build jobs
  const jobs: ImportJob[] = allMeta.map(meta => ({
    meta,
    htmlPath: htmlFiles.has(`${meta.itemid}.html`) ? join(htmlDir, `${meta.itemid}.html`) : null,
    txtPath: txtFiles.has(`${meta.itemid}.txt`) ? join(txtDir, `${meta.itemid}.txt`) : null,
  }));

  // Create connection pool
  const pool = new pg.Pool({
    connectionString: cfg.dbUrl,
    max: cfg.workers + 2,
    idleTimeoutMillis: 30000,
  });

  // Check which items already exist
  console.log(`\nChecking existing records...`);
  const existingResult = await pool.query('SELECT item_id FROM echr_cases');
  const existingIds = new Set(existingResult.rows.map((r: { item_id: string }) => r.item_id));
  console.log(`Already in DB: ${existingIds.size}`);

  const pendingJobs = jobs.filter(j => !existingIds.has(j.meta.itemid));
  console.log(`To import: ${pendingJobs.length}`);

  if (pendingJobs.length === 0) {
    console.log('Nothing to import.');
    await pool.end();
    return;
  }

  const stats = new Stats();
  stats.skipped = existingIds.size;

  // Progress printer
  const progressInterval = setInterval(() => {
    stats.print(jobs.length);
  }, 2000);

  // Split into batches
  const batches: ImportJob[][] = [];
  for (let i = 0; i < pendingJobs.length; i += cfg.batchSize) {
    batches.push(pendingJobs.slice(i, i + cfg.batchSize));
  }

  // Worker pool for batch processing
  let batchIndex = 0;
  const mutex = { idx: 0 };

  async function worker() {
    while (true) {
      const idx = mutex.idx++;
      if (idx >= batches.length) break;

      const batch = batches[idx];
      await insertBatch(pool, batch, stats);
    }
  }

  // Launch workers
  const workers: Promise<void>[] = [];
  const actualWorkers = Math.min(cfg.workers, batches.length);
  for (let i = 0; i < actualWorkers; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  clearInterval(progressInterval);
  stats.print(jobs.length);

  console.log(`\n\nImport complete.`);
  console.log(`  Inserted: ${stats.inserted}`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log(`  Errors:   ${stats.errors}`);

  // Final count
  const countResult = await pool.query('SELECT count(*) FROM echr_cases');
  console.log(`  Total in DB: ${countResult.rows[0].count}`);

  await pool.end();
}

async function insertBatch(pool: pg.Pool, batch: ImportJob[], stats: Stats) {
  // Build multi-row INSERT with ON CONFLICT skip
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const job of batch) {
    const m = job.meta;

    // Read full texts from files
    let htmlContent: string | null = null;
    let txtContent: string | null = null;
    try {
      if (job.htmlPath) htmlContent = readFileSync(job.htmlPath, 'utf-8');
      if (job.txtPath) txtContent = readFileSync(job.txtPath, 'utf-8');
    } catch {
      // file read error, continue with nulls
    }

    // Store extra fields as metadata JSONB
    const metaJson: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      if (!['itemid', 'appno', 'docname', 'respondent', 'languageisocode',
            'kpdate', 'conclusion', 'importance', 'doctype', 'originatingbody',
            'typedescription', 'extractedappno', 'documentcollectionid',
            'documentcollectionid2', 'isplaceholder'].includes(k)) {
        metaJson[k] = v;
      }
    }

    const kpDate = m.kpdate || null;
    const isPlaceholder = m.isplaceholder === 'True';

    placeholders.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12}, $${paramIdx + 13}, $${paramIdx + 14}, $${paramIdx + 15}, $${paramIdx + 16})`
    );

    values.push(
      m.itemid,                    // 1: item_id
      m.appno || null,             // 2: app_no
      m.docname || null,           // 3: doc_name
      m.respondent || null,        // 4: respondent
      m.languageisocode || null,   // 5: language_iso
      kpDate,                      // 6: kp_date
      m.conclusion || null,        // 7: conclusion
      m.importance || null,        // 8: importance
      m.doctype || null,           // 9: doc_type
      m.originatingbody || null,   // 10: originating_body
      m.typedescription || null,   // 11: type_description
      m.extractedappno || null,    // 12: extracted_app_no
      m.documentcollectionid || null,  // 13: document_collection_id
      m.documentcollectionid2 || null, // 14: document_collection_id2
      isPlaceholder,               // 15: is_placeholder
      htmlContent,                 // 16: full_text_html
      txtContent,                  // 17: full_text
    );

    paramIdx += 17;
  }

  const query = `
    INSERT INTO echr_cases (
      item_id, app_no, doc_name, respondent, language_iso,
      kp_date, conclusion, importance, doc_type, originating_body,
      type_description, extracted_app_no, document_collection_id,
      document_collection_id2, is_placeholder, full_text_html, full_text
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (item_id) DO NOTHING
  `;

  try {
    const result = await pool.query(query, values);
    stats.inserted += result.rowCount || 0;
    stats.skipped += batch.length - (result.rowCount || 0);
  } catch (err) {
    // Fallback: insert one by one
    for (const job of batch) {
      try {
        await insertSingle(pool, job);
        stats.inserted++;
      } catch (e) {
        stats.errors++;
        console.error(`\nError inserting ${job.meta.itemid}: ${(e as Error).message}`);
      }
    }
  }
}

async function insertSingle(pool: pg.Pool, job: ImportJob) {
  const m = job.meta;

  let htmlContent: string | null = null;
  let txtContent: string | null = null;
  try {
    if (job.htmlPath) htmlContent = readFileSync(job.htmlPath, 'utf-8');
    if (job.txtPath) txtContent = readFileSync(job.txtPath, 'utf-8');
  } catch { /* ignore */ }

  const isPlaceholder = m.isplaceholder === 'True';

  await pool.query(`
    INSERT INTO echr_cases (
      item_id, app_no, doc_name, respondent, language_iso,
      kp_date, conclusion, importance, doc_type, originating_body,
      type_description, extracted_app_no, document_collection_id,
      document_collection_id2, is_placeholder, full_text_html, full_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (item_id) DO NOTHING
  `, [
    m.itemid, m.appno || null, m.docname || null, m.respondent || null,
    m.languageisocode || null, m.kpdate || null, m.conclusion || null,
    m.importance || null, m.doctype || null, m.originatingbody || null,
    m.typedescription || null, m.extractedappno || null,
    m.documentcollectionid || null, m.documentcollectionid2 || null,
    isPlaceholder, htmlContent, txtContent,
  ]);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

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
  console.error(`Fatal: ${err}`);
  process.exit(1);
});
