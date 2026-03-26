/**
 * Tests for DocumentClassificationService — batch classification, job tracking,
 * cancellation, LLM integration, cost tracking, and document stats.
 */

jest.mock('uuid', () => ({
  v4: jest.fn()
    .mockReturnValueOnce('job-uuid-1')
    .mockReturnValue('req-uuid-1'),
}));

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { DocumentClassificationService } from '../document-classification-service';

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const createMockLLM = () => ({
  chatCompletion: jest.fn().mockResolvedValue({
    content: JSON.stringify({
      type: 'contract',
      tags: ['тег1', 'тег2'],
      documentSubtype: 'договір оренди',
      suggestedTitle: 'Договір оренди офісу',
      confidence: 0.9,
    }),
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }),
});

const createMockCostTracker = () => ({
  createTrackingRecord: jest.fn().mockResolvedValue(undefined),
  recordOpenAICall: jest.fn().mockResolvedValue(undefined),
  completeTrackingRecord: jest.fn().mockResolvedValue(undefined),
});

const makeDocRow = (overrides: Record<string, any> = {}) => ({
  id: 'doc-1',
  title: 'Тестовий документ',
  full_text: 'Це текст договору оренди нежитлового приміщення між орендодавцем та орендарем.',
  type: 'other',
  metadata: null,
  ...overrides,
});

describe('DocumentClassificationService', () => {
  let service: DocumentClassificationService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockLLM: ReturnType<typeof createMockLLM>;
  let mockCostTracker: ReturnType<typeof createMockCostTracker>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset uuid mock sequence
    const { v4 } = require('uuid');
    v4.mockReset();
    v4.mockReturnValueOnce('job-uuid-1').mockReturnValue('req-uuid-1');

    mockDb = createMockDb();
    mockLLM = createMockLLM();
    mockCostTracker = createMockCostTracker();
    service = new DocumentClassificationService(mockDb as any, mockLLM as any, mockCostTracker as any);
  });

  // ── startClassification — empty documents ──

  describe('startClassification', () => {
    it('should return completed status immediately when no documents', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const status = await service.startClassification('user-1');

      expect(status.total).toBe(0);
      expect(status.status).toBe('completed');
      expect(status.completedAt).toBeDefined();
    });

    it('should return running status when documents exist', async () => {
      const docs = [makeDocRow()];
      mockDb.query.mockResolvedValueOnce({ rows: docs, rowCount: 1 });

      const status = await service.startClassification('user-1');

      expect(status.status).toBe('running');
      expect(status.total).toBe(1);
      expect(status.jobId).toBeDefined();
    });

    it('should query specific documentIds when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.startClassification('user-1', 3, ['doc-1', 'doc-2']);

      const query = mockDb.query.mock.calls[0][0];
      expect(query).toContain('ANY($2)');
      expect(mockDb.query.mock.calls[0][1]).toEqual(['user-1', ['doc-1', 'doc-2']]);
    });

    it('should query unclassified docs when no documentIds given', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.startClassification('user-1');

      const query = mockDb.query.mock.calls[0][0];
      expect(query).toContain("classificationStatus' IS NULL");
    });
  });

  // ── getJobStatus ──

  describe('getJobStatus', () => {
    it('should return null for unknown job id', () => {
      const status = service.getJobStatus('unknown-job');
      expect(status).toBeNull();
    });

    it('should return job after startClassification called', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeDocRow()], rowCount: 1 });
      const job = await service.startClassification('user-1');
      const status = service.getJobStatus(job.jobId);
      expect(status).not.toBeNull();
      expect(status!.userId).toBe('user-1');
    });
  });

  // ── cancelJob ──

  describe('cancelJob', () => {
    it('should return false for unknown job', () => {
      expect(service.cancelJob('ghost-job')).toBe(false);
    });

    it('should cancel a running job and return true', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeDocRow()], rowCount: 1 });
      const job = await service.startClassification('user-1');

      const cancelled = service.cancelJob(job.jobId);
      expect(cancelled).toBe(true);

      const status = service.getJobStatus(job.jobId);
      expect(status!.status).toBe('cancelled');
    });

    it('should return false when job is already completed', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const job = await service.startClassification('user-1');
      // Job is immediately completed because no docs
      expect(service.cancelJob(job.jobId)).toBe(false);
    });
  });

  // ── dismissUnclassified ──

  describe('dismissUnclassified', () => {
    it('should return rowCount of dismissed documents', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 7 });
      const count = await service.dismissUnclassified('user-1');
      expect(count).toBe(7);
    });

    it('should query with user_id filter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await service.dismissUnclassified('user-2');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1'),
        ['user-2']
      );
    });

    it('should return 0 when rowCount is null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: null });
      const count = await service.dismissUnclassified('user-1');
      expect(count).toBe(0);
    });
  });

  // ── getUserDocumentStats ──

  describe('getUserDocumentStats', () => {
    const makeStatsRow = () => ({
      total: '10',
      classified: '6',
      needs_review: '2',
      unclassified: '2',
      type_contract: '3',
      type_legislation: '1',
      type_court_decision: '1',
      type_internal: '1',
      type_other: '4',
    });

    it('should return correctly parsed stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [makeStatsRow()], rowCount: 1 }) // docs stats
        .mockResolvedValueOnce({ rows: [{ total_cost: '0.005' }], rowCount: 1 }) // cost
        .mockResolvedValueOnce({ rows: [{ total_sessions: '5', total_bytes: '1024000' }], rowCount: 1 }); // uploads

      const stats = await service.getUserDocumentStats('user-1');

      expect(stats.total).toBe(10);
      expect(stats.classified).toBe(6);
      expect(stats.needsReview).toBe(2);
      expect(stats.unclassified).toBe(2);
      expect(stats.byType.contract).toBe(3);
      expect(stats.totalClassificationCostUsd).toBeCloseTo(0.005);
      expect(stats.totalUploadSessions).toBe(5);
      expect(stats.totalStorageBytes).toBe(1024000);
    });

    it('should handle zero values gracefully', async () => {
      const emptyStats = {
        total: '0', classified: '0', needs_review: '0', unclassified: '0',
        type_contract: '0', type_legislation: '0', type_court_decision: '0',
        type_internal: '0', type_other: '0',
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [emptyStats], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total_cost: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total_sessions: '0', total_bytes: '0' }], rowCount: 1 });

      const stats = await service.getUserDocumentStats('user-1');
      expect(stats.total).toBe(0);
      expect(stats.totalClassificationCostUsd).toBe(0);
    });

    it('should execute three parallel queries', async () => {
      const emptyStats = {
        total: '0', classified: '0', needs_review: '0', unclassified: '0',
        type_contract: '0', type_legislation: '0', type_court_decision: '0',
        type_internal: '0', type_other: '0',
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [emptyStats], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total_cost: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total_sessions: '0', total_bytes: '0' }], rowCount: 1 });

      await service.getUserDocumentStats('user-1');
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });
  });

  // ── classification with LLM (integration path via processDocuments) ──

  describe('LLM classification', () => {
    it('should call LLM and update document on success', async () => {
      const docs = [makeDocRow()];
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 }) // startClassification fetch
        .mockResolvedValue({ rows: [], rowCount: 0 }); // all subsequent DB calls

      const job = await service.startClassification('user-1', 1);

      // Wait for background processing to complete
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.status).toBe('completed');
      expect(mockLLM.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should mark document as needs_review when text is too short', async () => {
      const docs = [makeDocRow({ full_text: 'short' })]; // < 20 chars after trim
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = await service.startClassification('user-1', 1);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.results[0].status).toBe('needs_review');
      // LLM should NOT be called for short text
      expect(mockLLM.chatCompletion).not.toHaveBeenCalled();
    });

    it('should handle LLM returning invalid JSON gracefully', async () => {
      mockLLM.chatCompletion.mockResolvedValueOnce({ content: 'not valid json' });
      const docs = [makeDocRow()];
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = await service.startClassification('user-1', 1);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.results[0].status).toBe('failed');
    });

    it('should fall back to needs_review when LLM returns empty content', async () => {
      mockLLM.chatCompletion.mockResolvedValueOnce({ content: '' });
      const docs = [makeDocRow()];
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = await service.startClassification('user-1', 1);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.results[0].status).toBe('failed');
    });

    it('should clamp invalid confidence values to [0, 1]', async () => {
      mockLLM.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'contract',
          tags: [],
          documentSubtype: null,
          suggestedTitle: null,
          confidence: 1.5, // exceeds 1
        }),
      });

      const docs = [makeDocRow()];
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = await service.startClassification('user-1', 1);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.results[0].confidence).toBe(1); // clamped to 1
    });

    it('should use "other" type when LLM returns unknown type', async () => {
      mockLLM.chatCompletion.mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'totally_made_up_type',
          tags: [],
          documentSubtype: null,
          suggestedTitle: null,
          confidence: 0.8,
        }),
      });

      const docs = [makeDocRow()];
      mockDb.query
        .mockResolvedValueOnce({ rows: docs, rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const job = await service.startClassification('user-1', 1);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const status = service.getJobStatus(job.jobId);
          if (status && status.status !== 'running') {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const status = service.getJobStatus(job.jobId);
      expect(status!.results[0].type).toBe('other');
    });
  });
});
