/**
 * OsintProxyAdapter and OsintProxyTools unit tests
 *
 * Covers:
 * - OsintProxyAdapter.isConfigured(): true only when both baseUrl and apiKey are present
 * - OsintProxyAdapter.executeTool(): correct HTTP request shape, success path, HTTP errors,
 *   timeout (AbortError), success:false response envelope, fetch network errors
 * - OsintProxyAdapter.health(): true on ok response, false on non-ok or fetch throw
 * - OsintProxyTools.getToolDefinitions(): 12 tools with osint_ prefix, annotations, descriptions
 * - OsintProxyTools.executeTool(): returns null for unknown tool, strips prefix, delegates,
 *   returns wrapError on adapter error field
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OsintProxyAdapter } from '../../adapters/osint-proxy-adapter';
import { OsintProxyTools } from '../tools/osint-proxy-tools';

// ---------------------------------------------------------------------------
// Global fetch mock helpers
// ---------------------------------------------------------------------------

// Using explicit any-typed factory so strict-mode TS doesn't infer `never`
// for the generic parameter of jest.fn().
/* eslint-disable @typescript-eslint/no-explicit-any */
function makeFetchOk(body: object): any {
  const mockJson = (jest.fn() as any).mockResolvedValue(body);
  const mockText = (jest.fn() as any).mockResolvedValue(JSON.stringify(body));
  return (jest.fn() as any).mockResolvedValue({
    ok: true,
    status: 200,
    json: mockJson,
    text: mockText,
  });
}

function makeFetchStatus(status: number, body = ''): any {
  const mockJson = (jest.fn() as any).mockResolvedValue({});
  const mockText = (jest.fn() as any).mockResolvedValue(body);
  return (jest.fn() as any).mockResolvedValue({
    ok: false,
    status,
    json: mockJson,
    text: mockText,
  });
}

function makeFetchThrow(err: Error): any {
  return (jest.fn() as any).mockRejectedValue(err);
}

// ---------------------------------------------------------------------------
// OsintProxyAdapter
// ---------------------------------------------------------------------------

describe('OsintProxyAdapter', () => {
  const BASE_URL = 'https://sneakypiper.example.com';
  const API_KEY = 'test-api-key-abc123';

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // ── isConfigured ────────────────────────────────────────────────────────────

  describe('isConfigured', () => {
    it('returns true when both baseUrl and apiKey are non-empty', () => {
      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      expect(adapter.isConfigured()).toBe(true);
    });

    it('returns false when baseUrl is empty string', () => {
      const adapter = new OsintProxyAdapter('', API_KEY);
      expect(adapter.isConfigured()).toBe(false);
    });

    it('returns false when apiKey is empty string', () => {
      const adapter = new OsintProxyAdapter(BASE_URL, '');
      expect(adapter.isConfigured()).toBe(false);
    });

    it('returns false when both are empty', () => {
      const adapter = new OsintProxyAdapter('', '');
      expect(adapter.isConfigured()).toBe(false);
    });

    it('strips trailing slash from baseUrl without affecting isConfigured', () => {
      const adapter = new OsintProxyAdapter(`${BASE_URL}/////`, API_KEY);
      expect(adapter.isConfigured()).toBe(true);
    });
  });

  // ── executeTool ─────────────────────────────────────────────────────────────

  describe('executeTool', () => {
    it('sends POST to {baseUrl}/api/v1/tools/execute with correct headers and body', async () => {
      const responseBody = { success: true, result: { hits: 3 } };
      const mockFetch = makeFetchOk(responseBody);
      global.fetch = mockFetch;

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      await adapter.executeTool('search_credentials', { query: 'test@example.com' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

      expect(url).toBe(`${BASE_URL}/api/v1/tools/execute`);
      expect(options.method).toBe('POST');
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect((options.headers as Record<string, string>)['X-Api-Key']).toBe(API_KEY);

      const parsed = JSON.parse(options.body as string);
      expect(parsed).toEqual({ name: 'search_credentials', params: { query: 'test@example.com' } });
    });

    it('strips trailing slashes from baseUrl in the request URL', async () => {
      const mockFetch = makeFetchOk({ success: true, result: {} });
      global.fetch = mockFetch;

      const adapter = new OsintProxyAdapter(`${BASE_URL}///`, API_KEY);
      await adapter.executeTool('check_ip_reputation', { ip: '1.2.3.4' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/v1/tools/execute`);
      expect(url).not.toContain('///');
    });

    it('returns result field from successful response envelope', async () => {
      const result = { found: true, score: 95 };
      global.fetch = makeFetchOk({ success: true, result });

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_sanctions', { name: 'Doe' });

      expect(output).toEqual(result);
    });

    it('returns entire data when success is true but result field is absent', async () => {
      const data = { success: true, items: [1, 2, 3] };
      global.fetch = makeFetchOk(data);

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_github_leaks', { domain: 'corp.com' });

      expect(output).toEqual(data);
    });

    it('returns error object on HTTP 4xx status', async () => {
      global.fetch = makeFetchStatus(403, 'Forbidden');

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_credentials', { query: 'x@y.com' });

      expect(output.error).toBe('HTTP 403');
      expect(output.details).toBe('Forbidden');
    });

    it('returns error object on HTTP 5xx status', async () => {
      global.fetch = makeFetchStatus(503, 'Service Unavailable');

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('check_domain_reputation', { domain: 'evil.io' });

      expect(output.error).toBe('HTTP 503');
    });

    it('returns error when success:false with error message in envelope', async () => {
      global.fetch = makeFetchOk({ success: false, error: 'API quota exceeded' });

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_cve', { keyword: 'log4j' });

      expect(output).toEqual({ error: 'API quota exceeded' });
    });

    it('returns generic error when success:false with no error field', async () => {
      global.fetch = makeFetchOk({ success: false });

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_cve', { keyword: 'openssl' });

      expect(output).toEqual({ error: 'Tool call failed' });
    });

    it('returns timeout error when fetch is aborted', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      global.fetch = makeFetchThrow(abortError);

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_interpol', { name: 'John Smith' });

      expect(output).toEqual({ error: 'Proxy timeout (30s)' });
    });

    it('returns error message on network failure', async () => {
      global.fetch = makeFetchThrow(new Error('ECONNREFUSED'));

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_forum_subjects', {});

      expect(output).toEqual({ error: 'ECONNREFUSED' });
    });

    it('truncates long error response body to 200 chars', async () => {
      const longBody = 'x'.repeat(500);
      global.fetch = makeFetchStatus(500, longBody);

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const output = await adapter.executeTool('search_ransomware_victims', { company: 'Acme' });

      expect((output as any).details?.length).toBeLessThanOrEqual(200);
    });
  });

  // ── health ──────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns true when /api/v1/health responds with ok status', async () => {
      global.fetch = (jest.fn() as any).mockResolvedValue({ ok: true });

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const result = await adapter.health();

      expect(result).toBe(true);
    });

    it('calls /api/v1/health with X-Api-Key header', async () => {
      const mockFetch: any = (jest.fn() as any).mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      await adapter.health();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/v1/health`);
      expect((options.headers as Record<string, string>)['X-Api-Key']).toBe(API_KEY);
    });

    it('returns false when health endpoint responds with non-ok status', async () => {
      global.fetch = (jest.fn() as any).mockResolvedValue({ ok: false, status: 503 });

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const result = await adapter.health();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws (network error)', async () => {
      global.fetch = (jest.fn() as any).mockRejectedValue(new Error('Network failure'));

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const result = await adapter.health();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws a timeout error', async () => {
      const timeoutErr = new Error('signal timed out');
      timeoutErr.name = 'TimeoutError';
      global.fetch = (jest.fn() as any).mockRejectedValue(timeoutErr);

      const adapter = new OsintProxyAdapter(BASE_URL, API_KEY);
      const result = await adapter.health();

      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// OsintProxyTools
// ---------------------------------------------------------------------------

describe('OsintProxyTools', () => {
  const EXPECTED_TOOL_COUNT = 12;

  const EXPECTED_TOOL_NAMES = [
    'osint_search_credentials',
    'osint_search_ransomware_victims',
    'osint_search_forum_subjects',
    'osint_search_sanctions',
    'osint_search_interpol',
    'osint_search_worldbank_debarment',
    'osint_search_cve',
    'osint_check_ip_reputation',
    'osint_check_domain_reputation',
    'osint_search_corporate_registry',
    'osint_search_media_mentions',
    'osint_search_github_leaks',
  ];

  function makeMockAdapter(overrides: Record<string, any> = {}): OsintProxyAdapter {
    return {
      isConfigured: (jest.fn() as any).mockReturnValue(true),
      executeTool: (jest.fn() as any).mockResolvedValue({ found: true }),
      health: (jest.fn() as any).mockResolvedValue(true),
      ...overrides,
    } as unknown as OsintProxyAdapter;
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getToolDefinitions ──────────────────────────────────────────────────────

  describe('getToolDefinitions', () => {
    it('returns exactly 12 tool definitions', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      expect(tools.getToolDefinitions()).toHaveLength(EXPECTED_TOOL_COUNT);
    });

    it('every tool name has the osint_ prefix', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const names = tools.getToolDefinitions().map(d => d.name);
      names.forEach(name => {
        expect(name).toMatch(/^osint_/);
      });
    });

    it('contains all expected tool names', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const names = tools.getToolDefinitions().map(d => d.name);
      EXPECTED_TOOL_NAMES.forEach(expected => {
        expect(names).toContain(expected);
      });
    });

    it('every description is prefixed with [OSINT]', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      tools.getToolDefinitions().forEach(def => {
        expect(def.description).toMatch(/^\[OSINT\]/);
      });
    });

    it('every tool has readOnlyHint and openWorldHint annotations', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      tools.getToolDefinitions().forEach(def => {
        expect(def.annotations?.readOnlyHint).toBe(true);
        expect(def.annotations?.openWorldHint).toBe(true);
      });
    });

    it('osint_search_credentials requires query field', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const def = tools.getToolDefinitions().find(d => d.name === 'osint_search_credentials');
      expect(def).toBeDefined();
      expect(def!.inputSchema.required).toContain('query');
    });

    it('osint_search_sanctions requires name field', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const def = tools.getToolDefinitions().find(d => d.name === 'osint_search_sanctions');
      expect(def!.inputSchema.required).toContain('name');
    });

    it('osint_search_forum_subjects has no required fields', () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const def = tools.getToolDefinitions().find(d => d.name === 'osint_search_forum_subjects');
      expect(def).toBeDefined();
      // required array absent or empty
      expect(def!.inputSchema.required ?? []).toHaveLength(0);
    });
  });

  // ── executeTool ─────────────────────────────────────────────────────────────

  describe('executeTool', () => {
    it('returns null for an unknown tool name', async () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const result = await tools.executeTool('completely_unknown_tool', {});
      expect(result).toBeNull();
    });

    it('returns null for a tool name missing the osint_ prefix', async () => {
      const tools = new OsintProxyTools(makeMockAdapter());
      const result = await tools.executeTool('search_credentials', { query: 'x' });
      expect(result).toBeNull();
    });

    it('strips the osint_ prefix before delegating to adapter', async () => {
      const mockExecuteTool = (jest.fn() as any).mockResolvedValue({ hits: 2 }) as any;
      const tools = new OsintProxyTools(makeMockAdapter({ executeTool: mockExecuteTool }));

      await tools.executeTool('osint_search_credentials', { query: 'admin@corp.com' });

      expect(mockExecuteTool).toHaveBeenCalledWith('search_credentials', { query: 'admin@corp.com' });
    });

    it('passes all args unchanged to the adapter', async () => {
      const mockExecuteTool = (jest.fn() as any).mockResolvedValue({ count: 0 }) as any;
      const tools = new OsintProxyTools(makeMockAdapter({ executeTool: mockExecuteTool }));
      const args = { company: 'Evil Corp', limit: 5 };

      await tools.executeTool('osint_search_ransomware_victims', args);

      expect(mockExecuteTool).toHaveBeenCalledWith('search_ransomware_victims', args);
    });

    it('returns wrapResponse result on successful adapter call', async () => {
      const data = { records: [{ id: 1 }] };
      const tools = new OsintProxyTools(makeMockAdapter({
        executeTool: (jest.fn() as any).mockResolvedValue(data),
      }));

      const result = await tools.executeTool('osint_check_ip_reputation', { ip: '10.0.0.1' });

      expect(result).not.toBeNull();
      expect(result!.isError).toBeFalsy();
      const parsed = JSON.parse(result!.content[0].text);
      expect(parsed).toEqual(data);
    });

    it('returns wrapError when adapter returns an error field', async () => {
      const tools = new OsintProxyTools(makeMockAdapter({
        executeTool: (jest.fn() as any).mockResolvedValue({ error: 'HTTP 503' }),
      }));

      const result = await tools.executeTool('osint_search_cve', { keyword: 'log4j' });

      expect(result).not.toBeNull();
      expect(result!.isError).toBe(true);
      expect(result!.content[0].text).toContain('HTTP 503');
    });

    it('wraps string-coerces the error field from adapter', async () => {
      const tools = new OsintProxyTools(makeMockAdapter({
        executeTool: (jest.fn() as any).mockResolvedValue({ error: 404 }),
      }));

      const result = await tools.executeTool('osint_search_interpol', { name: 'X Y' });

      expect(result!.isError).toBe(true);
      expect(result!.content[0].text).toContain('404');
    });

    it('each known tool name is dispatched correctly (spot-check osint_search_github_leaks)', async () => {
      const mockExecuteTool = (jest.fn() as any).mockResolvedValue({ leaks: [] }) as any;
      const tools = new OsintProxyTools(makeMockAdapter({ executeTool: mockExecuteTool }));

      const result = await tools.executeTool('osint_search_github_leaks', { domain: 'target.io' });

      expect(mockExecuteTool).toHaveBeenCalledWith('search_github_leaks', { domain: 'target.io' });
      expect(result!.isError).toBeFalsy();
    });

    it('each known tool name is dispatched correctly (spot-check osint_search_sanctions)', async () => {
      const mockExecuteTool = (jest.fn() as any).mockResolvedValue({ sanctions: [] }) as any;
      const tools = new OsintProxyTools(makeMockAdapter({ executeTool: mockExecuteTool }));

      const result = await tools.executeTool('osint_search_sanctions', { name: 'Doe' });

      expect(mockExecuteTool).toHaveBeenCalledWith('search_sanctions', { name: 'Doe' });
      expect(result!.isError).toBeFalsy();
    });
  });
});
