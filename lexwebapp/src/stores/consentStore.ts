/**
 * Cookie Consent Store
 * GDPR-compliant consent management for a legal tech service.
 * Categories follow ePrivacy Directive + GDPR best practices.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type ConsentCategory = 'essential' | 'functional' | 'analytics' | 'marketing';

export interface ConsentPreferences {
  /** Strictly necessary cookies - always enabled, cannot be disabled */
  essential: true;
  /** Functional cookies: language, currency, UI preferences */
  functional: boolean;
  /** Analytics cookies: usage tracking, error reporting */
  analytics: boolean;
  /** Marketing cookies: advertising, retargeting (future use) */
  marketing: boolean;
}

interface ConsentState {
  /** Whether the user has made a consent choice */
  hasConsented: boolean;
  /** ISO timestamp of last consent action */
  consentedAt: string | null;
  /** Version of consent policy the user agreed to */
  consentVersion: string;
  /** Category-level preferences */
  preferences: ConsentPreferences;
  /** Show the cookie banner */
  showBanner: boolean;
  /** Show detailed settings modal */
  showSettings: boolean;

  // Actions
  acceptAll: () => void;
  rejectNonEssential: () => void;
  savePreferences: (prefs: Partial<Omit<ConsentPreferences, 'essential'>>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  resetConsent: () => void;
  isAllowed: (category: ConsentCategory) => boolean;
}

const CONSENT_VERSION = '1.0';

const DEFAULT_PREFERENCES: ConsentPreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export const useConsentStore = create<ConsentState>()(
  devtools(
    persist(
      (set, get) => ({
        hasConsented: false,
        consentedAt: null,
        consentVersion: CONSENT_VERSION,
        preferences: { ...DEFAULT_PREFERENCES },
        showBanner: true,
        showSettings: false,

        acceptAll: () =>
          set({
            hasConsented: true,
            consentedAt: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
            preferences: {
              essential: true,
              functional: true,
              analytics: true,
              marketing: true,
            },
            showBanner: false,
            showSettings: false,
          }),

        rejectNonEssential: () =>
          set({
            hasConsented: true,
            consentedAt: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
            preferences: { ...DEFAULT_PREFERENCES },
            showBanner: false,
            showSettings: false,
          }),

        savePreferences: (prefs) =>
          set((state) => ({
            hasConsented: true,
            consentedAt: new Date().toISOString(),
            consentVersion: CONSENT_VERSION,
            preferences: {
              ...state.preferences,
              ...prefs,
              essential: true, // always true
            },
            showBanner: false,
            showSettings: false,
          })),

        openSettings: () => set({ showSettings: true }),
        closeSettings: () => set({ showSettings: false }),

        resetConsent: () =>
          set({
            hasConsented: false,
            consentedAt: null,
            preferences: { ...DEFAULT_PREFERENCES },
            showBanner: true,
            showSettings: false,
          }),

        isAllowed: (category) => {
          if (category === 'essential') return true;
          return get().preferences[category] ?? false;
        },
      }),
      {
        name: 'consent-storage',
        version: 1,
        partialize: (state) => ({
          hasConsented: state.hasConsented,
          consentedAt: state.consentedAt,
          consentVersion: state.consentVersion,
          preferences: state.preferences,
          showBanner: !state.hasConsented,
        }),
      }
    ),
    { name: 'ConsentStore' }
  )
);
