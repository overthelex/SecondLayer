import http from 'http';
import { Database } from '../database/database.js';
import { logger } from '../utils/logger.js';

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

const PAGE_SIZE = 500;
const MAX_RESULTS_LIMIT = 9500;
const MAX_RETRIES = 3;
const RATE_LIMIT_MS = 200;
const MAX_CONCURRENT_TEXTS = 10;
const REQUEST_TIMEOUT = 30_000;

const USER_AGENT = 'SecondLayer-HUDOC-Sync/2.0 (+https://legal.org.ua)';

export interface EchrSyncResult {
  country: string;
  newRecords: number;
  updatedRecords: number;
  textsDownloaded: number;
  errors: number;
  durationMs: number;
}

export interface EchrSyncStatusEntry {
  country: string;
  lastSyncAt: string | null;
  lastStatus: string;
  totalRecords: number;
}

interface HudocResult {
  columns: Record<string, string>;
}

interface HudocResponse {
  resultcount: number;
  results: HudocResult[];
  message: string | null;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)) {
        const location = res.headers.location;
        if (location) {
          res.resume();
          httpGet(location, headers, timeoutMs).then(resolve, reject);
          return;
        }
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms: ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchJSON<T>(url: string): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    try {
      const { statusCode, body } = await httpGet(url, {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      }, REQUEST_TIMEOUT);
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw new Error(`HTTP ${statusCode}: ${url}`);
      }
      if (statusCode >= 400) {
        throw new Error(`HTTP ${statusCode}: ${url} (retryable)`);
      }
      return JSON.parse(body) as T;
    } catch (err) {
      lastErr = err as Error;
      if (attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr!;
}

async function fetchHtml(url: string): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    try {
      const { statusCode, body } = await httpGet(url, {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      }, REQUEST_TIMEOUT);
      if (statusCode === 204 || statusCode === 404) return '';
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw new Error(`HTTP ${statusCode}: ${url}`);
      }
      if (statusCode >= 400) {
        throw new Error(`HTTP ${statusCode}: ${url} (retryable)`);
      }
      return body;
    } catch (err) {
      lastErr = err as Error;
      if (attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr!;
}

function htmlToText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&[a-zA-Z0-9#]+;/g, '');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

function buildSearchQuery(countryCode: string, startDate?: string, endDate?: string): string {
  const parts: string[] = [
    '(contentsitename=ECHR)',
    '(NOT (doctype=PR OR doctype=HFCOMOLD OR doctype=HECOMOLD))',
    `((respondent:"${countryCode}"))`,
  ];
  if (startDate && endDate) {
    parts.push(`(kpdate>="${startDate}" AND kpdate<="${endDate}")`);
  } else if (startDate) {
    parts.push(`(kpdate>="${startDate}")`);
  } else if (endDate) {
    parts.push(`(kpdate<="${endDate}")`);
  }
  return parts.join(' AND ');
}

function buildSearchURL(countryCode: string, start: number, startDate?: string, endDate?: string): string {
  const query = buildSearchQuery(countryCode, startDate, endDate);
  return `${HUDOC_BASE}${SEARCH_PATH}?query=${encodeURIComponent(query)}&select=${encodeURIComponent(METADATA_FIELDS)}&sort=${encodeURIComponent('itemid Ascending')}&start=${start}&length=${PAGE_SIZE}`;
}

function buildFulltextURL(itemId: string): string {
  return `${HUDOC_BASE}${FULLTEXT_PATH}?library=ECHR&id=${itemId}`;
}

function generateYearRanges(startYear: number, endYear: number, step: number): DateRange[] {
  const ranges: DateRange[] = [];
  for (let y = startYear; y <= endYear; y += step) {
    const rangeEnd = Math.min(y + step - 1, endYear);
    ranges.push({
      startDate: `${y}-01-01`,
      endDate: `${rangeEnd}-12-31`,
    });
  }
  return ranges;
}

function bisectRange(range: DateRange): DateRange[] {
  const startYear = parseInt(range.startDate.substring(0, 4), 10);
  const endYear = parseInt(range.endDate.substring(0, 4), 10);
  if (startYear >= endYear) return [range];
  const mid = Math.floor((startYear + endYear) / 2);
  return [
    { startDate: `${startYear}-01-01`, endDate: `${mid}-12-31` },
    { startDate: `${mid + 1}-01-01`, endDate: `${endYear}-12-31` },
  ];
}

export class EchrHudocSyncService {
  constructor(private db: Database) {}

  async syncCountry(countryCode: string, opts?: { fullRefresh?: boolean; startDate?: string }): Promise<EchrSyncResult> {
    const startTime = Date.now();
    const country = countryCode.toUpperCase();
    const result: EchrSyncResult = {
      country,
      newRecords: 0,
      updatedRecords: 0,
      textsDownloaded: 0,
      errors: 0,
      durationMs: 0,
    };

    const logId = await this.createSyncLog(country);

    try {
      let syncStartDate: string | undefined = opts?.startDate;
      if (!opts?.fullRefresh && !syncStartDate) {
        const lastDate = await this.getLastSyncDate(country);
        if (lastDate) syncStartDate = lastDate;
      }

      logger.info('Starting ECHR HUDOC sync', { country, syncStartDate: syncStartDate || 'full', logId });

      const items = await this.fetchAllMetadata(country, syncStartDate);
      logger.info('Metadata fetched', { country, totalItems: items.length });

      for (const item of items) {
        try {
          const upserted = await this.upsertCase(item);
          if (upserted === 'inserted') result.newRecords++;
          else result.updatedRecords++;
        } catch (err: any) {
          result.errors++;
          logger.error('Failed to upsert ECHR case', { itemId: item.itemid, error: err.message });
        }
      }

      const itemsNeedingText = await this.getItemsWithoutText(items.map(i => i.itemid));
      logger.info('Downloading full texts', { country, count: itemsNeedingText.length });

      const textResults = await this.downloadTextsInBatches(itemsNeedingText);
      result.textsDownloaded = textResults.downloaded;
      result.errors += textResults.errors;

      result.durationMs = Date.now() - startTime;
      await this.completeSyncLog(logId, result, 'completed');

      logger.info('ECHR HUDOC sync completed', {
        country,
        newRecords: result.newRecords,
        updatedRecords: result.updatedRecords,
        textsDownloaded: result.textsDownloaded,
        errors: result.errors,
        durationMs: result.durationMs,
      });

      return result;
    } catch (err: any) {
      result.durationMs = Date.now() - startTime;
      await this.completeSyncLog(logId, result, 'failed', err.message);
      logger.error('ECHR HUDOC sync failed', { country, error: err.message });
      throw err;
    }
  }

  async getLastSyncDate(countryCode: string): Promise<string | null> {
    const res = await this.db.query(
      `SELECT completed_at FROM echr_sync_log
       WHERE country_code = $1 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [countryCode.toUpperCase()]
    );
    if (!res.rows.length) return null;
    const d = new Date(res.rows[0].completed_at);
    return d.toISOString().substring(0, 10);
  }

  async getSyncStatus(): Promise<EchrSyncStatusEntry[]> {
    const res = await this.db.query(
      `SELECT
         c.respondent AS country,
         l.completed_at AS last_sync_at,
         COALESCE(l.status, 'never') AS last_status,
         COUNT(c.item_id)::text AS total_records
       FROM echr_cases c
       LEFT JOIN LATERAL (
         SELECT completed_at, status
         FROM echr_sync_log
         WHERE country_code = c.respondent
         ORDER BY completed_at DESC NULLS LAST
         LIMIT 1
       ) l ON true
       GROUP BY c.respondent, l.completed_at, l.status
       ORDER BY c.respondent`
    );
    return res.rows.map(r => ({
      country: r.country,
      lastSyncAt: r.last_sync_at,
      lastStatus: r.last_status,
      totalRecords: parseInt(r.total_records, 10),
    }));
  }

  private async createSyncLog(country: string): Promise<number> {
    const res = await this.db.query(
      `INSERT INTO echr_sync_log (country_code, started_at, status)
       VALUES ($1, NOW(), 'running') RETURNING id`,
      [country]
    );
    return res.rows[0].id;
  }

  private async completeSyncLog(
    logId: number,
    result: EchrSyncResult,
    status: string,
    lastError?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE echr_sync_log SET
         completed_at = NOW(),
         new_records = $2,
         updated_records = $3,
         texts_downloaded = $4,
         errors = $5,
         status = $6,
         last_error = $7
       WHERE id = $1`,
      [logId, result.newRecords, result.updatedRecords, result.textsDownloaded, result.errors, status, lastError || null]
    );
  }

  private async fetchAllMetadata(country: string, startDate?: string): Promise<Record<string, string>[]> {
    const firstURL = buildSearchURL(country, 0, startDate);
    const first = await fetchJSON<HudocResponse>(firstURL);
    const totalCount = first.resultcount;

    if (totalCount === 0) return [];

    if (totalCount > MAX_RESULTS_LIMIT && !startDate) {
      return this.fetchMetadataWithDateSplitting(country);
    }

    if (totalCount > MAX_RESULTS_LIMIT && startDate) {
      return this.fetchMetadataByYearRanges(country, startDate);
    }

    const allItems: Record<string, string>[] = first.results.map(r => r.columns);
    logger.info('HUDOC metadata page fetched', { country, page: 1, total: totalCount, fetched: allItems.length });

    let offset = PAGE_SIZE;
    while (offset < totalCount) {
      await sleep(RATE_LIMIT_MS);
      const url = buildSearchURL(country, offset, startDate);
      const page = await fetchJSON<HudocResponse>(url);
      allItems.push(...page.results.map(r => r.columns));
      logger.info('HUDOC metadata page fetched', { country, offset, fetched: page.results.length });
      offset += PAGE_SIZE;
    }

    return this.deduplicateByItemId(allItems);
  }

  private async fetchMetadataWithDateSplitting(country: string): Promise<Record<string, string>[]> {
    const currentYear = new Date().getFullYear();
    const ranges = generateYearRanges(1959, currentYear, 5);
    return this.fetchMetadataForRanges(country, ranges);
  }

  private async fetchMetadataByYearRanges(country: string, startDate: string): Promise<Record<string, string>[]> {
    const startYear = parseInt(startDate.substring(0, 4), 10);
    const currentYear = new Date().getFullYear();
    const ranges = generateYearRanges(startYear, currentYear, 5);
    return this.fetchMetadataForRanges(country, ranges);
  }

  private async fetchMetadataForRanges(country: string, ranges: DateRange[]): Promise<Record<string, string>[]> {
    const allItems: Record<string, string>[] = [];

    for (const range of ranges) {
      const items = await this.fetchRangeWithSplitting(country, range);
      allItems.push(...items);
    }

    return this.deduplicateByItemId(allItems);
  }

  private async fetchRangeWithSplitting(country: string, range: DateRange): Promise<Record<string, string>[]> {
    await sleep(RATE_LIMIT_MS);
    const url = buildSearchURL(country, 0, range.startDate, range.endDate);
    const first = await fetchJSON<HudocResponse>(url);

    if (first.resultcount === 0) return [];

    if (first.resultcount > MAX_RESULTS_LIMIT) {
      const subRanges = bisectRange(range);
      if (subRanges.length === 1) {
        logger.warn('HUDOC range cannot be split further', { country, range, count: first.resultcount });
        return this.paginateRange(country, range, first);
      }
      const items: Record<string, string>[] = [];
      for (const sub of subRanges) {
        const subItems = await this.fetchRangeWithSplitting(country, sub);
        items.push(...subItems);
      }
      return items;
    }

    return this.paginateRange(country, range, first);
  }

  private async paginateRange(
    country: string,
    range: DateRange,
    firstPage: HudocResponse,
  ): Promise<Record<string, string>[]> {
    const items: Record<string, string>[] = firstPage.results.map(r => r.columns);
    const total = firstPage.resultcount;

    let offset = PAGE_SIZE;
    while (offset < total) {
      await sleep(RATE_LIMIT_MS);
      const url = buildSearchURL(country, offset, range.startDate, range.endDate);
      const page = await fetchJSON<HudocResponse>(url);
      items.push(...page.results.map(r => r.columns));
      offset += PAGE_SIZE;
    }

    return items;
  }

  private deduplicateByItemId(items: Record<string, string>[]): Record<string, string>[] {
    const seen = new Map<string, Record<string, string>>();
    for (const item of items) {
      seen.set(item.itemid, item);
    }
    return Array.from(seen.values());
  }

  private async upsertCase(item: Record<string, string>): Promise<'inserted' | 'updated'> {
    const res = await this.db.query(
      `INSERT INTO echr_cases (
        item_id, app_no, doc_name, respondent, language_iso, kp_date,
        conclusion, importance, doc_type, originating_body, type_description,
        extracted_app_no, document_collection_id, document_collection_id2, is_placeholder
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (item_id) DO UPDATE SET
        app_no = EXCLUDED.app_no,
        doc_name = EXCLUDED.doc_name,
        respondent = EXCLUDED.respondent,
        language_iso = EXCLUDED.language_iso,
        kp_date = EXCLUDED.kp_date,
        conclusion = EXCLUDED.conclusion,
        importance = EXCLUDED.importance,
        doc_type = EXCLUDED.doc_type,
        originating_body = EXCLUDED.originating_body,
        type_description = EXCLUDED.type_description,
        extracted_app_no = EXCLUDED.extracted_app_no,
        document_collection_id = EXCLUDED.document_collection_id,
        document_collection_id2 = EXCLUDED.document_collection_id2,
        is_placeholder = EXCLUDED.is_placeholder,
        updated_at = NOW()
      RETURNING xmax`,
      [
        item.itemid,
        item.appno || null,
        item.docname || null,
        item.respondent || null,
        item.languageisocode || null,
        item.kpdate ? item.kpdate.substring(0, 10) : null,
        item.conclusion || null,
        item.importance || null,
        item.doctype || null,
        item.originatingbody || null,
        item.typedescription || null,
        item.extractedappno || null,
        item.documentcollectionid || null,
        item.documentcollectionid2 || null,
        item.isplaceholder === 'True' || item.isplaceholder === 'true',
      ]
    );
    // xmax = '0' means INSERT (new row), otherwise UPDATE (existing row)
    return res.rows[0]?.xmax === '0' ? 'inserted' : 'updated';
  }

  private async getItemsWithoutText(itemIds: string[]): Promise<string[]> {
    if (itemIds.length === 0) return [];
    const res = await this.db.query(
      `SELECT item_id FROM echr_cases
       WHERE item_id = ANY($1) AND (full_text IS NULL OR full_text = '')`,
      [itemIds]
    );
    return res.rows.map(r => r.item_id);
  }

  private async downloadTextsInBatches(itemIds: string[]): Promise<{ downloaded: number; errors: number }> {
    let downloaded = 0;
    let errors = 0;

    for (let i = 0; i < itemIds.length; i += MAX_CONCURRENT_TEXTS) {
      const batch = itemIds.slice(i, i + MAX_CONCURRENT_TEXTS);
      const results = await Promise.allSettled(
        batch.map(async (itemId) => {
          await sleep(RATE_LIMIT_MS);
          return this.downloadAndStoreText(itemId);
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) downloaded++;
        else if (r.status === 'rejected') {
          errors++;
          logger.error('Failed to download ECHR text', { error: (r.reason as Error).message });
        }
      }

      if (i + MAX_CONCURRENT_TEXTS < itemIds.length) {
        logger.info('ECHR text download progress', {
          done: i + batch.length,
          total: itemIds.length,
          downloaded,
          errors,
        });
      }
    }

    return { downloaded, errors };
  }

  private async downloadAndStoreText(itemId: string): Promise<boolean> {
    const url = buildFulltextURL(itemId);
    const html = await fetchHtml(url);
    if (!html) return false;

    const text = htmlToText(html);
    await this.db.query(
      `UPDATE echr_cases SET full_text_html = $2, full_text = $3, updated_at = NOW() WHERE item_id = $1`,
      [itemId, html, text]
    );
    return true;
  }
}
