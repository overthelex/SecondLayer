#!/usr/bin/env python3
"""
Build a COLIEE-Task-1-format case-retrieval package for the Ukrainian corpus,
so the SAME dense-retrieval + recency-weighting experiment can be run on UA and
compared apples-to-apples with the Canadian result.

Gold = non-self, resolved precedent edges from case_citation_links
(from_doc_id cites the case whose representative decision is latest_doc_id).
Texts/dates from edrsr_fulltext. Sized to mirror the Canadian corpus
(~2000 queries, ~7700-decision pool) so GPU cost matches the CA run.

The server is UTF8 but a tiny fraction of full_text rows contain invalid byte
sequences; text fetches batch-and-bisect so a single bad row is skipped rather
than aborting the whole pull.

Runs ON prod. Emits, under OUTDIR:
  ua_case_retrieval.zip   (ua_cases/cases/<doc_id>.txt + clean_ua_case_labels.json)
  ua_years.json           ({<doc_id>.txt: year})

Usage (on prod):
    UA_QUERIES=2000 UA_POOL=7708 OUTDIR=/tmp/ua_case_pkg \
        python3 build_ua_case_retrieval_package.py
"""
import json
import os
import zipfile
from collections import defaultdict

import psycopg2

N_QUERIES = int(os.environ.get("UA_QUERIES", "2000"))
POOL = int(os.environ.get("UA_POOL", "7708"))
SEED = int(os.environ.get("UA_SEED", "42"))
MAXCHARS = int(os.environ.get("UA_MAXCHARS", "6000"))
OUTDIR = os.environ.get("OUTDIR", "/tmp/ua_case_pkg")
os.makedirs(OUTDIR, exist_ok=True)

conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '300000'")


def fetch_docs(ids):
    """Return {doc_id: (text, year)} for ids that have text+year, skipping the
    rare rows with invalid UTF-8 via batch bisection."""
    out = {}

    def run(batch):
        cur.execute(
            "SELECT doc_id, left(full_text, %s), adj_year FROM edrsr_fulltext "
            "WHERE doc_id = ANY(%s) AND adj_year IS NOT NULL AND full_text IS NOT NULL",
            (MAXCHARS, batch))
        for did, txt, yr in cur.fetchall():
            if txt and txt.strip():
                out[did] = (txt, int(yr))

    def attempt(batch):
        if not batch:
            return
        try:
            run(batch)
        except psycopg2.Error:
            conn.rollback()
            if len(batch) == 1:
                return  # skip the single bad row
            m = len(batch) // 2
            attempt(batch[:m])
            attempt(batch[m:])

    ids = list(ids)
    for i in range(0, len(ids), 1000):
        attempt(ids[i:i + 1000])
    return out


# 1. oversample query decisions with >=1 non-self resolved precedent
cur.execute("""
    SELECT DISTINCT from_doc_id
    FROM case_citation_links TABLESAMPLE SYSTEM (0.2) REPEATABLE (%s)
    WHERE resolved AND NOT is_self_citation AND latest_doc_id IS NOT NULL
    LIMIT %s
""", (SEED, N_QUERIES * 3))
q_cand = [r[0] for r in cur.fetchall()]
print(f"query candidates sampled: {len(q_cand)}", flush=True)

# 2. gold precedent targets for those queries
cur.execute("""
    SELECT from_doc_id, latest_doc_id
    FROM case_citation_links
    WHERE from_doc_id = ANY(%s)
      AND resolved AND NOT is_self_citation AND latest_doc_id IS NOT NULL
""", (q_cand,))
gold = defaultdict(set)
for frm, tgt in cur.fetchall():
    if tgt != frm:
        gold[frm].add(tgt)

# 3. texts+years for queries + gold (resilient)
need = set(gold) | {t for s in gold.values() for t in s}
docs = fetch_docs(need)
print(f"docs with text/year (queries+gold): {len(docs)}", flush=True)

# 4. keep queries whose gold survives; trim to N_QUERIES
queries = {}
for q, tgts in gold.items():
    if q not in docs:
        continue
    kept = [t for t in tgts if t in docs]
    if kept:
        queries[q] = kept
    if len(queries) >= N_QUERIES:
        break
print(f"usable queries: {len(queries)}", flush=True)

pool = set(queries) | {t for ts in queries.values() for t in ts}
print(f"pool before distractors: {len(pool)}", flush=True)

# 5. distractors: sample candidate ids, then resilient text fetch
if len(pool) < POOL:
    cur.execute("""
        SELECT doc_id
        FROM edrsr_fulltext TABLESAMPLE SYSTEM (0.02) REPEATABLE (%s)
        WHERE adj_year IS NOT NULL AND full_text IS NOT NULL
        LIMIT %s
    """, (SEED + 1, (POOL - len(pool)) * 4))
    cand = [r[0] for r in cur.fetchall() if r[0] not in pool]
    extra = fetch_docs(cand)
    for did, (txt, yr) in extra.items():
        if did in pool:
            continue
        docs[did] = (txt, yr)
        pool.add(did)
        if len(pool) >= POOL:
            break
conn.close()
print(f"final pool: {len(pool)} | queries: {len(queries)}", flush=True)

# 6. write COLIEE-format zip + years json
labels = {f"{q}.txt": [f"{t}.txt" for t in ts] for q, ts in queries.items()}
years_out = {f"{d}.txt": docs[d][1] for d in pool}

zpath = os.path.join(OUTDIR, "ua_case_retrieval.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as zf:
    for d in pool:
        zf.writestr(f"ua_cases/cases/{d}.txt", docs[d][0])
    zf.writestr("ua_cases/clean_ua_case_labels.json", json.dumps(labels))
with open(os.path.join(OUTDIR, "ua_years.json"), "w") as fh:
    json.dump(years_out, fh)

print(f"wrote {zpath} ({os.path.getsize(zpath)//1024//1024} MB) + ua_years.json")
