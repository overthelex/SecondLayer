/**
 * Document Encryption Service
 * Server-side coordination for hybrid E2EE: marks documents as encrypted
 * after server-side parse/embed so the client can finish encryption.
 * The server never sees plaintext DEKs — all crypto happens client-side.
 */

import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

/**
 * Mark a document as encrypted in the database.
 * Called after upload processing when the session had encrypt=true.
 * Returns true if the document was flagged, false if the user has no
 * encryption keys set up (so the document stays unencrypted).
 */
export async function encryptDocumentContent(
  db: IDatabase,
  documentId: string,
  userId: string
): Promise<boolean> {
  // Check whether the user has E2EE keys configured
  const keyCheck = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_encryption_keys WHERE user_id = $1`,
    [userId]
  );
  const hasKeys = parseInt(keyCheck.rows[0]?.count ?? '0', 10) > 0;

  if (!hasKeys) {
    logger.warn('[DocumentEncryption] User has no encryption keys — skipping flag', {
      documentId,
      userId,
    });
    return false;
  }

  // Flag the document so the client knows to encrypt and push back the DEK
  const result = await db.query(
    `UPDATE documents
     SET is_encrypted = true, encryption_version = 1
     WHERE id = $1 AND user_id = $2`,
    [documentId, userId]
  );

  const flagged = (result.rowCount ?? 0) > 0;
  if (flagged) {
    logger.info('[DocumentEncryption] Document flagged for E2EE', { documentId, userId });
  } else {
    logger.warn('[DocumentEncryption] Document not found or not owned by user', {
      documentId,
      userId,
    });
  }
  return flagged;
}
