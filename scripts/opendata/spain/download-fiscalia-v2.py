#!/usr/bin/env python3
"""
Spanish Fiscalía General del Estado downloader v2.
Scrapes BOE pagination correctly (accion=Mas&id_busqueda=...-offset-limit),
extracts FIS-{type}-{year}-{num} IDs, downloads HTML, parses, inserts to spain_fiscalia.

Usage:
    PG_CONTAINER=secondlayer-postgres-prod PGDB=secondlayer_prod \
    python3 download-fiscalia-v2.py
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import time
import logging
from pathlib import Path

import aiohttp

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE = "https://www.boe.es"
DOC_URL = f"{BASE}/buscar/doc.php"
SEARCH_URL = f"{BASE}/buscar/fiscalia.php"
DATA_DIR = Path(os.environ.get("DATA_DIR", "/tmp/fiscalia"))
CONTENT_DIR = DATA_DIR / "content"
CONTAINER = os.environ.get("PG_CONTAINER", "secondlayer-postgres-prod")
PGUSER = os.environ.get("PGUSER", "secondlayer")
PGDB = os.environ.get("PGDB", "secondlayer_prod")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
TIMEOUT = aiohttp.ClientTimeout(total=60)
THREADS = 8

# Letter prefixes — only C (Circular) and I (Instrucción) actually exist; Q (Consulta) returns 404
TYPE_LABELS = {"C": "Circular", "I": "Instruccion"}


async def scrape_index(session: aiohttp.ClientSession) -> list[str]:
    """Walk pagination for each type, collect FIS-* IDs."""
    all_ids = set()
    for type_letter in TYPE_LABELS:
        log.info(f"Scraping type={type_letter}")
        params = f"campo%5B0%5D=TIPO.ID&dato%5B0%5D=&accion=Buscar"
        # First page uses TIPO.ID with single letter dato
        first_url = f"{SEARCH_URL}?campo%5B0%5D=TIPO.ID&dato%5B0%5D={type_letter}&accion=Buscar"
        async with session.get(first_url, timeout=TIMEOUT) as r:
            html = await r.text()
        ids = set(re.findall(r"FIS-[A-Z]-\d+-\d+", html))
        all_ids |= ids
        log.info(f"  page 1: {len(ids)} ids; total so far: {len(all_ids)}")

        # Extract id_busqueda token for pagination
        m = re.search(r"id_busqueda=([A-Za-z0-9+/=]+)", html)
        if not m:
            continue
        busq = m.group(1)
        offset = 50
        page = 2
        while True:
            url = f"{SEARCH_URL}?accion=Mas&id_busqueda={busq}-{offset}-50"
            async with session.get(url, timeout=TIMEOUT) as r:
                html = await r.text()
            new_ids = set(re.findall(r"FIS-[A-Z]-\d+-\d+", html)) - all_ids
            if not new_ids:
                break
            all_ids |= new_ids
            log.info(f"  page {page} (offset {offset}): +{len(new_ids)} ids; total: {len(all_ids)}")
            offset += 50
            page += 1
            if page > 50:  # sanity cap
                break
    return sorted(all_ids)


async def download_one(session, doc_id: str, sem: asyncio.Semaphore, stats: dict):
    path = CONTENT_DIR / f"{doc_id}.html"
    if path.exists() and path.stat().st_size > 5000:
        stats["skipped"] += 1
        return
    async with sem:
        url = f"{DOC_URL}?id={doc_id}"
        for attempt in range(3):
            try:
                async with session.get(url, allow_redirects=True, timeout=TIMEOUT) as r:
                    text = await r.text()
                    if r.url.path.endswith("documentNotFound.php"):
                        stats["not_found"] += 1
                        return
                    if "textoxslt" not in text or len(text) < 5000:
                        stats["empty"] += 1
                        return
                    path.write_text(text, encoding="utf-8")
                    stats["downloaded"] += 1
                    return
            except Exception:
                await asyncio.sleep(2 * (attempt + 1))
        stats["failed"] += 1


def parse_html(html: str, doc_id: str) -> dict:
    """Extract titulo, tipo, fecha, full_text from BOE HTML."""
    type_letter = doc_id.split("-")[1]
    tipo = TYPE_LABELS.get(type_letter, type_letter)

    # Title from <title> tag or <h3 class="documento-tit">
    m = re.search(r"<h[1-6][^>]*class=\"documento-tit\"[^>]*>(.*?)</h", html, re.DOTALL)
    titulo = m.group(1).strip() if m else ""
    if not titulo:
        m = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
        titulo = m.group(1).strip() if m else doc_id
    titulo = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", titulo))[:1000]

    # Date: id format FIS-X-YYYY-NNNNN, default to YYYY-01-01
    fecha = None
    parts = doc_id.split("-")
    if len(parts) >= 3 and parts[2].isdigit():
        fecha = f"{parts[2]}-01-01"
    # Try to find more precise fecha in metadata
    m = re.search(r"Fecha de publicaci[óo]n:\s*</[^>]+>\s*<[^>]+>([0-9/]+)", html)
    if m:
        try:
            d, mo, y = m.group(1).split("/")
            fecha = f"{y}-{mo}-{d}"
        except Exception:
            pass

    # Body: extract text from id="textoxslt"
    body = ""
    m = re.search(r'<div[^>]*id="textoxslt"[^>]*>(.*?)</div>\s*(?:<div|</div>\s*</div>)', html, re.DOTALL)
    if m:
        body = m.group(1)
    body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.DOTALL)
    body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.DOTALL)
    body = re.sub(r"<[^>]+>", " ", body)
    body = body.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
    body = re.sub(r"\s+", " ", body).strip()

    return {"id": doc_id, "tipo": tipo, "titulo": titulo, "fecha": fecha, "full_text": body}


def import_to_db(records: list[dict]):
    """Bulk insert via psql COPY."""
    log.info(f"Importing {len(records)} records to {CONTAINER}/{PGDB}...")
    # COPY from stdin: id\ttipo\ttitulo\tfecha\tfull_text\tmetadata
    lines = []
    for r in records:
        def clean(v):
            if v is None or v == "":
                return r"\N"
            return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")
        meta = json.dumps({"source": "boe_fiscalia"}, ensure_ascii=False)
        lines.append(f"{clean(r['id'])}\t{clean(r['tipo'])}\t{clean(r['titulo'])}\t{clean(r['fecha'])}\t{clean(r['full_text'])}\t{clean(meta)}")
    payload = "\n".join(lines) + "\n"

    # Stage to a temp table, then upsert
    sql = """
BEGIN;
CREATE TEMP TABLE _stage_fiscalia (id TEXT, tipo TEXT, titulo TEXT, fecha DATE, full_text TEXT, metadata_json JSONB) ON COMMIT DROP;
COPY _stage_fiscalia FROM STDIN WITH (FORMAT text, NULL '\\N');
"""
    upsert = """
INSERT INTO spain_fiscalia (id, tipo, titulo, fecha, full_text, metadata_json)
SELECT id, tipo, titulo, fecha, full_text, metadata_json FROM _stage_fiscalia
ON CONFLICT (id) DO UPDATE SET
    tipo=EXCLUDED.tipo, titulo=EXCLUDED.titulo, fecha=EXCLUDED.fecha,
    full_text=EXCLUDED.full_text, metadata_json=EXCLUDED.metadata_json;
COMMIT;
"""
    full = sql + payload + "\\.\n" + upsert
    proc = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-v", "ON_ERROR_STOP=1"],
        input=full, capture_output=True, text=True
    )
    if proc.returncode != 0:
        log.error(f"psql failed: {proc.stderr[-2000:]}")
    else:
        # Print last few lines (INSERT count)
        for line in proc.stdout.strip().splitlines()[-5:]:
            log.info(f"  psql: {line}")


async def main():
    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    connector = aiohttp.TCPConnector(limit=THREADS, limit_per_host=THREADS)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": USER_AGENT},
    ) as session:
        log.info("Phase 1: Scrape index")
        ids = await scrape_index(session)
        log.info(f"Total unique IDs: {len(ids)}")

        if not ids:
            log.error("No IDs found — aborting")
            return

        log.info(f"Phase 2: Download {len(ids)} documents to {CONTENT_DIR}")
        sem = asyncio.Semaphore(THREADS)
        stats = {"downloaded": 0, "skipped": 0, "not_found": 0, "empty": 0, "failed": 0}
        tasks = [download_one(session, doc_id, sem, stats) for doc_id in ids]
        for i in range(0, len(tasks), 50):
            await asyncio.gather(*tasks[i:i+50])
            log.info(f"  progress {i+50}/{len(tasks)}: {stats}")

    log.info(f"Download done: {stats}")

    log.info("Phase 3: Parse + import to DB")
    records = []
    for path in CONTENT_DIR.glob("FIS-*.html"):
        try:
            html = path.read_text(encoding="utf-8")
            records.append(parse_html(html, path.stem))
        except Exception as e:
            log.warning(f"Parse fail {path.name}: {e}")
    log.info(f"Parsed {len(records)} records")

    if records:
        # Insert in batches of 200
        for i in range(0, len(records), 200):
            import_to_db(records[i:i+200])

    log.info("All done")


if __name__ == "__main__":
    asyncio.run(main())
