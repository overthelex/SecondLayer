/**
 * Tests for MatterService — client CRUD, matter CRUD, team management,
 * document assignment, organization helpers, and access control.
 */

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid') }));

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { MatterService } from '../matter-service';

const createMockDb = () => {
  const mockTxClient = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: jest.fn().mockImplementation(async (cb: Function) => cb(mockTxClient)),
    _mockTxClient: mockTxClient,
  };
};

const createMockAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

describe('MatterService', () => {
  let service: MatterService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockAudit = createMockAudit();
    service = new MatterService(mockDb as any, mockAudit as any);
  });

  // ── Client CRUD ──

  describe('createClient', () => {
    it('should create client with defaults', async () => {
      const mockClient = { id: 'mock-uuid', client_name: 'Test Client', client_type: 'individual' };
      mockDb.query.mockResolvedValueOnce({ rows: [mockClient], rowCount: 1 });

      const result = await service.createClient('org-1', { clientName: 'Test Client' }, 'user-1');

      expect(result.client_name).toBe('Test Client');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'client.create' })
      );
    });
  });

  describe('updateClient', () => {
    it('should update client fields', async () => {
      const updated = { id: 'cl-1', client_name: 'Updated', client_type: 'business' };
      mockDb.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await service.updateClient('cl-1', { clientName: 'Updated', clientType: 'business' }, 'user-1');

      expect(result?.client_name).toBe('Updated');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should return null when no fields to update', async () => {
      const result = await service.updateClient('cl-1', {}, 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('getClient', () => {
    it('should return client by id and org', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'cl-1', client_name: 'Client' }],
        rowCount: 1,
      });

      const result = await service.getClient('cl-1', 'org-1');
      expect(result).toBeDefined();
    });

    it('should return null when not found', async () => {
      const result = await service.getClient('nonexistent', 'org-1');
      expect(result).toBeNull();
    });
  });

  describe('listClients', () => {
    it('should return paginated client list', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'cl-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await service.listClients('org-1');

      expect(result.clients).toHaveLength(1);
      expect(result.total).toBe(5);
    });

    it('should filter by search term', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listClients('org-1', { search: 'test' });

      expect(mockDb.query.mock.calls[0][0]).toContain('ILIKE');
    });
  });

  // ── Matter CRUD ──

  describe('createMatter', () => {
    it('should create matter with auto-generated number', async () => {
      // generateMatterNumber uses db.query
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ client_name: 'TestClient' }] }) // client name for number gen
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // sequence count

      // transaction callback uses txClient.query
      const txClient = mockDb._mockTxClient;
      txClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid', matter_number: 'TES-2026-001' }], rowCount: 1 }) // INSERT matter
        .mockResolvedValueOnce({ rows: [{ id: 'team-1' }], rowCount: 1 }); // INSERT team member

      const result = await service.createMatter({
        clientId: 'cl-1',
        matterName: 'Test Case',
      }, 'user-1');

      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'matter.create' })
      );
    });
  });

  describe('getMatter', () => {
    it('should return matter when user has access', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'mat-1', matter_name: 'Test' }],
        rowCount: 1,
      });

      const result = await service.getMatter('mat-1', 'user-1');
      expect(result?.matter_name).toBe('Test');
    });

    it('should return null when no access', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getMatter('mat-1', 'stranger');
      expect(result).toBeNull();
    });
  });

  describe('listMatters', () => {
    it('should return paginated matters', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'mat-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const result = await service.listMatters('org-1', 'user-1');

      expect(result.matters).toHaveLength(1);
      expect(result.total).toBe(3);
    });

    it('should filter by status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.listMatters('org-1', 'user-1', { status: 'active' });

      expect(mockDb.query.mock.calls[0][0]).toContain('status');
    });
  });

  describe('closeMatter', () => {
    it('should close matter', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'mat-1', status: 'closed' }],
        rowCount: 1,
      });

      const result = await service.closeMatter('mat-1', 'user-1');

      expect(result?.status).toBe('closed');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'matter.close' })
      );
    });

    it('should return null when matter not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.closeMatter('nonexistent', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ── Team Management ──

  describe('addTeamMember', () => {
    it('should add team member with upsert', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'tm-1', matter_id: 'mat-1', user_id: 'user-2', role: 'associate', access_level: 'full' }],
        rowCount: 1,
      });

      const result = await service.addTeamMember('mat-1', 'user-2', 'associate', 'full', 'user-1');

      expect(result.role).toBe('associate');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'matter.team.add' })
      );
    });
  });

  describe('removeTeamMember', () => {
    it('should soft-delete team member', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'tm-1' }], rowCount: 1 });

      const result = await service.removeTeamMember('mat-1', 'user-2', 'user-1');

      expect(result).toBe(true);
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should return false when member not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.removeTeamMember('mat-1', 'nonexistent', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('getTeamMembers', () => {
    it('should return active team members', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'tm-1', user_id: 'user-1', role: 'lead_attorney', user_name: 'Lead' },
          { id: 'tm-2', user_id: 'user-2', role: 'associate', user_name: 'Associate' },
        ],
        rowCount: 2,
      });

      const result = await service.getTeamMembers('mat-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('isUserOnMatter', () => {
    it('should return true when user is on team', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'tm-1' }], rowCount: 1 });

      const result = await service.isUserOnMatter('mat-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false when user is not on team', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.isUserOnMatter('mat-1', 'stranger');
      expect(result).toBe(false);
    });
  });

  // ── Organization Helpers ──

  describe('getUserOrgId', () => {
    it('should return org id for user', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ organization_id: 'org-1' }],
        rowCount: 1,
      });

      const result = await service.getUserOrgId('user-1');
      expect(result).toBe('org-1');
    });

    it('should return null when user has no org', async () => {
      const result = await service.getUserOrgId('orphan');
      expect(result).toBeNull();
    });
  });

  describe('ensureUserOrg', () => {
    it('should return existing org', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ organization_id: 'org-1' }],
        rowCount: 1,
      });

      const result = await service.ensureUserOrg('user-1');
      expect(result).toBe('org-1');
    });

    it('should create personal org when none exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getUserOrgId
        .mockResolvedValueOnce({ rows: [{ name: 'User', email: 'u@test.com' }] }) // user info
        .mockResolvedValueOnce({ rows: [{ id: 'new-org' }], rowCount: 1 }) // create org
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // add member

      const result = await service.ensureUserOrg('user-1');
      expect(result).toBe('new-org');
    });
  });

  describe('isOrgAdmin', () => {
    it('should return true for owner', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 });

      const result = await service.isOrgAdmin('org-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false for regular member', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.isOrgAdmin('org-1', 'user-2');
      expect(result).toBe(false);
    });
  });

  // ── Document Assignment ──

  describe('assignDocumentsToMatter', () => {
    it('should assign documents when user has access', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'tm-1' }], rowCount: 1 }) // isUserOnMatter
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }], rowCount: 1 }) // getUserOrgId
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // isOrgAdmin (not needed, hasAccess=true)
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }); // UPDATE documents

      const result = await service.assignDocumentsToMatter('mat-1', ['doc-1', 'doc-2'], 'user-1');
      expect(result.assigned).toBe(2);
    });

    it('should throw when user has no access', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // isUserOnMatter
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getUserOrgId
        ; // isOrgAdmin skipped since orgId is null

      await expect(
        service.assignDocumentsToMatter('mat-1', ['doc-1'], 'stranger')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('unassignDocumentsFromMatter', () => {
    it('should unassign documents', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'tm-1' }], rowCount: 1 }) // isUserOnMatter
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }], rowCount: 1 }) // getUserOrgId
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // isOrgAdmin
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

      const result = await service.unassignDocumentsFromMatter('mat-1', ['doc-1'], 'user-1');
      expect(result.unassigned).toBe(1);
    });
  });

  describe('listMatterDocuments', () => {
    it('should return paginated documents', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'tm-1' }], rowCount: 1 }) // isUserOnMatter
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }], rowCount: 1 }) // getUserOrgId
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // isOrgAdmin
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT
        .mockResolvedValueOnce({ rows: [{ id: 'doc-1', title: 'Doc', type: 'pdf', mime_type: 'application/pdf', metadata: '{}', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }); // SELECT docs

      const result = await service.listMatterDocuments('mat-1', 'user-1');

      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
