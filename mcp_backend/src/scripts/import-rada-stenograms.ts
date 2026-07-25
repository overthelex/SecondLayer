/**
 * Import ВРУ plenary stenograms (and agendas) into opendata_rada_stenograms.
 *
 * Reads *_txt.zip archives under /data/opendata/rada_stenograms/ (mirror of data.rada.gov.ua
 * /ogd/zal/agenda/sklN/{sten,text,spog}/). Each archive holds YYYYMMDD[-N].htm files in
 * windows-1251. HTML is stripped to plain text (cheerio) and decoded natively via TextDecoder.
 *
 * Usage:
 *   npx tsx src/scripts/import-rada-stenograms.ts [rootDir]
 *   default: /data/opendata/rada_stenograms
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';

const DEFAULT_ROOT = '/data/opendata/rada_stenograms';
const BATCH_SIZE = 200;
const win1251 = new TextDecoder('windows-1251');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

function walkZips(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkZips(p, out);
    else if (e.isFile() && /_txt\.zip$/i.test(e.name)) out.push(p);
  }
}

function convocationOf(relPath: string): number | null {
  const m = relPath.match(/skl(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function kindOf(relPath: string): string {
  if (/\/sten\//i.test(relPath) || /stenogram/i.test(relPath)) return 'stenogram';
  if (/\/spog\//i.test(relPath) || /stenpog/i.test(relPath)) return 'stenpog';
  if (/\/text\//i.test(relPath) || /agenda/i.test(relPath)) return 'agenda';
  return 'other';
}

function dateOf(fname: string): string | null {
  const m = fname.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (mo < '01' || mo > '12' || d < '01' || d > '31') return null;
  return `${y}-${mo}-${d}`;
}

function htmlToText(buf: Buffer): string {
  const html = win1251.decode(buf);
  const $ = cheerio.load(html);
  $('script,style').remove();
  return $.text().replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function insertBatch(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    const cols = [r.convocation, r.sitting_date, r.doc_kind, r.source_file, r.body_text];
    placeholders.push(`(${cols.map(() => `$${i++}`).join(',')})`);
    values.push(...cols);
  }
  const sql = `
    INSERT INTO opendata_rada_stenograms
      (convocation, sitting_date, doc_kind, source_file, body_text)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (source_file) DO UPDATE SET
      convocation = EXCLUDED.convocation,
      sitting_date = EXCLUDED.sitting_date,
      doc_kind = EXCLUDED.doc_kind,
      body_text = EXCLUDED.body_text,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const root = process.argv[2] || DEFAULT_ROOT;
  console.log(`📥 ВРУ stenograms import from ${root}`);
  if (!fs.existsSync(root)) { console.error(`❌ Dir not found: ${root}`); process.exit(1); }
  await pool.query('SELECT 1');

  const zips: string[] = [];
  walkZips(root, zips);
  console.log(`   ${zips.length} *_txt.zip archives`);

  let total = 0;
  let batch: any[] = [];
  for (const zp of zips) {
    const relZip = path.relative(root, zp);
    const conv = convocationOf(relZip);
    const kind = kindOf(relZip);
    let entries: any[];
    try { entries = new AdmZip(zp).getEntries(); } catch (e: any) { console.warn(`   ⚠️ ${relZip}: ${e.message}`); continue; }
    for (const en of entries) {
      if (en.isDirectory || !/\.html?$/i.test(en.entryName)) continue;
      const source_file = `${relZip}!${en.entryName}`;
      let body: string;
      try { body = htmlToText(en.getData()); } catch { continue; }
      if (!body) continue;
      batch.push({
        convocation: conv,
        sitting_date: dateOf(en.entryName),
        doc_kind: kind,
        source_file,
        body_text: body,
      });
      if (batch.length >= BATCH_SIZE) { total += await insertBatch(batch); batch = []; }
    }
    console.log(`   ${relZip}: cumulative ${total}`);
  }
  if (batch.length) total += await insertBatch(batch);
  console.log(`✅ ВРУ stenograms: ${total} documents`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
