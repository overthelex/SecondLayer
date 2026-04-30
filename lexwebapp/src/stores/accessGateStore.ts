/**
 * Access Gate Store
 *
 * Tracks whether the current user is allowed to use the paid features
 * (chat, upload). The hosted version of the app is restricted to beta
 * testers and to users who have topped up via Monobank — anyone else gets
 * the BetaRestrictedModal.
 *
 * Two trigger paths populate this store:
 *   1. Proactive — `fetchAccessStatus()` runs on app load (after login).
 *   2. Reactive — when chat/upload returns 403 with code `BETA_RESTRICTED`,
 *      the axios interceptor / chat fetch handler calls `markRestricted()`.
 */

import { create } from 'zustand';
import accessService from '../services/api/AccessService';

export type AccessReason =
  | 'beta_tester'
  | 'administrator'
  | 'monobank_topup'
  | 'no_monobank_topup'
  | 'unauthenticated'
  | 'unknown';

interface AccessGateState {
  allowed: boolean;
  reason: AccessReason;
  isBetaTester: boolean;
  isAdministrator: boolean;
  hasMonobankTopup: boolean;
  /** Fetched from the server at least once. */
  loaded: boolean;
  /** When true, render BetaRestrictedModal. */
  modalOpen: boolean;

  fetchAccessStatus: () => Promise<void>;
  markRestricted: () => void;
  closeModal: () => void;
  reset: () => void;
}

const INITIAL = {
  allowed: true,
  reason: 'unknown' as AccessReason,
  isBetaTester: false,
  isAdministrator: false,
  hasMonobankTopup: false,
  loaded: false,
  modalOpen: false,
};

export const useAccessGateStore = create<AccessGateState>((set) => ({
  ...INITIAL,

  fetchAccessStatus: async () => {
    try {
      const status = await accessService.getStatus();
      set({
        allowed: status.allowed,
        reason: status.reason,
        isBetaTester: status.is_beta_tester,
        isAdministrator: status.is_administrator,
        hasMonobankTopup: status.has_monobank_topup,
        loaded: true,
        modalOpen: !status.allowed,
      });
    } catch (error) {
      // Silent: if the status call fails (e.g. network), stay permissive
      // and let the chat/upload 403 path surface the modal reactively.
      set({ loaded: true });
    }
  },

  markRestricted: () =>
    set({
      allowed: false,
      reason: 'no_monobank_topup',
      modalOpen: true,
      loaded: true,
    }),

  closeModal: () => set({ modalOpen: false }),

  reset: () => set(INITIAL),
}));
