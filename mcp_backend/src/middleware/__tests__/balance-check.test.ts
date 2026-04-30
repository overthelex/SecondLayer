import { Response, NextFunction } from 'express';
import { createBalanceCheckMiddleware } from '../balance-check.js';
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
    path: '/api/tools/test',
    params: { toolName: 'search_court_sessions' },
    body: { query: 'test' },
    authType: 'jwt',
    user: { id: 'user-123', email: 'test@example.com' },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const mockBillingService = {
  getOrCreateUserBilling: jest.fn(),
  checkBalance: jest.fn(),
  getDailyRequestCount: jest.fn(),
  checkLimits: jest.fn(),
};

const mockCostTracker = {
  estimateCost: jest.fn(),
};

describe('createBalanceCheckMiddleware', () => {
  const next: NextFunction = jest.fn();
  let middleware: ReturnType<typeof createBalanceCheckMiddleware>;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = createBalanceCheckMiddleware(mockBillingService as any, mockCostTracker as any);

    mockBillingService.getOrCreateUserBilling.mockResolvedValue({
      userId: 'user-123',
      billing_enabled: true,
      balance_usd: 10,
    });
    mockCostTracker.estimateCost.mockResolvedValue({
      total_estimated_cost_usd: 0.05,
    });
    mockBillingService.checkBalance.mockResolvedValue({
      hasBalance: true,
      currentBalance: 10,
    });
    mockBillingService.checkLimits.mockResolvedValue({
      withinLimits: true,
    });
  });

  test('should skip balance check for legacy API key (no user_id)', async () => {
    const req = createMockReq({ authType: 'apikey', user: undefined } as any);
    const res = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockBillingService.getOrCreateUserBilling).not.toHaveBeenCalled();
  });

  test('should check balance for Phase 2 API key (has user_id)', async () => {
    const req = createMockReq({
      authType: 'apikey',
      user: { id: 'user-456', email: 'apikey-user@example.com' },
    } as any);
    const res = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockBillingService.getOrCreateUserBilling).toHaveBeenCalled();
  });

  test('should return 402 for Phase 2 API key with $0 balance', async () => {
    mockBillingService.checkBalance.mockResolvedValue({
      hasBalance: false,
      currentBalance: 0,
    });

    const req = createMockReq({
      authType: 'apikey',
      user: { id: 'user-456', email: 'apikey-user@example.com' },
    } as any);
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when no user in request', async () => {
    const req = createMockReq({ user: undefined } as any);
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_USER_CONTEXT' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should skip when billing is disabled for user', async () => {
    mockBillingService.getOrCreateUserBilling.mockResolvedValue({
      billing_enabled: false,
    });
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should proceed when user has sufficient balance', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 402 when insufficient balance', async () => {
    mockBillingService.checkBalance.mockResolvedValue({
      hasBalance: false,
      currentBalance: 0,
    });

    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should check balance for all tools including previously free ones', async () => {
    const previouslyFreeTools = [
      'list_documents', 'get_document', 'get_document_sections',
      'list_conversations', 'get_conversation',
      'get_legislation_structure',
      'get_legislation_articles', 'get_legislation_section',
    ];

    for (const toolName of previouslyFreeTools) {
      jest.clearAllMocks();
      mockBillingService.getOrCreateUserBilling.mockResolvedValue({
        userId: 'user-123',
        billing_enabled: true,
        balance_usd: 10,
      });
      mockCostTracker.estimateCost.mockResolvedValue({
        total_estimated_cost_usd: 0.05,
      });
      mockBillingService.checkBalance.mockResolvedValue({
        hasBalance: true,
        currentBalance: 10,
      });
      mockBillingService.checkLimits.mockResolvedValue({
        withinLimits: true,
      });

      const req = createMockReq({ params: { toolName } } as any);
      const res = createMockRes();

      await middleware(req, res, next);

      expect(mockBillingService.getOrCreateUserBilling).toHaveBeenCalled();
    }
  });

  test('should return 429 when daily limit exceeded', async () => {
    mockBillingService.checkLimits.mockResolvedValue({
      withinLimits: false,
      reason: 'Daily limit exceeded',
      dailySpent: 50,
      dailyLimit: 50,
    });

    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DAILY_LIMIT_EXCEEDED' })
    );
  });

  test('should return 429 when monthly limit exceeded', async () => {
    mockBillingService.checkLimits.mockResolvedValue({
      withinLimits: false,
      reason: 'Monthly limit exceeded',
      monthlySpent: 1000,
      monthlyLimit: 1000,
    });

    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MONTHLY_LIMIT_EXCEEDED' })
    );
  });

  test('should fail closed on middleware errors for authenticated users', async () => {
    mockBillingService.getOrCreateUserBilling.mockRejectedValue(new Error('DB connection failed'));

    const req = createMockReq();
    const res = createMockRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BILLING_UNAVAILABLE' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
