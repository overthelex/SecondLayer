#!/usr/bin/env node
/**
 * Load legislation needed for TCC (ТЦК) disputes into the database.
 *
 * Block 1 — Substantive law:
 *  1. КУпАП — Кодекс про адміністративні правопорушення (80731-10)
 *  2. Закон «Про військовий обов'язок і військову службу» (2232-12)
 *  3. Закон «Про мобілізаційну підготовку та мобілізацію» (3543-12)
 *
 * Block 3 — Bylaws (підзаконні акти):
 *  4. КМУ №1487 — Порядок військового обліку (1487-2022-п)
 *  5. КМУ №560  — Порядок призову під час мобілізації (560-2024-п)
 *  6. КМУ №76   — Бронювання військовозобов'язаних (76-2023-п)
 *  7. Наказ МОУ №402 — Положення про ВЛК/ВЛЕ (z1109-08)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/load-tck-legislation.js --skip-vectors
 *   node scripts/load-tck-legislation.js 80731-10 2232-12
 *
 * Env vars: DATABASE_URL, POSTGRES_*, OPENAI_API_KEY, QDRANT_URL
 */

import pg from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';

const { Pool } = pg;

// ─── Configuration ───────────────────────────────────────────────
const LAWS = [
  // Block 1 — substantive law
  {
    rada_id: '80731-10',
    short: 'КУпАП',
    title: 'Кодекс України про адміністративні правопорушення',
    type: 'code',
    parse_mode: 'articles',
    key_articles: ['210', '210-1', '211'],
  },
  {
    rada_id: '2232-12',
    short: 'Про військовий обов\'язок',
    title: 'Закон України «Про військовий обов\'язок і військову службу»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '3543-12',
    short: 'Про мобілізацію',
    title: 'Закон України «Про мобілізаційну підготовку та мобілізацію»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  // Block 3 — bylaws (підзаконні акти)
  {
    rada_id: '1487-2022-п',
    short: 'КМУ №1487 (облік)',
    title: 'Порядок організації та ведення військового обліку призовників, військовозобов\'язаних та резервістів',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '560-2024-п',
    short: 'КМУ №560 (призов)',
    title: 'Питання проведення призову громадян на військову службу під час мобілізації',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '76-2023-п',
    short: 'КМУ №76 (бронювання)',
    title: 'Деякі питання бронювання військовозобов\'язаних на період мобілізації та на воєнний час',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: 'z1109-08',
    short: 'Наказ МОУ №402 (ВЛК)',
    title: 'Положення про військово-лікарську експертизу в Збройних Силах України',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  // Block 4 — Статути ЗСУ
  {
    rada_id: '548-14',
    short: 'Статут внутрішньої служби',
    title: 'Статут внутрішньої служби Збройних Сил України',
    type: 'law',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '551-14',
    short: 'Дисциплінарний статут',
    title: 'Дисциплінарний статут Збройних Сил України',
    type: 'law',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '550-14',
    short: 'Статут гарнізонної служби',
    title: 'Статут гарнізонної та вартової служб Збройних Сил України',
    type: 'law',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '549-14',
    short: 'Стройовий статут',
    title: 'Стройовий статут Збройних Сил України',
    type: 'law',
    parse_mode: 'points',
    key_articles: [],
  },
  // Block 5 — Закони воєнного часу
  {
    rada_id: '389-19',
    short: 'Про воєнний стан',
    title: 'Закон України «Про правовий режим воєнного стану»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '1932-12',
    short: 'Про оборону',
    title: 'Закон України «Про оборону України»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '1934-12',
    short: 'Про ЗСУ',
    title: 'Закон України «Про Збройні Сили України»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '2011-12',
    short: 'Про соцзахист військових',
    title: 'Закон України «Про соціальний і правовий захист військовослужбовців та членів їх сімей»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '3551-12',
    short: 'Про статус ветеранів',
    title: 'Закон України «Про статус ветеранів війни, гарантії їх соціального захисту»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '1105-14',
    short: 'Про соцстрахування',
    title: 'Закон України «Про загальнообов\'язкове державне соціальне страхування»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  // Block 6 — Додаткові підзаконні акти
  {
    rada_id: '413-2022-п',
    short: 'КМУ №413 (статус УБД)',
    title: 'Порядок надання статусу учасника бойових дій — учасника війни',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '1045-2024-п',
    short: 'КМУ №1045 (відстрочка)',
    title: 'Деякі питання надання відстрочки від призову на військову службу під час мобілізації',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: 'z0438-09',
    short: 'Інструкція про проходження',
    title: 'Інструкція про порядок проходження військової служби',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '154-2022-п',
    short: 'КМУ №154 (Положення про ТЦК)',
    title: 'Положення про територіальні центри комплектування та соціальної підтримки',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: 'z1103-08',
    short: 'Інструкція про ВЛК (Наказ №320)',
    title: 'Інструкція про порядок медичного огляду та ВЛК у Збройних Силах України',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  // Block 7 — Додаткове військове законодавство (2026-03-21)
  {
    rada_id: '1075-14',
    short: 'Про правовий режим майна ЗСУ',
    title: 'Закон України «Про правовий режим майна у Збройних Силах України»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '2262-12',
    short: 'Про пенсійне забезпечення військових',
    title: 'Закон України «Про пенсійне забезпечення осіб, звільнених з військової служби, та деяких інших осіб»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
  {
    rada_id: '704-2017-п',
    short: 'КМУ №704 (грошове забезпечення)',
    title: 'Про грошове забезпечення військовослужбовців, осіб рядового і начальницького складу та деяких інших осіб',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '975-2013-п',
    short: 'КМУ №975 (одноразова допомога)',
    title: 'Порядок призначення і виплати одноразової грошової допомоги у разі загибелі (смерті), інвалідності або часткової втрати працездатності військовослужбовців',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: 'z0616-24',
    short: 'Наказ МОУ №262 (зміни ВЛК 2024)',
    title: 'Про внесення змін до Положення про ВЛЕ в ЗСУ (скасування «обмежено придатний»)',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '930-2024-п',
    short: 'КМУ №930 (зміни мобілізації 2024)',
    title: 'Про внесення змін до Порядку проведення призову громадян на військову службу під час мобілізації',
    type: 'regulation',
    parse_mode: 'points',
    key_articles: [],
  },
  {
    rada_id: '3633-20',
    short: 'ЗУ №3633 (реформа мобілізації 2024)',
    title: 'Закон України «Про внесення змін до деяких законодавчих актів щодо окремих питань мобілізації, військового обліку та проходження військової служби»',
    type: 'law',
    parse_mode: 'articles',
    key_articles: [],
  },
];

const BASE_URL = 'https://zakon.rada.gov.ua';

const skipVectors = process.argv.includes('--skip-vectors');
const forceReload = process.argv.includes('--force');
const explicitIds = process.argv.slice(2).filter(a => !a.startsWith('--'));

const DATABASE_URL = process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'secondlayer'}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'secondlayer_stage'}`;

const pool = new Pool({ connectionString: DATABASE_URL });

const httpClient = axios.create({
  timeout: 120000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; SecondLayer/1.0)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'uk,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
  },
  decompress: true,
  maxContentLength: 50 * 1024 * 1024,
});

// ─── HTML Parsing: Articles (Статті) ─────────────────────────────
function parseArticlesFromHtml(html) {
  const $ = cheerio.load(html);
  const articles = [];

  const titleEl = $('.title, .doc-title, h1, .rvts23').first();
  const title = titleEl.text().trim();

  const bodyHtml = $('body').html() || '';

  // Updated regex: allow title text inside the span after article number
  const articleRegex = /<span\s+class=["']?rvts9["']?>Стаття\s+(\d+(?:-\d+)?)\.\s*([^<]*)<\/span>\s*(.*?)(?=<span\s+class=["']?rvts9["']?>Стаття\s+\d|$)/gs;

  let match;
  while ((match = articleRegex.exec(bodyHtml)) !== null) {
    const articleNumber = match[1];
    const inSpanTitle = match[2].trim();
    const afterSpanHtml = match[3];

    const $a = cheerio.load(`<div>${afterSpanHtml}</div>`);
    $a('script, style').remove();
    const afterText = $a.text().trim().replace(/\s+/g, ' ').replace(/\{[^}]+\}/g, '').trim();

    const fullText = inSpanTitle
      ? `${inSpanTitle} ${afterText}`.trim()
      : afterText;

    if (fullText.length < 10) continue;

    articles.push({
      article_number: articleNumber,
      title: inSpanTitle && inSpanTitle.length < 300 ? inSpanTitle : undefined,
      full_text: fullText,
      full_text_html: afterSpanHtml.substring(0, 10000),
      byte_size: Buffer.byteLength(fullText, 'utf8'),
    });
  }

  // Fallback: plain text regex
  if (articles.length === 0) {
    console.log('  Using text fallback parser for articles...');
    const bodyText = $('body').text();
    const pattern = /Стаття\s+(\d+(?:-\d+)?)\.\s*/gi;
    const matches = [...bodyText.matchAll(pattern)];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const articleNumber = m[1];
      const start = m.index;
      const end = i + 1 < matches.length ? matches[i + 1].index : bodyText.length;
      let fullText = bodyText.substring(start, end).trim().replace(/\s+/g, ' ');
      fullText = fullText.replace(/\{[^}]+\}/g, '').trim();

      if (fullText.length < 20) continue;

      const contentAfterNum = fullText.replace(/^Стаття\s+\d+(?:-\d+)?\.\s*/, '');
      const firstSentence = contentAfterNum.split(/[.;]/)[0];

      articles.push({
        article_number: articleNumber,
        title: firstSentence?.length < 200 ? firstSentence.trim() : undefined,
        full_text: fullText,
        byte_size: Buffer.byteLength(fullText, 'utf8'),
      });
    }
  }

  return { title, articles };
}

// ─── HTML Parsing: Points (Пункти) for bylaws ───────────────────
function parsePointsFromHtml(html) {
  const $ = cheerio.load(html);

  const titleEl = $('.rvts23, .title, .doc-title, h1').first();
  const title = titleEl.text().trim();

  const bodyText = $('body').text();
  const articles = [];

  // Match "N. " at start of line or after whitespace — numbered points
  const pointPattern = /(?:^|\n)\s*(\d+)\.\s+/g;
  const matches = [...bodyText.matchAll(pointPattern)];

  // Filter to keep only top-level points (sequential numbering)
  const topPoints = [];
  let expectedNext = 1;
  for (const m of matches) {
    const num = parseInt(m[1]);
    if (num === expectedNext) {
      topPoints.push(m);
      expectedNext = num + 1;
    } else if (num === 1 && topPoints.length > 0) {
      continue;
    }
  }

  // If we found fewer than 3 sequential points, fallback to all matches
  const pointsToUse = topPoints.length >= 3 ? topPoints : matches;

  for (let i = 0; i < pointsToUse.length; i++) {
    const m = pointsToUse[i];
    const pointNumber = m[1];
    const start = m.index;
    const end = i + 1 < pointsToUse.length ? pointsToUse[i + 1].index : bodyText.length;
    let fullText = bodyText.substring(start, end).trim().replace(/\s+/g, ' ');
    fullText = fullText.replace(/\{[^}]+\}/g, '').trim();

    if (fullText.length < 20) continue;
    if (fullText.length > 50000) fullText = fullText.substring(0, 50000);

    const contentAfterNum = fullText.replace(/^\d+\.\s*/, '');
    const firstSentence = contentAfterNum.split(/[.;]/)[0];

    articles.push({
      article_number: `п.${pointNumber}`,
      title: firstSentence?.length < 300 ? firstSentence.trim() : undefined,
      full_text: fullText,
      byte_size: Buffer.byteLength(fullText, 'utf8'),
    });
  }

  // If point parsing got nothing, try section-based splitting
  if (articles.length === 0) {
    console.log('  Using section fallback parser for bylaw...');
    const sectionPattern = /(?:Розділ|РОЗДІЛ)\s+([IVXLCDM\d]+)\.\s*/gi;
    const secMatches = [...bodyText.matchAll(sectionPattern)];

    for (let i = 0; i < secMatches.length; i++) {
      const m = secMatches[i];
      const sectionNum = m[1];
      const start = m.index;
      const end = i + 1 < secMatches.length ? secMatches[i + 1].index : bodyText.length;
      let fullText = bodyText.substring(start, end).trim().replace(/\s+/g, ' ');
      fullText = fullText.replace(/\{[^}]+\}/g, '').trim();

      if (fullText.length < 20) continue;
      if (fullText.length > 50000) fullText = fullText.substring(0, 50000);

      articles.push({
        article_number: `розд.${sectionNum}`,
        title: fullText.substring(0, 200).split(/[.;]/)[0]?.trim(),
        full_text: fullText,
        byte_size: Buffer.byteLength(fullText, 'utf8'),
      });
    }
  }

  return { title, articles };
}

// ─── Database Operations ─────────────────────────────────────────
async function checkExisting(radaId) {
  const res = await pool.query(
    `SELECT l.id, l.title, l.total_articles,
            (SELECT COUNT(*) FROM legislation_articles la WHERE la.legislation_id = l.id AND la.is_current = true) as articles_count,
            (SELECT COUNT(*) FROM legislation_chunks lc WHERE lc.legislation_id = l.id) as chunks_count
     FROM legislation l WHERE l.rada_id = $1`,
    [radaId]
  );
  return res.rows[0] || null;
}

async function deleteExisting(radaId) {
  const existing = await checkExisting(radaId);
  if (existing) {
    await pool.query('DELETE FROM legislation_chunks WHERE legislation_id = $1', [existing.id]);
    await pool.query('DELETE FROM legislation_articles WHERE legislation_id = $1', [existing.id]);
    await pool.query('DELETE FROM legislation WHERE id = $1', [existing.id]);
    console.log(`  Deleted existing record (id=${existing.id}, ${existing.articles_count} articles)`);
  }
}

async function saveLegislation(law, parsedTitle, articles) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const legResult = await client.query(
      `INSERT INTO legislation (rada_id, type, title, short_title, full_url, status, total_articles, structure_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (rada_id) DO UPDATE SET
         title = EXCLUDED.title,
         short_title = EXCLUDED.short_title,
         total_articles = EXCLUDED.total_articles,
         updated_at = NOW()
       RETURNING id`,
      [
        law.rada_id,
        law.type,
        parsedTitle || law.title,
        law.short,
        `${BASE_URL}/laws/show/${law.rada_id}/print`,
        'active',
        articles.length,
        {},
      ]
    );

    const legislationId = legResult.rows[0].id;
    let saved = 0;

    for (const article of articles) {
      await client.query(
        `INSERT INTO legislation_articles
         (legislation_id, article_number, title, full_text, full_text_html, is_current, byte_size, version_date, metadata)
         VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), $7)
         ON CONFLICT (legislation_id, article_number, version_date) DO UPDATE SET
           full_text = EXCLUDED.full_text,
           full_text_html = EXCLUDED.full_text_html,
           byte_size = EXCLUDED.byte_size,
           title = EXCLUDED.title,
           updated_at = NOW()`,
        [
          legislationId,
          article.article_number,
          article.title,
          article.full_text,
          article.full_text_html || null,
          article.byte_size,
          { rada_id: law.rada_id, extraction_date: new Date().toISOString() },
        ]
      );
      saved++;
    }

    await client.query('COMMIT');
    return { legislationId, saved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Vector Indexing (optional, needs built backend) ─────────────
async function indexVectors(radaId) {
  const { LegislationService } = await import('../mcp_backend/dist/services/legislation-service.js');
  const { EmbeddingService } = await import('../mcp_backend/dist/services/embedding-service.js');

  const embeddingService = new EmbeddingService();
  const service = new LegislationService(pool, embeddingService);
  await service.indexArticlesForVectorSearch(radaId);
}

// ─── Main ────────────────────────────────────────────────────────
async function loadLaw(law) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${law.short} (${law.rada_id})`);
  console.log(`  ${law.title}`);
  console.log(`  Parse mode: ${law.parse_mode}`);
  console.log('='.repeat(60));

  // Check existing
  const existing = await checkExisting(law.rada_id);
  if (existing && Number(existing.articles_count) > 0 && !forceReload) {
    console.log(`  Already loaded: ${existing.articles_count} articles, ${existing.chunks_count} chunks`);
    if (Number(existing.chunks_count) === 0 && !skipVectors) {
      console.log('  No vector chunks — will index...');
    } else {
      if (law.key_articles.length > 0) {
        await showKeyArticles(law.rada_id, law.key_articles);
      }
      return { status: 'exists', articles: Number(existing.articles_count), chunks: Number(existing.chunks_count) };
    }
  }

  // Force reload: delete existing
  if (forceReload && existing) {
    await deleteExisting(law.rada_id);
  }

  // Fetch & parse
  if (!existing || Number(existing.articles_count) === 0 || forceReload) {
    const url = `${BASE_URL}/laws/show/${law.rada_id}/print`;
    console.log(`  Fetching ${url} ...`);
    const start = Date.now();

    try {
      const resp = await httpClient.get(url);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const htmlSize = (Buffer.byteLength(resp.data, 'utf8') / 1024).toFixed(0);
      console.log(`  Fetched ${htmlSize} KB in ${elapsed}s`);

      const parser = law.parse_mode === 'points' ? parsePointsFromHtml : parseArticlesFromHtml;
      const { title: parsedTitle, articles } = parser(resp.data);
      console.log(`  Parsed ${articles.length} ${law.parse_mode === 'points' ? 'points' : 'articles'}`);

      if (articles.length === 0) {
        console.log('  WARNING: Nothing parsed! HTML format may have changed.');
        return { status: 'error', articles: 0, chunks: 0 };
      }

      // Show first 3 parsed items
      for (const a of articles.slice(0, 3)) {
        console.log(`    ${a.article_number}: ${(a.title || a.full_text.substring(0, 80)).substring(0, 80)}...`);
      }

      console.log('  Saving to database...');
      const { legislationId, saved } = await saveLegislation(law, parsedTitle, articles);
      console.log(`  Saved: legislation_id=${legislationId}, ${saved} records`);
    } catch (err) {
      console.error(`  ERROR fetching ${law.rada_id}:`, err.message);
      return { status: 'error', articles: 0, chunks: 0 };
    }
  }

  // Vector indexing
  if (!skipVectors) {
    try {
      console.log('  Indexing vectors (may take a while)...');
      const start = Date.now();
      await indexVectors(law.rada_id);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  Vector indexing done in ${elapsed}s`);
    } catch (err) {
      console.error(`  Vector indexing failed (records still saved):`, err.message);
    }
  }

  // Show key articles
  if (law.key_articles.length > 0) {
    await showKeyArticles(law.rada_id, law.key_articles);
  }

  const after = await checkExisting(law.rada_id);
  return {
    status: 'loaded',
    articles: Number(after?.articles_count || 0),
    chunks: Number(after?.chunks_count || 0),
  };
}

async function showKeyArticles(radaId, articleNumbers) {
  console.log('  Key articles for TCC disputes:');
  for (const num of articleNumbers) {
    const res = await pool.query(
      `SELECT la.article_number, la.title, la.byte_size
       FROM legislation_articles la JOIN legislation l ON la.legislation_id = l.id
       WHERE l.rada_id = $1 AND la.article_number = $2 AND la.is_current = true`,
      [radaId, num]
    );
    if (res.rows[0]) {
      const a = res.rows[0];
      console.log(`    st. ${a.article_number}: ${a.title || '(no title)'} [${a.byte_size} bytes]`);
    } else {
      console.log(`    st. ${num}: NOT FOUND in parsed articles`);
    }
  }
}

async function main() {
  console.log('Loading TCC dispute legislation (all blocks)');
  console.log(`  Vectors: ${skipVectors ? 'SKIP' : 'enabled'}`);
  console.log(`  Force reload: ${forceReload ? 'YES' : 'no'}`);
  const dbUrlParsed = new URL(DATABASE_URL);
  console.log(`  DB: ${dbUrlParsed.protocol}//${dbUrlParsed.username}:***@${dbUrlParsed.host}${dbUrlParsed.pathname}`);

  const lawsToLoad = explicitIds.length > 0
    ? LAWS.filter(l => explicitIds.includes(l.rada_id))
    : LAWS;

  if (lawsToLoad.length === 0) {
    console.error(`No matching laws for: ${explicitIds.join(', ')}`);
    console.error(`Available: ${LAWS.map(l => `${l.rada_id} (${l.short})`).join(', ')}`);
    process.exit(1);
  }

  console.log(`  Laws to load: ${lawsToLoad.length}`);

  const results = [];
  for (const law of lawsToLoad) {
    try {
      results.push({ ...law, ...(await loadLaw(law)) });
    } catch (err) {
      console.error(`  FATAL for ${law.short}: ${err.message}`);
      results.push({ ...law, status: 'error', articles: 0, chunks: 0 });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  for (const r of results) {
    const icon = r.status === 'error' ? 'FAIL' : r.status === 'exists' ? 'SKIP' : ' OK ';
    console.log(`  [${icon}] ${r.short.padEnd(28)} ${String(r.articles || 0).padStart(5)} items  ${String(r.chunks || 0).padStart(6)} chunks`);
  }
  const total = results.reduce((s, r) => s + (r.articles || 0), 0);
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`\n  Total: ${total} items loaded, ${errors} errors`);
}

main()
  .catch(err => console.error('Fatal:', err))
  .finally(() => pool.end().then(() => process.exit(0)));
