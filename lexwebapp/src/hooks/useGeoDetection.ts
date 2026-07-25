/**
 * Hook for auto-detecting user locale from Cloudflare geo data.
 * Runs once on first visit if functional cookies are allowed.
 */

import { useEffect } from 'react';
import { useConsentStore } from '../stores/consentStore';
import { useLocaleStore } from '../stores/localeStore';
import { geoService } from '../services/api/GeoService';

export function useGeoDetection() {
  const isAllowed = useConsentStore((s) => s.isAllowed);
  const hasConsented = useConsentStore((s) => s.hasConsented);
  const applyGeoDefaults = useLocaleStore((s) => s.applyGeoDefaults);

  useEffect(() => {
    // Always run geo detection (applyGeoDefaults handles force-locale countries like ES/LatAm).
    // For non-force countries, applyGeoDefaults skips if already detected.
    const shouldDetect = !hasConsented || isAllowed('functional');
    if (!shouldDetect) return;

    geoService.detect().then((geo) => {
      applyGeoDefaults(geo.country);
    }).catch(() => {
      // Silently fail - defaults are UA/uk/UAH
    });
  }, [hasConsented, isAllowed, applyGeoDefaults]);
}
