/**
 * MCPService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPService } from '../MCPService';
import type { StreamingCallbacks } from '../../../types/api/sse';

describe('MCPService', () => {
  let mcpService: MCPService;
  let mockFetch: any;

  beforeEach(() => {
    // getAuthToken() reads localStorage; the local runner (Node 26 + happy-dom) leaves it
    // unavailable, so stub a minimal Map-backed implementation for the suite.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    });
    mcpService = new MCPService();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('callTool', () => {
    it('should call tool synchronously', async () => {
      const mockResponse = {
        result: {
          content: [
            {
              text: JSON.stringify({
                summary: 'Test answer',
                reasoning_chain: [],
              }),
            },
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await mcpService.callTool('get_legal_advice', {
        query: 'Test query',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tools/get_legal_advice'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(
        mcpService.callTool('get_legal_advice', { query: 'test' })
      ).rejects.toThrow('API Error: 500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      await expect(
        mcpService.callTool('get_legal_advice', { query: 'test' })
      ).rejects.toThrow('Network failure');
    });
  });

  describe('streamTool', () => {
    it('should stream tool execution', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: progress\ndata: {"step":1}\n\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: complete\ndata: {"result":"success"}\n\n'),
          })
          .mockResolvedValueOnce({ done: true }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const callbacks: StreamingCallbacks = {
        onProgress: vi.fn(),
        onComplete: vi.fn(),
      };

      const controller = await mcpService.streamTool('get_legal_advice', {}, callbacks);

      expect(controller).toBeInstanceOf(AbortController);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbacks.onProgress).toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalled();
    });

    it('should fallback to sync mode when streaming disabled', async () => {
      // Create service with streaming disabled
      vi.stubEnv('VITE_ENABLE_SSE_STREAMING', 'false');
      const serviceNoStreaming = new MCPService();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'success' }),
      });

      const callbacks: StreamingCallbacks = {
        onComplete: vi.fn(),
        onEnd: vi.fn(),
      };

      await serviceNoStreaming.streamTool('get_legal_advice', {}, callbacks);

      expect(callbacks.onComplete).toHaveBeenCalledWith({ result: { result: 'success' } });
      expect(callbacks.onEnd).toHaveBeenCalled();

      // Restore env
      vi.stubEnv('VITE_ENABLE_SSE_STREAMING', 'true');
    });
  });

  describe('transformToolResultToMessage', () => {
    it('should transform get_legal_advice result', () => {
      const result = {
        summary: 'Test answer',
        reasoning_chain: [{ step: 1, action: 'test' }],
        precedent_chunks: [{ case_number: '123/2024', court: 'Test' }],
      };

      const message = mcpService.transformToolResultToMessage(
        'get_legal_advice',
        result
      );

      expect(message.content).toBe('Test answer');
      expect(message.thinkingSteps).toBeDefined();
      expect(message.decisions).toBeDefined();
    });

    it('should transform search results', () => {
      const result = {
        cases: [
          { case_number: '123/2024', court: 'Test Court', summary: 'Summary' },
        ],
        total: 1,
      };

      const message = mcpService.transformToolResultToMessage(
        'search_court_cases',
        result
      );

      expect(message.content).toContain('123/2024');
      expect(message.content).toContain('Test Court');
    });

    it('should transform legislation results', () => {
      const result = {
        text: 'Article text content',
        legislation_id: 'ccu',
        article_number: '203',
      };

      const message = mcpService.transformToolResultToMessage(
        'get_legislation_article',
        result
      );

      expect(message.content).toContain('Article text content');
      expect(message.content).toContain('203');
    });

    it('should handle unknown tool formats', () => {
      const result = { unknown: 'format' };

      const message = mcpService.transformToolResultToMessage(
        'unknown_tool',
        result
      );

      expect(message.content).toContain('unknown');
    });
  });

  describe('streamChat — network resilience (blue-green deploy)', () => {
    const streamFromChunks = (chunks: string[]) => {
      const read = vi.fn();
      chunks.forEach((c) =>
        read.mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(c) }),
      );
      read.mockResolvedValueOnce({ done: true });
      return { ok: true, body: { getReader: () => ({ read, releaseLock: vi.fn() }) } };
    };

    it('retries transparently when the connection drops before any event, then succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(streamFromChunks(['event: answer\ndata: {"text":"привіт"}\n\n']));

      const onAnswer = vi.fn();
      const onError = vi.fn();
      const onStreamEnd = vi.fn();
      await mcpService.streamChat('q', [], { onAnswer, onError, onStreamEnd } as any);
      await new Promise((r) => setTimeout(r, 1000));

      expect(mockFetch).toHaveBeenCalledTimes(2); // initial fail + 1 retry
      expect(onAnswer).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onStreamEnd).toHaveBeenCalledTimes(1);
    });

    it('surfaces a clear connection-lost message after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const onError = vi.fn();
      const onStreamEnd = vi.fn();
      await mcpService.streamChat('q', [], { onError, onStreamEnd } as any);
      await new Promise((r) => setTimeout(r, 2600)); // wait out 700ms + 1400ms backoff

      expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toMatch(/перерв/i); // Ukrainian, not "Failed to fetch"
      expect(onStreamEnd).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry once an event has been received (avoids duplicate run / double-charge)', async () => {
      const read = vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('event: thinking\ndata: {"tool":"x"}\n\n'),
        })
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));
      mockFetch.mockResolvedValue({ ok: true, body: { getReader: () => ({ read, releaseLock: vi.fn() }) } });

      const onError = vi.fn();
      const onStreamEnd = vi.fn();
      await mcpService.streamChat('q', [], { onThinking: vi.fn(), onError, onStreamEnd } as any);
      await new Promise((r) => setTimeout(r, 300));

      expect(mockFetch).toHaveBeenCalledTimes(1); // no retry after a real event arrived
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onStreamEnd).toHaveBeenCalledTimes(1);
    });
  });

  // parseBackendResponse was moved to response-transformers.ts — tests are in that module
});
