import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface DocumentMeta {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  canonical?: string;
}

const BASE_URL = 'https://legal.org.ua';

function getOrCreateMeta(attr: 'name' | 'property', value: string): HTMLMetaElement {
  const selector = `meta[${attr}="${value}"]`;
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  return el;
}

function getOrCreateLink(rel: string): HTMLLinkElement {
  const selector = `link[rel="${rel}"]`;
  let el = document.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  return el;
}

export function useDocumentMeta(meta: DocumentMeta) {
  const location = useLocation();
  const originalTitle = useRef(document.title);
  const originalValues = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    originalTitle.current = document.title;

    // Store original values for cleanup
    const stored = new Map<string, string | null>();

    const descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    stored.set('description', descEl?.getAttribute('content') ?? null);

    const ogTitleEl = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    stored.set('og:title', ogTitleEl?.getAttribute('content') ?? null);

    const ogDescEl = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    stored.set('og:description', ogDescEl?.getAttribute('content') ?? null);

    const ogImageEl = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    stored.set('og:image', ogImageEl?.getAttribute('content') ?? null);

    const ogUrlEl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    stored.set('og:url', ogUrlEl?.getAttribute('content') ?? null);

    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    stored.set('canonical', canonicalEl?.getAttribute('href') ?? null);

    originalValues.current = stored;

    // Set new values
    document.title = meta.title;

    if (meta.description) {
      getOrCreateMeta('name', 'description').setAttribute('content', meta.description);
    }

    const ogTitle = meta.ogTitle || meta.title;
    getOrCreateMeta('property', 'og:title').setAttribute('content', ogTitle);

    if (meta.ogDescription || meta.description) {
      getOrCreateMeta('property', 'og:description').setAttribute('content', (meta.ogDescription || meta.description)!);
    }

    if (meta.ogImage) {
      getOrCreateMeta('property', 'og:image').setAttribute('content', meta.ogImage);
    }

    const url = meta.ogUrl || meta.canonical || `${BASE_URL}${location.pathname}`;
    getOrCreateMeta('property', 'og:url').setAttribute('content', url);

    const canonical = meta.canonical || `${BASE_URL}${location.pathname}`;
    getOrCreateLink('canonical').setAttribute('href', canonical);

    // Cleanup: restore original values on unmount
    return () => {
      document.title = originalTitle.current;

      const orig = originalValues.current;

      const restoreMeta = (attr: 'name' | 'property', key: string) => {
        const originalVal = orig.get(key);
        const el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
        if (el) {
          if (originalVal !== null && originalVal !== undefined) {
            el.setAttribute('content', originalVal);
          } else {
            el.remove();
          }
        }
      };

      restoreMeta('name', 'description');
      restoreMeta('property', 'og:title');
      restoreMeta('property', 'og:description');
      restoreMeta('property', 'og:image');
      restoreMeta('property', 'og:url');

      const canonicalOrig = orig.get('canonical');
      const linkEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (linkEl) {
        if (canonicalOrig !== null && canonicalOrig !== undefined) {
          linkEl.setAttribute('href', canonicalOrig);
        } else {
          linkEl.remove();
        }
      }
    };
  }, [meta.title, meta.description, meta.ogTitle, meta.ogDescription, meta.ogImage, meta.ogUrl, meta.canonical, location.pathname]);
}
