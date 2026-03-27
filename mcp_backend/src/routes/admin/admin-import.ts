/**
 * Admin Import Routes — Import samples, DB compare
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';

export function createAdminImportRoutes(
  db: IDatabase,
): Router {
  const router = Router();

  // ========================================
  // IMPORT SAMPLES (Recent Script Uploads)
  // ========================================

  router.get('/import-samples', async (req: Request, res: Response) => {
    try {
      const hours = Math.min(168, Math.max(1, Number(req.query.hours || 24)));
      const samplesPerSource = Math.min(10, Math.max(1, Number(req.query.limit || 5)));

      const samples: any[] = [];

      // 1. Court decisions
      const courtDecisions = await db.query(`
        SELECT
          id, title, court, case_number, dispute_category, date,
          metadata->>'justice_kind' as justice_kind,
          GREATEST(created_at, COALESCE(updated_at, created_at)) as loaded_at,
          created_at, type
        FROM documents
        WHERE type = 'court_decision'
          AND user_id IS NULL
          AND (created_at >= NOW() - $1::integer * INTERVAL '1 hour'
            OR updated_at >= NOW() - $1::integer * INTERVAL '1 hour')
        ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) DESC
        LIMIT $2
      `, [hours, samplesPerSource]);

      if (courtDecisions.rows.length > 0) {
        samples.push({
          source: 'court_decisions',
          source_name: 'Судові рішення',
          count: courtDecisions.rows.length,
          last_import: courtDecisions.rows[0]?.loaded_at,
          records: courtDecisions.rows.map((r: any) => ({
            id: r.id,
            title: r.title?.substring(0, 150),
            court: r.court,
            case_number: r.case_number,
            category: r.dispute_category,
            justice_kind: r.justice_kind,
            date: r.date,
            created_at: r.loaded_at,
          })),
        });
      }

      // 2. Legislation
      const legislation = await db.query(`
        SELECT
          id, title, type, rada_id, status,
          effective_date, created_at, updated_at
        FROM legislation
        WHERE created_at >= NOW() - $1::integer * INTERVAL '1 hour'
           OR updated_at >= NOW() - $1::integer * INTERVAL '1 hour'
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT $2
      `, [hours, samplesPerSource]);

      if (legislation.rows.length > 0) {
        samples.push({
          source: 'legislation',
          source_name: 'Законодавство',
          count: legislation.rows.length,
          last_import: legislation.rows[0]?.updated_at || legislation.rows[0]?.created_at,
          records: legislation.rows.map((r: any) => ({
            id: r.id,
            title: r.title?.substring(0, 150),
            type: r.type,
            rada_id: r.rada_id,
            status: r.status,
            effective_date: r.effective_date,
            created_at: r.created_at,
          })),
        });
      }

      // 3. Embedding chunks
      const embeddings = await db.query(`
        SELECT
          ec.id, ec.document_section_id, ec.vector_id,
          ec.created_at, d.title as document_title
        FROM embedding_chunks ec
        LEFT JOIN document_sections ds ON ds.id = ec.document_section_id
        LEFT JOIN documents d ON d.id = ds.document_id
        WHERE ec.created_at >= NOW() - $1::integer * INTERVAL '1 hour'
        ORDER BY ec.created_at DESC
        LIMIT $2
      `, [hours, samplesPerSource]);

      if (embeddings.rows.length > 0) {
        samples.push({
          source: 'embeddings',
          source_name: 'Векторні вкладення',
          count: embeddings.rows.length,
          last_import: embeddings.rows[0]?.created_at,
          records: embeddings.rows.map((r: any) => ({
            id: r.id,
            document_section_id: r.document_section_id,
            vector_id: r.vector_id,
            document_title: r.document_title?.substring(0, 100),
            created_at: r.created_at,
          })),
        });
      }

      // 4. User uploads
      const userUploads = await db.query(`
        SELECT
          d.id, d.title, d.type, d.created_at,
          u.email as user_email, u.name as user_name
        FROM documents d
        LEFT JOIN users u ON u.id = d.user_id
        WHERE d.user_id IS NOT NULL
          AND d.created_at >= NOW() - $1::integer * INTERVAL '1 hour'
        ORDER BY d.created_at DESC
        LIMIT $2
      `, [hours, samplesPerSource]);

      if (userUploads.rows.length > 0) {
        samples.push({
          source: 'user_uploads',
          source_name: 'Завантаження користувачів',
          count: userUploads.rows.length,
          last_import: userUploads.rows[0]?.created_at,
          records: userUploads.rows.map((r: any) => ({
            id: r.id,
            title: r.title?.substring(0, 100),
            type: r.type,
            user_email: r.user_email,
            user_name: r.user_name,
            created_at: r.created_at,
          })),
        });
      }

      // Summary stats
      const summaryResult = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM documents WHERE type = 'court_decision' AND user_id IS NULL AND (created_at >= NOW() - $1::integer * INTERVAL '1 hour' OR updated_at >= NOW() - $1::integer * INTERVAL '1 hour')) as court_decisions,
          (SELECT COUNT(*) FROM legislation WHERE created_at >= NOW() - $1::integer * INTERVAL '1 hour' OR updated_at >= NOW() - $1::integer * INTERVAL '1 hour') as legislation,
          (SELECT COUNT(*) FROM embedding_chunks WHERE created_at >= NOW() - $1::integer * INTERVAL '1 hour') as embeddings,
          (SELECT COUNT(*) FROM documents WHERE user_id IS NOT NULL AND created_at >= NOW() - $1::integer * INTERVAL '1 hour') as user_uploads
      `, [hours]);

      res.json({
        hours,
        samples,
        summary: {
          court_decisions: parseInt(summaryResult.rows[0]?.court_decisions || '0'),
          legislation: parseInt(summaryResult.rows[0]?.legislation || '0'),
          embeddings: parseInt(summaryResult.rows[0]?.embeddings || '0'),
          user_uploads: parseInt(summaryResult.rows[0]?.user_uploads || '0'),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get import samples', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve import samples' });
    }
  });

  // ========================================
  // DB Compare: local vs stage table counts
  // ========================================
  router.get('/db-compare', async (req: Request, res: Response) => {
    const localOnly = req.query.local_only === 'true';

    async function fetchServiceStatsLocal(baseUrl: string, apiKey: string, label: string) {
      try {
        const resp = await axios.get(`${baseUrl}/api/stats`, {
          headers: { 'x-api-key': apiKey },
          timeout: 15000,
        });
        return resp.data;
      } catch (err: any) {
        logger.warn(`db-compare: failed to fetch ${label} stats`, { error: err.message });
        return null;
      }
    }

    async function fetchMainDbStats(dbInstance: IDatabase) {
      const tableList = [
        'documents', 'document_sections', 'legislation', 'legislation_articles',
        'legislation_chunks', 'users', 'conversations', 'upload_sessions',
      ];
      const tables: Record<string, number> = {};
      for (const t of tableList) {
        try {
          const r = await dbInstance.query(`SELECT COUNT(*) as cnt FROM ${t}`);
          tables[t] = parseInt(r.rows[0]?.cnt || '0');
        } catch {
          tables[t] = -1;
        }
      }
      return tables;
    }

    try {
      const openreyestrUrl = process.env.OPENREYESTR_MCP_URL || 'http://openreyestr-app-local:3004';
      const openreyestrKey = process.env.OPENREYESTR_API_KEY || 'test-key-123';
      const radaUrl = process.env.RADA_MCP_URL || 'http://rada-mcp-app-local:3001';
      const radaKey = process.env.RADA_API_KEY || 'test-key-123';

      const [openreyestrStats, radaStats, mainStats] = await Promise.all([
        fetchServiceStatsLocal(openreyestrUrl, openreyestrKey, 'openreyestr-local'),
        fetchServiceStatsLocal(radaUrl, radaKey, 'rada-local'),
        fetchMainDbStats(db),
      ]);

      const localData = {
        openreyestr: openreyestrStats,
        rada: radaStats,
        main: mainStats,
        timestamp: new Date().toISOString(),
      };

      if (localOnly) {
        return res.json({ local: localData });
      }

      const stageBackendUrl = process.env.STAGE_BACKEND_URL || 'https://stage.legal.org.ua';
      const stageApiKey = process.env.STAGE_API_KEY ||
        process.env.SECONDARY_LAYER_KEYS?.split(',')[0]?.trim() || '';
      let stageData: any = null;
      try {
        const stageResp = await axios.get(`${stageBackendUrl}/api/internal/db-stats`, {
          headers: { Authorization: `Bearer ${stageApiKey}` },
          timeout: 20000,
        });
        stageData = stageResp.data?.local || null;
      } catch (err: any) {
        logger.warn('db-compare: failed to fetch stage data', { error: err.message });
      }

      return res.json({
        local: localData,
        stage: stageData,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('db-compare failed', { error: error.message });
      res.status(500).json({ error: 'Failed to compare databases' });
    }
  });

  return router;
}
