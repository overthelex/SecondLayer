/**
 * Tests for VideoCallService
 *
 * Covers session lifecycle, ICE server config generation,
 * transcript storage, and access verification.
 */

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid-1234') }));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import crypto from 'crypto';
import { VideoCallService } from '../video-call-service';
import type { IDatabase } from '../../domain/ports/index.js';
import type { IConsultationMessageBus } from '../consultation-message-bus.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  transaction: jest.fn(),
  connect: jest.fn(),
  close: jest.fn(),
  setMetricsCollector: jest.fn(),
});

const createMockMessageBus = (): jest.Mocked<IConsultationMessageBus> => ({
  subscribe: jest.fn(),
  subscribeStatus: jest.fn(),
  subscribeConsultationStatus: jest.fn(),
  subscribeUser: jest.fn(),
  subscribeTyping: jest.fn(),
  publish: jest.fn(),
  publishStatus: jest.fn(),
  publishConsultationStatus: jest.fn(),
  publishUserEvent: jest.fn(),
  publishTyping: jest.fn(),
});

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  consultation_id: 'cons-1',
  caller_id: 'user-a',
  callee_id: 'user-b',
  call_type: 'video' as const,
  status: 'pending' as const,
  started_at: '2024-01-01T10:00:00.000Z',
  created_at: '2024-01-01T10:00:00.000Z',
  ...overrides,
});

const makeTranscriptSegment = (overrides: Record<string, unknown> = {}) => ({
  id: 'seg-1',
  session_id: 'session-1',
  speaker_id: 'user-a',
  text: 'Hello court',
  language: 'uk',
  is_final: true,
  timestamp_ms: 1000,
  created_at: '2024-01-01T10:00:00.000Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoCallService', () => {
  let service: VideoCallService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockBus: ReturnType<typeof createMockMessageBus>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockBus = createMockMessageBus();
    service = new VideoCallService(mockDb as unknown as IDatabase, mockBus);

    // Remove TURN env vars so each test starts clean
    delete process.env.STUN_SERVER_URL;
    delete process.env.TURN_SERVER_URL;
    delete process.env.TURN_SHARED_SECRET;
  });

  // ── createSession ──────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('creates a session and returns DB row', async () => {
      const session = makeSession();
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      const result = await service.createSession('cons-1', 'user-a', 'user-b', 'video');

      expect(result).toEqual(session);
      expect(mockDb.query).toHaveBeenCalledTimes(1);

      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO video_call_sessions/i);
      expect(params).toContain('test-uuid-1234');
      expect(params).toContain('cons-1');
      expect(params).toContain('user-a');
      expect(params).toContain('user-b');
      expect(params).toContain('video');
    });

    it('creates an audio-type session', async () => {
      const session = makeSession({ call_type: 'audio' });
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      const result = await service.createSession('cons-1', 'user-a', 'user-b', 'audio');

      expect(result.call_type).toBe('audio');
      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toContain('audio');
    });

    it('propagates database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB connection refused'));

      await expect(
        service.createSession('cons-1', 'user-a', 'user-b', 'video'),
      ).rejects.toThrow('DB connection refused');
    });
  });

  // ── updateSessionStatus ────────────────────────────────────────────────────

  describe('updateSessionStatus', () => {
    it('updates status with no extras', async () => {
      const session = makeSession({ status: 'connected' });
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      const result = await service.updateSessionStatus('session-1', 'connected');

      expect(result.status).toBe('connected');
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/UPDATE video_call_sessions/i);
      expect(params).toContain('session-1');
      expect(params).toContain('connected');
    });

    it('includes connected_at in SET clause when provided', async () => {
      const session = makeSession({ status: 'connected', connected_at: '2024-01-01T10:01:00.000Z' });
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      await service.updateSessionStatus('session-1', 'connected', {
        connected_at: '2024-01-01T10:01:00.000Z',
      });

      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/connected_at/);
      expect(params).toContain('2024-01-01T10:01:00.000Z');
    });

    it('includes all extra fields when all are supplied', async () => {
      const session = makeSession({ status: 'ended' });
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      await service.updateSessionStatus('session-1', 'ended', {
        ended_at: '2024-01-01T10:05:00.000Z',
        duration_seconds: 300,
        end_reason: 'ended_by_user',
      });

      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/ended_at/);
      expect(sql).toMatch(/duration_seconds/);
      expect(sql).toMatch(/end_reason/);
      expect(params).toContain(300);
      expect(params).toContain('ended_by_user');
    });
  });

  // ── endSession ─────────────────────────────────────────────────────────────

  describe('endSession', () => {
    it('sets status to ended and calculates duration when connected_at is present', async () => {
      const connectedAt = '2024-01-01T10:00:00.000Z';
      // First call: getSessionById
      mockDb.query.mockResolvedValueOnce({
        rows: [makeSession({ connected_at: connectedAt })],
        rowCount: 1,
      });
      // Second call: updateSessionStatus
      const endedSession = makeSession({ status: 'ended', duration_seconds: 120 });
      mockDb.query.mockResolvedValueOnce({ rows: [endedSession], rowCount: 1 });

      const result = await service.endSession('session-1', 'ended_by_user');

      expect(result.status).toBe('ended');
      expect(result.duration_seconds).toBe(120);

      const [updateSql, updateParams] = mockDb.query.mock.calls[1];
      expect(updateSql).toMatch(/UPDATE video_call_sessions/i);
      expect(updateParams).toContain('ended');
      expect(updateParams).toContain('ended_by_user');
    });

    it('sets status to ended without duration when session was never connected', async () => {
      // Session has no connected_at
      mockDb.query.mockResolvedValueOnce({
        rows: [makeSession()],
        rowCount: 1,
      });
      const endedSession = makeSession({ status: 'ended' });
      mockDb.query.mockResolvedValueOnce({ rows: [endedSession], rowCount: 1 });

      const result = await service.endSession('session-1', 'missed');

      expect(result.status).toBe('ended');
      // duration_seconds should not appear in update params
      const [, updateParams] = mockDb.query.mock.calls[1];
      expect(updateParams).not.toContain(expect.any(Number));
    });

    it('throws when session is not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.endSession('no-such-session', 'ended_by_user')).rejects.toThrow(
        'Session no-such-session not found',
      );
    });
  });

  // ── getActiveSession ───────────────────────────────────────────────────────

  describe('getActiveSession', () => {
    it('returns the active session for a consultation', async () => {
      const session = makeSession({ status: 'ringing' });
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      const result = await service.getActiveSession('cons-1');

      expect(result).toEqual(session);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/status IN/i);
      expect(params).toContain('cons-1');
    });

    it('returns null when no active session exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getActiveSession('cons-1');

      expect(result).toBeNull();
    });
  });

  // ── getSessionById ─────────────────────────────────────────────────────────

  describe('getSessionById', () => {
    it('returns session when found', async () => {
      const session = makeSession();
      mockDb.query.mockResolvedValueOnce({ rows: [session], rowCount: 1 });

      const result = await service.getSessionById('session-1');

      expect(result).toEqual(session);
    });

    it('returns null when session does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getSessionById('missing-id');

      expect(result).toBeNull();
    });
  });

  // ── getCallHistory ─────────────────────────────────────────────────────────

  describe('getCallHistory', () => {
    it('returns sessions ordered by created_at desc', async () => {
      const sessions = [
        makeSession({ id: 's-2', created_at: '2024-01-02T00:00:00.000Z' }),
        makeSession({ id: 's-1', created_at: '2024-01-01T00:00:00.000Z' }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: sessions, rowCount: 2 });

      const result = await service.getCallHistory('cons-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s-2');
    });

    it('passes the limit parameter to the query', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getCallHistory('cons-1', 10);

      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toContain(10);
    });

    it('uses default limit of 50 when not specified', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getCallHistory('cons-1');

      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toContain(50);
    });

    it('returns empty array when there is no history', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getCallHistory('cons-1');

      expect(result).toEqual([]);
    });
  });

  // ── getIceServers ──────────────────────────────────────────────────────────

  describe('getIceServers', () => {
    it('returns only STUN server when TURN config is absent', () => {
      const servers = service.getIceServers();

      expect(servers).toHaveLength(1);
      expect(servers[0].urls).toBe('stun:stun.l.google.com:19302');
      expect(servers[0].username).toBeUndefined();
      expect(servers[0].credential).toBeUndefined();
    });

    it('uses STUN_SERVER_URL env var when set', () => {
      process.env.STUN_SERVER_URL = 'stun:custom.stun.example.com:3478';

      const servers = service.getIceServers();

      expect(servers[0].urls).toBe('stun:custom.stun.example.com:3478');
    });

    it('returns both STUN and TURN when TURN_SERVER_URL and TURN_SHARED_SECRET are set', () => {
      process.env.TURN_SERVER_URL = 'turn:turn.example.com:3478';
      process.env.TURN_SHARED_SECRET = 'mysecret';

      const servers = service.getIceServers();

      expect(servers).toHaveLength(2);
      expect(servers[1].urls).toBe('turn:turn.example.com:3478');
      expect(servers[1].username).toBeDefined();
      expect(servers[1].credential).toBeDefined();
    });

    it('TURN credentials have HMAC-SHA1 format: username is timestamp:randomHex, credential is base64', () => {
      process.env.TURN_SERVER_URL = 'turn:turn.example.com:3478';
      const secret = 'test-secret-key';
      process.env.TURN_SHARED_SECRET = secret;

      const beforeCall = Math.floor(Date.now() / 1000);
      const servers = service.getIceServers();
      const afterCall = Math.floor(Date.now() / 1000);

      const turn = servers[1];
      expect(typeof turn.username).toBe('string');
      expect(typeof turn.credential).toBe('string');

      // Username format: "<timestamp>:<randomHex>"
      const [tsStr, randomPart] = (turn.username as string).split(':');
      const ts = parseInt(tsStr, 10);
      expect(ts).toBeGreaterThan(beforeCall); // timestamp is in the future (TTL offset)
      expect(ts).toBeLessThanOrEqual(afterCall + 86401);
      expect(randomPart).toMatch(/^[0-9a-f]{16}$/); // 8 bytes as hex = 16 chars

      // Credential must be valid base64 HMAC-SHA1
      const expectedCredential = crypto
        .createHmac('sha1', secret)
        .update(turn.username as string)
        .digest('base64');
      expect(turn.credential).toBe(expectedCredential);
    });

    it('does not return TURN when only TURN_SERVER_URL is set without TURN_SHARED_SECRET', () => {
      process.env.TURN_SERVER_URL = 'turn:turn.example.com:3478';
      // TURN_SHARED_SECRET intentionally not set

      const servers = service.getIceServers();

      expect(servers).toHaveLength(1);
    });
  });

  // ── saveTranscriptSegment ──────────────────────────────────────────────────

  describe('saveTranscriptSegment', () => {
    it('inserts a transcript row and returns it', async () => {
      const segment = makeTranscriptSegment();
      mockDb.query.mockResolvedValueOnce({ rows: [segment], rowCount: 1 });

      const result = await service.saveTranscriptSegment(
        'session-1',
        'user-a',
        'Hello court',
        'uk',
        true,
        1000,
      );

      expect(result).toEqual(segment);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO call_transcripts/i);
      expect(params).toContain('test-uuid-1234');
      expect(params).toContain('session-1');
      expect(params).toContain('user-a');
      expect(params).toContain('Hello court');
      expect(params).toContain('uk');
      expect(params).toContain(true);
      expect(params).toContain(1000);
    });
  });

  // ── getTranscript ──────────────────────────────────────────────────────────

  describe('getTranscript', () => {
    it('returns segments ordered by timestamp_ms asc', async () => {
      const segments = [
        makeTranscriptSegment({ id: 'seg-1', timestamp_ms: 100 }),
        makeTranscriptSegment({ id: 'seg-2', timestamp_ms: 200 }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: segments, rowCount: 2 });

      const result = await service.getTranscript('session-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('seg-1');
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/ORDER BY timestamp_ms ASC/i);
      expect(params).toContain('session-1');
    });

    it('returns empty array when session has no transcript', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getTranscript('session-1');

      expect(result).toEqual([]);
    });
  });

  // ── verifyCallAccess ───────────────────────────────────────────────────────

  describe('verifyCallAccess', () => {
    it('returns true for client user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'cons-1' }], rowCount: 1 });

      const result = await service.verifyCallAccess('cons-1', 'client-user');

      expect(result).toBe(true);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toMatch(/client_user_id = \$2 OR attorney_user_id = \$2/i);
      expect(params).toContain('cons-1');
      expect(params).toContain('client-user');
    });

    it('returns true for attorney user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'cons-1' }], rowCount: 1 });

      const result = await service.verifyCallAccess('cons-1', 'attorney-user');

      expect(result).toBe(true);
    });

    it('returns false for unauthorized user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.verifyCallAccess('cons-1', 'stranger');

      expect(result).toBe(false);
    });
  });
});
