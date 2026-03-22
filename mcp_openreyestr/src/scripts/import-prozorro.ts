/**
 * Prozorro Public Procurement Import
 * Crawls public-api.prozorro.gov.ua and imports tender metadata.
 *
 * Strategy:
 * 1. Paginate through /tenders list (100 per page, offset-based)
 * 2. For each batch, fetch individual tender details (N concurrent)
 * 3. Extract key DD fields: buyer, amount, status, CPV
 * 4. Store metadata + compact raw_data (no documents/bids)
 *
 * Usage:
 *   node dist/scripts/import-prozorro.js                          # From beginning (2015)
 *   node dist/scripts/import-prozorro.js --resume                 # Continue from last offset
 *   node dist/scripts/import-prozorro.js --year=2024              # Start from ~2024
 *   node dist/scripts/import-prozorro.js --limit=10000            # Stop after N tenders
 */
import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import https from 'https';
import http from 'http';

const API_BASE = 'https://public-api.prozorro.gov.ua/api/2.5';
const LIST_BATCH = 100;
const DETAIL_CONCURRENCY = parseInt(process.env.PROZORRO_CONCURRENCY || '5');
const REQUEST_DELAY_MS = parseInt(process.env.PROZORRO_DELAY_MS || '100');
const DB_BATCH_SIZE = 100;

interface CliArgs {
  resume: boolean;
  year: number | null;
  limit: number;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { resume: false, year: null, limit: Infinity };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--resume') args.resume = true;
    else if (arg.startsWith('--year=')) args.year = parseInt(arg.replace('--year=', ''));
    else if (arg.startsWith('--limit=')) args.limit = parseInt(arg.replace('--limit=', ''));
  }
  return args;
}

function fetchJson(url: string, retries = 3): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 429) {
        const retryAfter = parseInt(res.headers['retry-after'] || '10') * 1000;
        console.log(`\n  Rate limited, waiting ${retryAfter / 1000}s...`);
        setTimeout(() => fetchJson(url, retries).then(resolve).catch(reject), retryAfter);
        return;
      }
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        if (retries > 0) {
          setTimeout(() => fetchJson(url, retries - 1).then(resolve).catch(reject), 2000);
          return;
        }
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => fetchJson(url, retries - 1).then(resolve).catch(reject), 2000);
      } else reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        setTimeout(() => fetchJson(url, retries - 1).then(resolve).catch(reject), 2000);
      } else reject(new Error('Timeout'));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch N urls concurrently with max parallelism */
async function fetchConcurrent(urls: string[], concurrency: number): Promise<any[]> {
  const results: any[] = new Array(urls.length);
  let idx = 0;

  async function worker() {
    while (idx < urls.length) {
      const i = idx++;
      try {
        results[i] = await fetchJson(urls[i]);
      } catch {
        results[i] = null;
      }
      if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function extractTenderData(tender: any): any | null {
  if (!tender?.data) return null;
  const d = tender.data;

  const buyer = d.procuringEntity || {};
  const buyerName = buyer.name || buyer.identifier?.legalName || null;
  const buyerEdrpou = buyer.identifier?.id || null;
  const buyerRegion = buyer.address?.region || null;

  const value = d.value || {};
  const amount = value.amount || null;
  const currency = value.currency || 'UAH';

  const items = d.items || [];
  const firstItem = items[0] || {};
  const cpvCode = firstItem.classification?.id || null;
  const cpvDesc = firstItem.classification?.description || null;

  const tenderPeriod = d.tenderPeriod || {};

  // Compact raw_data: exclude heavy fields
  const compact: any = {
    tenderID: d.tenderID,
    status: d.status,
    procurementMethod: d.procurementMethod,
    procurementMethodType: d.procurementMethodType,
    title: d.title,
    value: d.value,
    procuringEntity: {
      name: buyerName,
      identifier: buyer.identifier,
      address: buyer.address,
    },
    awardCriteria: d.awardCriteria,
    dateCreated: d.dateCreated,
    dateModified: d.dateModified,
    numberOfBids: d.numberOfBids,
  };

  return {
    tender_id: d.id,
    tender_number: d.tenderID || null,
    title: (d.title || '').substring(0, 1000),
    status: d.status || null,
    procurement_method: d.procurementMethod || null,
    procurement_method_type: d.procurementMethodType || null,
    buyer_name: buyerName,
    buyer_edrpou: buyerEdrpou,
    buyer_region: buyerRegion,
    amount,
    currency,
    cpv_code: cpvCode,
    cpv_description: cpvDesc,
    date_created: d.dateCreated || null,
    date_modified: d.dateModified || null,
    tender_start: tenderPeriod.startDate?.substring(0, 10) || null,
    tender_end: tenderPeriod.endDate?.substring(0, 10) || null,
    award_criteria: d.awardCriteria || null,
    raw_data: compact,
  };
}

async function importProzorro() {
  const args = parseArgs();
  console.log('='.repeat(60));
  console.log('PROZORRO Public Procurement Import');
  console.log(`Concurrency: ${DETAIL_CONCURRENCY}, Delay: ${REQUEST_DELAY_MS}ms`);
  if (args.limit < Infinity) console.log(`Limit: ${args.limit} tenders`);
  console.log('='.repeat(60));

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5435'),
    user: process.env.POSTGRES_USER || 'openreyestr',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'openreyestr',
    max: 5,
  });

  // Get resume offset
  let offset = '';
  if (args.resume) {
    const res = await pool.query(
      `SELECT date_modified FROM prozorro_tenders ORDER BY date_modified ASC LIMIT 1`
    );
    if (res.rows.length > 0) {
      // Convert to Prozorro timestamp format
      const ts = new Date(res.rows[0].date_modified).getTime() / 1000;
      offset = `${ts}`;
      console.log(`Resuming from offset: ${offset}`);
    }
  }

  // Year-based start offset (approximate)
  if (args.year) {
    const ts = new Date(`${args.year}-01-01T00:00:00Z`).getTime() / 1000;
    offset = `${ts}`;
    console.log(`Starting from year ${args.year} (offset ~${offset})`);
  }

  let totalImported = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let totalFetched = 0;
  let pageCount = 0;
  let lastUrl = `${API_BASE}/tenders?limit=${LIST_BATCH}${offset ? `&offset=${offset}` : ''}`;
  const startTime = Date.now();

  while (lastUrl && totalFetched < args.limit) {
    // 1. Fetch list page
    const listResponse = await fetchJson(lastUrl);
    if (!listResponse?.data || listResponse.data.length === 0) {
      console.log('\nNo more tenders.');
      break;
    }

    const tenderIds: string[] = listResponse.data.map((t: any) => t.id);
    pageCount++;

    // 2. Fetch details concurrently
    const detailUrls = tenderIds.map(id => `${API_BASE}/tenders/${id}`);
    const details = await fetchConcurrent(detailUrls, DETAIL_CONCURRENCY);

    // 3. Extract and insert
    const records = details
      .map(d => extractTenderData(d))
      .filter(Boolean);

    if (records.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of records) {
          try {
            const result = await client.query(
              `INSERT INTO prozorro_tenders (
                tender_id, tender_number, title, status, procurement_method, procurement_method_type,
                buyer_name, buyer_edrpou, buyer_region, amount, currency,
                cpv_code, cpv_description, date_created, date_modified,
                tender_start, tender_end, award_criteria, raw_data
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
              ON CONFLICT (tender_id) DO UPDATE SET
                status = EXCLUDED.status, date_modified = EXCLUDED.date_modified,
                raw_data = EXCLUDED.raw_data, updated_at = CURRENT_TIMESTAMP
              RETURNING (xmax = 0) AS is_insert`,
              [
                r.tender_id, r.tender_number, r.title, r.status,
                r.procurement_method, r.procurement_method_type,
                r.buyer_name, r.buyer_edrpou, r.buyer_region,
                r.amount, r.currency,
                r.cpv_code, r.cpv_description,
                r.date_created, r.date_modified,
                r.tender_start, r.tender_end, r.award_criteria,
                JSON.stringify(r.raw_data)
              ]
            );
            if (result.rows[0]?.is_insert) totalImported++;
            else totalUpdated++;
          } catch (err) {
            totalErrors++;
            if (totalErrors <= 5) console.error(`\n  DB Error:`, (err as Error).message?.substring(0, 200));
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Batch failed:', err);
      } finally {
        client.release();
      }
    }

    totalFetched += tenderIds.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (totalFetched / elapsed).toFixed(0);

    process.stdout.write(
      `\r  Page ${pageCount} | Fetched: ${totalFetched} | New: ${totalImported} | Updated: ${totalUpdated} | Errors: ${totalErrors} | ${rate}/s`
    );

    // 4. Next page
    if (listResponse.next_page?.uri) {
      lastUrl = listResponse.next_page.uri;
    } else {
      break;
    }

    // Small delay between list pages
    await sleep(50);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`Done in ${elapsed}s: ${totalImported} new, ${totalUpdated} updated, ${totalErrors} errors`);

  const count = await pool.query('SELECT COUNT(*) FROM prozorro_tenders');
  console.log(`Total in database: ${count.rows[0].count}`);

  // Save offset for resume
  if (lastUrl) {
    console.log(`Last offset URL: ${lastUrl.substring(0, 120)}...`);
  }

  await pool.end();
}

importProzorro().catch(e => { console.error(e); process.exit(1); });
