import { Response, NextFunction } from 'express';
import { requireEmailVerified } from '../require-email-verified.js';
import { AuthenticatedRequest } from '../dual-auth.js';

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function createMockReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    headers: {},
    ip: '127.0.0.1',
    path: '/api/tools/upload_document',
    authType: 'jwt',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      email_verified: true,
    },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireEmailVerified', () => {
  let next: jest.Mock<NextFunction>;

  beforeEach(() => {
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('API key auth bypass', () => {
    it('should call next() without checking email for API key clients', () => {
      const req = createMockReq({ authType: 'apikey', user: { id: 'b2b-client', email: 'b2b@corp.com', email_verified: false } as any });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should call next() for apikey auth even when user has no email_verified field', () => {
      const req = createMockReq({ authType: 'apikey', user: { id: 'b2b-client', email: 'b2b@corp.com' } as any });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('missing user (safety fallback)', () => {
    it('should call next() when no user is attached to request', () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('verified email user', () => {
    it('should call next() for a user with email_verified === true', () => {
      const req = createMockReq({
        authType: 'jwt',
        user: { id: 'user-123', email: 'verified@example.com', email_verified: true } as any,
      });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('unverified email user — blocked', () => {
    it('should return 403 when email_verified is false', () => {
      const req = createMockReq({
        authType: 'jwt',
        user: { id: 'user-456', email: 'unverified@example.com', email_verified: false } as any,
      });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when email_verified is undefined', () => {
      const req = createMockReq({
        authType: 'jwt',
        user: { id: 'user-789', email: 'noverified@example.com' } as any,
      });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when email_verified is null', () => {
      const req = createMockReq({
        authType: 'jwt',
        user: { id: 'user-999', email: 'null@example.com', email_verified: null } as any,
      });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should include a human-readable error message in the 403 response body', () => {
      const req = createMockReq({
        authType: 'jwt',
        user: { id: 'user-456', email: 'unverified@example.com', email_verified: false } as any,
      });
      const res = createMockRes();

      requireEmailVerified(req, res, next as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          code: 'EMAIL_NOT_VERIFIED',
        })
      );
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.error.length).toBeGreaterThan(0);
    });
  });
});
