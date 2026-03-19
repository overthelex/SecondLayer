/**
 * Admin Scraping Routes — Fulltext backfill, registry coverage, court registry scraper,
 * persistent job tracking, startup recovery
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { spawn } from 'child_process';
import { join } from 'path';
import type { IDatabase } from '../../domain/ports/index.js';
import { CourtDecisionHTMLParser } from '../../utils/html-parser.js';
import { logger } from '../../utils/logger.js';
import { getStringParam } from './admin-middleware.js';

// =========== Job Types ===========

interface BackfillJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  justice_kind_code: string | null;
  total: number;
  processed: number;
  scraped: number;
  errors: number;
  error_details: string[];
  started_at: string;
  completed_at?: string;
  stop_requested?: boolean;
  current_logs: string[];
  concurrency: number;
  proxy?: string;
}

interface ScraperJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  justice_kind: string;
  justice_kind_id: string;
  doc_form: string;
  date_from: string;
  max_docs: number;
  concurrency: number;
  proxy?: string;
  pages_processed: number;
  downloaded: number;
  saved_to_db: number;
  skipped: number;
  errors: number;
  started_at: string;
  completed_at?: string;
  stop_requested?: boolean;
  current_logs: string[];
  pid?: number;
}

const PROXIES = {
  mail: 'http://10.149.22.1:8888',
  localdev: 'http://10.149.22.181:8888',
};

export function createAdminScrapingRoutes(
  db: IDatabase,
): Router {
  const router = Router();

  const backfillJobs = new Map<string, BackfillJob>();
  const scraperJobs = new Map<string, ScraperJob>();

  // =========== PERSISTENT JOB TRACKING ===========

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbRowToScraperJob = (row: any): any => ({
    job_id: row.job_id,
    status: row.status === 'interrupted' ? 'failed' : row.status,
    justice_kind: row.config?.justice_kind || '',
    justice_kind_id: row.config?.justice_kind_id || '',
    doc_form: row.config?.doc_form || '',
    date_from: row.config?.date_from || '',
    max_docs: row.config?.max_docs || 0,
    concurrency: row.config?.concurrency || 1,
    proxy: row.config?.proxy,
    pages_processed: row.progress?.pages_processed || 0,
    downloaded: row.progress?.downloaded || 0,
    saved_to_db: row.progress?.saved_to_db || 0,
    skipped: row.progress?.skipped || 0,
    errors: row.progress?.errors || 0,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
    current_logs: Array.isArray(row.current_logs) ? row.current_logs : [],
    pid: row.progress?.pid,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbRowToBackfillJob = (row: any): any => ({
    job_id: row.job_id,
    status: row.status === 'interrupted' ? 'failed' : row.status,
    justice_kind_code: row.config?.justice_kind_code ?? null,
    total: row.config?.total || 0,
    processed: row.progress?.processed || 0,
    scraped: row.progress?.scraped || 0,
    errors: row.progress?.errors || 0,
    error_details: row.progress?.error_details || [],
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
    current_logs: Array.isArray(row.current_logs) ? row.current_logs : [],
    concurrency: row.config?.concurrency || 1,
    proxy: row.config?.proxy,
  });

  const persistToDB = (
    jobId: string,
    jobType: 'court_scraper' | 'backfill',
    status: string,
    config: Record<string, unknown>,
    progress: Record<string, unknown>,
    currentLogs: string[],
    startedAt: string,
    completedAt?: string,
  ) => {
    db.query(
      `INSERT INTO scraper_jobs(job_id, job_type, status, config, progress, current_logs, started_at, completed_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (job_id) DO UPDATE SET
         status       = EXCLUDED.status,
         progress     = EXCLUDED.progress,
         current_logs = EXCLUDED.current_logs,
         completed_at = EXCLUDED.completed_at,
         updated_at   = NOW()`,
      [jobId, jobType, status, config, progress, currentLogs.slice(-50), startedAt, completedAt ?? null],
    ).catch(() => { /* non-critical — table may not exist yet */ });
  };

  async function getLiveCompletenessStats() {
    const kindNames: Record<string, string> = {};
    try {
      const dictResult = await db.query(`
        SELECT data FROM zo_dictionaries
        WHERE dictionary_name = 'justiceKinds' AND domain = 'court_decisions'
        LIMIT 1
      `);
      if (dictResult.rows[0]?.data) {
        const items = dictResult.rows[0].data;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.justice_kind != null && item.name) {
              kindNames[String(item.justice_kind)] = item.name;
            }
          }
        }
      }
    } catch { /* dictionary not available */ }

    const result = await db.query(`
      SELECT
        COALESCE(metadata->>'justice_kind', 'unknown') AS justice_kind,
        COUNT(*) AS total,
        COUNT(full_text) FILTER (WHERE full_text IS NOT NULL AND full_text != '') AS has_plaintext,
        COUNT(full_text_html) FILTER (WHERE full_text_html IS NOT NULL AND full_text_html != '') AS has_html,
        COUNT(*) FILTER (WHERE (full_text IS NULL OR full_text = '') AND (full_text_html IS NOT NULL AND full_text_html != '')) AS has_only_html,
        COUNT(*) FILTER (WHERE (full_text IS NULL OR full_text = '') AND (full_text_html IS NULL OR full_text_html = '')) AS missing_both,
        COUNT(*) FILTER (WHERE full_text IS NOT NULL AND full_text != '' AND full_text_html IS NOT NULL AND full_text_html != '') AS has_both
      FROM documents
      WHERE user_id IS NULL
      GROUP BY COALESCE(metadata->>'justice_kind', 'unknown')
      ORDER BY total DESC
    `);

    const byJusticeKind = result.rows.map((row: any) => {
      const total = parseInt(row.total);
      const hasBoth = parseInt(row.has_both);
      const kindCode = row.justice_kind;
      return {
        justice_kind: kindNames[kindCode] || (kindCode === 'unknown' ? 'Невідомий' : `Вид ${kindCode}`),
        justice_kind_code: kindCode,
        total,
        has_plaintext: parseInt(row.has_plaintext),
        has_html: parseInt(row.has_html),
        has_only_html: parseInt(row.has_only_html) || 0,
        has_both: hasBoth,
        missing_both: parseInt(row.missing_both),
        completeness_pct: total > 0 ? Math.round((hasBoth / total) * 10000) / 100 : 0,
      };
    });

    let summary = { total_documents: 0, with_plaintext: 0, with_html: 0, with_only_html: 0, with_both: 0, missing_both: 0 };
    for (const row of byJusticeKind) {
      summary = {
        total_documents: summary.total_documents + row.total,
        with_plaintext: summary.with_plaintext + row.has_plaintext,
        with_html: summary.with_html + row.has_html,
        with_only_html: summary.with_only_html + (row.has_only_html || 0),
        with_both: summary.with_both + row.has_both,
        missing_both: summary.missing_both + row.missing_both,
      };
    }

    return {
      summary: {
        ...summary,
        completeness_pct: summary.total_documents > 0
          ? Math.round((summary.with_both / summary.total_documents) * 10000) / 100
          : 0,
      },
      by_justice_kind: byJusticeKind,
    };
  }

  // ========================================
  // FULLTEXT BACKFILL
  // ========================================

  router.post('/backfill-fulltext', async (req: Request, res: Response) => {
    try {
      for (const job of backfillJobs.values()) {
        if (job.status === 'running' || job.status === 'queued') {
          return res.status(409).json({
            error: 'Backfill вже виконується',
            job_id: job.job_id,
          });
        }
      }

      const { justice_kind_code, limit: maxDocs, concurrency = 1, proxy: proxyKey } = req.body || {};
      const docLimit = Math.min(maxDocs || 200, 1000);
      const concurrencyLimit = Math.min(Math.max(concurrency, 1), 10);
      const proxyUrl = proxyKey && proxyKey !== 'none' ? PROXIES[proxyKey as keyof typeof PROXIES] : undefined;

      let query = `
        SELECT zakononline_id, title, metadata
        FROM documents
        WHERE user_id IS NULL
          AND zakononline_id ~ '^\\d+$'
          AND (full_text IS NULL OR length(full_text) < 100)
      `;
      const params: any[] = [];

      if (justice_kind_code && justice_kind_code !== 'all') {
        params.push(justice_kind_code);
        query += ` AND metadata->>'justice_kind' = $${params.length}`;
      }

      params.push(docLimit);
      query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

      const result = await db.query(query, params);
      const docs = result.rows;

      if (docs.length === 0) {
        return res.json({
          message: 'Немає документів для докачування',
          total: 0,
        });
      }

      const jobId = `backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job: BackfillJob = {
        job_id: jobId,
        status: 'queued',
        justice_kind_code: justice_kind_code || null,
        total: docs.length,
        processed: 0,
        scraped: 0,
        errors: 0,
        error_details: [],
        started_at: new Date().toISOString(),
        current_logs: [],
        concurrency: concurrencyLimit,
        proxy: proxyUrl,
      };

      backfillJobs.set(jobId, job);
      persistToDB(jobId, 'backfill', 'queued',
        { justice_kind_code: job.justice_kind_code, total: job.total, concurrency: job.concurrency, proxy: job.proxy },
        { processed: 0, scraped: 0, errors: 0, error_details: [] },
        [], job.started_at);

      // Start background processing
      (async () => {
        job.status = 'running';
        const DELAY_MS = 1000;

        const processDoc = async (doc: { zakononline_id: string }) => {
          const zoId = doc.zakononline_id;
          try {
            const url = `https://zakononline.ua/court-decisions/show/${zoId}`;
            const axiosConfig: any = {
              timeout: 15000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecondLayerBot/1.0)' },
            };
            if (job.proxy) {
              axiosConfig.proxy = { host: new URL(job.proxy).hostname, port: parseInt(new URL(job.proxy).port), protocol: 'http' };
            }
            const response = await axios.get(url, axiosConfig);

            if (response.status !== 200) {
              return { status: 'error', zoId, error: `HTTP ${response.status}` };
            }

            const parser = new CourtDecisionHTMLParser(response.data);
            const fullText = parser.toText('full');
            const articleHTML = parser.extractArticleHTML();

            if (fullText && fullText.length > 100) {
              const caseNumber = parser.getMetadata()?.caseNumber || null;
              const title = parser.getMetadata()?.title || '';
              const shortTitle = title.length > 80 ? title.slice(0, 80) + '...' : title;
              const logEntry = `[${zoId}] https://zakononline.ua/court-decisions/show/${zoId} | ${caseNumber || 'N/A'} | ${shortTitle || 'N/A'}`;
              job.current_logs.unshift(logEntry);
              if (job.current_logs.length > 3) job.current_logs.pop();

              await db.query(`
                UPDATE documents
                SET full_text = $1, full_text_html = $2, case_number = COALESCE(case_number, $3), updated_at = NOW()
                WHERE zakononline_id = $4 AND user_id IS NULL
              `, [fullText, articleHTML, caseNumber, zoId]);
              return { status: 'success', zoId };
            } else {
              return { status: 'empty', zoId };
            }
          } catch (err: any) {
            return { status: 'error', zoId, error: err.message?.slice(0, 100) };
          }
        };

        const backfillProgress = () => ({
          processed: job.processed, scraped: job.scraped,
          errors: job.errors, error_details: job.error_details.slice(-20),
        });
        const backfillConfig = () => ({
          justice_kind_code: job.justice_kind_code, total: job.total,
          concurrency: job.concurrency, proxy: job.proxy,
        });

        for (let i = 0; i < docs.length; i += job.concurrency) {
          if (job.stop_requested) {
            job.status = 'stopped';
            job.completed_at = new Date().toISOString();
            logger.info(`Backfill ${jobId} stopped by user at ${job.processed}/${job.total}`);
            persistToDB(jobId, 'backfill', 'stopped', backfillConfig(), backfillProgress(), job.current_logs, job.started_at, job.completed_at);
            return;
          }

          const batch = docs.slice(i, i + job.concurrency);
          const results = await Promise.all(batch.map(processDoc));

          for (const result of results) {
            job.processed++;
            if (result.status === 'success') {
              job.scraped++;
            } else if (result.status === 'error') {
              job.errors++;
              job.error_details.push(result.error ? `${result.zoId}: ${result.error}` : `${result.zoId}: empty text`);
              if (job.error_details.length > 50) job.error_details.shift();
            } else if (result.status === 'empty') {
              job.errors++;
              job.error_details.push(`${result.zoId}: empty text`);
              if (job.error_details.length > 50) job.error_details.shift();
            }
          }

          if (i + job.concurrency < docs.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
          }

          if (job.processed % 10 === 0 || job.processed === job.total) {
            logger.info(`Backfill ${jobId}: ${job.processed}/${job.total} (scraped: ${job.scraped}, errors: ${job.errors}, concurrency: ${job.concurrency})`);
            persistToDB(jobId, 'backfill', 'running', backfillConfig(), backfillProgress(), job.current_logs, job.started_at);
          }
        }

        job.status = 'completed';
        job.completed_at = new Date().toISOString();
        logger.info(`Backfill ${jobId} completed: ${job.scraped}/${job.total} scraped, ${job.errors} errors`);
        persistToDB(jobId, 'backfill', 'completed', backfillConfig(), backfillProgress(), job.current_logs, job.started_at, job.completed_at);
      })().catch(err => {
        job.status = 'failed';
        job.error_details.push(`Fatal: ${err.message}`);
        job.completed_at = new Date().toISOString();
        logger.error(`Backfill ${jobId} failed:`, err.message);
        persistToDB(jobId, 'backfill', 'failed', { justice_kind_code: job.justice_kind_code, total: job.total, concurrency: job.concurrency, proxy: job.proxy },
          { processed: job.processed, scraped: job.scraped, errors: job.errors, error_details: job.error_details.slice(-20) },
          job.current_logs, job.started_at, job.completed_at);
      });

      res.json({
        job_id: jobId,
        status: 'queued',
        total: docs.length,
        message: `Запущено докачування ${docs.length} документів`,
      });
    } catch (error: any) {
      logger.error('Failed to start backfill', { error: error.message });
      res.status(500).json({ error: 'Failed to start backfill' });
    }
  });

  // NOTE: must be registered BEFORE the :jobId route
  router.get('/backfill-fulltext', async (_req: Request, res: Response) => {
    let latest: BackfillJob | null = null;
    for (const job of backfillJobs.values()) {
      if (!latest || job.started_at > latest.started_at) {
        latest = job;
      }
    }

    if (!latest) {
      try {
        const dbRes = await db.query(
          `SELECT * FROM scraper_jobs WHERE job_type='backfill' ORDER BY started_at DESC LIMIT 1`
        );
        if (dbRes.rows[0]) {
          const dbJob = dbRowToBackfillJob(dbRes.rows[0]);
          return res.json({ active: false, job: dbJob });
        }
      } catch { /* table may not exist yet */ }
      return res.json({ active: false, job: null });
    }

    res.json({
      active: latest.status === 'running' || latest.status === 'queued',
      job: latest,
    });
  });

  router.get('/backfill-fulltext/:jobId', async (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });

    let job = backfillJobs.get(jobId);
    if (!job) {
      try {
        const dbRes = await db.query(`SELECT * FROM scraper_jobs WHERE job_id=$1`, [jobId]);
        if (dbRes.rows[0]) job = dbRowToBackfillJob(dbRes.rows[0]) as BackfillJob;
      } catch { /* ignore */ }
    }
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const response: Record<string, unknown> = { ...job };

    if (job.status === 'running' || job.status === 'queued') {
      try {
        response.completeness = await getLiveCompletenessStats();
      } catch { /* ignore completeness errors during polling */ }
    }

    res.json(response);
  });

  router.post('/backfill-fulltext/:jobId/stop', (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });

    const job = backfillJobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'running' && job.status !== 'queued') {
      return res.status(400).json({ error: 'Job is not running' });
    }

    job.stop_requested = true;
    res.json({ message: 'Stop requested', job_id: jobId });
  });

  router.delete('/backfill-fulltext/:jobId', async (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });

    const job = backfillJobs.get(jobId);
    if (job && (job.status === 'running' || job.status === 'queued')) {
      return res.status(409).json({ error: 'Cannot delete a running job. Stop it first.' });
    }

    backfillJobs.delete(jobId);
    try {
      await db.query(`DELETE FROM scraper_jobs WHERE job_id = $1`, [jobId]);
    } catch { /* non-critical */ }

    res.json({ message: 'Job deleted', job_id: jobId });
  });

  // ========================================
  // REGISTRY COVERAGE MAP
  // ========================================

  router.get('/registry-coverage-map', async (req: Request, res: Response) => {
    try {
      const years = Math.min(5, Math.max(1, Number(req.query.years || 3)));

      const kindNames: Record<string, string> = {};
      try {
        const dictResult = await db.query(`
          SELECT data FROM zo_dictionaries
          WHERE dictionary_name = 'justiceKinds' AND domain = 'court_decisions'
          LIMIT 1
        `);
        if (dictResult.rows[0]?.data) {
          const items = dictResult.rows[0].data;
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.justice_kind != null && item.name) {
                kindNames[String(item.justice_kind)] = item.name;
              }
            }
          }
        }
      } catch { /* dictionary not available */ }

      const FALLBACK_NAMES: Record<string, string> = {
        '1': 'Цивільне', '2': 'Адміністративне', '3': 'Господарське',
        '4': 'Конституційне', '5': 'Кримінальне', 'other': 'Інше',
      };

      const result = await db.query(`
        SELECT
          COALESCE(metadata->>'justice_kind', 'other') AS justice_kind,
          TO_CHAR(DATE_TRUNC('month', COALESCE(date, created_at::date)), 'YYYY-MM') AS period,
          COUNT(*) AS doc_count
        FROM documents
        WHERE type = 'court_decision'
          AND COALESCE(date, created_at::date) >= (CURRENT_DATE - ($1 * INTERVAL '1 year'))
        GROUP BY 1, 2
        ORDER BY 1, 2
      `, [years]);

      const cells: Record<string, Record<string, number>> = {};
      const periodsSet = new Set<string>();
      const justiceKindsSet = new Set<string>();

      for (const row of result.rows) {
        const jk = row.justice_kind;
        const period = row.period;
        justiceKindsSet.add(jk);
        periodsSet.add(period);
        if (!cells[jk]) cells[jk] = {};
        cells[jk][period] = parseInt(row.doc_count);
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - years);
      const allPeriods: string[] = [];
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cursor <= endDate) {
        const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        allPeriods.push(period);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const justiceKinds = Array.from(justiceKindsSet).sort();
      const kindLabels: Record<string, string> = {};
      for (const jk of justiceKinds) {
        kindLabels[jk] = kindNames[jk] || FALLBACK_NAMES[jk] || `Вид ${jk}`;
      }

      res.json({ cells, periods: allPeriods, justice_kinds: justiceKinds, kind_labels: kindLabels });
    } catch (err: any) {
      logger.error('registry-coverage-map error', { error: err.message });
      res.status(500).json({ error: 'Помилка отримання карти покриття' });
    }
  });

  // ========================================
  // COURT REGISTRY SCRAPER
  // ========================================

  router.post('/scrape-court-registry', async (req: Request, res: Response) => {
    const activeJobs = Array.from(scraperJobs.values()).filter(j => j.status === 'running' || j.status === 'queued');
    if (activeJobs.length >= 4) {
      return res.status(409).json({ error: 'Максимум 4 скрапери одночасно. Зупиніть один перед запуском нового.', active_count: activeJobs.length });
    }

    const {
      justice_kind = 'Кримінальне',
      justice_kind_id = '5',
      doc_form = '__all__',
      date_from = '01.01.2000',
      max_docs = 10000,
      concurrency = 5,
      proxy: proxyKey,
    } = req.body || {};

    const proxyUrl = proxyKey && proxyKey !== 'none' ? PROXIES[proxyKey as keyof typeof PROXIES] : undefined;

    const jobId = `scrape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: ScraperJob = {
      job_id: jobId,
      status: 'queued',
      justice_kind: String(justice_kind),
      justice_kind_id: String(justice_kind_id),
      doc_form: String(doc_form),
      date_from: String(date_from),
      max_docs: Math.min(parseInt(String(max_docs)) || 10000, 50000),
      concurrency: Math.min(Math.max(parseInt(String(concurrency)) || 5, 1), 10),
      proxy: proxyUrl,
      pages_processed: 0,
      downloaded: 0,
      saved_to_db: 0,
      skipped: 0,
      errors: 0,
      started_at: new Date().toISOString(),
      current_logs: [],
    };

    scraperJobs.set(jobId, job);
    persistToDB(jobId, 'court_scraper', 'queued',
      { justice_kind: job.justice_kind, justice_kind_id: job.justice_kind_id, doc_form: job.doc_form, date_from: job.date_from, max_docs: job.max_docs, concurrency: job.concurrency, proxy: job.proxy },
      { pages_processed: 0, downloaded: 0, saved_to_db: 0, skipped: 0, errors: 0 },
      [], job.started_at);
    res.json({ job_id: jobId, status: 'queued', message: 'Скрапер запущено' });

    const scriptPath = join(process.cwd(), 'dist', 'scripts', 'scrape-court-registry.js');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JUSTICE_KIND: job.justice_kind,
      JUSTICE_KIND_ID: job.justice_kind_id,
      DOC_FORM: job.doc_form,
      DATE_FROM: job.date_from,
      MAX_DOCS: String(job.max_docs),
      CONCURRENCY: String(job.concurrency),
      HEADLESS: 'true',
      SKIP_EMBEDDINGS: 'false',
      SCRAPE_DELAY_MIN_MS: '3000',
      SCRAPE_DELAY_MAX_MS: '6000',
      ...(proxyUrl && { SCRAPE_PROXY: proxyUrl }),
    };

    const child = spawn('node', [scriptPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    job.status = 'running';
    job.pid = child.pid;

    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const scraperConfig = () => ({ justice_kind: job.justice_kind, justice_kind_id: job.justice_kind_id, doc_form: job.doc_form, date_from: job.date_from, max_docs: job.max_docs, concurrency: job.concurrency, proxy: job.proxy });
    const scraperProgress = () => ({ pages_processed: job.pages_processed, downloaded: job.downloaded, saved_to_db: job.saved_to_db, skipped: job.skipped, errors: job.errors, pid: job.pid });

    let logCount = 0;
    const addLog = (line: string) => {
      const clean = stripAnsi(line).trim();
      if (!clean) return;
      job.current_logs = [...job.current_logs.slice(-49), clean];

      const pageMatch = clean.match(/--- Page (\d+) ---/);
      if (pageMatch) job.pages_processed = parseInt(pageMatch[1]);
      if (/\] Saved \([\d.]+ KB\)/.test(clean)) job.downloaded++;
      if (clean.includes('[PROC') && clean.includes('] Saved to DB')) job.saved_to_db++;
      if (clean.includes('skipping') || clean.includes('Server overload')) job.skipped++;
      if (clean.includes('] Error:') || /\[error\]/.test(clean)) job.errors++;

      if (++logCount % 50 === 0) {
        persistToDB(jobId, 'court_scraper', job.status, scraperConfig(), scraperProgress(), job.current_logs, job.started_at);
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach(addLog);
      if (job.stop_requested) child.kill('SIGTERM');
    });
    child.stderr?.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach(addLog);
    });
    child.on('close', (code: number | null) => {
      job.status = job.stop_requested ? 'stopped' : (code === 0 ? 'completed' : 'failed');
      job.completed_at = new Date().toISOString();
      logger.info(`Court scraper ${jobId} ${job.status}: downloaded=${job.downloaded}, saved=${job.saved_to_db}`);
      persistToDB(jobId, 'court_scraper', job.status, scraperConfig(), scraperProgress(), job.current_logs, job.started_at, job.completed_at);
    });
  });

  router.get('/scrape-court-registry', (_req: Request, res: Response) => {
    let latest: ScraperJob | null = null;
    for (const job of scraperJobs.values()) {
      if (!latest || job.started_at > latest.started_at) latest = job;
    }
    res.json({ active: latest ? (latest.status === 'running' || latest.status === 'queued') : false, job: latest });
  });

  router.get('/scrape-court-registry/all', async (_req: Request, res: Response) => {
    const inMemory = Array.from(scraperJobs.values());
    const inMemoryIds = new Set(inMemory.map(j => j.job_id));

    let dbJobs: ScraperJob[] = [];
    try {
      const dbRes = await db.query(
        `SELECT * FROM scraper_jobs WHERE job_type='court_scraper' ORDER BY started_at DESC LIMIT 20`
      );
      dbJobs = dbRes.rows
        .filter((r: any) => !inMemoryIds.has(r.job_id))
        .map(dbRowToScraperJob) as ScraperJob[];
    } catch { /* table may not exist yet */ }

    const all = [...inMemory, ...dbJobs]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 20);
    const active = all.filter(j => j.status === 'running' || j.status === 'queued');
    res.json({ jobs: all, active_count: active.length });
  });

  router.get('/scrape-court-registry/:jobId', async (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });
    let job: ScraperJob | undefined = scraperJobs.get(jobId);
    if (!job) {
      try {
        const dbRes = await db.query(`SELECT * FROM scraper_jobs WHERE job_id=$1`, [jobId]);
        if (dbRes.rows[0]) job = dbRowToScraperJob(dbRes.rows[0]) as ScraperJob;
      } catch { /* ignore */ }
    }
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  router.post('/scrape-court-registry/:jobId/stop', (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });
    const job = scraperJobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'running' && job.status !== 'queued') {
      return res.status(400).json({ error: 'Job is not running' });
    }
    job.stop_requested = true;
    if (job.pid) {
      try { process.kill(job.pid, 'SIGTERM'); } catch { /* already dead */ }
    }
    res.json({ message: 'Stop requested', job_id: jobId });
  });

  router.delete('/scrape-court-registry/:jobId', async (req: Request, res: Response) => {
    const jobId = getStringParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });

    const job = scraperJobs.get(jobId);
    if (job && (job.status === 'running' || job.status === 'queued')) {
      return res.status(409).json({ error: 'Cannot delete a running job. Stop it first.' });
    }

    scraperJobs.delete(jobId);
    try {
      await db.query(`DELETE FROM scraper_jobs WHERE job_id = $1`, [jobId]);
    } catch { /* non-critical */ }

    res.json({ message: 'Job deleted', job_id: jobId });
  });

  // =========== STARTUP RECOVERY ===========
  (async () => {
    try {
      const activeInDB = await db.query(
        `SELECT * FROM scraper_jobs WHERE status IN ('running', 'queued') AND started_at > NOW() - INTERVAL '24 hours'`
      );
      if (activeInDB.rows.length === 0) return;

      const ids: string[] = activeInDB.rows.map((r: any) => r.job_id);
      await db.query(
        `UPDATE scraper_jobs SET status='interrupted', completed_at=NOW(), updated_at=NOW() WHERE job_id = ANY($1)`,
        [ids],
      );

      for (const row of activeInDB.rows) {
        if (row.job_type === 'court_scraper') {
          scraperJobs.set(row.job_id, { ...dbRowToScraperJob(row), status: 'failed', completed_at: new Date().toISOString() } as ScraperJob);
        } else if (row.job_type === 'backfill') {
          backfillJobs.set(row.job_id, { ...dbRowToBackfillJob(row), status: 'failed', completed_at: new Date().toISOString() } as BackfillJob);
        }
      }
      logger.info(`[startup] Marked ${ids.length} interrupted scraper job(s) from previous session`);
    } catch { /* scraper_jobs table may not exist until migration runs */ }
  })();

  return router;
}
