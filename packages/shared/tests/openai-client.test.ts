/**
 * Tests for OpenAIClientManager — initialization, client rotation,
 * retry logic, cost tracking, and singleton access.
 */

const mockOpenAIInstance = { id: 'openai-mock' };
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({ ...mockOpenAIInstance }));
});

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/utils/model-selector', () => ({
  ModelSelector: {
    estimateCostAccurate: jest.fn().mockReturnValue(0.001),
  },
}));

import { OpenAIClientManager, getOpenAIManager, requestContext } from '../src/utils/openai-client';

describe('OpenAIClientManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with single API key', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      delete process.env.OPENAI_API_KEY2;

      const manager = new OpenAIClientManager();

      expect(manager.isAvailable()).toBe(true);
      expect(manager.getClientCount()).toBe(1);
    });

    it('should initialize with two API keys', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      process.env.OPENAI_API_KEY2 = 'sk-test-key-2';

      const manager = new OpenAIClientManager();

      expect(manager.isAvailable()).toBe(true);
      expect(manager.getClientCount()).toBe(2);
    });

    it('should handle no API keys gracefully', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY2;

      const manager = new OpenAIClientManager();

      expect(manager.isAvailable()).toBe(false);
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('getClient', () => {
    it('should return client when available', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      const manager = new OpenAIClientManager();

      const client = manager.getClient();
      expect(client).toBeDefined();
    });

    it('should throw when no clients configured', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY2;
      const manager = new OpenAIClientManager();

      expect(() => manager.getClient()).toThrow('No OpenAI API keys configured');
    });
  });

  describe('rotateClient', () => {
    it('should rotate between clients when multiple keys exist', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      process.env.OPENAI_API_KEY2 = 'sk-test-key-2';
      const manager = new OpenAIClientManager();

      const first = manager.getClient();
      manager.rotateClient();
      const second = manager.getClient();
      manager.rotateClient();
      const third = manager.getClient();

      // Should cycle back to first after rotating twice
      expect(first).toBe(third);
      expect(first).not.toBe(second);
    });

    it('should do nothing with single client', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      delete process.env.OPENAI_API_KEY2;
      const manager = new OpenAIClientManager();

      const before = manager.getClient();
      manager.rotateClient();
      const after = manager.getClient();

      expect(before).toBe(after);
    });
  });

  describe('setCostTracker', () => {
    it('should accept a cost tracker', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      const manager = new OpenAIClientManager();

      const tracker = { recordOpenAICall: jest.fn() };
      expect(() => manager.setCostTracker(tracker)).not.toThrow();
    });
  });

  describe('executeWithRetry', () => {
    let manager: OpenAIClientManager;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test-key-1';
      process.env.OPENAI_API_KEY2 = 'sk-test-key-2';
      manager = new OpenAIClientManager();
    });

    it('should return result on first successful attempt', async () => {
      const operation = jest.fn().mockResolvedValue({ data: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);

      expect(result).toEqual({ data: 'ok' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ status: 500, message: 'Server Error' })
        .mockResolvedValue({ data: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);

      expect(result).toEqual({ data: 'ok' });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should rotate client on 429 rate limit', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limited' })
        .mockResolvedValue({ data: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);

      expect(result).toEqual({ data: 'ok' });
    });

    it('should rotate client on 401 auth error', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ status: 401, message: 'Unauthorized' })
        .mockResolvedValue({ data: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);

      expect(result).toEqual({ data: 'ok' });
    });

    it('should throw after exhausting all retries and rotations', async () => {
      const operation = jest.fn().mockRejectedValue({ status: 500, message: 'Server Error' });

      await expect(manager.executeWithRetry(operation, 2)).rejects.toThrow(
        /OpenAI operation failed after/
      );
    });

    it('should throw when no clients configured', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY2;
      const emptyManager = new OpenAIClientManager();

      await expect(
        emptyManager.executeWithRetry(() => Promise.resolve('ok'))
      ).rejects.toThrow('OpenAI provider unavailable');
    });

    it('should track cost when costTracker is set and response has usage', async () => {
      const tracker = { recordOpenAICall: jest.fn().mockResolvedValue(undefined) };
      manager.setCostTracker(tracker);

      const mockResponse = {
        model: 'gpt-4o-mini',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const operation = jest.fn().mockResolvedValue(mockResponse);

      await requestContext.run({ requestId: 'req-1', task: 'test' }, async () => {
        await manager.executeWithRetry(operation, 1);
      });

      expect(tracker.recordOpenAICall).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          model: 'gpt-4o-mini',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          task: 'test',
        })
      );
    });

    it('should not track cost without request context', async () => {
      const tracker = { recordOpenAICall: jest.fn() };
      manager.setCostTracker(tracker);

      const mockResponse = {
        model: 'gpt-4o',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      await manager.executeWithRetry(() => Promise.resolve(mockResponse), 1);

      expect(tracker.recordOpenAICall).not.toHaveBeenCalled();
    });

    it('should not track cost when response has no usage', async () => {
      const tracker = { recordOpenAICall: jest.fn() };
      manager.setCostTracker(tracker);

      await requestContext.run({ requestId: 'req-1', task: 'test' }, async () => {
        await manager.executeWithRetry(() => Promise.resolve({ data: 'no usage' }), 1);
      });

      expect(tracker.recordOpenAICall).not.toHaveBeenCalled();
    });
  });
});

describe('getOpenAIManager', () => {
  it('should return singleton instance', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const a = getOpenAIManager();
    const b = getOpenAIManager();
    expect(a).toBe(b);
  });
});
