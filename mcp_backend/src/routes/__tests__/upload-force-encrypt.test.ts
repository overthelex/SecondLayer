/**
 * Upload Routes — Force-Encrypt Logic Tests
 *
 * Verifies that `effectiveEncrypt` is computed correctly in both /init and /init-batch:
 *  - JWT consumers: encrypt is always forced to true regardless of what the client sent
 *  - API key consumers: the client-supplied encrypt value is respected as-is
 */

import express, { Response, NextFunction } from 'express';
import request from 'supertest';
import { createUploadRouter } from '../upload-routes';

// ── Module-level mocks ────────────────────────────────────────────────────────

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Rate limiters are pass-through in tests — no Redis needed
jest.mock('../../middleware/upload-rate-limit.js', () => ({
  uploadInitRateLimit: (_req: any, _res: any, next: NextFunction) => next(),
  uploadBatchInitRateLimit: (_req: any, _res: any, next: NextFunction) => next(),
  uploadChunkRateLimit: (_req: any, _res: any, next: NextFunction) => next(),
}));

// ── Test constants ────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-42';

const MOCK_SESSION = {
  id: 'session-uuid-001',
  chunkSize: 5 * 1024 * 1024,
  totalChunks: 1,
  uploadedChunks: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeUploadService(overrides: any = {}) {
  return {
    createSession: jest.fn().mockResolvedValue(MOCK_SESSION),
    getActiveSessionCount: jest.fn().mockResolvedValue(0),
    cancelUserStaleSessions: jest.fn().mockResolvedValue(0),
    getSession: jest.fn().mockResolvedValue(null),
    saveChunk: jest.fn().mockResolvedValue({}),
    assembleFile: jest.fn().mockResolvedValue('/tmp/assembled'),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    setDocumentId: jest.fn().mockResolvedValue(undefined),
    cleanupAssembledFile: jest.fn().mockResolvedValue(undefined),
    findDocumentBySessionId: jest.fn().mockResolvedValue(null),
    cancelSession: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: jest.fn().mockResolvedValue([]),
    incrementRetryCount: jest.fn().mockResolvedValue(undefined),
    isDocumentType: jest.fn().mockReturnValue(false),
    ...overrides,
  };
}

function makeMinioService() {
  return { uploadFile: jest.fn(), getFile: jest.fn(), deleteFile: jest.fn() };
}

function makeVaultTools() {
  return { storeDocument: jest.fn(), retrieveDocument: jest.fn() };
}

function makeDb() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

/**
 * Build a test Express app wired to the real upload router.
 * The `authMiddleware` parameter is injected BEFORE the router so we can
 * control `req.user`, `req.authType`, and `req.rawBody` per test.
 */
function buildApp(
  uploadService: ReturnType<typeof makeUploadService>,
  authMiddleware: (req: any, res: Response, next: NextFunction) => void
) {
  const app = express();
  app.use(express.json());

  // Expose raw body so the batch-init fallback parser can find it
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.rawBody = undefined; // not needed for these tests; prevents undefined dereference
    next();
  });

  app.use(authMiddleware);

  const router = createUploadRouter(
    uploadService as any,
    makeMinioService() as any,
    makeVaultTools() as any,
    makeDb() as any
  );

  app.use('/upload', router);
  return app;
}

/** Auth middleware that simulates a JWT-authenticated web user */
function jwtAuth(req: any, _res: Response, next: NextFunction) {
  req.user = { id: TEST_USER_ID };
  req.authType = 'jwt';
  next();
}

/** Auth middleware that simulates an API key consumer */
function apikeyAuth(req: any, _res: Response, next: NextFunction) {
  req.user = { id: TEST_USER_ID };
  req.authType = 'apikey';
  next();
}

// ── /init — single-file session ───────────────────────────────────────────────

describe('POST /upload/init — force-encrypt logic', () => {
  const BASE_BODY = {
    fileName: 'contract.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
  };

  describe('JWT consumer', () => {
    it('forces encrypt=true when client sends encrypt=false', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, jwtAuth);

      const res = await request(app)
        .post('/upload/init')
        .send({ ...BASE_BODY, encrypt: false });

      expect(res.status).toBe(201);
      expect(uploadService.createSession).toHaveBeenCalledTimes(1);

      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(true);
    });

    it('keeps encrypt=true when client also sends encrypt=true', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, jwtAuth);

      const res = await request(app)
        .post('/upload/init')
        .send({ ...BASE_BODY, encrypt: true });

      expect(res.status).toBe(201);
      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(true);
    });

    it('forces encrypt=true when client omits the encrypt field', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, jwtAuth);

      const res = await request(app)
        .post('/upload/init')
        .send(BASE_BODY); // no encrypt key

      expect(res.status).toBe(201);
      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(true);
    });
  });

  describe('API key consumer', () => {
    it('keeps encrypt=false when client sends encrypt=false', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, apikeyAuth);

      const res = await request(app)
        .post('/upload/init')
        .send({ ...BASE_BODY, encrypt: false });

      expect(res.status).toBe(201);
      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(false);
    });

    it('keeps encrypt=true when client sends encrypt=true', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, apikeyAuth);

      const res = await request(app)
        .post('/upload/init')
        .send({ ...BASE_BODY, encrypt: true });

      expect(res.status).toBe(201);
      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(true);
    });

    it('treats omitted encrypt as false (not forced)', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, apikeyAuth);

      const res = await request(app)
        .post('/upload/init')
        .send(BASE_BODY); // no encrypt key — API key path: encrypt === true evaluates false

      expect(res.status).toBe(201);
      const opts = uploadService.createSession.mock.calls[0][4];
      expect(opts.encrypt).toBe(false);
    });
  });
});

// ── /init-batch — multi-file session ─────────────────────────────────────────

describe('POST /upload/init-batch — force-encrypt logic', () => {
  describe('JWT consumer', () => {
    it('forces encrypt=true for all files even when client sends encrypt=false', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, jwtAuth);

      const files = [
        { fileName: 'a.pdf', fileSize: 1024, mimeType: 'application/pdf', encrypt: false },
        { fileName: 'b.pdf', fileSize: 2048, mimeType: 'application/pdf', encrypt: false },
      ];

      const res = await request(app)
        .post('/upload/init-batch')
        .send({ files });

      expect(res.status).toBe(201);
      expect(uploadService.createSession).toHaveBeenCalledTimes(2);

      for (const call of uploadService.createSession.mock.calls) {
        const opts = call[4];
        expect(opts.encrypt).toBe(true);
      }
    });

    it('forces encrypt=true for all files when some have mixed encrypt values', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, jwtAuth);

      const files = [
        { fileName: 'secret.pdf', fileSize: 512, mimeType: 'application/pdf', encrypt: true },
        { fileName: 'public.pdf', fileSize: 512, mimeType: 'application/pdf', encrypt: false },
        { fileName: 'plain.pdf', fileSize: 512, mimeType: 'application/pdf' }, // omitted
      ];

      const res = await request(app)
        .post('/upload/init-batch')
        .send({ files });

      expect(res.status).toBe(201);
      expect(uploadService.createSession).toHaveBeenCalledTimes(3);

      for (const call of uploadService.createSession.mock.calls) {
        expect(call[4].encrypt).toBe(true);
      }
    });
  });

  describe('API key consumer', () => {
    it('respects per-file encrypt values: false stays false', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, apikeyAuth);

      const files = [
        { fileName: 'open.pdf', fileSize: 1024, mimeType: 'application/pdf', encrypt: false },
        { fileName: 'closed.pdf', fileSize: 1024, mimeType: 'application/pdf', encrypt: true },
      ];

      const res = await request(app)
        .post('/upload/init-batch')
        .send({ files });

      expect(res.status).toBe(201);
      expect(uploadService.createSession).toHaveBeenCalledTimes(2);

      // First file: encrypt=false
      expect(uploadService.createSession.mock.calls[0][4].encrypt).toBe(false);
      // Second file: encrypt=true
      expect(uploadService.createSession.mock.calls[1][4].encrypt).toBe(true);
    });

    it('treats omitted per-file encrypt as false (not forced)', async () => {
      const uploadService = makeUploadService();
      const app = buildApp(uploadService, apikeyAuth);

      const files = [
        { fileName: 'no-flag.pdf', fileSize: 1024, mimeType: 'application/pdf' }, // no encrypt key
      ];

      const res = await request(app)
        .post('/upload/init-batch')
        .send({ files });

      expect(res.status).toBe(201);
      expect(uploadService.createSession.mock.calls[0][4].encrypt).toBe(false);
    });
  });
});

// ── Guard rails — authentication checks ──────────────────────────────────────

describe('Upload routes — unauthenticated requests', () => {
  function noAuth(_req: any, _res: Response, next: NextFunction) {
    // user is deliberately not set
    next();
  }

  it('/init returns 401 when req.user is absent', async () => {
    const uploadService = makeUploadService();
    const app = buildApp(uploadService, noAuth);

    const res = await request(app)
      .post('/upload/init')
      .send({ fileName: 'x.pdf', fileSize: 1024, mimeType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(uploadService.createSession).not.toHaveBeenCalled();
  });

  it('/init-batch returns 401 when req.user is absent', async () => {
    const uploadService = makeUploadService();
    const app = buildApp(uploadService, noAuth);

    const res = await request(app)
      .post('/upload/init-batch')
      .send({ files: [{ fileName: 'x.pdf', fileSize: 1024, mimeType: 'application/pdf' }] });

    expect(res.status).toBe(401);
    expect(uploadService.createSession).not.toHaveBeenCalled();
  });
});
