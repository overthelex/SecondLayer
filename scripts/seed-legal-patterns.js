#!/usr/bin/env node
/**
 * Seed legal_patterns table with basic appeal/cassation patterns.
 *
 * Extracts most common law articles from real court decisions in DB,
 * then inserts pattern rows covering Ukrainian appeal/cassation intents.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed-legal-patterns.js
 */

const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// ─── Pattern definitions ───────────────────────────────────────────────────────
const PATTERN_DEFINITIONS = [
  {
    intents: [
      'апеляція',
      'апеляційне оскарження',
      'апеляційна скарга',
      'підстави апеляції',
      'підстави апеляційного оскарження',
    ],
    sqlFilter: "title ILIKE '%апеляц%'",
    staticArticles: [
      'ст. 352 ЦПК', 'ст. 356 ЦПК', 'ст. 369 ЦПК', 'ст. 374 ЦПК',
      'ст. 376 ЦПК', 'ст. 382 ЦПК',
      'ст. 267 ГПК', 'ст. 269 ГПК', 'ст. 275 ГПК', 'ст. 277 ГПК', 'ст. 281 ГПК',
      'ст. 292 КАС', 'ст. 296 КАС', 'ст. 308 КАС', 'ст. 312 КАС',
      'ст. 394 КПК', 'ст. 404 КПК', 'ст. 407 КПК',
    ],
    decision_outcome: 'cancelled',
    success_arguments: [
      'неправильне застосування норм матеріального права',
      'порушення норм процесуального права',
      'неповне з\'ясування обставин справи',
      'неналежна оцінка доказів судом першої інстанції',
      'невідповідність висновків суду обставинам справи',
      'порушення принципу змагальності',
      'ненадання оцінки поданим доказам',
    ],
    risk_factors: [
      'пропуск строку апеляційного оскарження',
      'подання апеляції особою, що не є стороною справи',
      'апеляція на рішення, що не підлягає оскарженню',
      'відсутність нових доказів або обставин',
    ],
  },
  {
    intents: [
      'касація',
      'касаційне оскарження',
      'касаційна скарга',
      'підстави касації',
      'підстави касаційного оскарження',
      'скасування рішення суду',
      'підстави для скасування рішення суду',
      'скасування судового рішення',
      'підстави скасування',
    ],
    sqlFilter: "title ILIKE '%касац%'",
    staticArticles: [
      'ст. 389 ЦПК', 'ст. 390 ЦПК', 'ст. 393 ЦПК', 'ст. 409 ЦПК',
      'ст. 410 ЦПК', 'ст. 411 ЦПК', 'ст. 414 ЦПК', 'ст. 416 ЦПК',
      'ст. 287 ГПК', 'ст. 290 ГПК', 'ст. 300 ГПК', 'ст. 305 ГПК', 'ст. 308 ГПК',
      'ст. 328 КАС', 'ст. 335 КАС', 'ст. 341 КАС', 'ст. 349 КАС', 'ст. 352 КАС',
      'ст. 424 КПК', 'ст. 433 КПК', 'ст. 438 КПК',
    ],
    decision_outcome: 'cancelled',
    success_arguments: [
      'неправильне застосування норм матеріального права',
      'порушення норм процесуального права, що унеможливило вирішення справи',
      'суперечність висновків суду усталеній практиці Верховного Суду',
      'відсутність висновку Верховного Суду щодо застосування норми права',
      'виключна правова проблема',
      'необхідність відступу від висновку Верховного Суду',
    ],
    risk_factors: [
      'пропуск 30-денного строку касаційного оскарження',
      'оскарження рішення, що не підлягає касаційному оскарженню',
      'відсутність підстав ст. 389 ЦПК / 287 ГПК / 328 КАС',
      'переоцінка доказів (не є підставою для касації)',
      'повторна перевірка фактичних обставин справи',
    ],
  },
  {
    intents: [
      'порушення норм матеріального права',
      'неправильне застосування закону',
      'застосування закону',
      'матеріальне право',
    ],
    sqlFilter: "full_text ILIKE '%неправильне застосування%матеріального%'",
    staticArticles: [
      'ст. 376 ЦПК', 'ст. 277 ГПК', 'ст. 317 КАС',
      'ст. 410 ЦПК', 'ст. 308 ГПК', 'ст. 352 КАС',
    ],
    decision_outcome: 'cancelled',
    success_arguments: [
      'помилкове тлумачення норми матеріального права',
      'застосування норми, що не підлягала застосуванню',
      'незастосування норми, яка підлягала застосуванню',
      'суперечність тлумачення практиці Великої Палати Верховного Суду',
    ],
    risk_factors: [
      'питання стосується лише фактичних обставин, а не норм права',
      'відсутність конкретної норми, яка застосована неправильно',
    ],
  },
  {
    intents: [
      'порушення норм процесуального права',
      'процесуальні порушення',
      'процесуальне порушення',
    ],
    sqlFilter: "full_text ILIKE '%порушення%процесуального%'",
    staticArticles: [
      'ст. 376 ЦПК', 'ст. 277 ГПК', 'ст. 317 КАС',
      'ст. 411 ЦПК', 'ст. 310 ГПК', 'ст. 354 КАС',
    ],
    decision_outcome: 'remand',
    success_arguments: [
      'розгляд справи у незаконному складі суду',
      'розгляд справи за відсутності сторони, не повідомленої належним чином',
      'порушення правил про мову судочинства',
      'прийняття рішення про права осіб, не залучених до участі у справі',
      'відсутність підпису судді на рішенні',
    ],
    risk_factors: [
      'процесуальне порушення не вплинуло на правильність вирішення справи',
      'сторона не зверталась з клопотанням про усунення порушення',
    ],
  },
  {
    intents: [
      'виконання рішення суду',
      'виконавче провадження',
      'примусове виконання',
    ],
    sqlFilter: "title ILIKE '%виконав%'",
    staticArticles: [
      'ст. 129-1 Конституції',
      'ст. 18 ЦПК', 'ст. 326 ЦПК', 'ст. 432 ЦПК',
      'ЗУ "Про виконавче провадження" ст. 1', 'ст. 19', 'ст. 26', 'ст. 57',
    ],
    decision_outcome: 'allowed',
    success_arguments: [
      'невиконання рішення суду є підставою для стягнення пені',
      'примусове виконання через виконавчу службу',
      'встановлення строку виконання у резолютивній частині',
    ],
    risk_factors: [
      'сплив строку пред\'явлення виконавчого документа (3 роки)',
      'відсутність у резолютивній частині конкретного зобов\'язання',
    ],
  },
];

// ─── Extract top articles from real documents ──────────────────────────────────
async function extractTopArticles(client, sqlFilter) {
  try {
    const { rows } = await client.query(`
      WITH article_extract AS (
        SELECT regexp_matches(
          full_text,
          'ст(?:атт[яі])?\\.?\\s*\\d+(?:\\s*[-–]\\s*\\d+)?\\s*(?:ЦПК|ГПК|КАС|КПК|ЦК|ГК)',
          'gi'
        ) AS m
        FROM documents
        WHERE ${sqlFilter} AND full_text IS NOT NULL
        LIMIT 300
      )
      SELECT m[1] AS article, COUNT(*) AS cnt
      FROM article_extract
      GROUP BY article
      ORDER BY cnt DESC
      LIMIT 20
    `);
    return rows.map(r => r.article.trim());
  } catch (e) {
    console.warn(`  Could not extract articles: ${e.message}`);
    return [];
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT COUNT(*) FROM legal_patterns');
    console.log(`Existing patterns: ${existing.rows[0].count}`);

    const now = new Date().toISOString();
    let inserted = 0;

    for (const def of PATTERN_DEFINITIONS) {
      console.log(`\nProcessing: ${def.intents[0]}`);

      const dbArticles = await extractTopArticles(client, def.sqlFilter);
      console.log(`  DB articles (top 5): ${dbArticles.slice(0, 5).join(', ')}`);

      // Deduplicated merged list
      const allArticles = [...new Set([...def.staticArticles, ...dbArticles])];

      // Get document count for confidence
      let docCount = 0;
      try {
        const cnt = await client.query(`SELECT COUNT(*) FROM documents WHERE ${def.sqlFilter}`);
        docCount = parseInt(cnt.rows[0].count, 10);
      } catch {}
      console.log(`  Doc count: ${docCount}`);

      const confidence = docCount >= 20 ? 0.85
        : docCount >= 10 ? 0.7
        : docCount >= 5 ? 0.5
        : 0.65;

      for (const intent of def.intents) {
        const id = randomUUID();
        await client.query(`
          INSERT INTO legal_patterns
            (id, intent, law_articles, decision_outcome, frequency, confidence,
             example_cases, risk_factors, success_arguments, anti_patterns, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (id) DO NOTHING
        `, [
          id,
          intent,
          allArticles,
          def.decision_outcome,
          Math.min(docCount, 9999),
          confidence,
          [],
          def.risk_factors,
          def.success_arguments,
          JSON.stringify([]),
          now,
          now,
        ]);
        console.log(`  ✓ "${intent}" (${allArticles.length} articles, confidence=${confidence})`);
        inserted++;
      }
    }

    console.log(`\n✅ Done. Inserted ${inserted} pattern records.`);

    // Verify
    const verify = await client.query(`
      SELECT intent, array_length(law_articles,1) AS articles, confidence, frequency
      FROM legal_patterns ORDER BY created_at DESC LIMIT 5
    `);
    console.log('\nSample:');
    for (const r of verify.rows) {
      console.log(`  "${r.intent}" — ${r.articles} articles, confidence=${r.confidence}, freq=${r.frequency}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
