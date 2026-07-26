#!/usr/bin/env python3
"""Harvest CJEU decision metadata from CELLAR into a CSV for loading (LEXAI-1892).

Why SPARQL and not the REST API: CELLAR's SPARQL endpoint answers without a key
and returns the ECLI, CELEX, date and title in one pass, which is exactly what a
citation target needs. Text comes later, per decision, and only where wanted.

Why sharded by court and year rather than LIMIT/OFFSET: deep OFFSET on this
endpoint degrades badly and silently truncates on timeout, whereas an ECLI
prefix filter is an index hit. Counted before harvesting:
    ECLI:EU:C  30,280    ECLI:EU:T  13,122    ECLI:EU:F  1,253
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

ENDPOINT = "http://publications.europa.eu/webapi/rdf/sparql"
UA = "SecondLayer-Legal-Platform/2.0 (legal.org.ua; opendata-importer)"
OUT = sys.argv[1] if len(sys.argv) > 1 else "cjeu_metadata.csv"

COURTS = {"C": (1954, date.today().year), "T": (1989, date.today().year), "F": (2005, 2017)}

QUERY = """
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?ecli ?celex ?date ?title WHERE {
  ?w cdm:case-law_ecli ?ecli ;
     cdm:work_date_document ?date .
  OPTIONAL { ?w cdm:resource_legal_id_celex ?celex }
  OPTIONAL {
    ?e cdm:expression_belongs_to_work ?w ;
       cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ;
       cdm:expression_title ?title
  }
  FILTER(STRSTARTS(STR(?ecli), "ECLI:EU:%s:%d"))
}
"""


def celex_doc_type(celex: str) -> str:
    """CELEX sector 6 descriptor: CJ judgment, CC opinion of the AG, CO order."""
    if not celex or len(celex) < 7:
        return ""
    code = celex[5:7]
    return {"CJ": "judgment", "CC": "opinion", "CO": "order",
            "TJ": "judgment", "TO": "order", "FJ": "judgment", "FO": "order"}.get(code, "")


def fetch(court: str, year: int, attempt: int = 0) -> list:
    body = urllib.parse.urlencode({"query": QUERY % (court, year)}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"User-Agent": UA, "Accept": "application/sparql-results+json",
                 "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())["results"]["bindings"]
    except Exception as e:
        if attempt < 3:
            time.sleep(5 * (attempt + 1))
            return fetch(court, year, attempt + 1)
        print(f"  {court}:{year} FAILED after 4 tries: {e}", file=sys.stderr)
        return []


def main():
    seen = set()
    rows = 0
    with open(OUT, "w", newline="") as fh:
        w = csv.writer(fh)
        for court, (lo, hi) in COURTS.items():
            for year in range(lo, hi + 1):
                got = fetch(court, year)
                new = 0
                for b in got:
                    ecli = b["ecli"]["value"]
                    if ecli in seen:
                        continue
                    seen.add(ecli)
                    celex = b.get("celex", {}).get("value", "")
                    w.writerow([
                        ecli, celex, court,
                        b.get("date", {}).get("value", "")[:10],
                        b.get("title", {}).get("value", "").replace("\n", " ")[:2000],
                        celex_doc_type(celex),
                        f"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}" if celex else "",
                    ])
                    new += 1
                    rows += 1
                if got:
                    print(f"  {court}:{year} {len(got):5} rows, {new:5} new (total {rows:,})",
                          flush=True)
    print(f"wrote {rows:,} rows to {OUT}")


if __name__ == "__main__":
    main()
