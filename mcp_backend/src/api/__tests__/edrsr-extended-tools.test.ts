/**
 * EdsrExtendedTools unit tests
 *
 * Covers:
 * - edrsr_court_decisions_by_court: required-param validation, date format, SQL shape, enrichment
 * - edrsr_get_decision_dispositive: marker detection, fallback path, missing doc
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EdsrExtendedTools } from '../tools/edrsr-extended-tools.js';

type QueryCall = { sql: string; params?: any[] };

describe('EdsrExtendedTools', () => {
  let db: any;
  let calls: QueryCall[];
  let tool: EdsrExtendedTools;

  const makeDb = (responder: (sql: string, params?: any[]) => any) => ({
    query: jest.fn((sql: string, params?: any[]) => {
      calls.push({ sql, params });
      const result = responder(sql, params);
      return Promise.resolve(result);
    }),
  });

  beforeEach(() => {
    calls = [];
  });

  describe('edrsr_court_decisions_by_court', () => {
    it('returns error when court_code missing', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_court_decisions_by_court', {
        fts_query: 'ТЦК',
        date_from: '2025-01-01',
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('court_code');
    });

    it('returns error when fts_query missing', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_court_decisions_by_court', {
        court_code: 2605,
        date_from: '2025-01-01',
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('fts_query');
    });

    it('returns error when date_from missing (partition pruning safety)', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_court_decisions_by_court', {
        court_code: 2605,
        fts_query: 'ТЦК',
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('date_from');
    });

    it('rejects malformed date', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_court_decisions_by_court', {
        court_code: 2605,
        fts_query: 'ТЦК',
        date_from: '2025/01/01',
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('YYYY-MM-DD');
    });

    it('builds partitioned FTS query with adj_year bounds and returns enriched rows', async () => {
      db = makeDb((sql: string) => {
        if (sql.includes('FROM edrsr_courts')) {
          return { rows: [{ name: 'Оболонський районний суд міста Києва' }] };
        }
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: 2 }] };
        }
        if (sql.includes('ts_rank_cd')) {
          return {
            rows: [
              {
                doc_id: 100,
                cause_num: '756/10500/25',
                adjudication_date: '2025-10-20',
                judge: 'Ткаченко М.М.',
                court_code: 2605,
                justice_kind: 4,
                judgment_code: 3,
                category_code: null,
                doc_url: null,
                rank: 0.5,
                snippet: '…ТЦК…',
              },
              {
                doc_id: 101,
                cause_num: '756/13083/24',
                adjudication_date: '2025-12-19',
                judge: 'Тихонова О.О.',
                court_code: 2605,
                justice_kind: 4,
                judgment_code: 3,
                category_code: null,
                doc_url: null,
                rank: 0.3,
                snippet: '…повістка…',
              },
            ],
          };
        }
        if (sql.includes('edrsr_justice_kinds')) {
          return { rows: [{ justice_kind: 4, name: 'Адміністративне' }] };
        }
        if (sql.includes('edrsr_judgment_forms')) {
          return { rows: [{ judgment_code: 3, name: 'Рішення' }] };
        }
        return { rows: [] };
      });
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_court_decisions_by_court', {
        court_code: 2605,
        fts_query: 'ТЦК повістка розшук',
        date_from: '2025-01-01',
        date_to: '2026-03-31',
        limit: 10,
      });

      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);

      expect(payload.total).toBe(2);
      expect(payload.returned).toBe(2);
      expect(payload.has_more).toBe(false);
      expect(payload.query.court_name).toBe('Оболонський районний суд міста Києва');
      expect(payload.results[0].doc_id).toBe(100);
      expect(payload.results[0].court_name).toBe('Оболонський районний суд міста Києва');
      expect(payload.results[0].justice_kind_name).toBe('Адміністративне');
      expect(payload.results[0].judgment_form).toBe('Рішення');
      expect(payload.results[0].external_url).toContain('/Review/100');

      const dataCall = calls.find((c) => c.sql.includes('ts_rank_cd'));
      expect(dataCall).toBeDefined();
      expect(dataCall!.sql).toContain("plainto_tsquery('simple'");
      expect(dataCall!.sql).toContain('f.adj_year BETWEEN');
      expect(dataCall!.sql).toContain('ORDER BY d.adjudication_date DESC');
      expect(dataCall!.params).toEqual([
        2605,
        '2025-01-01',
        '2026-03-31',
        2025,
        2026,
        'ТЦК повістка розшук',
        10,
        0,
      ]);
    });

    it('clamps limit above MAX_LIMIT (100)', async () => {
      db = makeDb((sql: string) => {
        if (sql.includes('FROM edrsr_courts')) return { rows: [] };
        if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
        return { rows: [] };
      });
      tool = new EdsrExtendedTools(db);

      await tool.executeTool('edrsr_court_decisions_by_court', {
        court_code: 2605,
        fts_query: 'test',
        date_from: '2025-01-01',
        limit: 500,
      });

      const dataCall = calls.find((c) => c.sql.includes('ts_rank_cd'));
      expect(dataCall!.params![6]).toBe(100);
    });
  });

  describe('edrsr_get_decision_dispositive', () => {
    it('returns error when doc_id missing', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {});

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('doc_id');
    });

    it('returns error when doc not found', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 999999,
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('не знайдено');
    });

    it('extracts ВИРІШИВ: section when present', async () => {
      const fullText =
        'Шапка справи.\n\nВСТАНОВИВ: обставини справи тут.\n\n' +
        'ВИРІШИВ:\n1. Скасувати постанову.\n2. Закрити провадження.\n3. Стягнути судовий збір.';
      db = makeDb(() => ({
        rows: [{ full_text: fullText, text_length: fullText.length }],
      }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 12345,
      });

      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);
      expect(payload.marker).toBe('ВИРІШИВ:');
      expect(payload.marker_position).toBe(fullText.indexOf('ВИРІШИВ:'));
      expect(payload.is_fallback).toBe(false);
      expect(payload.dispositive).toContain('Скасувати постанову');
      expect(payload.text_length).toBe(fullText.length);
      expect(payload.external_url).toBe('https://reyestr.court.gov.ua/Review/12345');
    });

    it('picks earliest marker when multiple present', async () => {
      const fullText = 'УХВАЛИВ: попередня ухвала.\nВИРІШИВ: фінал.';
      db = makeDb(() => ({
        rows: [{ full_text: fullText, text_length: fullText.length }],
      }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 1,
      });

      const payload = JSON.parse(result!.content[0].text);
      expect(payload.marker).toBe('УХВАЛИВ:');
      expect(payload.dispositive.startsWith('УХВАЛИВ:')).toBe(true);
    });

    it('handles spaced marker variant', async () => {
      const fullText = 'Текст рішення.\n\nВ И Р І Ш И В\n\n1. Позов задовольнити.';
      db = makeDb(() => ({
        rows: [{ full_text: fullText, text_length: fullText.length }],
      }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 2,
      });

      const payload = JSON.parse(result!.content[0].text);
      expect(payload.marker).toBe('В И Р І Ш И В');
      expect(payload.is_fallback).toBe(false);
    });

    it('falls back to tail when no marker found', async () => {
      const fullText = 'А'.repeat(10000) + 'ТАЙЛ БЕЗ МАРКЕРУ';
      db = makeDb(() => ({
        rows: [{ full_text: fullText, text_length: fullText.length }],
      }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 3,
      });

      const payload = JSON.parse(result!.content[0].text);
      expect(payload.marker).toBeNull();
      expect(payload.marker_position).toBeNull();
      expect(payload.is_fallback).toBe(true);
      expect(payload.dispositive).toContain('ТАЙЛ БЕЗ МАРКЕРУ');
      expect(payload.dispositive.length).toBeLessThanOrEqual(4000);
    });

    it('handles empty full_text gracefully', async () => {
      db = makeDb(() => ({
        rows: [{ full_text: '', text_length: 0 }],
      }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('edrsr_get_decision_dispositive', {
        doc_id: 4,
      });

      expect(result?.isError).toBeFalsy();
      const payload = JSON.parse(result!.content[0].text);
      expect(payload.dispositive).toBeNull();
      expect(payload.text_length).toBe(0);
    });
  });

  describe('executeTool dispatch', () => {
    it('returns null for unknown tool names', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const result = await tool.executeTool('unknown_tool', {});
      expect(result).toBeNull();
    });

    it('getToolDefinitions returns both tools', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const defs = tool.getToolDefinitions();
      expect(defs.length).toBe(2);
      const names = defs.map((d) => d.name);
      expect(names).toContain('edrsr_court_decisions_by_court');
      expect(names).toContain('edrsr_get_decision_dispositive');
    });

    it('tool definitions include required parameters', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new EdsrExtendedTools(db);

      const defs = tool.getToolDefinitions();
      const searchDef = defs.find((d) => d.name === 'edrsr_court_decisions_by_court');
      const dispositiveDef = defs.find((d) => d.name === 'edrsr_get_decision_dispositive');

      expect(searchDef?.inputSchema.required).toEqual(['court_code', 'fts_query', 'date_from']);
      expect(dispositiveDef?.inputSchema.required).toEqual(['doc_id']);
    });
  });
});
