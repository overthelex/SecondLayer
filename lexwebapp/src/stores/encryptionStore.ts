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
  type EncryptedKeyBundle,
  type KdfParams,
} from '../services/crypto';

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
  // Actions
  checkStatus: () => Promise<void>;
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

      /**
       * Check if the current user has encryption set up.
       */
      checkStatus: async () => {
        try {
          const { has_encryption } = await encryptionService.getStatus();
          set({ hasEncryption: has_encryption });
        } catch {
          // Silently fail — user may not be authenticated yet
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

          // Also fetch public key
          const status = await encryptionService.getStatus();

          set({
            isUnlocked: true,
            privateKey,
            hasEncryption: status.has_encryption,
            isLoading: false,
          });
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
        set({
          hasEncryption: false,
          isUnlocked: false,
          privateKey: null,
          publicKey: null,
          isLoading: false,
          error: null,
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
