# UAE court-decision harvesters

Tools for building the `ae_court_decisions` corpus (DIFC, ADGM, Dubai Courts).

## Sources and what each needs

| Source | Format | Auth | Reachable from EU |
|---|---|---|---|
| DIFC Courts | HTML | none | yes |
| ADGM Courts | PDF | none | yes |
| Dubai Courts | HTML | none | **no — UAE IP required** |
| MOJ / Federal Supreme Court | HTML | none | no (blocks AWS ranges too) |
| ADJD (Abu Dhabi) | HTML | **UAE Pass** | not obtainable |

DIFC and ADGM run anywhere. Dubai Courts geo-blocks non-UAE IPs, so requests go
through a Lambda deployed in `me-central-1` (`lambda/uae_fetch.py`).

## Layout

```
harvest_difc.py        DIFC judgments for one year   -> JSONL
harvest_adgm.py        ADGM judgments (PDF)          -> JSONL
lambda/uae_fetch.py    UAE-resident proxy: fetch | walk | texts
index_chain.sh         chained index walk per litigation stage
texts_pipeline.sh      fan-out full-text fetch behind the index walk
fetch_batch.sh         one text batch through the Lambda (idempotent)
build_dubai_jsonl.py   join index metadata + texts   -> JSONL
sql/01_create_table.sql
sql/02_load_difc_adgm.sql
sql/03_load_dubai.sql
```

## Usage

```bash
# one-off, run anywhere
python3 harvest_difc.py 2026 difc_2026.jsonl
python3 harvest_adgm.py all adgm_all.jsonl

# Dubai: needs the Lambda deployed in me-central-1 and an AWS profile for it
export UAE_BUCKET=<harvest bucket>      # required
export UAE_PROFILE=uae UAE_REGION=me-central-1
UAE_STAGES="5 3" ./index_chain.sh       # index walk, stage by stage (5=cassation, 3=appeal, 1=first instance)
./texts_pipeline.sh                     # full texts for the indexed rows
python3 build_dubai_jsonl.py <index_dir> <texts_dir> ae_dubai.jsonl
```

Load with `psql -f sql/0X_....sql` after copying the JSONL to `/tmp` inside the
Postgres container. Loads are idempotent (`ON CONFLICT DO UPDATE`).

## Things that will bite you

**Dubai Courts is OutSystems, not a normal site.** Pagination goes through
`OsAjax`, which submits the whole form with three hidden fields: `__EVENTTARGET`,
`__AJAXEVENT` and — the one that is easy to miss — **`__AJAX`**, a plain
comma-joined click context
(`docW,docH,originId,offTop,offLeft,scrollTop,scrollLeft,mouseX,mouseY,`). No
token, no signature. Without `__AJAX` the server silently keeps returning page 1.
The response is an `OsJSONUpdate({...})` payload: rows arrive JSON-escaped under
`"outers"→"inner"`, the next state under `"hidden":{"__OSVSTATE":...}`.
In the anchor `onclick`, quotes are escaped as `&#39;` — a regex expecting `'`
matches nothing and pagination looks broken.

**Only the litigation-stage filter works.** Case year, main type and subtype are
accepted and ignored (`total_pages` is identical for every value), so the corpus
cannot be partitioned by query and each stage must be walked sequentially. Results
are not date-ordered either: one page mixes 2010-2026.

**Pagination cost grows with depth.** Measured: ~3.5 s/page at page 500, ~4.8 s at
page 900, ~7 s at page 1500 — roughly `1.7 + 0.0034 × page` seconds. Total walk
time is therefore quadratic in page count. Cassation (1356 pages) takes ~2 h;
first instance (9553 pages) would take ~2 days.

**Go slow or the portal drops you.** At 0.15 s between pages the server started
returning `RemoteDisconnected` after 20-50 pages. At 0.8 s it runs for the full
Lambda budget without a single drop. `index_chain.sh` also sleeps 60 s between
chunks.

**Async Lambda invocations do not work here.** They are accepted with 202 and
never execute: zero `Invocations`, zero `Errors`, zero `AsyncEventsDropped`. It
cost two silent stalls (the index walk, then 3114 queued text batches that fetched
nothing). Everything uses synchronous invokes with `--cli-read-timeout 0`.

**Two failure modes that report success — check counts, not exit codes.**
`index_chain.sh` used to stop at its chunk cap and return 0, so an appeal walk that
was 385 pages short looked complete; it now returns 2 and logs `TRUNCATED`. And BSD
`xargs -I{}` with a long inline script dies with "command line cannot be assembled,
too long" while the surrounding pipeline happily logs that every batch was
launched — hence `fetch_batch.sh` as a separate file. Always compare the row count
you got against the count you expected.

**Resume is by saved session, not by re-walking.** Each chunk stores cookies +
`__OSVSTATE` + the next page target in S3, so the next invocation continues with
no fast-forward. Verify a deploy with `CodeSha256`, not `LastUpdateStatus` —
polling status returns the previous "Successful" and you end up testing stale code.

**Dates come in two languages.** The same portal serves `02 يناير 2011` and
`28 Jan 2014`; `build_dubai_jsonl.py` handles Arabic, Levantine and English month
names plus Arabic-Indic digits.

## Legal note

Dubai Courts' terms of use prohibit reproducing the service in whole or in part
**for commercial purposes** without written permission; they say nothing about
automated access or rate limits. UAE Copyright Law 38/2021 excludes judicial
decisions from copyright, but that does not displace the contractual term. A
written permission request was sent to `info@dc.gov.ae` on 2026-08-01 committing
to attribution, no redistribution of raw texts, respecting any rate limits they
specify, and deletion on request. Honour those commitments when using this data.
