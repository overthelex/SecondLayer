/**
 * EdsrHybridTools unit tests — RRF merge, dedup, one-leg-down resilience.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EdsrHybridTools } from '../tools/edrsr-hybrid-tools.js';

describe('EdsrHybridTools', () => {
  let db: any;
  let ftsService: any;
  let vectorizer: any;
  let tool: EdsrHybridTools;

  beforeEach(() => {
    db = { query: jest.fn(() => Promise.resolve({ rows: [] })) };
    ftsService = { searchFulltext: jest.fn() };
    vectorizer = { semanticSearch: jest.fn() };
    tool = new EdsrHybridTools(db, ftsService, vectorizer);
  });

  const makeFts = (docIds: number[], opts: { headline?: string } = {}) => ({
    query: 'test',
    total: docIds.length,
    returned: docIds.length,
    offset: 0,
    has_more: false,
    results: docIds.map((doc_id, i) => ({
      doc_id,
      rank: 0.9 - i * 0.1,
      headline: opts.headline || `…fts match ${doc_id}…`,
      adjudication_date: '2025-10-01',
      cause_num: `case/${doc_id}`,
      judge: 'Test Judge',
      court_code: 2605,
      justice_kind: 4,
      judgment_code: 3,
    })),
  });

  const makeVec = (entries: Array<{ doc_id: number; score: number; chunk?: number; text?: string }>) =>
    entries.map((e, i) => ({
      id: `vec-${i}`,
      score: e.score,
      text: e.text || `chunk text for ${e.doc_id}`,
      doc_id: e.doc_id,
      chunk_index: e.chunk ?? 0,
      metadata: {
        court_code: 2605,
        judge: 'Test Judge',
        cause_num: `case/${e.doc_id}`,
        justice_kind: 4,
        adjudication_date: '2025-10-01',
        judgment_code: 3,
        category_code: undefined,
      },
    }));

  describe('validation', () => {
    it('requires query', async () => {
      const result = await tool.executeTool('edrsr_hybrid_search', {});
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('query');
    });

    it('returns null for unknown tool', async () => {
      const result = await tool.executeTool('other_tool', { query: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('RRF fusion', () => {
    it('top result is doc present in both legs at rank 1', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([100, 200, 300]));
      vectorizer.semanticSearch.mockResolvedValue(
        makeVec([
          { doc_id: 100, score: 0.9 },
          { doc_id: 400, score: 0.8 },
        ])
      );

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'ТЦК повістка',
      });
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.results[0].doc_id).toBe(100);
      // doc 100: RRF = 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.03279
      expect(payload.results[0].rrf_score).toBeCloseTo(2 / 61, 5);
      expect(payload.results[0].fts_position).toBe(1);
      expect(payload.results[0].qdrant_position).toBe(1);
    });

    it('FTS-only doc has null qdrant fields', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([500]));
      vectorizer.semanticSearch.mockResolvedValue([]);

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'rare term',
      });
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.results[0].doc_id).toBe(500);
      expect(payload.results[0].qdrant_score).toBeNull();
      expect(payload.results[0].qdrant_position).toBeNull();
      expect(payload.results[0].fts_position).toBe(1);
    });

    it('Qdrant-only doc has null fts fields', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'test', total: 0, returned: 0, offset: 0, has_more: false, results: [],
      });
      vectorizer.semanticSearch.mockResolvedValue(makeVec([{ doc_id: 700, score: 0.77 }]));

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'semantic only',
      });
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.results[0].doc_id).toBe(700);
      expect(payload.results[0].fts_position).toBeNull();
      expect(payload.results[0].fts_rank).toBeNull();
      expect(payload.results[0].qdrant_score).toBeCloseTo(0.77, 5);
    });

    it('Qdrant chunks of same doc dedup — second chunk only bumps qdrant_score if higher', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'test', total: 0, returned: 0, offset: 0, has_more: false, results: [],
      });
      vectorizer.semanticSearch.mockResolvedValue(
        makeVec([
          { doc_id: 100, score: 0.7, chunk: 0, text: 'first chunk' },
          { doc_id: 100, score: 0.9, chunk: 2, text: 'better chunk' },
          { doc_id: 100, score: 0.5, chunk: 5, text: 'weaker chunk' },
          { doc_id: 200, score: 0.6 },
        ])
      );

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'chunked',
      });
      const payload = JSON.parse(result!.content[0].text);

      const hit100 = payload.results.find((r: any) => r.doc_id === 100);
      expect(hit100).toBeDefined();
      expect(hit100.qdrant_best_chunk_text).toBe('better chunk');
      expect(hit100.qdrant_best_chunk_index).toBe(2);
      expect(hit100.qdrant_score).toBeCloseTo(0.9, 5);
      // doc 100 contributes RRF of its first occurrence (rank 1)
      expect(hit100.rrf_score).toBeCloseTo(1 / 61, 5);

      // doc 200 is at vector rank 2 (chunks 2-3 of doc 100 were dedup, so doc 200 bumps to position 2)
      const hit200 = payload.results.find((r: any) => r.doc_id === 200);
      expect(hit200.qdrant_position).toBe(2);
    });

    it('sorts descending by rrf_score', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([10, 20, 30, 40]));
      vectorizer.semanticSearch.mockResolvedValue(
        makeVec([
          { doc_id: 50, score: 0.9 },
          { doc_id: 30, score: 0.8 },
          { doc_id: 10, score: 0.7 },
        ])
      );

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'ordering',
        limit: 10,
      });
      const payload = JSON.parse(result!.content[0].text);

      const scores = payload.results.map((r: any) => r.rrf_score);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);
    });

    it('custom rrf_k affects scoring', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([100]));
      vectorizer.semanticSearch.mockResolvedValue([]);

      const result = await tool.executeTool('edrsr_hybrid_search', {
        query: 'k-test',
        rrf_k: 10,
      });
      const payload = JSON.parse(result!.content[0].text);

      // Only FTS, rank 1, k=10 → 1/11 ≈ 0.0909
      expect(payload.results[0].rrf_score).toBeCloseTo(1 / 11, 5);
      expect(payload.rrf_k).toBe(10);
    });
  });

  describe('resilience', () => {
    it('returns results if FTS leg throws', async () => {
      ftsService.searchFulltext.mockRejectedValue(new Error('FTS down'));
      vectorizer.semanticSearch.mockResolvedValue(makeVec([{ doc_id: 100, score: 0.9 }]));

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'x' });
      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);
      expect(payload.legs.fts_available).toBe(false);
      expect(payload.legs.vector_available).toBe(true);
      expect(payload.results[0].doc_id).toBe(100);
    });

    it('returns results if Qdrant leg throws', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([100]));
      vectorizer.semanticSearch.mockRejectedValue(new Error('Qdrant down'));

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'x' });
      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);
      expect(payload.legs.fts_available).toBe(true);
      expect(payload.legs.vector_available).toBe(false);
      expect(payload.results[0].doc_id).toBe(100);
    });

    it('returns error if both legs throw', async () => {
      ftsService.searchFulltext.mockRejectedValue(new Error('FTS down'));
      vectorizer.semanticSearch.mockRejectedValue(new Error('Qdrant down'));

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'x' });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('Обидва джерела');
    });
  });

  describe('parameters', () => {
    it('clamps limit to MAX_LIMIT (50)', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'x', total: 0, returned: 0, offset: 0, has_more: false, results: [],
      });
      vectorizer.semanticSearch.mockResolvedValue([]);

      await tool.executeTool('edrsr_hybrid_search', { query: 'x', limit: 999 });

      const ftsCall = ftsService.searchFulltext.mock.calls[0];
      // candidateLimit = limit * oversample = 50 * 3 = 150
      expect(ftsCall[3]).toBe(150);
    });

    it('passes oversample through to candidate limit', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'x', total: 0, returned: 0, offset: 0, has_more: false, results: [],
      });
      vectorizer.semanticSearch.mockResolvedValue([]);

      await tool.executeTool('edrsr_hybrid_search', {
        query: 'x',
        limit: 10,
        oversample: 5,
      });

      const ftsCall = ftsService.searchFulltext.mock.calls[0];
      expect(ftsCall[3]).toBe(50); // 10 * 5
    });

    it('forwards filters to both legs', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'x', total: 0, returned: 0, offset: 0, has_more: false, results: [],
      });
      vectorizer.semanticSearch.mockResolvedValue([]);

      await tool.executeTool('edrsr_hybrid_search', {
        query: 'ТЦК',
        court_code: 2605,
        justice_kind: 4,
        date_from: '2025-01-01',
      });

      const ftsCall = ftsService.searchFulltext.mock.calls[0];
      expect(ftsCall[2]).toEqual({
        court_code: 2605,
        justice_kind: 4,
        judge: undefined,
        date_from: '2025-01-01',
        date_to: undefined,
      });
      const vecCall = vectorizer.semanticSearch.mock.calls[0];
      expect(vecCall[1]).toEqual({
        court_code: 2605,
        justice_kind: 4,
        judge: undefined,
        date_from: '2025-01-01',
        date_to: undefined,
      });
    });
  });

  describe('metadata backfill', () => {
    it('backfills missing metadata from edrsr_documents when FTS returns only doc_id/headline/rank', async () => {
      // FTS service returns only minimal fields (happens when no metadata filter is passed —
      // service skips JOIN for speed).
      ftsService.searchFulltext.mockResolvedValue({
        query: 'x',
        total: 2,
        returned: 2,
        offset: 0,
        has_more: false,
        results: [
          { doc_id: 100, headline: 'h1', rank: 0.9 },
          { doc_id: 200, headline: 'h2', rank: 0.8 },
        ],
      });
      vectorizer.semanticSearch.mockResolvedValue([]);

      db.query = jest.fn((sql: string, params?: any[]) => {
        if (sql.includes('FROM edrsr_documents') && sql.includes('doc_id = ANY')) {
          return Promise.resolve({
            rows: [
              {
                doc_id: 100,
                court_code: 2605,
                cause_num: 'case/100',
                judge: 'Ткаченко',
                justice_kind: 4,
                judgment_code: 3,
                category_code: null,
                adjudication_date: '2025-10-20T00:00:00.000Z',
              },
              {
                doc_id: 200,
                court_code: 2605,
                cause_num: 'case/200',
                judge: 'Тихонова',
                justice_kind: 4,
                judgment_code: 3,
                category_code: null,
                adjudication_date: '2025-12-19T00:00:00.000Z',
              },
            ],
          });
        }
        if (sql.includes('edrsr_courts')) {
          return Promise.resolve({
            rows: [{ court_code: 2605, name: 'Оболонський районний суд м. Києва' }],
          });
        }
        if (sql.includes('edrsr_justice_kinds')) {
          return Promise.resolve({ rows: [{ justice_kind: 4, name: 'Адміністративне' }] });
        }
        if (sql.includes('edrsr_judgment_forms')) {
          return Promise.resolve({ rows: [{ judgment_code: 3, name: 'Рішення' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'test' });
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.results[0].doc_id).toBe(100);
      expect(payload.results[0].court_code).toBe(2605);
      expect(payload.results[0].court_name).toBe('Оболонський районний суд м. Києва');
      expect(payload.results[0].cause_num).toBe('case/100');
      expect(payload.results[0].judge).toBe('Ткаченко');
      expect(payload.results[0].justice_kind_name).toBe('Адміністративне');
      expect(payload.results[0].judgment_form).toBe('Рішення');

      expect(payload.results[1].court_name).toBe('Оболонський районний суд м. Києва');
      expect(payload.results[1].cause_num).toBe('case/200');
    });

    it('skips backfill query when metadata is already present from FTS', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([100])); // makeFts returns full metadata
      vectorizer.semanticSearch.mockResolvedValue([]);

      const queryCalls: string[] = [];
      db.query = jest.fn((sql: string) => {
        queryCalls.push(sql);
        if (sql.includes('edrsr_courts')) {
          return Promise.resolve({ rows: [{ court_code: 2605, name: 'Suit' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await tool.executeTool('edrsr_hybrid_search', { query: 'x' });

      // No backfill query should have fired — FTS already provided court_code + cause_num
      const backfillCalls = queryCalls.filter((s) =>
        s.includes('FROM edrsr_documents') && s.includes('doc_id = ANY')
      );
      expect(backfillCalls.length).toBe(0);
    });

    it('handles backfill query failure gracefully (returns without metadata)', async () => {
      ftsService.searchFulltext.mockResolvedValue({
        query: 'x', total: 1, returned: 1, offset: 0, has_more: false,
        results: [{ doc_id: 100, headline: 'h', rank: 0.5 }],
      });
      vectorizer.semanticSearch.mockResolvedValue([]);

      db.query = jest.fn((sql: string) => {
        if (sql.includes('FROM edrsr_documents')) {
          return Promise.reject(new Error('DB down'));
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'x' });
      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);
      expect(payload.results[0].doc_id).toBe(100);
      expect(payload.results[0].court_name).toBeNull();
      expect(payload.results[0].cause_num).toBeNull();
    });
  });

  describe('enrichment', () => {
    it('enriches with court_name from edrsr_courts', async () => {
      ftsService.searchFulltext.mockResolvedValue(makeFts([100]));
      vectorizer.semanticSearch.mockResolvedValue([]);
      db.query = jest.fn((sql: string) => {
        if (sql.includes('edrsr_courts')) {
          return Promise.resolve({ rows: [{ court_code: 2605, name: 'Оболонський районний суд' }] });
        }
        if (sql.includes('edrsr_justice_kinds')) {
          return Promise.resolve({ rows: [{ justice_kind: 4, name: 'Адміністративне' }] });
        }
        if (sql.includes('edrsr_judgment_forms')) {
          return Promise.resolve({ rows: [{ judgment_code: 3, name: 'Рішення' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await tool.executeTool('edrsr_hybrid_search', { query: 'x' });
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.results[0].court_name).toBe('Оболонський районний суд');
      expect(payload.results[0].justice_kind_name).toBe('Адміністративне');
      expect(payload.results[0].judgment_form).toBe('Рішення');
      expect(payload.results[0].external_url).toBe('https://reyestr.court.gov.ua/Review/100');
    });
  });

  describe('getToolDefinitions', () => {
    it('returns single tool with required query', () => {
      const defs = tool.getToolDefinitions();
      expect(defs.length).toBe(1);
      expect(defs[0].name).toBe('edrsr_hybrid_search');
      expect(defs[0].inputSchema.required).toEqual(['query']);
    });
  });
});
