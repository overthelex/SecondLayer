# Blog cross-posting / syndication

Republish the blog (`lexwebapp/src/pages/BlogPage/articles.ts`) to external
platforms **without hurting SEO** — every syndicated copy carries a
`canonical_url` back to `https://legal.org.ua/blog/:id`, so Google keeps ranking
the original and the copies only add reach.

The blog stays the single source of truth. You never author on dev.to/Hashnode —
you edit `articles.ts` and re-run this script; it UPDATEs the remote copies.

## Which article goes where

Platforms are **not** interchangeable. Routing is by the article's `category`
field (`tech` / `legal` / `academic`), configured in `platform-map.ts`.

| Category | Count | Automated (API, this script) | Manual link distribution (do by hand) |
|----------|-------|------------------------------|----------------------------------------|
| `tech`     | 35 | **dev.to** (free API)        | Hacker News, r/programming, Lobste.rs  |
| `academic` | 7  | — (no free auto-channel)     | Hugging Face Blog, LinkedIn, r/MachineLearning `[R]`, arXiv |
| `legal`    | 14 | — (no dev-audience fit)      | LinkedIn, Substack                     |

> **Hashnode is Pro-only now.** As of 2026-05-13 Hashnode gated its entire
> GraphQL API (reads *and* writes) behind a paid Pro plan
> ([announcement](https://hashnode.com/announcements/graphql-api)) — a free
> token 301-redirects. The `hashnode` publisher still works with `--platform
> hashnode` **if** the publication is upgraded to Pro; otherwise dev.to is the
> only free automated channel. Hashnode Pro is only worth it for its
> custom-domain hosting (`blog.legal.org.ua`), which keeps SEO on your domain.

Why not blast everything everywhere:
- **dev.to / Hashnode** = engineering audience. Legal-opinion pieces flop and
  cost karma; research preprints (with PDF/TeX) read as off-topic on dev.to.
- **Hugging Face Blog** = the right home for `academic` (model/benchmark posts),
  but it publishes from a GitHub repo (`huggingface/blog`), not a REST API, so
  it stays manual.
- **LinkedIn** = best for `legal` + `academic` reach (and PhD/recruiting), but
  personal-profile posting has no clean public API — manual.
- **Hacker News / Reddit / Lobste.rs** = you post a *link to the original*, not a
  copy, so there is nothing to automate — just submit the canonical URL.

### Strongest Hacker News / Reddit candidates (`tech`)

Posts with hard numbers tend to land on HN — prioritise these for manual submits:

- `deepseek-v3-860b-ukrainian-law` — "2TB Ukrainian law + DeepSeek V3 860B on GCP"
- `edrsr-vectorization-voyage` — "Vectorizing 33.7M court decisions via Voyage AI"
- `open-data-340m-production` — "340M records + 64 tools from 40+ open-data sources"
- `claude-code-building-startups` — "1200 commits in 50 days with Claude Code"
- `opus-rag-vs-finetuned-llm` — "Opus+RAG vs a fine-tuned LLM (LEX vs Harvey)"
- `distributed-monolith` — "Distributed Monolith" architecture retro
- `ci-cd-blue-green-self-healing-tests` — "Blue-green CI/CD with self-healing tests"

## Setup

Node 20+ (repo uses tsx). Provide platform credentials via env (or a
`.env.crosspost` file you `source`, git-ignored):

```bash
export DEVTO_API_KEY=...              # dev.to → Settings → Extensions → API Keys
export HASHNODE_API_TOKEN=...         # hashnode.com/settings/developer
export HASHNODE_PUBLICATION_ID=...    # id of your Hashnode publication
```

To find your Hashnode publication id, run a `me { publications }` query in the
Hashnode API playground (https://gql.hashnode.com), or read it from the
publication dashboard URL.

## Usage

```bash
# Preview only — no network writes, shows create/update/unchanged per platform
npx tsx scripts/blog/cross-post.ts --dry-run

# Publish all `tech` articles to their platforms (dev.to + Hashnode)
npx tsx scripts/blog/cross-post.ts

# Restrict to one platform
npx tsx scripts/blog/cross-post.ts --platform devto

# Publish the `academic` set (→ Hashnode only)
npx tsx scripts/blog/cross-post.ts --category academic

# One article by id (ignores category routing, uses its own category's platforms)
npx tsx scripts/blog/cross-post.ts --only paper-tokenizer-fertility

# First N matched only (good for a cautious first run)
npx tsx scripts/blog/cross-post.ts --limit 3

# Publish as draft/unlisted instead of live
npx tsx scripts/blog/cross-post.ts --draft

# Language: English is the DEFAULT (dev.to audience). Force the original Ukrainian:
npx tsx scripts/blog/cross-post.ts --lang uk
```

### Language & cover images

- **Language**: defaults to **English** (`--lang en`) — content comes from
  `articles-en.ts` (`enTranslations`, keyed by article id). If a translation is
  missing, it falls back to the Ukrainian original and logs a `!` warning. Use
  `--lang uk` to post the originals.
- **Cover image**: for English posts, auto-attached from the **light English
  banner set** `lexwebapp/public/blog-banners-en/<id>.png` (served at
  `https://legal.org.ua/blog-banners-en/<id>.png`). Falls back to the original
  dark Ukrainian banner `blog-banners/<id>.png`, then to no cover (logs `!`).
  Sent as `main_image` on dev.to, `coverImageOptions.coverImageURL` on Hashnode.

### Generating the English light banners

The originals in `blog-banners/` are dark + Ukrainian (used by the live blog).
The English mirror needs light + English banners, generated separately:

```bash
# 1. Dump English meta (id / EN title / EN punchline / tags) for tech articles
npx tsx -e '<dump articles.ts + articles-en.ts to meta.json>'   # see git history
# 2. Render light English banners -> lexwebapp/public/blog-banners-en/<id>.png
python3 scripts/blog/generate-en-banners.py <meta.json> [--only <id>] [--limit N]
```

`generate-en-banners.py` uses PIL + numpy, macOS Arial fonts, and per-id varied
fractals on a light gradient. Output: 1200×627, all critical text in the top ~55%.

> **Deploy before posting.** dev.to fetches `main_image` from a public URL at
> post time, so `blog-banners-en/` must be live on `https://legal.org.ua` first.
> These assets ship with a normal **frontend deploy** (commit → PR → merge →
> CI/CD publishes `lexwebapp/public/`). Verify with
> `curl -I https://legal.org.ua/blog-banners-en/<id>.png` → 200 before a live run.

### Recommended first run

```bash
npx tsx scripts/blog/cross-post.ts --dry-run                 # sanity check
npx tsx scripts/blog/cross-post.ts --platform devto --limit 1   # one real post
# eyeball it on dev.to, then:
npx tsx scripts/blog/cross-post.ts                           # the rest
```

## How idempotency works

`.crosspost-state.json` (git-ignored) maps `articleId → { platform → {id,url} }`
plus a change marker. Re-runs:
- **create** if never posted,
- **update** if the article content changed since last post,
- **skip** if unchanged.

So this is safe to run on a schedule (e.g. after each deploy) — it will only
push new or edited articles. Delete an entry from the state file to force a
re-create.

## Notes / limits

- **dev.to**: max 4 tags (auto-sanitised to lowercase alphanumeric), canonical
  via `canonical_url`.
- **Hashnode**: canonical via `originalArticleURL`, up to 5 tags (slugified).
- The leading `# H1` is stripped from each body (platforms render the title
  themselves) and all root-relative links/images are absolutised to
  `https://legal.org.ua`.
- A footer linking back to the original is appended to every copy.
