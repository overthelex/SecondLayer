/**
 * Sync Laws Script
 * Downloads key Ukrainian legislation texts from zakon.rada.gov.ua
 * and caches them in the rada.legislation table.
 *
 * Usage: npm run sync:laws
 *   env CONCURRENCY=3 (default 3, max 5 — respect zakon.rada.gov.ua rate limits)
 */

import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../database/database';
import { ZakonRadaAdapter } from '../adapters/zakon-rada-adapter';
import { LegislationService } from '../services/legislation-service';
import { logger } from '../utils/logger';

// Key legislation to sync — law numbers from zakon.rada.gov.ua
const LAWS_TO_SYNC = [
  // Constitution
  '254к/96-вр',      // Конституція України

  // Major codes
  '435-15',          // Цивільний кодекс
  '2341-14',         // Кримінальний кодекс
  '2947-14',         // Сімейний кодекс
  '436-15',          // Господарський кодекс
  '4651-17',         // КПК (Кримінальний процесуальний кодекс)
  '1618-15',         // ЦПК (Цивільний процесуальний кодекс)
  '2747-15',         // КАСУ (Код. адміністративного судочинства)
  '2755-17',         // Податковий кодекс
  '1023-12',         // КЗПП (Кодекс законів про працю)

  // Additional major laws
  '2768-14',         // Земельний кодекс
  '2456-17',         // Бюджетний кодекс
  '4495-17',         // Митний кодекс
  '213/95-вр',       // Водний кодекс
  '3852-12',         // Лісовий кодекс
  '1798-12',         // Господарський процесуальний кодекс
  '3393-17',         // Повітряний кодекс
  '162/95-вр',       // Кодекс торговельного мореплавства

  // Key laws
  '755-15',          // Про держреєстрацію юросіб та ФОП
  '2210-14',         // Про доступ до публічної інформації
  '1382-15',         // Про захист персональних даних
  '1160-15',         // Про електронні документи
  '852-15',          // Про електронний цифровий підпис
  '580-19',          // Про запобігання корупції
  '1700-18',         // Про запобігання корупції (нова ред.)
  '2939-17',         // Про судоустрій і статус суддів
  '1402-19',         // Про адвокатуру та адвокатську діяльність
  '5076-17',         // Про нотаріат
  '2121-14',         // Про банки і банківську діяльність
  '679-14',          // Про фінансові послуги
  '996-14',          // Про бухгалтерський облік
  '2343-12',         // Про господарські товариства
  '1576-12',         // Про акціонерні товариства
  '1952-15',         // Про державну реєстрацію речових прав
  '161-14',          // Про оренду землі
  '898-15',          // Про іпотеку
  '1255-15',         // Про заставу
  '2628-14',         // Про банкрутство (код. процедур банкрутства)
  '2597-19',         // Про виконавче провадження
];

async function main() {
  const concurrency = Math.min(parseInt(process.env.CONCURRENCY || '3', 10), 5);

  console.log('\n' + '='.repeat(60));
  console.log('RADA Legislation Sync');
  console.log('='.repeat(60));
  console.log(`Laws to sync: ${LAWS_TO_SYNC.length}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log('');

  const db = new Database();
  const zakonAdapter = new ZakonRadaAdapter();
  const legislationService = new LegislationService(db, zakonAdapter);

  try {
    await db.connect();

    let synced = 0;
    let failed = 0;
    const errors: Array<{ law: string; error: string }> = [];

    // Process in batches
    for (let i = 0; i < LAWS_TO_SYNC.length; i += concurrency) {
      const batch = LAWS_TO_SYNC.slice(i, i + concurrency);
      await Promise.allSettled(
        batch.map(async (lawNumber) => {
          try {
            const result = await legislationService.getLegislation(lawNumber, true);
            if (result) {
              console.log(`  ✓ ${lawNumber} — ${result.title?.slice(0, 60) || 'OK'}`);
              synced++;
            } else {
              console.log(`  ✗ ${lawNumber} — not found`);
              failed++;
              errors.push({ law: lawNumber, error: 'Not found' });
            }
          } catch (err: any) {
            console.log(`  ✗ ${lawNumber} — ${err.message?.slice(0, 80)}`);
            failed++;
            errors.push({ law: lawNumber, error: err.message });
          }
        })
      );

      // Small delay between batches to be polite to zakon.rada.gov.ua
      if (i + concurrency < LAWS_TO_SYNC.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Synced: ${synced}, Failed: ${failed}, Total: ${LAWS_TO_SYNC.length}`);

    if (errors.length > 0) {
      console.log('\nFailed laws:');
      errors.forEach((e) => console.log(`  ${e.law}: ${e.error.slice(0, 100)}`));
    }

    // Show DB stats
    const result = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN full_text_plain IS NOT NULL AND full_text_plain != '' THEN 1 END) as with_text
       FROM legislation`
    );
    console.log(`\nDB: ${result.rows[0].total} laws total, ${result.rows[0].with_text} with full text`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  logger.error('Sync failed', { error: err.message });
  console.error(err);
  process.exit(1);
});
