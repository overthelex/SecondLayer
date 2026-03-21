/**
 * EDRSR routes — direct access to court decisions registry.
 *
 * GET  /api/edrsr/:docId/fulltext  — Full text of a specific decision
 * POST /api/edrsr/search           — Search EDRSR without chat
 */

import { Router, type Response } from 'express';
import type { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export function createEdsrRoutes(db: IDatabase): Router {
  const router = Router();

  // GET /api/edrsr/:docId/fulltext
  router.get('/:docId/fulltext', (async (req: DualAuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const docId = req.params.docId;
      if (!docId || isNaN(Number(docId))) {
        return res.status(400).json({ error: 'Невірний doc_id' });
      }

      // Fetch metadata
      const metaResult = await db.query(
        `SELECT doc_id, cause_num, judge, court_code, justice_kind,
                judgment_code, adjudication_date, receipt_date, status
         FROM edrsr_documents
         WHERE doc_id = $1
         LIMIT 1`,
        [Number(docId)]
      );

      if (metaResult.rows.length === 0) {
        return res.status(404).json({ error: 'Документ не знайдено' });
      }

      // Fetch fulltext
      const textResult = await db.query(
        `SELECT full_text FROM edrsr_fulltext WHERE doc_id = $1 LIMIT 1`,
        [Number(docId)]
      );

      const meta = metaResult.rows[0];

      // Enrich with court name and judgment form
      const [courtResult, formResult] = await Promise.all([
        db.query('SELECT name FROM edrsr_courts WHERE court_code = $1 LIMIT 1', [meta.court_code]),
        db.query('SELECT name FROM edrsr_judgment_forms WHERE judgment_code = $1 LIMIT 1', [meta.judgment_code]),
      ]);

      res.json({
        doc_id: meta.doc_id,
        cause_num: meta.cause_num,
        judge: meta.judge,
        court_code: meta.court_code,
        court_name: courtResult.rows[0]?.name || null,
        justice_kind: meta.justice_kind,
        judgment_code: meta.judgment_code,
        judgment_form: formResult.rows[0]?.name || null,
        adjudication_date: meta.adjudication_date,
        receipt_date: meta.receipt_date,
        full_text: textResult.rows[0]?.full_text || null,
        external_url: `https://reyestr.court.gov.ua/Review/${docId}`,
      });
    } catch (err: any) {
      logger.error('[EdsrRoutes] getFulltext error', { error: err.message, docId: req.params.docId });
      res.status(500).json({ error: 'Помилка отримання тексту рішення' });
    }
  }) as any);

  // POST /api/edrsr/search
  router.post('/search', (async (req: DualAuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const {
        cause_num, judge, court_code, court_name, justice_kind,
        judgment_code, date_from, date_to, instance_code,
        limit: rawLimit, offset: rawOffset,
      } = req.body;

      const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
      const offset = Math.max(Number(rawOffset) || 0, 0);

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (cause_num) {
        conditions.push(`d.cause_num = $${paramIdx++}`);
        params.push(cause_num);
      }
      if (judge) {
        conditions.push(`LOWER(d.judge) LIKE LOWER($${paramIdx++})`);
        params.push(`%${judge}%`);
      }
      if (court_code) {
        conditions.push(`d.court_code = $${paramIdx++}`);
        params.push(Number(court_code));
      }
      if (court_name) {
        const courtLookup = await db.query(
          'SELECT court_code FROM edrsr_courts WHERE LOWER(name) LIKE LOWER($1) LIMIT 20',
          [`%${court_name}%`]
        );
        if (courtLookup.rows.length > 0) {
          const codes = courtLookup.rows.map((r: any) => r.court_code);
          conditions.push(`d.court_code = ANY($${paramIdx++})`);
          params.push(codes);
        } else {
          return res.json({ results: [], total: 0, note: `Суд "${court_name}" не знайдено` });
        }
      }
      if (justice_kind) {
        conditions.push(`d.justice_kind = $${paramIdx++}`);
        params.push(Number(justice_kind));
      }
      if (judgment_code) {
        conditions.push(`d.judgment_code = $${paramIdx++}`);
        params.push(Number(judgment_code));
      }
      if (instance_code) {
        conditions.push(`d.instance_code = $${paramIdx++}`);
        params.push(Number(instance_code));
      }
      if (date_from) {
        conditions.push(`d.adjudication_date >= $${paramIdx++}`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`d.adjudication_date <= $${paramIdx++}`);
        params.push(date_to);
      }

      if (conditions.length === 0) {
        return res.status(400).json({ error: 'Потрібен хоча б один параметр пошуку' });
      }

      const whereClause = conditions.join(' AND ');

      const [dataResult, countResult] = await Promise.all([
        db.query(
          `SELECT d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
                  d.judgment_code, d.adjudication_date, d.receipt_date, d.status
           FROM edrsr_documents d
           WHERE ${whereClause}
           ORDER BY d.adjudication_date DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, limit, offset]
        ),
        db.query(
          `SELECT COUNT(*)::int as total FROM edrsr_documents d WHERE ${whereClause}`,
          params
        ),
      ]);

      // Enrich with court names and judgment forms
      const courtCodes = [...new Set(dataResult.rows.map((r: any) => r.court_code))];
      const judgmentCodes = [...new Set(dataResult.rows.map((r: any) => r.judgment_code))];

      const [courts, forms] = await Promise.all([
        courtCodes.length > 0
          ? db.query('SELECT court_code, name FROM edrsr_courts WHERE court_code = ANY($1)', [courtCodes])
          : { rows: [] },
        judgmentCodes.length > 0
          ? db.query('SELECT judgment_code, name FROM edrsr_judgment_forms WHERE judgment_code = ANY($1)', [judgmentCodes])
          : { rows: [] },
      ]);

      const courtMap = new Map((courts as any).rows.map((r: any) => [r.court_code, r.name]));
      const formMap = new Map((forms as any).rows.map((r: any) => [r.judgment_code, r.name]));

      const results = dataResult.rows.map((r: any) => ({
        ...r,
        court_name: courtMap.get(r.court_code) || null,
        judgment_form: formMap.get(r.judgment_code) || null,
        external_url: `https://reyestr.court.gov.ua/Review/${r.doc_id}`,
      }));

      res.json({
        results,
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
      });
    } catch (err: any) {
      logger.error('[EdsrRoutes] search error', { error: err.message });
      res.status(500).json({ error: 'Помилка пошуку' });
    }
  }) as any);

  return router;
}
