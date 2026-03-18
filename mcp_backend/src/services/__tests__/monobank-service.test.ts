/**
 * Monobank Service Tests
 *
 * Tests cover:
 * - createInvoice: invoice creation via Monobank API, kopeck conversion, payment_intent storage
 * - validateSignature: ECDSA P-256 signature verification via Monobank public key
 * - handleWebhook: webhook processing, signature check, balance credit, idempotency, email
 * - getPaymentStatus: status polling with kopeck→UAH conversion
 * - MockMonobankService: mock mode behaviour with balance crediting
 */

import crypto from 'crypto';
import { MonobankService, MonobankWebhookBody } from '../monobank-service';
import { MockMonobankService } from '../__mocks__/monobank-service-mock';

// ──────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────

const TEST_API_KEY = 'test_monobank_api_key_12345';

// Generate a test ECDSA P-256 key pair for signature tests
const testKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const testPubKeyDer = testKeyPair.publicKey.export({ format: 'der', type: 'spki' });
const testPubKeyBase64 = testPubKeyDer.toString('base64');

function makeEcdsaSignature(body: string | Buffer): string {
  const sign = crypto.createSign('SHA256');
  sign.update(typeof body === 'string' ? body : body);
  sign.end();
  return sign.sign(testKeyPair.privateKey, 'base64');
}

function makeBillingService(overrides: any = {}) {
  return {
    topUpBalance: jest.fn().mockResolvedValue({
      id: 'txn-001',
      balance_after_usd: 25.0,
    }),
    setTransactionInvoiceNumber: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeEmailService(overrides: any = {}) {
  return {
    sendPaymentSuccess: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDb(overrides: any = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  };
}

const PI_ROW = {
  id: 'pi-uuid-001',
  user_id: 'user-abc12345',
  amount_uah: '150.00',
  status: 'pending',
  metadata: JSON.stringify({ email: 'user@example.com', orderRef: 'SL-user-abc-1710000000' }),
};

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
      makeEmailService() as any,
      makeDb() as any
    );
    await expect(
      service.createInvoice('user-1', 100, 'Test payment')
    ).rejects.toThrow('MONOBANK_API_KEY is missing');
  });

  it('throws when MONOBANK_API_KEY is missing during getPaymentStatus', async () => {
    delete process.env.MONOBANK_API_KEY;
    const service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any,
      makeDb() as any
    );
    await expect(
      service.getPaymentStatus('inv-123')
    ).rejects.toThrow('MONOBANK_API_KEY is missing');
  });

  it('rejects amounts below 1 UAH', async () => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    const service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any,
      makeDb() as any
    );
    await expect(
      service.createInvoice('user-1', 0.5, 'Test')
    ).rejects.toThrow('Мінімальна сума поповнення');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — createInvoice
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — createInvoice', () => {
  let service: MonobankService;
  let db: ReturnType<typeof makeDb>;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    process.env.FRONTEND_URL = 'https://app.legal.org.ua';
    process.env.PUBLIC_URL = 'https://api.legal.org.ua';
    db = makeDb();
    db.query.mockResolvedValue({ rows: [{ id: 'pi-uuid-new' }] });
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any,
      db as any
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

  it('stores payment_intent in database', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-004', pageUrl: 'https://pay.mbnk.biz/inv-004' }),
    }) as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up', undefined, 'test@example.com');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payment_intents'),
      expect.arrayContaining(['user-abc12345', 'inv-004', 0, 100])
    );
  });

  it('returns invoiceId, pageUrl, and paymentIntentId', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-005', pageUrl: 'https://pay.mbnk.biz/inv-005' }),
    }) as any;

    const result = await service.createInvoice('user-abc12345', 200, 'Top-up');

    expect(result).toEqual({
      invoiceId: 'inv-005',
      pageUrl: 'https://pay.mbnk.biz/inv-005',
      paymentIntentId: 'pi-uuid-new',
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
      json: async () => ({ invoiceId: 'inv-006', pageUrl: 'https://pay.mbnk.biz/inv-006' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.validity).toBe(3600);
  });

  it('sets webhookUrl from PUBLIC_URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-007', pageUrl: 'https://pay.mbnk.biz/inv-007' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.webHookUrl).toBe('https://api.legal.org.ua/webhooks/monobank');
  });

  it('uses MONOBANK_REDIRECT_URL when set', async () => {
    process.env.MONOBANK_REDIRECT_URL = 'https://custom-redirect.com/done';
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-008', pageUrl: 'https://pay.mbnk.biz/inv-008' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.redirectUrl).toBe('https://custom-redirect.com/done/payment/success');
  });

  it('uses custom redirectUrl parameter when provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-009', pageUrl: 'https://pay.mbnk.biz/inv-009' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 100, 'Top-up', 'https://myapp.com/callback');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.redirectUrl).toBe('https://myapp.com/callback');
  });

  it('rounds kopecks correctly for fractional amounts', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invoiceId: 'inv-010', pageUrl: 'https://pay.mbnk.biz/inv-010' }),
    });
    global.fetch = mockFetch as any;

    await service.createInvoice('user-abc12345', 99.99, 'Top-up');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.amount).toBe(9999);
  });

  it('rejects amount equal to 0', async () => {
    await expect(
      service.createInvoice('user-1', 0, 'Test')
    ).rejects.toThrow('Мінімальна сума поповнення');
  });

  it('rejects negative amount', async () => {
    await expect(
      service.createInvoice('user-1', -10, 'Test')
    ).rejects.toThrow('Мінімальна сума поповнення');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — webhook signature validation (ECDSA)
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — webhook signature validation', () => {
  let service: MonobankService;
  let db: ReturnType<typeof makeDb>;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    db = makeDb();
    service = new MonobankService(
      makeBillingService() as any,
      makeEmailService() as any,
      db as any
    );
    // Mock the public key fetch to return our test key
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: testPubKeyBase64 }),
    }) as any;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('accepts a valid ECDSA signature', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-100', status: 'created', amount: 10000, ccy: 980 });
    const rawBody = Buffer.from(bodyStr);
    const signature = makeEcdsaSignature(rawBody);
    expect(await service.validateSignature(rawBody, signature)).toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-101', status: 'success', amount: 10000, ccy: 980 });
    const rawBody = Buffer.from(bodyStr);
    expect(await service.validateSignature(rawBody, 'invalid_signature_base64')).toBe(false);
  });

  it('rejects a tampered body with valid-looking signature', async () => {
    const originalBody = JSON.stringify({ invoiceId: 'inv-102', status: 'success', amount: 10000, ccy: 980 });
    const signature = makeEcdsaSignature(originalBody);
    const tamperedBody = JSON.stringify({ invoiceId: 'inv-102', status: 'success', amount: 99999, ccy: 980 });
    expect(await service.validateSignature(Buffer.from(tamperedBody), signature)).toBe(false);
  });

  it('handles string rawBody in signature validation', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-103', status: 'created', amount: 5000, ccy: 980 });
    const signature = makeEcdsaSignature(bodyStr);
    expect(await service.validateSignature(bodyStr, signature)).toBe(true);
  });

  it('caches public key and only fetches once', async () => {
    const bodyStr = JSON.stringify({ test: true });
    const sig = makeEcdsaSignature(bodyStr);

    await service.validateSignature(Buffer.from(bodyStr), sig);
    await service.validateSignature(Buffer.from(bodyStr), sig);

    // pubkey fetch should be called only once (cached)
    const fetchCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0]?.includes?.('pubkey')
    );
    expect(fetchCalls.length).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MonobankService — handleWebhook processing
// ──────────────────────────────────────────────────────────────────────────

describe('MonobankService — handleWebhook processing', () => {
  let service: MonobankService;
  let billing: ReturnType<typeof makeBillingService>;
  let email: ReturnType<typeof makeEmailService>;
  let db: ReturnType<typeof makeDb>;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.MONOBANK_API_KEY = TEST_API_KEY;
    billing = makeBillingService();
    email = makeEmailService();
    db = makeDb();
    service = new MonobankService(billing as any, email as any, db as any);
    // Mock the pubkey fetch for all webhook tests
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: testPubKeyBase64 }),
    }) as any;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    jest.restoreAllMocks();
  });

  it('rejects invalid signature', async () => {
    const bodyStr = JSON.stringify({ invoiceId: 'inv-200', status: 'success', amount: 10000, ccy: 980 });
    const parsed: MonobankWebhookBody = JSON.parse(bodyStr);

    await expect(
      service.handleWebhook(Buffer.from(bodyStr), parsed, 'bad_sig')
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('returns received:true for non-success statuses without crediting', async () => {
    const body = { invoiceId: 'inv-201', status: 'processing', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('updates status for terminal failure statuses', async () => {
    const body = { invoiceId: 'inv-fail', status: 'failure', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_intents SET status'),
      expect.arrayContaining(['failed', 'inv-fail', 'monobank'])
    );
  });

  it('credits balance on successful payment', async () => {
    const body = { invoiceId: 'inv-202', status: 'success', amount: 15000, ccy: 980, reference: 'SL-user-abc-1710000000' };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    // First query: find payment_intent
    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })  // SELECT
      .mockResolvedValueOnce({ rows: [] });         // UPDATE

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });

    // Should credit balance
    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PI_ROW.user_id,
        amountUah: 150.0,
        paymentProvider: 'monobank',
      })
    );

    // Should generate invoice number
    expect(billing.setTransactionInvoiceNumber).toHaveBeenCalled();
  });

  it('sends confirmation email on success', async () => {
    const body = { invoiceId: 'inv-203', status: 'success', amount: 15000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(email.sendPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        amount: 150.0,
        currency: 'UAH',
      })
    );
  });

  it('is idempotent — skips already-succeeded payments', async () => {
    const body = { invoiceId: 'inv-204', status: 'success', amount: 15000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query.mockResolvedValueOnce({ rows: [{ ...PI_ROW, status: 'succeeded' }] });

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('handles unknown invoiceId gracefully', async () => {
    const body = { invoiceId: 'unknown', status: 'success', amount: 10000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('skips email when no email in metadata', async () => {
    const piWithoutEmail = { ...PI_ROW, metadata: JSON.stringify({}) };
    const body = { invoiceId: 'inv-205', status: 'success', amount: 15000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query
      .mockResolvedValueOnce({ rows: [piWithoutEmail] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(email.sendPaymentSuccess).not.toHaveBeenCalled();
    expect(billing.topUpBalance).toHaveBeenCalled();
  });

  it('marks payment_intent as succeeded in DB', async () => {
    const body = { invoiceId: 'inv-206', status: 'success', amount: 15000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_intents SET status'),
      expect.arrayContaining(['succeeded', PI_ROW.id])
    );
  });

  it('updates status to "reversed" for reversed webhooks', async () => {
    const body = { invoiceId: 'inv-reversed', status: 'reversed', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_intents SET status'),
      expect.arrayContaining(['reversed', 'inv-reversed', 'monobank'])
    );
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('updates status to "expired" for expired webhooks', async () => {
    const body = { invoiceId: 'inv-expired', status: 'expired', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_intents SET status'),
      expect.arrayContaining(['expired', 'inv-expired', 'monobank'])
    );
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('does not update DB for non-terminal "hold" status', async () => {
    const body = { invoiceId: 'inv-hold', status: 'hold', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(db.query).not.toHaveBeenCalled();
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('does not update DB for "created" status', async () => {
    const body = { invoiceId: 'inv-created', status: 'created', amount: 5000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('continues processing even if email sending fails', async () => {
    email.sendPaymentSuccess.mockRejectedValueOnce(new Error('SMTP down'));
    const body = { invoiceId: 'inv-emailfail', status: 'success', amount: 15000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);
    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).toHaveBeenCalled();
    expect(billing.setTransactionInvoiceNumber).toHaveBeenCalled();
  });

  it('falls back to body.amount / 100 when pi.amount_uah is null', async () => {
    const piWithoutAmount = { ...PI_ROW, amount_uah: null };
    const body = { invoiceId: 'inv-fallback', status: 'success', amount: 20000, ccy: 980 };
    const bodyStr = JSON.stringify(body);
    const signature = makeEcdsaSignature(bodyStr);

    db.query
      .mockResolvedValueOnce({ rows: [piWithoutAmount] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(Buffer.from(bodyStr), body as MonobankWebhookBody, signature);

    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUah: 200, // 20000 / 100
      })
    );
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
      makeEmailService() as any,
      makeDb() as any
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
  let billing: ReturnType<typeof makeBillingService>;

  beforeEach(() => {
    billing = makeBillingService();
    mock = new MockMonobankService(
      billing as any,
      makeEmailService() as any
    );
  });

  it('createInvoice returns mock invoice with unique ID and paymentIntentId', async () => {
    const result = await mock.createInvoice('user-1', 100, 'Test payment');

    expect(result.invoiceId).toMatch(/^mock-mono-\d+-user-1$/);
    expect(result.pageUrl).toContain('mock=true');
    expect(result.paymentIntentId).toBe(result.invoiceId);
  });

  it('rejects amounts below 1 UAH', async () => {
    await expect(
      mock.createInvoice('user-1', 0.5, 'Test')
    ).rejects.toThrow('Мінімальна сума поповнення');
  });

  it('createInvoice generates different IDs for different users', async () => {
    const r1 = await mock.createInvoice('user-aaa', 100, 'Test');
    const r2 = await mock.createInvoice('user-bbb', 200, 'Test');

    expect(r1.invoiceId).not.toBe(r2.invoiceId);
  });

  it('handleWebhook credits balance on success', async () => {
    const { invoiceId } = await mock.createInvoice('user-1', 250, 'Test');
    const body: MonobankWebhookBody = { invoiceId, status: 'success', amount: 25000, ccy: 980 };
    await mock.handleWebhook(Buffer.from('{}'), body, 'any-signature');

    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', amountUah: 250 })
    );
  });

  it('handleWebhook is idempotent — no double credit', async () => {
    const { invoiceId } = await mock.createInvoice('user-1', 100, 'Test');
    const body: MonobankWebhookBody = { invoiceId, status: 'success', amount: 10000, ccy: 980 };

    await mock.handleWebhook(Buffer.from('{}'), body, 'sig');
    await mock.handleWebhook(Buffer.from('{}'), body, 'sig');

    expect(billing.topUpBalance).toHaveBeenCalledTimes(1);
  });

  it('getPaymentStatus returns pending after create, success after webhook', async () => {
    const { invoiceId } = await mock.createInvoice('user-1', 100, 'Test');

    const before = await mock.getPaymentStatus(invoiceId);
    expect(before.status).toBe('created');

    const body: MonobankWebhookBody = { invoiceId, status: 'success', amount: 10000, ccy: 980 };
    await mock.handleWebhook(Buffer.from('{}'), body, 'sig');

    const after = await mock.getPaymentStatus(invoiceId);
    expect(after.status).toBe('success');
    expect(after.amount).toBe(100);
  });

  it('simulatePaymentSuccess triggers balance top-up', async () => {
    const { invoiceId } = await mock.createInvoice('user-2', 500, 'Test');
    await mock.simulatePaymentSuccess(invoiceId);

    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', amountUah: 500 })
    );
  });

  it('simulatePaymentSuccess throws for unknown invoice', async () => {
    await expect(
      mock.simulatePaymentSuccess('fake-id')
    ).rejects.toThrow('Invoice not found');
  });
});
