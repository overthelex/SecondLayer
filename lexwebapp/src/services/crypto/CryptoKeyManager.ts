/**
 * CryptoKeyManager
 * Manages user key pair generation, master secret derivation (Argon2id/PBKDF2),
 * and private key encryption/decryption. All operations use Web Crypto API.
 *
 * Key hierarchy:
 *   Master Secret (from password via Argon2id) → encrypts X25519 private key
 *   X25519 key pair → used for ECDH key wrapping of per-document DEKs
 */

// We use tweetnacl for X25519 since Web Crypto doesn't support it natively
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from './utils';

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface EncryptedKeyBundle {
  publicKey: string;           // base64
  encryptedPrivateKey: string; // base64 (IV + ciphertext + tag)
  kdfAlgorithm: string;
  kdfParams: KdfParams;
}

export interface KdfParams {
  salt: string;     // base64
  memory?: number;  // Argon2id memory in KiB
  iterations?: number;
  parallelism?: number;
}

/**
 * Generate a new X25519 key pair.
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
  };
}

/**
 * Derive a 256-bit key from a password using PBKDF2 (Web Crypto native).
 * Used as fallback when Argon2id WASM is unavailable.
 */
export async function deriveKeyPBKDF2(
  password: string,
  salt: Uint8Array,
  iterations: number = 600_000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a 256-bit key from a password using Argon2id (via WASM).
 * Falls back to PBKDF2 if argon2-browser is not available.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array; algorithm: string; params: KdfParams }> {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));

  try {
    // Try Argon2id via WASM (use variable to prevent Vite static analysis)
    const argon2Module = 'argon2-browser';
    const argon2 = await import(/* @vite-ignore */ argon2Module);
    const result = await argon2.hash({
      pass: password,
      salt: actualSalt,
      type: argon2.ArgonType.Argon2id,
      mem: 65536,   // 64 MB
      time: 3,
      parallelism: 4,
      hashLen: 32,
    });

    const key = await crypto.subtle.importKey(
      'raw',
      result.hash,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return {
      key,
      salt: actualSalt,
      algorithm: 'argon2id',
      params: {
        salt: encodeBase64(actualSalt),
        memory: 65536,
        iterations: 3,
        parallelism: 4,
      },
    };
  } catch {
    // Fallback to PBKDF2
    const key = await deriveKeyPBKDF2(password, actualSalt);
    return {
      key,
      salt: actualSalt,
      algorithm: 'pbkdf2',
      params: {
        salt: encodeBase64(actualSalt),
        iterations: 600_000,
      },
    };
  }
}

/**
 * Encrypt a private key with the derived master key (AES-256-GCM).
 * Returns base64-encoded IV (12 bytes) + ciphertext + auth tag.
 */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  masterKey: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    privateKey
  );

  // Concatenate IV + ciphertext (includes auth tag)
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);

  return encodeBase64(result);
}

/**
 * Decrypt a private key with the derived master key.
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  masterKey: CryptoKey
): Promise<Uint8Array> {
  const data = decodeBase64(encryptedPrivateKey);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    ciphertext
  );

  return new Uint8Array(plaintext);
}

/**
 * Full setup flow: generate keys, derive master from password, encrypt private key.
 */
export async function setupEncryption(password: string): Promise<EncryptedKeyBundle> {
  const keyPair = generateKeyPair();
  const { key: masterKey, algorithm, params } = await deriveKeyFromPassword(password);
  const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKey, masterKey);

  return {
    publicKey: encodeBase64(keyPair.publicKey),
    encryptedPrivateKey,
    kdfAlgorithm: algorithm,
    kdfParams: params,
  };
}

/**
 * Unlock the private key by deriving master from password.
 */
export async function unlockPrivateKey(
  password: string,
  encryptedPrivateKey: string,
  kdfParams: KdfParams,
  kdfAlgorithm: string
): Promise<Uint8Array> {
  const salt = decodeBase64(kdfParams.salt);

  let masterKey: CryptoKey;
  if (kdfAlgorithm === 'argon2id') {
    const result = await deriveKeyFromPassword(password, salt);
    masterKey = result.key;
  } else {
    masterKey = await deriveKeyPBKDF2(password, salt, kdfParams.iterations);
  }

  return decryptPrivateKey(encryptedPrivateKey, masterKey);
}

/**
 * Export the master secret as a downloadable key file (for backup).
 * The file contains the raw key pair encrypted with the password.
 */
export function exportKeyFile(bundle: EncryptedKeyBundle): Blob {
  const json = JSON.stringify({
    version: 1,
    publicKey: bundle.publicKey,
    encryptedPrivateKey: bundle.encryptedPrivateKey,
    kdfAlgorithm: bundle.kdfAlgorithm,
    kdfParams: bundle.kdfParams,
  }, null, 2);

  return new Blob([json], { type: 'application/json' });
}

/**
 * Import a key file (for recovery).
 */
export function importKeyFile(content: string): EncryptedKeyBundle {
  const parsed = JSON.parse(content);
  if (parsed.version !== 1) {
    throw new Error('Непідтримувана версія ключового файлу');
  }
  return {
    publicKey: parsed.publicKey,
    encryptedPrivateKey: parsed.encryptedPrivateKey,
    kdfAlgorithm: parsed.kdfAlgorithm,
    kdfParams: parsed.kdfParams,
  };
}
