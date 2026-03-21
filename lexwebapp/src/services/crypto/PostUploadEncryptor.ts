/**
 * PostUploadEncryptor
 * After a document is uploaded and server-side processed (parsed, embedded),
 * this service encrypts the document content client-side and replaces the
 * plaintext on the server with ciphertext (hybrid E2EE flow).
 *
 * Flow:
 * 1. Fetch document content from server (get_document)
 * 2. Generate a random DEK
 * 3. Encrypt content with DEK (AES-256-GCM)
 * 4. Wrap DEK with user's public key (ECDH-ES)
 * 5. Send encrypted content + wrapped DEK to server
 */

import { mcpService } from '../api/MCPService';
import { encryptionService } from '../api/EncryptionService';
import { generateDEK, encryptContent } from './DocumentEncryptor';
import { wrapDEK } from './KeyExchange';
import { decodeBase64 } from './utils';

export interface EncryptDocumentResult {
  documentId: string;
  success: boolean;
  error?: string;
}

/**
 * Encrypt a single document after upload processing.
 * @param documentId - The document ID returned after upload completion
 * @param userPublicKey - User's X25519 public key (base64)
 */
export async function encryptUploadedDocument(
  documentId: string,
  userPublicKey: string,
): Promise<EncryptDocumentResult> {
  try {
    // Step 1: Fetch the parsed content from server
    const result = await mcpService.callTool('get_document', {
      documentId,
      includeSections: false,
      includePatterns: false,
    });

    const parsed = result?.result?.content?.[0]?.text
      ? JSON.parse(result.result.content[0].text)
      : result?.result || result;

    const content = parsed.content || parsed.text || '';
    if (!content) {
      return { documentId, success: false, error: 'No content to encrypt' };
    }

    // Step 2: Generate DEK and encrypt content
    const dek = generateDEK();
    const encryptedContent = await encryptContent(content, dek);

    // Step 3: Wrap DEK with user's public key
    const publicKeyBytes = decodeBase64(userPublicKey);
    const wrappedDEK = await wrapDEK(dek, publicKeyBytes);

    // Step 4: Send encrypted content + wrapped DEK to server
    await encryptionService.encryptDocument(documentId, encryptedContent, wrappedDEK);

    return { documentId, success: true };
  } catch (error: any) {
    console.error(`[PostUploadEncryptor] Failed to encrypt document ${documentId}:`, error);
    return { documentId, success: false, error: error.message };
  }
}

/**
 * Encrypt multiple documents after batch upload.
 */
export async function encryptUploadedDocuments(
  documentIds: string[],
  userPublicKey: string,
): Promise<EncryptDocumentResult[]> {
  const results: EncryptDocumentResult[] = [];

  // Process sequentially to avoid overwhelming the server
  for (const documentId of documentIds) {
    const result = await encryptUploadedDocument(documentId, userPublicKey);
    results.push(result);
  }

  return results;
}
