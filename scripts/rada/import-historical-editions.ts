#!/usr/bin/env npx tsx
/**
 * Import Historical Legislation Editions
 *
 * Downloads all historical editions from zakon.rada.gov.ua/laws/show/{radaId}/ed{YYYYMMDD}
 * and imports them into PostgreSQL with proper version_date tracking.
 *
 * Usage:
 *   npx tsx scripts/rada/import-historical-editions.ts --code=ЦК
 *   npx tsx scripts/rada/import-historical-editions.ts --all
 *   npx tsx scripts/rada/import-historical-editions.ts --resume
 *   npx tsx scripts/rada/import-historical-editions.ts --code=ЦК --from=20100101 --to=20200101
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';

// ─── Config ──────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = path.resolve(__dirname);
const PROGRESS_FILE = path.join(SCRIPTS_DIR, 'historical-editions-progress.json');
const BASE_URL = 'https://zakon.rada.gov.ua';
const RATE_LIMIT = 2; // requests per second
const MAX_RETRIES = 3;
const CHECKPOINT_INTERVAL = 5;

const CODES: Array<{ rada_id: string; short_title: string }> = [
  { rada_id: '254к/96-ВР', short_title: 'КУ' },
  { rada_id: '2947-14', short_title: 'СК' },
  { rada_id: '1129-15', short_title: 'КВК' },
  { rada_id: '2768-14', short_title: 'ЗК' },
  { rada_id: '322-08', short_title: 'КЗпП' },
  { rada_id: '2755-17', short_title: 'ПК' },
  { rada_id: '436-15', short_title: 'ГК' },
  { rada_id: '1798-12', short_title: 'ГПК' },
  { rada_id: '2747-15', short_title: 'КАС' },
  { rada_id: '2341-14', short_title: 'КК' },
  { rada_id: '80731-10', short_title: 'КУпАП' },
  { rada_id: '4651-17', short_title: 'КПК' },
  { rada_id: '1618-15', short_title: 'ЦПК' },
  { rada_id: '4495-17', short_title: 'МК' },
  { rada_id: '435-15', short_title: 'ЦК' },
  { rada_id: '5403-17', short_title: 'КЦЗ' },
];

// ─── Token Bucket Rate Limiter ───────────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private waiters: Array<() => void> = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private rate: number, private maxTokens: number) {
    this.tokens = maxTokens;
    this.interval = setInterval(() => this.refill(), 1000 / rate);
  }

  private refill(): void {
    if (this.tokens < this.maxTokens) {
      this.tokens++;
    }
    if (this.waiters.length > 0 && this.tokens > 0) {
      this.tokens--;
      const resolve = this.waiters.shift()!;
      resolve();
    }
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  destroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const resolve of this.waiters) resolve();
    this.waiters = [];
  }
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

function createHttpClient(): AxiosInstance {
  return axios.create({
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'uk,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
    },
    decompress: true,
    validateStatus: () => true,
  });
}

// ─── Retry ───────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.error(`  Attempt ${attempt} failed: ${err.message}, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// ─── Progress Tracking ───────────────────────────────────────────────────────

interface CodeProgress {
  rada_id: string;
  short_title: string;
  total_editions: number;
  completed_editions: string[];
  failed_editions: string[];
}

interface OverallProgress {
  codes: CodeProgress[];
  started_at: string;
  last_updated: string;
}

function loadProgress(): OverallProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { codes: [], started_at: new Date().toISOString(), last_updated: new Date().toISOString() };
}

function saveProgress(progress: OverallProgress): void {
  progress.last_updated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function getCodeProgress(progress: OverallProgress, radaId: string, shortTitle: string): CodeProgress {
  let cp = progress.codes.find(c => c.rada_id === radaId);
  if (!cp) {
    cp = { rada_id: radaId, short_title: shortTitle, total_editions: 0, completed_editions: [], failed_editions: [] };
    progress.codes.push(cp);
  }
  return cp;
}

// ─── Article Parser ──────────────────────────────────────────────────────────

function extractArticlesFromEditionHtml(html: string): Array<{ article_number: string; title?: string; full_text: string; byte_size: number }> {
  const articles: Array<{ article_number: string; title?: string; full_text: string; byte_size: number }> = [];
  const seen = new Set<string>();

  // Try <pre><b> format first (historical editions)
  const preBoldRegex = /<b>Стаття\s+(\d+(?:-\d+)?)\.?<\/b>\s*(.*?)(?=<b>Стаття\s+\d|<\/pre>\s*$|$)/gs;
  let match;
  while ((match = preBoldRegex.exec(html)) !== null) {
    const artNum = match[1].trim();
    if (seen.has(artNum)) continue;
    seen.add(artNum);

    let body = match[2];
    body = body.replace(/<br\s*\/?>/gi, '\n');
    body = body.replace(/<b>([^<]*)<\/b>/g, '$1');
    body = body.replace(/<[^>]+>/g, ' ');
    body = body.replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&');
    body = body.replace(/\{[^}]*\}/g, '');
    body = body.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    if (body.length < 5) continue;

    const firstLine = body.split('\n')[0].trim();
    articles.push({
      article_number: artNum,
      title: firstLine.length < 200 ? firstLine : undefined,
      full_text: body,
      byte_size: Buffer.byteLength(body, 'utf8'),
    });
  }

  if (articles.length >= 3) return articles;

  // Fallback: <span class=rvts9> format (current /print pages)
  seen.clear();
  articles.length = 0;
  const rvtsRegex = /<span\s+class=["']?rvts9["']?>\s*Стаття\s+(\d+(?:-\d+)?)\.?\s*([^<]*)<\/span>\s*(.*?)(?=<span\s+class=["']?rvts9["']?>\s*Стаття\s+\d|$)/gs;
  while ((match = rvtsRegex.exec(html)) !== null) {
    const artNum = match[1].trim();
    if (seen.has(artNum)) continue;
    seen.add(artNum);

    const inlineTitle = match[2]?.trim();
    let body = match[3];
    body = body.replace(/<script[^>]*>.*?<\/script\s*>/gsi, '');
    body = body.replace(/<style[^>]*>.*?<\/style\s*>/gsi, '');
    body = body.replace(/<[^>]+>/g, ' ');
    body = body.replace(/\s+/g, ' ').replace(/\{[^}]*\}/g, '').trim();
    if (body.length < 10) continue;

    articles.push({
      article_number: artNum,
      title: inlineTitle && inlineTitle.length > 2 ? inlineTitle : undefined,
      full_text: body,
      byte_size: Buffer.byteLength(body, 'utf8'),
    });
  }

  // Last fallback: plain text Стаття N. pattern
  if (articles.length < 3) {
    seen.clear();
    articles.length = 0;
    const plainRegex = /Стаття\s+(\d+(?:-\d+)?)\.\s*([^\n]{3,200})/g;
    while ((match = plainRegex.exec(html)) !== null) {
      const artNum = match[1].trim();
      if (!seen.has(artNum)) {
        seen.add(artNum);
        articles.push({
          article_number: artNum,
          title: match[2].trim(),
          full_text: match[2].trim(),
          byte_size: Buffer.byteLength(match[2], 'utf8'),
        });
      }
    }
  }

  return articles;
}

// ─── Edition Discovery ───────────────────────────────────────────────────────

async function fetchEditionDates(httpClient: AxiosInstance, bucket: TokenBucket, radaId: string): Promise<string[]> {
  await bucket.acquire();
  const url = `${BASE_URL}/laws/show/${radaId}/card4`;
  console.log(`  Fetching edition dates from ${url}`);
  const response = await withRetry(() => httpClient.get(url));
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);

  const html = response.data as string;
  // Match /ed{YYYYMMDD} links — rada_id may appear URL-encoded in HTML
  const edRegex = /\/ed(\d{8})/g;
  const dates = new Set<string>();
  let match;
  while ((match = edRegex.exec(html)) !== null) dates.add(match[1]);

  return [...dates].sort();
}

// ─── Import One Edition ──────────────────────────────────────────────────────

async function importEdition(
  httpClient: AxiosInstance,
  bucket: TokenBucket,
  pool: pg.Pool,
  legislationId: number,
  radaId: string,
  editionDate: string,
): Promise<number> {
  await bucket.acquire();
  const url = `${BASE_URL}/laws/show/${radaId}/ed${editionDate}/print`;
  const response = await withRetry(() => httpClient.get(url));
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);

  const html = response.data as string;
  const articles = extractArticlesFromEditionHtml(html);
  if (articles.length === 0) return 0;

  const versionDate = `${editionDate.substring(0, 4)}-${editionDate.substring(4, 6)}-${editionDate.substring(6, 8)}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const art of articles) {
      const titleEsc = art.title || null;
      await client.query(
        `INSERT INTO legislation_articles (legislation_id, article_number, title, full_text, byte_size, is_current, version_date, metadata)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7)
         ON CONFLICT (legislation_id, article_number, version_date) DO NOTHING`,
        [legislationId, art.article_number, titleEsc, art.full_text, art.byte_size, versionDate,
         JSON.stringify({ edition_date: editionDate, extraction_method: 'edition_pre_bold' })],
      );
    }

    // Record edition in legislation_editions
    await client.query(
      `INSERT INTO legislation_editions (legislation_id, edition_date, edition_key, article_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (legislation_id, edition_date) DO NOTHING`,
      [legislationId, versionDate, editionDate, articles.length],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return articles.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const codeArg = args.find(a => a.startsWith('--code='))?.split('=')[1];
  const allArg = args.includes('--all');
  const resumeArg = args.includes('--resume');
  const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
  const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!codeArg && !allArg && !resumeArg) {
    console.log('Usage:');
    console.log('  --code=ЦК              Import one code');
    console.log('  --all                   Import all 16 codes');
    console.log('  --resume                Resume from checkpoint');
    console.log('  --from=YYYYMMDD         Start from this edition date');
    console.log('  --to=YYYYMMDD           Stop at this edition date');
    console.log('  --dry-run               Discover editions but do not import');
    process.exit(0);
  }

  const dbUrl = process.env.DATABASE_URL || 'postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_prod';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });

  // Ensure migration tables exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legislation_editions (
      id SERIAL PRIMARY KEY,
      legislation_id INTEGER NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
      edition_date DATE NOT NULL,
      edition_key VARCHAR(8) NOT NULL,
      article_count INTEGER DEFAULT 0,
      imported_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}',
      UNIQUE(legislation_id, edition_date)
    )
  `);

  const httpClient = createHttpClient();
  const bucket = new TokenBucket(RATE_LIMIT, RATE_LIMIT);
  const progress = loadProgress();

  let codesToProcess: typeof CODES;
  if (codeArg) {
    const found = CODES.find(c => c.short_title === codeArg || c.rada_id === codeArg);
    if (!found) {
      console.error(`Unknown code: ${codeArg}. Available: ${CODES.map(c => c.short_title).join(', ')}`);
      process.exit(1);
    }
    codesToProcess = [found];
  } else {
    codesToProcess = CODES;
  }

  let totalEditionsImported = 0;
  let totalArticlesImported = 0;

  for (const code of codesToProcess) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${code.short_title} (${code.rada_id})`);
    console.log('='.repeat(60));

    // Get legislation_id from DB
    const legResult = await pool.query('SELECT id FROM legislation WHERE rada_id = $1', [code.rada_id]);
    if (legResult.rows.length === 0) {
      console.error(`  Legislation ${code.rada_id} not found in DB, skipping`);
      continue;
    }
    const legislationId = legResult.rows[0].id;

    // Discover edition dates
    let editionDates: string[];
    try {
      editionDates = await fetchEditionDates(httpClient, bucket, code.rada_id);
    } catch (err: any) {
      console.error(`  Failed to fetch edition dates: ${err.message}`);
      continue;
    }
    console.log(`  Found ${editionDates.length} editions`);

    // Apply date filters
    if (fromArg) editionDates = editionDates.filter(d => d >= fromArg);
    if (toArg) editionDates = editionDates.filter(d => d <= toArg);

    // Filter already-imported editions
    const cp = getCodeProgress(progress, code.rada_id, code.short_title);
    cp.total_editions = editionDates.length;

    const alreadyImported = new Set(cp.completed_editions);
    // Also check DB for editions imported in previous runs
    const dbEditions = await pool.query(
      'SELECT edition_key FROM legislation_editions WHERE legislation_id = $1',
      [legislationId],
    );
    for (const row of dbEditions.rows) alreadyImported.add(row.edition_key);

    const toImport = editionDates.filter(d => !alreadyImported.has(d));
    console.log(`  To import: ${toImport.length} editions (${alreadyImported.size} already done)`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would import: ${toImport.join(', ')}`);
      continue;
    }

    let editionsDone = 0;
    for (const edDate of toImport) {
      try {
        const artCount = await importEdition(httpClient, bucket, pool, legislationId, code.rada_id, edDate);
        cp.completed_editions.push(edDate);
        totalEditionsImported++;
        totalArticlesImported += artCount;
        editionsDone++;

        if (editionsDone % CHECKPOINT_INTERVAL === 0) {
          saveProgress(progress);
          const pct = ((alreadyImported.size + editionsDone) / editionDates.length * 100).toFixed(1);
          console.log(`  [${editionsDone}/${toImport.length}] ed${edDate}: ${artCount} articles (${pct}% of ${code.short_title})`);
        }
      } catch (err: any) {
        console.error(`  FAILED ed${edDate}: ${err.message}`);
        cp.failed_editions.push(edDate);
      }
    }

    // Update total_editions on legislation table
    await pool.query(
      `UPDATE legislation SET total_editions = (
        SELECT COUNT(*) FROM legislation_editions WHERE legislation_id = $1
      ) WHERE id = $1`,
      [legislationId],
    );

    saveProgress(progress);
    console.log(`  Done: ${editionsDone} editions imported for ${code.short_title}`);
  }

  bucket.destroy();
  await pool.end();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPLETE: ${totalEditionsImported} editions, ${totalArticlesImported} articles imported`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
