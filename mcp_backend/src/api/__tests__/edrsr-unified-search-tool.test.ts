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
