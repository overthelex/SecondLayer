/**
 * Import АМКУ «Рішення та рекомендації» documents into opendata_amcu_decisions.
 *
 * Reads /data/opendata/amcu/rishennia-ta-rekomendatsii/ : zip archives of doc/docx,
 * loose doc/docx, and annual index XLSX. One row per document file.
 *   - .docx  → text extracted via mammoth
 *   - .doc   → legacy binary; metadata only (extracted=false)
 *   - .7z    → extracted via the system `7z` binary, then doc/docx processed
 *   - .xlsx  → annual list; recorded as doc_kind='list', no text
 *
 * Requires the `7z` CLI on PATH (p7zip) for .7z archives; if absent, they are skipped.
 *
 * Usage:
 *   npx tsx src/scripts/import-amcu-decisions.ts [dir]
 *   default: /data/opendata/amcu/rishennia-ta-rekomendatsii
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';

const DEFAULT_DIR = '/data/opendata/amcu/rishennia-ta-rekomendatsii';
const BATCH_SIZE = 100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

function kindOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('rekomend') || n.includes('recomend')) return 'rekomendatsii';
  if (n.includes('spisok') || n.includes('list')) return 'list';
  if (n.includes('rish') || n.includes('rise')) return 'rishennia';
  return 'other';
}

function dateOf(name: string): string | null {
  let m = name.match(/(\d{2})[-.](\d{2})[-.](\d{4})/); // dd-mm-yyyy
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = name.match(/(\d{4})[-.](\d{2})[-.](\d{2})/); // yyyy-mm-dd
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function decisionNoOf(name: string): string | null {
  let m = name.match(/no[-_ ]?(\d+[-_ ]?[a-zа-я]*)/i);
  if (m) return m[1];
  m = name.match(/(\d+)[-_](rk|р[кп])/i);
  if (m) return m[1];
  return null;
}

function walkDocs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkDocs(p));
    else if (/\.docx?$/i.test(e.name)) out.push(p);
  }
  return out;
}

let sevenZipAvailable: boolean | null = null;
function has7z(): boolean {
  if (sevenZipAvailable !== null) return sevenZipAvailable;
  try { execFileSync('7z', ['i'], { stdio: 'ignore' }); sevenZipAvailable = true; }
  catch { sevenZipAvailable = false; }
  return sevenZipAvailable;
}

async function extractDocx(buf: Buffer): Promise<string | null> {
  try {
    const res = await mammoth.extractRawText({ buffer: buf });
    return (res.value || '').trim() || null;
  } catch {
    return null;
  }
}

async function insertBatch(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    const cols = [r.archive_file, r.doc_file, r.doc_kind, r.decision_no, r.decision_date, r.body_text, r.extracted];
    placeholders.push(`(${cols.map(() => `$${i++}`).join(',')})`);
    values.push(...cols);
  }
  const sql = `
    INSERT INTO opendata_amcu_decisions
      (archive_file, doc_file, doc_kind, decision_no, decision_date, body_text, extracted)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (doc_file) DO UPDATE SET
      archive_file = EXCLUDED.archive_file,
      doc_kind = EXCLUDED.doc_kind,
      decision_no = EXCLUDED.decision_no,
      decision_date = EXCLUDED.decision_date,
      body_text = COALESCE(EXCLUDED.body_text, opendata_amcu_decisions.body_text),
      extracted = EXCLUDED.extracted OR opendata_amcu_decisions.extracted,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const dir = process.argv[2] || DEFAULT_DIR;
  console.log(`📥 АМКУ decisions import from ${dir}`);
  if (!fs.existsSync(dir)) { console.error(`❌ Dir not found: ${dir}`); process.exit(1); }
  await pool.query('SELECT 1');

  const files = fs.readdirSync(dir);
  let total = 0, sevenZip = 0, docxOk = 0, docLegacy = 0;
  let batch: any[] = [];

  const push = async (row: any) => {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) { total += await insertBatch(batch); batch = []; }
  };

  for (const f of files) {
    const full = path.join(dir, f);
    const ext = path.extname(f).toLowerCase();

    if (ext === '.7z') {
      if (!has7z()) { sevenZip++; continue; }
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amcu7z-'));
      try {
        execFileSync('7z', ['x', '-y', '-bd', `-o${tmp}`, full], { stdio: 'ignore' });
        for (const docPath of walkDocs(tmp)) {
          const rel = path.relative(tmp, docPath);
          const e2 = path.extname(rel).toLowerCase();
          let body: string | null = null, extracted = false;
          if (e2 === '.docx') { body = await extractDocx(fs.readFileSync(docPath)); extracted = body != null; if (extracted) docxOk++; else docLegacy++; }
          else docLegacy++;
          await push({
            archive_file: f, doc_file: `${f}!${rel}`, doc_kind: kindOf(rel),
            decision_no: decisionNoOf(rel), decision_date: dateOf(rel), body_text: body, extracted,
          });
        }
        sevenZip++;
      } catch (e: any) {
        console.warn(`   ⚠️ 7z ${f}: ${e.message}`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      continue;
    }

    if (ext === '.zip') {
      let entries: any[];
      try { entries = new AdmZip(full).getEntries(); } catch (e: any) { console.warn(`   ⚠️ ${f}: ${e.message}`); continue; }
      for (const en of entries) {
        if (en.isDirectory) continue;
        const en2 = en.entryName;
        const e2 = path.extname(en2).toLowerCase();
        if (e2 !== '.doc' && e2 !== '.docx') continue;
        let body: string | null = null, extracted = false;
        if (e2 === '.docx') {
          body = await extractDocx(en.getData());
          extracted = body != null;
          if (extracted) docxOk++; else docLegacy++;
        } else { docLegacy++; }
        await push({
          archive_file: f, doc_file: `${f}!${en2}`, doc_kind: kindOf(en2),
          decision_no: decisionNoOf(en2), decision_date: dateOf(en2), body_text: body, extracted,
        });
      }
      continue;
    }

    if (ext === '.docx' || ext === '.doc') {
      let body: string | null = null, extracted = false;
      if (ext === '.docx') { body = await extractDocx(fs.readFileSync(full)); extracted = body != null; if (extracted) docxOk++; else docLegacy++; }
      else docLegacy++;
      await push({ archive_file: null, doc_file: f, doc_kind: kindOf(f), decision_no: decisionNoOf(f), decision_date: dateOf(f), body_text: body, extracted });
      continue;
    }

    if (ext === '.xlsx' || ext === '.xls') {
      await push({ archive_file: null, doc_file: f, doc_kind: 'list', decision_no: null, decision_date: dateOf(f), body_text: null, extracted: false });
    }
  }
  if (batch.length) total += await insertBatch(batch);

  const zMsg = has7z() ? `${sevenZip} .7z archives extracted` : `${sevenZip} .7z archives skipped (7z binary not found)`;
  console.log(`✅ АМКУ decisions: ${total} rows (docx text ${docxOk}, legacy/no-text ${docLegacy}); ${zMsg}`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
