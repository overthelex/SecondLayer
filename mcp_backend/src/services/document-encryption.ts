/**
 * Document Encryption Service (Server-Side)
 *
 * Hybrid E2EE: server encrypts content AFTER parsing/embedding,
 * wraps DEK with user's X25519 public key.
 *
 * Wire format is compatible with frontend crypto module (lexwebapp/src/services/crypto/).
 */

import crypto from 'crypto';
import nacl from 'tweetnacl';
import { logger } from '../utils/logger.js';
import type { IDatabase } from '../domain/ports/index.js';
import type { MinioService } from './minio-service.js';

const HKDF_INFO = Buffer.from('SecondLayer-E2EE-DEK-v1', 'utf-8');

/**
 * Generate a random 256-bit DEK.
 */
export function generateDEK(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Encrypt text content with AES-256-GCM.
 * Output: base64(IV[12] + ciphertext + authTag[16])
 * Compatible with frontend DocumentEncryptor.decryptContent()
 */
export function encryptContent(content: string, dek: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

  const encrypted = Buffer.concat([
    cipher.update(content, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // IV + ciphertext + authTag (same format as frontend)
  const result = Buffer.concat([iv, encrypted, authTag]);
  return result.toString('base64');
}

/**
 * Encrypt binary data with AES-256-GCM.
 * Output: Buffer(IV[12] + ciphertext + authTag[16])
 */
export function encryptBinary(data: Buffer, dek: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Wrap a DEK with recipient's X25519 public key.
 * Output: base64(ephemeralPublic[32] + salt[16] + IV[12] + wrappedDEK)
 * Compatible with frontend KeyExchange.unwrapDEK()
 */
export async function wrapDEK(
  dek: Buffer,
  recipientPublicKey: Uint8Array
): Promise<string> {
  // Generate ephemeral X25519 key pair
  const ephemeral = nacl.box.keyPair();

  // X25519 ECDH: ephemeral_private × recipient_public → shared_secret
  const sharedSecret = nacl.scalarMult(ephemeral.secretKey, recipientPublicKey);

  // HKDF-SHA256 to derive wrapping key
  const salt = crypto.randomBytes(16);
  const wrappingKeyBytes = crypto.hkdfSync(
    'sha256',
    Buffer.from(sharedSecret),
    salt,
    HKDF_INFO,
    32
  );

  // AES-256-GCM encrypt the DEK
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(wrappingKeyBytes), iv);
  const wrapped = Buffer.concat([
    cipher.update(dek),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: ephemeral_public(32) + salt(16) + IV(12) + ciphertext+tag
  const result = Buffer.concat([
    Buffer.from(ephemeral.publicKey),
    salt,
    iv,
    wrapped,
    authTag,
  ]);

  return result.toString('base64');
}

/**
 * Encrypt a document's content and wrap the DEK for the owner.
 * Called after parsing/embedding in the upload pipeline.
 *
 * Encrypts:
 * - full_text and full_text_html (PostgreSQL)
 * - Original file in MinIO (if storage_type='minio' and minioService provided)
 */
export async function encryptDocumentContent(
  db: IDatabase,
  documentId: string,
  userId: string,
  minioService?: MinioService
): Promise<boolean> {
  // Get user's public key
  const keyResult = await db.query<{ public_key: string }>(
    'SELECT public_key FROM user_encryption_keys WHERE user_id = $1',
    [userId]
  );

  if (keyResult.rows.length === 0) {
    logger.warn('[Encryption] User has no encryption keys, skipping encryption', {
      documentId,
      userId,
    });
    return false;
  }

  const publicKeyBase64 = keyResult.rows[0].public_key;
  const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));

  // Get document content + storage info
  const docResult = await db.query<{
    full_text: string | null;
    full_text_html: string | null;
    storage_type: string | null;
    storage_path: string | null;
    mime_type: string | null;
    user_id: string;
    metadata: any;
  }>(
    'SELECT full_text, full_text_html, storage_type, storage_path, mime_type, user_id, metadata FROM documents WHERE id = $1',
    [documentId]
  );

  if (docResult.rows.length === 0) {
    logger.error('[Encryption] Document not found', { documentId });
    return false;
  }

  const { full_text, full_text_html, storage_type, metadata } = docResult.rows[0];

  // Generate DEK for this document
  const dek = generateDEK();

  // Encrypt content fields
  const encryptedFullText = full_text ? encryptContent(full_text, dek) : null;
  const encryptedFullTextHtml = full_text_html
    ? encryptContent(full_text_html, dek)
    : null;

  // Encrypt original file in MinIO (source encryption)
  let sourceEncrypted = false;
  if (storage_type === 'minio' && minioService && metadata) {
    const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const objectKey = meta.minioKey;
    if (objectKey) {
      try {
        const fileBuffer = await minioService.getFileBuffer(userId, objectKey);
        const encryptedBuffer = encryptBinary(fileBuffer, dek);
        await minioService.uploadBuffer(
          userId,
          objectKey,
          encryptedBuffer,
          'application/octet-stream' // encrypted binary, original mime lost intentionally
        );
        sourceEncrypted = true;
        logger.info('[Encryption] Original file encrypted in MinIO', {
          documentId,
          objectKey,
          originalSize: fileBuffer.length,
          encryptedSize: encryptedBuffer.length,
        });
      } catch (err: any) {
        logger.error('[Encryption] Failed to encrypt MinIO file (text still encrypted)', {
          documentId,
          objectKey,
          error: err.message,
        });
      }
    }
  }

  // Wrap DEK with user's public key
  const wrappedDEK = await wrapDEK(dek, publicKey);

  // Update document with encrypted content
  await db.query(
    `UPDATE documents SET
       full_text = $2,
       full_text_html = $3,
       is_encrypted = TRUE,
       encryption_version = 1
     WHERE id = $1`,
    [documentId, encryptedFullText, encryptedFullTextHtml]
  );

  // Store wrapped DEK
  await db.query(
    `INSERT INTO document_keys (document_id, user_id, encrypted_dek, granted_by)
     VALUES ($1, $2, $3, $2)
     ON CONFLICT (document_id, user_id) DO UPDATE SET
       encrypted_dek = EXCLUDED.encrypted_dek,
       granted_at = NOW(),
       revoked_at = NULL`,
    [documentId, userId, wrappedDEK]
  );

  // Zero out DEK from memory
  dek.fill(0);

  logger.info('[Encryption] Document encrypted', {
    documentId,
    userId,
    hasFullText: !!full_text,
    hasFullTextHtml: !!full_text_html,
    sourceEncrypted,
  });

  return true;
}
