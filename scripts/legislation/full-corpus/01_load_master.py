#!/usr/bin/env python3
"""Stage 0: parse Rada doc.txt (cp1251, tab-sep) + dictionaries → rada_docs_master, rada_dict.

Emits normalized UTF-8 TSV and bulk-loads via `psql \\copy` (no psycopg2 dependency).

Usage:
  DBURL='postgresql://secondlayer:PW@127.0.0.1:5438/rada_npa' \
    python3 01_load_master.py /data/rada_npa/bulk
"""
import os, sys, subprocess, tempfile

BULK = sys.argv[1] if len(sys.argv) > 1 else "/data/rada_npa/bulk"
DBURL = os.environ["DBURL"]


def psql(sql):
    subprocess.run(["psql", DBURL, "-v", "ON_ERROR_STOP=1", "-c", sql], check=True)


def copy_tsv(table, columns, rows):
    with tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False, encoding="utf-8") as f:
        path = f.name
        for r in rows:
            f.write("\t".join("" if c is None else str(c) for c in r) + "\n")
    cols = ",".join(columns)
    cmd = ["psql", DBURL, "-v", "ON_ERROR_STOP=1",
           "-c", f"\\copy {table} ({cols}) FROM '{path}' WITH (FORMAT text, DELIMITER E'\\t', NULL '')"]
    subprocess.run(cmd, check=True)
    os.unlink(path)


def load_dict(kind, fname):
    rows = []
    with open(os.path.join(BULK, fname), encoding="cp1251") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2 and parts[0].strip().isdigit():
                rows.append((kind, int(parts[0]), parts[1].strip()))
    psql(f"DELETE FROM rada_dict WHERE kind='{kind}'")
    copy_tsv("rada_dict", ["kind", "id", "name"], rows)
    print(f"[01] rada_dict {kind}: {len(rows)}")


def load_master():
    rows, skipped = [], 0
    with open(os.path.join(BULK, "doc.txt"), encoding="cp1251") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 5 or not p[0].strip().isdigit():
                skipped += 1
                continue
            dokid = int(p[0])
            nreg = p[1].strip()
            nazva = p[2].strip()
            status = int(p[3]) if p[3].strip().lstrip("-").isdigit() else None
            types_raw = p[4].strip()
            if not nreg:
                skipped += 1
                continue
            rows.append((dokid, nreg, nazva, status, types_raw))
    # dedup by nreg keeping first (file is newest-first)
    seen, uniq = set(), []
    for r in rows:
        if r[1] in seen:
            continue
        seen.add(r[1]); uniq.append(r)
    psql("TRUNCATE rada_docs_master")
    copy_tsv("rada_docs_master", ["dokid", "nreg", "nazva", "status", "types_raw"], uniq)
    print(f"[01] rada_docs_master: {len(uniq)} loaded, {skipped} skipped, {len(rows)-len(uniq)} dup nreg")


if __name__ == "__main__":
    load_dict("podia", "podia.txt")
    load_dict("stan", "stan.txt")
    load_dict("typ", "typ.txt")
    load_master()
