/**
 * MinIO Service Tests — presigned URL rewriting (LEG-174)
 *
 * Tests cover:
 * - Presigned URL generation and environment-specific rewriting
 * - MINIO_PUBLIC_URL rewriting for prod/stage (Docker internal → public)
 * - Local dev behavior (no rewriting when MINIO_PUBLIC_URL is unset)
 * - URL format: /s3/ prefix preserved after rewrite
 * - Edge cases: missing env vars, different port/SSL combos
 * - Bucket name generation
 * - Object key generation
 */

import { MinioService } from '../minio-service';

// ──────────────────────────────────────────────────────────────────────────
// Mock the minio module
// ──────────────────────────────────────────────────────────────────────────

const mockPresignedGetObject = jest.fn();
const mockBucketExists = jest.fn();
const mockMakeBucket = jest.fn();
const mockListBuckets = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    presignedGetObject: mockPresignedGetObject,
    bucketExists: mockBucketExists,
    makeBucket: mockMakeBucket,
    listBuckets: mockListBuckets,
  })),
}));

// Suppress logger output during tests
jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = process.env;

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('MinioService', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Presigned URL rewriting
  // ════════════════════════════════════════════════════════════════════════

  describe('getFileUrl — presigned URL rewriting', () => {
    it('should rewrite Docker-internal URL to public URL when MINIO_PUBLIC_URL is set (prod)', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-prod',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://legal.org.ua/s3',
      });

      const service = new MinioService();

      // MinIO SDK returns an internal Docker URL
      mockPresignedGetObject.mockResolvedValue(
        'http://minio-prod:9000/user-abc123/2026/02/document.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin'
      );

      const url = await service.getFileUrl('abc123', '2026/02/document.pdf');

      expect(url).toBe(
        'https://legal.org.ua/s3/user-abc123/2026/02/document.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin'
      );
      expect(url).not.toContain('minio-prod');
      expect(url).not.toContain(':9000');
    });

    it('should rewrite Docker-internal URL to public URL when MINIO_PUBLIC_URL is set (stage)', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-stage',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://stage.legal.org.ua/s3',
      });

      const service = new MinioService();

      mockPresignedGetObject.mockResolvedValue(
        'http://minio-stage:9000/user-test-user/2026/02/photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600'
      );

      const url = await service.getFileUrl('test-user', '2026/02/photo.jpg');

      expect(url).toBe(
        'https://stage.legal.org.ua/s3/user-test-user/2026/02/photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600'
      );
      expect(url).toContain('/s3/');
      expect(url).not.toContain('minio-stage');
    });

    it('should NOT rewrite URL when MINIO_PUBLIC_URL is not set (local dev)', async () => {
      setEnv({
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: undefined,
      });
      // Ensure it's truly deleted, not set to "undefined"
      delete process.env.MINIO_PUBLIC_URL;

      const service = new MinioService();

      const internalUrl =
        'http://localhost:9000/user-dev-user/2026/02/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256';
      mockPresignedGetObject.mockResolvedValue(internalUrl);

      const url = await service.getFileUrl('dev-user', '2026/02/test.txt');

      expect(url).toBe(internalUrl);
      expect(url).toContain('localhost:9000');
    });

    it('should handle SSL endpoint rewriting correctly', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio.internal.example.com',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'true',
        MINIO_PUBLIC_URL: 'https://cdn.example.com/s3',
      });

      const service = new MinioService();

      mockPresignedGetObject.mockResolvedValue(
        'https://minio.internal.example.com:9000/user-user1/file.pdf?sig=abc'
      );

      const url = await service.getFileUrl('user1', 'file.pdf');

      expect(url).toBe('https://cdn.example.com/s3/user-user1/file.pdf?sig=abc');
    });

    it('should preserve all query parameters (presigned signature) after rewriting', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-prod',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://legal.org.ua/s3',
      });

      const service = new MinioService();

      const queryParams =
        'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260227%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260227T030000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=abcdef1234567890';
      mockPresignedGetObject.mockResolvedValue(
        `http://minio-prod:9000/user-uid/path/to/file.docx?${queryParams}`
      );

      const url = await service.getFileUrl('uid', 'path/to/file.docx');

      expect(url).toContain(queryParams);
      expect(url).toStartWith('https://legal.org.ua/s3/');
    });

    it('should pass the correct expiry to presignedGetObject', async () => {
      setEnv({
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
      });
      delete process.env.MINIO_PUBLIC_URL;

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue('http://localhost:9000/user-u/key?sig=x');

      await service.getFileUrl('u', 'key', 7200);

      expect(mockPresignedGetObject).toHaveBeenCalledWith('user-u', 'key', 7200, {});
    });

    it('should use default expiry of 3600 when none specified', async () => {
      setEnv({
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
      });
      delete process.env.MINIO_PUBLIC_URL;

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue('http://localhost:9000/user-u/key?sig=x');

      await service.getFileUrl('u', 'key');

      expect(mockPresignedGetObject).toHaveBeenCalledWith('user-u', 'key', 3600, {});
    });

    it('should use default endpoint and port when env vars are missing', async () => {
      setEnv({
        MINIO_PUBLIC_URL: 'https://example.com/s3',
      });
      delete process.env.MINIO_ENDPOINT;
      delete process.env.MINIO_PORT;
      delete process.env.MINIO_USE_SSL;

      const service = new MinioService();

      // Defaults: endpoint=localhost, port=9000, ssl=false
      mockPresignedGetObject.mockResolvedValue(
        'http://localhost:9000/user-u1/doc.pdf?sig=abc'
      );

      const url = await service.getFileUrl('u1', 'doc.pdf');

      expect(url).toBe('https://example.com/s3/user-u1/doc.pdf?sig=abc');
    });

    it('should throw when presignedGetObject fails', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-prod',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
      });

      const service = new MinioService();
      mockPresignedGetObject.mockRejectedValue(new Error('Connection refused'));

      await expect(service.getFileUrl('user1', 'file.pdf')).rejects.toThrow('Connection refused');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // URL format validation: /s3/ prefix correctness
  // ════════════════════════════════════════════════════════════════════════

  describe('URL format — /s3/ prefix', () => {
    it('should produce URLs with /s3/ followed by bucket/key path (prod)', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-prod',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://legal.org.ua/s3',
      });

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue(
        'http://minio-prod:9000/user-abc/2026/02/file.pdf?sig=x'
      );

      const url = await service.getFileUrl('abc', '2026/02/file.pdf');

      // Should have: https://legal.org.ua/s3/user-abc/2026/02/file.pdf?sig=x
      // The /s3/ from MINIO_PUBLIC_URL replaces the origin, and the bucket path follows
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/s3/user-abc/2026/02/file.pdf');
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('legal.org.ua');
    });

    it('should produce URLs matching nginx ^~ /s3/ location pattern', async () => {
      setEnv({
        MINIO_ENDPOINT: 'minio-stage',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://stage.legal.org.ua/s3',
      });

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue(
        'http://minio-stage:9000/user-test/photo.jpg?sig=y'
      );

      const url = await service.getFileUrl('test', 'photo.jpg');

      // Nginx ^~ /s3/ location will match this URL path
      const parsed = new URL(url);
      expect(parsed.pathname.startsWith('/s3/')).toBe(true);
    });

    it('should handle image file extensions that would otherwise match nginx regex', async () => {
      // This is the bug that ^~ modifier fixes: .jpg, .png etc. were being
      // caught by the static assets regex location instead of /s3/ prefix location
      setEnv({
        MINIO_ENDPOINT: 'minio-prod',
        MINIO_PORT: '9000',
        MINIO_USE_SSL: 'false',
        MINIO_PUBLIC_URL: 'https://legal.org.ua/s3',
      });

      const service = new MinioService();

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
      for (const ext of imageExtensions) {
        mockPresignedGetObject.mockResolvedValue(
          `http://minio-prod:9000/user-u/image${ext}?sig=z`
        );

        const url = await service.getFileUrl('u', `image${ext}`);
        const parsed = new URL(url);

        // URL must start with /s3/ so nginx ^~ prefix match takes precedence
        expect(parsed.pathname.startsWith('/s3/')).toBe(true);
        expect(parsed.pathname).toBe(`/s3/user-u/image${ext}`);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Bucket name generation
  // ════════════════════════════════════════════════════════════════════════

  describe('getBucketName (via getFileUrl)', () => {
    it('should lowercase userId and prefix with user-', async () => {
      setEnv({ MINIO_ENDPOINT: 'localhost', MINIO_PORT: '9000', MINIO_USE_SSL: 'false' });
      delete process.env.MINIO_PUBLIC_URL;

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue('http://localhost:9000/user-abc/key?sig=x');

      await service.getFileUrl('ABC', 'key');

      expect(mockPresignedGetObject).toHaveBeenCalledWith('user-abc', 'key', 3600, {});
    });

    it('should replace underscores with hyphens in bucket name', async () => {
      setEnv({ MINIO_ENDPOINT: 'localhost', MINIO_PORT: '9000', MINIO_USE_SSL: 'false' });
      delete process.env.MINIO_PUBLIC_URL;

      const service = new MinioService();
      mockPresignedGetObject.mockResolvedValue('http://localhost:9000/user-some-user-id/key?sig=x');

      await service.getFileUrl('some_user_id', 'key');

      expect(mockPresignedGetObject).toHaveBeenCalledWith('user-some-user-id', 'key', 3600, {});
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Static utility: generateObjectKey
  // ════════════════════════════════════════════════════════════════════════

  describe('generateObjectKey', () => {
    it('should produce YYYY/MM/sanitized-filename format', () => {
      const key = MinioService.generateObjectKey('my document (1).pdf');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      expect(key).toBe(`${year}/${month}/my_document__1_.pdf`);
    });

    it('should keep safe characters unchanged', () => {
      const key = MinioService.generateObjectKey('file-name_v2.0.txt');
      expect(key).toMatch(/^\d{4}\/\d{2}\/file-name_v2\.0\.txt$/);
    });

    it('should replace non-ASCII characters', () => {
      const key = MinioService.generateObjectKey('документ.pdf');
      expect(key).toMatch(/^\d{4}\/\d{2}\/________\.pdf$/);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Health check
  // ════════════════════════════════════════════════════════════════════════

  describe('healthCheck', () => {
    it('should return ok when MinIO is reachable', async () => {
      setEnv({ MINIO_ENDPOINT: 'localhost', MINIO_PORT: '9000', MINIO_USE_SSL: 'false' });
      const service = new MinioService();
      mockListBuckets.mockResolvedValue([]);

      const result = await service.healthCheck();
      expect(result).toEqual({ ok: true });
    });

    it('should return error when MinIO is unreachable', async () => {
      setEnv({ MINIO_ENDPOINT: 'localhost', MINIO_PORT: '9000', MINIO_USE_SSL: 'false' });
      const service = new MinioService();
      mockListBuckets.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.healthCheck();
      expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Custom matchers
// ──────────────────────────────────────────────────────────────────────────

expect.extend({
  toStartWith(received: string, prefix: string) {
    const pass = received.startsWith(prefix);
    return {
      pass,
      message: () =>
        `expected "${received}" ${pass ? 'not ' : ''}to start with "${prefix}"`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toStartWith(prefix: string): R;
    }
  }
}
