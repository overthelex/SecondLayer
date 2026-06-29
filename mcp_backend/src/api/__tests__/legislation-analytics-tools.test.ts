/**
 * LegislationAnalyticsTools unit tests (CORE-89 Phase A)
 *
 * Covers:
 * - Tool definition: single analyze_law_amendments tool
 * - Required `law` enforcement
 * - Alias resolution (КК → 2341-14) and rada_id passthrough
 * - Law-not-found path
 * - Law-level edition timeline + count
 * - Article-level version timeline + size growth
 * - Article-not-found path
 * - pending intent/court_impact placeholders preserved
 * - DB-unavailable + DB-error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LegislationAnalyticsTools } from '../tools/legislation-analytics-tools.js';

type QueryCall = { sql: string; params?: any[] };

const parse = (res: any) => JSON.parse(res.content[0].text);

describe('LegislationAnalyticsTools', () => {
  let calls: QueryCall[];

  const makeDb = (responder: (sql: string, params?: any[]) => any) => ({
    query: jest.fn((sql: string, params?: any[]) => {
      calls.push({ sql, params });
      return Promise.resolve(responder(sql, params));
    }),
  });

  beforeEach(() => {
    calls = [];
  });

  describe('tool definition', () => {
    it('exposes a single analyze_law_amendments tool', () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      const defs = tool.getToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe('analyze_law_amendments');
      expect(defs[0].annotations?.readOnlyHint).toBe(true);
      expect(defs[0].inputSchema.required).toEqual(['law']);
    });

    it('returns null for an unknown tool name', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      expect(await tool.executeTool('something_else', {})).toBeNull();
    });
  });

  describe('validation', () => {
    it('errors when law is missing', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      const res = await tool.executeTool('analyze_law_amendments', {});
      expect(res?.isError).toBe(true);
    });

    it('reports when DB is unavailable', async () => {
      const tool = new LegislationAnalyticsTools(undefined);
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      expect(parse(res).error).toMatch(/недоступна/);
    });
  });

  describe('law resolution', () => {
    it('resolves the КК alias to rada_id 2341-14', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      expect(calls[0].params).toEqual(['2341-14']);
    });

    it('passes through an explicit rada_id', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      await tool.executeTool('analyze_law_amendments', { law: '2778-17' });
      expect(calls[0].params).toEqual(['2778-17']);
    });

    it('returns a not-found result with a hint when the law is absent', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(() => ({ rows: [] })));
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      const out = parse(res);
      expect(out.error).toMatch(/не знайдено/);
      expect(out.resolved_rada_id).toBe('2341-14');
      expect(out.hint).toBeDefined();
    });
  });

  describe('amendment analysis', () => {
    const lawRow = {
      id: 7,
      rada_id: '2341-14',
      type: 'code',
      title: 'Кримінальний кодекс України',
      short_title: 'КК',
      adoption_date: '2001-04-05',
      effective_date: '2001-09-01',
      last_amended_date: '2024-10-06',
      status: 'active',
      total_editions: 3,
      total_articles: 447,
    };

    const respond = (sql: string) => {
      if (sql.includes('FROM legislation\n') || sql.includes('FROM legislation ')) {
        return { rows: [lawRow] };
      }
      if (sql.includes('legislation_editions')) {
        return {
          rows: [
            { edition_date: '2001-09-01', edition_key: '20010901', article_count: 440 },
            { edition_date: '2022-03-15', edition_key: '20220315', article_count: 446 },
            { edition_date: '2024-10-06', edition_key: '20241006', article_count: 447 },
          ],
        };
      }
      if (sql.includes('legislation_articles')) {
        return {
          rows: [
            { version_date: '2001-09-01', byte_size: 1000, is_current: false, article_number: 'Стаття 185', title: 'Крадіжка' },
            { version_date: '2022-03-15', byte_size: 1400, is_current: true, article_number: 'Стаття 185', title: 'Крадіжка' },
          ],
        };
      }
      return { rows: [] };
    };

    it('returns law-level edition timeline and count', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(respond));
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      const out = parse(res);
      expect(out.law.rada_id).toBe('2341-14');
      expect(out.amendments.law_level.editions_count).toBe(3);
      expect(out.amendments.law_level.editions[0].edition_date).toBe('2001-09-01');
      expect(out.amendments.article_level).toBeNull();
    });

    it('keeps intent and court_impact as pending placeholders', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(respond));
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      const out = parse(res);
      expect(out.intent.status).toBe('pending');
      expect(out.court_impact.status).toBe('pending');
      expect(out.court_impact.method).toBe('interrupted_time_series');
    });

    it('analyses a specific article with size growth', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(respond));
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК', article: '185' });
      const out = parse(res);
      const a = out.amendments.article_level;
      expect(a.found).toBe(true);
      expect(a.versions_count).toBe(2);
      expect(a.size_bytes_first).toBe(1000);
      expect(a.size_bytes_last).toBe(1400);
      expect(a.size_growth_pct).toBe(40);
    });

    it('matches the article by digits regardless of input format', async () => {
      const tool = new LegislationAnalyticsTools(makeDb(respond));
      await tool.executeTool('analyze_law_amendments', { law: 'КК', article: 'ст.185' });
      const articleCall = calls.find((c) => c.sql.includes('legislation_articles'));
      expect(articleCall?.params).toEqual([7, '185']);
    });

    it('reports article-not-found without failing', async () => {
      const db = makeDb((sql) => {
        if (sql.includes('FROM legislation\n') || sql.includes('FROM legislation ')) return { rows: [lawRow] };
        if (sql.includes('legislation_editions')) return { rows: [] };
        return { rows: [] }; // no article versions
      });
      const tool = new LegislationAnalyticsTools(db);
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК', article: '999' });
      const out = parse(res);
      expect(out.amendments.article_level.found).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns a graceful error when the query throws', async () => {
      const db = { query: jest.fn(() => Promise.reject(new Error('boom'))) };
      const tool = new LegislationAnalyticsTools(db as any);
      const res = await tool.executeTool('analyze_law_amendments', { law: 'КК' });
      const out = parse(res);
      expect(out.error).toMatch(/тимчасово недоступний/);
      expect(out.detail).toBe('boom');
    });
  });
});
