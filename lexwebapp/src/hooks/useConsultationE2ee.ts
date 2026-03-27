/**
 * useConsultationE2ee
 * React hook for managing E2EE state within a consultation chat.
 *
 * Handles: key establishment, key restoration, message encryption/decryption.
 * Uses the encryption store for identity key access and ConsultationKeyManager for root keys.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEncryptionStore } from '../stores/encryptionStore';
import { consultationE2eeService } from '../services/api/ConsultationE2eeService';
import {
  establishKeys,
  restoreKeys,
  hasSession,
  clearKeys,
  getPeerPublicKey,
} from '../services/crypto/ConsultationKeyManager';
import {
  encryptMessage as ratchetEncrypt,
  decryptMessage as ratchetDecrypt,
  needsRotation,
} from '../services/crypto/MessageRatchet';

export type E2eeStatus = 'locked' | 'no_peer_encryption' | 'establishing' | 'ready' | 'error';

interface UseConsultationE2eeReturn {
  status: E2eeStatus;
  error: string | null;
  encryptMessage: (plaintext: string) => Promise<{
    ciphertext: string;
    counter: number;
    keyVersion: number;
  }>;
  decryptMessage: (ciphertext: string, counter: number, keyVersion?: number) => Promise<string>;
  needsRotation: () => boolean;
}

export function useConsultationE2ee(
  consultationId: string | undefined,
  clientUserId: string | undefined,
  attorneyUserId: string | undefined,
  myUserId: string | undefined
): UseConsultationE2eeReturn {
  const [status, setStatus] = useState<E2eeStatus>('locked');
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const { isUnlocked, privateKey, publicKey } = useEncryptionStore();

  useEffect(() => {
    if (!consultationId || !clientUserId || !attorneyUserId || !myUserId) return;

    // Already have a session in memory
    if (hasSession(consultationId)) {
      setStatus('ready');
      return;
    }

    // Private key not unlocked — can't do anything
    if (!isUnlocked || !privateKey) {
      setStatus('locked');
      return;
    }

    // Prevent double initialization
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        setStatus('establishing');

        // Check E2EE status on server
        const e2eeStatus = await consultationE2eeService.getStatus(consultationId);

        if (e2eeStatus.established) {
          // Keys already established — restore from server
          await restoreKeys(consultationId, privateKey);
          setStatus('ready');
          return;
        }

        // Check if peer has encryption set up
        if (!e2eeStatus.peerHasEncryption) {
          setStatus('no_peer_encryption');
          return;
        }

        // We need to establish keys
        const peerId = myUserId === clientUserId ? attorneyUserId : clientUserId;
        const peerPublicKey = await getPeerPublicKey(peerId);

        // Get my public key (base64)
        const myPublicKeyBase64 = publicKey;
        if (!myPublicKeyBase64) {
          setError('Публічний ключ не знайдено');
          setStatus('error');
          return;
        }

        const myPublicKeyBytes = Uint8Array.from(atob(myPublicKeyBase64), c => c.charCodeAt(0));

        await establishKeys(
          consultationId,
          privateKey,
          myPublicKeyBytes,
          peerPublicKey,
          clientUserId,
          attorneyUserId,
          myUserId
        );

        setStatus('ready');
      } catch (err: any) {
        setError(err.message || 'Помилка встановлення E2EE');
        setStatus('error');
      }
    };

    init();

    return () => {
      initRef.current = false;
    };
  }, [consultationId, clientUserId, attorneyUserId, myUserId, isUnlocked, privateKey, publicKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (consultationId) {
        clearKeys(consultationId);
      }
    };
  }, [consultationId]);

  const encryptMessage = useCallback(async (plaintext: string) => {
    if (!consultationId) throw new Error('No consultation ID');
    return ratchetEncrypt(consultationId, plaintext);
  }, [consultationId]);

  const decryptMessage = useCallback(async (
    ciphertext: string,
    counter: number,
    keyVersion?: number
  ) => {
    if (!consultationId) throw new Error('No consultation ID');
    return ratchetDecrypt(consultationId, ciphertext, counter, keyVersion);
  }, [consultationId]);

  const checkRotation = useCallback(() => {
    if (!consultationId) return false;
    return needsRotation(consultationId);
  }, [consultationId]);

  return {
    status,
    error,
    encryptMessage,
    decryptMessage,
    needsRotation: checkRotation,
  };
}
