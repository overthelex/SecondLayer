/**
 * Encryption Service
 * API client for E2EE key management endpoints.
 */

import { BaseService } from '../base/BaseService';

export interface EncryptionKeySetupResponse {
  id: string;
  public_key: string;
  kdf_algorithm: string;
  kdf_params: Record<string, unknown>;
  key_version: number;
}

export interface EncryptionStatusResponse {
  has_encryption: boolean;
}

export interface PublicKeyResponse {
  public_key: string;
}

export interface MyKeyResponse {
  encrypted_private_key: string;
  kdf_algorithm: string;
  kdf_params: Record<string, unknown>;
  key_version: number;
}

export interface DocumentKeyResponse {
  id: string;
  document_id: string;
  user_id: string;
  encrypted_dek: string;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface DocumentSharesResponse {
  shares: DocumentKeyResponse[];
}

export interface DiiaRecoveryResponse {
  diia_encrypted_master_secret: string;
  diia_recovery_challenge: string;
  diia_recovery_salt: string;
}

export class EncryptionService extends BaseService {
  /**
   * Initialize encryption keys for the current user
   */
  async setupKeys(data: {
    public_key: string;
    encrypted_private_key: string;
    kdf_algorithm: string;
    kdf_params: Record<string, unknown>;
  }): Promise<EncryptionKeySetupResponse> {
    return this.request(
      () => this.client.post<EncryptionKeySetupResponse>('/encryption/setup', data)
    );
  }

  /**
   * Check if the current user has encryption set up
   */
  async getStatus(): Promise<EncryptionStatusResponse> {
    return this.request(
      () => this.client.get<EncryptionStatusResponse>('/encryption/status')
    );
  }

  /**
   * Get any user's public key (for sharing)
   */
  async getPublicKey(userId: string): Promise<PublicKeyResponse> {
    return this.request(
      () => this.client.get<PublicKeyResponse>(`/encryption/public-key/${userId}`)
    );
  }

  /**
   * Get the current user's encrypted private key + KDF params
   */
  async getMyKey(): Promise<MyKeyResponse> {
    return this.request(
      () => this.client.get<MyKeyResponse>('/encryption/my-key')
    );
  }

  /**
   * Store a wrapped DEK for a document
   */
  async saveDocumentKey(documentId: string, encryptedDek: string): Promise<DocumentKeyResponse> {
    return this.request(
      () => this.client.post<DocumentKeyResponse>('/encryption/document-keys', {
        document_id: documentId,
        encrypted_dek: encryptedDek,
      })
    );
  }

  /**
   * Get the wrapped DEK for a document
   */
  async getDocumentKey(documentId: string): Promise<DocumentKeyResponse> {
    return this.request(
      () => this.client.get<DocumentKeyResponse>(`/encryption/document-keys/${documentId}`)
    );
  }

  /**
   * Share a document with another user
   */
  async shareDocument(
    documentId: string,
    targetUserId: string,
    encryptedDek: string
  ): Promise<DocumentKeyResponse> {
    return this.request(
      () => this.client.post<DocumentKeyResponse>('/encryption/share', {
        document_id: documentId,
        target_user_id: targetUserId,
        encrypted_dek: encryptedDek,
      })
    );
  }

  /**
   * Revoke a user's access to a document
   */
  async revokeAccess(documentId: string, userId: string): Promise<void> {
    return this.requestVoid(
      () => this.client.delete(`/encryption/share/${documentId}/${userId}`)
    );
  }

  /**
   * List all users who have access to a document
   */
  async getDocumentShares(documentId: string): Promise<DocumentSharesResponse> {
    return this.request(
      () => this.client.get<DocumentSharesResponse>(
        `/encryption/document-keys/${documentId}/shares`
      )
    );
  }

  /**
   * Store Diia recovery data
   */
  async initDiiaRecovery(data: {
    encrypted_master_secret: string;
    recovery_challenge: string;
    recovery_salt: string;
  }): Promise<void> {
    return this.requestVoid(
      () => this.client.post('/encryption/diia/init-recovery', data)
    );
  }

  /**
   * Get Diia recovery data
   */
  async getDiiaRecoveryData(): Promise<DiiaRecoveryResponse> {
    return this.request(
      () => this.client.get<DiiaRecoveryResponse>('/encryption/diia/recovery-data')
    );
  }

  /**
   * Encrypt a document's content after server-side processing (hybrid flow).
   * Replaces plaintext in DB with ciphertext and stores wrapped DEK.
   */
  async encryptDocument(
    documentId: string,
    encryptedContent: string,
    encryptedDek: string
  ): Promise<{ success: boolean; document_id: string }> {
    return this.request(
      () => this.client.post<{ success: boolean; document_id: string }>(
        '/encryption/encrypt-document',
        {
          document_id: documentId,
          encrypted_content: encryptedContent,
          encrypted_dek: encryptedDek,
        }
      )
    );
  }

  /**
   * Get vault encryption stats (total, encrypted, unencrypted count)
   */
  async getVaultStats(): Promise<{ total: number; encrypted: number; unencrypted: number }> {
    return this.request(
      () => this.client.get<{ total: number; encrypted: number; unencrypted: number }>(
        '/encryption/vault-stats'
      )
    );
  }

  /**
   * List unencrypted document IDs for batch encryption
   */
  async getUnencryptedDocuments(
    limit = 50,
    offset = 0
  ): Promise<{ documents: Array<{ id: string; title: string }> }> {
    return this.request(
      () => this.client.get<{ documents: Array<{ id: string; title: string }> }>(
        `/encryption/unencrypted-documents?limit=${limit}&offset=${offset}`
      )
    );
  }
}

export const encryptionService = new EncryptionService();
