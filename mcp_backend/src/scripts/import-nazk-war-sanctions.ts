/**
 * Import the «Війна і санкції» portal (war-sanctions.gur.gov.ua, GUR МО) scrape
 * into opendata_nazk_war_sanctions.
 *
 * NOTE: the portal formerly lived at sanctions.nazk.gov.ua (now NXDOMAIN); its JSON
 * API is confidential (GUR-issued token) and the prod IP is Cloudflare-blocked, so the
 * data is scraped out-of-band and stored as JSONL under /data/opendata/nazk_sanctions/jsonl/.
 * This importer only loads those files.
 *
 * Each JSONL record: { id, category, url, page_title, fields:{Name:[], TIN, ...},
 *                      sanction_jurisdictions:[{jurisdiction, sanctioned, date, document_url}] }
 *
 * Usage:
 *   npx tsx src/scripts/import-nazk-war-sanctions.ts [jsonlDir]
 *   default dir: /data/opendata/nazk_sanctions/jsonl
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_DIR = '/data/opendata/nazk_sanctions/jsonl';
const BATCH_SIZE = 500;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

function firstName(fields: any): string | null {
  const n = fields?.Name;
  if (Array.isArray(n)) return n[0] || null;
  if (typeof n === 'string') return n;
  return null;
}

async function insertBatch(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    const fields = r.fields || {};
    const cols = [
      r.category,
      typeof r.id === 'number' ? r.id : (parseInt(r.id) || null),
      r.url || null,
      r.page_title || null,
      firstName(fields),
      fields.TIN || fields.tin || null,
      JSON.stringify(fields),
      r.sanction_jurisdictions ? JSON.stringify(r.sanction_jurisdictions) : null,
    ];
    placeholders.push(`(${cols.map(() => `$${i++}`).join(',')})`);
    values.push(...cols);
  }
  const sql = `
    INSERT INTO opendata_nazk_war_sanctions
      (category, source_id, url, page_title, name_uk, tin, fields, sanction_jurisdictions)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (category, source_id) DO UPDATE SET
      url = EXCLUDED.url,
      page_title = EXCLUDED.page_title,
      name_uk = EXCLUDED.name_uk,
      tin = EXCLUDED.tin,
      fields = EXCLUDED.fields,
      sanction_jurisdictions = EXCLUDED.sanction_jurisdictions,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function importFile(file: string): Promise<number> {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  let imported = 0;
  let batch: any[] = [];
  for (const line of lines) {
    let rec: any;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.source_id == null && rec.id == null) continue;
    batch.push(rec);
    if (batch.length >= BATCH_SIZE) {
      imported += await insertBatch(batch);
      batch = [];
    }
  }
  if (batch.length) imported += await insertBatch(batch);
  return imported;
}

async function main(): Promise<void> {
  const dir = process.argv[2] || DEFAULT_DIR;
  console.log(`📥 НАЗК/ГУР war-sanctions import from ${dir}`);
  if (!fs.existsSync(dir)) {
    console.error(`❌ Dir not found: ${dir}`);
    process.exit(1);
  }
  await pool.query('SELECT 1');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  let total = 0;
  for (const f of files) {
    const n = await importFile(path.join(dir, f));
    total += n;
    console.log(`   ${f}: ${n}`);
  }
  console.log(`✅ НАЗК import: ${total} rows across ${files.length} categories`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
