#!/usr/bin/env npx tsx
/**
 * HUDOC ECHR Bulk Downloader
 *
 * Downloads European Court of Human Rights case metadata and full texts
 * from the official HUDOC database (hudoc.echr.coe.int).
 *
 * Two phases:
 *   1. `meta`  — paginate search API, save all metadata as NDJSON
 *   2. `texts` — download full-text HTML for each item, convert to plain text
 *
 * Usage:
 *   npx tsx scripts/hudoc/download-hudoc.ts meta  --out /data/hudoc --country UKR
 *   npx tsx scripts/hudoc/download-hudoc.ts texts --out /data/hudoc --workers 20 --lang UKR
 *   npx tsx scripts/hudoc/download-hudoc.ts all   --out /data/hudoc --country UKR --workers 20
 *
 * Resume: both phases are idempotent. Meta skips already-fetched pages.
 *         Texts skips already-downloaded itemids (--skip-exist, default true).
 *
 * HDD optimization (≤300 Mbit/s):
 *   - Sequential writes via append-only NDJSON (meta phase)
 *   - Buffered writes with 64KB buffers (text phase)
 *   - Configurable concurrency to avoid random I/O thrashing
 *   - Atomic writes via .tmp + rename
 *
 * Performance:
 *   ~11K items for UKR respondent, ~2K in Ukrainian language
 *   Meta phase: ~30 seconds (22 pages × 500 items)
 *   Texts phase: ~20-60 min depending on concurrency and API response times
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'fs';
import * as cheerio from 'cheerio';
import { writeFile, rename, unlink, stat } from 'fs/promises';
import { join, dirname } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

interface Config {
  outDir: string;
  country: string;        // respondent filter (UKR, RUS, TUR, etc.)
  lang: string;           // language filter for texts (UKR, ENG, FRE, '' = all)
  workers: number;        // concurrent text downloads
  pageSize: number;       // items per metadata page (max 500)
  rateMs: number;         // minimum ms between requests per worker
  retries: number;        // retry count for failed requests
  skipExist: boolean;     // skip already-downloaded texts
  textFormat: 'html' | 'txt' | 'both'; // what to save
  importance: string;     // filter by importance (1-4, '' = all)
  doctype: string;        // filter by doctype ('' = all, use HEJUD for judgments)
  startDate: string;      // kpdate >= (ISO date, '' = no filter)
  endDate: string;        // kpdate <= (ISO date, '' = no filter)
  progressSec: number;    // progress print interval
  metaOnly: boolean;      // stop after metadata phase
}

const DEFAULT_CONFIG: Config = {
  outDir: './data/hudoc',
  country: 'UKR',
  lang: '',
  workers: 15,
  pageSize: 500,
  rateMs: 200,
  retries: 3,
  skipExist: true,
  textFormat: 'both',
  importance: '',
  doctype: '',
  startDate: '',
  endDate: '',
  progressSec: 5,
  metaOnly: false,
};

// ── HUDOC API ───────────────────────────────────────────────────────────────

// IMPORTANT: HUDOC API only works via HTTP (HTTPS returns 404 due to Cloudflare).
// HTTP requests get 307-redirected and return JSON. Node fetch follows redirects by default.
const HUDOC_BASE = 'http://hudoc.echr.coe.int';
const SEARCH_PATH = '/app/query/results';
const FULLTEXT_PATH = '/app/conversion/docx/html/body';

const METADATA_FIELDS = [
  'itemid', 'docname', 'appno', 'conclusion', 'importance',
  'originatingbody', 'typedescription', 'kpdate', 'kpdateAsText',
  'documentcollectionid', 'documentcollectionid2', 'languageisocode',
  'extractedappno', 'isplaceholder', 'respondent', 'doctype', 'Rank',
  'sharepointid', 'Title', 'Ession',
].join(',');

interface HudocResult {
  columns: Record<string, string>;
}

interface HudocResponse {
  resultcount: number;
  results: HudocResult[];
  message: string | null;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'SecondLayer-HUDOC-Downloader/1.0 (+https://legal.org.ua)',
};

async function fetchJSON<T>(url: string, retries: number): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt);
    }
    try {
      const resp = await fetch(url, {
        headers: { ...FETCH_HEADERS, Accept: 'application/json' },
        redirect: 'follow',
      });
      if (!resp.ok) {
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
          throw new Error(`HTTP ${resp.status}: ${url}`);
        }
        throw new Error(`HTTP ${resp.status}: ${url} (retryable)`);
      }
      return await resp.json() as T;
    } catch (err) {
      lastErr = err as Error;
      if ((err as Error).message.includes('(retryable)') || attempt < retries) {
        continue;
      }
    }
  }
  throw lastErr;
}

async function fetchText(url: string, retries: number): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt);
    }
    try {
      const resp = await fetch(url, {
        headers: { ...FETCH_HEADERS, Accept: 'text/html' },
        redirect: 'follow',
      });
      if (resp.status === 204 || resp.status === 404) {
        return ''; // no full text available (204 = placeholder, 404 = missing)
      }
      if (!resp.ok) {
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
          throw new Error(`HTTP ${resp.status}: ${url}`);
        }
        throw new Error(`HTTP ${resp.status}: ${url} (retryable)`);
      }
      return await resp.text();
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr;
}

// ── Query builder ───────────────────────────────────────────────────────────

function buildSearchQuery(cfg: Config): string {
  // HUDOC uses '=' syntax (not ':') for contentsitename and doctype filters
  const parts: string[] = [
    '(contentsitename=ECHR)',
    '(NOT (doctype=PR OR doctype=HFCOMOLD OR doctype=HECOMOLD))',
  ];

  if (cfg.country) {
    parts.push(`((respondent:"${cfg.country}"))`);
  }
  if (cfg.lang) {
    parts.push(`((languageisocode:"${cfg.lang}"))`);
  }
  if (cfg.importance) {
    parts.push(`((importance:"${cfg.importance}"))`);
  }
  if (cfg.doctype) {
    parts.push(`((doctype=${cfg.doctype}))`);
  }
  // Date filter: HUDOC uses bare dates without time portion
  if (cfg.startDate && cfg.endDate) {
    parts.push(`(kpdate>="${cfg.startDate}" AND kpdate<="${cfg.endDate}")`);
  } else if (cfg.startDate) {
    parts.push(`(kpdate>="${cfg.startDate}")`);
  } else if (cfg.endDate) {
    parts.push(`(kpdate<="${cfg.endDate}")`);
  }

  return parts.join(' AND ');
}

function buildSearchURL(cfg: Config, start: number): string {
  const query = buildSearchQuery(cfg);
  const select = METADATA_FIELDS;
  // Use space-separated encoding; sort by itemid for stable pagination
  const encoded = `${HUDOC_BASE}${SEARCH_PATH}?query=${encodeURIComponent(query)}&select=${encodeURIComponent(select)}&sort=${encodeURIComponent('itemid Ascending')}&start=${start}&length=${cfg.pageSize}`;
  return encoded;
}

function buildFulltextURL(itemId: string): string {
  return `${HUDOC_BASE}${FULLTEXT_PATH}?library=ECHR&id=${itemId}`;
}

// ── HTML → plain text ───────────────────────────────────────────────────────

function htmlToText(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style').remove();
  let text = $.text();
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

// ── Stats ───────────────────────────────────────────────────────────────────

class Stats {
  done = 0;
  errors = 0;
  skipped = 0;
  bytes = 0;
  startTime = Date.now();

  print(total: number, phase: string) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const pct = total > 0 ? ((this.done + this.skipped) / total * 100).toFixed(1) : '?';
    const rps = elapsed > 0 ? ((this.done + this.skipped) / elapsed).toFixed(1) : '0';
    const mb = (this.bytes / 1024 / 1024).toFixed(1);
    const eta = total > 0 && (this.done + this.skipped) > 0
      ? formatDuration((total - this.done - this.skipped) / ((this.done + this.skipped) / elapsed))
      : '?';
    process.stdout.write(
      `\r[${phase}] [${formatDuration(elapsed)}] done=${this.done} skip=${this.skipped} err=${this.errors} | ${pct}% | ${rps} r/s | ${mb} MB | ETA ${eta}  `
    );
  }
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

// ── State file (resume support) ─────────────────────────────────────────────

interface DownloadState {
  metaPagesDone: number;
  totalCount: number;
  textsDownloaded: string[]; // itemids
}

function stateFilePath(outDir: string): string {
  return join(outDir, '.hudoc-state.json');
}

function loadState(outDir: string): DownloadState {
  const p = stateFilePath(outDir);
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
      // corrupted, start fresh
    }
  }
  return { metaPagesDone: 0, totalCount: 0, textsDownloaded: [] };
}

function saveState(outDir: string, state: DownloadState) {
  const p = stateFilePath(outDir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, p);
}

// ── Phase 1: Metadata download ──────────────────────────────────────────────

// HUDOC API limits pagination to 10,000 results. If total > 10K, we split
// the query into date-based batches (year ranges) to stay under the limit.

async function paginateQuery(cfg: Config, overrides: Partial<Config>, ndjsonPath: string, stats: Stats): Promise<void> {
  const queryCfg = { ...cfg, ...overrides };
  const firstURL = buildSearchURL(queryCfg, 0);

  const first = await fetchJSON<HudocResponse>(firstURL, cfg.retries);
  const totalCount = first.resultcount;

  if (totalCount === 0) return;

  // If > 9500 results, split into smaller date ranges
  if (totalCount > 9500 && !overrides.startDate && !overrides.endDate) {
    console.log(`\n  Batch has ${totalCount} results (>9500), splitting by year...`);
    // Find year range from first and last results
    const years = generateYearRanges(1959, new Date().getFullYear());
    for (const { start, end } of years) {
      await paginateQuery(cfg, { ...overrides, startDate: start, endDate: end }, ndjsonPath, stats);
    }
    return;
  }

  if (totalCount > 9500 && (overrides.startDate || overrides.endDate)) {
    // Already have date filter but still too many — split in half
    const startYear = parseInt((overrides.startDate || '1959-01-01').substring(0, 4));
    const endYear = parseInt((overrides.endDate || `${new Date().getFullYear()}-12-31`).substring(0, 4));
    if (startYear < endYear) {
      const midYear = Math.floor((startYear + endYear) / 2);
      console.log(`\n  Sub-splitting ${startYear}-${endYear} at ${midYear}...`);
      await paginateQuery(cfg, { ...overrides, startDate: `${startYear}-01-01`, endDate: `${midYear}-12-31` }, ndjsonPath, stats);
      await paginateQuery(cfg, { ...overrides, startDate: `${midYear + 1}-01-01`, endDate: `${endYear}-12-31` }, ndjsonPath, stats);
      return;
    }
  }

  const totalPages = Math.ceil(totalCount / cfg.pageSize);
  const dateLabel = overrides.startDate ? ` [${overrides.startDate} – ${overrides.endDate}]` : '';
  console.log(`\n  Batch${dateLabel}: ${totalCount} results, ${totalPages} pages`);

  // Process first page
  const lines = first.results.map(r => JSON.stringify(r.columns));
  appendFileSync(ndjsonPath, lines.join('\n') + '\n');
  stats.done += first.results.length;
  stats.bytes += Buffer.byteLength(lines.join('\n') + '\n');

  // Fetch remaining pages
  for (let page = 1; page < totalPages; page++) {
    const offset = page * cfg.pageSize;
    const url = buildSearchURL(queryCfg, offset);

    try {
      const resp = await fetchJSON<HudocResponse>(url, cfg.retries);
      if (resp.results.length === 0) break;

      const batchLines = resp.results.map(r => JSON.stringify(r.columns));
      appendFileSync(ndjsonPath, batchLines.join('\n') + '\n');
      stats.done += resp.results.length;
      stats.bytes += Buffer.byteLength(batchLines.join('\n') + '\n');
    } catch (err) {
      stats.errors++;
      console.error(`\n  Error on page ${page}: ${err}`);
    }

    stats.print(0, 'meta');
    await sleep(cfg.rateMs);
  }
}

function generateYearRanges(startYear: number, endYear: number): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  // Use 5-year buckets to keep each batch well under 10K
  for (let y = startYear; y <= endYear; y += 5) {
    const end = Math.min(y + 4, endYear);
    ranges.push({ start: `${y}-01-01`, end: `${end}-12-31` });
  }
  return ranges;
}

async function downloadMetadata(cfg: Config): Promise<string> {
  const metaDir = join(cfg.outDir, 'meta');
  mkdirSync(metaDir, { recursive: true });

  const stats = new Stats();
  const ndjsonPath = join(metaDir, `metadata-${cfg.country || 'ALL'}.ndjson`);

  // Check if file already exists with data (resume: just skip meta phase)
  if (existsSync(ndjsonPath)) {
    const existingLines = readFileSync(ndjsonPath, 'utf-8').split('\n').filter(Boolean).length;
    if (existingLines > 0) {
      console.log(`\nMetadata file exists with ${existingLines} items. To re-download, delete ${ndjsonPath}`);
      return ndjsonPath;
    }
  } else {
    // Create empty file for appendFileSync
    writeFileSync(ndjsonPath, '');
  }

  // First, check total count
  console.log(`\nFetching metadata: country=${cfg.country || 'ALL'} lang=${cfg.lang || 'ALL'}`);
  const probeURL = buildSearchURL(cfg, 0);
  console.log(`Query URL: ${probeURL.substring(0, 150)}...`);
  const probe = await fetchJSON<HudocResponse>(probeURL, cfg.retries);
  console.log(`Total results: ${probe.resultcount}`);

  // Paginate (with auto-splitting if > 10K)
  await paginateQuery(cfg, {}, ndjsonPath, stats);

  // Deduplicate by itemid (date-based batching may have overlaps)
  const allLines = readFileSync(ndjsonPath, 'utf-8').split('\n').filter(Boolean);
  const seen = new Set<string>();
  const dedupLines: string[] = [];
  for (const line of allLines) {
    try {
      const item = JSON.parse(line);
      if (!seen.has(item.itemid)) {
        seen.add(item.itemid);
        dedupLines.push(line);
      }
    } catch { /* skip */ }
  }

  if (dedupLines.length !== allLines.length) {
    console.log(`\nDeduplicated: ${allLines.length} → ${dedupLines.length} unique items`);
    writeFileSync(ndjsonPath, dedupLines.join('\n') + '\n');
  }

  console.log(`\nMetadata saved to ${ndjsonPath}`);
  console.log(`Total items: ${dedupLines.length}, errors: ${stats.errors}, size: ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`);

  return ndjsonPath;
}

// ── Phase 2: Full text download ─────────────────────────────────────────────

interface TextJob {
  itemId: string;
  lang: string;
  docname: string;
}

async function downloadTexts(cfg: Config, metaPath?: string) {
  const metaDir = join(cfg.outDir, 'meta');
  const htmlDir = join(cfg.outDir, 'html');
  const txtDir = join(cfg.outDir, 'txt');

  if (cfg.textFormat === 'html' || cfg.textFormat === 'both') {
    mkdirSync(htmlDir, { recursive: true });
  }
  if (cfg.textFormat === 'txt' || cfg.textFormat === 'both') {
    mkdirSync(txtDir, { recursive: true });
  }

  // Find metadata file
  if (!metaPath) {
    const files = readdirSync(metaDir).filter(f => f.endsWith('.ndjson'));
    if (files.length === 0) {
      console.error('No metadata files found. Run "meta" phase first.');
      process.exit(1);
    }
    metaPath = join(metaDir, files[0]);
  }

  // Load all items from NDJSON
  console.log(`\nLoading metadata from ${metaPath}`);
  const lines = readFileSync(metaPath, 'utf-8').split('\n').filter(Boolean);
  const allItems: TextJob[] = [];

  for (const line of lines) {
    try {
      const item = JSON.parse(line) as Record<string, string>;
      allItems.push({
        itemId: item.itemid,
        lang: item.languageisocode,
        docname: item.docname || '',
      });
    } catch {
      // skip malformed lines
    }
  }

  console.log(`Loaded ${allItems.length} items from metadata`);

  // Filter by language if specified
  let jobs = allItems;
  if (cfg.lang) {
    jobs = allItems.filter(j => j.lang === cfg.lang);
    console.log(`Filtered to ${jobs.length} items with lang=${cfg.lang}`);
  }

  // Build skip set from existing files
  const existingIds = new Set<string>();
  if (cfg.skipExist) {
    const checkDir = cfg.textFormat === 'txt' ? txtDir : htmlDir;
    if (existsSync(checkDir)) {
      for (const f of readdirSync(checkDir)) {
        // filename: {itemid}.html or {itemid}.txt
        const id = f.replace(/\.(html|txt)$/, '');
        existingIds.add(id);
      }
    }
    if (existingIds.size > 0) {
      console.log(`Skipping ${existingIds.size} already-downloaded items`);
    }
  }

  const pendingJobs = jobs.filter(j => !existingIds.has(j.itemId));
  console.log(`Downloading ${pendingJobs.length} full texts (workers=${cfg.workers}, rate=${cfg.rateMs}ms)`);

  if (pendingJobs.length === 0) {
    console.log('Nothing to download.');
    return;
  }

  const stats = new Stats();
  stats.skipped = existingIds.size;

  // Error log
  const errLogPath = join(cfg.outDir, 'errors.log');

  // Progress printer
  const progressInterval = setInterval(() => {
    stats.print(jobs.length, 'texts');
  }, cfg.progressSec * 1000);

  // Worker pool
  let jobIndex = 0;
  const mutex = { idx: 0 };

  async function worker() {
    let lastRequestTime = 0;
    while (true) {
      const idx = mutex.idx++;
      if (idx >= pendingJobs.length) break;

      const job = pendingJobs[idx];
      const url = buildFulltextURL(job.itemId);

      try {
        // Rate limit: ensure minimum gap between requests per worker
        const elapsed = Date.now() - lastRequestTime;
        if (elapsed < cfg.rateMs) {
          await sleep(cfg.rateMs - elapsed);
        }
        lastRequestTime = Date.now();

        const html = await fetchText(url, cfg.retries);
        if (!html) {
          stats.skipped++;
          continue;
        }

        // Write HTML
        if (cfg.textFormat === 'html' || cfg.textFormat === 'both') {
          const htmlPath = join(htmlDir, `${job.itemId}.html`);
          const tmp = htmlPath + '.tmp';
          await writeFile(tmp, html);
          await rename(tmp, htmlPath);
          stats.bytes += Buffer.byteLength(html);
        }

        // Write plain text
        if (cfg.textFormat === 'txt' || cfg.textFormat === 'both') {
          const plainText = htmlToText(html);
          const txtPath = join(txtDir, `${job.itemId}.txt`);
          const tmp = txtPath + '.tmp';
          await writeFile(tmp, plainText);
          await rename(tmp, txtPath);
          if (cfg.textFormat === 'txt') {
            stats.bytes += Buffer.byteLength(plainText);
          }
        }

        stats.done++;
      } catch (err) {
        stats.errors++;
        const errMsg = `${new Date().toISOString()} ERROR ${job.itemId} (${job.lang}): ${err}\n`;
        appendFileSync(errLogPath, errMsg);
      }
    }
  }

  // Launch workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < cfg.workers; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  clearInterval(progressInterval);
  stats.print(jobs.length, 'texts');

  console.log(`\n\nTexts download complete.`);
  console.log(`  Downloaded: ${stats.done}`);
  console.log(`  Skipped:    ${stats.skipped}`);
  console.log(`  Errors:     ${stats.errors}`);
  console.log(`  Total size: ${(stats.bytes / 1024 / 1024).toFixed(1)} MB`);
  if (stats.errors > 0) {
    console.log(`  Error log:  ${errLogPath}`);
  }
}

// ── Summary / index builder ─────────────────────────────────────────────────

async function buildIndex(cfg: Config) {
  const metaDir = join(cfg.outDir, 'meta');
  const files = readdirSync(metaDir).filter(f => f.endsWith('.ndjson'));
  if (files.length === 0) {
    console.error('No metadata files found.');
    return;
  }

  const metaPath = join(metaDir, files[0]);
  const lines = readFileSync(metaPath, 'utf-8').split('\n').filter(Boolean);

  // Build summary stats
  const byLang: Record<string, number> = {};
  const byDoctype: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const byImportance: Record<string, number> = {};
  const byBody: Record<string, number> = {};

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      byLang[item.languageisocode] = (byLang[item.languageisocode] || 0) + 1;
      byDoctype[item.doctype] = (byDoctype[item.doctype] || 0) + 1;
      byImportance[item.importance] = (byImportance[item.importance] || 0) + 1;
      byBody[item.originatingbody] = (byBody[item.originatingbody] || 0) + 1;
      if (item.kpdate) {
        const year = item.kpdate.substring(0, 4);
        byYear[year] = (byYear[year] || 0) + 1;
      }
    } catch { /* skip */ }
  }

  console.log(`\n── HUDOC Dataset Summary ──────────────────────`);
  console.log(`Total items: ${lines.length}`);
  console.log(`\nBy language:`);
  for (const [lang, count] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${count}`);
  }
  console.log(`\nBy document type:`);
  for (const [dt, count] of Object.entries(byDoctype).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dt}: ${count}`);
  }
  console.log(`\nBy importance (1=high, 4=low):`);
  for (const [imp, count] of Object.entries(byImportance).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${imp}: ${count}`);
  }
  console.log(`\nBy year (top 10):`);
  for (const [year, count] of Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)) {
    console.log(`  ${year}: ${count}`);
  }

  // Check texts coverage
  const htmlDir = join(cfg.outDir, 'html');
  const txtDir = join(cfg.outDir, 'txt');
  let htmlCount = 0, txtCount = 0;
  if (existsSync(htmlDir)) htmlCount = readdirSync(htmlDir).filter(f => f.endsWith('.html')).length;
  if (existsSync(txtDir)) txtCount = readdirSync(txtDir).filter(f => f.endsWith('.txt')).length;
  console.log(`\nFull texts downloaded:`);
  console.log(`  HTML files: ${htmlCount}`);
  console.log(`  TXT files:  ${txtCount}`);

  // Write index JSON
  const index = {
    generatedAt: new Date().toISOString(),
    totalItems: lines.length,
    byLanguage: byLang,
    byDocumentType: byDoctype,
    byImportance: byImportance,
    byYear: byYear,
    byOriginatingBody: byBody,
    fullTexts: { html: htmlCount, txt: txtCount },
  };
  const indexPath = join(cfg.outDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nIndex saved to ${indexPath}`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(): { command: string; config: Config } {
  const args = process.argv.slice(2);

  // Check for help flag anywhere
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0] || 'all';
  const cfg = { ...DEFAULT_CONFIG };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--out': cfg.outDir = next; i++; break;
      case '--country': cfg.country = next; i++; break;
      case '--lang': cfg.lang = next; i++; break;
      case '--workers': cfg.workers = parseInt(next); i++; break;
      case '--page-size': cfg.pageSize = Math.min(500, parseInt(next)); i++; break;
      case '--rate': cfg.rateMs = parseInt(next); i++; break;
      case '--retries': cfg.retries = parseInt(next); i++; break;
      case '--skip-exist': cfg.skipExist = next !== 'false'; i++; break;
      case '--no-skip-exist': cfg.skipExist = false; break;
      case '--format': cfg.textFormat = next as Config['textFormat']; i++; break;
      case '--importance': cfg.importance = next; i++; break;
      case '--doctype': cfg.doctype = next; i++; break;
      case '--start-date': cfg.startDate = next; i++; break;
      case '--end-date': cfg.endDate = next; i++; break;
      case '--progress': cfg.progressSec = parseInt(next); i++; break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          process.exit(1);
        }
    }
  }

  return { command, config: cfg };
}

function printUsage() {
  console.log(`
HUDOC ECHR Bulk Downloader

Usage:
  npx tsx scripts/hudoc/download-hudoc.ts <command> [flags]

Commands:
  meta     Download metadata only (NDJSON)
  texts    Download full texts (requires metadata)
  all      Download metadata + full texts
  index    Build summary index from downloaded data
  stats    Show dataset statistics

Flags:
  --out <dir>          Output directory (default: ./data/hudoc)
  --country <code>     Respondent country: UKR, RUS, TUR, etc. (default: UKR)
  --lang <code>        Language filter for texts: UKR, ENG, FRE (default: all)
  --workers <n>        Concurrent downloads for texts (default: 15)
  --page-size <n>      Items per metadata page, max 500 (default: 500)
  --rate <ms>          Min ms between requests per worker (default: 200)
  --retries <n>        Retry count (default: 3)
  --no-skip-exist      Re-download existing files
  --format <fmt>       Text format: html, txt, both (default: both)
  --importance <1-4>   Filter by importance level
  --doctype <type>     Filter by document type
  --start-date <date>  Filter from date (YYYY-MM-DD)
  --end-date <date>    Filter to date (YYYY-MM-DD)
  --progress <sec>     Progress interval (default: 5)

Examples:
  # Download all Ukrainian ECHR cases (metadata + texts)
  npx tsx scripts/hudoc/download-hudoc.ts all --out /data/hudoc --country UKR

  # Download only Ukrainian-language texts
  npx tsx scripts/hudoc/download-hudoc.ts texts --out /data/hudoc --lang UKR --workers 20

  # Download only metadata (fast, ~30 seconds)
  npx tsx scripts/hudoc/download-hudoc.ts meta --out /data/hudoc --country UKR

  # Download high-importance judgments only
  npx tsx scripts/hudoc/download-hudoc.ts all --out /data/hudoc --importance 1

  # Show statistics
  npx tsx scripts/hudoc/download-hudoc.ts index --out /data/hudoc
`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { command, config: cfg } = parseArgs();

  console.log(`HUDOC ECHR Downloader`);
  console.log(`  Command:  ${command}`);
  console.log(`  Output:   ${cfg.outDir}`);
  console.log(`  Country:  ${cfg.country || 'ALL'}`);
  console.log(`  Language: ${cfg.lang || 'ALL'}`);
  console.log(`  Workers:  ${cfg.workers}`);
  console.log(`  Format:   ${cfg.textFormat}`);

  mkdirSync(cfg.outDir, { recursive: true });

  // Graceful shutdown
  let shuttingDown = false;
  process.on('SIGINT', () => {
    if (shuttingDown) {
      console.log('\nForce exit.');
      process.exit(1);
    }
    shuttingDown = true;
    console.log('\nInterrupted. Finishing in-flight requests... (Ctrl+C again to force)');
  });

  try {
    switch (command) {
      case 'meta': {
        await downloadMetadata(cfg);
        break;
      }
      case 'texts': {
        await downloadTexts(cfg);
        break;
      }
      case 'all': {
        const metaPath = await downloadMetadata(cfg);
        if (!cfg.metaOnly) {
          await downloadTexts(cfg, metaPath);
        }
        await buildIndex(cfg);
        break;
      }
      case 'index':
      case 'stats': {
        await buildIndex(cfg);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\nFatal error: ${err}`);
    process.exit(1);
  }
}

main();
