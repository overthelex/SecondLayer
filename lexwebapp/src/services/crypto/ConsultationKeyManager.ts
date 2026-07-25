/**
 * ConsultationKeyManager
 * Manages per-consultation root keys in memory.
 * Performs ECDH key establishment, stores/retrieves wrapped keys from server.
 *
 * Root keys are NEVER persisted — only held in a module-level Map.
 * On logout or tab close, clearAll() must be called.
 */

import nacl from 'tweetnacl';
import { wrapDEK, unwrapDEK } from './KeyExchange';
import { decodeBase64 } from './utils';
import { consultationE2eeService } from '../api/ConsultationE2eeService';
import { encryptionService } from '../api/EncryptionService';

export interface ConsultationSession {
  rootKey: Uint8Array;
  sendCounter: number;
  recvCounter: number;
  keyVersion: number;
}

/** In-memory store — NOT in Zustand (too sensitive for DevTools) */
const sessions = new Map<string, ConsultationSession>();

/**
 * Establish E2EE for a consultation.
 * Generates a root key via ECDH, wraps it for both participants, uploads to server.
 */
export async function establishKeys(
  consultationId: string,
  _myPrivateKey: Uint8Array,
  myPublicKey: Uint8Array,
  peerPublicKeyBase64: string,
  clientUserId: string,
  _attorneyUserId: string,
  myUserId: string
): Promise<ConsultationSession> {
  const peerPublicKey = decodeBase64(peerPublicKeyBase64);

  // Generate ephemeral key pair for ECDH
  const ephemeral = nacl.box.keyPair();
  const sharedSecret = nacl.scalarMult(ephemeral.secretKey, peerPublicKey);

  // Derive root key via HKDF
  const rootKey = await deriveRootKey(sharedSecret, consultationId);

  // Wrap root key for both participants using their identity public keys
  const myPublicKeyBytes = myPublicKey;
  const peerPublicKeyBytes = peerPublicKey;

  const isClient = myUserId === clientUserId;
  const clientPublicKey = isClient ? myPublicKeyBytes : peerPublicKeyBytes;
  const attorneyPublicKey = isClient ? peerPublicKeyBytes : myPublicKeyBytes;

  const wrappedForClient = await wrapDEK(rootKey, clientPublicKey);
  const wrappedForAttorney = await wrapDEK(rootKey, attorneyPublicKey);

  // Upload to server
  await consultationE2eeService.setupKeys(consultationId, wrappedForClient, wrappedForAttorney);

  const session: ConsultationSession = {
    rootKey,
    sendCounter: 0,
    recvCounter: 0,
    keyVersion: 1,
  };

  sessions.set(consultationId, session);
  return session;
}

/**
 * Restore keys from server-stored wrapped root key.
 * Called when entering a consultation where E2EE was already established.
 */
export async function restoreKeys(
  consultationId: string,
  myPrivateKey: Uint8Array,
  keyVersion?: number
): Promise<ConsultationSession> {
  const keysResponse = await consultationE2eeService.getKeys(consultationId, keyVersion);
  const rootKey = await unwrapDEK(keysResponse.wrapped_root_key, myPrivateKey);

  const session: ConsultationSession = {
    rootKey,
    sendCounter: keysResponse.counter_checkpoint,
    recvCounter: keysResponse.counter_checkpoint,
    keyVersion: keysResponse.key_version,
  };

  sessions.set(consultationId, session);
  return session;
}

/**
 * Get the peer's public key from the server.
 */
export async function getPeerPublicKey(peerId: string): Promise<string> {
  const response = await encryptionService.getPublicKey(peerId);
  return response.public_key;
}

/**
 * Get the current session for a consultation, or null if not established.
 */
export function getSession(consultationId: string): ConsultationSession | null {
  return sessions.get(consultationId) ?? null;
}

/**
 * Check if a consultation has an active session in memory.
 */
export function hasSession(consultationId: string): boolean {
  return sessions.has(consultationId);
}

/**
 * Clear keys for a specific consultation (on leaving the chat).
 */
export function clearKeys(consultationId: string): void {
  const session = sessions.get(consultationId);
  if (session) {
    session.rootKey.fill(0);
    sessions.delete(consultationId);
  }
}

/**
 * Clear all sessions (on logout).
 */
export function clearAll(): void {
  for (const [, session] of sessions) {
    session.rootKey.fill(0);
  }
  sessions.clear();
}

/**
 * Derive the consultation root key from shared secret via HKDF-SHA256.
 */
async function deriveRootKey(sharedSecret: Uint8Array, consultationId: string): Promise<Uint8Array> {
  const info = new TextEncoder().encode('SecondLayer-ConsultationRootKey-v1');
  const salt = new TextEncoder().encode(consultationId);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      info: info as unknown as BufferSource,
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}
