/**
 * E2EE Crypto Module Tests
 *
 * Tests cover:
 * - encodeBase64 / decodeBase64 roundtrip
 * - AES-256-GCM encrypt/decrypt content roundtrip
 * - AES-256-GCM encrypt/decrypt binary roundtrip
 * - DEK generation
 * - ECDH key exchange: wrap/unwrap DEK roundtrip
 * - rewrapDEK for sharing
 * - Key derivation + private key encrypt/decrypt roundtrip
 */

import { describe, it, expect } from 'vitest';
import {
  encodeBase64,
  decodeBase64,
  randomBytes,
  timingSafeEqual,
} from '../utils';
import {
  generateDEK,
  encryptContent,
  decryptContent,
  encryptBinary,
  decryptBinary,
} from '../DocumentEncryptor';
import {
  wrapDEK,
  unwrapDEK,
  rewrapDEK,
} from '../KeyExchange';
import {
  generateKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
  exportKeyFile,
  importKeyFile,
} from '../CryptoKeyManager';

describe('utils', () => {
  it('encodeBase64/decodeBase64 roundtrip', () => {
    const data = randomBytes(32);
    const encoded = encodeBase64(data);
    const decoded = decodeBase64(encoded);
    expect(timingSafeEqual(data, decoded)).toBe(true);
  });

  it('randomBytes returns correct length', () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
  });

  it('timingSafeEqual returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('timingSafeEqual returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});

describe('DocumentEncryptor', () => {
  it('encrypt/decrypt content roundtrip', async () => {
    const dek = generateDEK();
    const plaintext = 'Конституція України. Стаття 1. Україна є суверенна і незалежна держава.';

    const encrypted = await encryptContent(plaintext, dek);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptContent(encrypted, dek);
    expect(decrypted).toBe(plaintext);
  });

  it('different DEKs produce different ciphertext', async () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    const plaintext = 'Test content';

    const enc1 = await encryptContent(plaintext, dek1);
    const enc2 = await encryptContent(plaintext, dek2);
    expect(enc1).not.toBe(enc2);
  });

  it('decrypt with wrong DEK fails', async () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    const encrypted = await encryptContent('secret', dek1);

    await expect(decryptContent(encrypted, dek2)).rejects.toThrow();
  });

  it('encrypt/decrypt binary roundtrip', async () => {
    const dek = generateDEK();
    const data = randomBytes(1024);

    const encrypted = await encryptBinary(data, dek);
    expect(encrypted.length).toBeGreaterThan(data.length);

    const decrypted = await decryptBinary(encrypted, dek);
    expect(timingSafeEqual(data, decrypted)).toBe(true);
  });

  it('generateDEK returns 32 bytes', () => {
    const dek = generateDEK();
    expect(dek.length).toBe(32);
  });
});

describe('KeyExchange', () => {
  it('wrap/unwrap DEK roundtrip', async () => {
    const keyPair = generateKeyPair();
    const dek = generateDEK();

    const wrapped = await wrapDEK(dek, keyPair.publicKey);
    expect(wrapped).toBeTruthy();
    expect(typeof wrapped).toBe('string');

    const unwrapped = await unwrapDEK(wrapped, keyPair.privateKey);
    expect(timingSafeEqual(dek, unwrapped)).toBe(true);
  });

  it('unwrap with wrong private key fails', async () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();
    const dek = generateDEK();

    const wrapped = await wrapDEK(dek, keyPair1.publicKey);
    await expect(unwrapDEK(wrapped, keyPair2.privateKey)).rejects.toThrow();
  });

  it('rewrapDEK: share document between users', async () => {
    const owner = generateKeyPair();
    const lawyer = generateKeyPair();
    const dek = generateDEK();

    // Owner wraps DEK
    const ownerWrapped = await wrapDEK(dek, owner.publicKey);

    // Owner rewraps for lawyer
    const lawyerWrapped = await rewrapDEK(ownerWrapped, owner.privateKey, lawyer.publicKey);

    // Lawyer unwraps
    const unwrapped = await unwrapDEK(lawyerWrapped, lawyer.privateKey);
    expect(timingSafeEqual(dek, unwrapped)).toBe(true);
  });
});

describe('CryptoKeyManager', () => {
  it('generateKeyPair returns valid key pair', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it('encrypt/decrypt private key roundtrip', async () => {
    const kp = generateKeyPair();

    // Derive a master key (use PBKDF2 directly for test speed)
    const salt = randomBytes(16);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('test-password'),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const masterKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const encrypted = await encryptPrivateKey(kp.privateKey, masterKey);
    expect(typeof encrypted).toBe('string');

    const decrypted = await decryptPrivateKey(encrypted, masterKey);
    expect(timingSafeEqual(kp.privateKey, decrypted)).toBe(true);
  });

  it('exportKeyFile / importKeyFile roundtrip', () => {
    const bundle = {
      publicKey: 'test-pk',
      encryptedPrivateKey: 'test-epk',
      kdfAlgorithm: 'pbkdf2',
      kdfParams: { salt: 'test-salt', iterations: 1000 },
    };

    const blob = exportKeyFile(bundle);
    expect(blob.type).toBe('application/json');

    // Simulate reading the blob content
    const content = JSON.stringify({
      version: 1,
      publicKey: bundle.publicKey,
      encryptedPrivateKey: bundle.encryptedPrivateKey,
      kdfAlgorithm: bundle.kdfAlgorithm,
      kdfParams: bundle.kdfParams,
    });

    const imported = importKeyFile(content);
    expect(imported.publicKey).toBe(bundle.publicKey);
    expect(imported.encryptedPrivateKey).toBe(bundle.encryptedPrivateKey);
    expect(imported.kdfAlgorithm).toBe(bundle.kdfAlgorithm);
  });
});

describe('Full E2EE flow', () => {
  it('encrypt document → share → recipient decrypts', async () => {
    // Setup: owner and lawyer generate key pairs
    const owner = generateKeyPair();
    const lawyer = generateKeyPair();

    // Step 1: Owner encrypts document
    const dek = generateDEK();
    const plaintext = 'Договір про надання правової допомоги №123';
    const encrypted = await encryptContent(plaintext, dek);

    // Step 2: Owner wraps DEK with own public key (stored on server)
    const ownerWrappedDEK = await wrapDEK(dek, owner.publicKey);

    // Step 3: Owner shares with lawyer (rewrap)
    const lawyerWrappedDEK = await rewrapDEK(
      ownerWrappedDEK,
      owner.privateKey,
      lawyer.publicKey
    );

    // Step 4: Lawyer unwraps DEK and decrypts document
    const lawyerDEK = await unwrapDEK(lawyerWrappedDEK, lawyer.privateKey);
    const decrypted = await decryptContent(encrypted, lawyerDEK);

    expect(decrypted).toBe(plaintext);
  });
});
