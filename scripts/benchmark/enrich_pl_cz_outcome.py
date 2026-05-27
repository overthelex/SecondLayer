#!/usr/bin/env python3
"""
Enrich Polish and Czech court decisions with outcome labels via regex.

Polish outcome patterns (from dispositive section / sentencja):
  - granted:  "uwzględnia", "zasądza", "zobowiązuje pozwanego"
  - denied:   "oddala", "nie uwzględnia", "nie zasługuje na uwzględnienie"
  - partial:  "częściowo uwzględnia", "uwzględnia w części", "w pozostałej części oddala"

Czech outcome patterns (from výrok / výroková část):
  - granted:  "vyhovuje", "přiznává", "zavazuje žalovaného"
  - denied:   "zamítá", "nevyhovuje", "zamítá se"
  - partial:  "částečně vyhovuje", "ve zbytku zamítá", "zčásti vyhovuje"

Usage:
  python3 scripts/benchmark/enrich_pl_cz_outcome.py [--db-url URL] [--dry-run] [--country pl|cz|both]
"""

import argparse
import os
import re

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

PL_OUTCOME_GRANTED = re.compile(
    r"(?:"
    r"uwzgl[ęe]dnia\s+(?:pow[oó]dztwo|skarg[ęe]|wniosek|żądanie)"
    r"|zas[ąa]dza\s+od\s+pozwan"
    r"|zobowi[ąa]zuje\s+pozwan"
    r"|orzeka\s+o\s+(?:rozwi[ąa]zaniu|rozwiodzie)"
    r"|unieważnia"
    r"|uchyla\s+(?:zaskarżon[ąa]|decyzj[ęe])"
    r"|zmienia\s+(?:zaskarżon[ąa]|decyzj[ęe])"
    r"|pow[oó]dztwo\s+(?:jest\s+)?zasadne"
    r")",
    re.IGNORECASE,
)

PL_OUTCOME_DENIED = re.compile(
    r"(?:"
    r"oddala\s+(?:pow[oó]dztwo|skarg[ęe]|wniosek|apelacj[ęe]|zażalenie)"
    r"|nie\s+uwzgl[ęe]dnia"
    r"|pow[oó]dztwo\s+(?:nie\s+)?(?:zasługuje|podlega)\s+(?:na\s+)?oddaleni"
    r"|nie\s+zasługuje\s+na\s+uwzgl[ęe]dnienie"
    r"|utrzymuje\s+w\s+mocy"
    r"|pow[oó]dztwo\s+(?:jest\s+)?(?:bezzasadne|niezasadne)"
    r")",
    re.IGNORECASE,
)

PL_OUTCOME_PARTIAL = re.compile(
    r"(?:"
    r"cz[ęe][śs]ciowo\s+uwzgl[ęe]dnia"
    r"|uwzgl[ęe]dnia\s+(?:pow[oó]dztwo|skarg[ęe]|wniosek)\s+w\s+cz[ęe][śs]ci"
    r"|w\s+pozosta[łl](?:ej|ym)\s+cz[ęe][śs]ci\s+oddala"
    r"|w\s+pozosta[łl](?:ej|ym)\s+zakresie\s+oddala"
    r"|cz[ęe][śs]ciowo\s+oddala"
    r")",
    re.IGNORECASE,
)

CZ_OUTCOME_GRANTED = re.compile(
    r"(?:"
    r"vyhovuje\s+(?:žalob[ěe]|návrhu)"
    r"|přiznává"
    r"|zavazuje\s+žalovan"
    r"|zrušuje\s+(?:napadené|rozhodnutí)"
    r"|mění\s+(?:rozsudek|rozhodnutí)"
    r"|žalob[ěe]\s+(?:se\s+)?vyhovuje"
    r"|žaloba\s+(?:je\s+)?důvodná"
    r")",
    re.IGNORECASE,
)

CZ_OUTCOME_DENIED = re.compile(
    r"(?:"
    r"zamítá\s+(?:se|žalobu|návrh|odvolání|dovolání)"
    r"|žaloba\s+se\s+zamítá"
    r"|nevyhovuje"
    r"|žaloba\s+(?:je\s+)?(?:nedůvodná|neopodstatněná)"
    r"|se\s+zamítá"
    r"|odmítá\s+(?:se|žalobu|dovolání)"
    r")",
    re.IGNORECASE,
)

CZ_OUTCOME_PARTIAL = re.compile(
    r"(?:"
    r"částečně\s+vyhovuje"
    r"|zčásti\s+vyhovuje"
    r"|ve\s+zbytku\s+(?:se\s+)?zamítá"
    r"|v\s+ostatním\s+(?:se\s+)?zamítá"
    r"|částečně\s+zamítá"
    r")",
    re.IGNORECASE,
)


def classify_outcome(text, country):
    if not text or len(text) < 100:
        return None
    tail = text[-4000:]

    if country == "pl":
        if PL_OUTCOME_PARTIAL.search(tail):
            return "partial"
        if PL_OUTCOME_GRANTED.search(tail):
            return "granted"
        if PL_OUTCOME_DENIED.search(tail):
            return "denied"
    elif country == "cz":
        if CZ_OUTCOME_PARTIAL.search(tail):
            return "partial"
        if CZ_OUTCOME_GRANTED.search(tail):
            return "granted"
        if CZ_OUTCOME_DENIED.search(tail):
            return "denied"
    return None


def ensure_column(conn, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = %s AND column_name = 'enriched_outcome'
    """, (table,))
    if not cur.fetchone():
        cur.execute(f"ALTER TABLE {table} ADD COLUMN enriched_outcome TEXT")
        conn.commit()
        print(f"Added enriched_outcome column to {table}")
    cur.close()


def enrich_country(db_url, country, table, dry_run=False, batch_size=5000):
    conn = psycopg2.connect(db_url)
    conn.autocommit = True

    if not dry_run:
        ensure_column(conn, table)

    cur = conn.cursor()
    cur.execute(f"SELECT count(*) FROM {table}")
    total = cur.fetchone()[0]
    cur.execute(f"SELECT count(*) FROM {table} WHERE full_text IS NOT NULL AND length(full_text) > 500")
    with_text = cur.fetchone()[0]
    cur.execute(f"SELECT count(*) FROM {table} WHERE enriched_outcome IS NOT NULL")
    already = cur.fetchone()[0]
    cur.close()

    print(f"\n{country.upper()} ({table}): {total:,} total, {with_text:,} with fulltext, {already:,} already enriched")

    if already >= with_text:
        print("  All records already enriched.")
        return

    conn.close()
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(name=f"{country}_outcome_cursor")
    cur.itersize = batch_size

    cur.execute(f"""
        SELECT id, full_text FROM {table}
        WHERE full_text IS NOT NULL AND length(full_text) > 500
          AND enriched_outcome IS NULL
        ORDER BY id
    """)

    update_cur = conn.cursor()
    batch = []
    stats = {"granted": 0, "denied": 0, "partial": 0, "fail": 0}
    processed = 0

    for row in cur:
        doc_id, text = row
        processed += 1
        outcome = classify_outcome(text, country)

        if outcome:
            stats[outcome] += 1
            batch.append((outcome, doc_id))
        else:
            stats["fail"] += 1

        if len(batch) >= 1000 and not dry_run:
            psycopg2.extras.execute_batch(
                update_cur,
                f"UPDATE {table} SET enriched_outcome = %s WHERE id = %s",
                batch,
            )
            conn.commit()
            batch = []

        if processed % 10000 == 0:
            print(f"  {processed:,} -- granted={stats['granted']}, denied={stats['denied']}, partial={stats['partial']}, fail={stats['fail']}", flush=True)

    if batch and not dry_run:
        psycopg2.extras.execute_batch(
            update_cur,
            f"UPDATE {table} SET enriched_outcome = %s WHERE id = %s",
            batch,
        )
        conn.commit()

    cur.close()
    update_cur.close()
    conn.close()

    classified = stats["granted"] + stats["denied"] + stats["partial"]
    print(f"\n  {country.upper()} Summary: {processed:,} processed, {classified:,} classified ({classified/max(processed,1)*100:.1f}%)")
    print(f"    granted={stats['granted']}, denied={stats['denied']}, partial={stats['partial']}, fail={stats['fail']}")
    if dry_run:
        print("    (dry-run mode)")


def main():
    parser = argparse.ArgumentParser(description="Enrich PL+CZ court decisions with outcome labels")
    parser.add_argument("--db-url", default=DB_URL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--country", choices=["pl", "cz", "both"], default="both")
    args = parser.parse_args()

    if args.country in ("pl", "both"):
        enrich_country(args.db_url, "pl", "pl_court_decisions", dry_run=args.dry_run)
    if args.country in ("cz", "both"):
        enrich_country(args.db_url, "cz", "cz_court_decisions", dry_run=args.dry_run)


if __name__ == "__main__":
    main()
