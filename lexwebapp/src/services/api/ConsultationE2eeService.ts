/**
 * Consultation E2EE API Service
 * Client for consultation-specific E2EE key management endpoints.
 */

import { BaseService } from '../base/BaseService';

export interface ConsultationE2eeKeysResponse {
  id: string;
  consultation_id: string;
  user_id: string;
  wrapped_root_key: string;
  key_version: number;
  counter_checkpoint: number;
  created_at: string;
  updated_at: string;
}

export interface ConsultationE2eeStatusResponse {
  established: boolean;
  establishedAt: string | null;
  establishedBy: string | null;
  currentKeyVersion: number;
  myKeysPresent: boolean;
  peerKeysPresent: boolean;
  peerHasEncryption: boolean;
}

export class ConsultationE2eeService extends BaseService {
  /**
   * Set up E2EE for a consultation — stores wrapped root keys for both parties.
   */
  async setupKeys(
    consultationId: string,
    wrappedForClient: string,
    wrappedForAttorney: string
  ): Promise<{ ok: boolean }> {
    return this.request(
      () => this.client.post<{ ok: boolean }>(
        `/api/consultations/${consultationId}/e2ee-setup`,
        { wrappedForClient, wrappedForAttorney }
      )
    );
  }

  /**
   * Get the wrapped root key for the current user.
   */
  async getKeys(
    consultationId: string,
    keyVersion?: number
  ): Promise<ConsultationE2eeKeysResponse> {
    const params = keyVersion !== undefined ? `?version=${keyVersion}` : '';
    return this.request(
      () => this.client.get<ConsultationE2eeKeysResponse>(
        `/api/consultations/${consultationId}/e2ee-keys${params}`
      )
    );
  }

  /**
   * Get E2EE status for a consultation.
   */
  async getStatus(consultationId: string): Promise<ConsultationE2eeStatusResponse> {
    return this.request(
      () => this.client.get<ConsultationE2eeStatusResponse>(
        `/api/consultations/${consultationId}/e2ee-status`
      )
    );
  }

  /**
   * Rotate the root key for forward secrecy.
   */
  async rotateKeys(
    consultationId: string,
    wrappedForClient: string,
    wrappedForAttorney: string,
    counterCheckpoint: number
  ): Promise<{ ok: boolean; keyVersion: number }> {
    return this.request(
      () => this.client.post<{ ok: boolean; keyVersion: number }>(
        `/api/consultations/${consultationId}/e2ee-rotate`,
        { wrappedForClient, wrappedForAttorney, counterCheckpoint }
      )
    );
  }
}

export const consultationE2eeService = new ConsultationE2eeService();
