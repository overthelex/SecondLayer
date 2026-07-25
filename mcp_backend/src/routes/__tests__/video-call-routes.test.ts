/**
 * Tests for video call REST routes
 *
 * Uses supertest + a minimal Express app that injects a fake authenticated user,
 * with VideoCallService fully mocked.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';
import { createVideoCallRoutes } from '../video-call-routes';

// ---------------------------------------------------------------------------
// Mock VideoCallService
// ---------------------------------------------------------------------------

const mockVideoCallService = {
  verifyCallAccess: jest.fn(),
  getActiveSession: jest.fn(),
  createSession: jest.fn(),
  endSession: jest.fn(),
  getIceServers: jest.fn(),
  getCallHistory: jest.fn(),
  getTranscript: jest.fn(),
  getSessionById: jest.fn(),
  updateSessionStatus: jest.fn(),
  saveTranscriptSegment: jest.fn(),
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(userId = 'user-1', consultationId = 'cons-1') {
  const app = express();
  app.use(express.json());

  // Inject authenticated user (replaces real dual-auth middleware)
  app.use((req: any, _res, next) => {
    req.user = { id: userId, email: 'test@example.com' };
    next();
  });

  app.use(
    `/api/consultations/:consultationId/calls`,
    createVideoCallRoutes(mockVideoCallService as any),
  );

  return app;
}

function buildUnauthenticatedApp() {
  const app = express();
  app.use(express.json());
  // No req.user set — simulates unauthenticated request
  app.use(
    `/api/consultations/:consultationId/calls`,
    createVideoCallRoutes(mockVideoCallService as any),
  );
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  consultation_id: 'cons-1',
  caller_id: 'user-1',
  callee_id: 'user-2',
  call_type: 'video',
  status: 'pending',
  started_at: '2024-01-01T10:00:00.000Z',
  created_at: '2024-01-01T10:00:00.000Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoCall Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POST / — initiate call ─────────────────────────────────────────────────

  describe('POST /api/consultations/:consultationId/calls', () => {
    it('returns 201 with the new session on successful initiation', async () => {
      const session = makeSession();
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getActiveSession.mockResolvedValue(null);
      mockVideoCallService.createSession.mockResolvedValue(session);

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video', calleeId: 'user-2' })
        .expect(201);

      expect(res.body).toEqual(session);
      expect(mockVideoCallService.verifyCallAccess).toHaveBeenCalledWith('cons-1', 'user-1');
      expect(mockVideoCallService.createSession).toHaveBeenCalledWith(
        'cons-1',
        'user-1',
        'user-2',
        'video',
      );
    });

    it('returns 401 when user is not authenticated', async () => {
      const app = buildUnauthenticatedApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video', calleeId: 'user-2' })
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
      expect(mockVideoCallService.verifyCallAccess).not.toHaveBeenCalled();
    });

    it('returns 400 when callType is missing', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ calleeId: 'user-2' })
        .expect(400);

      expect(res.body.error).toMatch(/callType/);
    });

    it('returns 400 when calleeId is missing', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video' })
        .expect(400);

      expect(res.body.error).toMatch(/calleeId/);
    });

    it('returns 403 when user has no access to the consultation', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(false);

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video', calleeId: 'user-2' })
        .expect(403);

      expect(res.body.error).toBe('No access to this consultation');
      expect(mockVideoCallService.createSession).not.toHaveBeenCalled();
    });

    it('returns 409 when an active call already exists', async () => {
      const existingSession = makeSession({ status: 'ringing' });
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getActiveSession.mockResolvedValue(existingSession);

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video', calleeId: 'user-2' })
        .expect(409);

      expect(res.body.error).toBe('Active call already exists');
      expect(res.body.session).toEqual(existingSession);
      expect(mockVideoCallService.createSession).not.toHaveBeenCalled();
    });

    it('returns 500 when createSession throws', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getActiveSession.mockResolvedValue(null);
      mockVideoCallService.createSession.mockRejectedValue(new Error('DB error'));

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls')
        .send({ callType: 'video', calleeId: 'user-2' })
        .expect(500);

      expect(res.body.error).toBe('Failed to initiate call');
    });
  });

  // ── POST /:sessionId/end — end call ────────────────────────────────────────

  describe('POST /api/consultations/:consultationId/calls/:sessionId/end', () => {
    it('returns 200 with the ended session', async () => {
      const session = makeSession({ status: 'ended' });
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.endSession.mockResolvedValue(session);

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({ reason: 'ended_by_user' })
        .expect(200);

      expect(res.body).toEqual(session);
      expect(mockVideoCallService.endSession).toHaveBeenCalledWith('session-1', 'ended_by_user');
    });

    it('uses default end reason when reason is not provided', async () => {
      const session = makeSession({ status: 'ended' });
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.endSession.mockResolvedValue(session);

      const app = buildApp();
      await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({})
        .expect(200);

      expect(mockVideoCallService.endSession).toHaveBeenCalledWith('session-1', 'ended_by_user');
    });

    it('returns 401 when user is not authenticated', async () => {
      const app = buildUnauthenticatedApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({})
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 403 when user has no access', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(false);

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({})
        .expect(403);

      expect(res.body.error).toBe('No access to this consultation');
    });

    it('returns 404 when session is not found', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.endSession.mockRejectedValue(
        new Error('Session session-1 not found'),
      );

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({})
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 500 on unexpected service error', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.endSession.mockRejectedValue(new Error('Unexpected failure'));

      const app = buildApp();
      const res = await request(app)
        .post('/api/consultations/cons-1/calls/session-1/end')
        .send({})
        .expect(500);

      expect(res.body.error).toBe('Failed to end call');
    });
  });

  // ── GET /ice-servers ───────────────────────────────────────────────────────

  describe('GET /api/consultations/:consultationId/calls/ice-servers', () => {
    it('returns array of ICE server configs', async () => {
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'cred' },
      ];
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getIceServers.mockReturnValue(iceServers);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/ice-servers')
        .expect(200);

      expect(res.body.iceServers).toEqual(iceServers);
    });

    it('returns 401 when not authenticated', async () => {
      const app = buildUnauthenticatedApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/ice-servers')
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 403 when user has no access', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(false);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/ice-servers')
        .expect(403);

      expect(res.body.error).toBe('No access to this consultation');
    });

    it('returns 500 on service error', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getIceServers.mockImplementation(() => {
        throw new Error('ICE config failure');
      });

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/ice-servers')
        .expect(500);

      expect(res.body.error).toBe('Failed to get ICE servers');
    });
  });

  // ── GET /history ───────────────────────────────────────────────────────────

  describe('GET /api/consultations/:consultationId/calls/history', () => {
    it('returns call history array', async () => {
      const sessions = [makeSession({ id: 's-1' }), makeSession({ id: 's-2' })];
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getCallHistory.mockResolvedValue(sessions);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/history')
        .expect(200);

      expect(res.body).toEqual(sessions);
      expect(mockVideoCallService.getCallHistory).toHaveBeenCalledWith('cons-1', 50);
    });

    it('respects ?limit query parameter', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getCallHistory.mockResolvedValue([]);

      const app = buildApp();
      await request(app)
        .get('/api/consultations/cons-1/calls/history?limit=10')
        .expect(200);

      expect(mockVideoCallService.getCallHistory).toHaveBeenCalledWith('cons-1', 10);
    });

    it('returns 401 when not authenticated', async () => {
      const app = buildUnauthenticatedApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/history')
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 403 when user has no access', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(false);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/history')
        .expect(403);

      expect(res.body.error).toBe('No access to this consultation');
    });

    it('returns 500 on service error', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getCallHistory.mockRejectedValue(new Error('DB down'));

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/history')
        .expect(500);

      expect(res.body.error).toBe('Failed to get call history');
    });
  });

  // ── GET /:sessionId/transcript ─────────────────────────────────────────────

  describe('GET /api/consultations/:consultationId/calls/:sessionId/transcript', () => {
    it('returns transcript segments', async () => {
      const segments = [
        { id: 'seg-1', session_id: 'session-1', speaker_id: 'user-1', text: 'Hello', timestamp_ms: 100 },
        { id: 'seg-2', session_id: 'session-1', speaker_id: 'user-2', text: 'Hi', timestamp_ms: 200 },
      ];
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getTranscript.mockResolvedValue(segments);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/session-1/transcript')
        .expect(200);

      expect(res.body).toEqual(segments);
      expect(mockVideoCallService.getTranscript).toHaveBeenCalledWith('session-1');
    });

    it('returns 401 when not authenticated', async () => {
      const app = buildUnauthenticatedApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/session-1/transcript')
        .expect(401);

      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 403 when user has no access', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(false);

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/session-1/transcript')
        .expect(403);

      expect(res.body.error).toBe('No access to this consultation');
    });

    it('returns 500 on service error', async () => {
      mockVideoCallService.verifyCallAccess.mockResolvedValue(true);
      mockVideoCallService.getTranscript.mockRejectedValue(new Error('DB down'));

      const app = buildApp();
      const res = await request(app)
        .get('/api/consultations/cons-1/calls/session-1/transcript')
        .expect(500);

      expect(res.body.error).toBe('Failed to get transcript');
    });
  });
});
