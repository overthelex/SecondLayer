/**
 * Locale Store
 * Manages user locale preferences: language, currency, country.
 * Auto-detects from Cloudflare geo data on first visit (if functional cookies allowed).
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type AppLanguage = 'uk' | 'en' | 'ru' | 'es';
export type AppCurrency = 'UAH' | 'USD' | 'EUR';
export type AppCountry = 'UA' | 'US' | 'GB' | 'DE' | 'FR' | 'NL' | 'EE' | 'ES' | 'OTHER';

interface LocaleState {
  /** UI language */
  language: AppLanguage;
  /** Display currency */
  currency: AppCurrency;
  /** Detected or selected country (ISO 3166-1 alpha-2) */
  country: AppCountry;
  /** Whether geo detection has been done */
  geoDetected: boolean;
  /** Raw country code from Cloudflare */
  cfCountry: string | null;

  // Actions
  setLanguage: (lang: AppLanguage) => void;
  setCurrency: (currency: AppCurrency) => void;
  setCountry: (country: AppCountry) => void;
  applyGeoDefaults: (cfCountry: string) => void;
}

/** Map CF country code to app defaults */
function getDefaultsForCountry(countryCode: string): {
  language: AppLanguage;
  currency: AppCurrency;
  country: AppCountry;
} {
  const code = countryCode.toUpperCase();

  // Ukrainian-speaking countries
  if (code === 'UA') {
    return { language: 'uk', currency: 'UAH', country: 'UA' };
  }

  // Russian-speaking countries
  if (['RU', 'BY', 'KZ'].includes(code)) {
    return { language: 'ru', currency: 'USD', country: 'OTHER' };
  }

  // Spain — Spanish locale
  if (code === 'ES') {
    return { language: 'es', currency: 'EUR', country: 'ES' };
  }

  // Latin America — Spanish locale, USD
  if (['MX', 'AR', 'CO', 'CL', 'PE', 'EC', 'VE', 'UY', 'PY', 'BO', 'CR', 'PA', 'DO', 'GT', 'HN', 'SV', 'NI', 'CU'].includes(code)) {
    return { language: 'es', currency: 'USD', country: 'OTHER' };
  }

  // Euro zone
  if (['DE', 'FR', 'NL', 'EE', 'AT', 'BE', 'IT', 'PT', 'FI', 'IE', 'LU', 'SK', 'SI', 'LV', 'LT', 'MT', 'CY', 'GR', 'HR'].includes(code)) {
    return { language: 'en', currency: 'EUR', country: (code as AppCountry) || 'OTHER' };
  }

  // English-speaking / USD
  if (['US', 'CA'].includes(code)) {
    return { language: 'en', currency: 'USD', country: code === 'US' ? 'US' : 'OTHER' };
  }

  if (code === 'GB') {
    return { language: 'en', currency: 'USD', country: 'GB' };
  }

  // Default: English + USD
  return { language: 'en', currency: 'USD', country: 'OTHER' };
}

export const useLocaleStore = create<LocaleState>()(
  devtools(
    persist(
      (set) => ({
        language: 'uk',
        currency: 'UAH',
        country: 'UA' as AppCountry,
        geoDetected: false,
        cfCountry: null,

        setLanguage: (language) => set({ language }),
        setCurrency: (currency) => set({ currency }),
        setCountry: (country) => set({ country }),

        applyGeoDefaults: (cfCountry: string) =>
          set(() => {
            const defaults = getDefaultsForCountry(cfCountry);
            // If user manually chose a locale via language switcher, respect it
            const userChosen = localStorage.getItem('lex_locale_user_chosen') === 'true';
            if (userChosen) {
              const chosen = localStorage.getItem('lex_locale') as AppLanguage | null;
              if (chosen && ['uk', 'en', 'de', 'es'].includes(chosen)) {
                return { ...defaults, language: chosen, geoDetected: true, cfCountry };
              }
            }
            // Auto-set locale based on IP
            try { localStorage.setItem('lex_locale', defaults.language); } catch { /* ignore */ }
            return { ...defaults, geoDetected: true, cfCountry };
          }),
      }),
      {
        name: 'locale-storage',
        version: 1,
        partialize: (state) => ({
          language: state.language,
          currency: state.currency,
          country: state.country,
          geoDetected: state.geoDetected,
          cfCountry: state.cfCountry,
        }),
      }
    ),
    { name: 'LocaleStore' }
  )
);
