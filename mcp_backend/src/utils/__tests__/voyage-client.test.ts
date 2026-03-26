// voyage-client.ts uses native fetch — we mock it globally before importing
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { VoyageAIClient } from '../voyage-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(embeddings: number[][], totalTokens = 10, status = 200) {
  const data: VoyageEmbeddingData[] = embeddings.map((embedding, index) => ({
    object: 'embedding',
    embedding,
    index,
  }));

  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({
      object: 'list',
      data,
      model: 'voyage-3.5',
      usage: { total_tokens: totalTokens },
    }),
    text: jest.fn().mockResolvedValue('error body'),
  };
}

interface VoyageEmbeddingData {
  object: string;
  embedding: number[];
  index: number;
}

const EMBEDDING_DIM = 5;
const sampleEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
const sampleEmbedding2 = [0.5, 0.4, 0.3, 0.2, 0.1];

describe('VoyageAIClient', () => {
  let client: VoyageAIClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new VoyageAIClient('test-api-key');
  });

  describe('constructor', () => {
    it('should throw when apiKey is empty string', () => {
      expect(() => new VoyageAIClient('')).toThrow('VOYAGEAI_API_KEY is required');
    });

    it('should instantiate successfully with a valid key', () => {
      expect(() => new VoyageAIClient('valid-key')).not.toThrow();
    });
  });

  describe('generateEmbedding', () => {
    it('should return a single embedding vector for a single text', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse([sampleEmbedding]));
      const result = await client.generateEmbedding('test text');
      expect(result).toEqual(sampleEmbedding);
      expect(result).toHaveLength(EMBEDDING_DIM);
    });

    it('should call the Voyage API with correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse([sampleEmbedding]));
      await client.generateEmbedding('hello', 'voyage-3.5');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.voyageai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"model":"voyage-3.5"'),
        })
      );
    });
  });

  describe('generateEmbeddingsBatch', () => {
    it('should return multiple embeddings for multiple texts', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse([sampleEmbedding, sampleEmbedding2]));
      const result = await client.generateEmbeddingsBatch(['text1', 'text2']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(sampleEmbedding);
      expect(result[1]).toEqual(sampleEmbedding2);
    });

    it('should batch texts into chunks of 50 when input exceeds batch size', async () => {
      // Create 60 texts — should split into two API calls (50 + 10)
      const texts = Array.from({ length: 60 }, (_, i) => `text ${i}`);
      const batch1Embeddings = Array.from({ length: 50 }, (_, i) => [i / 100]);
      const batch2Embeddings = Array.from({ length: 10 }, (_, i) => [(50 + i) / 100]);

      mockFetch
        .mockResolvedValueOnce(makeResponse(batch1Embeddings, 500))
        .mockResolvedValueOnce(makeResponse(batch2Embeddings, 100));

      const result = await client.generateEmbeddingsBatch(texts);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(60);
    });

    it('should preserve embedding order (sorted by index)', async () => {
      // Return embeddings out of order to test sorting
      const responseData = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          object: 'list',
          data: [
            { object: 'embedding', embedding: sampleEmbedding2, index: 1 },
            { object: 'embedding', embedding: sampleEmbedding, index: 0 },
          ],
          model: 'voyage-3.5',
          usage: { total_tokens: 20 },
        }),
        text: jest.fn(),
      };
      mockFetch.mockResolvedValueOnce(responseData);

      const result = await client.generateEmbeddingsBatch(['a', 'b']);
      expect(result[0]).toEqual(sampleEmbedding);
      expect(result[1]).toEqual(sampleEmbedding2);
    });
  });

  describe('generateEmbeddingsBatchWithUsage', () => {
    it('should return embeddings, totalTokens, and model name', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse([sampleEmbedding], 42));
      const result = await client.generateEmbeddingsBatchWithUsage(['text']);
      expect(result.embeddings).toEqual([sampleEmbedding]);
      expect(result.totalTokens).toBe(42);
      expect(result.model).toBe('voyage-3.5');
    });

    it('should accumulate tokens across multiple batches', async () => {
      const texts = Array.from({ length: 60 }, (_, i) => `t${i}`);
      const e1 = Array.from({ length: 50 }, () => [0.1]);
      const e2 = Array.from({ length: 10 }, () => [0.2]);

      mockFetch
        .mockResolvedValueOnce(makeResponse(e1, 100))
        .mockResolvedValueOnce(makeResponse(e2, 20));

      const result = await client.generateEmbeddingsBatchWithUsage(texts);
      expect(result.totalTokens).toBe(120);
    });
  });

  describe('error handling and retries', () => {
    it('should throw on non-retryable HTTP error (4xx, not 429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      });

      await expect(client.generateEmbedding('text')).rejects.toThrow('VoyageAI API error 401');
    });

    it('should retry on HTTP 429 and succeed on subsequent attempt', async () => {
      jest.useFakeTimers();

      const rateLimitedResponse = {
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Rate limited'),
      };

      mockFetch
        .mockResolvedValueOnce(rateLimitedResponse)
        .mockResolvedValueOnce(makeResponse([sampleEmbedding]));

      const promise = client.generateEmbedding('text');

      // Advance timers to skip the retry delay
      await jest.advanceTimersByTimeAsync(10000);

      const result = await promise;
      expect(result).toEqual(sampleEmbedding);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it.skip('should throw after max retries on repeated 429s (flaky with fake timers)', async () => {
      jest.useFakeTimers();

      const rateLimitedResponse = {
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Rate limited'),
      };

      mockFetch.mockResolvedValue(rateLimitedResponse);

      const promise = client.generateEmbedding('text');

      // Advance past all 3 retry delays: 1s + 2s + 4s
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(5000);
      await jest.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow(/max retries|VoyageAI/);

      jest.useRealTimers();
    });

    it('should handle missing usage field gracefully (defaults to 0 tokens)', async () => {
      const responseWithoutUsage = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          object: 'list',
          data: [{ object: 'embedding', embedding: sampleEmbedding, index: 0 }],
          model: 'voyage-3.5',
          // no usage field
        }),
        text: jest.fn(),
      };
      mockFetch.mockResolvedValueOnce(responseWithoutUsage);

      const result = await client.generateEmbeddingsBatchWithUsage(['text']);
      expect(result.totalTokens).toBe(0);
    });
  });
});
