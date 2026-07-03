/**
 * Refresh opendata_financial_statements from the ДПС «Фінансова звітність підприємств»
 * dumps (data.gov.ua). Reads the ZIP archives under /data/opendata/finrep/{annual,quarterly}/,
 * each holding many KEP-signed XML filings. For every filing the <DECLAR> payload is located
 * inside the signed envelope, its DECLARHEAD fields are extracted, and one row is upserted by
 * (tin, period_year, form_type, c_doc_sub).
 *
 * Heavy: ~713K filings / ~3.7 GB. Run in the background; idempotent (ON CONFLICT).
 *
 * Usage:
 *   npx tsx src/scripts/import-financial-statements.ts [root]
 *   default: /data/opendata/finrep
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const DEFAULT_ROOT = '/data/opendata/finrep';
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

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'));
  return m ? m[1].trim() || null : null;
};
const toInt = (v: string | null): number | null => (v && /^\d+$/.test(v) ? parseInt(v) : null);

function parseFiling(buf: Buffer): any | null {
  // The signed envelope has binary before the payload; locate the <DECLAR ...>...</DECLAR>.
  const raw = buf.toString('latin1');
  const start = raw.indexOf('<DECLAR');
  const endTag = raw.lastIndexOf('</DECLAR>');
  if (start < 0 || endTag < 0) return null;
  // Re-decode just the payload as UTF-8 (the XML declares encoding="UTF-8").
  const declarXml = buf.slice(Buffer.byteLength(raw.slice(0, start), 'latin1'),
    Buffer.byteLength(raw.slice(0, endTag), 'latin1') + '</DECLAR>'.length).toString('utf8');

  const head = declarXml.slice(0, declarXml.indexOf('</DECLARHEAD>') + 13 || 4000);
  const tin = tag(head, 'TIN');
  const periodYear = toInt(tag(head, 'PERIOD_YEAR'));
  const cDocSub = tag(head, 'C_DOC_SUB');
  const fm = declarXml.match(/noNamespaceSchemaLocation="([^"]+?)\.XSD"/i);
  const formType = fm ? fm[1] : null;
  if (!tin || periodYear == null || !formType || !cDocSub) return null;

  return {
    tin,
    c_doc: tag(head, 'C_DOC'),
    c_doc_sub: cDocSub,
    c_doc_ver: tag(head, 'C_DOC_VER'),
    period_year: periodYear,
    period_month: toInt(tag(head, 'PERIOD_MONTH')),
    period_type: toInt(tag(head, 'PERIOD_TYPE')),
    c_reg: tag(head, 'C_REG'),
    c_raj: tag(head, 'C_RAJ'),
    form_type: formType,
    raw_xml: declarXml,
  };
}

async function insertBatch(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const k = `${r.tin}|${r.period_year}|${r.form_type}|${r.c_doc_sub}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  const values: any[] = [];
  const ph: string[] = [];
  let i = 1;
  for (const r of deduped) {
    const cols = [r.tin, r.c_doc, r.c_doc_sub, r.c_doc_ver, r.period_year, r.period_month,
      r.period_type, r.c_reg, r.c_raj, r.form_type, r.raw_xml];
    ph.push(`(${cols.map(() => `$${i++}`).join(',')})`);
    values.push(...cols);
  }
  const sql = `
    INSERT INTO opendata_financial_statements
      (tin, c_doc, c_doc_sub, c_doc_ver, period_year, period_month, period_type,
       c_reg, c_raj, form_type, raw_xml)
    VALUES ${ph.join(',')}
    ON CONFLICT (tin, period_year, form_type, c_doc_sub) DO UPDATE SET
      c_doc = EXCLUDED.c_doc, c_doc_ver = EXCLUDED.c_doc_ver, period_month = EXCLUDED.period_month,
      period_type = EXCLUDED.period_type, c_reg = EXCLUDED.c_reg, c_raj = EXCLUDED.c_raj,
      raw_xml = EXCLUDED.raw_xml, imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const root = process.argv[2] || DEFAULT_ROOT;
  console.log(`📥 Financial statements refresh from ${root}`);
  if (!fs.existsSync(root)) { console.error(`❌ Not found: ${root}`); process.exit(1); }
  await pool.query('SELECT 1');

  const zips: string[] = [];
  for (const sub of ['annual', 'quarterly']) {
    const d = path.join(root, sub);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.toLowerCase().endsWith('.zip')) zips.push(path.join(d, f));
  }
  console.log(`   ${zips.length} archives`);

  let total = 0, parsed = 0, skipped = 0;
  let batch: any[] = [];
  for (const zp of zips) {
    let entries: any[];
    try { entries = new AdmZip(zp).getEntries(); } catch (e: any) { console.warn(`   ⚠️ ${path.basename(zp)}: ${e.message}`); continue; }
    for (const en of entries) {
      if (en.isDirectory || !/\.xml$/i.test(en.entryName)) continue;
      let row: any = null;
      try { row = parseFiling(en.getData()); } catch { /* skip corrupt */ }
      if (!row) { skipped++; continue; }
      parsed++;
      batch.push(row);
      if (batch.length >= BATCH_SIZE) { total += await insertBatch(batch); batch = []; }
    }
    console.log(`   ${path.basename(zp)}: parsed ${parsed}, upserted ${total}, skipped ${skipped}`);
  }
  if (batch.length) total += await insertBatch(batch);
  console.log(`✅ Financial statements: ${total} rows upserted (${parsed} parsed, ${skipped} skipped)`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
