/**
 * Consultation Escrow Routes Tests
 *
 * Tests cover:
 * - POST /api/consultations/:id/pay — payment initiation
 * - GET /api/consultations/:id/payment — payment status retrieval
 * - PUT /api/consultations/:id/complete — auto-release escrow on completion
 * - PUT /api/consultations/:id/cancel — auto-refund escrow on cancellation
 */

import express, { Response, NextFunction } from 'express';
import request from 'supertest';
import { createConsultationRoutes } from '../consultation-routes';

// ──────────────────────────────────────────────────────────────────────────
// Mock services
// ──────────────────────────────────────────────────────────────────────────

const TEST_USER = { id: 'user-client-001', email: 'client@example.com' };
const CONSULTATION_ID = 'consult-uuid-001';
const PAYMENT_ID = 'payment-uuid-001';
const INVOICE_ID = 'mono-inv-001';

function mockAuth(req: any, _res: Response, next: NextFunction) {
  req.user = TEST_USER;
  next();
}

function makeConsultationService(overrides: any = {}) {
  return {
    createConsultation: jest.fn(),
    listConsultations: jest.fn(),
    getConsultation: jest.fn(),
    acceptConsultation: jest.fn(),
    declineConsultation: jest.fn(),
    startConsultation: jest.fn(),
    completeConsultation: jest.fn().mockResolvedValue({
      id: CONSULTATION_ID,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }),
    cancelConsultation: jest.fn().mockResolvedValue({
      id: CONSULTATION_ID,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    }),
    getUnseenPending: jest.fn(),
    markViewed: jest.fn(),
    getAttorneyClients: jest.fn(),
    sendMessage: jest.fn(),
    markMessagesRead: jest.fn(),
    markMessagesDelivered: jest.fn(),
    getMessages: jest.fn(),
    getUnreadCount: jest.fn(),
    submitReview: jest.fn(),
    ...overrides,
  };
}

function makeConsultationPaymentService(overrides: any = {}) {
  return {
    createPayment: jest.fn().mockResolvedValue({
      id: PAYMENT_ID,
      consultation_id: CONSULTATION_ID,
      amount_uah: 1000,
      platform_fee_uah: 100,
      attorney_payout_uah: 900,
      status: 'pending',
    }),
    initiatePayment: jest.fn().mockResolvedValue({
      paymentUrl: `https://pay.mbnk.biz/${INVOICE_ID}`,
      paymentId: PAYMENT_ID,
    }),
    getPaymentByConsultation: jest.fn().mockResolvedValue({
      id: PAYMENT_ID,
      consultation_id: CONSULTATION_ID,
      amount_uah: 1000,
      platform_fee_uah: 100,
      attorney_payout_uah: 900,
      status: 'held',
      payment_provider: 'monobank',
      payment_provider_id: INVOICE_ID,
    }),
    releasePayment: jest.fn().mockResolvedValue(undefined),
    refundPayment: jest.fn().mockResolvedValue(undefined),
    handleWebhook: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildApp(serviceOverrides: any = {}) {
  const app = express();
  app.use(express.json());

  const consultationService = makeConsultationService(serviceOverrides.consultation);
  const paymentService = makeConsultationPaymentService(serviceOverrides.payment);

  const router = createConsultationRoutes(consultationService as any, paymentService as any);
  app.use('/api/consultations', mockAuth, router);

  return { app, consultationService, paymentService };
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/consultations/:id/pay — initiate escrow payment
// ──────────────────────────────────────────────────────────────────────────

describe('POST /api/consultations/:id/pay', () => {
  it('creates payment and returns Monobank URL', async () => {
    const { app, paymentService } = buildApp();

    const res = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(res.status).toBe(200);
    expect(res.body.paymentUrl).toContain('pay.mbnk.biz');
    expect(res.body.paymentId).toBe(PAYMENT_ID);

    expect(paymentService.createPayment).toHaveBeenCalledWith(CONSULTATION_ID, TEST_USER.id);
    expect(paymentService.initiatePayment).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it('returns 400 when consultation not found or not accepted', async () => {
    const { app } = buildApp({
      payment: {
        createPayment: jest.fn().mockRejectedValue(new Error('Consultation not found or not in accepted status')),
      },
    });

    const res = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not in accepted status');
  });

  it('returns 400 when consultation fee not set', async () => {
    const { app } = buildApp({
      payment: {
        createPayment: jest.fn().mockRejectedValue(new Error('Consultation fee not set')),
      },
    });

    const res = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('fee not set');
  });

  it('returns 400 when Monobank invoice creation fails', async () => {
    const { app } = buildApp({
      payment: {
        createPayment: jest.fn().mockResolvedValue({ id: PAYMENT_ID }),
        initiatePayment: jest.fn().mockRejectedValue(new Error('Monobank API error: 500')),
      },
    });

    const res = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Monobank API error');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/consultations/:id/payment — escrow payment status
// ──────────────────────────────────────────────────────────────────────────

describe('GET /api/consultations/:id/payment', () => {
  it('returns payment with escrow details', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get(`/api/consultations/${CONSULTATION_ID}/payment`);

    expect(res.status).toBe(200);
    expect(res.body.amount_uah).toBe(1000);
    expect(res.body.platform_fee_uah).toBe(100);
    expect(res.body.attorney_payout_uah).toBe(900);
    expect(res.body.status).toBe('held');
    expect(res.body.payment_provider).toBe('monobank');
  });

  it('returns 404 when no payment exists', async () => {
    const { app } = buildApp({
      payment: { getPaymentByConsultation: jest.fn().mockResolvedValue(null) },
    });

    const res = await request(app)
      .get(`/api/consultations/${CONSULTATION_ID}/payment`);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No payment found');
  });

  it('returns payment in each escrow status', async () => {
    const statuses = ['pending', 'processing', 'held', 'released', 'refunded'];

    for (const status of statuses) {
      const { app } = buildApp({
        payment: {
          getPaymentByConsultation: jest.fn().mockResolvedValue({
            id: PAYMENT_ID,
            status,
            amount_uah: 500,
          }),
        },
      });

      const res = await request(app)
        .get(`/api/consultations/${CONSULTATION_ID}/payment`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PUT /api/consultations/:id/complete — auto-release escrow
// ──────────────────────────────────────────────────────────────────────────

describe('PUT /api/consultations/:id/complete — escrow release', () => {
  it('releases escrow payment on successful completion', async () => {
    const { app, paymentService, consultationService } = buildApp();

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/complete`)
      .send({ summary: 'Консультацію завершено' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(consultationService.completeConsultation).toHaveBeenCalledWith(
      CONSULTATION_ID, TEST_USER.id, 'Консультацію завершено'
    );
    expect(paymentService.releasePayment).toHaveBeenCalledWith(CONSULTATION_ID);
  });

  it('still completes consultation even if escrow release fails', async () => {
    const { app, consultationService } = buildApp({
      payment: {
        releasePayment: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    });

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/complete`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(consultationService.completeConsultation).toHaveBeenCalled();
  });

  it('returns 400 when consultation is not in_progress', async () => {
    const { app } = buildApp({
      consultation: {
        completeConsultation: jest.fn().mockRejectedValue(
          new Error('Cannot complete consultation in status: accepted')
        ),
      },
    });

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/complete`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot complete');
  });

  it('does not call releasePayment when completion fails', async () => {
    const { app, paymentService } = buildApp({
      consultation: {
        completeConsultation: jest.fn().mockRejectedValue(new Error('Not authorized')),
      },
    });

    await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/complete`)
      .send({});

    expect(paymentService.releasePayment).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PUT /api/consultations/:id/cancel — auto-refund escrow
// ──────────────────────────────────────────────────────────────────────────

describe('PUT /api/consultations/:id/cancel — escrow refund', () => {
  it('refunds escrow payment on cancellation', async () => {
    const { app, paymentService, consultationService } = buildApp();

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({ reason: 'Зміна планів' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(consultationService.cancelConsultation).toHaveBeenCalledWith(
      CONSULTATION_ID, TEST_USER.id, 'Зміна планів'
    );
    expect(paymentService.refundPayment).toHaveBeenCalledWith(CONSULTATION_ID);
  });

  it('still cancels consultation even if escrow refund fails', async () => {
    const { app, consultationService } = buildApp({
      payment: {
        refundPayment: jest.fn().mockRejectedValue(new Error('DB error')),
      },
    });

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(consultationService.cancelConsultation).toHaveBeenCalled();
  });

  it('returns 400 when consultation cannot be cancelled', async () => {
    const { app } = buildApp({
      consultation: {
        cancelConsultation: jest.fn().mockRejectedValue(
          new Error('Cannot cancel consultation in status: completed')
        ),
      },
    });

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot cancel');
  });

  it('does not call refundPayment when cancellation fails', async () => {
    const { app, paymentService } = buildApp({
      consultation: {
        cancelConsultation: jest.fn().mockRejectedValue(new Error('Not authorized')),
      },
    });

    await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({});

    expect(paymentService.refundPayment).not.toHaveBeenCalled();
  });

  it('refunds without reason', async () => {
    const { app, paymentService } = buildApp();

    const res = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({});

    expect(res.status).toBe(200);
    expect(paymentService.refundPayment).toHaveBeenCalledWith(CONSULTATION_ID);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Full escrow lifecycle via routes
// ──────────────────────────────────────────────────────────────────────────

describe('Consultation escrow lifecycle via routes', () => {
  it('pay → complete → release flow', async () => {
    const { app, paymentService } = buildApp();

    // Step 1: Initiate payment
    const payRes = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(payRes.status).toBe(200);
    expect(payRes.body.paymentUrl).toBeTruthy();

    // Step 2: Complete consultation (triggers auto-release)
    const completeRes = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/complete`)
      .send({ summary: 'Все виконано' });

    expect(completeRes.status).toBe(200);
    expect(paymentService.releasePayment).toHaveBeenCalledWith(CONSULTATION_ID);
  });

  it('pay → cancel → refund flow', async () => {
    const { app, paymentService } = buildApp();

    // Step 1: Initiate payment
    const payRes = await request(app)
      .post(`/api/consultations/${CONSULTATION_ID}/pay`);

    expect(payRes.status).toBe(200);

    // Step 2: Cancel consultation (triggers auto-refund)
    const cancelRes = await request(app)
      .put(`/api/consultations/${CONSULTATION_ID}/cancel`)
      .send({ reason: 'Передумав' });

    expect(cancelRes.status).toBe(200);
    expect(paymentService.refundPayment).toHaveBeenCalledWith(CONSULTATION_ID);
  });
});
