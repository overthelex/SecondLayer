/**
 * Consultation Chat Routes Tests
 *
 * Tests SSE message stream and unread count endpoints:
 *  - GET /api/consultations/:id/messages/stream
 *  - GET /api/consultations/:id/messages/unread-count
 *  - Query-param JWT token middleware
 */

import express from 'express';
import http from 'http';
import request from 'supertest';
import { createConsultationRoutes } from '../consultation-routes';
import { getConsultationMessageBus } from '../../services/consultation-message-bus';

// ──────────────────────────────────────────────────────────────────────────
// Mock services
// ──────────────────────────────────────────────────────────────────────────

const mockConsultationService = {
  createConsultation: jest.fn(),
  listConsultations: jest.fn(),
  getConsultation: jest.fn(),
  acceptConsultation: jest.fn(),
  declineConsultation: jest.fn(),
  startConsultation: jest.fn(),
  completeConsultation: jest.fn(),
  cancelConsultation: jest.fn(),
  getUnseenPending: jest.fn(),
  markViewed: jest.fn(),
  getAttorneyClients: jest.fn(),
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  submitReview: jest.fn(),
  getUnreadCount: jest.fn(),
};

const mockPaymentService = {
  createPayment: jest.fn(),
  initiatePayment: jest.fn(),
  getPaymentByConsultation: jest.fn(),
};

// ──────────────────────────────────────────────────────────────────────────
// App factory
// ──────────────────────────────────────────────────────────────────────────

function buildApp(userId = 'user-123') {
  const app = express();
  app.use(express.json());

  // Simulate JWT auth middleware
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: userId, email: 'test@test.com', name: 'Test User' };
    next();
  });

  app.use(
    '/api/consultations',
    createConsultationRoutes(
      mockConsultationService as any,
      mockPaymentService as any,
    ),
  );

  return app;
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('Consultation Chat Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:id/messages/unread-count', () => {
    it('returns unread count', async () => {
      mockConsultationService.getUnreadCount.mockResolvedValue(5);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/messages/unread-count')
        .expect(200);

      expect(res.body).toEqual({ count: 5 });
      expect(mockConsultationService.getUnreadCount).toHaveBeenCalledWith('cons-1', 'user-123');
    });

    it('returns 500 on service error', async () => {
      mockConsultationService.getUnreadCount.mockRejectedValue(new Error('DB down'));

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/messages/unread-count')
        .expect(500);

      expect(res.body.error).toBe('Failed to get unread count');
    });
  });

  describe('Query-param token middleware', () => {
    it('returns 401 without user even when token query param is set', async () => {
      const app = express();
      app.use(express.json());
      // No auth middleware — user is not set
      app.use('/api/consultations', createConsultationRoutes(
        mockConsultationService as any,
        mockPaymentService as any,
      ));

      mockConsultationService.getUnreadCount.mockResolvedValue(3);

      const res = await request(app)
        .get('/api/consultations/cons-1/messages/unread-count?token=fake-jwt')
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /:id/messages/stream (SSE)', () => {
    it('returns 404 when consultation not found', async () => {
      mockConsultationService.getConsultation.mockResolvedValue(null);

      const app = buildApp();
      // Non-SSE request since consultation is not found — returns JSON 404
      const res = await request(app)
        .get('/api/consultations/cons-bad/messages/stream');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Consultation not found');
    });

    it('returns SSE headers, connected event, and delivers messages', (done) => {
      mockConsultationService.getConsultation.mockResolvedValue({
        id: 'cons-1',
        client_user_id: 'user-123',
        attorney_user_id: 'attorney-1',
        status: 'in_progress',
      });

      const app = buildApp();
      const server = http.createServer(app);

      server.listen(0, () => {
        const port = (server.address() as any).port;

        // Use raw http request for SSE to avoid supertest stream issues
        const req = http.get(`http://localhost:${port}/api/consultations/cons-1/messages/stream`, (res) => {
          let data = '';

          expect(res.headers['content-type']).toBe('text/event-stream');
          expect(res.headers['cache-control']).toBe('no-cache');
          expect(res.headers['x-accel-buffering']).toBe('no');

          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();

            if (data.includes('event: connected') && !data.includes('event: message')) {
              // Connected event received — now publish a message
              const msg = {
                id: 'msg-1',
                consultation_id: 'cons-1',
                sender_id: 'attorney-1',
                content: 'Hi there',
                message_type: 'text',
                created_at: new Date().toISOString(),
                sender_name: 'Attorney',
              };
              getConsultationMessageBus().publish('cons-1', msg as any);
            }

            if (data.includes('event: message')) {
              // Message received via SSE
              expect(data).toContain('event: connected');
              expect(data).toContain('"Hi there"');
              req.destroy();
              server.close(() => done());
            }
          });
        });

        req.on('error', () => {
          // Expected when we destroy
        });
      });
    });
  });
});
