/**
 * localeStore Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLocaleStore } from '../localeStore';

describe('localeStore', () => {
  beforeEach(() => {
    useLocaleStore.setState({
      language: 'uk',
      currency: 'UAH',
      country: 'UA',
      geoDetected: false,
      cfCountry: null,
    });
    localStorage.clear();
  });

  describe('Basic setters', () => {
    it('should set language', () => {
      useLocaleStore.getState().setLanguage('en');
      expect(useLocaleStore.getState().language).toBe('en');
    });

    it('should set currency', () => {
      useLocaleStore.getState().setCurrency('USD');
      expect(useLocaleStore.getState().currency).toBe('USD');
    });

    it('should set country', () => {
      useLocaleStore.getState().setCountry('US');
      expect(useLocaleStore.getState().country).toBe('US');
    });
  });

  describe('applyGeoDefaults', () => {
    it('should set Ukrainian defaults for UA', () => {
      useLocaleStore.getState().applyGeoDefaults('UA');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('uk');
      expect(state.currency).toBe('UAH');
      expect(state.country).toBe('UA');
      expect(state.geoDetected).toBe(true);
      expect(state.cfCountry).toBe('UA');
    });

    it('should set English/USD defaults for US', () => {
      useLocaleStore.getState().applyGeoDefaults('US');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('en');
      expect(state.currency).toBe('USD');
      expect(state.country).toBe('US');
    });

    it('should set English/EUR for Euro zone countries', () => {
      useLocaleStore.getState().applyGeoDefaults('DE');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('en');
      expect(state.currency).toBe('EUR');
      expect(state.country).toBe('DE');
    });

    it('should set Spanish defaults for Spain', () => {
      useLocaleStore.getState().applyGeoDefaults('ES');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('es');
      expect(state.currency).toBe('EUR');
      expect(state.country).toBe('ES');
    });

    it('should set Spanish/USD for Latin America', () => {
      useLocaleStore.getState().applyGeoDefaults('MX');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('es');
      expect(state.currency).toBe('USD');
    });

    it('should set Russian defaults for RU-speaking countries', () => {
      useLocaleStore.getState().applyGeoDefaults('BY');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('ru');
      expect(state.currency).toBe('USD');
    });

    it('should default to English/USD for unknown countries', () => {
      useLocaleStore.getState().applyGeoDefaults('JP');
      const state = useLocaleStore.getState();
      expect(state.language).toBe('en');
      expect(state.currency).toBe('USD');
      expect(state.country).toBe('OTHER');
    });

    it('should be case-insensitive for country codes', () => {
      useLocaleStore.getState().applyGeoDefaults('ua');
      expect(useLocaleStore.getState().language).toBe('uk');
    });

    it('should respect user-chosen locale', () => {
      localStorage.setItem('lex_locale_user_chosen', 'true');
      localStorage.setItem('lex_locale', 'en');

      useLocaleStore.getState().applyGeoDefaults('UA');
      const state = useLocaleStore.getState();
      // Language should stay 'en' (user's choice), but currency/country from geo
      expect(state.language).toBe('en');
      expect(state.currency).toBe('UAH');
      expect(state.country).toBe('UA');
    });
  });
});
