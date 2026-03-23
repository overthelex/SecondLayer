/**
 * Import intellectual property data from UIPV/NIPO (sis.nipo.gov.ua) into PostgreSQL.
 *
 * Downloads trademarks, patents, utility models, and industrial designs via paginated API.
 * Supports checkpoint/resume and LOCAL_ADDRESS binding for multi-IP parallelism.
 *
 * Usage:
 *   npx tsx src/scripts/import-uipv-ip.ts [trademarks|patents|utility_models|designs|all]
 *   LOCAL_ADDRESS=172.31.21.255 npx tsx src/scripts/import-uipv-ip.ts trademarks
 *
 * Env vars:
 *   DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB
 *   LOCAL_ADDRESS — source IP to bind outgoing requests (for multi-IP parallelism)
 *   RATE_LIMIT — ms between requests (default 1100)
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as https from 'https';
import { URL } from 'url';

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'https://sis.nipo.gov.ua/api/v1/open-data/';
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT || '1100');
const CHECKPOINT_DIR = '/tmp/uipv-import-checkpoints';
const LOCAL_ADDRESS = process.env.LOCAL_ADDRESS || undefined;

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

// ── HTTPS agent with localAddress binding ───────────────────────────────────
const httpsAgent = new https.Agent({
  localAddress: LOCAL_ADDRESS,
  keepAlive: true,
  maxSockets: 2,
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── HTTP fetch with localAddress binding ────────────────────────────────────
function fetchJSON(url: string, retries = 3): Promise<any> {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await doFetch(url);
        return resolve(result);
      } catch (err: any) {
        if (err.statusCode === 429) {
          console.warn(`  ⏳ Rate limited, waiting 5s (attempt ${attempt}/${retries})`);
          await sleep(5000);
          continue;
        }
        if (attempt === retries) return reject(err);
        console.warn(`  ⚠️ Fetch error (attempt ${attempt}/${retries}): ${err.message}`);
        await sleep(2000 * attempt);
      }
    }
    reject(new Error('All retries exhausted'));
  });
}

function doFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent: httpsAgent,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SecondLayer-Legal-Platform/1.0',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          return reject(Object.assign(new Error('Rate limited'), { statusCode: 429 }));
        }
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── Extract trademark fields ────────────────────────────────────────────────
function extractTrademark(record: any): any[] {
  const data = record.data || {};

  let markText = '';
  const wordMark = record.WordMarkSpecification?.MarkSignificantVerbalElement;
  if (Array.isArray(wordMark)) {
    markText = wordMark.map((w: any) => w['#text'] || '').filter(Boolean).join(' ');
  }

  let holderName = '', holderEdrpou = '', holderCountry = '';
  const holders = data.HolderDetails?.Holder;
  if (Array.isArray(holders) && holders.length > 0) {
    const h = holders[0]?.HolderAddressBook?.FormattedNameAddress;
    holderName = h?.Name?.FreeFormatName?.FreeFormatNameDetails?.FreeFormatNameLine || '';
    holderEdrpou = h?.Name?.FreeFormatName?.EDRPOU || '';
    holderCountry = h?.Address?.AddressCountryCode || '';
  }

  let applicantName = '', applicantEdrpou = '';
  const applicants = data.ApplicantDetails?.Applicant;
  if (Array.isArray(applicants) && applicants.length > 0) {
    const a = applicants[0]?.ApplicantAddressBook?.FormattedNameAddress;
    applicantName = a?.Name?.FreeFormatName?.FreeFormatNameDetails?.FreeFormatNameLine || '';
    applicantEdrpou = a?.Name?.FreeFormatName?.EDRPOU || '';
  }

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

  return [
    record.app_number,
    record.app_date ? record.app_date.split('T')[0] : null,
    record.registration_number || null,
    record.registration_date ? record.registration_date.split('T')[0] : null,
    data.ExpiryDate || null,
    markText || null,
    holderName || null,
    holderEdrpou || null,
    holderCountry || null,
    applicantName || null,
    applicantEdrpou || null,
    niceClasses.length > 0 ? niceClasses : null,
    niceDescriptions || null,
    data.application_status || data.registration_status_color || null,
    record.last_update || null,
    JSON.stringify(data),
  ];
}

// ── Extract patent fields ───────────────────────────────────────────────────
function extractPatent(record: any, objType: number): any[] {
  const data = record.data || {};

  const titles = data['I_54'];
  let titleUa = '', titleEn = '';
  if (Array.isArray(titles) && titles.length > 0) {
    titleUa = titles[0]?.['I_54.U'] || '';
    titleEn = titles[0]?.['I_54.E'] || '';
  }

  let abstractUa = '';
  const abs = data['AB'];
  if (Array.isArray(abs)) {
    const uaAbs = abs.find((a: any) => a['AB.L'] === 'UA') || abs[0];
    abstractUa = uaAbs?.['AB.T'] || '';
  }

  const ipcCodes = Array.isArray(data['IPC']) ? data['IPC'] : [];

  let ownerName = '', ownerCountry = '';
  const owners = data['I_73'];
  if (Array.isArray(owners) && owners.length > 0) {
    ownerName = owners[0]?.['I_73.N'] || '';
    ownerCountry = owners[0]?.['I_73.C'] || '';
  }

  const inventors = data['I_72'];
  let inventorNames: string[] = [];
  if (Array.isArray(inventors)) {
    inventorNames = inventors.map((i: any) => i['I_72.N.U'] || i['I_72.N.R'] || '').filter(Boolean);
  }

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
    data.registration_status_color || null,
    record.last_update || null,
    JSON.stringify(data),
  ];
}

// ── Batch insert ────────────────────────────────────────────────────────────
async function insertTrademarks(rows: any[][]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const r of rows) {
    const ph = [];
    for (const val of r) { ph.push(`$${idx++}`); values.push(val); }
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

async function insertPatents(rows: any[][]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;
  for (const r of rows) {
    const ph = [];
    for (const val of r) { ph.push(`$${idx++}`); values.push(val); }
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

  const firstUrl = `${API_BASE}?obj_type=${config.type}&obj_state=2&page=${page}`;
  console.log(`\n📦 ${name} (obj_type=${config.type}) from page ${page}, IP: ${LOCAL_ADDRESS || 'default'}`);
  const firstResp = await fetchJSON(firstUrl);
  const totalRecords = firstResp.count;
  const resultsPerPage = firstResp.results?.length || 10;
  const totalPages = Math.ceil(totalRecords / resultsPerPage);
  console.log(`   Total: ${totalRecords.toLocaleString()} records, ${totalPages.toLocaleString()} pages`);

  let currentResp = firstResp;
  const startTime = Date.now();
  const startPage = page;

  while (currentResp) {
    const records = currentResp.results || [];
    if (records.length === 0) break;

    const batch: any[][] = [];
    for (const record of records) {
      try {
        if (config.table === 'trademarks') {
          batch.push(extractTrademark(record));
        } else {
          batch.push(extractPatent(record, config.type));
        }
      } catch (err: any) {
        console.warn(`  ⚠️ Skip ${record.app_number}: ${err.message}`);
      }
    }

    const inserted = config.table === 'trademarks'
      ? await insertTrademarks(batch)
      : await insertPatents(batch);
    totalImported += inserted;

    if (page % 200 === 0 || page === startPage) {
      const elapsed = (Date.now() - startTime) / 1000;
      const pagesPerSec = Math.max(0.01, (page - startPage + 1) / elapsed);
      const remaining = (totalPages - page) / pagesPerSec;
      console.log(
        `   Page ${page.toLocaleString()}/${totalPages.toLocaleString()} | ` +
        `${totalImported.toLocaleString()} rows | ` +
        `${pagesPerSec.toFixed(2)} p/s | ` +
        `ETA: ${(remaining / 3600).toFixed(1)}h`
      );
    }

    if (page % 500 === 0) {
      saveCheckpoint(checkpointName, page, totalImported);
    }

    if (!currentResp.next) break;
    await sleep(RATE_LIMIT_MS);
    page++;
    const nextUrl = `${API_BASE}?obj_type=${config.type}&obj_state=2&page=${page}`;
    currentResp = await fetchJSON(nextUrl);
  }

  saveCheckpoint(checkpointName, page, totalImported);
  console.log(`✅ ${name}: ${totalImported.toLocaleString()} records (${page} pages)`);
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const arg = process.argv[2] || 'all';
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🏛️  UIPV Import | IP: ${LOCAL_ADDRESS || 'default'} | Rate: ${RATE_LIMIT_MS}ms`);
  console.log('═══════════════════════════════════════════════════════════════');

  const datasets = arg === 'all' ? Object.keys(OBJ_TYPES) : arg.split(',');

  for (const ds of datasets) {
    if (!OBJ_TYPES[ds.trim()]) {
      console.error(`❌ Unknown: ${ds}. Options: ${Object.keys(OBJ_TYPES).join(', ')}, all`);
      process.exit(1);
    }
  }

  try {
    await pool.query('SELECT 1');
    console.log('✅ DB connected');
    for (const ds of datasets) {
      await importDataset(ds.trim());
    }
  } finally {
    await pool.end();
  }

  console.log('\n🎉 Import complete!');
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
