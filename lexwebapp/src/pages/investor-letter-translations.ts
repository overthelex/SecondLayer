import { ua } from './investor-letter-translations.ua';
import { en } from './investor-letter-translations.en';
import { ru } from './investor-letter-translations.ru';

export type Lang = 'ua' | 'en' | 'ru';
export type Translations = typeof ua;

export const translations: Record<Lang, Translations> = { ua, en: en as Translations, ru: ru as Translations };
