/**
 * Import intellectual property data from UIPV/NIPO (sis.nipo.gov.ua) into PostgreSQL.
 *
 * Downloads trademarks, patents, utility models, and industrial designs via paginated API.
 * Supports checkpoint/resume for long-running imports (~32h for full dataset).
 *
 * Usage:
 *   npx tsx src/scripts/import-uipv-ip.ts [trademarks|patents|utility_models|designs|all]
 *   CONCURRENCY=3 PAGE_SIZE=10 npx tsx src/scripts/import-uipv-ip.ts all
 *
 * Env vars:
 *   DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as https from 'https';

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'https://sis.nipo.gov.ua/api/v1/open-data/';
// 1 req/sec API limit; the sleep runs BEFORE each fetch, so effective period =
// RATE_LIMIT_MS + fetch latency (~0.6s). Override via env to pace closer to the
// real limit (429s are retried with a 5s backoff anyway).
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || '1100');
const BATCH_INSERT_SIZE = 50;
const CHECKPOINT_DIR = '/tmp/uipv-import-checkpoints';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1'); // stay at 1 for rate limit

const OBJ_TYPES: Record<string, { type: number; table: 'trademarks' | 'patents' }> = {
  trademarks:     { type: 4, table: 'trademarks' },
  patents:        { type: 1, table: 'patents' },
  utility_models: { type: 2, table: 'patents' },
  designs:        { type: 6, table: 'patents' },
};

// ── DB ──────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

// ── Checkpoint ──────────────────────────────────────────────────────────────
function getCheckpoint(name: string): number {
  const file = `${CHECKPOINT_DIR}/${name}.json`;
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data.page || 1;
  }
  return 1;
}

function saveCheckpoint(name: string, page: number, imported: number): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(`${CHECKPOINT_DIR}/${name}.json`, JSON.stringify({ page, imported, ts: new Date().toISOString() }));
}

// ── HTTP fetch with retry ───────────────────────────────────────────────────
async function fetchJSON(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SecondLayer-Legal-Platform/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 429) {
        console.warn(`  ⏳ Rate limited, waiting 5s (attempt ${attempt}/${retries})`);
        await sleep(5000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`  ⚠️ Fetch error (attempt ${attempt}/${retries}): ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// NIPO exposes the authoritative live/dead flag as a colour: green = in force,
// red = not in force, yellow = registered but pending (e.g. awaiting an annual fee).
// Map it to a human-readable status shared by both trademarks and patents so the
// registry-catalog text filters work and the two tables stay consistent.
function statusFromColor(color: any, fallback: string | null = null): string | null {
  switch (color) {
    case 'green': return 'active';
    case 'red': return 'inactive';
    case 'yellow': return 'pending';
    default: return fallback;
  }
}

// ── Extract trademark fields ────────────────────────────────────────────────
function extractTrademark(record: any): any[] {
  const data = record.data || {};

  // Mark text — the verbal element is nested under `data`, same as every other
  // field below (holder/applicant/nice). Reading it off `record` left mark_text
  // NULL for the entire trademark table.
  let markText = '';
  const wordMark = data.WordMarkSpecification?.MarkSignificantVerbalElement;
  if (Array.isArray(wordMark)) {
    markText = wordMark.map((w: any) => w['#text'] || '').filter(Boolean).join(' ');
  }

  // Holder
  let holderName = '', holderEdrpou = '', holderCountry = '';
  const holders = data.HolderDetails?.Holder;
  if (Array.isArray(holders) && holders.length > 0) {
    const h = holders[0]?.HolderAddressBook?.FormattedNameAddress;
    holderName = h?.Name?.FreeFormatName?.FreeFormatNameDetails?.FreeFormatNameLine || '';
    holderEdrpou = h?.Name?.FreeFormatName?.EDRPOU || '';
    holderCountry = h?.Address?.AddressCountryCode || '';
  }

  // Applicant
  let applicantName = '', applicantEdrpou = '';
  const applicants = data.ApplicantDetails?.Applicant;
  if (Array.isArray(applicants) && applicants.length > 0) {
    const a = applicants[0]?.ApplicantAddressBook?.FormattedNameAddress;
    applicantName = a?.Name?.FreeFormatName?.FreeFormatNameDetails?.FreeFormatNameLine || '';
    applicantEdrpou = a?.Name?.FreeFormatName?.EDRPOU || '';
  }

  // Nice classes
  const classDescs = data.GoodsServicesDetails?.GoodsServices?.ClassDescriptionDetails?.ClassDescription;
  let niceClasses: number[] = [];
  let niceDescriptions = '';
  if (Array.isArray(classDescs)) {
    niceClasses = classDescs.map((c: any) => c.ClassNumber).filter(Boolean);
    niceDescriptions = classDescs.map((c: any) => {
      const terms = c.ClassificationTermDetails?.ClassificationTerm;
      const text = Array.isArray(terms) ? terms.map((t: any) => t.ClassificationTermText).join('; ') : '';
      return `${c.ClassNumber}: ${text}`;
    }).join(' | ');
  }

  // Expiry — prefer the prolongation expiry when the mark was renewed. NIPO keeps
  // the original 10-year `ExpiryDate` even after a prolongation; the effective term
  // end lives in `ProlonagationExpiryDate` (note NIPO's misspelling). Reading only
  // `ExpiryDate` reported ~90K renewed marks as long expired (e.g. TM 67482 showed
  // 2016 while it was actually renewed to 2026).
  const expiryDate = data.ProlonagationExpiryDate || data.ExpiryDate || null;

  // Status — `registration_status_color` is the authoritative live/dead flag, same
  // source patents use. `application_status` is unreliable: ~127K marks are stamped
  // "active" while their color is red (expired/terminated), so the raw `TerminationDate`
  // never surfaced. Map color → human-readable status the registry catalog filters on
  // by text ("зареєстровано, припинено тощо"), falling back to application_status.
  const status = statusFromColor(data.registration_status_color, data.application_status || null);

  return [
    record.app_number,
    record.app_date ? record.app_date.split('T')[0] : null,
    record.registration_number || null,
    record.registration_date ? record.registration_date.split('T')[0] : null,
    expiryDate,
    markText || null,
    holderName || null,
    holderEdrpou || null,
    holderCountry || null,
    applicantName || null,
    applicantEdrpou || null,
    niceClasses.length > 0 ? niceClasses : null,
    niceDescriptions || null,
    status,
    record.last_update || null,
    JSON.stringify(data),
  ];
}

// ── Extract patent fields ───────────────────────────────────────────────────
function extractPatent(record: any, objType: number): any[] {
  const data = record.data || {};

  // Title
  const titles = data['I_54'];
  let titleUa = '', titleEn = '';
  if (Array.isArray(titles) && titles.length > 0) {
    titleUa = titles[0]?.['I_54.U'] || '';
    titleEn = titles[0]?.['I_54.E'] || '';
  }

  // Abstract
  let abstractUa = '';
  const abs = data['AB'];
  if (Array.isArray(abs)) {
    const uaAbs = abs.find((a: any) => a['AB.L'] === 'UA') || abs[0];
    abstractUa = uaAbs?.['AB.T'] || '';
  }

  // IPC codes
  const ipcCodes = Array.isArray(data['IPC']) ? data['IPC'] : [];

  // Owner
  let ownerName = '', ownerCountry = '';
  const owners = data['I_73'];
  if (Array.isArray(owners) && owners.length > 0) {
    ownerName = owners[0]?.['I_73.N'] || '';
    ownerCountry = owners[0]?.['I_73.C'] || '';
  }

  // Inventors
  const inventors = data['I_72'];
  let inventorNames: string[] = [];
  if (Array.isArray(inventors)) {
    inventorNames = inventors.map((i: any) => i['I_72.N.U'] || i['I_72.N.R'] || '').filter(Boolean);
  }

  // Human-readable status from the NIPO colour flag (green→active, red→inactive,
  // yellow→pending), consistent with trademarks. Previously stored the raw colour.
  const status = statusFromColor(data.registration_status_color);

  return [
    objType,
    record.obj_type || null,
    record.app_number,
    record.app_date ? record.app_date.split('T')[0] : null,
    record.registration_number || null,
    record.registration_date ? record.registration_date.split('T')[0] : null,
    titleUa || null,
    titleEn || null,
    abstractUa || null,
    ipcCodes.length > 0 ? ipcCodes : null,
    ownerName || null,
    ownerCountry || null,
    inventorNames.length > 0 ? inventorNames : null,
    status,
    record.last_update || null,
    JSON.stringify(data),
  ];
}

// ── Batch insert ────────────────────────────────────────────────────────────
/**
 * NIPO pages occasionally contain the same app_number twice; a duplicate inside one
 * multi-row INSERT makes Postgres abort with "ON CONFLICT DO UPDATE command cannot
 * affect row a second time" (SQLSTATE 21000). Keep the LAST occurrence per key.
 */
function dedupeByKey(rows: any[][], keyOf: (r: any[]) => string): any[][] {
  const map = new Map<string, any[]>();
  for (const r of rows) map.set(keyOf(r), r);
  return Array.from(map.values());
}

async function insertTrademarks(inputRows: any[][]): Promise<number> {
  const rows = dedupeByKey(inputRows, r => String(r[0])); // key: app_number
  if (rows.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of rows) {
    const ph = [];
    for (const val of r) {
      ph.push(`$${idx++}`);
      values.push(val);
    }
    placeholders.push(`(${ph.join(',')})`);
  }

  const sql = `
    INSERT INTO opendata_trademarks
      (app_number, app_date, registration_number, registration_date, expiry_date,
       mark_text, holder_name, holder_edrpou, holder_country,
       applicant_name, applicant_edrpou, nice_classes, nice_descriptions,
       status, last_update, raw_data)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (app_number) DO UPDATE SET
      registration_number = EXCLUDED.registration_number,
      registration_date = EXCLUDED.registration_date,
      expiry_date = EXCLUDED.expiry_date,
      mark_text = EXCLUDED.mark_text,
      holder_name = EXCLUDED.holder_name,
      holder_edrpou = EXCLUDED.holder_edrpou,
      status = EXCLUDED.status,
      last_update = EXCLUDED.last_update,
      raw_data = EXCLUDED.raw_data,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function insertPatents(inputRows: any[][]): Promise<number> {
  const rows = dedupeByKey(inputRows, r => `${r[2]}::${r[0]}`); // key: (app_number, obj_type)
  if (rows.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of rows) {
    const ph = [];
    for (const val of r) {
      ph.push(`$${idx++}`);
      values.push(val);
    }
    placeholders.push(`(${ph.join(',')})`);
  }

  const sql = `
    INSERT INTO opendata_patents
      (obj_type, obj_type_name, app_number, app_date, registration_number, registration_date,
       title_ua, title_en, abstract_ua, ipc_codes, owner_name, owner_country,
       inventor_names, status, last_update, raw_data)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (app_number, obj_type) DO UPDATE SET
      registration_number = EXCLUDED.registration_number,
      registration_date = EXCLUDED.registration_date,
      title_ua = EXCLUDED.title_ua,
      title_en = EXCLUDED.title_en,
      abstract_ua = EXCLUDED.abstract_ua,
      owner_name = EXCLUDED.owner_name,
      status = EXCLUDED.status,
      last_update = EXCLUDED.last_update,
      raw_data = EXCLUDED.raw_data,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

// ── Main import loop ────────────────────────────────────────────────────────
async function importDataset(name: string): Promise<void> {
  const config = OBJ_TYPES[name];
  if (!config) throw new Error(`Unknown dataset: ${name}`);

  const checkpointName = `uipv_${name}`;
  let page = getCheckpoint(checkpointName);
  let totalImported = 0;

  // First request to get total count
  const firstUrl = `${API_BASE}?obj_type=${config.type}&obj_state=2&page=${page}`;
  console.log(`\n📦 Starting ${name} (obj_type=${config.type}) from page ${page}...`);
  const firstResp = await fetchJSON(firstUrl);
  const totalRecords = firstResp.count;
  const resultsPerPage = firstResp.results?.length || 10;
  const totalPages = Math.ceil(totalRecords / resultsPerPage);
  console.log(`   Total: ${totalRecords.toLocaleString()} records, ${totalPages.toLocaleString()} pages`);

  let currentResp = firstResp;
  const startTime = Date.now();

  while (currentResp) {
    const records = currentResp.results || [];
    if (records.length === 0) break;

    // Extract and batch insert
    const batch: any[][] = [];
    for (const record of records) {
      try {
        if (config.table === 'trademarks') {
          batch.push(extractTrademark(record));
        } else {
          batch.push(extractPatent(record, config.type));
        }
      } catch (err: any) {
        console.warn(`  ⚠️ Skip record ${record.app_number}: ${err.message}`);
      }
    }

    const inserted = config.table === 'trademarks'
      ? await insertTrademarks(batch)
      : await insertPatents(batch);
    totalImported += inserted;

    // Progress
    if (page % 100 === 0 || page === 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const pagesPerSec = (page - getCheckpoint(checkpointName) + 1) / elapsed;
      const remaining = (totalPages - page) / pagesPerSec;
      console.log(
        `   Page ${page.toLocaleString()}/${totalPages.toLocaleString()} | ` +
        `Imported: ${totalImported.toLocaleString()} | ` +
        `Speed: ${pagesPerSec.toFixed(1)} pages/s | ` +
        `ETA: ${(remaining / 3600).toFixed(1)}h`
      );
    }

    // Checkpoint every 500 pages
    if (page % 500 === 0) {
      saveCheckpoint(checkpointName, page, totalImported);
    }

    // Next page
    if (!currentResp.next) break;
    await sleep(RATE_LIMIT_MS);
    page++;
    const nextUrl = `${API_BASE}?obj_type=${config.type}&obj_state=2&page=${page}`;
    currentResp = await fetchJSON(nextUrl);
  }

  saveCheckpoint(checkpointName, page, totalImported);
  console.log(`✅ ${name}: imported ${totalImported.toLocaleString()} records (${page} pages)`);
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const arg = process.argv[2] || 'all';
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏛️  UIPV/NIPO Intellectual Property Import');
  console.log('═══════════════════════════════════════════════════════════════');

  const datasets = arg === 'all'
    ? Object.keys(OBJ_TYPES)
    : [arg];

  for (const ds of datasets) {
    if (!OBJ_TYPES[ds]) {
      console.error(`❌ Unknown dataset: ${ds}. Options: ${Object.keys(OBJ_TYPES).join(', ')}, all`);
      process.exit(1);
    }
  }

  try {
    // Test DB connection
    const { rows } = await pool.query('SELECT 1');
    console.log('✅ Database connected');

    for (const ds of datasets) {
      await importDataset(ds);
    }
  } finally {
    await pool.end();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎉 Import complete!');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
