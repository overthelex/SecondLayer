/**
 * Crypto Module — E2EE for SecondLayer documents
 *
 * All cryptographic operations happen exclusively in the browser.
 * The server never sees plaintext private keys or DEKs.
 */

export {
  generateKeyPair,
  deriveKeyFromPassword,
  deriveKeyPBKDF2,
  encryptPrivateKey,
  decryptPrivateKey,
  setupEncryption,
  unlockPrivateKey,
  exportKeyFile,
  importKeyFile,
  type KeyPair,
  type EncryptedKeyBundle,
  type KdfParams,
} from './CryptoKeyManager';

export {
  generateDEK,
  encryptContent,
  decryptContent,
  encryptBinary,
  decryptBinary,
} from './DocumentEncryptor';

export {
  wrapDEK,
  unwrapDEK,
  rewrapDEK,
} from './KeyExchange';

export {
  encodeBase64,
  decodeBase64,
  randomBytes,
  timingSafeEqual,
} from './utils';

export {
  encryptUploadedDocument,
  encryptUploadedDocuments,
} from './PostUploadEncryptor';
