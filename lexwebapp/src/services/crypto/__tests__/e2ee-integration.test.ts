/**
 * E2EE Integration Tests
 *
 * Tests the complete end-to-end encryption lifecycle:
 * 1. Setup encryption keys for client and lawyer
 * 2. Encrypt a document
 * 3. Share encrypted document with lawyer
 * 4. Lawyer decrypts the document
 * 5. Revoke access
 * 6. Verify revoked lawyer cannot decrypt
 * 7. Verify plaintext is not visible in "stored" data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateKeyPair,
  generateDEK,
  encryptContent,
  decryptContent,
  wrapDEK,
  unwrapDEK,
  rewrapDEK,
  encryptPrivateKey,
  decryptPrivateKey,
  encodeBase64,
  decodeBase64,
  timingSafeEqual,
} from '../index';

describe('E2EE Integration: Full Lifecycle', () => {
  // Simulated server storage
  let serverDB: {
    userKeys: Map<string, { publicKey: string; encryptedPrivateKey: string }>;
    documentKeys: Map<string, Map<string, { encryptedDek: string; revoked: boolean }>>;
    documents: Map<string, { content: string; isEncrypted: boolean }>;
  };

  beforeEach(() => {
    serverDB = {
      userKeys: new Map(),
      documentKeys: new Map(),
      documents: new Map(),
    };
  });

  /**
   * Simulate server: store user keys
   */
  function serverSetupKeys(userId: string, publicKey: string, encryptedPrivateKey: string) {
    serverDB.userKeys.set(userId, { publicKey, encryptedPrivateKey });
  }

  /**
   * Simulate server: store document
   */
  function serverStoreDocument(docId: string, content: string, isEncrypted: boolean) {
    serverDB.documents.set(docId, { content, isEncrypted });
  }

  /**
   * Simulate server: save wrapped DEK
   */
  function serverSaveDocumentKey(docId: string, userId: string, encryptedDek: string) {
    if (!serverDB.documentKeys.has(docId)) {
      serverDB.documentKeys.set(docId, new Map());
    }
    serverDB.documentKeys.get(docId)!.set(userId, { encryptedDek, revoked: false });
  }

  /**
   * Simulate server: revoke DEK access
   */
  function serverRevokeAccess(docId: string, userId: string) {
    const docKeys = serverDB.documentKeys.get(docId);
    if (docKeys?.has(userId)) {
      docKeys.get(userId)!.revoked = true;
    }
  }

  /**
   * Simulate server: get wrapped DEK (respects revocation)
   */
  function serverGetDocumentKey(docId: string, userId: string): string | null {
    const docKeys = serverDB.documentKeys.get(docId);
    const entry = docKeys?.get(userId);
    if (!entry || entry.revoked) return null;
    return entry.encryptedDek;
  }

  it('complete lifecycle: setup → encrypt → share → decrypt → revoke', async () => {
    // ========== PHASE 1: Setup keys for both users ==========
    const clientKP = generateKeyPair();
    const lawyerKP = generateKeyPair();

    // Simulate password-based encryption of private keys
    const password = 'test-password-123';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const masterKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );

    const clientEncPK = await encryptPrivateKey(clientKP.privateKey, masterKey);
    const lawyerEncPK = await encryptPrivateKey(lawyerKP.privateKey, masterKey);

    // Store on "server"
    serverSetupKeys('client-1', encodeBase64(clientKP.publicKey), clientEncPK);
    serverSetupKeys('lawyer-1', encodeBase64(lawyerKP.publicKey), lawyerEncPK);

    // Verify keys are stored
    expect(serverDB.userKeys.has('client-1')).toBe(true);
    expect(serverDB.userKeys.has('lawyer-1')).toBe(true);

    // ========== PHASE 2: Client encrypts a document ==========
    const originalContent = 'ДОГОВІР №123\n\nМіж ТОВ "Тест" та фізичною особою Іванов І.І.\nПредмет: надання юридичних послуг.\n\nКонфіденційна інформація.';
    const docId = 'doc-uuid-1';

    // Generate DEK and encrypt content
    const dek = generateDEK();
    const encryptedContent = await encryptContent(originalContent, dek);

    // Verify encrypted content is NOT the plaintext
    expect(encryptedContent).not.toBe(originalContent);
    expect(encryptedContent).not.toContain('ДОГОВІР');
    expect(encryptedContent).not.toContain('Конфіденційна');

    // Wrap DEK with client's public key
    const clientWrappedDEK = await wrapDEK(dek, clientKP.publicKey);

    // Store encrypted document and key on "server"
    serverStoreDocument(docId, encryptedContent, true);
    serverSaveDocumentKey(docId, 'client-1', clientWrappedDEK);

    // ========== PHASE 3: Verify server doesn't have plaintext ==========
    const storedDoc = serverDB.documents.get(docId)!;
    expect(storedDoc.isEncrypted).toBe(true);
    expect(storedDoc.content).not.toContain('ДОГОВІР');
    expect(storedDoc.content).not.toContain('Іванов');
    expect(storedDoc.content).not.toContain('Конфіденційна');

    // ========== PHASE 4: Client retrieves and decrypts ==========
    const clientWrapped = serverGetDocumentKey(docId, 'client-1')!;
    expect(clientWrapped).toBeTruthy();

    const clientDEK = await unwrapDEK(clientWrapped, clientKP.privateKey);
    const clientDecrypted = await decryptContent(storedDoc.content, clientDEK);
    expect(clientDecrypted).toBe(originalContent);

    // ========== PHASE 5: Client shares with lawyer ==========
    const lawyerPubKey = serverDB.userKeys.get('lawyer-1')!.publicKey;
    const lawyerPubKeyBytes = decodeBase64(lawyerPubKey);

    // Client rewraps DEK for lawyer
    const lawyerWrappedDEK = await rewrapDEK(
      clientWrapped,
      clientKP.privateKey,
      lawyerPubKeyBytes
    );

    // Store lawyer's wrapped DEK on "server"
    serverSaveDocumentKey(docId, 'lawyer-1', lawyerWrappedDEK);

    // ========== PHASE 6: Lawyer decrypts ==========
    const lawyerWrapped = serverGetDocumentKey(docId, 'lawyer-1')!;
    expect(lawyerWrapped).toBeTruthy();

    const lawyerDEK = await unwrapDEK(lawyerWrapped, lawyerKP.privateKey);
    const lawyerDecrypted = await decryptContent(storedDoc.content, lawyerDEK);
    expect(lawyerDecrypted).toBe(originalContent);

    // ========== PHASE 7: Revoke lawyer's access ==========
    serverRevokeAccess(docId, 'lawyer-1');

    // Lawyer can no longer get the key
    const revokedKey = serverGetDocumentKey(docId, 'lawyer-1');
    expect(revokedKey).toBeNull();

    // Client still has access
    const clientKeyAfterRevoke = serverGetDocumentKey(docId, 'client-1');
    expect(clientKeyAfterRevoke).toBeTruthy();
    const clientDEK2 = await unwrapDEK(clientKeyAfterRevoke!, clientKP.privateKey);
    const clientDecrypted2 = await decryptContent(storedDoc.content, clientDEK2);
    expect(clientDecrypted2).toBe(originalContent);
  });

  it('different documents use different DEKs', async () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    expect(timingSafeEqual(dek1, dek2)).toBe(false);

    const content = 'Same content';
    const enc1 = await encryptContent(content, dek1);
    const enc2 = await encryptContent(content, dek2);

    // Different DEKs produce different ciphertext
    expect(enc1).not.toBe(enc2);

    // Both decrypt correctly with their own DEKs
    expect(await decryptContent(enc1, dek1)).toBe(content);
    expect(await decryptContent(enc2, dek2)).toBe(content);

    // Cross-decryption fails
    await expect(decryptContent(enc1, dek2)).rejects.toThrow();
  });

  it('compromised DEK only exposes one document', async () => {
    const doc1Content = 'Secret document 1';
    const doc2Content = 'Secret document 2';

    const dek1 = generateDEK();
    const dek2 = generateDEK();

    const enc1 = await encryptContent(doc1Content, dek1);
    const enc2 = await encryptContent(doc2Content, dek2);

    // If attacker gets dek1, they can only decrypt doc1
    expect(await decryptContent(enc1, dek1)).toBe(doc1Content);
    await expect(decryptContent(enc2, dek1)).rejects.toThrow();
  });

  it('password unlock: wrong password fails to decrypt private key', async () => {
    const kp = generateKeyPair();

    // Encrypt private key with correct password
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const mkCorrect = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
      await crypto.subtle.importKey('raw', new TextEncoder().encode('correct'), 'PBKDF2', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    const mkWrong = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
      await crypto.subtle.importKey('raw', new TextEncoder().encode('wrong'), 'PBKDF2', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );

    const encrypted = await encryptPrivateKey(kp.privateKey, mkCorrect);

    // Correct password works
    const decrypted = await decryptPrivateKey(encrypted, mkCorrect);
    expect(timingSafeEqual(decrypted, kp.privateKey)).toBe(true);

    // Wrong password fails
    await expect(decryptPrivateKey(encrypted, mkWrong)).rejects.toThrow();
  });

  it('multi-user sharing: 3 users share same document', async () => {
    const owner = generateKeyPair();
    const lawyer1 = generateKeyPair();
    const lawyer2 = generateKeyPair();

    const dek = generateDEK();
    const content = 'Multi-party document';
    const encrypted = await encryptContent(content, dek);

    // Owner wraps DEK for themselves
    const ownerWrapped = await wrapDEK(dek, owner.publicKey);

    // Owner shares with lawyer1 and lawyer2
    const lawyer1Wrapped = await rewrapDEK(ownerWrapped, owner.privateKey, lawyer1.publicKey);
    const lawyer2Wrapped = await rewrapDEK(ownerWrapped, owner.privateKey, lawyer2.publicKey);

    // All three can decrypt
    expect(await decryptContent(encrypted, await unwrapDEK(ownerWrapped, owner.privateKey))).toBe(content);
    expect(await decryptContent(encrypted, await unwrapDEK(lawyer1Wrapped, lawyer1.privateKey))).toBe(content);
    expect(await decryptContent(encrypted, await unwrapDEK(lawyer2Wrapped, lawyer2.privateKey))).toBe(content);

    // lawyer1 can't use lawyer2's wrapped DEK
    await expect(unwrapDEK(lawyer2Wrapped, lawyer1.privateKey)).rejects.toThrow();
  });
});
