/**
 * Import АМКУ «Зведені відомості про спотворення результатів торгів (тендерів)»
 * (bid-rigging consolidated data) into opendata_amcu_bid_rigging.
 *
 * Reads all XLSX files under /data/opendata/amcu/zvedeni-vidomosti-torhy/.
 * Row 1 = machine headers, row 2 = Ukrainian descriptions (skipped), data from row 3.
 * Key columns: identifier (ЄДРПОУ), theEntityThatCommittedTheViolation, dateOfDecision.
 *
 * Usage:
 *   npx tsx src/scripts/import-amcu-bid-rigging.ts [dir]
 *   default dir: /data/opendata/amcu/zvedeni-vidomosti-torhy
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

const DEFAULT_DIR = '/data/opendata/amcu/zvedeni-vidomosti-torhy';
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

function cellText(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
    return null;
  }
  return String(v).trim() || null;
}

function toDate(v: any): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/(\d{2})[.\/](\d{2})[.\/](\d{4})/); // dd.mm.yyyy
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function looksLikeDescriptionRow(rowData: Record<string, any>): boolean {
  const id = String(rowData['identifier'] ?? '');
  const dn = String(rowData['decisionNumber'] ?? '');
  return id.includes('ЄДРПОУ') || dn.includes('за порядком') || dn.includes('рішенн');
}

async function insertBatch(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    const cols = [r.source_file, r.row_num, r.decision_date, r.entity_name, r.entity_edrpou, JSON.stringify(r.row_data)];
    placeholders.push(`(${cols.map(() => `$${i++}`).join(',')})`);
    values.push(...cols);
  }
  const sql = `
    INSERT INTO opendata_amcu_bid_rigging
      (source_file, row_num, decision_date, entity_name, entity_edrpou, row_data)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (source_file, row_num) DO UPDATE SET
      decision_date = EXCLUDED.decision_date,
      entity_name = EXCLUDED.entity_name,
      entity_edrpou = EXCLUDED.entity_edrpou,
      row_data = EXCLUDED.row_data,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function importFile(file: string): Promise<number> {
  const base = path.basename(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) return 0;

  const headerVals = ws.getRow(1).values as any[];
  const headers: string[] = [];
  for (let c = 1; c < headerVals.length; c++) {
    headers[c] = cellText(headerVals[c]) || `col${c}`;
  }

  let imported = 0;
  let batch: any[] = [];
  for (let rn = 2; rn <= ws.rowCount; rn++) {
    const rowVals = ws.getRow(rn).values as any[];
    if (!rowVals || rowVals.length <= 1) continue;
    const rowData: Record<string, any> = {};
    let hasContent = false;
    for (let c = 1; c < headers.length; c++) {
      const t = cellText(rowVals[c]);
      if (t != null) hasContent = true;
      rowData[headers[c]] = t;
    }
    if (!hasContent) continue;
    if (rn === 2 && looksLikeDescriptionRow(rowData)) continue;

    batch.push({
      source_file: base,
      row_num: rn,
      decision_date: toDate(rowData['dateOfDecision']),
      entity_name: rowData['theEntityThatCommittedTheViolation'] || null,
      entity_edrpou: (rowData['identifier'] && /^\d{6,10}$/.test(String(rowData['identifier']))) ? String(rowData['identifier']) : null,
      row_data: rowData,
    });
    if (batch.length >= BATCH_SIZE) { imported += await insertBatch(batch); batch = []; }
  }
  if (batch.length) imported += await insertBatch(batch);
  return imported;
}

async function main(): Promise<void> {
  const dir = process.argv[2] || DEFAULT_DIR;
  console.log(`📥 АМКУ bid-rigging import from ${dir}`);
  if (!fs.existsSync(dir)) { console.error(`❌ Dir not found: ${dir}`); process.exit(1); }
  await pool.query('SELECT 1');
  const files = fs.readdirSync(dir).filter(f => /\.xlsx?$/i.test(f));
  let total = 0, done = 0;
  for (const f of files) {
    try {
      total += await importFile(path.join(dir, f));
    } catch (e: any) {
      console.warn(`   ⚠️ ${f}: ${e.message}`);
    }
    if (++done % 25 === 0) console.log(`   ${done}/${files.length} files, ${total} rows`);
  }
  console.log(`✅ АМКУ bid-rigging: ${total} rows from ${files.length} files`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
