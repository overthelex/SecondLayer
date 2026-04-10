import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Updates the canonical URL and og:url meta tag to match the current page.
 * Without this, every page tells Google it IS the homepage.
 *
 * @param overrideUrl - Optional full URL to use instead of auto-detecting from pathname
 */
export function useCanonical(overrideUrl?: string) {
  const location = useLocation();

  useEffect(() => {
    const url = overrideUrl || `https://legal.org.ua${location.pathname}`;

    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) {
      canonical.href = url;
    }

    const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement;
    if (ogUrl) {
      ogUrl.content = url;
    }

    return () => {
      // Reset to homepage default on unmount
      if (canonical) canonical.href = 'https://legal.org.ua';
      if (ogUrl) ogUrl.content = 'https://legal.org.ua';
    };
  }, [location.pathname, overrideUrl]);
}
