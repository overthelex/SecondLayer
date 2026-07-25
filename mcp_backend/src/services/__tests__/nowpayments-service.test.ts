/**
 * NOWPayments Service Tests
 *
 * Tests cover:
 * - verifySignature: HMAC-SHA512 signature verification
 * - createInvoice: invoice creation via API, DB insert, validation
 * - handleWebhook: IPN processing, idempotency, balance crediting
 * - getPaymentStatus: DB lookup
 * - MockNOWPaymentsService: mock mode behaviour
 */

import crypto from 'crypto';
import { NOWPaymentsService } from '../nowpayments-service';
import { MockNOWPaymentsService } from '../__mocks__/nowpayments-service-mock';

// ──────────────────────────────────────────────────────────────────────────
// Shared test helpers
// ──────────────────────────────────────────────────────────────────────────

const IPN_SECRET = 'test_ipn_secret_key';

function makeSignedBody(payload: Record<string, any>): { rawBody: Buffer; signature: string } {
  const sorted = JSON.stringify(
    Object.keys(payload)
      .sort()
      .reduce((acc: Record<string, any>, k) => { acc[k] = payload[k]; return acc; }, {})
  );
  const signature = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex');
  return { rawBody: Buffer.from(JSON.stringify(payload)), signature };
}

// ──────────────────────────────────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────────────────────────────────

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
    query: jest.fn(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// NOWPaymentsService — constructor
// ──────────────────────────────────────────────────────────────────────────

describe('NOWPaymentsService — constructor', () => {
  const origEnv = process.env;

  afterEach(() => {
    process.env = origEnv;
  });

  it('throws when NOWPAYMENTS_API_KEY is missing', () => {
    process.env = { ...origEnv, NOWPAYMENTS_API_KEY: '', NOWPAYMENTS_IPN_SECRET: 'secret' };
    expect(() => new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, makeDb() as any))
      .toThrow('NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET are required');
  });

  it('throws when NOWPAYMENTS_IPN_SECRET is missing', () => {
    process.env = { ...origEnv, NOWPAYMENTS_API_KEY: 'key', NOWPAYMENTS_IPN_SECRET: '' };
    expect(() => new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, makeDb() as any))
      .toThrow('NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET are required');
  });

  it('constructs successfully when both env vars are set', () => {
    process.env = { ...origEnv, NOWPAYMENTS_API_KEY: 'key', NOWPAYMENTS_IPN_SECRET: 'secret' };
    expect(() => new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, makeDb() as any))
      .not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// NOWPaymentsService — verifySignature
// ──────────────────────────────────────────────────────────────────────────

describe('NOWPaymentsService — verifySignature', () => {
  let service: NOWPaymentsService;

  beforeEach(() => {
    process.env.NOWPAYMENTS_API_KEY = 'api_key';
    process.env.NOWPAYMENTS_IPN_SECRET = IPN_SECRET;
    service = new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, makeDb() as any);
  });

  it('returns true for a valid HMAC-SHA512 signature', () => {
    const payload = { invoice_id: '123', payment_status: 'finished', price_amount: 10 };
    const { rawBody, signature } = makeSignedBody(payload);
    expect(service.verifySignature(rawBody, signature)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const payload = { invoice_id: '123', payment_status: 'finished' };
    const { signature } = makeSignedBody(payload);
    const tamperedBody = Buffer.from(JSON.stringify({ invoice_id: '999', payment_status: 'finished' }));
    expect(service.verifySignature(tamperedBody, signature)).toBe(false);
  });

  it('returns false for wrong signature', () => {
    const payload = { invoice_id: '123', payment_status: 'finished' };
    const { rawBody } = makeSignedBody(payload);
    expect(service.verifySignature(rawBody, 'deadbeef')).toBe(false);
  });

  it('produces the same digest regardless of JSON key order', () => {
    // NOWPayments may send keys in arbitrary order; service sorts before hashing
    const payloadAB = { a: 1, b: 2 };
    const payloadBA = { b: 2, a: 1 };
    const { signature: sigAB } = makeSignedBody(payloadAB);
    const bodyBA = Buffer.from(JSON.stringify(payloadBA));
    // bodyBA is {b,a} order but service will sort it, so it should match sigAB
    expect(service.verifySignature(bodyBA, sigAB)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// NOWPaymentsService — createInvoice
// ──────────────────────────────────────────────────────────────────────────

describe('NOWPaymentsService — createInvoice', () => {
  let service: NOWPaymentsService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    process.env.NOWPAYMENTS_API_KEY = 'api_key';
    process.env.NOWPAYMENTS_IPN_SECRET = IPN_SECRET;
    db = makeDb();
    service = new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, db as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects amounts below $1.00', async () => {
    await expect(service.createInvoice('user-1', 0.5, 'a@b.com')).rejects.toThrow(
      'Minimum top-up amount is $1.00'
    );
  });

  it('calls NOWPayments API and inserts payment_intent', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'np-456', invoice_url: 'https://nowpayments.io/pay/np-456' }),
    });
    global.fetch = mockFetch as any;

    db.query.mockResolvedValue({ rows: [{ id: 'pi-uuid-001' }] });

    const result = await service.createInvoice('user-abc123', 10, 'user@example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.nowpayments.io/v1/invoice',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'api_key' }),
      })
    );

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO payment_intents"),
      expect.arrayContaining(['user-abc123', 'np-456', 10])
    );

    expect(result).toMatchObject({
      invoiceId: 'np-456',
      paymentIntentId: 'pi-uuid-001',
      invoiceUrl: 'https://nowpayments.io/pay/np-456',
      amountUsd: 10,
    });
  });

  it('throws when NOWPayments API returns an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Unauthorized' }),
    }) as any;

    await expect(service.createInvoice('user-1', 10, 'a@b.com')).rejects.toThrow(
      'NOWPayments error: Unauthorized'
    );
  });

  it('throws when API response has no id field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ something: 'else' }),
    }) as any;

    await expect(service.createInvoice('user-1', 10, 'a@b.com')).rejects.toThrow(
      'NOWPayments error'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// NOWPaymentsService — handleWebhook
// ──────────────────────────────────────────────────────────────────────────

describe('NOWPaymentsService — handleWebhook', () => {
  let service: NOWPaymentsService;
  let billing: ReturnType<typeof makeBillingService>;
  let email: ReturnType<typeof makeEmailService>;
  let db: ReturnType<typeof makeDb>;

  const PI_ROW = {
    id: 'pi-uuid-001',
    user_id: 'user-abc',
    amount_usd: '15.00',
    status: 'pending',
    metadata: JSON.stringify({ email: 'user@example.com', orderRef: 'SL-1234' }),
  };

  beforeEach(() => {
    process.env.NOWPAYMENTS_API_KEY = 'api_key';
    process.env.NOWPAYMENTS_IPN_SECRET = IPN_SECRET;
    billing = makeBillingService();
    email = makeEmailService();
    db = makeDb();
    service = new NOWPaymentsService(billing as any, email as any, db as any);
  });

  it('throws on invalid signature', async () => {
    const { rawBody } = makeSignedBody({ invoice_id: '123', payment_status: 'finished' });
    await expect(service.handleWebhook(rawBody, 'bad_sig')).rejects.toThrow(
      'Invalid NOWPayments IPN signature'
    );
  });

  it('returns received:true without processing for non-terminal status', async () => {
    const payload = { invoice_id: '123', payment_status: 'waiting' };
    const { rawBody, signature } = makeSignedBody(payload);

    const result = await service.handleWebhook(rawBody, signature);

    expect(result).toEqual({ received: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('processes finished payment: updates DB and credits balance', async () => {
    const payload = { invoice_id: 'np-456', payment_status: 'finished', payment_id: 'pay-789' };
    const { rawBody, signature } = makeSignedBody(payload);

    // First query: find payment intent
    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })  // SELECT payment_intents
      .mockResolvedValueOnce({ rows: [] });          // UPDATE payment_intents

    const result = await service.handleWebhook(rawBody, signature);

    expect(result).toEqual({ received: true });

    // Should have updated status
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_intents SET status'),
      expect.arrayContaining(['succeeded', PI_ROW.id])
    );

    // Should have credited balance
    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PI_ROW.user_id,
        amountUsd: 15.0,
        paymentProvider: 'nowpayments',
      })
    );
  });

  it('sends confirmation email after successful payment', async () => {
    const payload = { invoice_id: 'np-456', payment_status: 'confirmed', payment_id: 'pay-789' };
    const { rawBody, signature } = makeSignedBody(payload);

    db.query
      .mockResolvedValueOnce({ rows: [PI_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(rawBody, signature);

    expect(email.sendPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', amount: 15.0, currency: 'USD' })
    );
  });

  it('is idempotent — skips already-succeeded payments', async () => {
    const payload = { invoice_id: 'np-456', payment_status: 'finished' };
    const { rawBody, signature } = makeSignedBody(payload);

    db.query.mockResolvedValueOnce({ rows: [{ ...PI_ROW, status: 'succeeded' }] });

    const result = await service.handleWebhook(rawBody, signature);

    expect(result).toEqual({ received: true });
    // Should NOT update or credit again
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('returns received:true gracefully when payment_intent not found', async () => {
    const payload = { invoice_id: 'unknown', payment_status: 'finished' };
    const { rawBody, signature } = makeSignedBody(payload);

    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.handleWebhook(rawBody, signature);

    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('skips email when no email in metadata', async () => {
    const piWithoutEmail = { ...PI_ROW, metadata: JSON.stringify({}) };
    const payload = { invoice_id: 'np-456', payment_status: 'finished' };
    const { rawBody, signature } = makeSignedBody(payload);

    db.query
      .mockResolvedValueOnce({ rows: [piWithoutEmail] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(rawBody, signature);

    expect(email.sendPaymentSuccess).not.toHaveBeenCalled();
    expect(billing.topUpBalance).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// NOWPaymentsService — getPaymentStatus
// ──────────────────────────────────────────────────────────────────────────

describe('NOWPaymentsService — getPaymentStatus', () => {
  let service: NOWPaymentsService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    process.env.NOWPAYMENTS_API_KEY = 'api_key';
    process.env.NOWPAYMENTS_IPN_SECRET = IPN_SECRET;
    db = makeDb();
    service = new NOWPaymentsService(makeBillingService() as any, makeEmailService() as any, db as any);
  });

  it('returns status and amount for a known payment intent', async () => {
    db.query.mockResolvedValue({ rows: [{ status: 'succeeded', amount_usd: '20.00' }] });

    const result = await service.getPaymentStatus('pi-uuid-001');

    expect(result).toEqual({ status: 'succeeded', amount: 20.0, currency: 'usd' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT status'),
      ['pi-uuid-001', 'nowpayments']
    );
  });

  it('throws when payment intent is not found', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(service.getPaymentStatus('unknown-id')).rejects.toThrow(
      'Payment intent not found'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// MockNOWPaymentsService
// ──────────────────────────────────────────────────────────────────────────

describe('MockNOWPaymentsService', () => {
  let mock: MockNOWPaymentsService;
  let billing: ReturnType<typeof makeBillingService>;
  let email: ReturnType<typeof makeEmailService>;

  beforeEach(() => {
    billing = makeBillingService();
    email = makeEmailService();
    mock = new MockNOWPaymentsService(billing as any, email as any);
  });

  it('createInvoice returns a mock invoice with unique ID', async () => {
    const result = await mock.createInvoice('user-1', 5, 'a@b.com');

    expect(result.invoiceId).toMatch(/^np_mock_/);
    expect(result.paymentIntentId).toBe(result.invoiceId);
    expect(result.amountUsd).toBe(5);
    expect(result.invoiceUrl).toContain(result.invoiceId);
  });

  it('createInvoice rejects amounts below $1', async () => {
    await expect(mock.createInvoice('user-1', 0.5, 'a@b.com')).rejects.toThrow(
      'Minimum top-up amount is $1.00'
    );
  });

  it('verifySignature always returns true in mock mode', () => {
    expect(mock.verifySignature(Buffer.from('anything'), 'wrong_sig')).toBe(true);
  });

  it('handleWebhook credits balance on finished payment', async () => {
    const { invoiceId } = await mock.createInvoice('user-1', 10, 'a@b.com');

    const rawBody = Buffer.from(JSON.stringify({ invoice_id: invoiceId, payment_status: 'finished' }));
    await mock.handleWebhook(rawBody, 'sig');

    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', amountUsd: 10 })
    );
  });

  it('handleWebhook is idempotent — does not double-credit', async () => {
    const { invoiceId } = await mock.createInvoice('user-1', 10, 'a@b.com');
    const rawBody = Buffer.from(JSON.stringify({ invoice_id: invoiceId, payment_status: 'finished' }));

    await mock.handleWebhook(rawBody, 'sig');
    await mock.handleWebhook(rawBody, 'sig');

    expect(billing.topUpBalance).toHaveBeenCalledTimes(1);
  });

  it('handleWebhook handles unknown invoice_id gracefully', async () => {
    const rawBody = Buffer.from(JSON.stringify({ invoice_id: 'unknown', payment_status: 'finished' }));
    const result = await mock.handleWebhook(rawBody, 'sig');
    expect(result).toEqual({ received: true });
    expect(billing.topUpBalance).not.toHaveBeenCalled();
  });

  it('getPaymentStatus returns pending after create, succeeded after webhook', async () => {
    const { paymentIntentId } = await mock.createInvoice('user-1', 7, 'a@b.com');

    const before = await mock.getPaymentStatus(paymentIntentId);
    expect(before.status).toBe('pending');

    const rawBody = Buffer.from(JSON.stringify({ invoice_id: paymentIntentId, payment_status: 'finished' }));
    await mock.handleWebhook(rawBody, 'sig');

    const after = await mock.getPaymentStatus(paymentIntentId);
    expect(after.status).toBe('succeeded');
    expect(after.amount).toBe(7);
    expect(after.currency).toBe('usd');
  });

  it('getPaymentStatus throws for unknown payment intent', async () => {
    await expect(mock.getPaymentStatus('np_mock_nonexistent')).rejects.toThrow(
      'Payment intent not found'
    );
  });

  it('simulatePaymentSuccess triggers balance top-up', async () => {
    const { invoiceId } = await mock.createInvoice('user-2', 20, 'b@c.com');

    await mock.simulatePaymentSuccess(invoiceId);

    expect(billing.topUpBalance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', amountUsd: 20 })
    );
  });

  it('simulatePaymentSuccess throws for unknown invoice', async () => {
    await expect(mock.simulatePaymentSuccess('np_mock_fake')).rejects.toThrow(
      'Invoice not found'
    );
  });
});
