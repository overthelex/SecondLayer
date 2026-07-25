/**
 * Tests for TimeEntryService — CRUD, status transitions, timers, billing rates.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('te-uuid') }));

import { TimeEntryService } from '../time-entry-service';

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const createMockAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const MOCK_ENTRY = {
  id: 'te-1',
  matter_id: 'mat-1',
  user_id: 'user-1',
  entry_date: '2026-03-15',
  duration_minutes: 120,
  hourly_rate_usd: '200.00',
  description: 'Legal research',
  billable: true,
  status: 'draft',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('TimeEntryService', () => {
  let service: TimeEntryService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockAudit = createMockAudit();
    service = new TimeEntryService(mockDb as any, mockAudit as any);
  });

  describe('createEntry', () => {
    it('should create time entry with auto rate', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ hourly_rate_usd: '200.00' }] }) // getUserRate
        .mockResolvedValueOnce({ rows: [MOCK_ENTRY], rowCount: 1 }); // INSERT

      const result = await service.createEntry({
        matter_id: 'mat-1',
        user_id: 'user-1',
        entry_date: '2026-03-15',
        duration_minutes: 120,
        description: 'Legal research',
        billable: true,
        created_by: 'user-1',
      });

      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'time_entry.create' })
      );
    });
  });

  describe('updateEntry', () => {
    it('should update draft entry', async () => {
      const updated = { ...MOCK_ENTRY, description: 'Updated' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_ENTRY], rowCount: 1 }) // get existing
        .mockResolvedValueOnce({ rows: [updated], rowCount: 1 }); // UPDATE

      const result = await service.updateEntry('te-1', { description: 'Updated' }, 'user-1');

      expect(result?.description).toBe('Updated');
    });

    it('should throw if entry is approved', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...MOCK_ENTRY, status: 'approved' }],
        rowCount: 1,
      });

      await expect(
        service.updateEntry('te-1', { description: 'Change' }, 'user-1')
      ).rejects.toThrow();
    });
  });

  describe('deleteEntry', () => {
    it('should delete draft entry', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [MOCK_ENTRY], rowCount: 1 });

      await expect(service.deleteEntry('te-1', 'user-1')).resolves.not.toThrow();
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should throw if entry is not draft/rejected', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...MOCK_ENTRY, status: 'submitted' }],
        rowCount: 1,
      });

      await expect(service.deleteEntry('te-1', 'user-1')).rejects.toThrow();
    });
  });

  describe('listEntries', () => {
    it('should return paginated entries', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // COUNT first
        .mockResolvedValueOnce({ rows: [MOCK_ENTRY], rowCount: 1 }); // entries

      const result = await service.listEntries({ matter_id: 'mat-1' });

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(10);
    });

    it('should filter by status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // entries

      await service.listEntries({ status: 'approved' });

      expect(mockDb.query.mock.calls[0][0]).toContain('status');
    });
  });

  describe('submitForApproval', () => {
    it('should submit draft entry', async () => {
      const submitted = { ...MOCK_ENTRY, status: 'submitted' };
      mockDb.query.mockResolvedValueOnce({ rows: [submitted], rowCount: 1 });

      const result = await service.submitForApproval('te-1', 'user-1');

      expect(result.status).toBe('submitted');
    });

    it('should throw when entry not found or wrong status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.submitForApproval('nonexistent', 'user-1')).rejects.toThrow();
    });
  });

  describe('approveEntry', () => {
    it('should approve submitted entry', async () => {
      const approved = { ...MOCK_ENTRY, status: 'approved' };
      mockDb.query.mockResolvedValueOnce({ rows: [approved], rowCount: 1 });

      const result = await service.approveEntry('te-1', 'approver-1');

      expect(result.status).toBe('approved');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'time_entry.approve' })
      );
    });
  });

  describe('rejectEntry', () => {
    it('should reject submitted entry with notes', async () => {
      const rejected = { ...MOCK_ENTRY, status: 'rejected' };
      mockDb.query.mockResolvedValueOnce({ rows: [rejected], rowCount: 1 });

      const result = await service.rejectEntry('te-1', 'approver-1', 'Needs more detail');

      expect(result.status).toBe('rejected');
    });
  });

  describe('startTimer', () => {
    it('should start new timer', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
        .mockResolvedValueOnce({
          rows: [{ id: 'timer-1', user_id: 'user-1', matter_id: 'mat-1', started_at: new Date() }],
          rowCount: 1,
        });

      const result = await service.startTimer({
        user_id: 'user-1',
        matter_id: 'mat-1',
        description: 'Research',
      });

      expect(result).toBeDefined();
    });

    it('should return existing timer if already running', async () => {
      const existing = { id: 'timer-1', user_id: 'user-1', matter_id: 'mat-1', started_at: new Date() };
      mockDb.query.mockResolvedValueOnce({ rows: [existing], rowCount: 1 });

      const result = await service.startTimer({
        user_id: 'user-1',
        matter_id: 'mat-1',
      });

      expect(result.id).toBe('timer-1');
    });
  });

  describe('stopTimer', () => {
    it('should stop timer and optionally create entry', async () => {
      const timer = { id: 'timer-1', user_id: 'user-1', matter_id: 'mat-1', started_at: new Date(Date.now() - 3600000), description: 'Work' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [timer], rowCount: 1 }) // DELETE timer
        .mockResolvedValueOnce({ rows: [{ hourly_rate_usd: '200.00' }] }) // getUserRate
        .mockResolvedValueOnce({ rows: [MOCK_ENTRY], rowCount: 1 }); // INSERT entry

      const result = await service.stopTimer('timer-1', 'user-1', true);

      expect(result).toBeDefined();
    });
  });

  describe('getActiveTimers', () => {
    it('should return active timers with elapsed seconds', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'timer-1', started_at: new Date(Date.now() - 60000), elapsed_seconds: '60' }],
        rowCount: 1,
      });

      const result = await service.getActiveTimers('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getUserRate', () => {
    it('should return current billing rate', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ hourly_rate_usd: '250.00', is_default: false }],
        rowCount: 1,
      });

      const result = await service.getUserRate('user-1');
      expect(result).toBeDefined();
    });

    it('should return 0 when no rate set', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ get_user_billing_rate: null }] });
      const result = await service.getUserRate('user-1');
      expect(result).toBe(0);
    });
  });

  describe('setUserRate', () => {
    it('should create new billing rate', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'rate-1', hourly_rate_usd: '300.00', effective_from: new Date() }],
        rowCount: 1,
      });

      const result = await service.setUserRate('user-1', 300, '2026-01-01', null, true, 'admin-1');
      expect(result.hourly_rate_usd).toBe('300.00');
    });
  });

  describe('getUserRateHistory', () => {
    it('should return rate history', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { hourly_rate_usd: '300.00', effective_from: new Date() },
          { hourly_rate_usd: '200.00', effective_from: new Date(Date.now() - 86400000) },
        ],
        rowCount: 2,
      });

      const result = await service.getUserRateHistory('user-1');
      expect(result).toHaveLength(2);
    });
  });
});
