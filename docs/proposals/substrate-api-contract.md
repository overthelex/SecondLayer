# Substrate API contract

Working draft for Vlad and Niko, 26 Jul 2026. The Dutch graph is the reference
implementation; this is the shape the Finnish graph should be served through so
that one client library, one set of docs and one demo cover both.

Live at `/api/v1/substrate/{jurisdiction}` on the legal.org.ua backend. Adding a
jurisdiction is one entry in the config map in `substrate-routes.ts`, naming the
tables; no endpoint code changes.

## Why a fixed contract rather than two APIs

The product sells one thing: references that resolve. A customer who integrates
against NL and then has to re-integrate for FI has been sold two datasets, not a
substrate. Everything below is jurisdiction-neutral: ECLI for case law, the
national act id for legislation (BWB in NL, Finlex in FI), and no response field
named after a national source.

## Three rules the contract enforces

**1. Every reference carries `resolved`.** When false it carries
`unresolved_reason` rather than disappearing from the array. A caller can always
distinguish "we checked and there is nothing" from "we did not check". This is
the anti-vibecoding guarantee expressed at the API boundary: the confidence a
client shows is computed over what actually resolved.

```json
{"as_written": "ECLI:EU:C:2019:218", "ecli": "ECLI:EU:C:2019:218",
 "kind": "ecli_eu", "resolved": true},
{"as_written": "NJ 2016/122", "ecli": null, "kind": "journal",
 "resolved": false, "unresolved_reason": "no alias matches this reference"}
```

**2. Every node carries `redistribution`.** `full` may be served with text;
`link_out` returns metadata and `source_url` and never text, whatever the caller
asks for. This is Niko's index-and-link-out rule made mechanical instead of
remembered: ECHR nodes cannot leak text through this API even by mistake.

**3. Anything time-dependent takes `as_of`.** A statute answer without a date is
a guess about which version applied. `GET /legislation/{id}?as_of=2015-06-01`
returns the edition whose validity period contains that date, or an explicit
note that no edition covers it.

A fourth, softer rule worth keeping: **absence is stated, not implied**. A Dutch
decision with no body is `"text_availability": "not_published_by_source"`, not an
empty string, because the source genuinely publishes most decisions as metadata
only. A decision with no appeal on record gets `status: null` plus
`"no appeal on record; absence of an appeal is not a positive finding"`, never a
default of "good law".

## The ten endpoints

| # | Endpoint | Answers |
|---|---|---|
| 1 | `GET /{j}/search?q=&court=&date_from=&date_to=&subject=&order=` | find decisions |
| 2 | `GET /{j}/decisions/{ecli}` | one decision with every reference resolved |
| 3 | `GET /{j}/decisions/{ecli}/status` | is it still good law, and what changed it |
| 4 | `GET /{j}/decisions/{ecli}/citing` | who cites it |
| 5 | `GET /{j}/decisions/{ecli}/cited` | what it cites, resolved |
| 6 | `GET /{j}/decisions/{ecli}/chain` | the instance ladder with outcomes |
| 7 | `GET /{j}/legislation/{lawId}/case-law?article=` | decisions applying a provision |
| 8 | `GET /{j}/legislation/{lawId}?as_of=` | the act, as in force on a date |
| 9 | `GET /{j}/resolve?ref=` | any citation string to a canonical node |
| 10 | `GET /{j}/changes?since=` | what changed, for subscriptions |

`GET /api/v1/substrate/catalog` describes all of it, so an agent discovers the
surface without reading code.

### Notes on the ones that are easy to get wrong

**9, resolve.** This is the primitive the rest leans on and the hardest to
retrofit. It takes whatever a lawyer or a model actually wrote — an ECLI, a
journal citation, a pre-2013 LJN code, a case number — and returns the canonical
node. It answers `ambiguous: true` with all candidates when one journal
reference points at several decisions, rather than picking one silently. For NL
it is backed by 4.7M aliases. Finland will need its own dictionary of whatever
citation forms Finnish practice uses; building it late means every earlier
answer under-resolves.

**6, chain.** A recursive walk over an edge table, both directions, with the
outcome of each appeal attached. Worth stating that this does not need a graph
store: Dutch ladders are at most four deep and the query is a few milliseconds.
Reach for Neo4j when the graph is EDRSR-sized (135M edges), not at 1M.

**1, search, and why ordering is a parameter.** Ranking with `ts_rank` over the
full text costs **42 seconds** on this corpus: Postgres recomputes the tsvector
for every matching row before `LIMIT` can apply. Ranking over the summary alone
is 603ms and still textual; ordering by authority is 73ms. Rather than pick one
silently, `order` is `relevance` (default), `authority` or `date`, and the
response says which signal was used. When vectors land, `relevance` changes
meaning and the contract does not.

**10, changes.** Returns `next_since`, which is the caller's cursor for the next
poll: polling from it never re-delivers and never skips. This is the RegTech
primitive that turns a purchase into a subscription, so it should exist from day
one even before webhooks — and it is also the export risk, see below.

## The export boundary, restated

Niko's rule, from the 24 Jul mail and now in the product description: neither
seat tier includes a public SPARQL endpoint, because a seat buys answers and an
endpoint buys the substrate. The rule is right and the artifact it names is too
narrow. **The property that matters is enumerability, not the query language.**
This REST layer, built exactly as the product description asks for, reproduces
the risk it warns about:

- `/changes?since=1990-01-01` plus the `next_since` cursor is a
  guaranteed-complete enumerator. It was designed that way on purpose for
  subscriptions. 3.6M decisions at 100 per page is 36,000 requests.
- `/decisions/{ecli}` then returns the text, and `/cited` plus `/citing` per
  ECLI rebuild the citation graph.
- Today there is no per-key quota and no metering on these routes; the only
  limit is 3,000 requests per minute keyed by IP, not by key.

What is worth protecting is not the corpus. Dutch judgments are open data and
Rechtspraak gives them away in bulk. The asset is the **derived layer** — the
resolved graph, precedent status, instance chains, the alias dictionary, the
edition mapping — and that is precisely what these endpoints hand out one row at
a time.

Enforcement, in order of leverage; the first is commercial and the strongest:

1. **Sell the bulk snapshot.** Already an Enterprise surface. If the legitimate
   path is cheaper than 3.6M requests, scraping stops being rational.
2. **Per-key daily quota, keyed by API key rather than IP.** Rate limits stop
   bursts; quotas stop patient scrapers. A crawler at 10 req/s under a 3,000/min
   ceiling looks like an ordinary client.
3. **Meter the endpoints** into the existing credit system, weighted per
   endpoint: `/resolve` cheap, `/changes` and `/search` expensive.
4. **Bound the enumeration primitive.** `/changes` is the only endpoint that
   guarantees completeness.
5. **Detect the pattern, not just the count.** Enumeration is distinctive: high
   unique-entity ratio, near-zero repeats, sequential cursors, breadth without
   depth.

Not proposed: watermarking the graph with fabricated edges. In a product whose
pitch is that every reference resolves, seeding false relations to catch thieves
is self-defeating.

The open commercial question: Niko's tiering says both tiers get the full graph
and differ only by usage limits, and also puts change-tracking in the Pro seat.
Once the feed exists those pull apart, because an unbounded cursor over the whole
corpus from 1990 *is* the substrate. The likely resolution is that Pro gets
change-tracking over its own monitored set while an unbounded historical cursor
is a Builder/Enterprise capability — one endpoint name covering two products.
That is a call for Vlad and Niko, not something to decide in code.

## What NL currently answers with

Numbers as of 26 Jul 2026, so the FI side has something to compare against.

| | |
|---|---|
| decisions | 3,603,085 (946,389 with text; the rest are metadata-only at source) |
| coverage against the source feed | 100.0% |
| case-to-case edges | 1,052,105, **98.0% resolved** |
| statute edges | 2,507,190, **99.6% with a law id** |
| of those, tied to the edition in force on the decision date | **94.2%** |
| instance links | 200,887, with the publisher's own appeal outcomes |
| precedent status | 18,197 quashed, 30,304 upheld |
| legislation | 46,365 acts, 146,164 editions |
| cross-border | CJEU 99.4% resolved, ECHR 93.0% (link-out) |

## What Finland needs to supply for the same contract

1. A decisions table with a stable id (ECLI), court, date, subjects, text where
   redistributable.
2. A citation edge table with `resolved`, `match_method`, `unresolved_reason`.
   The three fields together are what make endpoint 2 honest.
3. An alias dictionary for Finnish citation forms — endpoint 9 is only as good
   as this.
4. Instance links with an outcome, if Finnish sources publish one. NL gets this
   free from `dcterms:relation`; where a source does not state it, the field
   stays null rather than being inferred.
5. Acts and editions with validity periods, for endpoint 8.
6. A `updated_at` on decisions, for endpoint 10.

## Open, for the two of us

- **Auth and metering.** Currently dual-auth (API key or JWT) on the existing
  credit pool. Builder and Enterprise tiers need quota per key and a rate class,
  which is billing work, not API work.
- **SPARQL alongside REST.** The spec keeps SPARQL key-gated for the
  infrastructure tier. This REST layer is deliberately the narrow, cacheable
  surface for the per-seat and Builder tiers; it does not replace the endpoint.
  Both need the same quota rules, or the weaker one becomes the leak.
- **Whether FI is served from our backend or Niko's**, with this contract as the
  interface either way. That decision is independent of the shape above, which
  is the point of writing the shape down first.
