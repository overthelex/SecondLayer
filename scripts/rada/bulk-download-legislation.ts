#!/usr/bin/env npx tsx
/**
 * Bulk Download All Rada Legislation
 *
 * Downloads all documents from zakon.rada.gov.ua and imports them into PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/rada/bulk-download-legislation.ts --phase=index
 *   npx tsx scripts/rada/bulk-download-legislation.ts --phase=download [--concurrency=400] [--rate=10]
 *   npx tsx scripts/rada/bulk-download-legislation.ts --phase=import [--db-concurrency=20]
 *   npx tsx scripts/rada/bulk-download-legislation.ts --all
 */

import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';

// ─── Config ──────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(SCRIPTS_DIR, 'data');
const INDEX_FILE = path.join(SCRIPTS_DIR, 'all-rada-ids.json');
const PROGRESS_FILE = path.join(SCRIPTS_DIR, 'download-progress.json');
const ERRORS_FILE = path.join(SCRIPTS_DIR, 'download-errors.json');

const BASE_URL = 'https://zakon.rada.gov.ua';
const INDEX_URL = `${BASE_URL}/laws/main/a`;

const DEFAULT_CONCURRENCY = 400;
const DEFAULT_RATE = 10; // requests per second
const DEFAULT_DB_CONCURRENCY = 20;
const INDEX_CONCURRENCY = 50;
const INDEX_BATCH_DELAY_MS = 100;

// ─── Token Bucket Rate Limiter ───────────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private waiters: Array<() => void> = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private rate: number, private maxTokens: number) {
    this.tokens = maxTokens;
    // Refill tokens at regular intervals
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
    for (const resolve of this.waiters) {
      resolve();
    }
    this.waiters = [];
  }
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

function createHttpClient(timeoutMs = 30000): AxiosInstance {
  return axios.create({
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SecondLayer/1.0; +https://legal.org.ua)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'uk,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
    },
    decompress: true,
    validateStatus: () => true,
  });
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 4,
  label = ''
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = Math.pow(2, attempt) * 1000;
      if (label) {
        console.error(`  [retry ${attempt + 1}/${maxRetries}] ${label}: ${err.message} — waiting ${delay}ms`);
      }
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Phase 1: Crawl Index ────────────────────────────────────────────────────

async function crawlIndex(): Promise<string[]> {
  console.log('=== Phase 1: Crawling document index ===');

  const client = createHttpClient(60000);

  // Fetch first page to discover total pages
  console.log('Fetching first page to discover total pages...');
  const firstPageResp = await client.get(`${INDEX_URL}/page`);
  if (firstPageResp.status !== 200) {
    throw new Error(`Failed to fetch index first page: HTTP ${firstPageResp.status}`);
  }

  const $first = cheerio.load(firstPageResp.data);

  // Find max page number from pagination links
  let maxPage = 1;
  $first('a[href*="/laws/main/a/page"]').each((_, el) => {
    const href = $first(el).attr('href') || '';
    const match = href.match(/\/page(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
  });

  // Also check text-based pagination
  $first('.pagination a, .pager a, [class*="page"] a').each((_, el) => {
    const text = $first(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > maxPage) maxPage = num;
  });

  console.log(`Discovered ${maxPage} pages (est. ${maxPage * 50} documents)`);

  function extractRadaIds($: cheerio.CheerioAPI): string[] {
    const ids: string[] = [];
    $('a[href*="/laws/show/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/laws\/show\/([^/?#]+)/);
      if (match) {
        const radaId = decodeURIComponent(match[1]);
        if (radaId && !ids.includes(radaId)) {
          ids.push(radaId);
        }
      }
    });
    return ids;
  }

  // Extract from first page
  const allIds = new Set<string>(extractRadaIds($first));
  console.log(`  Page 1: ${allIds.size} ids`);

  // Crawl remaining pages in batches
  const pages = Array.from({ length: maxPage - 1 }, (_, i) => i + 2);
  let completed = 1;
  const errors: Array<{ page: number; error: string }> = [];

  for (let batchStart = 0; batchStart < pages.length; batchStart += INDEX_CONCURRENCY) {
    const batch = pages.slice(batchStart, batchStart + INDEX_CONCURRENCY);
    const promises = batch.map(async (pageNum) => {
      try {
        const resp = await withRetry(
          async () => {
            const r = await client.get(`${INDEX_URL}/page${pageNum}`);
            if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
            return r;
          },
          3,
          `page ${pageNum}`
        );
        const $ = cheerio.load(resp.data);
        const ids = extractRadaIds($);
        for (const id of ids) allIds.add(id);
        completed++;
      } catch (err: any) {
        errors.push({ page: pageNum, error: err.message });
        completed++;
      }
    });

    await Promise.all(promises);

    if (completed % 500 === 0 || batchStart + INDEX_CONCURRENCY >= pages.length) {
      console.log(`  Progress: ${completed}/${maxPage} pages, ${allIds.size} unique ids, ${errors.length} errors`);
    }

    await sleep(INDEX_BATCH_DELAY_MS);
  }

  const idsArray = Array.from(allIds);
  console.log(`\nIndex complete: ${idsArray.length} unique rada_ids found (${errors.length} page errors)`);

  fs.writeFileSync(INDEX_FILE, JSON.stringify(idsArray, null, 0));
  console.log(`Saved to ${INDEX_FILE}`);

  if (errors.length > 0) {
    fs.writeFileSync(
      path.join(SCRIPTS_DIR, 'index-errors.json'),
      JSON.stringify(errors, null, 2)
    );
  }

  return idsArray;
}

// ─── Phase 2: Download Documents ─────────────────────────────────────────────

interface DownloadProgress {
  completed: string[];
  failed: string[];
  lastUpdated: string;
}

function loadProgress(): DownloadProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [], failed: [], lastUpdated: new Date().toISOString() };
}

function saveProgress(progress: DownloadProgress): void {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 0));
}

function safeFilename(radaId: string): string {
  return radaId
    .replace(/\//g, '__')
    .replace(/[<>:"|?*]/g, '_');
}

async function downloadAll(concurrency: number, rate: number): Promise<void> {
  console.log(`=== Phase 2: Downloading documents (concurrency=${concurrency}, rate=${rate}/s) ===`);

  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(`Index file not found: ${INDEX_FILE}. Run --phase=index first.`);
  }
  const allIds: string[] = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  console.log(`Loaded ${allIds.length} rada_ids from index`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load progress for resume
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  const failedSet = new Set(progress.failed);

  // Filter out already downloaded
  const pending = allIds.filter((id) => {
    if (completedSet.has(id)) return false;
    const filePath = path.join(DATA_DIR, `${safeFilename(id)}.html`);
    if (fs.existsSync(filePath)) {
      completedSet.add(id);
      return false;
    }
    return true;
  });

  console.log(`Already completed: ${completedSet.size}, failed: ${failedSet.size}, pending: ${pending.length}`);

  if (pending.length === 0) {
    console.log('All documents already downloaded!');
    return;
  }

  const client = createHttpClient(30000);
  const bucket = new TokenBucket(rate, Math.min(rate, 20));

  let downloadCount = 0;
  let errorCount = 0;
  const startTime = Date.now();
  const downloadErrors: Array<{ radaId: string; error: string; status?: number }> = [];

  const pool = new Set<Promise<void>>();

  for (const radaId of pending) {
    if (pool.size >= concurrency) {
      await Promise.race(pool);
    }

    const p = (async () => {
      await bucket.acquire();

      const filePath = path.join(DATA_DIR, `${safeFilename(radaId)}.html`);

      try {
        const resp = await withRetry(async () => {
          if (/[^\p{L}\p{N}\-_\/\.%]/u.test(radaId) || radaId.includes('..')) {
            throw new Error(`Invalid rada_id: ${radaId}`);
          }
          const url = `${BASE_URL}/laws/show/${encodeURIComponent(radaId)}/print`;
          const r = await client.get(url);
          if (r.status === 429) throw new Error('Rate limited (429)');
          if (r.status >= 500) throw new Error(`Server error (${r.status})`);
          return r;
        }, 4, radaId);

        if (resp.status === 404) {
          failedSet.add(radaId);
          downloadErrors.push({ radaId, error: '404 Not Found', status: 404 });
          errorCount++;
          return;
        }

        if (resp.status !== 200) {
          failedSet.add(radaId);
          downloadErrors.push({ radaId, error: `HTTP ${resp.status}`, status: resp.status });
          errorCount++;
          return;
        }

        fs.writeFileSync(filePath, resp.data, 'utf-8');
        completedSet.add(radaId);
        downloadCount++;

        if (downloadCount % 1000 === 0) {
          progress.completed = Array.from(completedSet);
          progress.failed = Array.from(failedSet);
          saveProgress(progress);

          const elapsed = (Date.now() - startTime) / 1000;
          const rps = downloadCount / elapsed;
          const eta = ((pending.length - downloadCount) / rps / 3600).toFixed(1);
          console.log(
            `  [checkpoint] ${downloadCount}/${pending.length} downloaded, ` +
            `${errorCount} errors, ${rps.toFixed(1)} req/s, ETA: ${eta}h`
          );
        }
      } catch (err: any) {
        failedSet.add(radaId);
        downloadErrors.push({ radaId, error: err.message });
        errorCount++;
      }
    })();

    pool.add(p);
    p.finally(() => pool.delete(p));
  }

  await Promise.all(pool);
  bucket.destroy();

  // Final checkpoint
  progress.completed = Array.from(completedSet);
  progress.failed = Array.from(failedSet);
  saveProgress(progress);

  if (downloadErrors.length > 0) {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(downloadErrors, null, 2));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(
    `\nDownload complete: ${downloadCount} downloaded, ${errorCount} errors, ` +
    `${elapsed.toFixed(0)}s total (${(downloadCount / elapsed).toFixed(1)} req/s)`
  );
}

// ─── Phase 3: Import to PostgreSQL ───────────────────────────────────────────

function extractMetadata(
  $: cheerio.CheerioAPI,
  radaId: string,
  url: string
): {
  rada_id: string;
  type: 'code' | 'law' | 'regulation';
  title: string;
  short_title?: string;
  full_url: string;
  adoption_date?: Date;
  effective_date?: Date;
  status: string;
} {
  const titleElement = $('.title, .doc-title, h1').first();
  const title = titleElement.text().trim() || `Document ${radaId}`;

  const shortTitle = extractShortTitle(title);
  const type = determineDocumentType(title, radaId);

  const infoBlock = $('.info, .doc-info, .document-info');
  const adoptionDateText = infoBlock.find(':contains("прийнято")').text();
  const effectiveDateText = infoBlock.find(':contains("набрання чинності")').text();

  return {
    rada_id: radaId,
    type,
    title,
    short_title: shortTitle,
    full_url: url,
    adoption_date: parseDate(adoptionDateText),
    effective_date: parseDate(effectiveDateText),
    status: 'active',
  };
}

function extractArticles(
  $: cheerio.CheerioAPI,
  radaId: string
): Array<{
  article_number: string;
  title?: string;
  full_text: string;
  full_text_html?: string;
  byte_size: number;
  metadata: any;
}> {
  const articles: Array<{
    article_number: string;
    title?: string;
    full_text: string;
    full_text_html?: string;
    byte_size: number;
    metadata: any;
  }> = [];

  const bodyHtml = $('body').html() || '';
  const articleRegex = /<span\s+class=["']?rvts9["']?>Стаття\s+(\d+(?:-\d+)?)\.?\s*<\/span>\s*(.*?)(?=<span\s+class=["']?rvts9|$)/gs;

  let match;
  while ((match = articleRegex.exec(bodyHtml)) !== null) {
    const articleNumber = match[1];
    const articleHtml = match[2];

    const $article = cheerio.load(`<div>${articleHtml}</div>`);
    $article('script, style, em').remove();
    const fullText = $article.text()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\{[^}]+\}/g, '')
      .trim();

    if (fullText.length < 10) continue;

    let title: string | undefined;
    const firstSentence = fullText.split(/[.;]/)[0];
    if (firstSentence && firstSentence.length < 200) {
      title = firstSentence.trim();
    }

    articles.push({
      article_number: articleNumber,
      title,
      full_text: fullText,
      full_text_html: articleHtml.substring(0, 10000),
      byte_size: Buffer.byteLength(fullText, 'utf8'),
      metadata: {
        rada_id: radaId,
        extraction_date: new Date().toISOString(),
        extraction_method: 'print_endpoint',
      },
    });
  }

  // Fallback: plain text extraction
  if (articles.length === 0) {
    const bodyText = $('body').text();
    const fallbackRegex = /Стаття\s+(\d+(?:-\d+)?)\.\s*([^\n]+)/gi;

    let fMatch;
    while ((fMatch = fallbackRegex.exec(bodyText)) !== null) {
      const articleNumber = fMatch[1];
      const title = fMatch[2].trim();
      const startIndex = fMatch.index;
      const nextMatch = fallbackRegex.exec(bodyText);
      const endIndex = nextMatch ? nextMatch.index : bodyText.length;
      fallbackRegex.lastIndex = nextMatch ? nextMatch.index : bodyText.length;

      const fullText = bodyText.substring(startIndex, endIndex).trim();
      if (fullText.length > 20) {
        articles.push({
          article_number: articleNumber,
          title,
          full_text: fullText,
          byte_size: Buffer.byteLength(fullText, 'utf8'),
          metadata: { rada_id: radaId, extraction_method: 'fallback' },
        });
      }
    }
  }

  return articles;
}

function extractShortTitle(fullTitle: string): string | undefined {
  const patterns = [
    /\(([А-ЯІЇЄҐ]{2,}(?:\s+України)?)\)/,
    /([А-ЯІЇЄҐ]{2,}\s+України)/,
  ];
  for (const pattern of patterns) {
    const match = fullTitle.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function determineDocumentType(title: string, radaId: string): 'code' | 'law' | 'regulation' {
  if (title.includes('Кодекс') || radaId.includes('кодекс')) return 'code';
  if (title.includes('Закон') || radaId.match(/^\d+-\d+$/)) return 'law';
  return 'regulation';
}

function parseDate(text: string): Date | undefined {
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return new Date(`${match[3]}-${match[2]}-${match[1]}`);
  }
  return undefined;
}

async function importAll(dbConcurrency: number): Promise<void> {
  console.log(`=== Phase 3: Importing to PostgreSQL (concurrency=${dbConcurrency}) ===`);

  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Data directory not found: ${DATA_DIR}. Run --phase=download first.`);
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.html'));
  console.log(`Found ${files.length} HTML files to import`);

  if (files.length === 0) return;

  const dbUrl = process.env.DATABASE_URL || 'postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_local';
  const pool = new pg.Pool({
    connectionString: dbUrl,
    max: dbConcurrency + 2,
  });

  // Test connection
  try {
    const testResult = await pool.query('SELECT count(*) as cnt FROM legislation');
    console.log(`Current legislation count: ${testResult.rows[0].cnt}`);
  } catch (err: any) {
    console.error(`DB connection failed: ${err.message}`);
    console.error('Set DATABASE_URL or ensure PostgreSQL is running on localhost:5432');
    await pool.end();
    return;
  }

  let imported = 0;
  let skipped = 0;
  let errorCount = 0;
  const startTime = Date.now();
  const importErrors: Array<{ file: string; error: string }> = [];

  const workerPool = new Set<Promise<void>>();

  for (const file of files) {
    if (workerPool.size >= dbConcurrency) {
      await Promise.race(workerPool);
    }

    const p = (async () => {
      const filePath = path.join(DATA_DIR, file);
      const radaId = file
        .replace(/\.html$/, '')
        .replace(/__/g, '/');

      try {
        const html = fs.readFileSync(filePath, 'utf-8');
        if (!html || html.length < 100) {
          skipped++;
          return;
        }

        const $ = cheerio.load(html);
        const url = `${BASE_URL}/laws/show/${encodeURIComponent(radaId)}/print`;
        const metadata = extractMetadata($, radaId, url);
        const articles = extractArticles($, radaId);

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const legResult = await client.query(
            `INSERT INTO legislation (rada_id, type, title, short_title, full_url, adoption_date,
              effective_date, status, total_articles, structure_metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (rada_id) DO UPDATE SET
               title = EXCLUDED.title,
               short_title = EXCLUDED.short_title,
               total_articles = EXCLUDED.total_articles,
               updated_at = NOW()
             RETURNING id`,
            [
              metadata.rada_id,
              metadata.type,
              metadata.title,
              metadata.short_title,
              metadata.full_url,
              metadata.adoption_date || null,
              metadata.effective_date || null,
              metadata.status,
              articles.length,
              JSON.stringify({}),
            ]
          );

          const legislationId = legResult.rows[0].id;

          if (articles.length > 0) {
            // Clean replace: delete old articles, insert new
            await client.query(
              'DELETE FROM legislation_articles WHERE legislation_id = $1',
              [legislationId]
            );

            // Batch insert articles (100 at a time)
            for (let i = 0; i < articles.length; i += 100) {
              const batch = articles.slice(i, i + 100);
              const values: any[] = [];
              const placeholders: string[] = [];

              for (let j = 0; j < batch.length; j++) {
                const art = batch[j];
                const offset = j * 10;
                placeholders.push(
                  `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, ` +
                  `$${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
                );
                values.push(
                  legislationId,
                  art.article_number,
                  art.title || null,
                  art.full_text,
                  art.full_text_html || null,
                  new Date(),
                  true,
                  art.byte_size,
                  JSON.stringify(art.metadata || {}),
                  null
                );
              }

              await client.query(
                `INSERT INTO legislation_articles
                 (legislation_id, article_number, title, full_text, full_text_html,
                  version_date, is_current, byte_size, metadata, section_number)
                 VALUES ${placeholders.join(', ')}`,
                values
              );
            }
          }

          await client.query('COMMIT');
          imported++;
        } catch (err: any) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        if (imported % 1000 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rps = imported / elapsed;
          const eta = ((files.length - imported - skipped - errorCount) / rps / 60).toFixed(1);
          console.log(
            `  [progress] ${imported}/${files.length} imported, ` +
            `${skipped} skipped, ${errorCount} errors, ${rps.toFixed(1)} docs/s, ETA: ${eta}m`
          );
        }
      } catch (err: any) {
        errorCount++;
        importErrors.push({ file, error: err.message });
      }
    })();

    workerPool.add(p);
    p.finally(() => workerPool.delete(p));
  }

  await Promise.all(workerPool);
  await pool.end();

  if (importErrors.length > 0) {
    fs.writeFileSync(
      path.join(SCRIPTS_DIR, 'import-errors.json'),
      JSON.stringify(importErrors, null, 2)
    );
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(
    `\nImport complete: ${imported} imported, ${skipped} skipped, ${errorCount} errors, ${elapsed.toFixed(0)}s`
  );

  // Final verification
  const verifyPool = new pg.Pool({
    connectionString: dbUrl,
    max: 2,
  });
  try {
    const result = await verifyPool.query('SELECT count(*) as cnt FROM legislation');
    const artResult = await verifyPool.query('SELECT count(*) as cnt FROM legislation_articles');
    console.log(`DB totals: ${result.rows[0].cnt} legislation, ${artResult.rows[0].cnt} articles`);
  } finally {
    await verifyPool.end();
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(): {
  phase?: string;
  all?: boolean;
  concurrency: number;
  rate: number;
  dbConcurrency: number;
} {
  const args = process.argv.slice(2);
  const result = {
    phase: undefined as string | undefined,
    all: false,
    concurrency: DEFAULT_CONCURRENCY,
    rate: DEFAULT_RATE,
    dbConcurrency: DEFAULT_DB_CONCURRENCY,
  };

  for (const arg of args) {
    if (arg === '--all') {
      result.all = true;
    } else if (arg.startsWith('--phase=')) {
      result.phase = arg.split('=')[1];
    } else if (arg.startsWith('--concurrency=')) {
      result.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--rate=')) {
      result.rate = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--db-concurrency=')) {
      result.dbConcurrency = parseInt(arg.split('=')[1], 10);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Rada Legislation Bulk Downloader                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  if (!args.phase && !args.all) {
    console.log('Usage:');
    console.log('  npx tsx scripts/rada/bulk-download-legislation.ts --phase=index');
    console.log('  npx tsx scripts/rada/bulk-download-legislation.ts --phase=download [--concurrency=400] [--rate=10]');
    console.log('  npx tsx scripts/rada/bulk-download-legislation.ts --phase=import [--db-concurrency=20]');
    console.log('  npx tsx scripts/rada/bulk-download-legislation.ts --all');
    process.exit(1);
  }

  if (args.all || args.phase === 'index') {
    await crawlIndex();
  }

  if (args.all || args.phase === 'download') {
    await downloadAll(args.concurrency, args.rate);
  }

  if (args.all || args.phase === 'import') {
    await importAll(args.dbConcurrency);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
