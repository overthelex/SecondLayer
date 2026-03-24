#!/usr/bin/env python3
"""
BOE (Boletín Oficial del Estado) bulk downloader.
Downloads consolidated Spanish legislation via the open BOE API.
Runs 3 concurrent threads.

Usage: python3 download-boe.py
Env: DATABASE_URL (postgres connection string)
"""

import os
import sys
import json
import time
import logging
import requests
import psycopg2
from psycopg2.extras import execute_values, Json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(threadName)s] %(levelname)s %(message)s')
log = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', '')
BOE_API = 'https://www.boe.es/datosabiertos/api'
HEADERS_JSON = {'Accept': 'application/json'}
THREADS = 5
BATCH_SIZE = 50


def get_db():
    return psycopg2.connect(DB_URL)


def fetch_legislation_list(offset=0, limit=50):
    """Fetch a page of consolidated legislation metadata."""
    url = f'{BOE_API}/legislacion-consolidada'
    params = {'offset': offset, 'limit': limit}
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS_JSON, params=params, timeout=30)
            if r.status_code == 200:
                data = r.json()
                return data.get('data', {})
            log.warning(f'BOE list HTTP {r.status_code} offset={offset}')
        except Exception as e:
            log.warning(f'BOE list error offset={offset} attempt={attempt}: {e}')
            time.sleep(2 ** attempt)
    return None


def fetch_legislation_detail(boe_id):
    """Fetch metadata for a single legislation item."""
    url = f'{BOE_API}/legislacion-consolidada/id/{boe_id}/metadatos'
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS_JSON, timeout=30)
            if r.status_code == 200:
                return r.json().get('data', {})
        except Exception as e:
            log.warning(f'Detail {boe_id} attempt={attempt}: {e}')
            time.sleep(1)
    return None


def fetch_legislation_text(boe_id):
    """Fetch the full consolidated text (HTML from BOE website)."""
    url = f'https://www.boe.es/buscar/act.php?id={boe_id}'
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=30, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; LexAI/1.0; +https://legal.org.ua)',
            })
            if r.status_code == 200:
                return r.text[:500000]  # cap at 500K chars
        except Exception as e:
            log.warning(f'Text {boe_id} attempt={attempt}: {e}')
            time.sleep(1)
    return None


def upsert_legislation(conn, items):
    """Upsert a batch of legislation items."""
    if not items:
        return 0
    sql = """
        INSERT INTO spain_boe_legislation
            (boe_id, title, rango, departamento, ambito,
             fecha_disposicion, fecha_publicacion, fecha_vigencia,
             numero_oficial, estado_consolidacion, vigencia_agotada,
             estatus_derogacion, url_eli, url_html, metadata, updated_at)
        VALUES %s
        ON CONFLICT (boe_id) DO UPDATE SET
            title = EXCLUDED.title,
            rango = EXCLUDED.rango,
            departamento = EXCLUDED.departamento,
            estado_consolidacion = EXCLUDED.estado_consolidacion,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
    """
    rows = []
    for item in items:
        def text_or_str(val):
            if isinstance(val, dict):
                return val.get('texto', '')
            return val or ''
        rows.append((
            item.get('identificador', ''),
            item.get('titulo', ''),
            text_or_str(item.get('rango')),
            text_or_str(item.get('departamento')),
            text_or_str(item.get('ambito')),
            parse_date(item.get('fecha_disposicion')),
            parse_date(item.get('fecha_publicacion')),
            parse_date(item.get('fecha_vigencia')),
            item.get('numero_oficial', ''),
            text_or_str(item.get('estado_consolidacion')),
            item.get('vigencia_agotada', 'N') == 'S',
            item.get('estatus_derogacion', ''),
            item.get('url_eli', ''),
            item.get('url_html_consolidada', ''),
            Json(item),
            datetime.now(),
        ))
    with conn.cursor() as cur:
        execute_values(cur, sql, rows, template="""(
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )""")
    conn.commit()
    return len(rows)


def parse_date(d):
    if not d:
        return None
    try:
        return datetime.strptime(d[:10], '%Y-%m-%d').date() if '-' in str(d) else datetime.strptime(str(d)[:8], '%Y%m%d').date()
    except:
        return None


def download_text_batch(boe_ids):
    """Download full text for a batch of BOE IDs and update DB."""
    conn = get_db()
    count = 0
    for boe_id in boe_ids:
        text = fetch_legislation_text(boe_id)
        if text:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE spain_boe_legislation SET full_text = %s, updated_at = NOW() WHERE boe_id = %s",
                    (text, boe_id)
                )
            conn.commit()
            count += 1
        time.sleep(0.3)  # be polite
    conn.close()
    return count


def main():
    if not DB_URL:
        print("Set DATABASE_URL env var")
        sys.exit(1)

    conn = get_db()
    log.info("=== BOE Consolidated Legislation Download ===")

    # Phase 1: Download all metadata
    offset = 0
    total_inserted = 0
    while True:
        data = fetch_legislation_list(offset=offset, limit=BATCH_SIZE)
        if data is None:
            log.info(f"No more data at offset={offset}")
            break
        # BOE API returns data as a direct array
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and 'items' in data:
            items = data['items']
        else:
            log.info(f"Unexpected data format at offset={offset}: {type(data)}")
            break

        if not items:
            break

        try:
            count = upsert_legislation(conn, items)
        except Exception as e:
            log.warning(f"DB error at offset {offset}: {e}, reconnecting")
            try:
                conn.close()
            except:
                pass
            conn = get_db()
            count = upsert_legislation(conn, items)
        total_inserted += count
        log.info(f"Offset {offset}: upserted {count} items (total: {total_inserted})")
        offset += BATCH_SIZE
        time.sleep(0.2)

    log.info(f"Phase 1 complete: {total_inserted} legislation items")

    # Phase 2: Download full text in parallel (3 threads)
    with conn.cursor() as cur:
        cur.execute("SELECT boe_id FROM spain_boe_legislation WHERE full_text IS NULL ORDER BY fecha_publicacion DESC")
        ids_to_fetch = [r[0] for r in cur.fetchall()]
    conn.close()

    if ids_to_fetch:
        log.info(f"Phase 2: downloading full text for {len(ids_to_fetch)} items with {THREADS} threads")
        chunk_size = len(ids_to_fetch) // THREADS + 1
        chunks = [ids_to_fetch[i:i+chunk_size] for i in range(0, len(ids_to_fetch), chunk_size)]

        with ThreadPoolExecutor(max_workers=THREADS, thread_name_prefix='boe') as pool:
            futures = [pool.submit(download_text_batch, chunk) for chunk in chunks]
            for f in as_completed(futures):
                log.info(f"Thread done: {f.result()} texts downloaded")

    log.info("=== BOE download complete ===")


if __name__ == '__main__':
    main()
