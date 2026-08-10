#!/usr/bin/env python3
"""Stage 1: parse Rada doc-dates.txt (flat history events) → rada_events, rada_editions.

Editions = adoption (podid 4) + Редакція (0) + Нова редакція (6). No network — pure bulk.
`is_current` = the latest edition date per nreg whose doc status is "Чинний" (5), else latest.

Usage:
  DBURL='postgresql://secondlayer:PW@127.0.0.1:5438/rada_npa' \
    python3 02_load_editions.py /data/rada_npa/bulk
"""
import os, sys, subprocess, tempfile

BULK = sys.argv[1] if len(sys.argv) > 1 else "/data/rada_npa/bulk"
DBURL = os.environ["DBURL"]
EDITION_PODIDS = {0, 4, 6}


def psql(sql, capture=False):
    r = subprocess.run(["psql", DBURL, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
                       check=True, capture_output=capture, text=True)
    return r.stdout if capture else None


def copy_tsv(table, columns, rows):
    with tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False, encoding="utf-8") as f:
        path = f.name
        for r in rows:
            f.write("\t".join("" if c is None else str(c) for c in r) + "\n")
    cols = ",".join(columns)
    subprocess.run(["psql", DBURL, "-v", "ON_ERROR_STOP=1",
                    "-c", f"\\copy {table} ({cols}) FROM '{path}' WITH (FORMAT text, DELIMITER E'\\t', NULL '')"],
                   check=True)
    os.unlink(path)


def valid_date(s):
    return len(s) == 8 and s.isdigit() and "19000101" <= s <= "20401231"


def main():
    events, editions = [], {}
    with open(os.path.join(BULK, "doc-dates.txt"), encoding="cp1251") as fh:
        for i, line in enumerate(fh):
            p = line.rstrip("\n").split("\t")
            if i == 0 and p[0] == "poddat":
                continue
            if len(p) < 3:
                continue
            poddat, nreg, podraw = p[0].strip(), p[1].strip(), p[2].strip()
            pidstava = p[3].strip() if len(p) > 3 else ""
            if not nreg or not podraw.lstrip("-").isdigit():
                continue
            podid = int(podraw)
            events.append((nreg, poddat, podid, pidstava))
            if podid in EDITION_PODIDS and valid_date(poddat):
                editions[(nreg, poddat)] = podid  # dedup (nreg,date)

    psql("TRUNCATE rada_events")
    copy_tsv("rada_events", ["nreg", "poddat", "podid", "pidstava"], events)
    print(f"[02] rada_events: {len(events)}")

    ed_rows = [(nreg, d, pod) for (nreg, d), pod in editions.items()]
    psql("TRUNCATE rada_editions")
    copy_tsv("rada_editions", ["nreg", "ed_date", "podid"], ed_rows)
    print(f"[02] rada_editions: {len(ed_rows)} across {len({n for n,_ in editions})} acts")

    # mark latest edition per nreg as current
    psql("""
      UPDATE rada_editions e SET is_current = true
      FROM (SELECT nreg, max(ed_date) md FROM rada_editions GROUP BY nreg) m
      WHERE e.nreg = m.nreg AND e.ed_date = m.md
    """)
    n_cur = psql("SELECT count(*) FROM rada_editions WHERE is_current", capture=True).strip()
    print(f"[02] marked current: {n_cur}")


if __name__ == "__main__":
    main()
