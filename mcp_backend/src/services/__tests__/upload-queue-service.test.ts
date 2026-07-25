/**
 * Tests for UploadQueueService — job enqueueing, recovery logic, metrics,
 * callback registration, and lifecycle (start/stop).
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// Mock BullMQ to avoid real Redis connections
const mockJob = {
  id: 'job-1',
  data: {} as any,
  opts: { attempts: 3 },
  attemptsMade: 0,
  getState: jest.fn().mockResolvedValue('waiting'),
  moveToFailed: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockQueueOn = jest.fn();
const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
const mockQueueGetJob = jest.fn().mockResolvedValue(null);
const mockQueueGetJobCounts = jest.fn().mockResolvedValue({
  waiting: 2,
  active: 1,
  completed: 10,
  failed: 0,
  delayed: 0,
});

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
    getJobCounts: mockQueueGetJobCounts,
    close: mockQueueClose,
    on: mockQueueOn,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    concurrency: 10,
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock CpuAdaptiveManager
jest.mock('../cpu-adaptive-manager.js', () => ({
  CpuAdaptiveManager: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

import { UploadQueueService } from '../upload-queue-service';
import type { UploadSession } from '../upload-service';

const createMockUploadService = () => ({
  getSession: jest.fn(),
  findDocumentBySessionId: jest.fn().mockResolvedValue(null),
  setDocumentId: jest.fn().mockResolvedValue(undefined),
  cleanupAssembledFile: jest.fn().mockResolvedValue(undefined),
  incrementRetryCount: jest.fn().mockResolvedValue(undefined),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  assembleFile: jest.fn().mockResolvedValue('/tmp/uploads/session-1/file.pdf'),
});

const createMockMinioService = () => ({});
const createMockVaultTools = () => ({});
const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const makeSession = (overrides: Partial<UploadSession> = {}): UploadSession => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  userId: 'user-1',
  fileName: 'document.pdf',
  fileSize: 1024 * 1024,
  mimeType: 'application/pdf',
  totalChunks: 1,
  chunkSize: 5 * 1024 * 1024,
  uploadedChunks: [0],
  status: 'uploading',
  docType: 'contract',
  retryCount: 0,
  expiresAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('UploadQueueService', () => {
  let service: UploadQueueService;
  let mockUploadService: ReturnType<typeof createMockUploadService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });
    mockQueueGetJob.mockResolvedValue(null);
    mockQueueGetJobCounts.mockResolvedValue({
      waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0,
    });

    mockUploadService = createMockUploadService();
    service = new UploadQueueService(
      mockUploadService as any,
      createMockMinioService() as any,
      createMockVaultTools() as any,
      createMockDb() as any
    );
  });

  afterEach(async () => {
    // Stop service to clear intervals/timers
    await service.stop();
  });

  // ── enqueueProcessing ──

  describe('enqueueProcessing', () => {
    it('should add job to queue and return job id', async () => {
      const session = makeSession();
      const jobId = await service.enqueueProcessing(session);

      expect(jobId).toBe('job-1');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-upload',
        expect.objectContaining({
          sessionId: session.id,
          userId: session.userId,
          fileName: session.fileName,
        }),
        expect.objectContaining({ jobId: `upload-${session.id}` })
      );
    });

    it('should include extraMetadata in job data', async () => {
      const session = makeSession();
      const meta = { source: 'batch', batchId: 'batch-1' };
      await service.enqueueProcessing(session, meta);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-upload',
        expect.objectContaining({ extraMetadata: meta }),
        expect.any(Object)
      );
    });

    it('should use deduplicated jobId based on sessionId', async () => {
      const session = makeSession({ id: 'my-session-id' });
      await service.enqueueProcessing(session);

      const callArgs = mockQueueAdd.mock.calls[0][2];
      expect(callArgs.jobId).toBe('upload-my-session-id');
    });
  });

  // ── enqueueRecovery ──

  describe('enqueueRecovery', () => {
    it('should return 0 when sessions list is empty', async () => {
      const count = await service.enqueueRecovery([]);
      expect(count).toBe(0);
    });

    it('should enqueue sessions that have no existing job', async () => {
      mockQueueGetJob.mockResolvedValueOnce(null);
      const sessions = [makeSession()];
      const count = await service.enqueueRecovery(sessions);

      expect(count).toBe(1);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'process-upload',
        expect.objectContaining({ sessionId: sessions[0].id }),
        expect.any(Object)
      );
    });

    it('should remove waiting job before re-enqueueing', async () => {
      const existingJob = {
        ...mockJob,
        getState: jest.fn().mockResolvedValue('waiting'),
        moveToFailed: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueueGetJob.mockResolvedValueOnce(existingJob);

      const sessions = [makeSession()];
      const count = await service.enqueueRecovery(sessions);

      expect(count).toBe(1);
      expect(existingJob.moveToFailed).toHaveBeenCalled();
      expect(existingJob.remove).toHaveBeenCalled();
    });

    it('should skip sessions that are in active state and remove+re-add them', async () => {
      const existingJob = {
        ...mockJob,
        getState: jest.fn().mockResolvedValue('active'),
        moveToFailed: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueueGetJob.mockResolvedValueOnce(existingJob);

      const sessions = [makeSession()];
      await service.enqueueRecovery(sessions);

      expect(existingJob.moveToFailed).toHaveBeenCalled();
      expect(existingJob.remove).toHaveBeenCalled();
    });

    it('should handle enqueue errors gracefully and count only successes', async () => {
      mockQueueGetJob.mockResolvedValueOnce(null);
      mockQueueAdd
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValue({ id: 'job-2' });

      const sessions = [makeSession({ id: 'sess-fail' }), makeSession({ id: 'sess-ok' })];
      const count = await service.enqueueRecovery(sessions);

      expect(count).toBe(1); // only second session succeeded
    });
  });

  // ── getMetrics ──

  describe('getMetrics', () => {
    it('should return queue metrics with correct fields', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toEqual({
        waiting: 2,
        active: 1,
        completed: 10,
        failed: 0,
        delayed: 0,
      });
    });

    it('should default null counts to 0', async () => {
      mockQueueGetJobCounts.mockResolvedValueOnce({
        waiting: undefined,
        active: undefined,
        completed: undefined,
        failed: undefined,
        delayed: undefined,
      });

      const metrics = await service.getMetrics();
      expect(metrics.waiting).toBe(0);
      expect(metrics.active).toBe(0);
      expect(metrics.completed).toBe(0);
    });
  });

  // ── setMetricsCollector ──

  describe('setMetricsCollector', () => {
    it('should call the callback with metrics on interval', async () => {
      jest.useFakeTimers();
      const callback = jest.fn();
      service.setMetricsCollector(callback);

      jest.advanceTimersByTime(10000);

      // Allow microtasks to run
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should replace previous interval when called twice', () => {
      jest.useFakeTimers();
      const cb1 = jest.fn();
      const cb2 = jest.fn();

      service.setMetricsCollector(cb1);
      service.setMetricsCollector(cb2);

      jest.advanceTimersByTime(10000);

      // cb1 should not be called after replacement
      jest.useRealTimers();
    });
  });

  // ── setProcessingDurationCallback ──

  describe('setProcessingDurationCallback', () => {
    it('should register callback without throwing', () => {
      const cb = jest.fn();
      expect(() => service.setProcessingDurationCallback(cb)).not.toThrow();
    });
  });

  // ── getCpuAdaptiveManager ──

  describe('getCpuAdaptiveManager', () => {
    it('should return null before startWorker is called', () => {
      expect(service.getCpuAdaptiveManager()).toBeNull();
    });

    it('should return manager after startWorker is called', () => {
      process.env.ADAPTIVE_CONCURRENCY = 'true';
      service.startWorker();
      expect(service.getCpuAdaptiveManager()).not.toBeNull();
      delete process.env.ADAPTIVE_CONCURRENCY;
    });
  });

  // ── startWorker ──

  describe('startWorker', () => {
    it('should create a Worker instance', () => {
      const { Worker } = require('bullmq');
      service.startWorker();
      expect(Worker).toHaveBeenCalled();
    });

    it('should not start CpuAdaptiveManager when ADAPTIVE_CONCURRENCY=false', () => {
      process.env.ADAPTIVE_CONCURRENCY = 'false';
      service.startWorker();
      expect(service.getCpuAdaptiveManager()).toBeNull();
      delete process.env.ADAPTIVE_CONCURRENCY;
    });
  });

  // ── stop ──

  describe('stop', () => {
    it('should close queue and worker cleanly', async () => {
      service.startWorker();
      await service.stop();
      expect(mockQueueClose).toHaveBeenCalled();
    });

    it('should stop CpuAdaptiveManager if started', async () => {
      process.env.ADAPTIVE_CONCURRENCY = 'true';
      service.startWorker();
      const manager = service.getCpuAdaptiveManager();
      await service.stop();
      expect(manager?.stop).toHaveBeenCalled();
      delete process.env.ADAPTIVE_CONCURRENCY;
    });

    it('should clear metrics interval on stop', async () => {
      jest.useFakeTimers();
      const cb = jest.fn();
      service.setMetricsCollector(cb);
      await service.stop();
      jest.advanceTimersByTime(15000);
      // callback should NOT be called after stop
      jest.useRealTimers();
    });
  });
});
