/**
 * Import major shareholders (5%+) data from НКЦПФР (NSSMC) API into PostgreSQL.
 *
 * Iterates over all EDRPOU codes from openreyestr entities and queries NSSMC API
 * for each one to find significant shareholders.
 *
 * Strategy: Fetch known EDRPOU codes of joint stock companies (АТ/ПАТ/ПрАТ) from
 * existing DB tables, then query NSSMC API for each. Also supports direct CSV import
 * from data.gov.ua quarterly dumps.
 *
 * Usage:
 *   npx tsx src/scripts/import-nkcpfr-owners.ts [api|csv <path>]
 *   REPORT_DATE=2025-12-31 npx tsx src/scripts/import-nkcpfr-owners.ts api
 *
 * Env vars:
 *   DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB
 *   REPORT_DATE (default: 2025-12-31)
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──────────────────────────────────────────────────────────────────
const NSSMC_API = 'https://www.nssmc.gov.ua/api/owners';
const RATE_LIMIT_MS = 500; // 2 req/sec to be safe
const BATCH_INSERT_SIZE = 100;
const CHECKPOINT_DIR = '/tmp/nkcpfr-import-checkpoints';
const REPORT_DATE = process.env.REPORT_DATE || '2025-12-31';

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
function getCheckpoint(name: string): { idx: number; imported: number } {
  const file = `${CHECKPOINT_DIR}/${name}.json`;
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return { idx: 0, imported: 0 };
}

function saveCheckpoint(name: string, idx: number, imported: number): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(`${CHECKPOINT_DIR}/${name}.json`, JSON.stringify({ idx, imported, ts: new Date().toISOString() }));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Fetch from NSSMC API ────────────────────────────────────────────────────
async function fetchOwners(edrpou: string, reportDate: string, retries = 3): Promise<any[]> {
  const url = `${NSSMC_API}?z_edre=${edrpou}&fid=${reportDate}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SecondLayer-Legal-Platform/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 404 || response.status === 204) return [];
      if (response.status === 429) {
        console.warn(`  ⏳ Rate limited, waiting 5s`);
        await sleep(5000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '' || text.trim() === '[]') return [];

      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [];
    } catch (err: any) {
      if (attempt === retries) {
        if (err.message?.includes('timeout') || err.name === 'AbortError') return [];
        throw err;
      }
      await sleep(1000 * attempt);
    }
  }
  return [];
}

// ── Batch insert ────────────────────────────────────────────────────────────
async function insertOwners(records: any[]): Promise<number> {
  if (records.length === 0) return 0;

  // Deduplicate within batch by unique key
  const seen = new Set<string>();
  const deduped = records.filter(r => {
    const key = `${r.fid || REPORT_DATE}|${r.z_edre || ''}|${r.z_kedevl && r.z_kedevl !== '.' ? r.z_kedevl : ''}|${r.z_namev1 || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of deduped) {
    const ph = [];
    const fields = [
      r.fid || REPORT_DATE,
      r.z_edre || '',
      r.z_ename || null,
      r.z_isin || null,
      r.z_kedevl && r.z_kedevl !== '.' ? r.z_kedevl : null,
      r.z_namev1 || null,
      r.z_namev2 || null,
      r.z_videp || null,
      r.z_skach != null ? r.z_skach : null,
      r.z_nom_v != null ? r.z_nom_v : null,
      r.z_kisor != null ? r.z_kisor : null,
      r.vlkraina != null ? r.vlkraina : null,
      JSON.stringify(r),
    ];
    for (const val of fields) {
      ph.push(`$${idx++}`);
      values.push(val);
    }
    placeholders.push(`(${ph.join(',')})`);
  }

  const sql = `
    INSERT INTO opendata_securities_owners
      (report_date, issuer_edrpou, issuer_name, isin_code, owner_edrpou,
       owner_name, owner_name_alt, owner_type, share_percent, nominal_value,
       share_count, country_code, raw_data)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (report_date, issuer_edrpou, coalesce(owner_edrpou, ''), coalesce(owner_name, ''))
    DO UPDATE SET
      issuer_name = EXCLUDED.issuer_name,
      share_percent = EXCLUDED.share_percent,
      nominal_value = EXCLUDED.nominal_value,
      raw_data = EXCLUDED.raw_data,
      imported_at = NOW()
  `;

  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

// ── Import via API (iterate known EDRPOU codes) ────────────────────────────
async function importViaAPI(): Promise<void> {
  console.log(`\n📊 Fetching joint stock company EDRPOU codes from DB...`);

  // Get EDRPOU codes of АТ/ПАТ/ПрАТ from various tables
  const { rows: edrpouRows } = await pool.query(`
    SELECT DISTINCT code FROM (
      -- From opensanctions (if available)
      SELECT DISTINCT raw_data->>'registrationNumber' as code
      FROM opendata_edrnpa_cards
      WHERE raw_data->>'registrationNumber' IS NOT NULL
        AND length(raw_data->>'registrationNumber') = 8
      LIMIT 0
    ) sub WHERE code IS NOT NULL
    UNION
    -- Direct: query all 8-digit issuer EDRPOU codes already in securities_owners
    SELECT DISTINCT issuer_edrpou as code FROM opendata_securities_owners WHERE issuer_edrpou IS NOT NULL
  `).catch(() => ({ rows: [] }));

  // If no existing codes, use a broader approach: scan known company registries
  // For now, we'll use a list of reporting dates and do a name-based search
  const reportDates = [
    '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31',
    '2024-12-31', '2024-09-30', '2024-06-30', '2024-03-31',
  ];

  if (edrpouRows.length > 0) {
    console.log(`   Found ${edrpouRows.length} known EDRPOU codes`);
    const checkpoint = getCheckpoint('nkcpfr_api');
    let totalImported = checkpoint.imported;

    for (let i = checkpoint.idx; i < edrpouRows.length; i++) {
      const edrpou = edrpouRows[i].code;
      const owners = await fetchOwners(edrpou, REPORT_DATE);

      if (owners.length > 0) {
        const inserted = await insertOwners(owners);
        totalImported += inserted;
        console.log(`   ${edrpou}: ${owners.length} owners (total: ${totalImported})`);
      }

      if (i % 100 === 0) {
        saveCheckpoint('nkcpfr_api', i, totalImported);
        console.log(`   Progress: ${i}/${edrpouRows.length} companies checked`);
      }

      await sleep(RATE_LIMIT_MS);
    }

    console.log(`✅ API import: ${totalImported} owner records`);
    return;
  }

  // Fallback: use CSV import approach or known large issuers
  console.log('   No existing EDRPOU codes found. Using known major issuers...');

  // Top Ukrainian joint stock companies (banks, energy, etc.)
  const knownIssuers = [
    '00032112', // Naftogaz
    '00032129', // Centrenergo
    '14360570', // PrivatBank
    '09807750', // Oschadbank
    '21685166', // Ukreximbank
    '20042839', // Turboatom
    '00130820', // Ukrposhta
    '00032680', // Ukrtransnafta
    '32945610', // Kernel
    '19218458', // Raiffeisen Bank
    '04107996', // UkrSibbank
    '00034097', // Zaporizhstal
    '00191164', // Ukrhydroenergo
    '00135881', // Odessa Portside Plant
    '00130850', // Ukrzaliznytsia
    '05839888', // DTEK
    '31553797', // MHP
    '14352406', // Prominvestbank
    '00016756', // Motor Sich
    '05932367', // Metinvest
    '14282829', // First Ukrainian Int'l Bank
  ];

  let totalImported = 0;
  for (const reportDate of reportDates) {
    console.log(`\n📅 Report date: ${reportDate}`);
    for (const edrpou of knownIssuers) {
      const owners = await fetchOwners(edrpou, reportDate);
      if (owners.length > 0) {
        const inserted = await insertOwners(owners);
        totalImported += inserted;
        console.log(`   ${edrpou}: ${owners.length} owners`);
      }
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Also try name-based search for broader coverage
  console.log('\n🔍 Searching by name patterns...');
  const searchNames = ['банк', 'енерго', 'нафто', 'метал', 'телеком', 'страхов', 'фарм'];

  for (const name of searchNames) {
    try {
      const url = `${NSSMC_API}?z_ename=${encodeURIComponent(name)}&fid=${REPORT_DATE}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SecondLayer-Legal-Platform/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim() !== '[]') {
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > 0) {
            const inserted = await insertOwners(data);
            totalImported += inserted;
            console.log(`   "${name}": ${data.length} records`);
          }
        }
      }
      await sleep(RATE_LIMIT_MS);
    } catch (err: any) {
      console.warn(`   ⚠️ Search "${name}" failed: ${err.message}`);
    }
  }

  console.log(`\n✅ API import complete: ${totalImported} owner records`);
}

// ── Import from CSV (data.gov.ua quarterly dumps) ───────────────────────────
async function importFromCSV(csvPath: string): Promise<void> {
  console.log(`\n📄 Importing from CSV: ${csvPath}`);

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    console.log('   Empty CSV');
    return;
  }

  // Parse header
  const separator = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
  console.log(`   Headers: ${header.join(', ')}`);
  console.log(`   Rows: ${lines.length - 1}`);

  let totalImported = 0;
  let batch: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
    const record: any = {};
    header.forEach((h, idx) => {
      record[h] = cols[idx] || null;
    });

    // Map CSV columns to our schema
    const mapped: any = {
      fid: record['fid'] || record['report_date'] || REPORT_DATE,
      z_edre: record['z_edre'] || record['edrpou'] || '',
      z_ename: record['z_ename'] || record['issuer_name'] || null,
      z_isin: record['z_isin'] || null,
      z_kedevl: record['z_kedevl'] || null,
      z_namev1: record['z_namev1'] || record['owner_name'] || null,
      z_namev2: record['z_namev2'] || null,
      z_videp: record['z_videp'] || null,
      z_skach: parseFloat(record['z_skach'] || '0') || null,
      z_nom_v: parseFloat(record['z_nom_v'] || '0') || null,
      z_kisor: parseInt(record['z_kisor'] || '0') || null,
      vlkraina: parseInt(record['vlkraina'] || '0') || null,
    };

    batch.push(mapped);

    if (batch.length >= BATCH_INSERT_SIZE) {
      const inserted = await insertOwners(batch);
      totalImported += inserted;
      batch = [];

      if (i % 1000 === 0) {
        console.log(`   Progress: ${i}/${lines.length - 1} rows, imported: ${totalImported}`);
      }
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const inserted = await insertOwners(batch);
    totalImported += inserted;
  }

  console.log(`✅ CSV import: ${totalImported} records from ${csvPath}`);
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = process.argv[2] || 'api';

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📈 НКЦПФР Major Shareholders Import');
  console.log(`   Mode: ${mode}, Report date: ${REPORT_DATE}`);
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Test DB connection
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    if (mode === 'csv') {
      const csvPath = process.argv[3];
      if (!csvPath) {
        console.error('❌ CSV path required: npx tsx import-nkcpfr-owners.ts csv <path>');
        process.exit(1);
      }
      await importFromCSV(csvPath);
    } else {
      await importViaAPI();
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
