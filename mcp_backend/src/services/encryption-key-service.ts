/**
 * Encryption Key Service
 * Manages user encryption keys and document key wrapping for E2EE.
 * Server never sees plaintext private keys or DEKs — only ciphertext.
 */

import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export interface UserEncryptionKey {
  id: string;
  user_id: string;
  public_key: string;
  encrypted_private_key: string;
  kdf_algorithm: string;
  kdf_params: Record<string, unknown>;
  key_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentKey {
  id: string;
  document_id: string;
  user_id: string;
  encrypted_dek: string;
  granted_by: string | null;
  granted_at: Date;
  revoked_at: Date | null;
}

export interface SetupKeysRequest {
  public_key: string;
  encrypted_private_key: string;
  kdf_algorithm?: string;
  kdf_params?: Record<string, unknown>;
}

export interface SaveDocumentKeyRequest {
  document_id: string;
  encrypted_dek: string;
}

export interface ShareDocumentRequest {
  document_id: string;
  target_user_id: string;
  encrypted_dek: string;
}

export class EncryptionKeyService {
  constructor(private db: IDatabase) {}

  /**
   * Initialize or update user encryption keys.
   * Called once during E2EE setup in the browser.
   */
  async setupKeys(userId: string, req: SetupKeysRequest): Promise<UserEncryptionKey> {
    const result = await this.db.query<UserEncryptionKey>(
      `INSERT INTO user_encryption_keys (user_id, public_key, encrypted_private_key, kdf_algorithm, kdf_params)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         public_key = EXCLUDED.public_key,
         encrypted_private_key = EXCLUDED.encrypted_private_key,
         kdf_algorithm = EXCLUDED.kdf_algorithm,
         kdf_params = EXCLUDED.kdf_params,
         key_version = user_encryption_keys.key_version + 1,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        req.public_key,
        req.encrypted_private_key,
        req.kdf_algorithm || 'argon2id',
        JSON.stringify(req.kdf_params || {}),
      ]
    );
    logger.info('Encryption keys set up', { userId, keyVersion: result.rows[0].key_version });
    return result.rows[0];
  }

  /**
   * Get the public key for any user (needed for sharing).
   */
  async getPublicKey(userId: string): Promise<string | null> {
    const result = await this.db.query<{ public_key: string }>(
      `SELECT public_key FROM user_encryption_keys WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.public_key || null;
  }

  /**
   * Get the current user's encrypted private key + KDF params (for client-side decryption).
   */
  async getMyKey(userId: string): Promise<UserEncryptionKey | null> {
    const result = await this.db.query<UserEncryptionKey>(
      `SELECT * FROM user_encryption_keys WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Store a wrapped DEK for a document (owner saving their own key).
   */
  async saveDocumentKey(userId: string, req: SaveDocumentKeyRequest): Promise<DocumentKey> {
    const result = await this.db.query<DocumentKey>(
      `INSERT INTO document_keys (document_id, user_id, encrypted_dek, granted_by)
       VALUES ($1, $2, $3, $2)
       ON CONFLICT (document_id, user_id) DO UPDATE SET
         encrypted_dek = EXCLUDED.encrypted_dek,
         granted_at = NOW(),
         revoked_at = NULL
       RETURNING *`,
      [req.document_id, userId, req.encrypted_dek]
    );
    logger.info('Document key saved', { documentId: req.document_id, userId });
    return result.rows[0];
  }

  /**
   * Get the wrapped DEK for a document for the requesting user.
   */
  async getDocumentKey(userId: string, documentId: string): Promise<DocumentKey | null> {
    const result = await this.db.query<DocumentKey>(
      `SELECT * FROM document_keys
       WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [documentId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Share a document by storing a wrapped DEK for another user.
   * The caller must have already unwrapped the DEK and re-wrapped it
   * with the target user's public key — all done client-side.
   */
  async shareDocument(grantorId: string, req: ShareDocumentRequest): Promise<DocumentKey> {
    // Verify grantor has access
    const grantorKey = await this.getDocumentKey(grantorId, req.document_id);
    if (!grantorKey) {
      throw new Error('У вас немає доступу до цього документа');
    }

    const result = await this.db.query<DocumentKey>(
      `INSERT INTO document_keys (document_id, user_id, encrypted_dek, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (document_id, user_id) DO UPDATE SET
         encrypted_dek = EXCLUDED.encrypted_dek,
         granted_by = EXCLUDED.granted_by,
         granted_at = NOW(),
         revoked_at = NULL
       RETURNING *`,
      [req.document_id, req.target_user_id, req.encrypted_dek, grantorId]
    );
    logger.info('Document shared', {
      documentId: req.document_id,
      grantorId,
      targetUserId: req.target_user_id,
    });
    return result.rows[0];
  }

  /**
   * Revoke a user's access to a document.
   */
  async revokeAccess(revokerId: string, documentId: string, targetUserId: string): Promise<void> {
    // Only the document owner (granted_by = self) or the grantor can revoke
    const result = await this.db.query(
      `UPDATE document_keys SET revoked_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM document_keys dk
         WHERE dk.document_id = $1 AND dk.user_id = $3
         AND dk.granted_by = dk.user_id AND dk.revoked_at IS NULL
       )`,
      [documentId, targetUserId, revokerId]
    );
    if (result.rowCount === 0) {
      throw new Error('Не вдалося відкликати доступ');
    }
    logger.info('Document access revoked', { documentId, targetUserId, revokerId });
  }

  /**
   * List all users who have access to a document.
   */
  async getDocumentShares(userId: string, documentId: string): Promise<DocumentKey[]> {
    // Only the owner can list shares
    const result = await this.db.query<DocumentKey>(
      `SELECT dk.* FROM document_keys dk
       WHERE dk.document_id = $1 AND dk.revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM document_keys owner_dk
         WHERE owner_dk.document_id = $1 AND owner_dk.user_id = $2
         AND owner_dk.granted_by = owner_dk.user_id AND owner_dk.revoked_at IS NULL
       )`,
      [documentId, userId]
    );
    return result.rows;
  }

  /**
   * Check if a user has encryption set up.
   */
  async hasEncryptionSetup(userId: string): Promise<boolean> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM user_encryption_keys WHERE user_id = $1`,
      [userId]
    );
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Store Diia recovery data for master secret recovery.
   */
  async saveDiiaRecovery(
    userId: string,
    encryptedMasterSecret: string,
    recoveryChallenge: string,
    recoverySalt: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE user_encryption_keys SET
         diia_encrypted_master_secret = $2,
         diia_recovery_challenge = $3,
         diia_recovery_salt = $4,
         updated_at = NOW()
       WHERE user_id = $1`,
      [userId, encryptedMasterSecret, recoveryChallenge, recoverySalt]
    );
    logger.info('Diia recovery data saved', { userId });
  }

  /**
   * Get Diia recovery data for master secret recovery.
   */
  async getDiiaRecovery(userId: string): Promise<{
    diia_encrypted_master_secret: string;
    diia_recovery_challenge: string;
    diia_recovery_salt: string;
  } | null> {
    const result = await this.db.query<{
      diia_encrypted_master_secret: string;
      diia_recovery_challenge: string;
      diia_recovery_salt: string;
    }>(
      `SELECT diia_encrypted_master_secret, diia_recovery_challenge, diia_recovery_salt
       FROM user_encryption_keys
       WHERE user_id = $1 AND diia_encrypted_master_secret IS NOT NULL`,
      [userId]
    );
    return result.rows[0] || null;
  }
}
