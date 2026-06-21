/**
 * Tests for EdsrVectorizerService — initialization, token tracking, stats.
 *
 * Note: Full vectorization/search tests require complex VoyageAI + Qdrant
 * mock interactions. Here we test initialization, callback management,
 * and error paths.
 */

const mockGetCollections = jest.fn().mockResolvedValue({ collections: [{ name: 'edrsr_serving' }] });
const mockGetCollection = jest.fn().mockResolvedValue({ points_count: 5000 });
const mockCollectionExists = jest.fn().mockResolvedValue(true);

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: mockGetCollections,
    getCollection: mockGetCollection,
    collectionExists: mockCollectionExists,
    createCollection: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue([]),
    scroll: jest.fn().mockResolvedValue({ points: [] }),
  })),
}));

jest.mock('../../utils/voyage-client.js', () => ({
  VoyageAIClient: jest.fn().mockImplementation(() => ({
    embedBatch: jest.fn().mockResolvedValue({ embeddings: [], usage: { total_tokens: 0 } }),
    embed: jest.fn().mockResolvedValue({ data: [{ embedding: new Array(1024).fill(0) }], usage: { total_tokens: 50 } }),
  })),
}));

jest.mock('../../utils/bge-m3-client.js', () => ({
  BgeM3Client: jest.fn().mockImplementation(() => ({
    embedBatch: jest.fn().mockResolvedValue({ embeddings: [], usage: { total_tokens: 0 } }),
    embed: jest.fn().mockResolvedValue({ embedding: new Array(1024).fill(0), usage: { total_tokens: 50 } }),
  })),
}));

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { EdsrVectorizerService } from '../edrsr-vectorizer-service';

describe('EdsrVectorizerService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, VOYAGEAI_API_KEY: 'test-key', QDRANT_URL: 'http://localhost:6333', BGE_M3_URL: 'http://localhost:8080' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with default concurrency', () => {
      const service = new EdsrVectorizerService();
      expect(service).toBeDefined();
    });

    it('should initialize with custom concurrency', () => {
      const service = new EdsrVectorizerService(4);
      expect(service).toBeDefined();
    });
  });

  describe('setUsageCallback', () => {
    it('should accept callback', () => {
      const service = new EdsrVectorizerService();
      const cb = jest.fn();
      expect(() => service.setUsageCallback(cb)).not.toThrow();
    });

    it('should accept undefined to clear callback', () => {
      const service = new EdsrVectorizerService();
      expect(() => service.setUsageCallback(undefined)).not.toThrow();
    });
  });

  describe('getVectorizationStats', () => {
    it('should return stats when collection exists', async () => {
      const service = new EdsrVectorizerService();
      mockGetCollections.mockResolvedValueOnce({
        collections: [{ name: 'edrsr_serving' }],
      });
      mockGetCollection.mockResolvedValueOnce({ points_count: 5000 });

      const stats = await service.getVectorizationStats();

      expect(stats.collection_exists).toBe(true);
      expect(stats.total_points).toBe(5000);
    });

    it('should return zero stats when collection missing', async () => {
      const service = new EdsrVectorizerService();
      mockGetCollections.mockResolvedValueOnce({ collections: [] });

      const stats = await service.getVectorizationStats();

      expect(stats.collection_exists).toBe(false);
      expect(stats.total_points).toBe(0);
    });
  });

  describe('vectorizeDocuments', () => {
    it('should handle empty document array', async () => {
      const service = new EdsrVectorizerService();
      await expect(service.vectorizeDocuments([])).resolves.not.toThrow();
    });
  });
});
