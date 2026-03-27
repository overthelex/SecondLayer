/**
 * Admin Data Sources Routes — Data sources monitoring, court documents,
 * document completeness, ZO stats, bulk scrape status
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getWorkerStats } from '../worker-heartbeat-routes.js';

export function createAdminDataSourcesRoutes(
  db: IDatabase,
): Router {
  const router = Router();

  // Helper: fetch backend table stats
  const getBackendStats = async () => {
    const backendQueries = [
      { id: 'documents', name: 'Документи (судові рішення)', query: "SELECT COUNT(*) as cnt, MAX(updated_at) as lu, COUNT(*) FILTER (WHERE updated_at::date = (SELECT MAX(updated_at)::date FROM documents)) as lb FROM documents", source: 'ZakonOnline API', sourceUrl: 'https://zakononline.com.ua', frequency: 'За запитом (кеш 7 днів)' },
      { id: 'document_sections', name: 'Секції документів', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM document_sections)) as lb FROM document_sections", source: 'SemanticSectionizer (автоматично)', sourceUrl: '', frequency: 'При завантаженні документа' },
      { id: 'embedding_chunks', name: 'Вектори (embeddings)', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM embedding_chunks)) as lb FROM embedding_chunks", source: 'OpenAI text-embedding-3-small', sourceUrl: 'https://platform.openai.com', frequency: 'При обробці документа' },
      { id: 'legislation', name: 'Кодекси та закони', query: "SELECT COUNT(*) as cnt, MAX(updated_at) as lu, COUNT(*) FILTER (WHERE updated_at::date = (SELECT MAX(updated_at)::date FROM legislation)) as lb FROM legislation", source: 'Верховна Рада API', sourceUrl: 'https://zakon.rada.gov.ua/api', frequency: 'Ручний синхр. (кеш 30 днів)' },
      { id: 'legislation_articles', name: 'Статті законодавства', query: "SELECT COUNT(*) as cnt, MAX(updated_at) as lu, COUNT(*) FILTER (WHERE updated_at::date = (SELECT MAX(updated_at)::date FROM legislation_articles)) as lb FROM legislation_articles", source: 'Верховна Рада API', sourceUrl: 'https://zakon.rada.gov.ua/api', frequency: 'Ручний синхр. (get_legislation_structure)' },
{ id: 'conversations', name: 'Розмови (чат)', query: "SELECT COUNT(*) as cnt, MAX(updated_at) as lu, COUNT(*) FILTER (WHERE updated_at::date = (SELECT MAX(updated_at)::date FROM conversations)) as lb FROM conversations", source: 'Дії користувачів', sourceUrl: '', frequency: 'Реальний час' },
      { id: 'conversation_messages', name: 'Повідомлення чату', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM conversation_messages)) as lb FROM conversation_messages", source: 'AI + користувачі', sourceUrl: '', frequency: 'Реальний час' },
      { id: 'users', name: 'Користувачі', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM users)) as lb FROM users", source: 'Google OAuth', sourceUrl: '', frequency: 'При реєстрації' },
      { id: 'cost_tracking', name: 'Трекінг витрат API', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM cost_tracking)) as lb FROM cost_tracking", source: 'CostTracker (автоматично)', sourceUrl: '', frequency: 'Кожен API виклик' },
      { id: 'clients', name: 'Клієнти', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM clients)) as lb FROM clients", source: 'Дії адміністратора', sourceUrl: '', frequency: 'При створенні' },
      { id: 'matters', name: 'Справи', query: "SELECT COUNT(*) as cnt, MAX(created_at) as lu, COUNT(*) FILTER (WHERE created_at::date = (SELECT MAX(created_at)::date FROM matters)) as lb FROM matters", source: 'Дії юристів', sourceUrl: '', frequency: 'При створенні' },
      { id: 'upload_sessions', name: 'Сесії завантаження', query: "SELECT COUNT(*) as cnt, MAX(updated_at) as lu, COUNT(*) FILTER (WHERE updated_at::date = (SELECT MAX(updated_at)::date FROM upload_sessions)) as lb FROM upload_sessions", source: 'UploadService', sourceUrl: '', frequency: 'При завантаженні файлів' },
    ];

    const tables = [];
    for (const q of backendQueries) {
      try {
        const result = await db.query(q.query);
        tables.push({
          id: q.id, name: q.name,
          rows: parseInt(result.rows[0]?.cnt || '0'),
          source: q.source, sourceUrl: q.sourceUrl,
          updateFrequency: q.frequency,
          lastUpdate: result.rows[0]?.lu || null,
          lastBatchCount: parseInt(result.rows[0]?.lb || '0'),
        });
      } catch {
        tables.push({
          id: q.id, name: q.name, rows: 0,
          source: q.source, sourceUrl: q.sourceUrl,
          updateFrequency: q.frequency, lastUpdate: null, lastBatchCount: 0,
        });
      }
    }

    let dbSizeMb = 0;
    try {
      const sizeResult = await db.query("SELECT pg_database_size(current_database()) as size_bytes");
      dbSizeMb = Math.round(parseInt(sizeResult.rows[0]?.size_bytes || '0') / 1024 / 1024);
    } catch { /* ignore */ }

    return { tables, dbSizeMb, timestamp: new Date().toISOString() };
  };

  // Helper: fetch from external service with timeout
  const fetchServiceStats = async (url: string, serviceName: string, timeoutMs = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e: any) {
      return { service: serviceName, tables: {}, dbSizeMb: 0, error: e.message, timestamp: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  };

  router.get('/data-sources', async (req: Request, res: Response) => {
    try {
      const section = req.query.section as string | undefined;
      const radaUrl = process.env.RADA_MCP_URL || 'http://rada-mcp-app-local:3001';
      const openreyestrUrl = process.env.OPENREYESTR_MCP_URL || 'http://openreyestr-app-local:3004';

      if (section === 'backend') {
        return res.json(await getBackendStats());
      }

      if (section === 'rada') {
        return res.json(await fetchServiceStats(`${radaUrl}/api/stats`, 'rada'));
      }

      if (section === 'openreyestr') {
        return res.json(await fetchServiceStats(`${openreyestrUrl}/api/stats`, 'openreyestr'));
      }

      const [backend, rada, openreyestr] = await Promise.all([
        getBackendStats(),
        fetchServiceStats(`${radaUrl}/api/stats`, 'rada'),
        fetchServiceStats(`${openreyestrUrl}/api/stats`, 'openreyestr'),
      ]);

      res.json({ backend, rada, openreyestr, timestamp: new Date().toISOString() });
    } catch (error: any) {
      logger.error('Failed to get data sources status', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve data sources status' });
    }
  });

  // ========================================
  // RECENT COURT DOCUMENTS BY PRACTICE AREA
  // ========================================

  router.get('/court-documents/recent', async (req: Request, res: Response) => {
    try {
      const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
      const limitPerCategory = Math.min(20, Math.max(1, Number(req.query.limit || 5)));

      const kindNames: Record<string, string> = {};

      const summaryResult = await db.query(`
        SELECT
          COALESCE(metadata->>'justice_kind', 'other') as kind,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - $1::integer * INTERVAL '1 day') as recent,
          MIN(date) as earliest_date,
          MAX(date) as latest_date,
          MAX(created_at) as last_loaded_at
        FROM documents
        WHERE type = 'court_decision'
        GROUP BY COALESCE(metadata->>'justice_kind', 'other')
        ORDER BY recent DESC, total DESC
      `, [days]);

      const recentResult = await db.query(`
        WITH ranked AS (
          SELECT
            id, title, date, court, case_number, dispute_category,
            COALESCE(metadata->>'justice_kind', 'other') as kind,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY COALESCE(metadata->>'justice_kind', 'other') ORDER BY created_at DESC) as rn
          FROM documents
          WHERE type = 'court_decision'
            AND created_at >= NOW() - $1::integer * INTERVAL '1 day'
        )
        SELECT * FROM ranked WHERE rn <= $2
        ORDER BY kind, created_at DESC
      `, [days, limitPerCategory]);

      const totalsResult = await db.query(`
        SELECT
          COUNT(*) as total_court_docs,
          COUNT(*) FILTER (WHERE created_at >= NOW() - $1::integer * INTERVAL '1 day') as recent_court_docs
        FROM documents
        WHERE type = 'court_decision'
      `, [days]);

      const categories = summaryResult.rows.map((row: any) => {
        const kind = row.kind;
        let name: string;
        if (kindNames[kind]) {
          name = kindNames[kind];
        } else if (kind === 'other') {
          name = 'Реєстр судових рішень';
        } else {
          name = `Вид ${kind}`;
        }

        return {
          code: kind,
          name,
          total: parseInt(row.total),
          recent: parseInt(row.recent),
          earliest_date: row.earliest_date,
          latest_date: row.latest_date,
          last_loaded_at: row.last_loaded_at,
          documents: recentResult.rows
            .filter((d: any) => d.kind === kind)
            .map((d: any) => ({
              id: d.id,
              title: d.title,
              date: d.date,
              court: d.court,
              case_number: d.case_number,
              dispute_category: d.dispute_category,
              loaded_at: d.created_at,
            })),
        };
      });

      res.json({
        total_court_docs: parseInt(totalsResult.rows[0]?.total_court_docs || '0'),
        recent_court_docs: parseInt(totalsResult.rows[0]?.recent_court_docs || '0'),
        days,
        categories,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get recent court documents', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve court document statistics' });
    }
  });

  // ========================================
  // DOCUMENT COMPLETENESS CHECK
  // ========================================

  const completenessRunCounts = new Map<string, number>();
  const MAX_COMPLETENESS_RUNS_PER_DAY = 5;

  router.post('/document-completeness-check', async (req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const runsToday = completenessRunCounts.get(today) || 0;

      if (runsToday >= MAX_COMPLETENESS_RUNS_PER_DAY) {
        return res.status(429).json({
          error: `Ліміт вичерпано: ${MAX_COMPLETENESS_RUNS_PER_DAY}/${MAX_COMPLETENESS_RUNS_PER_DAY} перевірок сьогодні`,
          runs_today: runsToday,
          max_runs_per_day: MAX_COMPLETENESS_RUNS_PER_DAY,
        });
      }

      for (const key of completenessRunCounts.keys()) {
        if (key !== today) completenessRunCounts.delete(key);
      }
      completenessRunCounts.set(today, runsToday + 1);

      const kindNames: Record<string, string> = {};

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

      res.json({
        checked_at: new Date().toISOString(),
        runs_today: runsToday + 1,
        max_runs_per_day: MAX_COMPLETENESS_RUNS_PER_DAY,
        summary: {
          ...summary,
          completeness_pct: summary.total_documents > 0
            ? Math.round((summary.with_both / summary.total_documents) * 10000) / 100
            : 0,
        },
        by_justice_kind: byJusticeKind,
      });
    } catch (error: any) {
      logger.error('Failed to run document completeness check', { error: error.message });
      res.status(500).json({ error: 'Failed to run document completeness check' });
    }
  });

  // =========== BULK SCRAPE STATUS ===========

  router.get('/bulk-scrape-status', async (_req: Request, res: Response) => {
    try {
      const jobsResult = await db.query(
        `SELECT job_id, phase, status, total_docs, processed_docs, failed_docs, skipped_docs,
                metadata, error_message, started_at, completed_at, created_at
         FROM bulk_scrape_jobs
         ORDER BY created_at DESC
         LIMIT 20`
      );

      const statsResult = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%') as total_court,
          COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%' AND full_text IS NOT NULL AND length(full_text) > 100) as with_full_text,
          COUNT(*) FILTER (WHERE zakononline_id LIKE 'court_%' AND full_text IS NULL) as without_full_text
        FROM documents
      `);

      const sectionResult = await db.query(`
        SELECT COUNT(DISTINCT document_id) as with_sections
        FROM document_sections ds
        JOIN documents d ON d.id = ds.document_id
        WHERE d.zakononline_id LIKE 'court_%'
      `);

      const courtBreakdownResult = await db.query(`
        SELECT
          COALESCE(metadata->>'court_name', 'Невідомий суд') as court_name,
          COUNT(*) as pending_count,
          COUNT(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) > 100) as has_text_count,
          COUNT(*) as total_count
        FROM documents
        WHERE zakononline_id LIKE 'court_%'
        GROUP BY metadata->>'court_name'
        ORDER BY COUNT(*) FILTER (WHERE full_text IS NULL) DESC
        LIMIT 50
      `);

      const justiceKindResult = await db.query(`
        SELECT
          COALESCE(metadata->>'justice_kind', 'Невідомо') as justice_kind,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE full_text IS NOT NULL AND length(full_text) > 100) as has_text_count,
          COUNT(*) FILTER (WHERE full_text IS NULL) as pending_count
        FROM documents
        WHERE zakononline_id LIKE 'court_%'
        GROUP BY metadata->>'justice_kind'
        ORDER BY COUNT(*) DESC
      `);

      const pgStats = statsResult.rows[0];
      const totalCourt = parseInt(pgStats.total_court, 10);
      const withFullText = parseInt(pgStats.with_full_text, 10);
      const withSections = parseInt(sectionResult.rows[0].with_sections, 10);

      // AWS Pipeline stats (SQS + S3)
      let aws_pipeline: {
        sqs_pending: number;
        sqs_in_flight: number;
        sqs_dlq: number;
        s3_downloaded: number;
        active: boolean;
      } | null = null;

      const sqsQueueUrl = process.env.BULK_SCRAPE_SQS_QUEUE_URL;
      const sqsDlqUrl = process.env.BULK_SCRAPE_SQS_DLQ_URL;
      const s3Bucket = process.env.BULK_SCRAPE_S3_BUCKET;
      const awsRegion = process.env.AWS_REGION || 'eu-central-1';

      if (sqsQueueUrl) {
        try {
          const sqs = new SQSClient({ region: awsRegion });
          const s3 = s3Bucket ? new S3Client({ region: awsRegion }) : null;

          const queueAttrs = await sqs.send(new GetQueueAttributesCommand({
            QueueUrl: sqsQueueUrl,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
          }));
          const sqsPending = parseInt(queueAttrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
          const sqsInFlight = parseInt(queueAttrs.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10);

          let sqsDlq = 0;
          if (sqsDlqUrl) {
            try {
              const dlqAttrs = await sqs.send(new GetQueueAttributesCommand({
                QueueUrl: sqsDlqUrl,
                AttributeNames: ['ApproximateNumberOfMessages'],
              }));
              sqsDlq = parseInt(dlqAttrs.Attributes?.ApproximateNumberOfMessages || '0', 10);
            } catch { /* ignore DLQ errors */ }
          }

          let s3Downloaded = 0;
          if (s3) {
            try {
              let continuationToken: string | undefined;
              let pages = 0;
              do {
                const listResp = await s3.send(new ListObjectsV2Command({
                  Bucket: s3Bucket,
                  Prefix: 'raw/',
                  MaxKeys: 1000,
                  ContinuationToken: continuationToken,
                }));
                s3Downloaded += listResp.KeyCount || 0;
                continuationToken = listResp.NextContinuationToken;
                pages++;
              } while (continuationToken && pages < 5);
            } catch (err: any) {
              logger.warn('S3 bucket listing failed', { error: err.message, bucket: s3Bucket });
            }
          }

          aws_pipeline = {
            sqs_pending: sqsPending,
            sqs_in_flight: sqsInFlight,
            sqs_dlq: sqsDlq,
            s3_downloaded: s3Downloaded,
            active: sqsInFlight > 0 || sqsPending > 0,
          };
        } catch (err: any) {
          logger.warn('AWS pipeline stats unavailable', { error: err.message });
        }
      }

      const workers = await getWorkerStats();

      res.json({
        jobs: jobsResult.rows,
        stats: {
          total_court_docs: totalCourt,
          with_full_text: withFullText,
          without_full_text: parseInt(pgStats.without_full_text, 10),
          with_sections: withSections,
          completion_pct: totalCourt > 0 ? ((withFullText / totalCourt) * 100).toFixed(1) : '0.0',
        },
        aws_pipeline,
        workers: workers.length > 0 ? workers : undefined,
        court_breakdown: courtBreakdownResult.rows.map((r: any) => ({
          court_name: r.court_name,
          total: parseInt(r.total_count, 10),
          has_text: parseInt(r.has_text_count, 10),
          pending: parseInt(r.total_count, 10) - parseInt(r.has_text_count, 10),
        })),
        justice_kind_breakdown: justiceKindResult.rows.map((r: any) => ({
          justice_kind: r.justice_kind,
          total: parseInt(r.total_count, 10),
          has_text: parseInt(r.has_text_count, 10),
          pending: parseInt(r.pending_count, 10),
        })),
      });
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        res.json({ jobs: [], stats: null, message: 'bulk_scrape_jobs table not yet created. Run migration 061.' });
      } else {
        logger.error('Failed to get bulk scrape status', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve bulk scrape status' });
      }
    }
  });

  return router;
}
