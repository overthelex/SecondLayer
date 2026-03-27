/**
 * NAZK Declarations Import
 * Crawls public-api.nazk.gov.ua/v2/documents/list by year+type combinations.
 *
 * API limits: 100 results/page, max 100 pages = 10,000 per query.
 * Strategy: partition by declaration_year (2015-2026) × declaration_type (1-4)
 *
 * Usage:
 *   node dist/scripts/import-nazk-declarations.js                    # All years
 *   node dist/scripts/import-nazk-declarations.js --year=2024        # Specific year
 *   node dist/scripts/import-nazk-declarations.js --year=2020-2024   # Year range
 *   node dist/scripts/import-nazk-declarations.js --resume           # Skip already imported year+type combos
 */
import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import https from 'https';

const API_BASE = 'https://public-api.nazk.gov.ua/v2/documents/list';
const CURRENT_YEAR = new Date().getFullYear();
const DECLARATION_TYPES = [1, 2, 3, 4]; // annual, before dismissal, after dismissal, candidate
const TYPE_NAMES: Record<number, string> = {
  1: 'щорічна', 2: 'перед звільненням', 3: 'після звільнення', 4: 'кандидат'
};
const REQUEST_DELAY_MS = parseInt(process.env.NAZK_DELAY_MS || '300');
const MAX_PAGES = 100;

interface CliArgs {
  yearStart: number;
  yearEnd: number;
  resume: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { yearStart: 2015, yearEnd: CURRENT_YEAR, resume: false };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--year=')) {
      const val = arg.replace('--year=', '');
      if (val.includes('-')) {
        const [s, e] = val.split('-').map(Number);
        args.yearStart = s;
        args.yearEnd = e;
      } else {
        args.yearStart = args.yearEnd = parseInt(val);
      }
    } else if (arg === '--resume') {
      args.resume = true;
    }
  }

  return args;
}

function fetchPage(year: number, type: number, page: number): Promise<any> {
  const url = `${API_BASE}?declaration_year=${year}&declaration_type=${type}&page=${page}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(res.headers['retry-after'] || '5') * 1000;
        console.log(`\n  Rate limited, waiting ${retryAfter / 1000}s...`);
        setTimeout(() => fetchPage(year, type, page).then(resolve).catch(reject), retryAfter);
        return;
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDeclarantInfo(doc: any): {
  name: string; position: string; workplace: string; region: string;
  postType: string; postCategory: string; corruptionAffected: boolean;
  hasRealEstate: boolean; hasVehicles: boolean; hasSecurities: boolean;
  hasCorporateRights: boolean; hasIncome: boolean; totalIncome: number | null;
} {
  const data = doc.data || {};

  // Step 1 (section 2.1): declarant info
  const step1 = data.step_1?.data || {};
  const name = [step1.lastname, step1.firstname, step1.middlename].filter(Boolean).join(' ').trim()
    || doc.user_declarant_full_name || '';
  const position = step1.post?.post || doc.responsible_position || '';
  const workplace = step1.post?.office || step1.workPlace || '';
  const region = step1.actual_region || step1.region || '';
  const postType = doc.post_type || step1.postType || '';
  const postCategory = doc.post_category || step1.postCategory || '';
  const corruptionAffected = doc.corruption_affected === true || step1.corruptionAffected === '1';

  // Step 3: real estate
  const step3 = data.step_3?.data || {};
  const hasRealEstate = Object.keys(step3).length > 0;

  // Step 6: vehicles
  const step6 = data.step_6?.data || {};
  const hasVehicles = Object.keys(step6).length > 0;

  // Step 7: securities
  const step7 = data.step_7?.data || {};
  const hasSecurities = Object.keys(step7).length > 0;

  // Step 8: corporate rights
  const step8 = data.step_8?.data || {};
  const hasCorporateRights = Object.keys(step8).length > 0;

  // Step 11: income
  const step11 = data.step_11?.data || {};
  const hasIncome = Object.keys(step11).length > 0;
  let totalIncome: number | null = null;
  if (hasIncome) {
    let sum = 0;
    for (const key of Object.keys(step11)) {
      const entry = step11[key];
      const amount = parseFloat(entry?.sizeIncome || entry?.size || '0');
      if (!isNaN(amount)) sum += amount;
    }
    if (sum > 0) totalIncome = sum;
  }

  return {
    name, position, workplace, region, postType, postCategory, corruptionAffected,
    hasRealEstate, hasVehicles, hasSecurities, hasCorporateRights, hasIncome, totalIncome
  };
}

async function importNazk() {
  const args = parseArgs();
  console.log('='.repeat(60));
  console.log('NAZK Declarations Import');
  console.log(`Years: ${args.yearStart}-${args.yearEnd}, Types: 1-4`);
  console.log(`Delay between requests: ${REQUEST_DELAY_MS}ms`);
  console.log('='.repeat(60));

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5435'),
    user: process.env.POSTGRES_USER || 'openreyestr',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'openreyestr',
    max: 5,
  });

  let totalImported = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  // Get already imported year+type combos for resume
  const importedCombos = new Set<string>();
  if (args.resume) {
    const res = await pool.query(
      `SELECT declaration_year, declaration_type, COUNT(*) as cnt
       FROM nazk_declarations
       GROUP BY declaration_year, declaration_type
       HAVING COUNT(*) >= 9900`
    );
    for (const row of res.rows) {
      importedCombos.add(`${row.declaration_year}_${row.declaration_type}`);
    }
    if (importedCombos.size > 0) {
      console.log(`Resume mode: skipping ${importedCombos.size} fully imported year+type combos`);
    }
  }

  for (let year = args.yearStart; year <= args.yearEnd; year++) {
    for (const type of DECLARATION_TYPES) {
      const comboKey = `${year}_${type}`;
      if (args.resume && importedCombos.has(comboKey)) {
        console.log(`\nSkipping ${year} type ${type} (${TYPE_NAMES[type]}) — already imported`);
        continue;
      }

      console.log(`\n--- ${year}, type ${type} (${TYPE_NAMES[type]}) ---`);

      let page = 1;
      let comboImported = 0;
      let comboUpdated = 0;
      let comboErrors = 0;
      let hasMore = true;

      while (hasMore && page <= MAX_PAGES) {
        try {
          const response = await fetchPage(year, type, page);

          // API returns { data: [...], page: N, count: N } or { data: { items: [...] } }
          const items = Array.isArray(response?.data) ? response.data
            : (response?.data?.items || response?.items || []);
          if (items.length === 0) {
            hasMore = false;
            break;
          }

          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            for (const doc of items) {
              try {
                const declId = doc.id || doc.declaration_id;
                if (!declId) continue;

                const info = extractDeclarantInfo(doc);
                let submissionDate: string | null = null;
                if (doc.date) {
                  try {
                    const ts = typeof doc.date === 'number' ? doc.date : parseInt(doc.date);
                    if (!isNaN(ts) && ts > 0) submissionDate = new Date(ts * 1000).toISOString();
                  } catch { /* skip */ }
                }

                const result = await client.query(
                  `INSERT INTO nazk_declarations (
                    declaration_id, declarant_id, declaration_type, declaration_year,
                    declarant_name, declarant_position, declarant_workplace, declarant_region,
                    post_type, post_category, corruption_affected, submission_date,
                    has_real_estate, has_vehicles, has_securities, has_corporate_rights,
                    has_income, total_income_declared
                  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                  ON CONFLICT (declaration_id) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP
                  RETURNING (xmax = 0) AS is_insert`,
                  [
                    String(declId),
                    doc.user_declarant_id || null,
                    type,
                    year,
                    info.name,
                    info.position,
                    info.workplace,
                    info.region,
                    info.postType,
                    info.postCategory,
                    info.corruptionAffected,
                    submissionDate,
                    info.hasRealEstate,
                    info.hasVehicles,
                    info.hasSecurities,
                    info.hasCorporateRights,
                    info.hasIncome,
                    info.totalIncome
                  ]
                );

                if (result.rows[0]?.is_insert) comboImported++;
                else comboUpdated++;
              } catch (err) {
                comboErrors++;
                if (comboErrors <= 3) console.error(`\n  Error:`, (err as Error).message?.substring(0, 200));
              }
            }

            await client.query('COMMIT');
          } finally {
            client.release();
          }

          process.stdout.write(`\r  Page ${page}/${MAX_PAGES} | New: ${comboImported} | Updated: ${comboUpdated} | Errors: ${comboErrors}`);

          if (items.length < 100) {
            hasMore = false;
          } else {
            page++;
            await sleep(REQUEST_DELAY_MS);
          }
        } catch (err) {
          console.error(`\n  Page ${page} fetch error:`, (err as Error).message);
          // Retry after longer delay
          await sleep(REQUEST_DELAY_MS * 5);
          comboErrors++;
          if (comboErrors > 20) {
            console.error(`\n  Too many errors, skipping ${year} type ${type}`);
            break;
          }
        }
      }

      console.log(`\n  Result: ${comboImported} new, ${comboUpdated} updated, ${comboErrors} errors (${page - 1} pages)`);
      totalImported += comboImported;
      totalUpdated += comboUpdated;
      totalErrors += comboErrors;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL: ${totalImported} new, ${totalUpdated} updated, ${totalErrors} errors`);

  const count = await pool.query('SELECT COUNT(*) FROM nazk_declarations');
  console.log(`Total in database: ${count.rows[0].count}`);

  await pool.end();
}

importNazk().catch(e => { console.error(e); process.exit(1); });
