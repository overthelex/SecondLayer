/**
 * Matter Service
 * Handles matter, team, hold, and audit operations via /api/matters
 */

import { BaseService } from '../base/BaseService';
import {
  Matter,
  CreateMatterRequest,
  UpdateMatterRequest,
  MattersListResponse,
  MatterTeamMember,
  MatterTeamRole,
  MatterAccessLevel,
  LegalHold,
  CreateHoldRequest,
  AuditLogResponse,
  AuditValidationResult,
} from '../../types/models/Matter';

export interface SearchMattersParams {
  search?: string;
  status?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}

export interface MatterDocument {
  id: string;
  title: string;
  type: string;
  mime_type?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogParams {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export class MatterService extends BaseService {
  // ─── Matters ───────────────────────────────────────────

  async getMatters(params?: SearchMattersParams): Promise<MattersListResponse> {
    return this.request(() => this.client.get<MattersListResponse>('/api/matters/matters', { params }));
  }

  async getMatterById(id: string): Promise<Matter> {
    return this.request(() => this.client.get<Matter>(`/api/matters/matters/${id}`));
  }

  async createMatter(data: CreateMatterRequest): Promise<Matter> {
    return this.request(() => this.client.post<Matter>('/api/matters/matters', data));
  }

  async updateMatter(id: string, data: UpdateMatterRequest): Promise<Matter> {
    return this.request(() => this.client.put<Matter>(`/api/matters/matters/${id}`, data));
  }

  async closeMatter(id: string): Promise<Matter> {
    return this.request(() => this.client.post<Matter>(`/api/matters/matters/${id}/close`));
  }

  // ─── Team ──────────────────────────────────────────────

  async getTeamMembers(matterId: string): Promise<{ members: MatterTeamMember[] }> {
    return this.request(() => this.client.get<{ members: MatterTeamMember[] }>(
      `/api/matters/matters/${matterId}/team`
    ));
  }

  async addTeamMember(
    matterId: string,
    memberId: string,
    role: MatterTeamRole = 'associate',
    accessLevel: MatterAccessLevel = 'full'
  ): Promise<MatterTeamMember> {
    return this.request(() => this.client.post<MatterTeamMember>(
      `/api/matters/matters/${matterId}/team`,
      { memberId, role, accessLevel }
    ));
  }

  async removeTeamMember(matterId: string, userId: string): Promise<void> {
    return this.requestVoid(() => this.client.delete(`/api/matters/matters/${matterId}/team/${userId}`));
  }

  // ─── Legal Holds ───────────────────────────────────────

  async getHolds(matterId: string): Promise<{ holds: LegalHold[] }> {
    return this.request(() => this.client.get<{ holds: LegalHold[] }>(
      `/api/matters/matters/${matterId}/holds`
    ));
  }

  async createHold(matterId: string, data: CreateHoldRequest): Promise<LegalHold> {
    return this.request(() => this.client.post<LegalHold>(
      `/api/matters/matters/${matterId}/holds`,
      data
    ));
  }

  async releaseHold(holdId: string): Promise<LegalHold> {
    return this.request(() => this.client.post<LegalHold>(`/api/matters/holds/${holdId}/release`));
  }

  async addDocumentsToHold(holdId: string, documentIds: string[]): Promise<{ added: number }> {
    return this.request(() => this.client.post(
      `/api/matters/holds/${holdId}/documents`,
      { documentIds }
    ));
  }

  // ─── Matter Documents ────────────────────────────────────

  async getMatterDocuments(matterId: string): Promise<{ documents: MatterDocument[]; total: number }> {
    return this.request(() => this.client.get<{ documents: MatterDocument[]; total: number }>(
      `/api/matters/matters/${matterId}/documents`
    ));
  }

  async assignDocumentsToMatter(matterId: string, documentIds: string[]): Promise<{ assigned: number }> {
    return this.request(() => this.client.put<{ assigned: number }>(
      `/api/matters/matters/${matterId}/documents/assign`,
      { documentIds }
    ));
  }

  async unassignDocumentsFromMatter(matterId: string, documentIds: string[]): Promise<{ unassigned: number }> {
    return this.request(() => this.client.put<{ unassigned: number }>(
      `/api/matters/matters/${matterId}/documents/unassign`,
      { documentIds }
    ));
  }

  // ─── Audit ─────────────────────────────────────────────

  async getAuditLog(params?: AuditLogParams): Promise<AuditLogResponse> {
    return this.request(() => this.client.get<AuditLogResponse>('/api/matters/audit', { params }));
  }

  async validateAuditChain(): Promise<AuditValidationResult> {
    return this.request(() => this.client.get<AuditValidationResult>('/api/matters/audit/validate'));
  }
}

// Export singleton instance
export const matterService = new MatterService();
