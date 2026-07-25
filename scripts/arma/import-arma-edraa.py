#!/usr/bin/env python3
"""
Parse ARMA EDRAA JSON and import into PostgreSQL.

The source file is Windows-1251 encoded with decimal commas in numeric fields.
This script:
  1. Reads and fixes the JSON
  2. Creates the table if it doesn't exist
  3. Imports records using COPY for speed
  4. Creates indexes
"""
import argparse
import io
import json
import re
import sys

import psycopg2


def parse_args():
    p = argparse.ArgumentParser(description='Import ARMA EDRAA into PostgreSQL')
    p.add_argument('--input', required=True, help='Path to edra_opendata.json')
    p.add_argument('--db-host', default='localhost')
    p.add_argument('--db-port', type=int, default=5432)
    p.add_argument('--db-name', default='secondlayer_local')
    p.add_argument('--db-user', default='secondlayer')
    p.add_argument('--db-password', default='local_dev_password')
    p.add_argument('--min-year', type=int, default=2022, help='Import records from this year onward')
    return p.parse_args()


DDL = """
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS arma_arrested_assets (
    id BIGINT PRIMARY KEY,
    description TEXT,
    props TEXT,
    dectypename TEXT,
    docnum TEXT,
    decisiondate DATE,
    numerdr TEXT,
    props_1 TEXT,
    raw_decisiondate TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_arma_decisiondate ON arma_arrested_assets(decisiondate);",
    "CREATE INDEX IF NOT EXISTS idx_arma_numerdr ON arma_arrested_assets(numerdr);",
    "CREATE INDEX IF NOT EXISTS idx_arma_docnum ON arma_arrested_assets(docnum);",
    "CREATE INDEX IF NOT EXISTS idx_arma_description_trgm ON arma_arrested_assets USING gin(description gin_trgm_ops);",
]

COLUMNS = ('id', 'description', 'props', 'dectypename', 'docnum',
           'decisiondate', 'numerdr', 'props_1', 'raw_decisiondate')

BATCH_SIZE = 50000


def parse_json(path):
    """Read Windows-1251 JSON, fix decimal commas, return items list."""
    print("Reading file...", file=sys.stderr)
    with open(path, 'r', encoding='windows-1251') as f:
        raw = f.read()

    if raw.startswith(','):
        raw = '{' + raw[1:]

    # Fix decimal commas: 1764516,13 -> 1764516.13
    raw = re.sub(r':(\d+),(\d{1,2})([},\]\s])', r':\1.\2\3', raw)

    print(f"Parsing {len(raw)} chars...", file=sys.stderr)
    decoder = json.JSONDecoder()
    data, _ = decoder.raw_decode(raw)
    items = data['items']
    print(f"Total records in file: {len(items)}", file=sys.stderr)
    return items


def flush_batch(cur, conn, batch):
    if not batch:
        return
    buf = io.StringIO()
    for row in batch:
        escaped = []
        for val in row:
            if val is None:
                escaped.append('\\N')
            else:
                s = str(val).replace('\\', '\\\\').replace('\t', '\\t') \
                            .replace('\n', '\\n').replace('\r', '\\r')
                escaped.append(s)
        buf.write('\t'.join(escaped) + '\n')
    buf.seek(0)
    cur.copy_from(buf, 'arma_arrested_assets', columns=COLUMNS, null='\\N')
    conn.commit()


def main():
    args = parse_args()
    items = parse_json(args.input)

    conn = psycopg2.connect(
        host=args.db_host, port=args.db_port,
        dbname=args.db_name, user=args.db_user, password=args.db_password
    )
    conn.autocommit = False
    cur = conn.cursor()

    # Create table
    cur.execute(DDL)
    cur.execute("TRUNCATE arma_arrested_assets;")
    conn.commit()

    count = 0
    skipped = 0
    dupes = 0
    batch = []
    seen_ids = set()

    for item in items:
        raw_date = item.get('decisiondate', '')
        pg_date = None

        if raw_date and '.' in raw_date:
            parts = raw_date.split('.')
            if len(parts) == 3:
                try:
                    year = int(parts[2])
                    if year < args.min_year:
                        skipped += 1
                        continue
                    pg_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                except (ValueError, IndexError):
                    pass

        rid = item.get('id')
        if rid in seen_ids:
            dupes += 1
            continue
        seen_ids.add(rid)

        batch.append((
            rid,
            item.get('description'),
            item.get('props'),
            item.get('dectypename'),
            item.get('docnum'),
            pg_date,
            item.get('numerdr'),
            item.get('props_1'),
            raw_date,
        ))
        count += 1

        if len(batch) >= BATCH_SIZE:
            flush_batch(cur, conn, batch)
            batch = []
            print(f"  Imported {count}...", file=sys.stderr)

    flush_batch(cur, conn, batch)
    print(f"\nImported: {count}, skipped: {skipped} (before {args.min_year}), duplicates: {dupes}",
          file=sys.stderr)

    # Create indexes
    print("Creating indexes...", file=sys.stderr)
    for idx_sql in INDEXES:
        cur.execute(idx_sql)
    conn.commit()

    # Summary
    cur.execute("SELECT count(*) FROM arma_arrested_assets;")
    print(f"Total rows: {cur.fetchone()[0]}", file=sys.stderr)
    cur.execute("SELECT min(decisiondate), max(decisiondate) FROM arma_arrested_assets;")
    mn, mx = cur.fetchone()
    print(f"Date range: {mn} — {mx}", file=sys.stderr)
    cur.execute("""
        SELECT extract(year from decisiondate)::int AS y, count(*)
        FROM arma_arrested_assets
        WHERE decisiondate IS NOT NULL
        GROUP BY y ORDER BY y;
    """)
    for year, cnt in cur.fetchall():
        print(f"  {year}: {cnt}", file=sys.stderr)

    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
