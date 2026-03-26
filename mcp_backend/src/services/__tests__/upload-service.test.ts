/**
 * Tests for UploadService — session management, chunk saving,
 * file assembly, status updates, cleanup, and static type helpers.
 */

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('aaaaaaaa-0000-0000-0000-000000000001') }));

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// Mock fs/promises to avoid real disk I/O
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('chunk data')),
  stat: jest.fn().mockResolvedValue({ size: 0 }),
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  unlink: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

// Mock fs (sync) — createWriteStream
jest.mock('fs', () => {
  const writeStreamMock: any = {
    write: jest.fn().mockReturnValue(true),
    end: jest.fn().mockImplementation(function (cb?: () => void) { cb?.(); }),
    on: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  };
  return {
    createWriteStream: jest.fn().mockReturnValue(writeStreamMock),
    __writeStreamMock: writeStreamMock,
  };
});

import { UploadService } from '../upload-service';

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const makeSessionRow = (overrides: Record<string, any> = {}) => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  user_id: 'user-1',
  file_name: 'test.pdf',
  file_size: '10485760', // 10MB
  mime_type: 'application/pdf',
  total_chunks: 2,
  chunk_size: 5242880,
  uploaded_chunks: [0, 1],
  status: 'pending',
  doc_type: 'contract',
  relative_path: null,
  metadata: null,
  matter_id: null,
  document_id: null,
  error_message: null,
  retry_count: 0,
  processing_started_at: null,
  last_retry_at: null,
  expires_at: '2026-12-31T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('UploadService', () => {
  let service: UploadService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    service = new UploadService(mockDb as any);
  });

  // ── Static helpers ──

  describe('isDocumentType', () => {
    it('should return true for application/pdf', () => {
      expect(UploadService.isDocumentType('application/pdf')).toBe(true);
    });

    it('should return true for docx mime type', () => {
      expect(
        UploadService.isDocumentType(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).toBe(true);
    });

    it('should return true for text/html', () => {
      expect(UploadService.isDocumentType('text/html')).toBe(true);
    });

    it('should return false for image/png', () => {
      expect(UploadService.isDocumentType('image/png')).toBe(false);
    });

    it('should return false for application/zip', () => {
      expect(UploadService.isDocumentType('application/zip')).toBe(false);
    });
  });

  describe('isArchiveType', () => {
    it('should return true for application/zip', () => {
      expect(UploadService.isArchiveType('application/zip')).toBe(true);
    });

    it('should return true for application/x-tar', () => {
      expect(UploadService.isArchiveType('application/x-tar')).toBe(true);
    });

    it('should return false for application/pdf', () => {
      expect(UploadService.isArchiveType('application/pdf')).toBe(false);
    });
  });

  describe('defaultChunkSize', () => {
    it('should return 5MB', () => {
      expect(service.defaultChunkSize).toBe(5 * 1024 * 1024);
    });
  });

  // ── createSession ──

  describe('createSession', () => {
    it('should create a session with correct total chunks calculation', async () => {
      const row = makeSessionRow({ total_chunks: 2 });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const session = await service.createSession('user-1', 'test.pdf', 10 * 1024 * 1024, 'application/pdf');

      expect(session.id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
      expect(session.userId).toBe('user-1');
      expect(session.fileName).toBe('test.pdf');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO upload_sessions'),
        expect.arrayContaining(['user-1', 'test.pdf'])
      );
    });

    it('should reject files larger than 2GB', async () => {
      const tooBig = 2 * 1024 * 1024 * 1024 + 1;
      await expect(
        service.createSession('user-1', 'huge.pdf', tooBig, 'application/pdf')
      ).rejects.toThrow('exceeds maximum');
    });

    it('should set docType from options', async () => {
      const row = makeSessionRow({ doc_type: 'contract' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await service.createSession('user-1', 'doc.pdf', 1024, 'application/pdf', { docType: 'contract' });

      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs).toContain('contract');
    });

    it('should encode encrypt flag in metadata JSON', async () => {
      const row = makeSessionRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await service.createSession('user-1', 'secret.pdf', 1024, 'application/pdf', { encrypt: true });

      const metadataArg = mockDb.query.mock.calls[0][1][9];
      expect(JSON.parse(metadataArg)).toMatchObject({ encrypt: true });
    });
  });

  // ── getSession ──

  describe('getSession', () => {
    it('should return null when session not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await service.getSession('non-existent');
      expect(result).toBeNull();
    });

    it('should return a mapped session when found', async () => {
      const row = makeSessionRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const session = await service.getSession('aaaaaaaa-0000-0000-0000-000000000001');

      expect(session).not.toBeNull();
      expect(session!.userId).toBe('user-1');
      expect(session!.fileName).toBe('test.pdf');
      expect(session!.fileSize).toBe(10485760);
      expect(session!.uploadedChunks).toEqual([0, 1]);
    });
  });

  // ── saveChunk ──

  describe('saveChunk', () => {
    it('should throw when session not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        service.saveChunk('non-existent', 0, Buffer.from('data'))
      ).rejects.toThrow('not found');
    });

    it('should throw when session is in wrong status', async () => {
      const row = makeSessionRow({ status: 'completed' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await expect(
        service.saveChunk('aaaaaaaa-0000-0000-0000-000000000001', 0, Buffer.from('data'))
      ).rejects.toThrow('cannot accept chunks');
    });

    it('should throw for invalid chunk index', async () => {
      const row = makeSessionRow({ status: 'pending', total_chunks: 2, uploaded_chunks: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await expect(
        service.saveChunk('aaaaaaaa-0000-0000-0000-000000000001', 5, Buffer.from('data'))
      ).rejects.toThrow('Invalid chunk index');
    });

    it('should throw for invalid session ID format (path traversal)', async () => {
      const row = makeSessionRow({ id: '../evil', status: 'pending', total_chunks: 1, uploaded_chunks: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await expect(
        service.saveChunk('../evil', 0, Buffer.from('data'))
      ).rejects.toThrow('Invalid session ID format');
    });

    it('should return progress information on success', async () => {
      const sessionRow = makeSessionRow({ status: 'pending', total_chunks: 2, uploaded_chunks: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 }); // getSession
      mockDb.query.mockResolvedValueOnce({
        rows: [{ uploaded_chunks: [0], total_chunks: 2 }],
        rowCount: 1,
      }); // UPDATE

      const result = await service.saveChunk(
        'aaaaaaaa-0000-0000-0000-000000000001',
        0,
        Buffer.from('chunk')
      );

      expect(result.chunkIndex).toBe(0);
      expect(result.uploadedChunks).toEqual([0]);
      expect(result.totalChunks).toBe(2);
      expect(result.progress).toBe(0.5);
    });
  });

  // ── assembleFile ──

  describe('assembleFile', () => {
    it('should throw when session not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(service.assembleFile('non-existent')).rejects.toThrow('not found');
    });

    it('should throw when chunks are missing', async () => {
      const row = makeSessionRow({ uploaded_chunks: [0], total_chunks: 2 }); // only 1 of 2 chunks
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await expect(
        service.assembleFile('aaaaaaaa-0000-0000-0000-000000000001')
      ).rejects.toThrow('Missing chunks');
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('should call db.query with correct parameters', async () => {
      await service.updateStatus('session-1', 'processing', 'some error');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['session-1', 'processing', 'some error'])
      );
    });

    it('should set processing_started_at for assembling status', async () => {
      await service.updateStatus('session-1', 'assembling');
      const params = mockDb.query.mock.calls[0][1];
      // 4th param is the boolean for setProcessingStarted
      expect(params[3]).toBe(true);
    });

    it('should not set processing_started_at for uploading status', async () => {
      await service.updateStatus('session-1', 'uploading');
      const params = mockDb.query.mock.calls[0][1];
      expect(params[3]).toBe(false);
    });
  });

  // ── setDocumentId ──

  describe('setDocumentId', () => {
    it('should call UPDATE with documentId and sessionId', async () => {
      await service.setDocumentId('session-1', 'doc-123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('document_id = $1'),
        ['doc-123', 'session-1']
      );
    });
  });

  // ── cancelSession ──

  describe('cancelSession', () => {
    it('should update status to cancelled', async () => {
      await service.cancelSession('aaaaaaaa-0000-0000-0000-000000000001');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        ['aaaaaaaa-0000-0000-0000-000000000001']
      );
    });
  });

  // ── cleanupExpired ──

  describe('cleanupExpired', () => {
    it('should return count of expired sessions', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'sess-1' }, { id: 'sess-2' }],
        rowCount: 2,
      });

      const count = await service.cleanupExpired();
      expect(count).toBe(2);
    });

    it('should return 0 when no sessions expired', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const count = await service.cleanupExpired();
      expect(count).toBe(0);
    });
  });

  // ── cleanupStale ──

  describe('cleanupStale', () => {
    it('should use default 30 minutes when not specified', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.cleanupStale();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('pending'),
        [30]
      );
    });

    it('should use custom stale minutes', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.cleanupStale(60);
      const params = mockDb.query.mock.calls[0][1];
      expect(params[0]).toBe(60);
    });
  });

  // ── cancelUserStaleSessions ──

  describe('cancelUserStaleSessions', () => {
    it('should return count of cancelled stale sessions for user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sess-1' }], rowCount: 1 });
      const count = await service.cancelUserStaleSessions('user-1');
      expect(count).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1'),
        ['user-1']
      );
    });
  });

  // ── getActiveSessionCount ──

  describe('getActiveSessionCount', () => {
    it('should return parsed integer count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ cnt: '5' }], rowCount: 1 });
      const count = await service.getActiveSessionCount('user-1');
      expect(count).toBe(5);
    });
  });

  // ── getActiveSessions ──

  describe('getActiveSessions', () => {
    it('should return mapped array of sessions', async () => {
      const row = makeSessionRow();
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const sessions = await service.getActiveSessions('user-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].userId).toBe('user-1');
    });

    it('should return empty array when no active sessions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const sessions = await service.getActiveSessions('user-1');
      expect(sessions).toEqual([]);
    });
  });

  // ── incrementRetryCount ──

  describe('incrementRetryCount', () => {
    it('should call db update with sessionId', async () => {
      await service.incrementRetryCount('session-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('retry_count = retry_count + 1'),
        ['session-1']
      );
    });
  });

  // ── findDocumentBySessionId ──

  describe('findDocumentBySessionId', () => {
    it('should return null when no document found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await service.findDocumentBySessionId('sess-1');
      expect(result).toBeNull();
    });

    it('should return document id when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'doc-123' }], rowCount: 1 });
      const result = await service.findDocumentBySessionId('sess-1');
      expect(result).toBe('doc-123');
    });
  });

  // ── getStuckSessions ──

  describe('getStuckSessions', () => {
    it('should return sessions stuck longer than threshold', async () => {
      const row = makeSessionRow({ status: 'processing' });
      mockDb.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const sessions = await service.getStuckSessions(10);
      expect(sessions).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [10]
      );
    });
  });

  // ── getRecoverableOnStartup ──

  describe('getRecoverableOnStartup', () => {
    it('should return all assembling/processing sessions', async () => {
      const rows = [makeSessionRow({ status: 'assembling' }), makeSessionRow({ status: 'processing' })];
      mockDb.query.mockResolvedValueOnce({ rows, rowCount: 2 });

      const sessions = await service.getRecoverableOnStartup();
      expect(sessions).toHaveLength(2);
    });
  });

  // ── getFullyUploadedStale ──

  describe('getFullyUploadedStale', () => {
    it('should query with stale minutes parameter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.getFullyUploadedStale(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('uploading'),
        [5]
      );
    });
  });

  // ── tempDirectory getter ──

  describe('tempDirectory', () => {
    it('should return the configured temp dir', () => {
      expect(service.tempDirectory).toContain('/');
    });
  });
});
