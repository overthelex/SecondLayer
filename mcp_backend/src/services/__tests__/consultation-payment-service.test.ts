/**
 * ConsultationPaymentService Tests
 *
 * Tests cover the full escrow lifecycle:
 * - createPayment: validation, fee calculation, DB insert
 * - initiatePayment: Monobank invoice creation, status transition pending → processing
 * - handleWebhook: escrow hold on success, refund on failure
 * - releasePayment: escrow release after consultation completion
 * - refundPayment: escrow refund on cancellation
 * - getPaymentByConsultation: retrieval
 * - idempotency and edge cases
 */

import { ConsultationPaymentService, ConsultationPayment } from '../consultation-payment-service';

// ──────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────

const CONSULTATION_ID = 'consult-uuid-001';
const PAYER_USER_ID = 'user-payer-001';
const ATTORNEY_USER_ID = 'user-attorney-001';
const PAYMENT_ID = 'payment-uuid-001';
const INVOICE_ID = 'mono-inv-001';

function makeConsultationRow(overrides: any = {}) {
  return {
    id: CONSULTATION_ID,
    client_user_id: PAYER_USER_ID,
    attorney_user_id: ATTORNEY_USER_ID,
    status: 'accepted',
    agreed_fee_uah: 1000,
    fee_type: 'fixed',
    ...overrides,
  };
}

function makePaymentRow(overrides: any = {}): ConsultationPayment {
  return {
    id: PAYMENT_ID,
    consultation_id: CONSULTATION_ID,
    payer_user_id: PAYER_USER_ID,
    payee_user_id: ATTORNEY_USER_ID,
    amount_uah: 1000,
    platform_fee_uah: 100,
    attorney_payout_uah: 900,
    status: 'pending',
    payment_provider: 'monobank',
    payment_provider_id: undefined,
    created_at: new Date(),
    ...overrides,
  };
}

function makeDb(overrides: any = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  };
}

function makeConsultationService(overrides: any = {}) {
  return {
    markPaid: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMonobankService(overrides: any = {}) {
  return {
    createInvoice: jest.fn().mockResolvedValue({
      invoiceId: INVOICE_ID,
      pageUrl: 'https://pay.mbnk.biz/mono-inv-001',
      paymentIntentId: 'pi-uuid-001',
    }),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// createPayment
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — createPayment', () => {
  it('creates payment with correct fee calculation (10% platform fee)', async () => {
    const db = makeDb();
    const consultRow = makeConsultationRow({ agreed_fee_uah: 500 });

    // First query: SELECT consultation
    db.query.mockResolvedValueOnce({ rows: [consultRow] });
    // Second query: INSERT payment
    db.query.mockResolvedValueOnce({
      rows: [{
        id: PAYMENT_ID,
        consultation_id: CONSULTATION_ID,
        payer_user_id: PAYER_USER_ID,
        payee_user_id: ATTORNEY_USER_ID,
        amount_uah: 500,
        platform_fee_uah: 50,
        attorney_payout_uah: 450,
        status: 'pending',
      }],
    });

    const service = new ConsultationPaymentService(
      db as any,
      makeConsultationService() as any,
      makeMonobankService() as any
    );

    const result = await service.createPayment(CONSULTATION_ID, PAYER_USER_ID);

    expect(result.amount_uah).toBe(500);
    expect(result.platform_fee_uah).toBe(50);
    expect(result.attorney_payout_uah).toBe(450);
    expect(result.status).toBe('pending');
  });

  it('calculates correct fees for large amounts', async () => {
    const db = makeDb();
    const consultRow = makeConsultationRow({ agreed_fee_uah: 10000 });
    db.query
      .mockResolvedValueOnce({ rows: [consultRow] })
      .mockResolvedValueOnce({ rows: [makePaymentRow({ amount_uah: 10000, platform_fee_uah: 1000, attorney_payout_uah: 9000 })] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.createPayment(CONSULTATION_ID, PAYER_USER_ID);

    // Check the INSERT query args: [id, consultId, payerId, attorneyId, amount, platformFee, attorneyPayout]
    const insertCall = db.query.mock.calls[1];
    const args = insertCall[1];
    expect(args[4]).toBe(10000);           // amount_uah
    expect(args[5]).toBe(1000);            // platform_fee = 10000 * 10 / 100
    expect(args[6]).toBe(9000);            // attorney_payout = 10000 - 1000
  });

  it('throws when consultation not found', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);

    await expect(
      service.createPayment('nonexistent-id', PAYER_USER_ID)
    ).rejects.toThrow('Consultation not found or not in accepted status');
  });

  it('throws when consultation belongs to different user', async () => {
    const db = makeDb();
    // Query with wrong user returns empty
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);

    await expect(
      service.createPayment(CONSULTATION_ID, 'wrong-user-id')
    ).rejects.toThrow('Consultation not found or not in accepted status');
  });

  it('throws when fee not set (amount <= 0 and not free)', async () => {
    const db = makeDb();
    const consultRow = makeConsultationRow({ agreed_fee_uah: 0, fee_type: 'fixed' });
    db.query.mockResolvedValueOnce({ rows: [consultRow] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);

    await expect(
      service.createPayment(CONSULTATION_ID, PAYER_USER_ID)
    ).rejects.toThrow('Consultation fee not set');
  });

  it('stores correct payer and payee user IDs', async () => {
    const db = makeDb();
    const consultRow = makeConsultationRow();
    db.query
      .mockResolvedValueOnce({ rows: [consultRow] })
      .mockResolvedValueOnce({ rows: [makePaymentRow()] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.createPayment(CONSULTATION_ID, PAYER_USER_ID);

    const insertArgs = db.query.mock.calls[1][1];
    expect(insertArgs[2]).toBe(PAYER_USER_ID);     // payer_user_id
    expect(insertArgs[3]).toBe(ATTORNEY_USER_ID);   // payee_user_id (attorney)
  });
});

// ──────────────────────────────────────────────────────────────────────────
// initiatePayment
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — initiatePayment', () => {
  it('creates Monobank invoice and transitions to processing', async () => {
    const db = makeDb();
    const monobank = makeMonobankService();
    const pendingPayment = makePaymentRow({ status: 'pending', amount_uah: 1000 });

    db.query
      .mockResolvedValueOnce({ rows: [pendingPayment] })  // SELECT pending payment
      .mockResolvedValueOnce({ rows: [] });                 // UPDATE to processing

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, monobank as any);
    const result = await service.initiatePayment(PAYMENT_ID);

    expect(result.paymentUrl).toBe('https://pay.mbnk.biz/mono-inv-001');
    expect(result.paymentId).toBe(PAYMENT_ID);

    // Verify Monobank called with correct args
    expect(monobank.createInvoice).toHaveBeenCalledWith(
      PAYER_USER_ID,
      1000,
      expect.stringContaining('CONSULT:')
    );

    // Verify status updated to 'processing' with invoice ID
    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('processing');
    expect(updateCall[1]).toContain(INVOICE_ID);
  });

  it('throws when payment not found', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);

    await expect(
      service.initiatePayment('nonexistent-id')
    ).rejects.toThrow('Payment not found or not in pending status');
  });

  it('throws when payment not in pending status', async () => {
    const db = makeDb();
    // Query filters by status='pending', so already-processing returns empty
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);

    await expect(
      service.initiatePayment(PAYMENT_ID)
    ).rejects.toThrow('Payment not found or not in pending status');
  });

  it('includes consultation reference in Monobank description', async () => {
    const db = makeDb();
    const monobank = makeMonobankService();
    const payment = makePaymentRow();

    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, monobank as any);
    await service.initiatePayment(PAYMENT_ID);

    const description = monobank.createInvoice.mock.calls[0][2];
    expect(description).toContain(`CONSULT:${CONSULTATION_ID}:${PAYMENT_ID}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// handleWebhook — escrow hold
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — handleWebhook (escrow)', () => {
  it('moves payment to held (escrow) on success', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const processingPayment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [processingPayment] }) // SELECT by provider ID
      .mockResolvedValueOnce({ rows: [] });                  // UPDATE to held

    const service = new ConsultationPaymentService(db as any, consultationService as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'success');

    // Verify status set to 'held'
    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('held');
    expect(updateCall[0]).toContain('held_at');
  });

  it('moves payment to held on hold status (Monobank hold)', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const processingPayment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [processingPayment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, consultationService as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'hold');

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('held');
  });

  it('marks consultation as paid after successful escrow hold', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const payment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, consultationService as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'success');

    expect(consultationService.markPaid).toHaveBeenCalledWith(CONSULTATION_ID, PAYMENT_ID);
  });

  it('marks payment as refunded on failure', async () => {
    const db = makeDb();
    const payment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'failure');

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('refunded');
    expect(updateCall[0]).toContain('refunded_at');
  });

  it('marks payment as refunded on reversed', async () => {
    const db = makeDb();
    const payment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'reversed');

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('refunded');
  });

  it('skips non-consultation payments silently', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] }); // No matching consultation payment

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    // Should not throw
    await service.handleWebhook('unknown-invoice', 'success');

    expect(db.query).toHaveBeenCalledTimes(1); // Only the SELECT, no UPDATE
  });

  it('does not call markPaid on failure status', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const payment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });

    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, consultationService as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'failure');

    expect(consultationService.markPaid).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// releasePayment — escrow release
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — releasePayment (escrow release)', () => {
  it('releases held payment to attorney', async () => {
    const db = makeDb();
    const releasedPayment = makePaymentRow({
      status: 'released',
      released_at: new Date(),
      attorney_payout_uah: 900,
    });
    db.query.mockResolvedValueOnce({ rows: [releasedPayment] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.releasePayment(CONSULTATION_ID);

    const updateCall = db.query.mock.calls[0];
    expect(updateCall[0]).toContain('released');
    expect(updateCall[0]).toContain('released_at');
    expect(updateCall[0]).toContain("status = 'held'");
    expect(updateCall[1]).toContain(CONSULTATION_ID);
  });

  it('only releases payments in held status', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] }); // No held payment

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    // Should not throw, just no-op
    await service.releasePayment(CONSULTATION_ID);

    const updateQuery = db.query.mock.calls[0][0];
    expect(updateQuery).toContain("status = 'held'");
  });

  it('handles case where no payment exists for consultation', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    // Should complete without error
    await expect(service.releasePayment('no-such-consultation')).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// refundPayment — escrow refund
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — refundPayment (escrow refund)', () => {
  it('refunds held payment', async () => {
    const db = makeDb();
    const refundedPayment = makePaymentRow({ status: 'refunded', refunded_at: new Date() });
    db.query.mockResolvedValueOnce({ rows: [refundedPayment] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.refundPayment(CONSULTATION_ID);

    const updateCall = db.query.mock.calls[0];
    expect(updateCall[0]).toContain('refunded');
    expect(updateCall[0]).toContain('refunded_at');
  });

  it('refunds processing payment (not yet held)', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [makePaymentRow({ status: 'refunded' })] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await service.refundPayment(CONSULTATION_ID);

    const updateQuery = db.query.mock.calls[0][0];
    // Should accept both held and processing statuses
    expect(updateQuery).toContain("'held'");
    expect(updateQuery).toContain("'processing'");
  });

  it('no-ops when no refundable payment exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    await expect(service.refundPayment('no-such-consultation')).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// getPaymentByConsultation
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — getPaymentByConsultation', () => {
  it('returns the most recent payment for a consultation', async () => {
    const db = makeDb();
    const payment = makePaymentRow({ status: 'held' });
    db.query.mockResolvedValueOnce({ rows: [payment] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    const result = await service.getPaymentByConsultation(CONSULTATION_ID);

    expect(result).toEqual(payment);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY created_at DESC LIMIT 1');
  });

  it('returns null when no payment exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, makeConsultationService() as any, makeMonobankService() as any);
    const result = await service.getPaymentByConsultation('no-payments');

    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Full escrow lifecycle
// ──────────────────────────────────────────────────────────────────────────

describe('ConsultationPaymentService — full escrow lifecycle', () => {
  it('complete flow: create → initiate → webhook hold → release', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const monobank = makeMonobankService();
    const consultRow = makeConsultationRow({ agreed_fee_uah: 2000 });

    // Step 1: createPayment
    const createdPayment = makePaymentRow({
      amount_uah: 2000,
      platform_fee_uah: 200,
      attorney_payout_uah: 1800,
      status: 'pending',
    });
    db.query
      .mockResolvedValueOnce({ rows: [consultRow] })      // SELECT consultation
      .mockResolvedValueOnce({ rows: [createdPayment] });  // INSERT payment

    const service = new ConsultationPaymentService(db as any, consultationService as any, monobank as any);
    const payment = await service.createPayment(CONSULTATION_ID, PAYER_USER_ID);
    expect(payment.status).toBe('pending');
    expect(payment.amount_uah).toBe(2000);

    // Step 2: initiatePayment
    db.query
      .mockResolvedValueOnce({ rows: [createdPayment] })   // SELECT pending payment
      .mockResolvedValueOnce({ rows: [] });                  // UPDATE to processing

    const initResult = await service.initiatePayment(PAYMENT_ID);
    expect(initResult.paymentUrl).toContain('pay.mbnk.biz');

    // Step 3: handleWebhook — hold in escrow
    const processingPayment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });
    db.query
      .mockResolvedValueOnce({ rows: [processingPayment] }) // SELECT by provider ID
      .mockResolvedValueOnce({ rows: [] });                   // UPDATE to held

    await service.handleWebhook(INVOICE_ID, 'success');
    expect(consultationService.markPaid).toHaveBeenCalledWith(CONSULTATION_ID, PAYMENT_ID);

    // Step 4: releasePayment — release escrow to attorney
    const heldPayment = makePaymentRow({ status: 'released', released_at: new Date() });
    db.query.mockResolvedValueOnce({ rows: [heldPayment] });

    await service.releasePayment(CONSULTATION_ID);

    // Verify the final UPDATE targets held payments
    const lastCall = db.query.mock.calls[db.query.mock.calls.length - 1];
    expect(lastCall[0]).toContain('released');
  });

  it('complete flow: create → initiate → webhook failure → refund', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();
    const monobank = makeMonobankService();
    const consultRow = makeConsultationRow({ agreed_fee_uah: 500 });

    // Step 1: createPayment
    const createdPayment = makePaymentRow({ amount_uah: 500, status: 'pending' });
    db.query
      .mockResolvedValueOnce({ rows: [consultRow] })
      .mockResolvedValueOnce({ rows: [createdPayment] });

    const service = new ConsultationPaymentService(db as any, consultationService as any, monobank as any);
    await service.createPayment(CONSULTATION_ID, PAYER_USER_ID);

    // Step 2: initiatePayment
    db.query
      .mockResolvedValueOnce({ rows: [createdPayment] })
      .mockResolvedValueOnce({ rows: [] });

    await service.initiatePayment(PAYMENT_ID);

    // Step 3: handleWebhook — payment failed
    const processingPayment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });
    db.query
      .mockResolvedValueOnce({ rows: [processingPayment] })
      .mockResolvedValueOnce({ rows: [] });

    await service.handleWebhook(INVOICE_ID, 'failure');

    // Verify NOT marked as paid
    expect(consultationService.markPaid).not.toHaveBeenCalled();

    // Verify marked as refunded
    const webhookUpdate = db.query.mock.calls[db.query.mock.calls.length - 1];
    expect(webhookUpdate[0]).toContain('refunded');
  });

  it('escrow hold → client cancels → refund', async () => {
    const db = makeDb();
    const consultationService = makeConsultationService();

    // Webhook: escrow hold
    const processingPayment = makePaymentRow({ status: 'processing', payment_provider_id: INVOICE_ID });
    db.query
      .mockResolvedValueOnce({ rows: [processingPayment] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ConsultationPaymentService(db as any, consultationService as any, makeMonobankService() as any);
    await service.handleWebhook(INVOICE_ID, 'success');

    expect(consultationService.markPaid).toHaveBeenCalled();

    // Refund after cancellation
    db.query.mockResolvedValueOnce({ rows: [makePaymentRow({ status: 'refunded' })] });
    await service.refundPayment(CONSULTATION_ID);

    const refundQuery = db.query.mock.calls[db.query.mock.calls.length - 1][0];
    expect(refundQuery).toContain('refunded');
  });
});
