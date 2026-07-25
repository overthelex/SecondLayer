/**
 * useAupConsent — manages AUP (Acceptable Use Policy) consent state.
 *
 * Stores consent per browser session (sessionStorage) so the user
 * is only asked once per session. On first acceptance, also persists
 * the consent to the backend for audit purposes.
 */

import { useState, useCallback } from 'react';
import apiClient from '../utils/api-client';

const SESSION_KEY = 'aup_consent_accepted';
const AUP_VERSION = '1.0';

function isAccepted(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useAupConsent() {
  const [accepted, setAccepted] = useState(isAccepted);

  const accept = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch {
      // sessionStorage unavailable (private mode, etc.)
    }
    setAccepted(true);

    // Fire-and-forget backend persist
    apiClient
      .post('/api/user/aup-consent', { aup_version: AUP_VERSION })
      .catch(() => {
        // Non-blocking — frontend consent is the gate, backend is for audit
      });
  }, []);

  return { accepted, accept };
}
