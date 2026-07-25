/**
 * Tests for UserService — lookups, creation, sessions, email verification,
 * password reset, and account lock logic.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('../../utils/sanitize-log.js', () => ({
  maskEmail: jest.fn((e: string) => e.replace(/(.{2}).*@/, '$1***@')),
}));

// Mock bcrypt to avoid slow hashing in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$hashed$password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock crypto to get deterministic tokens
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: () => 'deadbeefdeadbeef' }),
}));

import { UserService } from '../user-service';

const makeUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  google_id: 'google-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: null,
  banner: null,
  email_verified: true,
  locale: 'uk',
  last_login: new Date('2026-01-01'),
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  password_hash: null,
  role: 'user',
  user_type: 'individual',
  ...overrides,
});

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

describe('UserService', () => {
  let service: UserService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    service = new UserService(mockDb as any);
  });

  // ── findByGoogleId ──

  describe('findByGoogleId', () => {
    it('should return user when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      const user = await service.findByGoogleId('google-123');
      expect(user).not.toBeNull();
      expect(user!.google_id).toBe('google-123');
    });

    it('should return null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const user = await service.findByGoogleId('nobody');
      expect(user).toBeNull();
    });

    it('should propagate db errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB connection failed'));
      await expect(service.findByGoogleId('google-123')).rejects.toThrow('DB connection failed');
    });
  });

  // ── findByEmail ──

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      const user = await service.findByEmail('test@example.com');
      expect(user!.email).toBe('test@example.com');
    });

    it('should return null when email does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await service.findByEmail('missing@example.com')).toBeNull();
    });

    it('should query by email parameter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.findByEmail('test@example.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('email = $1'),
        ['test@example.com']
      );
    });
  });

  // ── findById ──

  describe('findById', () => {
    it('should return user when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      const user = await service.findById('user-1');
      expect(user!.id).toBe('user-1');
    });

    it('should return null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await service.findById('ghost')).toBeNull();
    });
  });

  // ── createUser ──

  describe('createUser', () => {
    it('should insert user and return mapped row', async () => {
      const userRow = makeUser();
      mockDb.query.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const user = await service.createUser({
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: true,
      });

      expect(user.email).toBe('test@example.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['google-123', 'test@example.com'])
      );
    });

    it('should pass null for missing optional fields', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      await service.createUser({ googleId: null, email: 'test@example.com' });
      const params = mockDb.query.mock.calls[0][1];
      expect(params[0]).toBeNull(); // googleId
      expect(params[2]).toBeNull(); // name
    });

    it('should default emailVerified to false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser({ email_verified: false })], rowCount: 1 });
      await service.createUser({ googleId: null, email: 'x@x.com' });
      const params = mockDb.query.mock.calls[0][1];
      expect(params[4]).toBe(false);
    });
  });

  // ── linkGoogleAccount ──

  describe('linkGoogleAccount', () => {
    it('should update google_id and email_verified', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      const user = await service.linkGoogleAccount('user-1', 'new-google-id');
      expect(user.id).toBe('user-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('google_id = $1'),
        ['new-google-id', 'user-1']
      );
    });
  });

  // ── updateLastLogin ──

  describe('updateLastLogin', () => {
    it('should execute UPDATE and not throw on db error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('timeout'));
      // updateLastLogin swallows errors
      await expect(service.updateLastLogin('user-1')).resolves.toBeUndefined();
    });

    it('should call db.query with user id', async () => {
      await service.updateLastLogin('user-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('last_login'),
        ['user-1']
      );
    });
  });

  // ── updateProfile ──

  describe('updateProfile', () => {
    it('should build dynamic UPDATE for name only', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser({ name: 'New Name' })], rowCount: 1 });
      const user = await service.updateProfile('user-1', { name: 'New Name' });
      expect(user.name).toBe('New Name');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        expect.arrayContaining(['New Name', 'user-1'])
      );
    });

    it('should build dynamic UPDATE for picture only', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser({ picture: 'http://img' })], rowCount: 1 });
      await service.updateProfile('user-1', { picture: 'http://img' });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('picture = $1'),
        expect.arrayContaining(['http://img', 'user-1'])
      );
    });

    it('should call findById when no fields are provided', async () => {
      // With no updates, only updated_at is set — code falls back to findById
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 }); // findById
      await service.updateProfile('user-1', {});
      // Only one query (SELECT from findById)
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['user-1']
      );
    });

    it('should throw when user not found during update', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(service.updateProfile('ghost', { name: 'x' })).rejects.toThrow('User not found');
    });
  });

  // ── createSession ──

  describe('createSession', () => {
    it('should insert and return UserSession', async () => {
      const sessionRow = {
        id: 'sess-1',
        user_id: 'user-1',
        session_token: 'token-abc',
        expires_at: new Date('2026-12-31'),
        created_at: new Date('2026-01-01'),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });

      const session = await service.createSession('user-1', 'token-abc', new Date('2026-12-31'));
      expect(session.session_token).toBe('token-abc');
    });
  });

  // ── validateSession ──

  describe('validateSession', () => {
    it('should return user for valid session token', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 });
      const user = await service.validateSession('valid-token');
      expect(user).not.toBeNull();
    });

    it('should return null when session is expired or missing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const user = await service.validateSession('expired-token');
      expect(user).toBeNull();
    });
  });

  // ── deleteSession ──

  describe('deleteSession', () => {
    it('should execute DELETE and not throw on error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('not found'));
      await expect(service.deleteSession('token')).resolves.toBeUndefined();
    });

    it('should call DELETE on user_sessions', async () => {
      await service.deleteSession('tok-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_sessions'),
        ['tok-1']
      );
    });
  });

  // ── cleanupExpiredSessions ──

  describe('cleanupExpiredSessions', () => {
    it('should return rowCount of deleted sessions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });
      const count = await service.cleanupExpiredSessions();
      expect(count).toBe(3);
    });

    it('should return 0 on db error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('timeout'));
      const count = await service.cleanupExpiredSessions();
      expect(count).toBe(0);
    });
  });

  // ── createUserWithPassword ──

  describe('createUserWithPassword', () => {
    it('should hash password and insert user', async () => {
      const userRow = makeUser({ password_hash: '$hashed$password' });
      mockDb.query.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const user = await service.createUserWithPassword({
        email: 'pw@example.com',
        password: 'secret',
        name: 'Pw User',
      });

      expect(user.id).toBe('user-1');
      const params = mockDb.query.mock.calls[0][1];
      expect(params[2]).toBe('$hashed$password');
    });
  });

  // ── createVerificationToken ──

  describe('createVerificationToken', () => {
    it('should insert token and return hex string', async () => {
      await service.createVerificationToken('user-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_verification_tokens'),
        expect.arrayContaining(['user-1'])
      );
    });
  });

  // ── verifyEmail ──

  describe('verifyEmail', () => {
    it('should return false when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await service.verifyEmail('no-such-token');
      expect(result).toBe(false);
    });

    it('should return false when token is expired', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user-1', expires_at: new Date('2020-01-01') }],
        rowCount: 1,
      });
      const result = await service.verifyEmail('expired-token');
      expect(result).toBe(false);
    });

    it('should execute transaction on valid token', async () => {
      const future = new Date(Date.now() + 3600 * 1000);
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', expires_at: future }], rowCount: 1 });
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); // BEGIN, UPDATE x2, COMMIT

      const result = await service.verifyEmail('valid-token');
      expect(result).toBe(true);
      // Should have called BEGIN
      const queries = mockDb.query.mock.calls.map((c: any[]) => c[0]);
      expect(queries).toContain('BEGIN');
      expect(queries).toContain('COMMIT');
    });
  });

  // ── createPasswordResetToken ──

  describe('createPasswordResetToken', () => {
    it('should return null when email not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // findByEmail
      const token = await service.createPasswordResetToken('nobody@x.com');
      expect(token).toBeNull();
    });

    it('should insert token and return string for known email', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeUser()], rowCount: 1 }); // findByEmail
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT
      const token = await service.createPasswordResetToken('test@example.com');
      expect(typeof token).toBe('string');
    });
  });

  // ── resetPassword ──

  describe('resetPassword', () => {
    it('should return false when token not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await service.resetPassword('bad-token', 'new-pass');
      expect(result).toBe(false);
    });

    it('should return false when token is expired', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user-1', expires_at: new Date('2020-01-01') }],
        rowCount: 1,
      });
      const result = await service.resetPassword('expired-token', 'new-pass');
      expect(result).toBe(false);
    });

    it('should hash new password and execute transaction on valid token', async () => {
      const future = new Date(Date.now() + 3600 * 1000);
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1', expires_at: future }], rowCount: 1 });
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await service.resetPassword('valid-token', 'new-secure-pass');
      expect(result).toBe(true);
      const queries = mockDb.query.mock.calls.map((c: any[]) => c[0]);
      expect(queries).toContain('BEGIN');
    });
  });

  // ── recordFailedLogin ──

  describe('recordFailedLogin', () => {
    it('should execute UPDATE to increment failed_login_attempts', async () => {
      await service.recordFailedLogin('test@example.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts'),
        ['test@example.com']
      );
    });

    it('should not throw on db error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB error'));
      await expect(service.recordFailedLogin('test@example.com')).resolves.toBeUndefined();
    });
  });

  // ── resetFailedAttempts ──

  describe('resetFailedAttempts', () => {
    it('should reset failed attempts and locked_until', async () => {
      await service.resetFailedAttempts('user-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        ['user-1']
      );
    });
  });

  // ── isAccountLocked ──

  describe('isAccountLocked', () => {
    it('should return false when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await service.isAccountLocked('nobody@x.com')).toBe(false);
    });

    it('should return false when locked_until is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ locked_until: null }], rowCount: 1 });
      expect(await service.isAccountLocked('test@example.com')).toBe(false);
    });

    it('should return true when locked_until is in the future', async () => {
      const future = new Date(Date.now() + 15 * 60 * 1000);
      mockDb.query.mockResolvedValueOnce({ rows: [{ locked_until: future }], rowCount: 1 });
      expect(await service.isAccountLocked('test@example.com')).toBe(true);
    });

    it('should return false when locked_until is in the past', async () => {
      const past = new Date(Date.now() - 60 * 1000);
      mockDb.query.mockResolvedValueOnce({ rows: [{ locked_until: past }], rowCount: 1 });
      expect(await service.isAccountLocked('test@example.com')).toBe(false);
    });

    it('should return false on db error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('timeout'));
      expect(await service.isAccountLocked('test@example.com')).toBe(false);
    });
  });
});
