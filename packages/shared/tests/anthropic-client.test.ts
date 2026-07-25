/**
 * Tests for AnthropicClientManager — initialization, client rotation,
 * retry logic, cost tracking, and singleton access.
 */

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({ id: 'anthropic-mock' }));
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
    estimateCostAccurate: jest.fn().mockReturnValue(0.002),
  },
}));

// Must mock openai-client partially to get requestContext
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({}));
});

import { AnthropicClientManager, getAnthropicManager } from '../src/utils/anthropic-client';
import { requestContext } from '../src/utils/openai-client';

describe('AnthropicClientManager', () => {
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
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      delete process.env.ANTHROPIC_API_KEY2;

      const manager = new AnthropicClientManager();
      expect(manager.isAvailable()).toBe(true);
    });

    it('should initialize with two API keys', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      process.env.ANTHROPIC_API_KEY2 = 'sk-ant-test-2';

      const manager = new AnthropicClientManager();
      expect(manager.isAvailable()).toBe(true);
    });

    it('should handle no API keys gracefully', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY2;

      const manager = new AnthropicClientManager();
      expect(manager.isAvailable()).toBe(false);
    });

    it('should ignore placeholder API keys', () => {
      process.env.ANTHROPIC_API_KEY = 'your-anthropic-key-1';
      process.env.ANTHROPIC_API_KEY2 = 'your-anthropic-key-2';

      const manager = new AnthropicClientManager();
      expect(manager.isAvailable()).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return client when available', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      const manager = new AnthropicClientManager();

      expect(manager.getClient()).toBeDefined();
    });

    it('should throw when no clients configured', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY2;
      const manager = new AnthropicClientManager();

      expect(() => manager.getClient()).toThrow('No Anthropic API keys configured');
    });
  });

  describe('rotateClient', () => {
    it('should rotate between clients with multiple keys', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      process.env.ANTHROPIC_API_KEY2 = 'sk-ant-test-2';
      const manager = new AnthropicClientManager();

      const first = manager.getClient();
      manager.rotateClient();
      const second = manager.getClient();
      manager.rotateClient();
      const third = manager.getClient();

      expect(first).toBe(third);
      expect(first).not.toBe(second);
    });

    it('should do nothing with single client', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      delete process.env.ANTHROPIC_API_KEY2;
      const manager = new AnthropicClientManager();

      const before = manager.getClient();
      manager.rotateClient();
      const after = manager.getClient();

      expect(before).toBe(after);
    });
  });

  describe('executeWithRetry', () => {
    let manager: AnthropicClientManager;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-1';
      process.env.ANTHROPIC_API_KEY2 = 'sk-ant-test-2';
      manager = new AnthropicClientManager();
    });

    it('should return result on first successful attempt', async () => {
      const operation = jest.fn().mockResolvedValue({ content: 'ok' });

      const result = await manager.executeWithRetry(operation, 1);

      expect(result).toEqual({ content: 'ok' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ status: 500, message: 'Server Error' })
        .mockResolvedValue({ content: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);

      expect(result).toEqual({ content: 'ok' });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should rotate client on 429 rate limit', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Rate limited' })
        .mockResolvedValue({ content: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);
      expect(result).toEqual({ content: 'ok' });
    });

    it('should rotate on authentication_error type', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ error: { type: 'authentication_error' }, message: 'Bad key' })
        .mockResolvedValue({ content: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);
      expect(result).toEqual({ content: 'ok' });
    });

    it('should rotate on rate_limit_error type', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ error: { type: 'rate_limit_error' }, message: 'Too many' })
        .mockResolvedValue({ content: 'ok' });

      const result = await manager.executeWithRetry(operation, 3);
      expect(result).toEqual({ content: 'ok' });
    });

    it('should throw after exhausting all retries', async () => {
      const operation = jest.fn().mockRejectedValue({ status: 500, message: 'fail' });

      await expect(manager.executeWithRetry(operation, 2)).rejects.toThrow(
        /Anthropic operation failed after/
      );
    });

    it('should track cost when costTracker is set and response has usage', async () => {
      const tracker = { recordOpenAICall: jest.fn().mockResolvedValue(undefined) };
      manager.setCostTracker(tracker);

      const mockResponse = {
        model: 'claude-3-5-sonnet-20241022',
        usage: {
          input_tokens: 200,
          output_tokens: 100,
        },
      };

      const operation = jest.fn().mockResolvedValue(mockResponse);

      await requestContext.run({ requestId: 'req-2', task: 'anthropic-test' }, async () => {
        await manager.executeWithRetry(operation, 1);
      });

      expect(tracker.recordOpenAICall).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-2',
          model: 'claude-3-5-sonnet-20241022',
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          task: 'anthropic-test',
        })
      );
    });

    it('should not track cost without request context', async () => {
      const tracker = { recordOpenAICall: jest.fn() };
      manager.setCostTracker(tracker);

      const mockResponse = {
        model: 'claude-3-haiku',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      await manager.executeWithRetry(() => Promise.resolve(mockResponse), 1);
      expect(tracker.recordOpenAICall).not.toHaveBeenCalled();
    });

    it('should handle cost tracking errors gracefully', async () => {
      const tracker = {
        recordOpenAICall: jest.fn().mockRejectedValue(new Error('DB down')),
      };
      manager.setCostTracker(tracker);

      const mockResponse = {
        model: 'claude-3-haiku',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      await requestContext.run({ requestId: 'req-3', task: 'test' }, async () => {
        // Should not throw even when tracker fails
        const result = await manager.executeWithRetry(() => Promise.resolve(mockResponse), 1);
        expect(result).toBe(mockResponse);
      });
    });
  });
});

describe('getAnthropicManager', () => {
  it('should return singleton instance', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const a = getAnthropicManager();
    const b = getAnthropicManager();
    expect(a).toBe(b);
  });
});
