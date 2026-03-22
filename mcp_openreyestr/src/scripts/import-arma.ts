/**
 * ARMA Seized Assets Import
 * Downloads JSON from data.gov.ua and imports into PostgreSQL.
 * Uses streaming parser for large files (600+ MB).
 *
 * Usage: node dist/scripts/import-arma.js [--skip-download]
 *
 * JSON structure: { results: [{ columns: [...], items: [...] }] }
 * Item fields: id, description, name, state, docnum, decisiondate, numerdr,
 *              props, props_1, props_2, dateaction, actionincomesum, dectypename
 */
import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';

const ARMA_URL = 'https://data.gov.ua/dataset/d6cc6909-4098-47bc-a2e4-96182f446982/resource/02435739-9481-40ca-b40f-6379b6ed5949/download/edra_opendata.json';
const DATA_DIR = process.env.NAIS_DATA_DIR || path.join(__dirname, '../../data/nais');
const BATCH_SIZE = 500;

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (url: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, { timeout: 10 * 60 * 1000 }, (response: any) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const loc = response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, url).href;
          return follow(loc, redirects + 1);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes % (5 * 1024 * 1024) < chunk.length) {
            process.stdout.write(`\r  Downloaded: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
          }
        });
        response.pipe(file);
        file.on('finish', () => { file.close(); console.log(`\n  Total: ${(bytes / 1024 / 1024).toFixed(1)} MB`); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

function parseDate(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string') return null;
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}

/**
 * Stream-parse the ARMA JSON file.
 * Structure: { results: [{ columns: [...], items: [ {item}, {item}, ... ] }] }
 *
 * Each item is on its own line (or close to it).
 * Strategy: skip to "items": line, then parse each {...} object between commas.
 */
async function* readItemsFromFile(filePath: string): AsyncGenerator<any> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let foundItems = false;

  for await (const line of rl) {
    const trimmed = line.trim();

    if (!foundItems) {
      // "items": may be on a line, with [ on the next line
      if (trimmed.includes('"items":') || trimmed === '[') {
        if (trimmed === '[' || trimmed.endsWith('[')) {
          foundItems = true;
        }
        // If "items": is on this line but [ is not, next line with [ will trigger
      }
      continue;
    }

    // End of items array
    if (trimmed === ']' || trimmed.startsWith(']}')) return;

    // Each line is a JSON object, possibly with leading/trailing comma
    let jsonStr = trimmed;
    if (jsonStr.startsWith(',')) jsonStr = jsonStr.slice(1);
    if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);
    if (!jsonStr.startsWith('{')) continue;

    try {
      yield JSON.parse(jsonStr);
    } catch {
      // Skip malformed lines
    }
  }
}

async function importArma() {
  const skipDownload = process.argv.includes('--skip-download');
  const jsonPath = path.join(DATA_DIR, 'arma_assets.json');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!skipDownload) {
    console.log('Downloading ARMA seized assets from data.gov.ua...');
    await downloadFile(ARMA_URL, jsonPath);
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const fileSizeMB = (fs.statSync(jsonPath).size / 1024 / 1024).toFixed(1);
  console.log(`Parsing ${fileSizeMB} MB JSON (streaming)...`);

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5435'),
    user: process.env.POSTGRES_USER || 'openreyestr',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'openreyestr',
    max: 5,
  });

  let imported = 0;
  let updated = 0;
  let errors = 0;
  let total = 0;
  let batch: any[] = [];

  async function flushBatch(records: any[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const record of records) {
        try {
          const hash = crypto.createHash('md5').update(JSON.stringify(record)).digest('hex');

          // ARMA fields mapping
          const caseNumber = record.docnum || null;
          const caseDate = parseDate(record.decisiondate);
          const assetType = record.dectypename || null;
          const assetDesc = record.description || null;
          const ownerName = record.name || null;
          const numerdr = record.numerdr || null;
          const region = null; // Not directly in data
          const status = record.state || null;
          const arrestDate = parseDate(record.dateaction);
          const actionSum = record.actionincomesum || null;

          // props_1 often contains court info: "Найменування суду: ...; ПІБ судді: ..."
          const courtName = record.props_1 ? (record.props_1.match(/Найменування суду:\s*([^;]+)/)?.[1]?.trim() || null) : null;
          const judgeName = record.props_1 ? (record.props_1.match(/ПІБ судді:\s*([^;]+)/)?.[1]?.trim() || null) : null;

          const result = await client.query(
            `INSERT INTO arma_assets (case_number, case_date, court_name, asset_type, asset_description,
              owner_name, owner_type, owner_edrpou, region, status, arrest_date, transfer_date, manager,
              raw_data, source_url, content_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (content_hash) DO UPDATE SET
               raw_data = EXCLUDED.raw_data, updated_at = CURRENT_TIMESTAMP
             RETURNING (xmax = 0) AS is_insert`,
            [caseNumber, caseDate, courtName, assetType, assetDesc,
             ownerName, null, numerdr, region, status, arrestDate, null, judgeName,
             JSON.stringify(record), ARMA_URL, hash]
          );

          if (result.rows[0]?.is_insert) imported++;
          else updated++;
        } catch (err) {
          errors++;
          if (errors <= 5) console.error(`\n  Error:`, (err as Error).message?.substring(0, 200));
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

  for await (const item of readItemsFromFile(jsonPath)) {
    batch.push(item);
    total++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      process.stdout.write(`\r  Records: ${total} | New: ${imported} | Updated: ${updated} | Errors: ${errors}`);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await flushBatch(batch);
  }

  console.log(`\n\nDone: ${imported} new, ${updated} updated, ${errors} errors (${total} total parsed)`);

  const count = await pool.query('SELECT COUNT(*) FROM arma_assets');
  console.log(`Total in database: ${count.rows[0].count}`);

  await pool.end();
}

importArma().catch(e => { console.error(e); process.exit(1); });
