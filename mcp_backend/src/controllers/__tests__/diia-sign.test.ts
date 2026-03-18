/**
 * Unit tests for Дія.Підпис (signing) flow.
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

const fakeDiiaService = {
  isConfigured: jest.fn(() => true),
  initSigningSession: jest.fn(async () => ({
    deeplink: 'https://diia.app/sign/deeplink-test',
    requestId: 'sign-uuid-abc',
    hashedRequestId: 'sign-hashed-xyz==',
  })),
};

// Mock dependencies
jest.mock('../../services/diia-service.js', () => ({
  getDiiaService: () => fakeDiiaService,
  DiiaPermissionError: class DiiaPermissionError extends Error {
    constructor(msg: string) { super(msg); this.name = 'DiiaPermissionError'; }
  },
}));

jest.mock('../../middleware/dual-auth.js', () => ({
  getUserService: () => null,
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
  diiaSignInit,
  diiaSignCallback,
  diiaSignStatus,
} from '../auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testFiles = [
  { fileName: 'contract.pdf', fileHash: 'abc123base64hash==' },
  { fileName: 'act.pdf', fileHash: 'def456base64hash==' },
];

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'legal.org.ua',
      host: 'legal.org.ua',
      ...((overrides.headers as Record<string, string>) ?? {}),
    },
    params: {},
    body: {},
    protocol: 'http',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { _json?: any; _status?: number } {
  const res: any = {
    _json: undefined,
    _status: 200,
    json: jest.fn(function (this: any, body: any) { this._json = body; return this; }),
    status: jest.fn(function (this: any, code: number) { this._status = code; return this; }),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Дія.Підпис (Signing) Flow', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockCache)) delete mockCache[key];
    jest.clearAllMocks();
    setAuthCache(fakeCachePort);
  });

  describe('diiaSignInit', () => {
    it('stores pending session under both plain and hashed keys with file metadata', async () => {
      const req = makeReq({ body: { files: testFiles } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(fakeCachePort.set).toHaveBeenCalledTimes(2);

      // Plain key stores files
      const plainVal = mockCache['diia:sign:sign-uuid-abc'];
      expect(plainVal).toBeDefined();
      const plainData = JSON.parse(plainVal);
      expect(plainData.status).toBe('pending');
      expect(plainData.files).toEqual(testFiles);

      // Hashed key stores files + plainRequestId mapping
      const hashedVal = mockCache['diia:sign:sign-hashed-xyz=='];
      expect(hashedVal).toBeDefined();
      const hashedData = JSON.parse(hashedVal);
      expect(hashedData.status).toBe('pending');
      expect(hashedData.plainRequestId).toBe('sign-uuid-abc');
      expect(hashedData.files).toEqual(testFiles);
    });

    it('returns sessionId and deeplink', async () => {
      const req = makeReq({ body: { files: testFiles } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._json).toEqual({
        sessionId: 'sign-uuid-abc',
        deeplink: 'https://diia.app/sign/deeplink-test',
      });
    });

    it('passes files to initSigningSession', async () => {
      const req = makeReq({ body: { files: testFiles } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(fakeDiiaService.initSigningSession).toHaveBeenCalledWith(
        expect.any(String), // returnUrl
        testFiles,
      );
    });

    it('returns 501 when Diia is not configured', async () => {
      fakeDiiaService.isConfigured.mockReturnValueOnce(false);
      const req = makeReq({ body: { files: testFiles } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._status).toBe(501);
    });

    it('returns 400 when files array is missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 when files array is empty', async () => {
      const req = makeReq({ body: { files: [] } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 when a file is missing fileName', async () => {
      const req = makeReq({ body: { files: [{ fileHash: 'hash==' }] } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 when a file is missing fileHash', async () => {
      const req = makeReq({ body: { files: [{ fileName: 'test.pdf' }] } });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(res._status).toBe(400);
    });

    it('uses custom returnUrl when provided', async () => {
      const req = makeReq({
        body: { files: testFiles, returnUrl: 'https://legal.org.ua/custom-return' },
      });
      const res = makeRes();

      await diiaSignInit(req, res);

      expect(fakeDiiaService.initSigningSession).toHaveBeenCalledWith(
        'https://legal.org.ua/custom-return',
        testFiles,
      );
    });
  });

  describe('diiaSignCallback', () => {
    beforeEach(() => {
      mockCache['diia:sign:sign-uuid-abc'] = JSON.stringify({
        status: 'pending',
        files: testFiles,
      });
      mockCache['diia:sign:sign-hashed-xyz=='] = JSON.stringify({
        status: 'pending',
        plainRequestId: 'sign-uuid-abc',
        files: testFiles,
      });
    });

    it('updates BOTH plain and hashed keys to complete with signedData', async () => {
      const signedPayload = { signatures: ['sig1', 'sig2'] };
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'sign-hashed-xyz==' },
        body: signedPayload,
      });
      const res = makeRes();

      await diiaSignCallback(req, res);

      const plainData = JSON.parse(mockCache['diia:sign:sign-uuid-abc']);
      expect(plainData.status).toBe('complete');
      expect(plainData.signedData).toEqual(signedPayload);
      expect(plainData.files).toEqual(testFiles);

      const hashedData = JSON.parse(mockCache['diia:sign:sign-hashed-xyz==']);
      expect(hashedData.status).toBe('complete');
      expect(hashedData.signedData).toEqual(signedPayload);
    });

    it('responds with { success: true } for Diia webhook', async () => {
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'sign-hashed-xyz==' },
        body: { signed: true },
      });
      const res = makeRes();

      await diiaSignCallback(req, res);

      expect(res._json).toEqual({ success: true });
    });

    it('returns 400 when X-Document-Request-Trace-Id is missing', async () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();

      await diiaSignCallback(req, res);

      expect(res._status).toBe(400);
      expect(res._json.success).toBe(false);
    });

    it('still returns { success: true } even for unknown traceId (no crash)', async () => {
      const req = makeReq({
        headers: { 'x-document-request-trace-id': 'unknown-trace-id' },
        body: { signed: true },
      });
      const res = makeRes();

      await diiaSignCallback(req, res);

      expect(res._json).toEqual({ success: true });
    });
  });

  describe('diiaSignStatus', () => {
    it('returns { status: "pending" } before callback fires', async () => {
      mockCache['diia:sign:sign-uuid-abc'] = JSON.stringify({
        status: 'pending',
        files: testFiles,
      });

      const req = makeReq({ params: { sessionId: 'sign-uuid-abc' } } as any);
      const res = makeRes();

      await diiaSignStatus(req, res);

      expect(res._json).toEqual({ status: 'pending' });
    });

    it('returns signedData and files after callback marks session complete', async () => {
      const signedPayload = { signatures: ['sig1'] };
      mockCache['diia:sign:sign-uuid-abc'] = JSON.stringify({
        status: 'complete',
        signedData: signedPayload,
        files: testFiles,
      });

      const req = makeReq({ params: { sessionId: 'sign-uuid-abc' } } as any);
      const res = makeRes();

      await diiaSignStatus(req, res);

      expect(res._json.status).toBe('complete');
      expect(res._json.signedData).toEqual(signedPayload);
      expect(res._json.files).toEqual(testFiles);
    });

    it('returns { status: "expired" } when session key is gone', async () => {
      const req = makeReq({ params: { sessionId: 'nonexistent-id' } } as any);
      const res = makeRes();

      await diiaSignStatus(req, res);

      expect(res._status).toBe(404);
      expect(res._json).toEqual({ status: 'expired' });
    });

    it('consumes the session key after returning signedData', async () => {
      mockCache['diia:sign:my-sign-session'] = JSON.stringify({
        status: 'complete',
        signedData: { signed: true },
        files: testFiles,
      });

      const req = makeReq({ params: { sessionId: 'my-sign-session' } } as any);
      const res = makeRes();

      await diiaSignStatus(req, res);

      expect(fakeCachePort.del).toHaveBeenCalledWith('diia:sign:my-sign-session');
    });

    it('returns 503 when cache is unavailable', async () => {
      setAuthCache(null as any);

      const req = makeReq({ params: { sessionId: 'any' } } as any);
      const res = makeRes();

      await diiaSignStatus(req, res);

      expect(res._status).toBe(503);
    });
  });

  describe('Full flow: init → poll → callback → poll → complete', () => {
    it('signing session completes end-to-end', async () => {
      // Step 1: Init signing session
      const initReq = makeReq({ body: { files: testFiles } });
      const initRes = makeRes();
      await diiaSignInit(initReq, initRes);

      expect(initRes._json.sessionId).toBe('sign-uuid-abc');
      expect(initRes._json.deeplink).toBeDefined();

      // Verify pending state
      const plainPending = JSON.parse(mockCache['diia:sign:sign-uuid-abc']);
      expect(plainPending.status).toBe('pending');
      expect(plainPending.files).toEqual(testFiles);

      // Step 2: Frontend polls — should see pending
      const pollReq1 = makeReq({ params: { sessionId: 'sign-uuid-abc' } } as any);
      const pollRes1 = makeRes();
      await diiaSignStatus(pollReq1, pollRes1);
      expect(pollRes1._json).toEqual({ status: 'pending' });

      // Step 3: Diia webhook fires with signed data
      const signedPayload = { encryptedData: 'base64...', signatures: ['sig1', 'sig2'] };
      const callbackReq = makeReq({
        headers: { 'x-document-request-trace-id': 'sign-hashed-xyz==' },
        body: signedPayload,
      });
      const callbackRes = makeRes();
      await diiaSignCallback(callbackReq, callbackRes);
      expect(callbackRes._json).toEqual({ success: true });

      // Step 4: Frontend polls again — should get signed data
      const pollReq2 = makeReq({ params: { sessionId: 'sign-uuid-abc' } } as any);
      const pollRes2 = makeRes();
      await diiaSignStatus(pollReq2, pollRes2);
      expect(pollRes2._json.status).toBe('complete');
      expect(pollRes2._json.signedData).toEqual(signedPayload);
      expect(pollRes2._json.files).toEqual(testFiles);

      // Step 5: Session consumed — polling again returns expired
      const pollReq3 = makeReq({ params: { sessionId: 'sign-uuid-abc' } } as any);
      const pollRes3 = makeRes();
      await diiaSignStatus(pollReq3, pollRes3);
      expect(pollRes3._status).toBe(404);
      expect(pollRes3._json).toEqual({ status: 'expired' });
    });
  });
});
