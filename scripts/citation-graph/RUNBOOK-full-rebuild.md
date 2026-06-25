# Full EDRSR citation rebuild — local-compute → prod-export runbook

Rebuild `law_court_citations` (+ `case_citation_edges`) from the **whole**
EDRSR corpus (~120-140M decisions, 2007-2026) cleanly, then publish to prod.

**Why local compute:** cthulhu (16 cores, NVMe, 123 GB RAM, full `edrsr_fulltext`
partitions) extracts ~3× faster than prod at equal workers and carries no live
traffic. Benchmarked sweet spot **W=14 ≈ 10,582 rows/s** → ~3.4-4 h load.
Prod only does a pre-deduped bulk COPY + index build (no extraction load).

**Why deferred-index:** writing into UNLOGGED, index-free staging then
dedup+index once was ~25% faster end-to-end than inline unique-index +
`ON CONFLICT` (bench: 758 s vs 881 s on 2M; the inline path also degrades as the
table grows, deferred stays flat).

```
LOCAL (cthulhu)                          PROD
01 prep.sql   -> lcc_bulk/cce_bulk        01 prep.sql  -> TRUNCATE + drop indexes
02 run.sh     -> extract --all (3.4-4h)   02 copy.sh   -> COPY gz CSV in
03 finalize   -> dedup+index+enrich       03 finalize  -> build indexes + enrich
04 export.sh  -> gz CSV ─────────────────▶ (transfer S3/scp)
```

---

## Pre-flight (local)

```bash
# on cthulhu:  ssh -J workstation local.lex
cd ~/SecondLayer/scripts/citation-graph
git pull            # ensure these scripts are present

# CRITICAL: the local extract-citations.py MUST have the deferred flags.
# main-branch does NOT yet; the local copy was patched. Verify:
python3 extract-citations.py --help | grep -- --bulk-load   # must print a line
#   (run.sh also guards this and aborts if missing)

# Disk check — staging raw (~150 GB) + dedup (~100 GB) + indexes on top of the
# existing 502M stale baseline (~111 GB). Need ~400 GB headroom.
df -h /var/lib/docker   # or wherever the local PG volume lives
```

The stale 502M `law_court_citations` and its `mv_citations_by_year` are **left
untouched** by this whole local flow — it builds into separate `*_bulk`/`*_final`
tables. Decide its fate only after prod is validated (see Cleanup).

## 1-3. Run on local (inside tmux)

```bash
tmux new -s citerebuild
cd ~/SecondLayer/scripts/citation-graph
ENV=~/SecondLayer/deployment/.env.local
PU=$(grep ^POSTGRES_USER= $ENV|cut -d= -f2-); PD=$(grep ^POSTGRES_DB= $ENV|cut -d= -f2-)
PSQL="docker exec -i secondlayer-postgres-local psql -U $PU -d $PD"

$PSQL -f - < local-rebuild-01-prep.sql                       # instant
./local-rebuild-02-run.sh 2>&1 | tee local-rebuild-run.log   # ~3.4-4 h
$PSQL -f - < local-rebuild-03-finalize.sql                   # ~30-60 min
```

Checkpoint after finalize: confirm `lcc dedup` is in the expected range and
`codex_article` is NOT phantom-inflated (the old stale table had 396M codex from
the range-explosion bug; the fixed parser should yield far fewer). Confirm
`decisions_with_statute_citation` is ~100M+ (old stale covered only ~35M).

## 4. Export local → prod

```bash
# pick ONE transfer mode. S3 default (both hosts reach eu-central-1):
OUTDIR=/data/citation-export TRANSFER=s3 \
  S3_URI=s3://<bucket>/citerebuild ./local-rebuild-04-export.sh
# direct copy alternative (needs a route reachable FROM cthulhu):
#   TRANSFER=scp PROD_SSH=ubuntu@<prod> PROD_DIR=/tmp/citation-export ./local-rebuild-04-export.sh
```

> local → prod / S3 is the sanctioned direction. NEVER pull prod/AWS → local
> (paid egress).

## 1-3. Load on prod (inside tmux)

```bash
ssh prod
cd ~/SecondLayer/scripts/citation-graph
aws s3 cp --recursive s3://<bucket>/citerebuild /tmp/citation-export   # if S3

psql "$DATABASE_URL" -f prod-load-01-prep.sql        # TRUNCATE + drop indexes
INDIR=/tmp/citation-export ./prod-load-02-copy.sh    # COPY (~30-60 min)
psql "$DATABASE_URL" -f prod-load-03-finalize.sql    # indexes + enrich (hours)
```

Verify loaded counts match `MANIFEST.txt`. The unique-index build in finalize
**re-validates** dedup — a uniqueness violation there means the export was not
clean; stop and investigate rather than forcing it.

After nginx/back-end smoke check on a couple of `get_citation_graph` /
legislation-citation queries, the rebuild is live.

## Cleanup (only after prod validated)

- Local stale 502M baseline: `TRUNCATE law_court_citations` (NOT `DROP` — keeps
  the OID and the dependent `mv_citations_by_year`), or leave as-is until the
  next ingestion cycle. Drop `lcc_bulk`/`cce_bulk`/`lcc_final`/`cce_final` to
  reclaim local disk.
- Prod: once happy, `DROP TABLE law_court_citations_backup_prerebuild;`.

## Known caveats / risks

- **OFFSET pagination**: the extractor paginates each year partition with
  `OFFSET/LIMIT`; tail chunks on the large recent-year partitions (~10-15M rows)
  re-scan from the top. Mitigated by the larger `--chunk-size 100000` (fewer
  re-scans) and the partition fitting in page cache. If a big year crawls,
  keyset pagination (`WHERE doc_id > last ORDER BY doc_id`) is the real fix — a
  follow-up change to `extract-citations.py`, out of scope here.
- **Resumability**: `02-run.sh` is all-or-nothing across years. If it dies
  mid-corpus, the cleanest restart is to re-`01-prep` (truncates staging) and
  rerun. For a partial restart, run single `--year` invocations for the missing
  years into the same `lcc_bulk`/`cce_bulk` (append-only, dedup happens in
  finalize regardless).
- **Flags not in main**: `--bulk-load`/`--no-enrich` live only in the local/prod
  copies. To make `git pull` self-sufficient on any box, land them in main (small
  PR) — otherwise keep the patched local copy.
