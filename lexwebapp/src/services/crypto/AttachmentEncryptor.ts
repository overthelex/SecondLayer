/**
 * AttachmentEncryptor
 * Encrypts/decrypts consultation file attachments using the consultation root key.
 *
 * Flow:
 *   1. Generate random file DEK (256-bit)
 *   2. Encrypt file with AES-256-GCM(file_dek, file_bytes)
 *   3. Wrap file_dek with consultation root key via HKDF
 *   4. Upload encrypted bytes; send wrapped DEK + IV in message metadata
 *
 *   On receive: unwrap DEK → decrypt file → offer download/display
 */

import { getSession } from './ConsultationKeyManager';
import { randomBytes, toBuffer } from './utils';

const FILE_KEY_INFO = new TextEncoder().encode('SecondLayer-FileKey-v1');

/**
 * Encrypt a file for a consultation attachment.
 * Returns encrypted bytes and the wrapped DEK + IV for message metadata.
 */
export async function encryptAttachment(
  consultationId: string,
  fileBytes: ArrayBuffer
): Promise<{
  encryptedBytes: ArrayBuffer;
  wrappedDek: string;
  iv: string;
}> {
  const session = getSession(consultationId);
  if (!session) {
    throw new Error('E2EE сесія не встановлена');
  }

  // Generate a random file DEK
  const fileDek = randomBytes(32);
  const iv = randomBytes(12);

  // Encrypt file with AES-256-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(fileDek),
    'AES-GCM',
    false,
    ['encrypt']
  );

  const encryptedBytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    cryptoKey,
    fileBytes
  );

  // Wrap the file DEK using the consultation root key
  const wrappedDek = await wrapFileKey(fileDek, session.rootKey);

  // Zero the file DEK
  fileDek.fill(0);

  return {
    encryptedBytes,
    wrappedDek: btoa(String.fromCharCode(...wrappedDek)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt a consultation attachment.
 */
export async function decryptAttachment(
  consultationId: string,
  encryptedBytes: ArrayBuffer,
  wrappedDekBase64: string,
  ivBase64: string
): Promise<ArrayBuffer> {
  const session = getSession(consultationId);
  if (!session) {
    throw new Error('E2EE сесія не встановлена');
  }

  const wrappedDek = Uint8Array.from(atob(wrappedDekBase64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

  // Unwrap the file DEK
  const fileDek = await unwrapFileKey(wrappedDek, session.rootKey);

  // Decrypt file
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(fileDek),
    'AES-GCM',
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    cryptoKey,
    encryptedBytes
  );

  // Zero the file DEK
  fileDek.fill(0);

  return decrypted;
}

/**
 * Wrap a file DEK using the consultation root key via HKDF + AES-256-GCM.
 */
async function wrapFileKey(fileDek: Uint8Array, rootKey: Uint8Array): Promise<Uint8Array> {
  const salt = randomBytes(16);
  const wrappingKey = await deriveWrappingKey(rootKey, salt);
  const iv = randomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    wrappingKey,
    toBuffer(fileDek)
  );

  // Pack: salt (16) + iv (12) + ciphertext
  const result = new Uint8Array(16 + 12 + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, 16);
  result.set(new Uint8Array(ciphertext), 28);

  return result;
}

/**
 * Unwrap a file DEK using the consultation root key.
 */
async function unwrapFileKey(wrapped: Uint8Array, rootKey: Uint8Array): Promise<Uint8Array> {
  const salt = wrapped.slice(0, 16);
  const iv = wrapped.slice(16, 28);
  const ciphertext = wrapped.slice(28);

  const wrappingKey = await deriveWrappingKey(rootKey, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    wrappingKey,
    toBuffer(ciphertext)
  );

  return new Uint8Array(plaintext);
}

/**
 * Derive wrapping key from root key via HKDF.
 */
async function deriveWrappingKey(rootKey: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toBuffer(rootKey),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBuffer(salt),
      info: toBuffer(FILE_KEY_INFO),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
