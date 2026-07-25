/**
 * KeyExchange
 * ECDH-based DEK wrapping/unwrapping using X25519.
 *
 * Wrap flow (encrypt DEK for a recipient):
 *   1. Generate ephemeral X25519 key pair
 *   2. ECDH(ephemeral_private, recipient_public) → shared_secret
 *   3. HKDF(shared_secret) → wrapping_key
 *   4. AES-256-GCM(wrapping_key, DEK) → wrapped_dek
 *   5. Output: ephemeral_public + IV + wrapped_dek
 *
 * Unwrap flow (decrypt DEK):
 *   1. ECDH(recipient_private, ephemeral_public) → shared_secret
 *   2. HKDF(shared_secret) → wrapping_key
 *   3. AES-256-GCM-decrypt(wrapping_key, wrapped_dek) → DEK
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, randomBytes, toBuffer } from './utils';

const HKDF_INFO = new TextEncoder().encode('SecondLayer-E2EE-DEK-v1');

/**
 * Derive a wrapping key from shared secret via HKDF-SHA256.
 */
async function deriveWrappingKey(sharedSecret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toBuffer(sharedSecret),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBuffer(salt),
      info: toBuffer(HKDF_INFO),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap a DEK for a recipient using their public key.
 * Returns base64-encoded: ephemeral_public (32) + salt (16) + IV (12) + ciphertext.
 */
export async function wrapDEK(
  dek: Uint8Array,
  recipientPublicKey: Uint8Array
): Promise<string> {
  // Generate ephemeral key pair for this wrap operation
  const ephemeral = nacl.box.keyPair();

  // X25519 ECDH: ephemeral_private × recipient_public → shared_secret
  const sharedSecret = nacl.scalarMult(ephemeral.secretKey, recipientPublicKey);

  // Derive wrapping key via HKDF
  const salt = randomBytes(16);
  const wrappingKey = await deriveWrappingKey(sharedSecret, salt);

  // Encrypt the DEK with AES-256-GCM
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    wrappingKey,
    toBuffer(dek)
  );

  // Pack: ephemeral_public (32) + salt (16) + IV (12) + ciphertext
  const result = new Uint8Array(32 + 16 + 12 + ciphertext.byteLength);
  result.set(ephemeral.publicKey, 0);
  result.set(salt, 32);
  result.set(iv, 48);
  result.set(new Uint8Array(ciphertext), 60);

  return encodeBase64(result);
}

/**
 * Unwrap a DEK using the recipient's private key.
 */
export async function unwrapDEK(
  wrappedDEK: string,
  recipientPrivateKey: Uint8Array
): Promise<Uint8Array> {
  const data = decodeBase64(wrappedDEK);

  // Unpack
  const ephemeralPublic = data.slice(0, 32);
  const salt = data.slice(32, 48);
  const iv = data.slice(48, 60);
  const ciphertext = data.slice(60);

  // X25519 ECDH: recipient_private × ephemeral_public → shared_secret
  const sharedSecret = nacl.scalarMult(recipientPrivateKey, ephemeralPublic);

  // Derive wrapping key via HKDF
  const wrappingKey = await deriveWrappingKey(sharedSecret, salt);

  // Decrypt the DEK
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    wrappingKey,
    toBuffer(ciphertext)
  );

  return new Uint8Array(plaintext);
}

/**
 * Re-wrap a DEK for a new recipient.
 * Unwraps with the current user's private key, then wraps with the new recipient's public key.
 */
export async function rewrapDEK(
  wrappedDEK: string,
  currentPrivateKey: Uint8Array,
  newRecipientPublicKey: Uint8Array
): Promise<string> {
  const dek = await unwrapDEK(wrappedDEK, currentPrivateKey);
  return wrapDEK(dek, newRecipientPublicKey);
}
