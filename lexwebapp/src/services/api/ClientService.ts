/**
 * Client Service
 * Handles client management operations via /api/matters/clients
 */

import { BaseService } from '../base/BaseService';
import { Client, CreateClientRequest, UpdateClientRequest, ClientsListResponse } from '../../types/models';

export interface SearchClientsParams {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class ClientService extends BaseService {
  /**
   * List clients with optional filters
   */
  async getClients(params?: SearchClientsParams): Promise<ClientsListResponse> {
    return this.request(() => this.client.get<ClientsListResponse>('/api/matters/clients', { params }));
  }

  /**
   * Get client by ID
   */
  async getClientById(id: string): Promise<Client> {
    return this.request(() => this.client.get<Client>(`/api/matters/clients/${id}`));
  }

  /**
   * Create new client
   */
  async createClient(data: CreateClientRequest): Promise<Client> {
    return this.request(() => this.client.post<Client>('/api/matters/clients', data));
  }

  /**
   * Update client
   */
  async updateClient(id: string, data: UpdateClientRequest): Promise<Client> {
    return this.request(() => this.client.put<Client>(`/api/matters/clients/${id}`, data));
  }

  /**
   * Run conflict check for a client
   */
  async runConflictCheck(id: string): Promise<import('../../types/models/Matter').ConflictResult> {
    return this.request(() => this.client.post(`/api/matters/clients/${id}/conflict-check`));
  }
}

// Export singleton instance
export const clientService = new ClientService();
