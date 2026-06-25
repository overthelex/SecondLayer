# legislation_citation_links (LEXAI-1770)

Resolved decision → legislation-article citation edges.

## What it is

`legislation_citation_links` is a derived table of **resolved citation edges**: each
row links a court decision (`doc_id`) to a specific legislation article
(`legislation_id`, `article_id`, `article_number`) that the decision cites. It is
built from the raw `law_court_citations` table (which only contains the cited law
name / article number as extracted text) by binding those raw strings to canonical
entries in the `legislation` and `legislation_articles` registries.

Key columns:

| column | meaning |
| --- | --- |
| `doc_id` | court decision id (`law_court_citations.court_case_id`) |
| `legislation_id` | resolved legislation registry id (NULL if law not found) |
| `article_id` / `article_number` | resolved article in the latest edition (NULL if article not found) |
| `law_number_raw` / `law_article_raw` | original extracted strings |
| `match_method` | `alias`, `name_alias`, `exact_title`, `normalized`, or `unresolved` |
| `resolved` | TRUE iff an `article_id` was bound |
| `unresolved_reason` | `law_not_in_registry`, `article_not_found`, or `not_legislation` |

## How to rebuild

Run the build script against the prod DB (it is idempotent — it `DROP`s and
recreates the table and its indexes, and prints coverage stats at the end):

```bash
psql "$DATABASE_URL" -f scripts/citation-graph/build-legislation-citation-links.sql
```

The build is a single hash-join `INSERT ... SELECT` over
`law_court_citations` × `legislation` × `legislation_articles`
(`statement_timeout` is set to 1800s inside the script).

`scripts/citation-graph/legislation-name-aliases.sql` holds the same 113 verified
`cited-name → legislation_id` pairs that are embedded in the build script's
`name_alias` CTE, kept standalone for documentation / reuse.

## Resolution rate

After de-phantoming the raw citation set, resolution improved from **24.8% → 93.6%**
on **384,512** rows. The remaining ~6.4% are genuine residual (see below).

## Resolution design

- **Abbreviation aliases** — short codes (`КУпАП`, `КЗпП`, …) map directly to the
  correct legislation id via the `lawmap` CTE.
- **КУпАП dual-edition** — the Code of Administrative Offences exists under two
  registry ids `{653, 22}`; both are emitted so either edition's articles bind.
- **Name → id alias map** — 113 verified pairs (in `legislation-name-aliases.sql`)
  absorb OCR noise, spacing/apostrophe variants, and historically renamed laws
  (e.g. "Про банкрутство" → "Про відновлення платоспроможності…", id 757).
- **Latest-edition article binding** — `best_art` picks the current/most-recent
  article version per `(legislation_id, article_number)` so citations bind to the
  live article text.
- **Exact-title / normalized title match** — for everything else, the raw law name
  is whitespace-normalized and matched against the canonical legislation title
  (`canon` CTE picks the edition with the most current articles).
- **Unresolved-reason buckets** — unresolved rows are tagged so residual can be
  audited by cause.

## Known residual (~6.4%)

- Numeric junk and OCR blobs in `law_number` that are not real law names.
- Supreme Court (ВС) rulings cited as "law" — tagged `not_legislation` (these are
  case law, not legislation, so they have no article to bind).
- ~30 laws genuinely absent from the legislation registry (`law_not_in_registry`).
- A small tail of `article_not_found` where the law resolves but the cited article
  number does not exist in any edition.
