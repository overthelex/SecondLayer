/**
 * Tests for ConsultationService — CRUD, status transitions, messaging,
 * authorization, reviews, disputes, and email notifications.
 */

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid-1') }));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../consultation-message-bus.js', () => ({
  getConsultationMessageBus: jest.fn().mockReturnValue({
    publish: jest.fn(),
    publishStatus: jest.fn(),
    publishConsultationStatus: jest.fn(),
    publishUserEvent: jest.fn(),
    publishTyping: jest.fn(),
  }),
}));

import { ConsultationService } from '../consultation-service';
import { getConsultationMessageBus } from '../consultation-message-bus.js';

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const createMockMatterService = () => ({
  addTeamMember: jest.fn().mockResolvedValue(undefined),
  removeTeamMember: jest.fn().mockResolvedValue(undefined),
});

const createMockAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const createMockAttorneyProfileService = () => ({
  updateStats: jest.fn().mockResolvedValue(undefined),
});

const createMockEmailService = () => ({
  sendConsultationRequestEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationAcceptedEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationDeclinedEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationPaidEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationCompletedEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationCancelledEmail: jest.fn().mockResolvedValue(undefined),
  sendConsultationDisputeEmail: jest.fn().mockResolvedValue(undefined),
});

const MOCK_CONSULTATION = {
  id: 'cons-1',
  client_user_id: 'client-1',
  attorney_user_id: 'attorney-1',
  status: 'pending',
  request_title: 'Правова допомога',
  consultation_type: 'consultation',
  urgency: 'normal',
  share_documents: false,
  share_conversations: false,
  document_ids: [],
  conversation_ids: [],
  fee_type: 'fixed',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ConsultationService', () => {
  let service: ConsultationService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockMatterService: ReturnType<typeof createMockMatterService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;
  let mockAttorneyProfileService: ReturnType<typeof createMockAttorneyProfileService>;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockBus: ReturnType<typeof getConsultationMessageBus>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockMatterService = createMockMatterService();
    mockAuditService = createMockAuditService();
    mockAttorneyProfileService = createMockAttorneyProfileService();
    mockEmailService = createMockEmailService();
    mockBus = getConsultationMessageBus();

    service = new ConsultationService(
      mockDb as any,
      mockMatterService as any,
      mockAuditService as any,
      mockAttorneyProfileService as any
    );
    service.setEmailService(mockEmailService as any);
  });

  describe('createConsultation', () => {
    it('should create consultation and return it', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [{ name: 'Attorney', email: 'a@test.com' }] }); // getUserInfo for email

      const result = await service.createConsultation('client-1', {
        attorneyUserId: 'attorney-1',
        requestTitle: 'Правова допомога',
      });

      expect(result).toEqual(MOCK_CONSULTATION);
      expect(mockDb.query).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'consultation.created' })
      );
    });

    it('should send email to attorney (fire-and-forget)', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [{ name: 'Attorney', email: 'a@test.com' }] }) // getUserInfo(attorney)
        .mockResolvedValueOnce({ rows: [{ name: 'Client', email: 'c@test.com' }] }) // getUserInfo(client)
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }); // getConsultation for enriched event

      await service.createConsultation('client-1', {
        attorneyUserId: 'attorney-1',
        requestTitle: 'Допомога',
      });

      // Email is fire-and-forget via .then() chains — flush microtasks
      await new Promise(resolve => setImmediate(resolve));

      expect(mockEmailService.sendConsultationRequestEmail).toHaveBeenCalled();
    });

    it('should publish status event', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ name: 'Attorney', email: 'a@test.com' }] });

      await service.createConsultation('client-1', {
        attorneyUserId: 'attorney-1',
        requestTitle: 'Test',
      });

      expect(mockBus.publishConsultationStatus).toHaveBeenCalled();
    });
  });

  describe('getConsultation', () => {
    it('should return consultation when user is a party', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [MOCK_CONSULTATION],
        rowCount: 1,
      });

      const result = await service.getConsultation('cons-1', 'client-1');
      expect(result).toEqual(MOCK_CONSULTATION);
    });

    it('should return null when consultation not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getConsultation('nonexistent', 'client-1');
      expect(result).toBeNull();
    });
  });

  describe('listConsultations', () => {
    it('should return paginated list', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [MOCK_CONSULTATION],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await service.listConsultations('client-1');

      expect(result.consultations).toHaveLength(1);
      expect(result.total).toBe(5);
    });

    it('should filter by role', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listConsultations('attorney-1', { role: 'attorney' });

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('attorney_user_id');
    });

    it('should cap limit at 100', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listConsultations('client-1', { limit: 500 });

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain(100); // capped
    });
  });

  describe('acceptConsultation', () => {
    it('should accept pending consultation', async () => {
      const accepted = { ...MOCK_CONSULTATION, status: 'accepted' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }) // requireConsultation
        .mockResolvedValueOnce({ rows: [accepted], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ name: 'Client', email: 'c@test.com' }] }) // getUserInfo
        .mockResolvedValueOnce({ rows: [accepted] }); // getConsultationById for event

      const result = await service.acceptConsultation('cons-1', 'attorney-1', 5000);

      expect(result.status).toBe('accepted');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'consultation.accepted' })
      );
    });

    it('should throw if not pending', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...MOCK_CONSULTATION, status: 'completed' }],
        rowCount: 1,
      });

      await expect(
        service.acceptConsultation('cons-1', 'attorney-1')
      ).rejects.toThrow();
    });
  });

  describe('declineConsultation', () => {
    it('should decline pending consultation with reason', async () => {
      const declined = { ...MOCK_CONSULTATION, status: 'declined' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [declined], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ name: 'Client', email: 'c@test.com' }] })
        .mockResolvedValueOnce({ rows: [declined] });

      const result = await service.declineConsultation('cons-1', 'attorney-1', 'Зайнятий');

      expect(result.status).toBe('declined');
      expect(mockEmailService.sendConsultationDeclinedEmail).toHaveBeenCalled();
    });
  });

  describe('completeConsultation', () => {
    it('should complete in_progress consultation', async () => {
      const inProgress = { ...MOCK_CONSULTATION, status: 'in_progress', matter_id: 'matter-1' };
      const completed = { ...inProgress, status: 'completed' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [inProgress], rowCount: 1 }) // requireConsultation
        .mockResolvedValueOnce({ rows: [completed], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // revoke E2EE keys
        .mockResolvedValueOnce({ rows: [{ name: 'Client', email: 'c@test.com' }] }) // getUserInfo
        .mockResolvedValueOnce({ rows: [completed] }); // getConsultationById

      const result = await service.completeConsultation('cons-1', 'attorney-1', 'Summary');

      expect(result.status).toBe('completed');
      expect(mockMatterService.removeTeamMember).toHaveBeenCalled();
    });
  });

  describe('cancelConsultation', () => {
    it('should cancel pending consultation', async () => {
      const cancelled = { ...MOCK_CONSULTATION, status: 'cancelled' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [cancelled], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ name: 'Attorney', email: 'a@test.com' }] })
        .mockResolvedValueOnce({ rows: [cancelled] });

      const result = await service.cancelConsultation('cons-1', 'client-1', 'Не потрібно');

      expect(result.status).toBe('cancelled');
    });

    it('should throw for terminal status', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...MOCK_CONSULTATION, status: 'completed' }],
        rowCount: 1,
      });

      await expect(
        service.cancelConsultation('cons-1', 'client-1')
      ).rejects.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should create message and publish to bus', async () => {
      const mockMsg = {
        id: 'msg-1',
        consultation_id: 'cons-1',
        sender_id: 'client-1',
        content: 'Привіт',
        message_type: 'text',
        status: 'sent',
        created_at: new Date(),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }) // requireConsultation
        .mockResolvedValueOnce({ rows: [mockMsg], rowCount: 1 }) // INSERT message
        .mockResolvedValueOnce({ rows: [{ name: 'Client' }] }); // sender name

      const result = await service.sendMessage('cons-1', 'client-1', 'Привіт');

      expect(result.content).toBe('Привіт');
      expect(mockBus.publish).toHaveBeenCalled();
    });

    it('should throw if user is not party to consultation', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        service.sendMessage('cons-1', 'stranger', 'Hello')
      ).rejects.toThrow();
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 }) // requireConsultation
        .mockResolvedValueOnce({ // messages
          rows: [{ id: 'msg-1', content: 'Test', sender_id: 'attorney-1', sender_name: 'Attorney' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // total count
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // mark as read

      const result = await service.getMessages('cons-1', 'client-1');

      expect(result.messages).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread message count', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_CONSULTATION], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const count = await service.getUnreadCount('cons-1', 'client-1');
      expect(count).toBe(3);
    });
  });

  describe('submitReview', () => {
    it('should submit review for completed consultation', async () => {
      const completed = { ...MOCK_CONSULTATION, status: 'completed' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [completed], rowCount: 1 }) // requireConsultation (client)
        .mockResolvedValueOnce({ rows: [{ id: 'review-1' }], rowCount: 1 }); // INSERT review

      const result = await service.submitReview('cons-1', 'client-1', {
        rating: 5,
        reviewText: 'Відмінно!',
      });

      expect(result).toBeDefined();
      expect(mockAttorneyProfileService.updateStats).toHaveBeenCalledWith('attorney-1');
    });

    it('should throw if consultation not completed', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [MOCK_CONSULTATION], // status: pending
        rowCount: 1,
      });

      await expect(
        service.submitReview('cons-1', 'client-1', { rating: 5 })
      ).rejects.toThrow();
    });
  });

  describe('raiseDispute', () => {
    it('should raise dispute for in_progress consultation', async () => {
      const inProgress = { ...MOCK_CONSULTATION, status: 'in_progress' };
      const disputed = { ...inProgress, status: 'disputed' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [inProgress], rowCount: 1 }) // requireConsultation
        .mockResolvedValueOnce({ rows: [disputed], rowCount: 1 }) // UPDATE consultation
        .mockResolvedValueOnce({ rows: [{ id: 'dispute-1' }], rowCount: 1 }) // INSERT dispute
        .mockResolvedValueOnce({ rows: [{ name: 'Attorney', email: 'a@test.com' }] }) // getUserInfo
        .mockResolvedValueOnce({ rows: [disputed] }); // getConsultationById

      const result = await service.raiseDispute('cons-1', 'client-1', 'Неякісна робота');

      expect(result.consultation.status).toBe('disputed');
      expect(result.dispute).toBeDefined();
    });
  });

  describe('getUnseenPending', () => {
    it('should return unseen pending consultations', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [MOCK_CONSULTATION],
        rowCount: 1,
      });

      const result = await service.getUnseenPending('attorney-1');
      expect(result.consultations).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  describe('markViewed', () => {
    it('should mark consultations as viewed', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.markViewed(['cons-1', 'cons-2'], 'attorney-1');

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should skip empty ids array', async () => {
      await service.markViewed([], 'attorney-1');
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('getAttorneyClients', () => {
    it('should return aggregated client list', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          client_id: 'client-1',
          client_name: 'Client',
          client_email: 'c@test.com',
          total_consultations: '2',
          active_consultations: '1',
          last_consultation_at: new Date(),
        }],
        rowCount: 1,
      });

      const result = await service.getAttorneyClients('attorney-1');
      expect(result).toHaveLength(1);
      expect(result[0].client_name).toBe('Client');
    });
  });
});
