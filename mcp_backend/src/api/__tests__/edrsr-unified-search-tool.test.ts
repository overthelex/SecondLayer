/**
 * EdsrUnifiedSearchTool unit tests
 *
 * Covers:
 * - Tool definition: single search_court_decisions tool with mode enum
 * - Mode routing: structured/fulltext/hybrid/semantic
 * - Structured mode: WHERE clause, military presets, court name resolution, enrichment
 * - Fulltext mode: delegates to FTS service, enriches results
 * - Hybrid mode: graceful degradation when one leg fails
 * - Semantic mode: redirects to fulltext with notice
 * - Unknown mode rejection
 * - Required param validation per mode
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EdsrUnifiedSearchTool } from '../tools/edrsr-unified-search-tool.js';

type QueryCall = { sql: string; params?: any[] };

describe('EdsrUnifiedSearchTool', () => {
  let db: any;
  let calls: QueryCall[];
  let tool: EdsrUnifiedSearchTool;
  let mockFtsService: any;
  let mockVectorizer: any;

  const makeDb = (responder: (sql: string, params?: any[]) => any) => ({
    query: jest.fn((sql: string, params?: any[]) => {
      calls.push({ sql, params });
      return Promise.resolve(responder(sql, params));
    }),
  });

  beforeEach(() => {
    calls = [];
    mockFtsService = {
      searchFulltext: jest.fn(() => Promise.resolve({
        query: 'test',
        total: 1,
        results: [{
          doc_id: 12345, cause_num: '756/1234/23', judge: 'Іванов І.І.',
          court_code: 2605, justice_kind: 1, judgment_code: 3,
          adjudication_date: '2024-06-15', headline: 'тест <b>match</b>',
          rank: 0.5,
        }],
      })),
      // Default: pass-through (keep every candidate). Tests override to assert dropping.
      filterDocIdsByConstraints: jest.fn((docIds: number[]) =>
        Promise.resolve(new Set(docIds.map(Number)))),
    };
    mockVectorizer = {
      semanticSearch: jest.fn(() => Promise.resolve([])),
    };
  });

  describe('tool definition', () => {
    it('exposes single search_court_decisions tool', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);
      const defs = tool.getToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe('search_court_decisions');
    });

    it('mode enum has 4 values', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);
      const defs = tool.getToolDefinitions();
      const modeEnum = defs[0].inputSchema.properties.mode.enum;
      expect(modeEnum).toEqual(['structured', 'fulltext', 'hybrid', 'semantic']);
    });
  });

  describe('mode routing', () => {
    it('rejects unknown mode', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);

      const result = await tool.executeTool('search_court_decisions', { mode: 'unknown' });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('Невідомий режим');
    });

    it('returns null for unknown tool name', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);
      const result = await tool.executeTool('other_tool', {});
      expect(result).toBeNull();
    });
  });

  describe('structured mode', () => {
    it('requires at least one filter', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);

      const result = await tool.executeTool('search_court_decisions', { mode: 'structured' });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('параметр пошуку');
    });

    it('searches by cause_num', async () => {
      db = makeDb((sql) => {
        if (sql.includes('COUNT')) return { rows: [{ total: 1 }] };
        return { rows: [{
          doc_id: 123, cause_num: '756/1234/23', judge: 'Петров',
          court_code: 2605, justice_kind: 1, judgment_code: 3,
          adjudication_date: '2024-01-15',
        }] };
      });
      tool = new EdsrUnifiedSearchTool(db);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'structured',
        cause_num: '756/1234/23',
      });

      expect(result?.isError).toBeFalsy();
      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.mode).toBe('structured');
      expect(parsed.total).toBe(1);
    });

    it('applies military preset', async () => {
      db = makeDb((sql) => {
        if (sql.includes('COUNT')) return { rows: [{ total: 0 }] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db);

      await tool.executeTool('search_court_decisions', {
        mode: 'structured',
        military_preset: 'awol',
      });

      const dataSql = calls.find(c => c.sql.includes('SELECT'));
      expect(dataSql?.sql).toContain('category_code = ANY');
      expect(dataSql?.sql).toContain('justice_kind');
    });

    it('resolves court_name to court_code', async () => {
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts') && sql.includes('LIKE')) {
          return { rows: [{ court_code: 2605 }] };
        }
        if (sql.includes('COUNT')) return { rows: [{ total: 0 }] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db);

      await tool.executeTool('search_court_decisions', {
        mode: 'structured',
        court_name: 'Оболонський',
      });

      expect(calls[0].sql).toContain('edrsr_courts');
      const filterSql = calls.find(c => c.sql.includes('court_code = ANY'));
      expect(filterSql).toBeTruthy();
    });

    it('returns empty result when court not found', async () => {
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts')) return { rows: [] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'structured',
        court_name: 'Неіснуючий суд',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.total).toBe(0);
    });
  });

  describe('fulltext mode', () => {
    it('requires query parameter', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const result = await tool.executeTool('search_court_decisions', { mode: 'fulltext' });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('query');
    });

    it('returns error when FTS service unavailable', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext',
        query: 'тест',
      });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('FTS');
    });

    it('delegates to FTS service and enriches results', async () => {
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts')) return { rows: [{ court_code: 2605, name: 'Оболонський' }] };
        if (sql.includes('edrsr_justice_kinds')) return { rows: [{ justice_kind: 1, name: 'Цивільне' }] };
        if (sql.includes('edrsr_judgment_forms')) return { rows: [{ judgment_code: 3, name: 'Рішення' }] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext',
        query: 'тест',
      });

      expect(mockFtsService.searchFulltext).toHaveBeenCalled();
      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.mode).toBe('fulltext');
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].court_name).toBe('Оболонський');
      expect(parsed.results[0].justice_kind_name).toBe('Цивільне');
    });

    it('truncates an over-long fulltext query to the leading tokens', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const longQuery = 'один два три чотири пять шість сім вісім девять';
      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: longQuery,
      });

      const passedQuery = mockFtsService.searchFulltext.mock.calls[0][0];
      expect(passedQuery.split(/\s+/)).toHaveLength(6);
      expect(passedQuery).toBe('один два три чотири пять шість');
      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.query_truncated.from_tokens).toBe(9);
    });

    it('falls back to hybrid when FTS returns zero matches', async () => {
      db = makeDb(() => ({ rows: [] }));
      mockFtsService.searchFulltext = jest.fn(() =>
        Promise.resolve({ query: 'x', total: 0, results: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'безпідставне збагачення',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.mode).toBe('hybrid');
      expect(parsed.fallback_from).toBe('fulltext');
      expect(mockVectorizer.semanticSearch).toHaveBeenCalled();
    });
  });

  describe('party filters', () => {
    it('exposes party_name and party_role params', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);
      const props = tool.getToolDefinitions()[0].inputSchema.properties as any;
      expect(props.party_name).toBeTruthy();
      expect(props.party_role.enum).toEqual(['plaintiff', 'defendant', 'any']);
    });

    it('passes party_name/party_role into the FTS filters (fulltext)', async () => {
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts')) return { rows: [] };
        if (sql.includes('edrsr_justice_kinds')) return { rows: [] };
        if (sql.includes('edrsr_judgment_forms')) return { rows: [] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'доставка вантажу',
        party_name: 'Нова Пошта', party_role: 'defendant',
      });

      const filters = mockFtsService.searchFulltext.mock.calls[0][2];
      expect(filters.party_name).toBe('Нова Пошта');
      expect(filters.party_role).toBe('defendant');
    });

    it('relaxes party_role and retries when first FTS pass is empty', async () => {
      db = makeDb(() => ({ rows: [] }));
      const calls: any[] = [];
      mockFtsService.searchFulltext = jest.fn((q: string, _db: any, filters: any) => {
        calls.push(filters);
        // first call (with role) → empty; second (relaxed) → a hit
        if (filters.party_role) return Promise.resolve({ query: q, total: 0, results: [] });
        return Promise.resolve({ query: q, total: 1, results: [{ doc_id: 1, rank: 0.4 }] });
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'доставка',
        party_name: 'Нова Пошта', party_role: 'defendant',
      });

      expect(calls).toHaveLength(2);
      expect(calls[0].party_role).toBe('defendant');
      expect(calls[1].party_role).toBeUndefined();
      expect(calls[1].party_name).toBe('Нова Пошта');
      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.party_role_relaxed).toBe(true);
    });
  });

  describe('term relaxation (relax-on-empty)', () => {
    it('drops trailing tokens until a non-empty hit, surfacing term_relaxed', async () => {
      db = makeDb(() => ({ rows: [] }));
      const seen: string[] = [];
      // Over-AND collapse: only ≤4 tokens match (mimics one rare term zeroing the conjunction).
      mockFtsService.searchFulltext = jest.fn((q: string) => {
        seen.push(q);
        const n = q.split(/\s+/).filter(Boolean).length;
        return Promise.resolve(n <= 4
          ? { query: q, total: 3, results: [{ doc_id: 1, rank: 0.4 }] }
          : { query: q, total: 0, results: [] });
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'один два три чотири пять шість',
      });

      // capped to 6, then relaxed 6→5→4
      expect(seen[0].split(/\s+/)).toHaveLength(6);
      expect(seen[seen.length - 1].split(/\s+/)).toHaveLength(4);
      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.term_relaxed).toEqual({ from_tokens: 6, to_tokens: 4 });
      expect(parsed.total).toBe(3);
    });

    it('does not relax below FTS_MIN_TOKENS (2)', async () => {
      db = makeDb(() => ({ rows: [] }));
      const seen: string[] = [];
      mockFtsService.searchFulltext = jest.fn((q: string) => {
        seen.push(q);
        return Promise.resolve({ query: q, total: 0, results: [] }); // always empty
      });
      // no vectorizer → no hybrid fallback, just return the empty result
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      await tool.executeTool('search_court_decisions', { mode: 'fulltext', query: 'альфа бета гама' });

      // 3→2 then stop (never probes a single token)
      const minTokens = Math.min(...seen.map(q => q.split(/\s+/).filter(Boolean).length));
      expect(minTokens).toBe(2);
    });
  });

  describe('hybrid mode', () => {
    it('requires query parameter', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);

      const result = await tool.executeTool('search_court_decisions', { mode: 'hybrid' });
      expect(result?.isError).toBe(true);
    });

    it('returns error when both legs fail', async () => {
      const failingFts = { searchFulltext: jest.fn(() => Promise.reject(new Error('FTS down'))) };
      const failingVector = { semanticSearch: jest.fn(() => Promise.reject(new Error('Qdrant down'))) };
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, failingFts as any, failingVector as any);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'hybrid',
        query: 'тест',
      });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('недоступні');
    });

    it('degrades gracefully to FTS-only when vector fails', async () => {
      const failingVector = { semanticSearch: jest.fn(() => Promise.reject(new Error('Qdrant down'))) };
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts')) return { rows: [] };
        if (sql.includes('edrsr_justice_kinds')) return { rows: [] };
        if (sql.includes('edrsr_judgment_forms')) return { rows: [] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService, failingVector as any);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'hybrid',
        query: 'тест',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.legs.fts_available).toBe(true);
      expect(parsed.legs.vector_available).toBe(false);
    });
  });

  describe('court_level / instance_code', () => {
    it('exposes court_level param with SC / GrandChamber enum', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db);
      const props = tool.getToolDefinitions()[0].inputSchema.properties as any;
      expect(props.court_level).toBeTruthy();
      expect(props.court_level.enum).toEqual(['all', 'SC', 'GrandChamber']);
    });

    it('maps court_level=SC to instance_code=1 in fulltext FTS filters', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'податок нерухомість', court_level: 'SC',
      });

      const filters = mockFtsService.searchFulltext.mock.calls[0][2];
      expect(filters.instance_code).toBe(1);
    });

    it('maps court_level=GrandChamber to instance_code=1 in structured WHERE', async () => {
      db = makeDb((sql) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db);

      await tool.executeTool('search_court_decisions', {
        mode: 'structured', cause_num: '910/1/23', court_level: 'GrandChamber',
      });

      const instanceCall = calls.find(c => c.sql.includes('c.instance_code'));
      expect(instanceCall).toBeTruthy();
      expect(instanceCall!.params).toContain(1);
    });

    it('explicit instance_code wins over court_level', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      await tool.executeTool('search_court_decisions', {
        mode: 'fulltext', query: 'тест', court_level: 'SC', instance_code: 2,
      });

      const filters = mockFtsService.searchFulltext.mock.calls[0][2];
      expect(filters.instance_code).toBe(2);
    });

    it('passes instance_code into the hybrid FTS leg filters', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);

      await tool.executeTool('search_court_decisions', {
        mode: 'hybrid', query: 'тест', court_level: 'SC',
      });

      const filters = mockFtsService.searchFulltext.mock.calls[0][2];
      expect(filters.instance_code).toBe(1);
    });
  });

  describe('hybrid structural enforcement', () => {
    const vectorHit = (doc_id: number, score: number) => ({
      doc_id, score, text: 'фрагмент', chunk_index: 0,
      metadata: { court_code: 2605, cause_num: `${doc_id}/23`, justice_kind: 1, judgment_code: 3 },
    });

    it('drops vector-only hits that fail the party constraint', async () => {
      db = makeDb(() => ({ rows: [] }));
      // FTS leg returns the party-matching doc; vector leg adds an unconstrained extra.
      mockFtsService.searchFulltext = jest.fn(() => Promise.resolve({
        query: 'тест', total: 1,
        results: [{ doc_id: 111, court_code: 2605, justice_kind: 1, judgment_code: 3, rank: 0.5, headline: null }],
      }));
      mockFtsService.filterDocIdsByConstraints = jest.fn((ids: number[]) =>
        // Only the FTS doc actually contains "Нова Пошта" as a party; 222 is vector noise.
        Promise.resolve(new Set(ids.filter(id => id === 111))));
      mockVectorizer.semanticSearch = jest.fn(() => Promise.resolve([vectorHit(222, 0.9), vectorHit(111, 0.4)]));

      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);
      const result = await tool.executeTool('search_court_decisions', {
        mode: 'hybrid', query: 'тест', party_name: 'Нова Пошта', party_role: 'defendant',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      const ids = parsed.results.map((r: any) => r.doc_id);
      expect(ids).toContain(111);
      expect(ids).not.toContain(222);
      expect(parsed.structural_filter.dropped).toBe(1);
      expect(parsed.party_filter).toEqual({ party_name: 'Нова Пошта', party_role: 'defendant' });
    });

    it('relaxes party_role when the role wipes every candidate', async () => {
      db = makeDb(() => ({ rows: [] }));
      mockFtsService.searchFulltext = jest.fn(() => Promise.resolve({ query: 'тест', total: 0, results: [] }));
      mockVectorizer.semanticSearch = jest.fn(() => Promise.resolve([vectorHit(333, 0.8)]));
      // First pass (name + role) → empty; second pass (name only) → keeps 333.
      mockFtsService.filterDocIdsByConstraints = jest.fn((ids: number[], c: any) =>
        Promise.resolve(c.party_role ? new Set<number>() : new Set(ids.map(Number))));

      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);
      const result = await tool.executeTool('search_court_decisions', {
        mode: 'hybrid', query: 'тест', party_name: 'Нова Пошта', party_role: 'defendant',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.structural_filter.party_role_relaxed).toBe(true);
      expect(parsed.results.map((r: any) => r.doc_id)).toContain(333);
      expect(mockFtsService.filterDocIdsByConstraints).toHaveBeenCalledTimes(2);
    });

    it('does not run structural enforcement without party/instance filters', async () => {
      db = makeDb(() => ({ rows: [] }));
      mockVectorizer.semanticSearch = jest.fn(() => Promise.resolve([vectorHit(444, 0.7)]));
      tool = new EdsrUnifiedSearchTool(db, mockFtsService, mockVectorizer);

      const result = await tool.executeTool('search_court_decisions', { mode: 'hybrid', query: 'тест' });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.structural_filter).toBeUndefined();
      expect(mockFtsService.filterDocIdsByConstraints).not.toHaveBeenCalled();
    });
  });

  describe('semantic mode', () => {
    it('redirects to fulltext with notice', async () => {
      db = makeDb((sql) => {
        if (sql.includes('edrsr_courts')) return { rows: [] };
        if (sql.includes('edrsr_justice_kinds')) return { rows: [] };
        if (sql.includes('edrsr_judgment_forms')) return { rows: [] };
        return { rows: [] };
      });
      tool = new EdsrUnifiedSearchTool(db, mockFtsService);

      const result = await tool.executeTool('search_court_decisions', {
        mode: 'semantic',
        query: 'відповідальність директора',
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed._notice).toContain('тимчасово недоступний');
      expect(parsed.mode).toContain('semantic');
    });
  });
});
