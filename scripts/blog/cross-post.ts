/**
 * Blog cross-poster / syndicator.
 *
 * Reads the static blog articles from the frontend (single source of truth),
 * and publishes selected ones to dev.to and Hashnode with a `canonical_url`
 * pointing back to https://legal.org.ua/blog/:id so the original blog keeps
 * all SEO weight.
 *
 * State is tracked in .crosspost-state.json so re-runs UPDATE the remote copy
 * instead of creating duplicates.
 *
 * Usage:
 *   npx tsx scripts/blog/cross-post.ts --dry-run                # preview everything (tech)
 *   npx tsx scripts/blog/cross-post.ts --platform devto         # publish tech -> dev.to
 *   npx tsx scripts/blog/cross-post.ts --category academic      # publish academic (-> hashnode)
 *   npx tsx scripts/blog/cross-post.ts --only paper-tokenizer-fertility
 *   npx tsx scripts/blog/cross-post.ts --limit 3                # only first 3 matched
 *   npx tsx scripts/blog/cross-post.ts --draft                 # publish unlisted/draft
 *
 * Env (put in .env.crosspost or your shell):
 *   DEVTO_API_KEY=...                 # https://dev.to/settings/extensions
 *   HASHNODE_API_TOKEN=...            # https://hashnode.com/settings/developer
 *   HASHNODE_PUBLICATION_ID=...       # the id of your Hashnode publication
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CATEGORY_PLATFORMS,
  CANONICAL_BASE,
  ASSET_BASE,
  type Category,
  type Platform,
} from './platform-map.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, '.crosspost-state.json');
const BLOG_DIR = resolve(__dirname, '../../lexwebapp/src/pages/BlogPage');
const PUBLIC_DIR = resolve(__dirname, '../../lexwebapp/public');
const ARTICLES_PATH = resolve(BLOG_DIR, 'articles.ts');
const ARTICLES_EN_PATH = resolve(BLOG_DIR, 'articles-en.ts');

interface Article {
  id: string;
  title: string;
  punchline: string;
  category: Category;
  tags: string[];
  readTime: string;
  publishedAt: string;
  content: string;
  pdfUrl?: string;
  texUrl?: string;
}

interface ArticleTranslation {
  title: string;
  punchline: string;
  readTime: string;
  content: string;
}
type TranslationMap = Record<string, ArticleTranslation>;

/** Language-resolved view of an article (original or translated). */
interface View {
  id: string;
  category: Category;
  tags: string[];
  title: string;
  punchline: string;
  content: string;
  publishedAt: string;
  coverUrl?: string;
}

interface RemoteRef {
  id: string; // remote post id
  url: string;
  updatedFrom: string; // hash-ish marker: lang+title+len, to detect changes
}
type State = Record<string, Partial<Record<Platform, RemoteRef>>>;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DRY_RUN = has('--dry-run');
const DRAFT = has('--draft');
const ONLY = val('--only');
const LIMIT = val('--limit') ? parseInt(val('--limit')!, 10) : Infinity;
const CATEGORY = val('--category') as Category | undefined; // default: tech
const PLATFORM_FILTER = val('--platform') as Platform | undefined;
const LANG = (val('--lang') as 'en' | 'uk' | undefined) ?? 'en'; // dev.to → English

// ---------------------------------------------------------------------------
// Load articles + translations (via tsx transpilation of the frontend files)
// ---------------------------------------------------------------------------
async function loadArticles(): Promise<Article[]> {
  const mod = await import(ARTICLES_PATH);
  return mod.articles as Article[];
}
async function loadTranslations(): Promise<TranslationMap> {
  if (LANG === 'uk') return {};
  const mod = await import(ARTICLES_EN_PATH);
  return (mod.enTranslations ?? {}) as TranslationMap;
}

/**
 * Resolve an article to the requested language, falling back to the original
 * (Ukrainian) when a translation is missing. Cover image is `blog-banners/<id>.png`
 * if that asset exists locally under lexwebapp/public.
 */
function resolveView(a: Article, tr: TranslationMap): { view: View; translated: boolean } {
  const t = tr[a.id];
  const translated = LANG !== 'uk' && !!t;
  // English posts prefer the light English banner set; fall back to the
  // original (dark, Ukrainian) banner, then to no cover.
  let coverUrl: string | undefined;
  if (
    LANG !== 'uk' &&
    existsSync(resolve(PUBLIC_DIR, 'blog-banners-en', `${a.id}.png`))
  ) {
    coverUrl = `${ASSET_BASE}/blog-banners-en/${a.id}.png`;
  } else if (existsSync(resolve(PUBLIC_DIR, 'blog-banners', `${a.id}.png`))) {
    coverUrl = `${ASSET_BASE}/blog-banners/${a.id}.png`;
  }
  return {
    translated,
    view: {
      id: a.id,
      category: a.category,
      tags: a.tags,
      publishedAt: a.publishedAt,
      title: translated ? t.title : a.title,
      punchline: translated ? t.punchline : a.punchline,
      content: translated ? t.content : a.content,
      coverUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function loadState(): State {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State;
  } catch {
    return {};
  }
}
function saveState(state: State) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Markdown transforms
// ---------------------------------------------------------------------------
function marker(v: View): string {
  // cheap change-detector so re-runs know whether to PUT/update
  return `${LANG}:${v.title.length}:${v.content.length}:${v.coverUrl ? 1 : 0}:${v.publishedAt}`;
}

function canonicalUrl(v: View): string {
  return `${CANONICAL_BASE}/blog/${v.id}`;
}

/** Strip the leading H1 (platforms render their own title) and absolutise links. */
function prepareBody(v: View): string {
  let body = v.content.replace(/^\s*#\s+.*(\r?\n)+/, ''); // drop first H1 block
  // absolutise root-relative markdown links/images: ](/foo) and ](/foo "t")
  body = body.replace(/\]\((\/[^)\s]+)/g, `](${ASSET_BASE}$1`);
  // absolutise root-relative <img src="/..."> just in case
  body = body.replace(/(src=["'])(\/[^"']+)/g, `$1${ASSET_BASE}$2`);
  const footer =
    `\n\n---\n\n*Originally published on ` +
    `[legal.org.ua](${canonicalUrl(v)}).*`;
  return body.trimEnd() + footer;
}

/** dev.to allows max 4 tags, lowercase alphanumeric only. */
function devtoTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
    if (out.length === 4) break;
  }
  return out.length ? out : ['legaltech'];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// dev.to API
// ---------------------------------------------------------------------------
const DEVTO_KEY = process.env.DEVTO_API_KEY;

async function devtoUpsert(v: View, ref?: RemoteRef): Promise<RemoteRef> {
  if (!DEVTO_KEY) throw new Error('DEVTO_API_KEY not set');
  const payload = {
    article: {
      title: v.title,
      published: !DRAFT,
      body_markdown: prepareBody(v),
      canonical_url: canonicalUrl(v),
      description: v.punchline.slice(0, 250),
      tags: devtoTags(v.tags),
      ...(v.coverUrl ? { main_image: v.coverUrl } : {}),
    },
  };
  const url = ref
    ? `https://dev.to/api/articles/${ref.id}`
    : 'https://dev.to/api/articles';
  const res = await fetch(url, {
    method: ref ? 'PUT' : 'POST',
    headers: { 'api-key': DEVTO_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`dev.to ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id: number; url: string };
  return { id: String(json.id), url: json.url, updatedFrom: marker(v) };
}

// ---------------------------------------------------------------------------
// Hashnode API (GraphQL)
// ---------------------------------------------------------------------------
const HASHNODE_TOKEN = process.env.HASHNODE_API_TOKEN;
const HASHNODE_PUB = process.env.HASHNODE_PUBLICATION_ID;

async function hashnodeGql<T>(query: string, variables: unknown): Promise<T> {
  if (!HASHNODE_TOKEN) throw new Error('HASHNODE_API_TOKEN not set');
  const res = await fetch('https://gql.hashnode.com/', {
    method: 'POST',
    headers: {
      Authorization: HASHNODE_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`hashnode: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

async function hashnodeUpsert(v: View, ref?: RemoteRef): Promise<RemoteRef> {
  if (!HASHNODE_PUB) throw new Error('HASHNODE_PUBLICATION_ID not set');
  const tags = v.tags.slice(0, 5).map((t) => ({ slug: slugify(t), name: t }));
  const cover = v.coverUrl ? { coverImageOptions: { coverImageURL: v.coverUrl } } : {};

  if (ref) {
    const data = await hashnodeGql<{ updatePost: { post: { id: string; url: string } } }>(
      `mutation Upd($input: UpdatePostInput!) {
         updatePost(input: $input) { post { id url } }
       }`,
      {
        input: {
          id: ref.id,
          title: v.title,
          subtitle: v.punchline.slice(0, 250),
          contentMarkdown: prepareBody(v),
          originalArticleURL: canonicalUrl(v),
          tags,
          ...cover,
        },
      },
    );
    const p = data.updatePost.post;
    return { id: p.id, url: p.url, updatedFrom: marker(v) };
  }

  const data = await hashnodeGql<{ publishPost: { post: { id: string; url: string } } }>(
    `mutation Pub($input: PublishPostInput!) {
       publishPost(input: $input) { post { id url } }
     }`,
    {
      input: {
        title: v.title,
        subtitle: v.punchline.slice(0, 250),
        contentMarkdown: prepareBody(v),
        publicationId: HASHNODE_PUB,
        originalArticleURL: canonicalUrl(v),
        tags,
        ...cover,
      },
    },
  );
  const p = data.publishPost.post;
  return { id: p.id, url: p.url, updatedFrom: marker(v) };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
const PUBLISHERS: Record<Platform, (v: View, ref?: RemoteRef) => Promise<RemoteRef>> = {
  devto: devtoUpsert,
  hashnode: hashnodeUpsert,
};

async function main() {
  const articles = await loadArticles();
  const translations = await loadTranslations();
  const state = loadState();

  const wantCategory: Category = CATEGORY ?? 'tech';
  let matched = articles.filter((a) =>
    ONLY ? a.id === ONLY : a.category === wantCategory,
  );
  matched = matched.slice(0, LIMIT);

  if (!matched.length) {
    console.log('No articles matched the filter.');
    return;
  }

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}${matched.length} article(s) | ` +
      `lang=${LANG} | category=${ONLY ? '(--only)' : wantCategory}` +
      `${PLATFORM_FILTER ? ` | platform=${PLATFORM_FILTER}` : ''}` +
      `${DRAFT ? ' | DRAFT' : ''}\n`,
  );

  for (const a of matched) {
    const { view, translated } = resolveView(a, translations);
    const platforms = (
      PLATFORM_FILTER ? [PLATFORM_FILTER] : CATEGORY_PLATFORMS[a.category]
    ).filter(Boolean);

    if (LANG !== 'uk' && !translated) {
      console.log(`! ${a.id} — no ${LANG} translation, falling back to original (uk)`);
    }
    if (!view.coverUrl) {
      console.log(`! ${a.id} — no banner (blog-banners/${a.id}.png missing), posting without cover`);
    }

    if (!platforms.length) {
      console.log(`— ${a.id}: no automated platform for '${a.category}' (manual)`);
      continue;
    }

    for (const p of platforms) {
      const existing = state[a.id]?.[p];
      const action = existing
        ? existing.updatedFrom === marker(view)
          ? 'up-to-date'
          : 'update'
        : 'create';

      if (action === 'up-to-date') {
        console.log(`= ${p} ${a.id} — unchanged (${existing!.url})`);
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `~ ${p} ${a.id} — would ${action}` +
            `${view.coverUrl ? ' +cover' : ''} -> canonical ${canonicalUrl(view)}`,
        );
        continue;
      }

      try {
        const ref = await PUBLISHERS[p](view, action === 'update' ? existing : undefined);
        state[a.id] = { ...state[a.id], [p]: ref };
        saveState(state);
        console.log(`✓ ${p} ${a.id} — ${action}d -> ${ref.url}`);
      } catch (err) {
        console.error(`✗ ${p} ${a.id} — ${(err as Error).message}`);
      }
    }
  }

  if (DRY_RUN) console.log('\n[DRY RUN] nothing was published.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
