"""Postgres layer for the standalone `nipo_appeals` database.

Schema is owned by this script (like scripts/opendata/nipo/import_ndjson.py):
run with --create-schema on first use. All writes are idempotent upserts keyed
on decision_pdf_url, so full and incremental runs are safe to repeat.
"""

import json
import logging
from typing import Dict, Iterable, List, Set

import psycopg2
from psycopg2.extras import execute_values, Json

from .models import DecisionItem

log = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS nipo_appeal_decisions (
  id                  SERIAL PRIMARY KEY,
  source              TEXT NOT NULL CHECK (source IN ('nipo', 'ukrpatent')),
  section             TEXT NOT NULL CHECK (section IN ('tm', 'inventions', 'well_known')),
  object_type         TEXT,          -- 'tm' | 'invention' | 'utility_model' | 'well_known_tm'
  object_title        TEXT NOT NULL,
  result              TEXT CHECK (result IN ('granted', 'refused', 'partial')),
  result_source       TEXT,          -- 'marker' (listing) | 'pdf' (operative part)
  order_number        TEXT,
  order_date          DATE,
  decision_date       DATE,
  app_number          TEXT,
  appellant           TEXT,
  parties             JSONB,
  order_pdf_url       TEXT,
  decision_pdf_url    TEXT UNIQUE NOT NULL,
  annex_url           TEXT,
  image_url           TEXT,
  order_object_key    TEXT,
  decision_object_key TEXT,
  image_object_key    TEXT,
  order_text          TEXT,
  decision_text       TEXT,
  raw                 JSONB,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(object_title, '') || ' ' ||
      coalesce(appellant, '') || ' ' ||
      coalesce(app_number, '') || ' ' ||
      left(coalesce(decision_text, ''), 900000)
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_nipo_appeals_tsv           ON nipo_appeal_decisions USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_section       ON nipo_appeal_decisions(section);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_result        ON nipo_appeal_decisions(result);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_decision_date ON nipo_appeal_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_order_number  ON nipo_appeal_decisions(order_number);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_app_number    ON nipo_appeal_decisions(app_number);
CREATE INDEX IF NOT EXISTS idx_nipo_appeals_title_trgm    ON nipo_appeal_decisions USING gin (object_title gin_trgm_ops);

-- Реєстр добре відомих в Україні ТМ (XLSX perelik_dobre_vidomykh_TM_*.xlsx,
-- 245+ записів із 1995 року) — джерело істини для перевірки статусу знака.
CREATE TABLE IF NOT EXISTS nipo_well_known_tms (
  id                SERIAL PRIMARY KEY,
  tm_name           TEXT NOT NULL,
  owner             TEXT,
  applicant         TEXT,
  app_number        TEXT,
  app_date          DATE,
  doc_number        TEXT,
  recognition_date  DATE,          -- дата охоронного документа = дата, з якої знак добре відомий
  nice_classes      TEXT,
  representative    TEXT,
  publication_441   TEXT,
  source_file       TEXT,
  decision_id       INTEGER REFERENCES nipo_appeal_decisions(id) ON DELETE SET NULL,
  raw               JSONB,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tm_name, recognition_date)
);

CREATE INDEX IF NOT EXISTS idx_nipo_wktm_name_trgm   ON nipo_well_known_tms USING gin (tm_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nipo_wktm_recognition ON nipo_well_known_tms(recognition_date);
"""

UPSERT_COLUMNS = [
    "source", "section", "object_type", "object_title", "result", "result_source",
    "order_number", "order_date", "decision_date", "app_number", "appellant", "parties",
    "order_pdf_url", "decision_pdf_url", "annex_url", "image_url",
    "order_object_key", "decision_object_key", "image_object_key",
    "order_text", "decision_text", "raw",
]

UPSERT_SQL = f"""
INSERT INTO nipo_appeal_decisions ({', '.join(UPSERT_COLUMNS)})
VALUES %s
ON CONFLICT (decision_pdf_url) DO UPDATE SET
  {', '.join(f'{c} = EXCLUDED.{c}' for c in UPSERT_COLUMNS if c != 'decision_pdf_url')},
  updated_at = NOW()
"""


def connect(database_url: str):
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    return conn


def create_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()
    log.info("schema ensured")


def existing_decision_urls(conn) -> Set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT decision_pdf_url FROM nipo_appeal_decisions")
        return {r[0] for r in cur.fetchall()}


def _no_nul(v):
    """Strip NUL bytes recursively — Postgres string literals reject 0x00."""
    if isinstance(v, str):
        return v.replace("\x00", "")
    if isinstance(v, dict):
        return {k: _no_nul(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_no_nul(x) for x in v]
    return v


def upsert_decisions(conn, items: Iterable[DecisionItem]) -> int:
    rows = []
    for it in items:
        rows.append(tuple(
            Json(_no_nul(getattr(it, c))) if c in ("parties", "raw") else _no_nul(getattr(it, c))
            for c in UPSERT_COLUMNS
        ))
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, rows, page_size=200)
    conn.commit()
    return len(rows)


def upsert_well_known(conn, rows: List[dict]) -> int:
    if not rows:
        return 0
    # the XLSX contains repeated (tm_name, recognition_date) rows — dedupe inside the
    # batch (last wins), else ON CONFLICT DO UPDATE raises CardinalityViolation
    deduped = {(r.get("tm_name"), r.get("recognition_date")): r for r in rows}
    rows = list(deduped.values())
    cols = ["tm_name", "owner", "applicant", "app_number", "app_date", "doc_number",
            "recognition_date", "nice_classes", "representative", "publication_441",
            "source_file", "raw"]
    sql = f"""
    INSERT INTO nipo_well_known_tms ({', '.join(cols)})
    VALUES %s
    ON CONFLICT (tm_name, recognition_date) DO UPDATE SET
      {', '.join(f'{c} = EXCLUDED.{c}' for c in cols if c not in ('tm_name', 'recognition_date'))},
      updated_at = NOW()
    """
    values = [tuple(Json(r[c]) if c == "raw" else r.get(c) for c in cols) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, sql, values, page_size=200)
    conn.commit()
    return len(values)


def link_well_known_decisions(conn) -> int:
    """Best-effort link registry rows to Appeals Chamber decisions by TM name."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE nipo_well_known_tms w
            SET decision_id = d.id, updated_at = NOW()
            FROM nipo_appeal_decisions d
            WHERE w.decision_id IS NULL
              AND d.section = 'well_known'
              AND lower(d.object_title) = lower(w.tm_name)
        """)
        n = cur.rowcount
    conn.commit()
    return n


def stats(conn) -> Dict[str, int]:
    out: Dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT source || '/' || section, count(*)
            FROM nipo_appeal_decisions GROUP BY 1 ORDER BY 1
        """)
        for k, v in cur.fetchall():
            out[k] = v
        cur.execute("SELECT count(*) FROM nipo_well_known_tms")
        out["well_known_registry"] = cur.fetchone()[0]
    return out
