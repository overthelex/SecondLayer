/**
 * DocumentEncryptor
 * Handles AES-256-GCM encryption/decryption of document content.
 * Each document gets a unique DEK (Data Encryption Key).
 */

import { encodeBase64, decodeBase64, randomBytes } from './utils';

/**
 * Generate a random 256-bit DEK for a document.
 */
export function generateDEK(): Uint8Array {
  return randomBytes(32);
}

/**
 * Import a raw DEK into a Web Crypto CryptoKey.
 */
async function importDEK(dek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    dek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt document content with AES-256-GCM.
 * Returns base64-encoded: IV (12 bytes) + ciphertext + auth tag (16 bytes).
 */
export async function encryptContent(
  content: string,
  dek: Uint8Array
): Promise<string> {
  const key = await importDEK(dek);
  const iv = randomBytes(12);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(content);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);

  return encodeBase64(result);
}

/**
 * Decrypt document content with AES-256-GCM.
 */
export async function decryptContent(
  encryptedContent: string,
  dek: Uint8Array
): Promise<string> {
  const key = await importDEK(dek);
  const data = decodeBase64(encryptedContent);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

/**
 * Encrypt a binary file (Uint8Array) with AES-256-GCM.
 * Returns IV + ciphertext as Uint8Array.
 */
export async function encryptBinary(
  data: Uint8Array,
  dek: Uint8Array
): Promise<Uint8Array> {
  const key = await importDEK(dek);
  const iv = randomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);

  return result;
}

/**
 * Decrypt a binary file (Uint8Array) with AES-256-GCM.
 */
export async function decryptBinary(
  encryptedData: Uint8Array,
  dek: Uint8Array
): Promise<Uint8Array> {
  const key = await importDEK(dek);
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new Uint8Array(plaintext);
}
