import { useEffect } from 'react';

interface HreflangEntry {
  lang: string;   // e.g., 'uk', 'en', 'es', 'ru'
  href: string;   // full URL
}

export function useHreflang(entries: HreflangEntry[], defaultLang: string = 'uk') {
  useEffect(() => {
    // Remove any existing hreflang links
    document.querySelectorAll('link[hreflang]').forEach(el => el.remove());

    // Add new hreflang links
    const links: HTMLLinkElement[] = [];

    for (const entry of entries) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = entry.lang;
      link.href = entry.href;
      document.head.appendChild(link);
      links.push(link);
    }

    // Add x-default
    const defaultEntry = entries.find(e => e.lang === defaultLang);
    if (defaultEntry) {
      const xDefault = document.createElement('link');
      xDefault.rel = 'alternate';
      xDefault.setAttribute('hreflang', 'x-default');
      xDefault.href = defaultEntry.href;
      document.head.appendChild(xDefault);
      links.push(xDefault);
    }

    return () => {
      links.forEach(link => link.remove());
    };
  }, [entries, defaultLang]);
}
