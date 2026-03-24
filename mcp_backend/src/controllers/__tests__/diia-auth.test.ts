/**
 * Unit tests for Diia auth flow.
 * Validates the Redis key mapping between init → callback → status polling.
 */

import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockCache: Record<string, string> = {};

const fakeCachePort = {
  get: jest.fn(async (key: string) => mockCache[key] ?? null),
  set: jest.fn(async (key: string, value: string, _ttl?: number) => {
    mockCache[key] = value;
  }),
  del: jest.fn(async (...keys: string[]) => {
    let count = 0;
    for (const k of keys) {
      if (k in mockCache) { delete mockCache[k]; count++; }
    }
    return count;
  }),
  increment: jest.fn(async () => 1),
  ping: jest.fn(async () => true),
  isConnected: jest.fn(() => true),
  connect: jest.fn(async () => {}),
  disconnect: jest.fn(async () => {}),
};

const fakeUser = {
  id: 'user-uuid-123',
  google_id: '',
  email: 'diia_abc123@diia.legal.org.ua',
  name: 'Дія Користувач',
  email_verified: true,
  created_at: new Date(),
  updated_at: new Date(),
  role: 'user' as const,
};

const fakeUserService = {
  findByEmail: jest.fn(async () => null as any),
  createUser: jest.fn(async () => fakeUser),
  findById: jest.fn(async () => fakeUser),
  updateLastLogin: jest.fn(async () => {}),
};

const fakeDiiaService = {
  isConfigured: jest.fn(() => true),
  initAuthSession: jest.fn(async () => ({
    deeplink: 'https://diia.app/auth/deeplink-test',
    requestId: 'plain-uuid-abc',
    hashedRequestId: 'hashed-base64-xyz==',
  })),
};

// Mock dependencies
jest.mock('../../services/diia-service.js', () => ({
  getDiiaService: () => fakeDiiaService,
  DiiaPermissionError: class DiiaPermissionError extends Error {
    constructor(msg: string) { super(msg); this.name = 'DiiaPermissionError'; }
  },
}));

const mockGetUserService = jest.fn(() => fakeUserService);
jest.mock('../../middleware/dual-auth.js', () => ({
  getUserService: () => mockGetUserService(),
  getWebAuthnService: () => null,
}));

jest.mock('../../services/authentik-service.js', () => ({
  provisionAuthentikUser: jest.fn(async () => {}),
}));

jest.mock('../../services/nextcloud-provisioning.js', () => ({
  provisionNextcloudUser: jest.fn(async () => {}),
}));

jest.mock('../../services/oidc-service.js', () => ({}));

jest.mock('../../services/email-service.js', () => ({
  EmailService: jest.fn(),
}));

jest.mock('../../services/minio-service.js', () => ({
  MinioService: jest.fn(),
}));

jest.mock('../../services/banner-service.js', () => ({
  BannerService: jest.fn(),
}));

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Import module under test AFTER mocks
import {
  setAuthCache,
  diiaAuthInit,
  diiaAuthCallback,
  diiaAuthStatus,
} from '../auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'legal.org.ua',
      host: 'legal.org.ua',
      ...((overrides.headers as Record<string, string>) ?? {}),
    },
    params: {},
    protocol: 'http',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { _redirectUrl?: string; _json?: any; _status?: number } {
  const res: any = {
    _redirectUrl: undefined,
    _json: undefined,
    _status: 200,
    redirect: jest.fn(function (this: any, url: string) { this._redirectUrl = url; }),
    json: jest.fn(function (this: any, body: any) { this._json = body; return this; }),
    status: jest.fn(function (this: any, code: number) { this._status = code; return this; }),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Diia Auth Flow', () => {
  beforeEach(() => {
    // Clear the in-memory cache
    for (const key of Object.keys(mockCache)) delete mockCache[key];
    jest.clearAllMocks();
    setAuthCache(fakeCachePort);
  });

  describe('diiaAuthInit', () => {
    it('stores pending session under both plain and hashed keys', async () => {
      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      // Should have stored two keys
      expect(fakeCachePort.set).toHaveBeenCalledTimes(2);

      // Plain key: { status: 'pending' }
      const plainVal = mockCache['diia:session:plain-uuid-abc'];
      expect(plainVal).toBeDefined();
      expect(JSON.parse(plainVal)).toEqual({ status: 'pending' });

      // Hashed key: { status: 'pending', plainRequestId: 'plain-uuid-abc' }
      const hashedVal = mockCache['diia:session:hashed-base64-xyz=='];
      expect(hashedVal).toBeDefined();
      const hashedData = JSON.parse(hashedVal);
      expect(hashedData.status).toBe('pending');
      expect(hashedData.plainRequestId).toBe('plain-uuid-abc');
    });

    it('redirects to /login with diia_session and diia_deeplink params', async () => {
      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const url = res._redirectUrl!;
      expect(url).toContain('https://legal.org.ua/login');
      expect(url).toContain('diia_session=plain-uuid-abc');
      expect(url).toContain('diia_deeplink=');
    });

    it('redirects with error when Diia is not configured', async () => {
      fakeDiiaService.isConfigured.mockReturnValueOnce(false);
      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      expect(res._redirectUrl).toContain('error=diia_not_configured');
    });
  });

  describe('diiaAuthCallback', () => {
    beforeEach(async () => {
      // Simulate a prior init that created both keys
      mockCache['diia:session:plain-uuid-abc'] = JSON.stringify({ status: 'pending' });
      mockCache['diia:session:hashed-base64-xyz=='] = JSON.stringify({
        status: 'pending',
        plainRequestId: 'plain-uuid-abc',
      });
    });

    it('updates BOTH plain and hashed keys to complete', async () => {
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      // Both keys should be 'complete'
      const plainData = JSON.parse(mockCache['diia:session:plain-uuid-abc']);
      expect(plainData.status).toBe('complete');
      expect(plainData.userId).toBe('user-uuid-123');

      const hashedData = JSON.parse(mockCache['diia:session:hashed-base64-xyz==']);
      expect(hashedData.status).toBe('complete');
      expect(hashedData.userId).toBe('user-uuid-123');
    });

    it('responds with { success: true } for Diia webhook', async () => {
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(res._json).toEqual({ success: true });
    });

    it('returns 400 when X-Document-Request-Trace-Id is missing', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(res._status).toBe(400);
      expect(res._json.success).toBe(false);
    });

    it('creates a new user when none exists', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(null);

      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(fakeUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringContaining('diia_'),
          name: 'Дія Користувач',
          emailVerified: true,
        }),
      );
    });

    it('updates last login for existing user', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(fakeUser);

      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(fakeUserService.updateLastLogin).toHaveBeenCalledWith('user-uuid-123');
      expect(fakeUserService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('diiaAuthStatus', () => {
    it('returns { status: "pending" } before callback fires', async () => {
      mockCache['diia:session:plain-uuid-abc'] = JSON.stringify({ status: 'pending' });

      const req = makeReq({ params: { sessionId: 'plain-uuid-abc' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._json).toEqual({ status: 'pending' });
    });

    it('returns token after callback marks session complete', async () => {
      // Simulate completed session
      mockCache['diia:session:plain-uuid-abc'] = JSON.stringify({
        status: 'complete',
        userId: 'user-uuid-123',
      });

      const req = makeReq({ params: { sessionId: 'plain-uuid-abc' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._json.status).toBe('complete');
      expect(res._json.token).toBeDefined();
      expect(typeof res._json.token).toBe('string');
    });

    it('returns { status: "expired" } when session key is gone', async () => {
      // No key in cache
      const req = makeReq({ params: { sessionId: 'nonexistent-id' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._status).toBe(404);
      expect(res._json).toEqual({ status: 'expired' });
    });

    it('consumes the session key after returning token', async () => {
      mockCache['diia:session:my-session'] = JSON.stringify({
        status: 'complete',
        userId: 'user-uuid-123',
      });

      const req = makeReq({ params: { sessionId: 'my-session' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      // Key should be deleted
      expect(fakeCachePort.del).toHaveBeenCalledWith('diia:session:my-session');
    });
  });

  describe('diiaAuthInit — edge cases', () => {
    it('sets diia_session cookie with correct TTL and flags', async () => {
      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'diia_session',
        'plain-uuid-abc',
        expect.objectContaining({
          httpOnly: false,
          secure: true,
          sameSite: 'lax',
          maxAge: 600000, // 10 min
          path: '/',
        }),
      );
    });

    it('redirects with diia_scope_forbidden on DiiaPermissionError', async () => {
      // Import the mocked class to throw it
      const { DiiaPermissionError } = jest.requireMock('../../services/diia-service.js') as any;
      fakeDiiaService.initAuthSession.mockRejectedValueOnce(
        new DiiaPermissionError('scope not active'),
      );

      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      expect(res._redirectUrl).toContain('error=diia_scope_forbidden');
    });

    it('redirects with diia_failed on generic error', async () => {
      fakeDiiaService.initAuthSession.mockRejectedValueOnce(new Error('network timeout'));

      const req = makeReq();
      const res = makeRes();

      await diiaAuthInit(req, res);

      expect(res._redirectUrl).toContain('error=diia_failed');
    });
  });

  describe('diiaAuthCallback — edge cases', () => {
    beforeEach(() => {
      mockCache['diia:session:plain-uuid-abc'] = JSON.stringify({ status: 'pending' });
      mockCache['diia:session:hashed-base64-xyz=='] = JSON.stringify({
        status: 'pending',
        plainRequestId: 'plain-uuid-abc',
      });
    });

    it('returns 503 when userService is unavailable', async () => {
      mockGetUserService.mockReturnValueOnce(null as any);

      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(res._status).toBe(503);
    });

    it('generates diia-specific email from traceId', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(null);

      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      expect(fakeUserService.findByEmail).toHaveBeenCalledWith(
        expect.stringMatching(/^diia_.*@diia\.legal\.org\.ua$/),
      );
    });

    it('still returns success even if session lookup fails (idempotent webhook)', async () => {
      // Unknown trace ID — no session in Redis
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'unknown-trace-id-abc' },
      });
      const res = makeRes();

      await diiaAuthCallback(req, res);

      // Should not crash — webhook must be idempotent
      expect(res._json.success).toBe(true);
    });
  });

  describe('diiaAuthStatus — edge cases', () => {
    it('returns 503 when cache is unavailable', async () => {
      setAuthCache(null as any);

      const req = makeReq({ params: { sessionId: 'any' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._status).toBe(503);
    });

    it('returns 503 when userService unavailable on complete session', async () => {
      mockCache['diia:session:test-sess'] = JSON.stringify({
        status: 'complete',
        userId: 'user-uuid-123',
      });

      mockGetUserService.mockReturnValueOnce(null as any);

      const req = makeReq({ params: { sessionId: 'test-sess' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._status).toBe(503);
    });

    it('returns expired when user not found by ID', async () => {
      mockCache['diia:session:test-sess'] = JSON.stringify({
        status: 'complete',
        userId: 'deleted-user',
      });

      fakeUserService.findById.mockResolvedValueOnce(null as any);

      const req = makeReq({ params: { sessionId: 'test-sess' } } as any);
      const res = makeRes();

      await diiaAuthStatus(req, res);

      expect(res._status).toBe(404);
      expect(res._json).toEqual({ status: 'expired' });
    });
  });

  describe('Full flow: init → callback → status', () => {
    it('frontend polling gets token after Diia webhook fires', async () => {
      // Step 1: Init
      const initReq = makeReq();
      const initRes = makeRes();
      await diiaAuthInit(initReq, initRes);

      // Verify pending state
      const plainPending = JSON.parse(mockCache['diia:session:plain-uuid-abc']);
      expect(plainPending.status).toBe('pending');

      // Step 2: Frontend polls — should see pending
      const pollReq1 = makeReq({ params: { sessionId: 'plain-uuid-abc' } } as any);
      const pollRes1 = makeRes();
      await diiaAuthStatus(pollReq1, pollRes1);
      expect(pollRes1._json).toEqual({ status: 'pending' });

      // Step 3: Diia webhook fires
      fakeUserService.findByEmail.mockResolvedValueOnce(null);
      const callbackReq = makeReq({
        headers: { 'x-document-request-trace-id': 'hashed-base64-xyz==' },
      });
      const callbackRes = makeRes();
      await diiaAuthCallback(callbackReq, callbackRes);
      expect(callbackRes._json).toEqual({ success: true });

      // Step 4: Frontend polls again — should get token
      const pollReq2 = makeReq({ params: { sessionId: 'plain-uuid-abc' } } as any);
      const pollRes2 = makeRes();
      await diiaAuthStatus(pollReq2, pollRes2);
      expect(pollRes2._json.status).toBe('complete');
      expect(pollRes2._json.token).toBeDefined();
    });
  });
});
