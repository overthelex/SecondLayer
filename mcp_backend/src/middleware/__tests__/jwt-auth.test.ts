import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT, AuthenticatedRequest } from '../jwt-auth.js';

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const JWT_SECRET = 'test-jwt-secret';

function createMockReq(headers: Record<string, string> = {}, path = '/api/test'): AuthenticatedRequest {
  return {
    headers,
    ip: '127.0.0.1',
    path,
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticateJWT middleware', () => {
  const next: NextFunction = jest.fn();
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalEnv;
  });

  test('should skip auth for /health endpoint', () => {
    const req = createMockReq({}, '/health');
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 when Authorization header is missing', () => {
    const req = createMockReq();
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when Authorization header format is invalid', () => {
    const req = createMockReq({ authorization: 'Basic some-token' });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    const token = jwt.sign({ sub: 'user-1' }, 'any-secret');
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Server configuration error' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 for invalid JWT token', () => {
    const req = createMockReq({ authorization: 'Bearer invalid.token.here' });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid token' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 for expired JWT token', () => {
    const token = jwt.sign({ sub: 'user-1' }, JWT_SECRET, { expiresIn: '-1s' });
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Token has expired' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should authenticate and attach JWT payload for valid token', () => {
    const payload = { sub: 'user-123' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwt).toBeDefined();
    expect(req.jwt!.sub).toBe('user-123');
    expect(req.clientId).toBe('user-123');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 for token signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret');
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
