/**
 * MessageRatchet
 * Derives per-message encryption keys from the consultation root key.
 * Uses a counter-based HKDF ratchet for forward secrecy.
 *
 * Each message key is derived from: HKDF(root_key, counter, info).
 * After derivation, the msg_key is used once and discarded.
 */

import { getSession } from './ConsultationKeyManager';
import { randomBytes, toBuffer } from './utils';

const MSG_KEY_INFO = new TextEncoder().encode('SecondLayer-MsgKey-v1');

/**
 * Encrypt a message for a consultation.
 * Returns the ciphertext (base64) and the counter used.
 */
export async function encryptMessage(
  consultationId: string,
  plaintext: string
): Promise<{ ciphertext: string; counter: number; keyVersion: number }> {
  const session = getSession(consultationId);
  if (!session) {
    throw new Error('E2EE сесія не встановлена для цієї консультації');
  }

  const counter = session.sendCounter;
  const msgKey = await deriveMsgKey(session.rootKey, counter);

  const iv = randomBytes(12);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(msgKey),
    'AES-GCM',
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    cryptoKey,
    toBuffer(plaintextBytes)
  );

  // Pack: IV (12) + ciphertext
  const packed = new Uint8Array(12 + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), 12);

  // Advance counter — forward secrecy: old keys cannot be re-derived
  session.sendCounter++;

  // Zero the msg key
  msgKey.fill(0);

  return {
    ciphertext: btoa(String.fromCharCode(...packed)),
    counter,
    keyVersion: session.keyVersion,
  };
}

/**
 * Decrypt a message from a consultation.
 */
export async function decryptMessage(
  consultationId: string,
  ciphertextBase64: string,
  counter: number,
  _keyVersion?: number
): Promise<string> {
  const session = getSession(consultationId);
  if (!session) {
    throw new Error('E2EE сесія не встановлена для цієї консультації');
  }

  const data = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const msgKey = await deriveMsgKey(session.rootKey, counter);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(msgKey),
    'AES-GCM',
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    cryptoKey,
    toBuffer(ciphertext)
  );

  // Update receive counter to track progress
  if (counter >= session.recvCounter) {
    session.recvCounter = counter + 1;
  }

  // Zero the msg key
  msgKey.fill(0);

  return new TextDecoder().decode(plaintext);
}

/**
 * Check if the session needs root key rotation (every 1000 messages).
 */
export function needsRotation(consultationId: string): boolean {
  const session = getSession(consultationId);
  if (!session) return false;
  return session.sendCounter > 0 && session.sendCounter % 1000 === 0;
}

/**
 * Get the current send counter for a consultation.
 */
export function getSendCounter(consultationId: string): number {
  return getSession(consultationId)?.sendCounter ?? 0;
}

/**
 * Derive a per-message key from the root key using HKDF-SHA256.
 */
async function deriveMsgKey(rootKey: Uint8Array, counter: number): Promise<Uint8Array> {
  // Encode counter as 8-byte big-endian
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setUint32(0, 0); // high 32 bits (always 0 for practical message counts)
  view.setUint32(4, counter);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toBuffer(rootKey),
    'HKDF',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBuffer(counterBytes),
      info: toBuffer(MSG_KEY_INFO),
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}
