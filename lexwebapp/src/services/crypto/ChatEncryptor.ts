/**
 * ChatEncryptor — Encryption at rest for AI chat conversations.
 *
 * Each conversation gets its own DEK (Data Encryption Key).
 * Messages are encrypted client-side before syncing to server.
 * DEK is wrapped with user's X25519 public key and stored on server.
 *
 * Unlike consultation E2EE, this is encryption at rest — the server
 * sees plaintext during AI processing but stored copies are encrypted.
 */

import { generateDEK, encryptContent, decryptContent } from './DocumentEncryptor';
import { wrapDEK, unwrapDEK } from './KeyExchange';
import { conversationService } from '../api/ConversationService';

// In-memory cache of conversation DEKs (cleared on logout/lock)
const dekCache = new Map<string, Uint8Array>();

/**
 * Get or create a DEK for a conversation.
 * On first call for a conversation, generates a new DEK, wraps it, and stores on server.
 * On subsequent calls, returns from cache or fetches wrapped DEK from server.
 */
export async function getConversationDEK(
  conversationId: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  // Check cache first
  const cached = dekCache.get(conversationId);
  if (cached) return cached;

  // Try to fetch from server
  const wrappedDek = await conversationService.getConversationKey(conversationId);
  if (wrappedDek) {
    const dek = await unwrapDEK(wrappedDek, privateKey);
    dekCache.set(conversationId, dek);
    return dek;
  }

  // Generate new DEK for this conversation
  const dek = generateDEK();
  const wrapped = await wrapDEK(dek, publicKey);
  await conversationService.saveConversationKey(conversationId, wrapped);
  dekCache.set(conversationId, dek);
  return dek;
}

/**
 * Encrypt a message content for storage.
 */
export async function encryptChatMessage(
  content: string,
  conversationId: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<string> {
  const dek = await getConversationDEK(conversationId, publicKey, privateKey);
  return encryptContent(content, dek);
}

/**
 * Decrypt a message content from storage.
 */
export async function decryptChatMessage(
  encryptedContent: string,
  conversationId: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<string> {
  const dek = await getConversationDEK(conversationId, publicKey, privateKey);
  return decryptContent(encryptedContent, dek);
}

/**
 * Clear all cached DEKs (call on logout/lock).
 */
export function clearChatDEKCache() {
  // Zero out DEKs before clearing
  for (const dek of dekCache.values()) {
    dek.fill(0);
  }
  dekCache.clear();
}
