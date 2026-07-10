/**
 * Dump English metadata for tech articles → JSON, for the banner generator.
 *
 * Pulls id / category / tags from articles.ts and the English title + punchline
 * from articles-en.ts (falls back to the original if a translation is missing).
 *
 * Usage:
 *   npx tsx scripts/blog/dump-en-meta.ts [outPath]
 *   (default outPath: scripts/blog/.blog-en-meta.json — git-ignored)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { articles } from '../../lexwebapp/src/pages/BlogPage/articles.ts';
import { enTranslations } from '../../lexwebapp/src/pages/BlogPage/articles-en.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ?? resolve(__dirname, '.blog-en-meta.json');

const out = articles
  .filter((a) => a.category === 'tech')
  .map((a) => {
    const t = (enTranslations as Record<string, { title: string; punchline: string }>)[a.id];
    return {
      id: a.id,
      category: a.category,
      tags: a.tags.slice(0, 5),
      title: t?.title ?? a.title,
      punchline: t?.punchline ?? a.punchline,
      hasEn: !!t,
    };
  });

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} tech entries -> ${outPath}`);
