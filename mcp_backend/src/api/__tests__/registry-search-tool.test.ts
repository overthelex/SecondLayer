/**
 * RegistrySearchTool unit tests
 *
 * Covers:
 * - Tool definition: single search_registry tool with correct enum
 * - Unknown registry rejection
 * - Empty filters → registry description
 * - Required field enforcement (financial_statements needs tin)
 * - WHERE clause generation for all match types (ilike, exact, ilike_multi, exact_multi, gte, lte, array_contains, ilike_cast)
 * - Transform (uppercase) applied before query
 * - Limit clamping
 * - DB error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RegistrySearchTool } from '../tools/registry-search-tool.js';
import { REGISTRY_CATALOG } from '../tools/registry-catalog.js';

type QueryCall = { sql: string; params?: any[] };

describe('RegistrySearchTool', () => {
  let db: any;
  let calls: QueryCall[];
  let tool: RegistrySearchTool;

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
    it('exposes single search_registry tool', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);
      const defs = tool.getToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe('search_registry');
    });

    it('enum includes all catalog keys', () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);
      const defs = tool.getToolDefinitions();
      const registryEnum = defs[0].inputSchema.properties.registry.enum;
      expect(registryEnum).toEqual(Object.keys(REGISTRY_CATALOG));
    });
  });

  describe('validation', () => {
    it('rejects unknown registry', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', { registry: 'nonexistent' });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('nonexistent');
    });

    it('returns registry description when no filters provided', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', { registry: 'sanctions' });
      expect(result?.isError).toBeFalsy();
      const text = result?.content[0].text || '';
      expect(text).toContain('sanctions');
      expect(text).toContain('Доступні фільтри');
    });

    it('enforces required fields', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', {
        registry: 'financial_statements',
        filters: { period_year: 2024 },
      });
      expect(result?.isError).toBeFalsy();
      const text = result?.content[0].text || '';
      expect(text).toContain('tin');
    });

    it('returns null for unknown tool name', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);
      const result = await tool.executeTool('unknown_tool', {});
      expect(result).toBeNull();
    });
  });

  describe('WHERE clause generation', () => {
    it('ilike: wraps value with % and uses ILIKE', async () => {
      db = makeDb(() => ({ rows: [{ name: 'Test', _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'lawyers',
        filters: { last_name: 'Іваненко' },
      });

      // Data query + parallel COUNT(*) query share the same WHERE
      expect(calls).toHaveLength(2);
      expect(calls[0].sql).toContain('ILIKE');
      expect(calls[0].params).toContain('%Іваненко%');
      expect(calls[1].sql).toContain('COUNT(*)');
    });

    it('exact: uses = operator without wrapping', async () => {
      db = makeDb(() => ({ rows: [{ edrpou: '12345678', _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'large_taxpayers',
        filters: { edrpou: '12345678' },
      });

      expect(calls[0].sql).toContain('= $');
      expect(calls[0].params).toContain('12345678');
    });

    it('ilike_multi: generates OR across multiple columns', async () => {
      db = makeDb(() => ({ rows: [{ name: 'Test', _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'missing_persons',
        filters: { last_name: 'Петренко' },
      });

      const sql = calls[0].sql;
      expect(sql).toContain('last_name_u ILIKE');
      expect(sql).toContain('last_name_r ILIKE');
      expect(sql).toContain('last_name_e ILIKE');
      expect(sql).toContain(' OR ');
    });

    it('gte: uses >= operator', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'securities_owners',
        filters: { min_share_percent: 10 },
      });

      expect(calls[0].sql).toContain('>= $');
      expect(calls[0].params).toContain(10);
    });

    it('lte: uses <= operator', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'vrp_decisions',
        filters: { date_to: '2025-01-01' },
      });

      expect(calls[0].sql).toContain('<= $');
    });

    it('array_contains_text: uses ::text = ANY() and casts value', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'trademarks',
        filters: { nice_class: 25 },
      });

      // trademarks is backed by the unified ip_objects table (classes text[])
      expect(calls[0].sql).toContain('::text = ANY(classes)');
      expect(calls[0].sql).toContain('obj_type = 4'); // baseWhere applied
      expect(calls[0].params).toContain('25'); // numeric slot cast to text
    });

    it('ilike_cast: casts column to text', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'public_organizations',
        filters: { founders: 'Іванов' },
      });

      expect(calls[0].sql).toContain('founders::text ILIKE');
    });

    it('trademarks: certificate / certificate_number alias resolve to registration_number', async () => {
      for (const key of ['certificate', 'certificate_number']) {
        calls = [];
        db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
        tool = new RegistrySearchTool(db);

        await tool.executeTool('search_registry', {
          registry: 'trademarks',
          filters: { [key]: '67482' },
        });

        expect(calls[0].sql).toContain('registration_number = $');
        expect(calls[0].params).toContain('67482');
      }
    });

    it('trademarks: date columns are selected as ::text (avoids DATE off-by-one)', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'trademarks',
        filters: { registration_number: '67482' },
      });

      const sql = calls[0].sql;
      expect(sql).toContain('app_date::text AS app_date');
      expect(sql).toContain('registration_date::text AS registration_date');
      expect(sql).toContain('expiry_date::text AS expiry_date');
    });

    it('non-IP registries with DATE columns also select them as ::text', async () => {
      // Same node-postgres DATE off-by-one applies to any `date`-typed column.
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ['public_organizations', { name: 'Фонд' }, 'date_reg::text AS date_reg'],
        ['securities_owners', { owner_name: 'Іван' }, 'report_date::text AS report_date'],
        ['us_fda_enforcement', { firm: 'Acme' }, 'recall_initiation_date::text AS recall_initiation_date'],
      ];
      for (const [registry, filters, expected] of cases) {
        calls = [];
        db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
        tool = new RegistrySearchTool(db);
        await tool.executeTool('search_registry', { registry, filters });
        expect(calls[0].sql).toContain(expected);
      }
    });

    it('ilike_multi: uses ILIKE with OR across columns', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'patents',
        filters: { title: 'двигун' },
      });

      const sql = calls[0].sql;
      expect(sql).toContain('title_ua ILIKE $');
      expect(sql).toContain('title_en ILIKE $');
      expect(sql).toContain(' OR ');
      expect(sql).toContain('obj_type IN (1, 2, 6)'); // baseWhere applied
    });
  });

  describe('transforms', () => {
    it('uppercase transform applied to vehicle search', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'vehicle_registrations',
        filters: { vin: 'wvwzzz3czwe123456' },
      });

      expect(calls[0].params?.[0]).toBe('WVWZZZ3CZWE123456');
    });
  });

  describe('limit handling', () => {
    it('clamps limit to maxLimit', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'financial_statements',
        filters: { tin: '12345678' },
        limit: 999,
      });

      // financial_statements has maxLimit=50
      const limitParam = calls[0].params?.[calls[0].params.length - 1];
      expect(limitParam).toBe(50);
    });

    it('uses defaultLimit when not specified', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'financial_statements',
        filters: { tin: '12345678' },
      });

      // financial_statements has defaultLimit=20
      const limitParam = calls[0].params?.[calls[0].params.length - 1];
      expect(limitParam).toBe(20);
    });
  });

  describe('response formatting', () => {
    it('returns empty message when no results', async () => {
      db = makeDb(() => ({ rows: [] }));
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', {
        registry: 'sanctions',
        filters: { name: 'NonexistentPerson' },
      });

      const text = result?.content[0].text || '';
      expect(text).toContain(REGISTRY_CATALOG.sanctions.emptyMessage);
    });

    it('strips _total_count from results', async () => {
      // The COUNT(*) companion query supplies the total; data rows carry it as _total_count
      db = makeDb((sql: string) =>
        sql.includes('COUNT(*)')
          ? { rows: [{ total: '42' }] }
          : { rows: [{ name: 'Test Corp', schema: 'Company', _total_count: 42 }] }
      );
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', {
        registry: 'sanctions',
        filters: { name: 'Test' },
      });

      const parsed = JSON.parse(result?.content[0].text || '{}');
      expect(parsed.total_count).toBe(42);
      expect(parsed.results[0]._total_count).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('wraps DB errors', async () => {
      db = {
        query: jest.fn(() => Promise.reject(new Error('connection refused'))),
      };
      tool = new RegistrySearchTool(db);

      const result = await tool.executeTool('search_registry', {
        registry: 'sanctions',
        filters: { name: 'test' },
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain('connection refused');
    });
  });
});

// LEXAI-1820: aggregate mode — GROUP BY a catalog field with optional distinct-count,
// so the chat can answer "which identical marks are held by multiple owners" without
// pulling 26K rows through the LLM context.
describe('aggregate mode (LEXAI-1820)', () => {
  let db: any;
  let calls: QueryCall[];
  let tool: RegistrySearchTool;

  const makeDb = (responder: (sql: string, params?: any[]) => any) => ({
    query: jest.fn((sql: string, params?: any[]) => {
      calls.push({ sql, params });
      return Promise.resolve(responder(sql, params));
    }),
  });

  beforeEach(() => {
    calls = [];
  });

  it('builds GROUP BY + HAVING count(DISTINCT …) query for the TM-collision case', async () => {
    db = makeDb(() => ({
      rows: [{ group_value: 'marengo', distinct_count: '5', row_count: '9', samples: ['ТОВ А', 'ТОВ Б'] }],
    }));
    tool = new RegistrySearchTool(db);

    const result = await tool.executeTool('search_registry', {
      registry: 'trademarks',
      filters: { nice_class: 33 },
      aggregate: { group_by: 'mark_text', count_distinct: 'holder_name', min_count: 2, min_length: 4 },
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    const sql = calls[0].sql;
    // trademarks is backed by ip_objects: catalog fields resolve to its columns
    // (mark_text→title_ua, holder_name→owner_name, nice_class→classes).
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('COUNT(DISTINCT owner_name)');
    expect(sql).toContain('HAVING');
    expect(sql).toContain('length(title_ua) >= 4');
    expect(sql).toContain('::text = ANY(classes)');
    expect(sql).toContain('obj_type = 4'); // baseWhere applied in aggregate mode
    const text = (result as any).content[0].text;
    expect(text).toContain('marengo');
  });

  it('aggregates without count_distinct as plain frequency count', async () => {
    db = makeDb(() => ({ rows: [{ group_value: 'нфіл', distinct_count: null, row_count: '12' }] }));
    tool = new RegistrySearchTool(db);

    await tool.executeTool('search_registry', {
      registry: 'trademarks',
      filters: { nice_class: 33 },
      aggregate: { group_by: 'holder_name' },
    });

    const sql = calls[0].sql;
    expect(sql).toContain('GROUP BY');
    expect(sql).not.toContain('HAVING');
  });

  it('rejects group_by field not present in the catalog', async () => {
    db = makeDb(() => ({ rows: [] }));
    tool = new RegistrySearchTool(db);

    const result = await tool.executeTool('search_registry', {
      registry: 'trademarks',
      filters: { nice_class: 33 },
      aggregate: { group_by: 'drop_table' },
    });

    const text = (result as any).content[0].text;
    expect(text).toContain('group_by');
    expect(calls).toHaveLength(0);
  });

  it('rejects aggregation on array fields (nice_class)', async () => {
    db = makeDb(() => ({ rows: [] }));
    tool = new RegistrySearchTool(db);

    const result = await tool.executeTool('search_registry', {
      registry: 'trademarks',
      filters: { mark_text: 'nemiroff' },
      aggregate: { group_by: 'nice_class' },
    });

    const text = (result as any).content[0].text;
    expect(text).toContain('group_by');
    expect(calls).toHaveLength(0);
  });

  it('still requires at least one filter in aggregate mode', async () => {
    db = makeDb(() => ({ rows: [] }));
    tool = new RegistrySearchTool(db);

    const result = await tool.executeTool('search_registry', {
      registry: 'trademarks',
      aggregate: { group_by: 'mark_text', count_distinct: 'holder_name' },
    });

    const text = (result as any).content[0].text;
    expect(text).toContain('фільтр');
    expect(calls).toHaveLength(0);
  });
});
