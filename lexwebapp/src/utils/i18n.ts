/**
 * Lightweight i18n helper for locale-aware strings.
 * Usage:
 *   const language = useLocaleStore(s => s.language);
 *   const t = createT(language);
 *   t({ uk: 'Клієнти', en: 'Clients', es: 'Clientes' })
 */

import type { AppLanguage } from '../stores/localeStore';

export type Translations = {
  uk: string;
  en: string;
  es: string;
  ru?: string;
};

/**
 * Creates a translation function bound to a specific language.
 * Falls back: ru -> uk, unknown -> en.
 */
export function createT(language: AppLanguage) {
  return function t(map: Translations): string {
    if (language === 'ru') return map.ru ?? map.uk;
    return map[language] ?? map.en;
  };
}

/**
 * Returns a locale string suitable for toLocaleDateString, etc.
 */
export function getDateLocale(language: AppLanguage): string {
  switch (language) {
    case 'uk': return 'uk-UA';
    case 'en': return 'en-US';
    case 'es': return 'es-ES';
    case 'ru': return 'ru-RU';
    default: return 'en-US';
  }
}
