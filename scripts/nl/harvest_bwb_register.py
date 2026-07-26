#!/usr/bin/env python3
"""Harvest the Dutch Basiswettenbestand register over SRU (LEXAI-1893).

Each SRU record is one *toestand*, a version of a regulation, and already
carries what the edition layer needs: BWB id, title, type, responsible ministry,
legal areas, the validity period, and direct URLs to that version's XML and to
the amendment-history document. 147,534 records in total.

Two properties of this endpoint shape the code:

  * It is http-only. The https host does not answer at all, which is what made
    the first round of probing look like the service was gone.
  * It answers intermittently - roughly one call in three came back empty during
    testing, with no status code to distinguish it from a real empty result. So
    every page is retried, an empty body is treated as a failure rather than as
    "no more records", and a page that will not come back after all retries is
    recorded instead of silently skipped.

Writes CSV to stdout-designated files and prints progress on stderr.
"""
import csv
import re
import subprocess
import sys
import time

SRU = ("http://zoekservice.overheid.nl/sru/Search?operation=searchRetrieve"
       "&version=1.2&x-connection=BWB&query=cql.allRecords%3D1"
       "&maximumRecords={n}&startRecord={start}")
PAGE = 100
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"

LAWS_CSV = sys.argv[1] if len(sys.argv) > 1 else "bwb_laws.csv"
EDITIONS_CSV = sys.argv[2] if len(sys.argv) > 2 else "bwb_editions.csv"
START_AT = int(sys.argv[3]) if len(sys.argv) > 3 else 1
# Optional upper bound so the run can be sharded across processes: the endpoint
# is slow per page (retries dominate), and disjoint startRecord ranges are the
# only safe way to parallelise an SRU cursor.
END_AT = int(sys.argv[4]) if len(sys.argv) > 4 else 0

REC = re.compile(r"<recordData>(.*?)</recordData>", re.S)


def field(rec: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>([^<]*)</{tag}>", rec)
    return m.group(1).strip() if m else ""


def fields(rec: str, tag: str) -> list:
    return [v.strip() for v in re.findall(rf"<{tag}[^>]*>([^<]*)</{tag}>", rec) if v.strip()]


def fetch(url: str, tries: int = 6) -> str:
    """curl rather than urllib: this host needs the redirect follow and a browser
    UA, and curl's timeout handling here proved more reliable under the
    intermittent empty responses."""
    for attempt in range(tries):
        out = subprocess.run(
            ["curl", "-s", "-L", "-m", "60", "-A", UA, url],
            capture_output=True, text=True)
        if out.stdout and "<recordData>" in out.stdout:
            return out.stdout
        if out.stdout and "<numberOfRecords>0<" in out.stdout:
            return out.stdout          # genuinely empty page, not a failure
        time.sleep(4 * (attempt + 1))
    return ""


def pg_array(items) -> str:
    clean = [i.replace('"', "").replace("\\", "").strip() for i in items]
    clean = [i for i in clean if i]
    return "{" + ",".join(f'"{i}"' for i in clean) + "}" if clean else ""


def main():
    if END_AT:
        total = END_AT
    else:
        first = fetch(SRU.format(n=1, start=1))
        total = int(re.search(r"<numberOfRecords>(\d+)", first).group(1))
    print(f"range {START_AT:,}..{total:,}", file=sys.stderr)

    laws, failed_pages, editions = {}, [], 0
    mode = "a" if START_AT > 1 else "w"
    with open(EDITIONS_CSV, mode, newline="") as efh:
        ew = csv.writer(efh)
        for start in range(START_AT, total + 1, PAGE):
            body = fetch(SRU.format(n=PAGE, start=start))
            if not body:
                failed_pages.append(start)
                print(f"  startRecord={start} UNRECOVERABLE", file=sys.stderr)
                continue
            recs = REC.findall(body)
            for rec in recs:
                bwb = field(rec, "dcterms:identifier")
                if not bwb:
                    continue
                toestand = field(rec, "overheidbwb:toestand")
                m = re.search(r"/(\d{4}-\d{2}-\d{2})/(\d+)$", toestand)
                valid_from, seq = (m.group(1), m.group(2)) if m else ("", "0")
                ew.writerow([
                    bwb, valid_from, seq,
                    field(rec, "overheidbwb:geldigheidsperiode_einddatum"),
                    toestand,
                    field(rec, "overheidbwb:locatie_toestand"),
                    field(rec, "overheidbwb:locatie_wti"),
                    field(rec, "dcterms:modified"),
                ])
                editions += 1
                if bwb not in laws:
                    laws[bwb] = [
                        bwb, field(rec, "dcterms:title"), field(rec, "dcterms:type"),
                        field(rec, "overheid:authority"), field(rec, "dcterms:creator"),
                        pg_array(fields(rec, "overheidbwb:rechtsgebied")),
                    ]
            if start % 2000 < PAGE:
                print(f"  {start:,}/{total:,}  laws={len(laws):,} editions={editions:,}",
                      file=sys.stderr, flush=True)

    with open(LAWS_CSV, "w", newline="") as lfh:
        lw = csv.writer(lfh)
        for row in laws.values():
            lw.writerow(row)

    print(f"done: {len(laws):,} laws, {editions:,} editions", file=sys.stderr)
    if failed_pages:
        print(f"pages that never came back ({len(failed_pages)}): "
              f"{failed_pages[:20]}{' ...' if len(failed_pages) > 20 else ''}", file=sys.stderr)


if __name__ == "__main__":
    main()
