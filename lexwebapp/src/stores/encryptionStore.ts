/**
 * Encryption Store
 * Zustand store managing E2EE state: setup status, unlocked private key, encryption preferences.
 * The private key is held in memory only (never persisted) and cleared on logout/tab close.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { encryptionService } from '../services/api/EncryptionService';
import {
  setupEncryption,
  unlockPrivateKey,
  exportKeyFile,
  clearAllConsultationKeys,
  clearChatDEKCache,
  encodeBase64,
  decodeBase64,
  type EncryptedKeyBundle,
  type KdfParams,
} from '../services/crypto';

// --- Session persistence helpers ---
// After unlock, we store the private key encrypted with a random session key
// in sessionStorage so page refresh doesn't require password re-entry.
// sessionStorage is cleared when the tab/browser closes.

const SESSION_KEY_NAME = 'e2ee_session_key';
const SESSION_PK_NAME = 'e2ee_session_pk';
const SESSION_PUB_NAME = 'e2ee_session_pub';

async function encryptForSession(privateKey: Uint8Array): Promise<{ sessionKey: string; encryptedPk: string }> {
  const sk = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', sk.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, privateKey.buffer as ArrayBuffer);
  // Store iv + ciphertext together
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), 12);
  return { sessionKey: encodeBase64(sk), encryptedPk: encodeBase64(combined) };
}

async function decryptFromSession(sessionKey: string, encryptedPk: string): Promise<Uint8Array> {
  const sk = decodeBase64(sessionKey);
  const combined = decodeBase64(encryptedPk);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const cryptoKey = await crypto.subtle.importKey('raw', sk.buffer as ArrayBuffer, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct.buffer as ArrayBuffer);
  return new Uint8Array(pt);
}

function saveToSession(sessionKey: string, encryptedPk: string, publicKey: string) {
  try {
    sessionStorage.setItem(SESSION_KEY_NAME, sessionKey);
    sessionStorage.setItem(SESSION_PK_NAME, encryptedPk);
    sessionStorage.setItem(SESSION_PUB_NAME, publicKey);
  } catch {
    // sessionStorage may be unavailable (private mode in some browsers)
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY_NAME);
    sessionStorage.removeItem(SESSION_PK_NAME);
    sessionStorage.removeItem(SESSION_PUB_NAME);
  } catch {
    // Ignore
  }
}

function getSessionData(): { sessionKey: string; encryptedPk: string; publicKey: string } | null {
  try {
    const sessionKey = sessionStorage.getItem(SESSION_KEY_NAME);
    const encryptedPk = sessionStorage.getItem(SESSION_PK_NAME);
    const publicKey = sessionStorage.getItem(SESSION_PUB_NAME);
    if (sessionKey && encryptedPk && publicKey) return { sessionKey, encryptedPk, publicKey };
  } catch {
    // Ignore
  }
  return null;
}

interface EncryptionState {
  /** Whether the user has encryption keys set up on the server */
  hasEncryption: boolean;
  /** Whether the private key is currently unlocked in memory */
  isUnlocked: boolean;
  /** The decrypted private key (X25519, 32 bytes) — in-memory only */
  privateKey: Uint8Array | null;
  /** The user's public key (base64) */
  publicKey: string | null;
  /** Whether encryption is being set up or unlocked */
  isLoading: boolean;
  /** Error message from last operation */
  error: string | null;
  /** Whether status check has been performed */
  statusChecked: boolean;
  // Actions
  checkStatus: () => Promise<void>;
  /** Try to restore private key from sessionStorage (no password needed) */
  trySessionRestore: () => Promise<boolean>;
  setup: (password: string) => Promise<EncryptedKeyBundle>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  reset: () => void;
}

export const useEncryptionStore = create<EncryptionState>()(
  devtools(
    (set, get) => ({
      hasEncryption: false,
      isUnlocked: false,
      privateKey: null,
      publicKey: null,
      isLoading: false,
      error: null,
      statusChecked: false,

      /**
       * Check if the current user has encryption set up.
       */
      checkStatus: async () => {
        try {
          const { has_encryption } = await encryptionService.getStatus();
          set({ hasEncryption: has_encryption, statusChecked: true });
        } catch {
          // Silently fail — user may not be authenticated yet
          set({ statusChecked: true });
        }
      },

      /**
       * Try to restore private key from sessionStorage (after page refresh).
       * Returns true if restoration succeeded.
       */
      trySessionRestore: async () => {
        const data = getSessionData();
        if (!data) return false;
        try {
          const privateKey = await decryptFromSession(data.sessionKey, data.encryptedPk);
          set({
            isUnlocked: true,
            privateKey,
            publicKey: data.publicKey,
            hasEncryption: true,
          });
          return true;
        } catch {
          clearSession();
          return false;
        }
      },

      /**
       * First-time encryption setup: generate keys, encrypt with password, send to server.
       * Returns the bundle so caller can offer key file download.
       */
      setup: async (password: string) => {
        set({ isLoading: true, error: null });
        try {
          // Generate key pair + encrypt private key with password
          const bundle = await setupEncryption(password);

          // Send public key + encrypted private key to server
          await encryptionService.setupKeys({
            public_key: bundle.publicKey,
            encrypted_private_key: bundle.encryptedPrivateKey,
            kdf_algorithm: bundle.kdfAlgorithm,
            kdf_params: bundle.kdfParams as unknown as Record<string, unknown>,
          });

          // Unlock immediately after setup — re-derive private key from the bundle
          const pk = await unlockPrivateKey(
            password,
            bundle.encryptedPrivateKey,
            bundle.kdfParams,
            bundle.kdfAlgorithm,
          );

          set({
            hasEncryption: true,
            isUnlocked: true,
            privateKey: pk,
            publicKey: bundle.publicKey,
            isLoading: false,
          });

          // Persist to sessionStorage for page-refresh recovery
          encryptForSession(pk).then(({ sessionKey, encryptedPk }) => {
            saveToSession(sessionKey, encryptedPk, bundle.publicKey);
          }).catch(() => {});

          return bundle;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Помилка налаштування шифрування',
          });
          throw error;
        }
      },

      /**
       * Unlock the private key by deriving master from password.
       */
      unlock: async (password: string) => {
        set({ isLoading: true, error: null });
        try {
          const myKey = await encryptionService.getMyKey();
          const privateKey = await unlockPrivateKey(
            password,
            myKey.encrypted_private_key,
            myKey.kdf_params as unknown as KdfParams,
            myKey.kdf_algorithm,
          );

          const pubKey = myKey.public_key || null;

          set({
            isUnlocked: true,
            privateKey,
            publicKey: pubKey,
            hasEncryption: true,
            isLoading: false,
          });

          // Persist to sessionStorage for page-refresh recovery
          if (pubKey) {
            encryptForSession(privateKey).then(({ sessionKey, encryptedPk }) => {
              saveToSession(sessionKey, encryptedPk, pubKey);
            }).catch(() => {});
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: 'Невірний пароль шифрування',
          });
          throw error;
        }
      },

      /**
       * Lock the private key (clear from memory).
       */
      lock: () => {
        const { privateKey } = get();
        // Zero out the key before discarding
        if (privateKey) {
          privateKey.fill(0);
        }
        clearAllConsultationKeys();
        clearChatDEKCache();
        clearSession();
        set({
          isUnlocked: false,
          privateKey: null,
        });
      },

      /**
       * Full reset (on logout).
       */
      reset: () => {
        const { privateKey } = get();
        if (privateKey) privateKey.fill(0);
        clearAllConsultationKeys();
        clearChatDEKCache();
        clearSession();
        set({
          hasEncryption: false,
          isUnlocked: false,
          privateKey: null,
          publicKey: null,
          isLoading: false,
          error: null,
          statusChecked: false,
        });
      },
    }),
    { name: 'EncryptionStore' }
  )
);

/**
 * Helper: download the key file to the user's device.
 */
export function downloadKeyFile(bundle: EncryptedKeyBundle, fileName = 'secondlayer-key.json') {
  const blob = exportKeyFile(bundle);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
