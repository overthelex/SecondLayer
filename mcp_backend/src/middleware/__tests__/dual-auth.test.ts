import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  dualAuth,
  requireJWT,
  requireAPIKey,
  optionalJWT,
  initializeDualAuth,
  getUserService,
  AuthenticatedRequest,
} from '../dual-auth.js';

// Mock dependencies
jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/sanitize-log.js', () => ({
  maskSensitive: (val: string, len: number) => val.substring(0, len) + '...',
}));

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
};

const mockUserService = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByGoogleId: jest.fn(),
  createUser: jest.fn(),
  updateLastLogin: jest.fn(),
};

const mockApiKeyService = {
  validateApiKey: jest.fn(),
  createApiKey: jest.fn(),
  listApiKeys: jest.fn(),
  revokeApiKey: jest.fn(),
};

function createMockReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return {
    headers,
    ip: '127.0.0.1',
    path: '/api/test',
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('dual-auth middleware', () => {
  const next: NextFunction = jest.fn();
  const originalKeys = process.env.SECONDARY_LAYER_KEYS;

  beforeAll(() => {
    initializeDualAuth(mockUserService as any, mockApiKeyService as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECONDARY_LAYER_KEYS = 'legacy-key-1,legacy-key-2';
    mockUserService.findById.mockResolvedValue(mockUser);
    mockApiKeyService.validateApiKey.mockResolvedValue(null); // default: not a Phase 2 key
  });

  afterAll(() => {
    process.env.SECONDARY_LAYER_KEYS = originalKeys;
  });

  describe('dualAuth', () => {
    test('should return 401 when no Authorization header', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for non-Bearer Authorization', async () => {
      const req = createMockReq({ authorization: 'Basic abc' });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should authenticate with valid JWT token', async () => {
      const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(req.authType).toBe('jwt');
    });

    test('should authenticate with legacy API key (no dots)', async () => {
      const req = createMockReq({ authorization: 'Bearer legacy-key-1' });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.clientKey).toBe('legacy-key-1');
      expect(req.authType).toBe('apikey');
    });

    test('should return 401 for invalid API key', async () => {
      const req = createMockReq({ authorization: 'Bearer invalid-key' });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should authenticate with Phase 2 API key from database', async () => {
      mockApiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-1',
        userId: 'user-123',
        name: 'test-key',
      });

      const req = createMockReq({ authorization: 'Bearer phase2-api-key' });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(req.authType).toBe('apikey');
    });

    test('should return 401 for expired JWT', async () => {
      const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' });
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when JWT user not found in DB', async () => {
      mockUserService.findById.mockResolvedValue(null);
      const token = jwt.sign({ userId: 'nonexistent' }, JWT_SECRET, { expiresIn: '1h' });
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await dualAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireJWT', () => {
    test('should return 401 without auth header', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await requireJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should reject API keys (no dots in token)', async () => {
      const req = createMockReq({ authorization: 'Bearer legacy-key-1' });
      const res = createMockRes();

      await requireJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('API keys are not accepted') })
      );
    });

    test('should accept valid JWT', async () => {
      const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await requireJWT(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });
  });

  describe('requireAPIKey', () => {
    test('should return 401 without auth header', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await requireAPIKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should reject JWT tokens (dots in token)', async () => {
      const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET);
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await requireAPIKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('JWT tokens are not accepted') })
      );
    });

    test('should accept valid legacy API key', async () => {
      const req = createMockReq({ authorization: 'Bearer legacy-key-1' });
      const res = createMockRes();

      await requireAPIKey(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.clientKey).toBe('legacy-key-1');
    });
  });

  describe('optionalJWT', () => {
    test('should call next without auth header', async () => {
      const req = createMockReq();
      const res = createMockRes();

      await optionalJWT(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    test('should attach user for valid JWT', async () => {
      const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
      const req = createMockReq({ authorization: `Bearer ${token}` });
      const res = createMockRes();

      await optionalJWT(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
    });

    test('should call next even with invalid JWT (silent failure)', async () => {
      const req = createMockReq({ authorization: 'Bearer invalid.jwt.token' });
      const res = createMockRes();

      await optionalJWT(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    test('should ignore non-JWT tokens (API keys without dots)', async () => {
      const req = createMockReq({ authorization: 'Bearer some-api-key' });
      const res = createMockRes();

      await optionalJWT(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });

  describe('getUserService', () => {
    test('should return initialized UserService', () => {
      const svc = getUserService();
      expect(svc).toBe(mockUserService);
    });
  });
});
