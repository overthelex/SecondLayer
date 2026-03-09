/**
 * Geo Service
 * Multi-signal locale detection:
 * 1. Cloudflare CF-IPCountry header (via backend /api/geo) — fails for VPN users
 * 2. Browser signals (navigator.language, Intl timezone) — works even with VPN
 * 3. Merges both signals, browser wins on conflict (user's actual device settings)
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface GeoInfo {
  country: string;       // ISO 3166-1 alpha-2 (e.g., "UA", "US")
  language: string;      // Suggested language (e.g., "uk", "en")
  currency: string;      // Suggested currency (e.g., "UAH", "USD", "EUR")
  timezone: string;      // IANA timezone
  source: 'cloudflare' | 'browser' | 'merged';
}

/** Timezones that map to Ukraine */
const UA_TIMEZONES = ['Europe/Kiev', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Simferopol'];

/** Map timezone → likely country */
const TZ_COUNTRY_MAP: Record<string, string> = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL', 'Europe/Tallinn': 'EE', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Helsinki': 'FI', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Brussels': 'BE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Dublin': 'IE',
  'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Zagreb': 'HR',
  'Europe/Ljubljana': 'SI', 'Europe/Bratislava': 'SK', 'Europe/Luxembourg': 'LU',
};

const EURO_COUNTRIES = new Set([
  'DE', 'FR', 'NL', 'EE', 'AT', 'BE', 'ES', 'IT', 'PT', 'FI',
  'IE', 'LU', 'SK', 'SI', 'LV', 'LT', 'MT', 'CY', 'GR', 'HR',
]);

function currencyForCountry(country: string): string {
  if (country === 'UA') return 'UAH';
  if (EURO_COUNTRIES.has(country)) return 'EUR';
  if (country === 'GB') return 'GBP';
  return 'USD';
}

class GeoServiceClass {
  private cache: GeoInfo | null = null;

  async detect(): Promise<GeoInfo> {
    if (this.cache) return this.cache;

    // Get browser signals (always available, works through VPN)
    const browserGeo = this.detectFromBrowser();

    // Try Cloudflare detection
    let cfGeo: GeoInfo | null = null;
    try {
      const res = await fetch(`${API_URL}/api/geo`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.country && data.country !== 'OTHER') {
          cfGeo = { ...data, timezone: browserGeo.timezone, source: 'cloudflare' as const };
        }
      }
    } catch {
      // CF detection failed, browser-only
    }

    // Merge: browser language/timezone take priority (resistant to VPN)
    // CF country used only if browser doesn't have a strong signal
    let result: GeoInfo;

    if (cfGeo && cfGeo.country === browserGeo.country) {
      // Both agree — high confidence
      result = { ...browserGeo, source: 'merged' };
    } else if (browserGeo.country !== 'OTHER') {
      // Browser has a specific country signal (from timezone/language) — trust it
      result = { ...browserGeo, source: 'browser' };
    } else if (cfGeo) {
      // Browser is generic, CF has data — use CF
      result = { ...cfGeo, source: 'cloudflare' };
    } else {
      // No strong signal from either
      result = browserGeo;
    }

    this.cache = result;
    return result;
  }

  private detectFromBrowser(): GeoInfo {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const browserLang = navigator.language || 'uk-UA';
    const langCode = browserLang.split('-')[0].toLowerCase();

    // Detect country from timezone
    let country = 'OTHER';
    if (UA_TIMEZONES.includes(timezone)) {
      country = 'UA';
    } else if (TZ_COUNTRY_MAP[timezone]) {
      country = TZ_COUNTRY_MAP[timezone];
    }

    // If timezone didn't help, check language subtag (e.g., "uk-UA" → "UA")
    if (country === 'OTHER') {
      const parts = browserLang.split('-');
      if (parts.length >= 2) {
        const region = parts[parts.length - 1].toUpperCase();
        if (region.length === 2) country = region;
      }
    }

    // Language: if browser says Ukrainian, use it
    const language = (langCode === 'uk' || country === 'UA') ? 'uk' : 'en';

    return {
      country,
      language,
      currency: currencyForCountry(country),
      timezone,
      source: 'browser',
    };
  }

  clearCache() {
    this.cache = null;
  }
}

export const geoService = new GeoServiceClass();
