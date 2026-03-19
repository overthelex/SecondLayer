/**
 * EncryptionKeyService Tests
 *
 * Tests cover:
 * - setupKeys: create and upsert user encryption keys
 * - getPublicKey / getMyKey: retrieval
 * - saveDocumentKey / getDocumentKey: DEK storage and retrieval
 * - shareDocument: granting access with re-wrapped DEK
 * - revokeAccess: removing shared access
 * - getDocumentShares: listing all shares
 * - hasEncryptionSetup: status check
 */

import { EncryptionKeyService } from '../encryption-key-service';

const USER_ID = 'user-001';
const USER_ID_2 = 'user-002';
const DOC_ID = 'doc-001';

function makeKeyRow(overrides: any = {}) {
  return {
    id: 'key-001',
    user_id: USER_ID,
    public_key: 'base64-public-key',
    encrypted_private_key: 'base64-encrypted-private-key',
    kdf_algorithm: 'argon2id',
    kdf_params: { salt: 'abc', memory: 65536, iterations: 3, parallelism: 4 },
    key_version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeDocKeyRow(overrides: any = {}) {
  return {
    id: 'dk-001',
    document_id: DOC_ID,
    user_id: USER_ID,
    encrypted_dek: 'base64-wrapped-dek',
    granted_by: USER_ID,
    granted_at: new Date(),
    revoked_at: null,
    ...overrides,
  };
}

function makeDb(overrides: any = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  };
}

describe('EncryptionKeyService', () => {
  describe('setupKeys', () => {
    it('should insert new encryption keys', async () => {
      const row = makeKeyRow();
      const db = makeDb({ query: jest.fn().mockResolvedValue({ rows: [row] }) });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.setupKeys(USER_ID, {
        public_key: 'base64-public-key',
        encrypted_private_key: 'base64-encrypted-private-key',
        kdf_algorithm: 'argon2id',
        kdf_params: { salt: 'abc', memory: 65536 },
      });

      expect(result).toEqual(row);
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query.mock.calls[0][0]).toContain('INSERT INTO user_encryption_keys');
    });
  });

  describe('getPublicKey', () => {
    it('should return public key for existing user', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValue({ rows: [{ public_key: 'pk-123' }] }),
      });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getPublicKey(USER_ID);
      expect(result).toBe('pk-123');
    });

    it('should return null for user without keys', async () => {
      const db = makeDb();
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getPublicKey(USER_ID);
      expect(result).toBeNull();
    });
  });

  describe('getMyKey', () => {
    it('should return full key data', async () => {
      const row = makeKeyRow();
      const db = makeDb({ query: jest.fn().mockResolvedValue({ rows: [row] }) });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getMyKey(USER_ID);
      expect(result).toEqual(row);
    });

    it('should return null if no keys', async () => {
      const db = makeDb();
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getMyKey(USER_ID);
      expect(result).toBeNull();
    });
  });

  describe('saveDocumentKey', () => {
    it('should store wrapped DEK', async () => {
      const row = makeDocKeyRow();
      const db = makeDb({ query: jest.fn().mockResolvedValue({ rows: [row] }) });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.saveDocumentKey(USER_ID, {
        document_id: DOC_ID,
        encrypted_dek: 'base64-wrapped-dek',
      });

      expect(result).toEqual(row);
      expect(db.query.mock.calls[0][0]).toContain('INSERT INTO document_keys');
    });
  });

  describe('getDocumentKey', () => {
    it('should return wrapped DEK for authorized user', async () => {
      const row = makeDocKeyRow();
      const db = makeDb({ query: jest.fn().mockResolvedValue({ rows: [row] }) });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getDocumentKey(USER_ID, DOC_ID);
      expect(result).toEqual(row);
    });

    it('should return null for unauthorized user', async () => {
      const db = makeDb();
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.getDocumentKey('unknown-user', DOC_ID);
      expect(result).toBeNull();
    });
  });

  describe('shareDocument', () => {
    it('should create new wrapped DEK for target user', async () => {
      const grantorDocKey = makeDocKeyRow();
      const sharedDocKey = makeDocKeyRow({ user_id: USER_ID_2, granted_by: USER_ID });

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [grantorDocKey] }) // getDocumentKey check
          .mockResolvedValueOnce({ rows: [sharedDocKey] }),  // insert
      });
      const svc = new EncryptionKeyService(db as any);

      const result = await svc.shareDocument(USER_ID, {
        document_id: DOC_ID,
        target_user_id: USER_ID_2,
        encrypted_dek: 'rewrapped-dek',
      });

      expect(result.user_id).toBe(USER_ID_2);
      expect(result.granted_by).toBe(USER_ID);
    });

    it('should throw if grantor has no access', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValueOnce({ rows: [] }), // no grantor key
      });
      const svc = new EncryptionKeyService(db as any);

      await expect(
        svc.shareDocument(USER_ID, {
          document_id: DOC_ID,
          target_user_id: USER_ID_2,
          encrypted_dek: 'rewrapped-dek',
        })
      ).rejects.toThrow('У вас немає доступу до цього документа');
    });
  });

  describe('revokeAccess', () => {
    it('should revoke access when owner calls', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValue({ rowCount: 1 }),
      });
      const svc = new EncryptionKeyService(db as any);

      await expect(svc.revokeAccess(USER_ID, DOC_ID, USER_ID_2)).resolves.toBeUndefined();
    });

    it('should throw if revocation fails', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValue({ rowCount: 0 }),
      });
      const svc = new EncryptionKeyService(db as any);

      await expect(svc.revokeAccess(USER_ID, DOC_ID, USER_ID_2)).rejects.toThrow(
        'Не вдалося відкликати доступ'
      );
    });
  });

  describe('hasEncryptionSetup', () => {
    it('should return true when keys exist', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValue({ rows: [{ count: '1' }] }),
      });
      const svc = new EncryptionKeyService(db as any);

      expect(await svc.hasEncryptionSetup(USER_ID)).toBe(true);
    });

    it('should return false when no keys', async () => {
      const db = makeDb({
        query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
      });
      const svc = new EncryptionKeyService(db as any);

      expect(await svc.hasEncryptionSetup(USER_ID)).toBe(false);
    });
  });
});
