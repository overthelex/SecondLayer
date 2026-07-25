#!/usr/bin/env python3
"""Build Cite(d) for the UA case-retrieval pool: {doc_id.txt: [cited
latest_doc_id.txt, ...]} from case_citation_links (non-self, resolved
precedent). Needed for the Yoshioka Extended-Precision/Coverage metrics.
Runs ON prod; reads pool ids from a file, writes ua_citations.json."""
import json
import os
from collections import defaultdict

import psycopg2

IDS = os.environ.get("IDS_FILE", "/tmp/ua_pool_ids.txt")
OUT = os.environ.get("OUT", "/tmp/ua_citations.json")

pool = [int(x) for x in open(IDS).read().split()]
conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '180000'")
cur.execute("""
    SELECT from_doc_id, latest_doc_id
    FROM case_citation_links
    WHERE from_doc_id = ANY(%s)
      AND resolved AND NOT is_self_citation AND latest_doc_id IS NOT NULL
""", (pool,))
cites = defaultdict(set)
for frm, tgt in cur.fetchall():
    if tgt != frm:
        cites[frm].add(tgt)
conn.close()

out = {f"{d}.txt": sorted(f"{t}.txt" for t in ts) for d, ts in cites.items()}
json.dump(out, open(OUT, "w"))
print(f"citations for {len(out)}/{len(pool)} pool cases -> {OUT}")
