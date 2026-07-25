"""Database connection helpers for CPT pipeline."""

import os
import psycopg2
from psycopg2.extras import RealDictCursor


MAIN_DB = {
    "host": os.environ.get("CPT_DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("CPT_DB_PORT", "5432")),
    "dbname": os.environ.get("CPT_DB_NAME", "secondlayer_local"),
    "user": os.environ.get("CPT_DB_USER", "secondlayer"),
    "password": os.environ.get("CPT_DB_PASSWORD", "local_dev_password"),
}

OPENREYESTR_DB = {
    "host": os.environ.get("CPT_OR_DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("CPT_OR_DB_PORT", "5435")),
    "dbname": os.environ.get("CPT_OR_DB_NAME", "openreyestr_local"),
    "user": os.environ.get("CPT_OR_DB_USER", "openreyestr"),
    "password": os.environ.get("CPT_OR_DB_PASSWORD", "openreyestr_dev_password"),
}

EDRSR_YEARS = list(range(2005, 2027))

JUSTICE_KINDS = {
    1: "civil",
    2: "criminal",
    3: "commercial",
    4: "administrative",
    5: "admin_offense",
}

JUDGMENT_FORMS = {
    1: "verdict",       # Вирок
    2: "resolution",    # Постанова
    3: "judgment",      # Рішення
    4: "ruling",        # Ухвала
    10: "order",        # Наказ
}


def get_connection(db_config=None, readonly=True):
    cfg = db_config or MAIN_DB
    conn = psycopg2.connect(**cfg)
    if readonly:
        conn.set_session(readonly=True, autocommit=True)
    return conn


def get_partition_count(conn, year):
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM edrsr_fulltext_p_{year}")
        return cur.fetchone()[0]
