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
  const extract = (pattern: RegExp): string | null => {
    const m = html.match(pattern);
    return m ? m[1].trim() : null;
  };

  // Name: first <h1> tag
  const fullName = extract(/<h1[^>]*>([\s\S]*?)<\/h1>/) || '';

  // Council: text after "Обліковується у:" section
  const council = extract(/<h2[^>]*>[\s\S]*?Обліковується[\s\S]*?<\/h2>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/);

  // Certificate fields
  const certNumber = extract(/№\s*Свідоцтва:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i)
    || extract(/№\s*Свідоцтва:?\s*([\d\S]+)/i);
  const certDate = extract(/Дата видачі свідоцтва:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i);
  const issuedBy = extract(/Орган,?\s*що видав свідоцтво:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i);
  const decisionNumber = extract(/Номер рішення:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i);
  const decisionDate = extract(/Дата прийняття рішення:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i);

  // Experience
  const experience = extract(/Загальний стаж:?\s*<\/strong>\s*([\s\S]*?)(?:<|$)/i)
    || extract(/стаж[^<]*?(\d+\s*(?:рок|років|р\.)[\s\S]*?)(?:<|$)/i);

  // Contacts
  const address = extract(/Адреса основна:?\s*<\/strong>\s*([\s\S]*?)(?:<\/|<strong|<h)/i);
  const phone = extract(/href="tel:([^"]+)"/i);
  const email = extract(/href="mailto:([^"]+)"/i);

  // Practice form
  const practiceType = extract(/Форма здійснення[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i)
    || extract(/(Індивідуальна адвокатська діяльність|Адвокатське бюро|Адвокатське об'єднання)/i);
  const practiceAddress = extract(/Адреса здійснення діяльності:?\s*<\/strong>\s*([\s\S]*?)(?:<\/|<strong|<h)/i);
  const practicePhone = extract(/Телефон(?:\s*(?:робочий|офісу))?:?\s*<\/strong>\s*[\s\S]*?href="tel:([^"]+)"/i);

  // Qualification - collect year/status pairs
  const qualification: Array<{ year: string; status: string }> = [];
  const qualSection = html.match(/Підвищення кваліфікації[\s\S]*?(?:<\/(?:div|section|table)>)/i);
  if (qualSection) {
    const yearMatches = qualSection[0].matchAll(/(\d{4})\s*(?:рік|р\.?)[\s\S]*?(Виконано|Не виконано|В процесі|зараховано|не зараховано)/gi);
    for (const m of yearMatches) {
      qualification.push({ year: m[1], status: m[2] });
    }
  }

  const clean = (s: string | null): string | null => {
    if (!s) return null;
    return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
  };

  return {
    id,
    fullName: clean(fullName) || '',
    council: clean(council),
    certificate: {
      number: clean(certNumber),
      date: clean(certDate),
      issuedBy: clean(issuedBy),
      decisionNumber: clean(decisionNumber),
      decisionDate: clean(decisionDate),
    },
    experience: clean(experience),
    contacts: {
      address: clean(address),
      phone: clean(phone),
      email: clean(email),
    },
    practiceForm: {
      type: clean(practiceType),
      address: clean(practiceAddress),
      phone: clean(practicePhone),
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
