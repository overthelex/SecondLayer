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

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('ILIKE');
      expect(calls[0].params).toContain('%Іваненко%');
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

    it('array_contains: uses ANY() syntax', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'trademarks',
        filters: { nice_class: 25 },
      });

      expect(calls[0].sql).toContain('ANY(nice_classes)');
      expect(calls[0].params).toContain(25);
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

    it('exact_multi: uses = with OR across columns', async () => {
      db = makeDb(() => ({ rows: [{ _total_count: 1 }] }));
      tool = new RegistrySearchTool(db);

      await tool.executeTool('search_registry', {
        registry: 'trademarks',
        filters: { holder_edrpou: '12345678' },
      });

      const sql = calls[0].sql;
      expect(sql).toContain('holder_edrpou = $');
      expect(sql).toContain('applicant_edrpou = $');
      expect(sql).toContain(' OR ');
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
      db = makeDb(() => ({
        rows: [{ name: 'Test Corp', schema: 'Company', _total_count: 42 }],
      }));
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
