/**
 * ERAU Proxy Routes
 *
 * Proxies requests to the Ukrainian Bar Registry (Єдиний реєстр адвокатів України)
 * at https://erau.unba.org.ua/search
 *
 * Cache-through: Redis → PG → external API. On success, results are persisted
 * to PG and cached in Redis so repeat searches avoid external calls.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { ERAUCacheService } from '../services/erau-cache-service.js';

const ERAU_BASE_URL = 'https://erau.unba.org.ua';
const PROFILE_REDIS_PREFIX = 'erau:profile:';
const PROFILE_REDIS_TTL = 86400; // 24 hours

export interface ERAUProfile {
  id: string;
  fullName: string;
  council: string | null;
  certificate: {
    number: string | null;
    date: string | null;
    issuedBy: string | null;
    decisionNumber: string | null;
    decisionDate: string | null;
  };
  experience: string | null;
  contacts: {
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  practiceForm: {
    type: string | null;
    address: string | null;
    phone: string | null;
  };
  qualification: Array<{ year: string; status: string }>;
}

function parseERAUProfileHTML(html: string, id: string): ERAUProfile {
  const clean = (s: string | null | undefined): string | null => {
    if (!s) return null;
    return s.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim() || null;
  };

  const extract = (pattern: RegExp): string | null => {
    const m = html.match(pattern);
    return m ? clean(m[1]) : null;
  };

  // Name: <h1 class="info-about__name">...</h1>
  const fullName = extract(/<h1[^>]*class="info-about__name"[^>]*>([\s\S]*?)<\/h1>/)
    || extract(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    || '';

  // Council: inside .info-about__council-name <h2>
  const council = extract(/info-about__council-name[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/);

  // Certificate section: .info-about__certificate contains <p> label then <p> value pairs
  const certSection = html.match(/info-about__certificate[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  let certNumber: string | null = null;
  let certDate: string | null = null;
  let issuedBy: string | null = null;

  if (certSection) {
    const cs = certSection[0];
    // Pattern: <p>Label:</p>\n<p class="...">Value</p> or <p>Label:</p>\n<p>Value</p>
    certNumber = extract.call(null, /№\s*Свідоцтва[\s\S]*?<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(cs) ? /dummy/ : /dummy/)
      || null;
    // Use simpler approach — extract all <p> contents from certSection
    const certPs = [...cs.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => clean(m[1]));
    // Structure: [label, value, label, value, label, value]
    for (let i = 0; i < certPs.length - 1; i++) {
      const label = certPs[i] || '';
      const value = certPs[i + 1] || '';
      if (label.includes('Свідоцтва')) { certNumber = value; i++; }
      else if (label.includes('Дата видачі')) { certDate = value; i++; }
      else if (label.includes('Орган')) { issuedBy = value; i++; }
    }
  }

  // Decision section: .info-about__solution
  const solSection = html.match(/info-about__solution[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  let decisionNumber: string | null = null;
  let decisionDate: string | null = null;
  let experience: string | null = null;

  if (solSection) {
    const ss = solSection[0];
    const solPs = [...ss.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => clean(m[1]));
    for (let i = 0; i < solPs.length - 1; i++) {
      const label = solPs[i] || '';
      const value = solPs[i + 1] || '';
      if (label.includes('Номер рішення')) { decisionNumber = value; i++; }
      else if (label.includes('Дата прийняття')) { decisionDate = value; i++; }
      else if (label.includes('стаж')) { experience = value || null; i++; }
    }
  }

  // Contacts section: after "Адреса робочого місця"
  const contactSection = html.match(/Адреса робочого місця[\s\S]*?Форми адвокатської/i);
  let address: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  if (contactSection) {
    const cs = contactSection[0];
    // Address: <h2> inside .text-info after "Адреса основна"
    const addrMatch = cs.match(/Адреса основна[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
    address = addrMatch ? clean(addrMatch[1]) : null;
    // Phone: first tel: link
    const phoneMatch = cs.match(/href="tel:([^"]+)"/i);
    phone = phoneMatch ? clean(phoneMatch[1]) : null;
    // Email: mailto link
    const emailMatch = cs.match(/href="mailto:\s*([\s\S]*?)"/i);
    email = emailMatch ? clean(emailMatch[1]) : null;
  }

  // Practice form section: after "Форми адвокатської діяльності"
  const practiceSection = html.match(/Форми адвокатської діяльності[\s\S]*?(?:Підвищення кваліфікації|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/i);
  let practiceType: string | null = null;
  let practiceAddress: string | null = null;
  let practicePhone: string | null = null;

  if (practiceSection) {
    const ps = practiceSection[0];
    // Type: inside .column-right__header
    const typeMatch = ps.match(/column-right__header[\s\S]*?>([\s\S]*?)<\/div>/i);
    practiceType = typeMatch ? clean(typeMatch[1]) : null;
    if (!practiceType) {
      practiceType = extract(/(Індивідуальна адвокатська діяльність|Адвокатське бюро|Адвокатське об'єднання)/i);
    }
    // Practice address: after "Адреса:" in type-info div, value in next text-info div
    const pAddrMatch = ps.match(/Адреса:[\s\S]*?<\/div>\s*<div[^>]*class="text-info[^>]*>([\s\S]*?)<\/div>/i);
    practiceAddress = pAddrMatch ? clean(pAddrMatch[1]) : null;
    // Practice phone: tel: link inside practice section
    const pPhoneMatch = ps.match(/Мобільний[\s\S]*?href="tel:([^"]+)"/i)
      || ps.match(/href="tel:([^"]+)"/i);
    practicePhone = pPhoneMatch ? clean(pPhoneMatch[1]) : null;
  }

  // Qualification section: after "Підвищення кваліфікації"
  const qualification: Array<{ year: string; status: string }> = [];
  const qualSection = html.match(/Підвищення кваліфікації[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  if (qualSection) {
    // Pairs: <div class="type-info...">2021 рік</div> <div class="text-info...">Виконано</div>
    const pairs = [...qualSection[0].matchAll(/type-info[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="text-info[^>]*>([\s\S]*?)<\/div>/gi)];
    for (const m of pairs) {
      const yearMatch = m[1].match(/(\d{4})/);
      const status = clean(m[2]);
      if (yearMatch && status) {
        qualification.push({ year: yearMatch[1], status });
      }
    }
  }

  return {
    id,
    fullName: fullName || '',
    council,
    certificate: {
      number: certNumber,
      date: certDate,
      issuedBy,
      decisionNumber,
      decisionDate,
    },
    experience,
    contacts: {
      address,
      phone,
      email,
    },
    practiceForm: {
      type: practiceType,
      address: practiceAddress,
      phone: practicePhone,
    },
    qualification,
  };
}

export function createERAUProxyRoutes(erauCacheService?: ERAUCacheService): Router {
  const router = Router();

  // Profile endpoint
  router.get('/profile/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id || !/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid profile ID' });
      }

      // 1. Check Redis cache
      const redisKey = `${PROFILE_REDIS_PREFIX}${id}`;
      try {
        const { getRedisClient } = await import('../utils/redis-client.js');
        const redis = await getRedisClient();
        if (redis) {
          const cached = await redis.get(redisKey);
          if (cached) {
            logger.info(`[ERAU] Profile cache hit for id=${id}`);
            return res.json(JSON.parse(cached));
          }
        }
      } catch (err: any) {
        logger.warn('[ERAU] Redis read error for profile', { error: err.message });
      }

      // 2. Fetch from ERAU
      const url = `${ERAU_BASE_URL}/profile/${id}`;
      logger.info(`[ERAU] Fetching profile id=${id}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'SecondLayer/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: 'Profile not found' });
        }
        return res.status(502).json({ error: `ERAU returned status ${response.status}` });
      }

      const html = await response.text();
      const profile = parseERAUProfileHTML(html, id);

      // 3. Cache in Redis (fire-and-forget)
      try {
        const { getRedisClient } = await import('../utils/redis-client.js');
        const redis = await getRedisClient();
        if (redis) {
          await redis.set(redisKey, JSON.stringify(profile), { EX: PROFILE_REDIS_TTL });
        }
      } catch (err: any) {
        logger.warn('[ERAU] Redis write error for profile', { error: err.message });
      }

      res.json(profile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[ERAU] Profile fetch error', { error: msg });
      if (msg.includes('timeout') || msg.includes('abort')) {
        return res.status(504).json({ error: 'ERAU request timed out' });
      }
      res.status(502).json({ error: 'Failed to fetch ERAU profile' });
    }
  });

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const surname = req.query.surname as string;
      if (!surname || surname.trim().length < 2) {
        return res.status(400).json({ error: 'surname query parameter required (min 2 characters)' });
      }

      const trimmed = surname.trim();

      // 1. Check cache (Redis → PG)
      if (erauCacheService) {
        const cached = await erauCacheService.getBySurname(trimmed);
        if (cached && cached.length > 0) {
          logger.info(`[ERAU] Serving ${cached.length} cached results for "${trimmed}"`);
          return res.json(cached);
        }
      }

      // 2. Fetch from external API
      const url = `${ERAU_BASE_URL}/search?surname=${encodeURIComponent(trimmed)}`;
      logger.info(`[ERAU] Proxying search for surname="${trimmed}"`);

      let items: any[];
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SecondLayer/1.0',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          logger.warn(`[ERAU] Upstream returned ${response.status}`);
          // Fallback to PG on upstream error
          if (erauCacheService) {
            const fallback = await erauCacheService.getBySurname(trimmed);
            if (fallback && fallback.length > 0) {
              logger.info(`[ERAU] Serving ${fallback.length} PG fallback results for "${trimmed}"`);
              return res.json(fallback);
            }
          }
          return res.status(502).json({ error: `ERAU returned status ${response.status}` });
        }

        const data = await response.json() as any;
        items = Array.isArray(data) ? data : (data.items || []);
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        logger.error('[ERAU] External API error', { error: msg });

        // Fallback to PG on network/timeout errors
        if (erauCacheService) {
          const fallback = await erauCacheService.getBySurname(trimmed);
          if (fallback && fallback.length > 0) {
            logger.info(`[ERAU] Serving ${fallback.length} PG fallback results after external failure for "${trimmed}"`);
            return res.json(fallback);
          }
        }

        if (msg.includes('timeout') || msg.includes('abort')) {
          return res.status(504).json({ error: 'ERAU request timed out' });
        }
        return res.status(502).json({ error: 'Failed to reach ERAU registry' });
      }

      // 3. Cache results (fire-and-forget)
      if (erauCacheService && items.length > 0) {
        erauCacheService.cacheResults(trimmed, items).catch((err) => {
          logger.warn('[ERAU] Background cache write failed', { error: err.message });
        });
      }

      res.json(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[ERAU] Proxy error', { error: msg });
      res.status(502).json({ error: 'Failed to reach ERAU registry' });
    }
  });

  return router;
}
