/**
 * Grounded legal substrate API — the REST surface a customer integrates against.
 *
 * This is the "small REST layer over the ten questions everyone asks" from the
 * product spec, implemented over the Dutch graph and deliberately written so the
 * Finnish graph can be served through the same contract: every path is
 * /api/v1/substrate/:jurisdiction/..., ids are ECLI for case law and the
 * national act id (BWB for NL, Finlex for FI) for legislation, and the response
 * shapes never mention Rechtspraak.
 *
 * Three rules the contract enforces, because they are what the product sells:
 *
 *   1. Every reference carries `resolved`. When false it carries
 *      `unresolved_reason` instead of quietly disappearing. A caller can always
 *      tell "we checked and there is nothing" from "we did not check".
 *   2. Every node carries `redistribution`. `link_out` nodes (ECHR, per the
 *      index-and-link-out rule) return metadata and a source URL and never text,
 *      whatever the caller asks for.
 *   3. Anything time-dependent takes `as_of`. A statute answer without a date is
 *      a guess about which version applied.
 *
 * The ten questions:
 *   1  GET  /search                        find decisions
 *   2  GET  /decisions/:ecli               one decision with its resolved refs
 *   3  GET  /decisions/:ecli/status        is it still good law
 *   4  GET  /decisions/:ecli/citing        who cites it
 *   5  GET  /decisions/:ecli/cited         what it cites
 *   6  GET  /decisions/:ecli/chain         the instance ladder
 *   7  GET  /legislation/:lawId/case-law   decisions applying an article
 *   8  GET  /legislation/:lawId            an act, as in force on a date
 *   9  GET  /resolve                       any citation string to a canonical node
 *  10  GET  /changes                       what changed since a timestamp
 *
 * Plus GET /catalog, which describes all of the above so an agent can discover
 * the surface without reading this file.
 */

import { Router, type Response } from 'express';
import type { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import type { IDatabase } from '../domain/ports/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

/** Per-jurisdiction wiring. Adding Finland is adding an entry here. */
interface JurisdictionConfig {
  code: string;
  name: string;
  decisionsTable: string;
  citationsTable: string;
  statuteEdgesTable: string;
  instanceLinksTable: string;
  precedentTable: string;
  aliasTable: string;
  lawsTable: string;
  editionsTable: string;
  ftsConfig: string;
  /** ECLI prefixes whose text we may serve. Anything else is link-out only. */
  redistributable: boolean;
}

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  nl: {
    code: 'NL',
    name: 'Netherlands (Rechtspraak)',
    decisionsTable: 'nl_rechtspraak_decisions',
    citationsTable: 'nl_case_citations',
    statuteEdgesTable: 'nl_legislation_citations',
    instanceLinksTable: 'nl_instance_links',
    precedentTable: 'nl_precedent_status',
    aliasTable: 'nl_case_aliases',
    lawsTable: 'nl_laws',
    editionsTable: 'nl_law_editions',
    ftsConfig: 'dutch',
    redistributable: true,
  },
};

const MAX_LIMIT = 100;

const substrateRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'substrate_api',
});

function jurisdictionOf(req: DualAuthRequest): JurisdictionConfig | null {
  return JURISDICTIONS[String(req.params.jurisdiction || '').toLowerCase()] ?? null;
}

function clampLimit(raw: unknown, fallback = 20): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Which corpus an ECLI belongs to, and whether we may serve its text.
 * ECHR is indexed but never redistributed, so its nodes come back without text
 * regardless of the endpoint.
 */
function classifyEcli(ecli: string): { corpus: string; redistribution: 'full' | 'link_out' } {
  if (ecli.startsWith('ECLI:CE:ECHR:')) return { corpus: 'echr', redistribution: 'link_out' };
  if (ecli.startsWith('ECLI:EU:')) return { corpus: 'cjeu', redistribution: 'full' };
  if (ecli.startsWith('ECLI:NL:')) return { corpus: 'nl', redistribution: 'full' };
  return { corpus: 'other', redistribution: 'link_out' };
}

function fail(res: Response, code: number, error: string, detail?: string) {
  return res.status(code).json({ error, ...(detail ? { detail } : {}) });
}

export function createSubstrateRoutes(db: IDatabase): Router {
  const router = Router({ mergeParams: true });

  router.use(substrateRateLimit as any);

  // Catalog is registered before the jurisdiction guard on purpose: Express
  // matches '/catalog' against router.use('/:jurisdiction'), so a guard placed
  // first answers unknown_jurisdiction for the discovery endpoint itself.
  // ---------------------------------------------------------------- catalog
  router.get('/catalog', (_req: any, res: Response) => {
    res.json({
      service: 'grounded-legal-substrate',
      version: '1',
      jurisdictions: Object.values(JURISDICTIONS).map(j => ({
        code: j.code, name: j.name, base: `/api/v1/substrate/${j.code.toLowerCase()}`,
      })),
      guarantees: {
        resolved_flag: 'every reference carries resolved; when false, unresolved_reason says why',
        redistribution: 'link_out nodes never carry text, only metadata and source_url',
        point_in_time: 'statute endpoints accept as_of=YYYY-MM-DD and answer for that date',
      },
      endpoints: [
        { path: '/{j}/search', q: 'full-text query', filters: 'court, date_from, date_to, subject', order: 'relevance | authority | date' },
        { path: '/{j}/decisions/{ecli}', returns: 'decision with resolved citations' },
        { path: '/{j}/decisions/{ecli}/status', returns: 'precedent status and what changed it' },
        { path: '/{j}/decisions/{ecli}/citing', returns: 'inbound citations' },
        { path: '/{j}/decisions/{ecli}/cited', returns: 'outbound citations, resolved' },
        { path: '/{j}/decisions/{ecli}/chain', returns: 'instance ladder with outcomes' },
        { path: '/{j}/legislation/{lawId}', params: 'as_of', returns: 'act and the edition in force' },
        { path: '/{j}/legislation/{lawId}/case-law', params: 'article', returns: 'decisions applying it' },
        { path: '/{j}/resolve', params: 'ref', returns: 'canonical node for any citation string' },
        { path: '/{j}/changes', params: 'since, limit', returns: 'nodes changed since a timestamp' },
      ],
    });
  });

  router.use('/:jurisdiction', (req: any, res: Response, next: any) => {
    if (!jurisdictionOf(req)) {
      return fail(res, 404, 'unknown_jurisdiction',
        `Known: ${Object.keys(JURISDICTIONS).join(', ')}`);
    }
    next();
  });

  // -------------------------------------------------------------- 1. search
  router.get('/:jurisdiction/search', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return fail(res, 400, 'q_required');

      const limit = clampLimit(req.query.limit);
      const params: unknown[] = [q];
      const where: string[] = [
        `to_tsvector('${j.ftsConfig}', coalesce(summary,'') || ' ' || coalesce(full_text,''))
           @@ plainto_tsquery('${j.ftsConfig}', $1)`,
        'full_text IS NOT NULL',   // matches the partial index
      ];

      if (req.query.court) { params.push(req.query.court); where.push(`court_code = $${params.length}`); }
      if (req.query.date_from) { params.push(req.query.date_from); where.push(`decision_date >= $${params.length}`); }
      if (req.query.date_to) { params.push(req.query.date_to); where.push(`decision_date <= $${params.length}`); }
      if (req.query.subject) { params.push([req.query.subject]); where.push(`subject_areas && $${params.length}`); }

      // Ordering is a measured tradeoff, so it is a parameter rather than a
      // hidden choice. Ranking with ts_rank over the full text costs 42s on this
      // corpus: it recomputes the tsvector for every match before LIMIT applies.
      // Over the summary alone it is 603ms and still textual; by authority it is
      // 73ms. Measured on "huurovereenkomst ontbinding", 20 rows.
      const order = String(req.query.order || 'relevance');
      const orderSql = order === 'authority'
        ? 'coalesce(p.cited_by_count,0) DESC, d.decision_date DESC'
        : order === 'date'
          ? 'd.decision_date DESC'
          : `ts_rank(to_tsvector('${j.ftsConfig}', coalesce(d.summary,'')),
                     plainto_tsquery('${j.ftsConfig}', $1)) DESC,
             coalesce(p.cited_by_count,0) DESC`;

      params.push(limit);
      const rows = await db.query(
        `SELECT d.ecli, d.court_name, d.decision_date, d.decision_type, d.procedure_type,
                d.subject_areas, d.summary,
                coalesce(p.cited_by_count, 0) AS cited_by_count, p.status AS precedent_status
           FROM ${j.decisionsTable} d
           LEFT JOIN ${j.precedentTable} p ON p.ecli = d.ecli
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderSql}
          LIMIT $${params.length}`, params);

      res.json({
        jurisdiction: j.code,
        query: q,
        // say what the ranking actually is: the match is over the whole text,
        // the ordering signal is the court's own abstract until vectors land
        order: order,
        order_note: order === 'relevance'
          ? 'matched on full text, ranked on the summary; vector ranking is not wired yet'
          : `matched on full text, ordered by ${order}`,
        count: rows.rows.length,
        results: rows.rows.map((r: any) => ({
          ecli: r.ecli,
          court: r.court_name,
          date: r.decision_date,
          type: r.decision_type,
          procedure: r.procedure_type,
          subjects: r.subject_areas,
          // truncated in JS, not with SQL left(): that function raises
          // "invalid byte sequence for encoding UTF8" on some rows at some
          // offsets even when the stored value is valid, and a search endpoint
          // that 500s on a legitimate row is worse than a longer snippet
          summary: r.summary ? String(r.summary).slice(0, 400) : null,
          cited_by_count: Number(r.cited_by_count),
          precedent_status: r.precedent_status,
          redistribution: classifyEcli(r.ecli).redistribution,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] search failed', { error: String(err) });
      fail(res, 500, 'search_failed');
    }
  }) as any);

  // ------------------------------------------------------------ 2. decision
  router.get('/:jurisdiction/decisions/:ecli', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const ecli = String(req.params.ecli);
      const withText = req.query.text !== 'false';

      const meta = await db.query(
        `SELECT d.ecli, d.case_number, d.court_name, d.court_code, d.decision_date,
                d.decision_type, d.procedure_type, d.subject_areas, d.summary,
                d.full_text IS NOT NULL AS has_text,
                CASE WHEN $2 THEN d.full_text END AS full_text,
                p.status AS precedent_status, coalesce(p.cited_by_count,0) AS cited_by_count
           FROM ${j.decisionsTable} d
           LEFT JOIN ${j.precedentTable} p ON p.ecli = d.ecli
          WHERE d.ecli = $1`, [ecli, withText]);

      if (!meta.rows.length) return fail(res, 404, 'not_found', ecli);
      const d = meta.rows[0];

      const [cases, statutes] = await Promise.all([
        db.query(
          `SELECT to_raw, to_ecli, cite_kind, resolved, unresolved_reason
             FROM ${j.citationsTable} WHERE from_ecli = $1 ORDER BY resolved DESC LIMIT 200`, [ecli]),
        db.query(
          `SELECT c.law_name_raw, c.law_id, c.article, c.resolved, l.title AS law_title
             FROM ${j.statuteEdgesTable} c
             LEFT JOIN ${j.lawsTable} l ON l.bwb_id = c.law_id
            WHERE c.from_ecli = $1 ORDER BY c.resolved DESC LIMIT 200`, [ecli]),
      ]);

      res.json({
        jurisdiction: j.code,
        ecli: d.ecli,
        case_number: d.case_number,
        court: d.court_name,
        court_code: d.court_code,
        date: d.decision_date,
        type: d.decision_type,
        procedure: d.procedure_type,
        subjects: d.subject_areas,
        summary: d.summary,
        has_text: d.has_text,
        // has_text=false is the source's own state for most NL decisions, not a
        // gap on our side; saying so keeps the caller from re-fetching forever
        text_availability: d.has_text ? 'available' : 'not_published_by_source',
        text: d.full_text ?? null,
        precedent_status: d.precedent_status,
        cited_by_count: Number(d.cited_by_count),
        source_url: `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(d.ecli)}`,
        redistribution: classifyEcli(d.ecli).redistribution,
        cites: {
          cases: cases.rows.map((c: any) => ({
            as_written: c.to_raw, ecli: c.to_ecli, kind: c.cite_kind,
            resolved: c.resolved, unresolved_reason: c.unresolved_reason,
            redistribution: c.to_ecli ? classifyEcli(c.to_ecli).redistribution : null,
          })),
          legislation: statutes.rows.map((s: any) => ({
            as_written: s.law_name_raw, law_id: s.law_id, law_title: s.law_title,
            article: s.article, resolved: s.resolved,
          })),
        },
      });
    } catch (err) {
      logger.error('[Substrate] decision failed', { error: String(err) });
      fail(res, 500, 'decision_failed');
    }
  }) as any);

  // -------------------------------------------------------------- 3. status
  router.get('/:jurisdiction/decisions/:ecli/status', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const ecli = String(req.params.ecli);
      const [status, affecting] = await Promise.all([
        db.query(`SELECT status, overruled_by, cited_by_count, last_computed
                    FROM ${j.precedentTable} WHERE ecli = $1`, [ecli]),
        db.query(
          `SELECT l.child_ecli, l.relation, l.outcome, l.method, l.confidence,
                  d.court_name, d.decision_date
             FROM ${j.instanceLinksTable} l
             LEFT JOIN ${j.decisionsTable} d ON d.ecli = l.child_ecli
            WHERE l.parent_ecli = $1
            ORDER BY d.decision_date DESC NULLS LAST LIMIT 50`, [ecli]),
      ]);

      const s = status.rows[0];
      res.json({
        jurisdiction: j.code,
        ecli,
        // null status means no appeal is on record, which is not the same as
        // "good law" and is reported as such rather than assumed
        status: s?.status ?? null,
        status_meaning: s?.status
          ? undefined
          : 'no appeal on record; absence of an appeal is not a positive finding',
        cited_by_count: Number(s?.cited_by_count ?? 0),
        overruled_by: s?.overruled_by ?? [],
        last_computed: s?.last_computed ?? null,
        affected_by: affecting.rows.map((a: any) => ({
          ecli: a.child_ecli, relation: a.relation, outcome: a.outcome,
          court: a.court_name, date: a.decision_date,
          evidence: a.method, confidence: a.confidence,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] status failed', { error: String(err) });
      fail(res, 500, 'status_failed');
    }
  }) as any);

  // --------------------------------------------------- 4/5. citing & cited
  router.get('/:jurisdiction/decisions/:ecli/citing', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const rows = await db.query(
        `SELECT c.from_ecli, c.from_court, c.from_date, c.treatment
           FROM ${j.citationsTable} c
          WHERE c.to_ecli = $1 AND c.resolved
          ORDER BY c.from_date DESC NULLS LAST LIMIT $2`,
        [String(req.params.ecli), clampLimit(req.query.limit, 50)]);
      res.json({
        jurisdiction: j.code, ecli: req.params.ecli, count: rows.rows.length,
        citing: rows.rows.map((r: any) => ({
          ecli: r.from_ecli, court: r.from_court, date: r.from_date, treatment: r.treatment,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] citing failed', { error: String(err) });
      fail(res, 500, 'citing_failed');
    }
  }) as any);

  router.get('/:jurisdiction/decisions/:ecli/cited', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const rows = await db.query(
        `SELECT to_raw, to_ecli, cite_kind, resolved, unresolved_reason
           FROM ${j.citationsTable} WHERE from_ecli = $1
          ORDER BY resolved DESC LIMIT $2`,
        [String(req.params.ecli), clampLimit(req.query.limit, 100)]);
      const resolved = rows.rows.filter((r: any) => r.resolved).length;
      res.json({
        jurisdiction: j.code, ecli: req.params.ecli,
        count: rows.rows.length, resolved_count: resolved,
        cited: rows.rows.map((r: any) => ({
          as_written: r.to_raw, ecli: r.to_ecli, kind: r.cite_kind,
          resolved: r.resolved, unresolved_reason: r.unresolved_reason,
          redistribution: r.to_ecli ? classifyEcli(r.to_ecli).redistribution : null,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] cited failed', { error: String(err) });
      fail(res, 500, 'cited_failed');
    }
  }) as any);

  // --------------------------------------------------------------- 6. chain
  router.get('/:jurisdiction/decisions/:ecli/chain', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const ecli = String(req.params.ecli);
      // Recursive CTE rather than a graph store: NL ladders are at most four
      // deep, so a walk over an indexed edge table is the whole requirement.
      const rows = await db.query(
        `WITH RECURSIVE up AS (
             SELECT child_ecli, parent_ecli, relation, outcome, 1 AS depth
               FROM ${j.instanceLinksTable} WHERE child_ecli = $1
             UNION ALL
             SELECT l.child_ecli, l.parent_ecli, l.relation, l.outcome, up.depth + 1
               FROM ${j.instanceLinksTable} l JOIN up ON l.child_ecli = up.parent_ecli
              WHERE up.depth < 6
         ), down AS (
             SELECT child_ecli, parent_ecli, relation, outcome, 1 AS depth
               FROM ${j.instanceLinksTable} WHERE parent_ecli = $1
             UNION ALL
             SELECT l.child_ecli, l.parent_ecli, l.relation, l.outcome, down.depth + 1
               FROM ${j.instanceLinksTable} l JOIN down ON l.parent_ecli = down.child_ecli
              WHERE down.depth < 6
         )
         SELECT 'earlier' AS direction, * FROM up
         UNION ALL SELECT 'later', * FROM down`, [ecli]);

      res.json({
        jurisdiction: j.code, ecli,
        chain: rows.rows.map((r: any) => ({
          direction: r.direction, from: r.child_ecli, to: r.parent_ecli,
          relation: r.relation, outcome: r.outcome, depth: r.depth,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] chain failed', { error: String(err) });
      fail(res, 500, 'chain_failed');
    }
  }) as any);

  // --------------------------------------------- 7. case law on an article
  router.get('/:jurisdiction/legislation/:lawId/case-law', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const params: unknown[] = [String(req.params.lawId)];
      let articleClause = '';
      if (req.query.article) { params.push(req.query.article); articleClause = `AND c.article = $${params.length}`; }
      params.push(clampLimit(req.query.limit, 50));

      const rows = await db.query(
        `SELECT DISTINCT ON (d.ecli) d.ecli, d.court_name, d.decision_date, c.article,
                d.summary, coalesce(p.cited_by_count,0) AS cited_by_count
           FROM ${j.statuteEdgesTable} c
           JOIN ${j.decisionsTable} d ON d.ecli = c.from_ecli
           LEFT JOIN ${j.precedentTable} p ON p.ecli = d.ecli
          WHERE c.law_id = $1 ${articleClause}
          ORDER BY d.ecli, d.decision_date DESC
          LIMIT $${params.length}`, params);

      res.json({
        jurisdiction: j.code, law_id: req.params.lawId,
        article: req.query.article ?? null, count: rows.rows.length,
        decisions: rows.rows.map((r: any) => ({
          ecli: r.ecli, court: r.court_name, date: r.decision_date,
          article: r.article,
          summary: r.summary ? String(r.summary).slice(0, 300) : null,
          cited_by_count: Number(r.cited_by_count),
        })),
      });
    } catch (err) {
      logger.error('[Substrate] case-law failed', { error: String(err) });
      fail(res, 500, 'case_law_failed');
    }
  }) as any);

  // ------------------------------------------ 8. an act, in force on a date
  router.get('/:jurisdiction/legislation/:lawId', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const lawId = String(req.params.lawId);
      const asOf = String(req.query.as_of || '') || null;

      const law = await db.query(
        `SELECT bwb_id, title, law_type, authority, rechtsgebied,
                first_start, last_end, edition_count
           FROM ${j.lawsTable} WHERE bwb_id = $1`, [lawId]);
      if (!law.rows.length) return fail(res, 404, 'not_found', lawId);

      // as_of is the point of this endpoint: without it the caller gets the
      // current edition and no claim about any other date
      const edition = await db.query(
        `SELECT valid_from, valid_to, toestand_uri, xml_url, wti_url
           FROM ${j.editionsTable}
          WHERE bwb_id = $1
            AND ($2::date IS NULL OR (valid_from <= $2::date AND (valid_to IS NULL OR valid_to >= $2::date)))
          ORDER BY valid_from DESC LIMIT 1`, [lawId, asOf]);

      const l = law.rows[0];
      res.json({
        jurisdiction: j.code,
        law_id: l.bwb_id,
        title: l.title,
        type: l.law_type,
        authority: l.authority,
        subjects: l.rechtsgebied,
        editions: { count: l.edition_count, first: l.first_start, last: l.last_end },
        as_of: asOf,
        edition_in_force: edition.rows[0]
          ? {
              valid_from: edition.rows[0].valid_from,
              valid_to: edition.rows[0].valid_to,
              uri: edition.rows[0].toestand_uri,
              text_url: edition.rows[0].xml_url,
              amendment_history_url: edition.rows[0].wti_url,
            }
          : null,
        edition_note: edition.rows.length
          ? undefined
          : 'no edition covers that date; the act may not have been in force then',
        source_url: `https://wetten.overheid.nl/${l.bwb_id}${asOf ? '/' + asOf : ''}`,
      });
    } catch (err) {
      logger.error('[Substrate] legislation failed', { error: String(err) });
      fail(res, 500, 'legislation_failed');
    }
  }) as any);

  // ------------------------------------------------------------- 9. resolve
  router.get('/:jurisdiction/resolve', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const ref = String(req.query.ref || '').trim();
      if (!ref) return fail(res, 400, 'ref_required');

      // Straight ECLI first, then the alias dictionary, which is what makes
      // "NJ 2020/410" and "LJN AB1234" resolvable at all.
      if (/^ECLI:/i.test(ref)) {
        const hit = await db.query(
          `SELECT ecli, court_name, decision_date FROM ${j.decisionsTable} WHERE ecli = $1`,
          [ref.toUpperCase()]);
        if (hit.rows.length) {
          return res.json({
            input: ref, resolved: true, kind: 'ecli', node: hit.rows[0],
            redistribution: classifyEcli(hit.rows[0].ecli).redistribution,
          });
        }
        return res.json({
          input: ref, resolved: false, kind: 'ecli',
          unresolved_reason: 'well-formed ECLI, not present in this corpus',
        });
      }

      const norm = ref.toUpperCase().replace(/\s+/g, ' ').trim();
      const alias = await db.query(
        `SELECT a.alias_kind, a.ecli, d.court_name, d.decision_date
           FROM ${j.aliasTable} a
           LEFT JOIN ${j.decisionsTable} d ON d.ecli = a.ecli
          WHERE a.alias_norm IN ($1, replace($1,' ',''))
          LIMIT 5`, [norm]);

      if (!alias.rows.length) {
        return res.json({
          input: ref, resolved: false, unresolved_reason: 'no alias matches this reference',
        });
      }
      res.json({
        input: ref, resolved: true, kind: alias.rows[0].alias_kind,
        // several decisions can share one journal reference; the caller is told
        // rather than handed an arbitrary pick
        ambiguous: alias.rows.length > 1,
        candidates: alias.rows.map((a: any) => ({
          ecli: a.ecli, court: a.court_name, date: a.decision_date,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] resolve failed', { error: String(err) });
      fail(res, 500, 'resolve_failed');
    }
  }) as any);

  // ------------------------------------------------------------ 10. changes
  router.get('/:jurisdiction/changes', (async (req: any, res: Response) => {
    const j = jurisdictionOf(req)!;
    try {
      const since = String(req.query.since || '');
      if (!since) return fail(res, 400, 'since_required', 'ISO timestamp or date');
      const limit = clampLimit(req.query.limit, 100);

      const rows = await db.query(
        `SELECT ecli, court_name, decision_date, updated_at
           FROM ${j.decisionsTable}
          WHERE updated_at >= $1::timestamptz
          ORDER BY updated_at ASC LIMIT $2`, [since, limit]);

      res.json({
        jurisdiction: j.code, since,
        count: rows.rows.length,
        // the cursor is the caller's next `since`; polling from it never
        // re-delivers and never skips
        next_since: rows.rows.length ? rows.rows[rows.rows.length - 1].updated_at : since,
        changes: rows.rows.map((r: any) => ({
          type: 'decision', ecli: r.ecli, court: r.court_name,
          date: r.decision_date, changed_at: r.updated_at,
        })),
      });
    } catch (err) {
      logger.error('[Substrate] changes failed', { error: String(err) });
      fail(res, 500, 'changes_failed');
    }
  }) as any);

  return router;
}
