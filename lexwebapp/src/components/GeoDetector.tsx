/**
 * GeoDetector
 * Invisible component that runs geo detection on mount.
 */

import { useGeoDetection } from '../hooks/useGeoDetection';

export function GeoDetector() {
  useGeoDetection();
  return null;
}
