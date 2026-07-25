/**
 * Unit tests for password auth flow.
 * Covers: login, register, forgot-password, reset-password.
 */

import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const fakeUser = {
  id: 'user-uuid-456',
  google_id: '',
  email: 'test@example.com',
  name: 'Test User',
  email_verified: true,
  password_hash: '$2a$10$dummyhash',
  created_at: new Date(),
  updated_at: new Date(),
  last_login: new Date(),
  role: 'user' as const,
  picture: null,
  banner: null,
};

const fakeUserService = {
  findByEmail: jest.fn(async () => null as any),
  createUser: jest.fn(async () => fakeUser),
  createUserWithPassword: jest.fn(async () => fakeUser),
  findById: jest.fn(async () => fakeUser),
  updateLastLogin: jest.fn(async () => {}),
  isAccountLocked: jest.fn(async () => false),
  recordFailedLogin: jest.fn(async () => {}),
  resetFailedAttempts: jest.fn(async () => {}),
  createPasswordResetToken: jest.fn(async () => 'reset-token-abc'),
  createVerificationToken: jest.fn(async () => 'verify-token-abc'),
  resetPassword: jest.fn(async () => true),
};

const fakeEmailService = {
  sendPasswordResetEmail: jest.fn(async () => {}),
  sendVerificationEmail: jest.fn(async () => {}),
};

jest.mock('../../middleware/dual-auth.js', () => ({
  getUserService: () => fakeUserService,
  getWebAuthnService: () => null,
}));

jest.mock('../../services/diia-service.js', () => ({
  getDiiaService: () => ({ isConfigured: () => false }),
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

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => '$2a$10$newhash'),
}));

import bcrypt from 'bcryptjs';

// Import module under test AFTER mocks
import {
  loginWithPassword,
  registerWithPassword,
  forgotPassword,
  resetPassword,
  setAuthEmailService,
} from '../auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    params: {},
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

describe('Password Auth Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeUserService.findByEmail.mockResolvedValue(null);
    fakeUserService.isAccountLocked.mockResolvedValue(false);
    fakeUserService.createPasswordResetToken.mockResolvedValue('reset-token-abc');
    fakeUserService.resetPassword.mockResolvedValue(true);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  // =========================================================================
  // LOGIN
  // =========================================================================
  describe('loginWithPassword', () => {
    it('returns 400 when email or password is missing', async () => {
      const req = makeReq({ body: { email: 'test@example.com' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(400);
      expect(res._json.message).toContain('required');
    });

    it('returns 429 when account is locked', async () => {
      fakeUserService.isAccountLocked.mockResolvedValueOnce(true);
      const req = makeReq({ body: { email: 'test@example.com', password: 'Password1' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(429);
    });

    it('returns 401 when user not found', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(null);
      const req = makeReq({ body: { email: 'noone@example.com', password: 'Password1' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(401);
      expect(res._json.message).toBe('Invalid email or password');
    });

    it('returns 401 when user has no password_hash (OAuth-only)', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce({ ...fakeUser, password_hash: null });
      const req = makeReq({ body: { email: 'test@example.com', password: 'Password1' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(401);
      expect(res._json.message).toContain('Google OAuth');
    });

    it('returns 401 and records failed login on wrong password', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(fakeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      const req = makeReq({ body: { email: 'test@example.com', password: 'WrongPass1' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(401);
      expect(fakeUserService.recordFailedLogin).toHaveBeenCalledWith('test@example.com');
    });

    it('returns token on successful login', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(fakeUser);
      const req = makeReq({ body: { email: 'test@example.com', password: 'Password1' } });
      const res = makeRes();

      await loginWithPassword(req, res);

      expect(res._status).toBe(200);
      expect(res._json.token).toBeDefined();
      expect(typeof res._json.token).toBe('string');
      expect(res._json.user.email).toBe('test@example.com');
      expect(fakeUserService.resetFailedAttempts).toHaveBeenCalledWith('user-uuid-456');
      expect(fakeUserService.updateLastLogin).toHaveBeenCalledWith('user-uuid-456');
    });
  });

  // =========================================================================
  // REGISTER
  // =========================================================================
  describe('registerWithPassword', () => {
    it('returns 400 when email or password is missing', async () => {
      const req = makeReq({ body: { email: 'test@example.com' } });
      const res = makeRes();

      await registerWithPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const req = makeReq({ body: { email: 'not-an-email', password: 'Password1' } });
      const res = makeRes();

      await registerWithPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 for weak password', async () => {
      const req = makeReq({ body: { email: 'test@example.com', password: 'short' } });
      const res = makeRes();

      await registerWithPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 409 when email already exists', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(fakeUser);
      const req = makeReq({ body: { email: 'test@example.com', password: 'Password1' } });
      const res = makeRes();

      await registerWithPassword(req, res);

      expect(res._status).toBe(409);
    });

    it('creates user on valid registration', async () => {
      fakeUserService.findByEmail.mockResolvedValueOnce(null);
      const req = makeReq({
        body: { email: 'new@example.com', password: 'Password1', name: 'New User' },
      });
      const res = makeRes();

      await registerWithPassword(req, res);

      expect(res._status).toBe(201);
      expect(fakeUserService.createUserWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          name: 'New User',
        }),
      );
    });
  });

  // =========================================================================
  // FORGOT PASSWORD
  // =========================================================================
  describe('forgotPassword', () => {
    beforeEach(() => {
      setAuthEmailService(fakeEmailService as any);
    });

    it('returns 400 when email is missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await forgotPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('always returns success even for non-existent user', async () => {
      fakeUserService.createPasswordResetToken.mockResolvedValueOnce(null as any);
      const req = makeReq({ body: { email: 'noone@example.com' } });
      const res = makeRes();

      await forgotPassword(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      // Should NOT send email for non-existent user
      expect(fakeEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('sends reset email for existing user', async () => {
      fakeUserService.createPasswordResetToken.mockResolvedValueOnce('reset-token-abc');
      const req = makeReq({ body: { email: 'test@example.com' } });
      const res = makeRes();

      await forgotPassword(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(fakeEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        'reset-token-abc',
      );
    });
  });

  // =========================================================================
  // RESET PASSWORD
  // =========================================================================
  describe('resetPassword', () => {
    it('returns 400 when token or password is missing', async () => {
      const req = makeReq({ body: { token: 'abc' } });
      const res = makeRes();

      await resetPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 for weak password', async () => {
      const req = makeReq({ body: { token: 'abc', password: 'short' } });
      const res = makeRes();

      await resetPassword(req, res);

      expect(res._status).toBe(400);
    });

    it('returns 400 for invalid/expired token', async () => {
      fakeUserService.resetPassword.mockResolvedValueOnce(false);
      const req = makeReq({ body: { token: 'expired-token', password: 'NewPassword1' } });
      const res = makeRes();

      await resetPassword(req, res);

      expect(res._status).toBe(400);
      expect(res._json.message).toContain('Invalid or expired');
    });

    it('resets password successfully', async () => {
      fakeUserService.resetPassword.mockResolvedValueOnce(true);
      const req = makeReq({ body: { token: 'valid-token', password: 'NewPassword1' } });
      const res = makeRes();

      await resetPassword(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(fakeUserService.resetPassword).toHaveBeenCalledWith('valid-token', 'NewPassword1');
    });
  });
});
