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
  const geoDetected = useLocaleStore((s) => s.geoDetected);
  const applyGeoDefaults = useLocaleStore((s) => s.applyGeoDefaults);

  useEffect(() => {
    // Only detect if:
    // 1. User hasn't been geo-detected yet
    // 2. User has consented AND functional cookies are allowed
    //    OR user hasn't consented yet (we detect to show proper defaults, but don't persist until consent)
    if (geoDetected) return;

    const shouldDetect = !hasConsented || isAllowed('functional');
    if (!shouldDetect) return;

    geoService.detect().then((geo) => {
      applyGeoDefaults(geo.country);
    }).catch(() => {
      // Silently fail - defaults are UA/uk/UAH
    });
  }, [hasConsented, geoDetected, isAllowed, applyGeoDefaults]);
}
