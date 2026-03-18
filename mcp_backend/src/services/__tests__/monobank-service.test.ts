/**
 * Monobank Service Tests
 *
 * Tests cover:
 * - createInvoice: invoice creation via Monobank API, kopeck conversion
 * - validateSignature: HMAC-SHA256 signature verification
 * - handleWebhook: webhook processing, signature check, success handling
 * - getPaymentStatus: status polling with kopeck→UAH conversion
 * - MockMonobankService: mock mode behaviour
 */

import crypto from 'crypto';
import { MonobankService, MonobankWebhookBody } from '../monobank-service';
import { MockMonobankService } from '../__mocks__/monobank-service-mock';

// ──────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────

const TEST_API_KEY = 'test_monobank_api_key_12345';

function makeSignature(body: string | Buffer): string {
  return crypto
    .createHmac('sha256', TEST_API_KEY)
    .update(typeof body === 'string' ? body : body)
    .digest('base64');
}

function makeBillingService(overrides: any = {}) {
  return {
    topUpBalance: jest.fn().mockResolvedValue({
      id: 'txn-001',
      balance_after_usd: 25.0,
    }),
    ...overrides,
  };
}

function makeEmailService(overrides: any = {}) {
  return {
    sendPaymentSuccess: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — configuration
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — configuration', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('throws when MONOBANK_API_KEY is missing during createInvoice', async () => {
    delete process.env.MONOBANK_API_KEY;
    const service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
    await expect(
      service.createInvoice('user-1', 100, 'Test payment')
    ).rejects.toThrow('MONOBANK_API_KEY is missing');
  });

  it('throws when MONOBANK_API_KEY is missing during getPaymentStatus', async () => {
    delete process.env.MONOBANK_API_KEY;
    const service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
    await expect(
      service.getPaymentStatus('inv-123')
    ).rejects.toThrow('MONOBANK_API_KEY is missing');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — createInvoice
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — createInvoice', () => {
  let service: MonobankService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    process.env.FRONTEND_URL = 'https://app.legal.org.ua';
    process.env.PUBLIC_URL = 'https://api.legal.org.ua';
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
  });

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('converts UAH to kopecks correctly', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-001', pageUrl: 'https://pay.mbnk.biz/inv-001' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 150.50, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.amount).toBe(15050); // 150.50 * 100
    expect(callBody.ccy).toBe(980); // UAH
  });

  it('sends correct headers with X-Token', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-002', pageUrl: 'https://pay.mbnk.biz/inv-002' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    expect(mockFetch.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({
        'X-Token': TEST_API_KEY,
        'Content-Type': 'application/json',
      })
    );
  });

  it('generates correct reference format SL-{userId}-{timestamp}', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-003', pageUrl: 'https://pay.mbnk.biz/inv-003' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345-long-id', 50, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.merchantPaymInfo.reference).toMatch(/^SL-user-abc-\d+$/);
  });

  it('sets webhookUrl from PUBLIC_URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-004', pageUrl: 'https://pay.mbnk.biz/inv-004' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.webHookUrl).toBe('https://api.legal.org.ua/webhooks/monobank');
  });

  it('uses custom redirect_url when provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-005', pageUrl: 'https://pay.mbnk.biz/inv-005' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up', 'https://custom.redirect/done');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.redirectUrl).toBe('https://custom.redirect/done');
  });

  it('uses default redirect_url from FRONTEND_URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-006', pageUrl: 'https://pay.mbnk.biz/inv-006' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.redirectUrl).toBe('https://app.legal.org.ua/payment/success');
  });

  it('returns invoiceId and pageUrl from API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-007', pageUrl: 'https://pay.mbnk.biz/inv-007' }),
    }) as any;

    const result = await service.createInvoice('user-abc12345', 200, 'Top-up');

    expect(result).toEqual({
      invoiceId: 'inv-007',
      pageUrl: 'https://pay.mbnk.biz/inv-007',
    });
  });

  it('throws on Monobank API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"errCode":"FORBIDDEN"}',
    }) as any;

    await expect(
      service.createInvoice('user-abc12345', 100, 'Top-up')
    ).rejects.toThrow('Monobank API error: 403');
  });

  it('sets validity to 3600 seconds (1 hour)', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-008', pageUrl: 'https://pay.mbnk.biz/inv-008' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.validity).toBe(3600);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — validateSignature (via handleWebhook)
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — webhook signature validation', () => {
  let service: MonobankService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('accepts a valid HMAC-SHA256 signature', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-100', status: 'success', amount: 10000, ccy: 980 });
    const rawBody = Buffer.from(bodyStr);
    const signature = makeSignature(rawBody);
    const parsed: MonobankWebhookBody = JSON.parse(bodyStr);

    const result = await service.handleWebhook(rawBody, parsed, signature);
    expect(result).toEqual({ received: true });
  });

  it('rejects an invalid signature', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-101', status: 'success', amount: 10000, ccy: 980 });
    const rawBody = Buffer.from(bodyStr);
    const parsed: MonobankWebhookBody = JSON.parse(bodyStr);

    await expect(
      service.handleWebhook(rawBody, parsed, 'invalid_signature_base64')
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('rejects a tampered body with valid-looking signature', async () => {
    const originalBody = JSON.stringify({ invoiceId: 'inv-102', status: 'success', amount: 10000, ccy: 980 });
    const signature = makeSignature(originalBody);

    const tamperedBody = JSON.stringify({ invoiceId: 'inv-102', status: 'success', amount: 99999, ccy: 980 });
    const parsed: MonobankWebhookBody = JSON.parse(tamperedBody);

    await expect(
      service.handleWebhook(Buffer.from(tamperedBody), parsed, signature)
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('handles string rawBody in signature validation', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-103', status: 'created', amount: 5000, ccy: 980 });
    const signature = makeSignature(bodyStr);
    const parsed: MonobankWebhookBody = JSON.parse(bodyStr);

    const result = await service.handleWebhook(bodyStr, parsed, signature);
    expect(result).toEqual({ received: true });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — handleWebhook processing
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — handleWebhook processing', () => {
  let service: MonobankService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns received:true for successful payment with reference', async () => {
    const body = { invoiceId: 'inv-200', status: 'success', amount: 15000, ccy: 980, reference: 'SL-user1234-1710000000' };
    const bodyStr = JSON.stringify(body);
    const rawBody = Buffer.from(bodyStr);
    const signature = makeSignature(rawBody);

    const result = await service.handleWebhook(rawBody, body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
  });

  it('returns received:true for non-success statuses', async () => {
    const body = { invoiceId: 'inv-201', status: 'processing', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const rawBody = Buffer.from(bodyStr);
    const signature = makeSignature(rawBody);

    const result = await service.handleWebhook(rawBody, body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
  });

  it('extracts user prefix from reference on success', async () => {
    const body = { invoiceId: 'inv-202', status: 'success', amount: 20000, ccy: 980, reference: 'SL-abcdef12-1710000000' };
    const bodyStr = JSON.stringify(body);
    const rawBody = Buffer.from(bodyStr);
    const signature = makeSignature(rawBody);

    // Should not throw — logs the user prefix
    const result = await service.handleWebhook(rawBody, body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — getPaymentStatus
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — getPaymentStatus', () => {
  let service: MonobankService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
  });

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('converts kopecks to UAH in response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', amount: 15050 }),
    }) as any;

    const result = await service.getPaymentStatus('inv-300');

    expect(result).toEqual({
      status: 'success',
      amount: 150.50,
      currency: 'UAH',
      invoiceId: 'inv-300',
    });
  });

  it('sends X-Token header and correct URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'created', amount: 0 }),
    });
    global.fetch = mockFetch as any;

    await service.getPaymentStatus('inv-301');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('invoiceId=inv-301'),
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Token': TEST_API_KEY },
      })
    );
  });

  it('throws on Monobank API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    }) as any;

    await expect(
      service.getPaymentStatus('inv-999')
    ).rejects.toThrow('Monobank API error: 404');
  });

  it('returns all status types correctly', async () => {
    const statuses = ['created', 'processing', 'hold', 'success', 'failure', 'reversed', 'expired'] as const;

    for (const status of statuses) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status, amount: 10000 }),
      }) as any;

      const result = await service.getPaymentStatus(`inv-${status}`);
      expect(result.status).toBe(status);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MockMonobankService
// ──────────────────────────────────────────────────────────────────────────

describe('MockMonobankService', () => {
  let mock: MockMonobankService;

  beforeEach(() => {
    mock = new MockMonobankService(
      makeBillingService() as any,
      makeEmailService() as any
    );
  });

  it('createInvoice returns mock invoice with unique ID', async () => {
    const result = await mock.createInvoice('user-1', 100, 'Test payment');

    expect(result.invoiceId).toMatch(/^mock-mono-\d+-user-1$/);
    expect(result.pageUrl).toContain('mock=true');
    expect(result.pageUrl).toContain(result.invoiceId);
  });

  it('createInvoice generates different IDs for different users', async () => {
    const r1 = await mock.createInvoice('user-aaa', 100, 'Test');
    const r2 = await mock.createInvoice('user-bbb', 200, 'Test');

    expect(r1.invoiceId).not.toBe(r2.invoiceId);
  });

  it('handleWebhook always returns received:true (skips signature)', async () => {
    const body: MonobankWebhookBody = { invoiceId: 'mock-inv', status: 'success', amount: 10000, ccy: 980 };
    const result = await mock.handleWebhook(Buffer.from('{}'), body, 'any-signature');

    expect(result).toEqual({ received: true });
  });

  it('getPaymentStatus returns success with zero amount', async () => {
    const result = await mock.getPaymentStatus('mock-inv-123');

    expect(result).toEqual({
      status: 'success',
      amount: 0,
      currency: 'UAH',
      invoiceId: 'mock-inv-123',
    });
  });
});
