import { Request, Response, NextFunction } from 'express';
import { authenticateClient, AuthenticatedRequest } from '../auth.js';

// Mock logger
jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function createMockReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return {
    headers,
    ip: '127.0.0.1',
    path: '/api/tools/test',
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticateClient middleware', () => {
  const next: NextFunction = jest.fn();
  const originalEnv = process.env.SECONDARY_LAYER_KEYS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECONDARY_LAYER_KEYS = 'test-key-1,test-key-2';
  });

  afterAll(() => {
    process.env.SECONDARY_LAYER_KEYS = originalEnv;
  });

  test('should return 401 when Authorization header is missing', () => {
    const req = createMockReq();
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when Authorization header does not start with Bearer', () => {
    const req = createMockReq({ authorization: 'Basic some-token' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 when SECONDARY_LAYER_KEYS is not configured', () => {
    delete process.env.SECONDARY_LAYER_KEYS;
    const req = createMockReq({ authorization: 'Bearer some-key' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Server configuration error' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 when SECONDARY_LAYER_KEYS is empty string', () => {
    process.env.SECONDARY_LAYER_KEYS = '';
    const req = createMockReq({ authorization: 'Bearer some-key' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when provided key is not in valid keys', () => {
    const req = createMockReq({ authorization: 'Bearer invalid-key' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid SECONDARY_LAYER_KEY' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() and attach clientKey for valid key', () => {
    const req = createMockReq({ authorization: 'Bearer test-key-1' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.clientKey).toBe('test-key-1');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should accept second key from comma-separated list', () => {
    const req = createMockReq({ authorization: 'Bearer test-key-2' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.clientKey).toBe('test-key-2');
  });

  test('should trim whitespace from keys', () => {
    process.env.SECONDARY_LAYER_KEYS = ' test-key-1 , test-key-2 ';
    const req = createMockReq({ authorization: 'Bearer test-key-1' });
    const res = createMockRes();

    authenticateClient(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
