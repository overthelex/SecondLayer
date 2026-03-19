/**
 * Encryption Routes
 * API endpoints for E2EE key management and document key sharing.
 * All crypto operations happen client-side — server only stores ciphertext.
 */

import express, { Response } from 'express';
import { EncryptionKeyService } from '../services/encryption-key-service.js';
import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';

export function createEncryptionRoutes(
  encryptionKeyService: EncryptionKeyService,
  db?: IDatabase
): express.Router {
  const router = express.Router();

  /**
   * POST /api/encryption/setup
   * Initialize user encryption keys (called once during E2EE setup)
   */
  router.post('/setup', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { public_key, encrypted_private_key, kdf_algorithm, kdf_params } = req.body;
      if (!public_key || !encrypted_private_key) {
        return res.status(400).json({ error: 'public_key and encrypted_private_key are required' });
      }

      const key = await encryptionKeyService.setupKeys(userId, {
        public_key,
        encrypted_private_key,
        kdf_algorithm,
        kdf_params,
      });

      res.status(201).json({
        id: key.id,
        public_key: key.public_key,
        kdf_algorithm: key.kdf_algorithm,
        kdf_params: key.kdf_params,
        key_version: key.key_version,
      });
    } catch (error: any) {
      logger.error('Failed to setup encryption keys', { error: error.message });
      res.status(500).json({ error: 'Не вдалося налаштувати шифрування' });
    }
  }) as any);

  /**
   * GET /api/encryption/status
   * Check if the current user has encryption set up
   */
  router.get('/status', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const hasSetup = await encryptionKeyService.hasEncryptionSetup(userId);
      res.json({ has_encryption: hasSetup });
    } catch (error: any) {
      logger.error('Failed to check encryption status', { error: error.message });
      res.status(500).json({ error: 'Помилка перевірки статусу шифрування' });
    }
  }) as any);

  /**
   * GET /api/encryption/public-key/:userId
   * Get any user's public key (for sharing)
   */
  router.get('/public-key/:userId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const publicKey = await encryptionKeyService.getPublicKey(req.params.userId as string);
      if (!publicKey) {
        return res.status(404).json({ error: 'Ключ шифрування не знайдено' });
      }

      res.json({ public_key: publicKey });
    } catch (error: any) {
      logger.error('Failed to get public key', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання ключа' });
    }
  }) as any);

  /**
   * GET /api/encryption/my-key
   * Get the current user's encrypted private key + KDF params
   */
  router.get('/my-key', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const key = await encryptionKeyService.getMyKey(userId);
      if (!key) {
        return res.status(404).json({ error: 'Ключі шифрування не налаштовано' });
      }

      res.json({
        encrypted_private_key: key.encrypted_private_key,
        kdf_algorithm: key.kdf_algorithm,
        kdf_params: key.kdf_params,
        key_version: key.key_version,
      });
    } catch (error: any) {
      logger.error('Failed to get encryption key', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання ключа' });
    }
  }) as any);

  /**
   * POST /api/encryption/document-keys
   * Store a wrapped DEK for a document
   */
  router.post('/document-keys', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { document_id, encrypted_dek } = req.body;
      if (!document_id || !encrypted_dek) {
        return res.status(400).json({ error: 'document_id and encrypted_dek are required' });
      }

      const key = await encryptionKeyService.saveDocumentKey(userId, {
        document_id,
        encrypted_dek,
      });

      res.status(201).json(key);
    } catch (error: any) {
      logger.error('Failed to save document key', { error: error.message });
      res.status(500).json({ error: 'Помилка збереження ключа документа' });
    }
  }) as any);

  /**
   * GET /api/encryption/document-keys/:documentId
   * Get the wrapped DEK for a document
   */
  router.get('/document-keys/:documentId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const key = await encryptionKeyService.getDocumentKey(userId, req.params.documentId as string);
      if (!key) {
        return res.status(404).json({ error: 'Ключ документа не знайдено' });
      }

      res.json(key);
    } catch (error: any) {
      logger.error('Failed to get document key', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання ключа документа' });
    }
  }) as any);

  /**
   * POST /api/encryption/share
   * Share a document by storing a re-wrapped DEK for another user
   */
  router.post('/share', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { document_id, target_user_id, encrypted_dek } = req.body;
      if (!document_id || !target_user_id || !encrypted_dek) {
        return res.status(400).json({ error: 'document_id, target_user_id, and encrypted_dek are required' });
      }

      const key = await encryptionKeyService.shareDocument(userId, {
        document_id,
        target_user_id,
        encrypted_dek,
      });

      res.status(201).json(key);
    } catch (error: any) {
      logger.error('Failed to share document', { error: error.message });
      res.status(400).json({ error: error.message || 'Помилка надання доступу' });
    }
  }) as any);

  /**
   * DELETE /api/encryption/share/:documentId/:userId
   * Revoke a user's access to a document
   */
  router.delete('/share/:documentId/:userId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const revokerId = req.user?.id;
      if (!revokerId) return res.status(401).json({ error: 'Unauthorized' });

      await encryptionKeyService.revokeAccess(
        revokerId,
        req.params.documentId as string,
        req.params.userId as string
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to revoke access', { error: error.message });
      res.status(400).json({ error: error.message || 'Помилка відкликання доступу' });
    }
  }) as any);

  /**
   * GET /api/encryption/document-keys/:documentId/shares
   * List all users who have access to a document
   */
  router.get('/document-keys/:documentId/shares', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const shares = await encryptionKeyService.getDocumentShares(userId, req.params.documentId as string);
      res.json({ shares });
    } catch (error: any) {
      logger.error('Failed to get document shares', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання списку доступу' });
    }
  }) as any);

  /**
   * POST /api/encryption/diia/init-recovery
   * Store Diia recovery data
   */
  router.post('/diia/init-recovery', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { encrypted_master_secret, recovery_challenge, recovery_salt } = req.body;
      if (!encrypted_master_secret || !recovery_challenge || !recovery_salt) {
        return res.status(400).json({ error: 'All recovery fields are required' });
      }

      await encryptionKeyService.saveDiiaRecovery(
        userId,
        encrypted_master_secret,
        recovery_challenge,
        recovery_salt
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to init Diia recovery', { error: error.message });
      res.status(500).json({ error: 'Помилка налаштування відновлення через Дію' });
    }
  }) as any);

  /**
   * GET /api/encryption/diia/recovery-data
   * Get Diia recovery challenge + encrypted master secret
   */
  router.get('/diia/recovery-data', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const recovery = await encryptionKeyService.getDiiaRecovery(userId);
      if (!recovery) {
        return res.status(404).json({ error: 'Відновлення через Дію не налаштовано' });
      }

      res.json(recovery);
    } catch (error: any) {
      logger.error('Failed to get Diia recovery data', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання даних відновлення' });
    }
  }) as any);

  /**
   * POST /api/encryption/encrypt-document
   * Replace document content with encrypted version after server-side processing.
   * Hybrid flow: server parsed/embedded the plaintext, now client sends ciphertext.
   */
  router.post('/encrypt-document', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const { document_id, encrypted_content, encrypted_dek } = req.body;
      if (!document_id || !encrypted_content || !encrypted_dek) {
        return res.status(400).json({
          error: 'document_id, encrypted_content, and encrypted_dek are required',
        });
      }

      // Verify the document belongs to this user
      const docResult = await db.query(
        `SELECT id FROM documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [document_id, userId]
      );
      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Документ не знайдено' });
      }

      // Replace plaintext content with encrypted content
      await db.query(
        `UPDATE documents SET
           full_text = $2,
           full_text_html = NULL,
           is_encrypted = true,
           encryption_version = 1,
           updated_at = NOW()
         WHERE id = $1`,
        [document_id, encrypted_content]
      );

      // Save the wrapped DEK for this user
      await encryptionKeyService.saveDocumentKey(userId, {
        document_id,
        encrypted_dek,
      });

      logger.info('Document encrypted', { documentId: document_id, userId });
      res.json({ success: true, document_id });
    } catch (error: any) {
      logger.error('Failed to encrypt document', { error: error.message });
      res.status(500).json({ error: 'Помилка шифрування документа' });
    }
  }) as any);

  /**
   * GET /api/encryption/vault-stats
   * Get encryption stats for the current user's vault.
   */
  router.get('/vault-stats', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const result = await db.query<{ total: string; encrypted: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE is_encrypted = true) AS encrypted
         FROM documents
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      const { total, encrypted } = result.rows[0];
      res.json({
        total: parseInt(total),
        encrypted: parseInt(encrypted),
        unencrypted: parseInt(total) - parseInt(encrypted),
      });
    } catch (error: any) {
      logger.error('Failed to get vault stats', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання статистики' });
    }
  }) as any);

  /**
   * GET /api/encryption/unencrypted-documents
   * List IDs of unencrypted documents for batch encryption.
   */
  router.get('/unencrypted-documents', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));

      const result = await db.query<{ id: string; title: string }>(
        `SELECT id, title FROM documents
         WHERE user_id = $1 AND deleted_at IS NULL
           AND (is_encrypted IS NULL OR is_encrypted = false)
           AND full_text IS NOT NULL AND full_text != ''
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      res.json({ documents: result.rows });
    } catch (error: any) {
      logger.error('Failed to list unencrypted documents', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання списку документів' });
    }
  }) as any);

  return router;
}
