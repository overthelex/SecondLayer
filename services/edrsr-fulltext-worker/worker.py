#!/usr/bin/env python3
"""
EDRSR Fulltext Worker — long-running service that continuously finds
documents missing full_text in edrsr_fulltext and downloads them from
od.reyestr.court.gov.ua.

Runs inside Docker on prod, connects directly to PostgreSQL.
"""

import asyncio
import json
import logging
import os
import re
import signal
import sys
import time
from datetime import date, datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

import aiohttp
import asyncpg

# ── Config ──────────────────────────────────────────────────────────────────

POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres-prod")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_USER = os.environ.get("POSTGRES_USER", "secondlayer")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "secondlayer_prod")

HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "3011"))

# Download settings
WORKERS = int(os.environ.get("WORKERS", "50"))
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "2000"))
BATCH_INSERT_SIZE = int(os.environ.get("BATCH_INSERT_SIZE", "500"))
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "3"))

# Source IPs for multi-IP download (comma-separated private IPs)
# Empty = use default route (single IP)
SOURCE_IPS = [ip.strip() for ip in os.environ.get("SOURCE_IPS", "").split(",") if ip.strip()]
WORKERS_PER_IP = int(os.environ.get("WORKERS_PER_IP", "15"))

# How long to sleep when no work found across all years (seconds)
IDLE_SLEEP = int(os.environ.get("IDLE_SLEEP", "3600"))
# How long to sleep between year scans (seconds)
YEAR_SLEEP = int(os.environ.get("YEAR_SLEEP", "5"))
# Years to scan (newest first for freshest data priority)
YEAR_START = int(os.environ.get("YEAR_START", "2005"))
YEAR_END = int(os.environ.get("YEAR_END", str(datetime.now().year)))

# ── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("edrsr-fulltext-worker")

# ── Health tracking ─────────────────────────────────────────────────────────

_health = {
    "status": "starting",
    "started_at": datetime.now().isoformat(),
    "last_cycle": None,
    "total_imported": 0,
    "total_failed": 0,
    "current_year": None,
    "missing_by_year": {},
}
_shutdown = asyncio.Event()


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health" or self.path == "/health/ready":
            status = 200 if _health["status"] in ("running", "idle") else 503
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(_health, default=str).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs


def start_health_server():
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    t = Thread(target=server.serve_forever, daemon=True)
    t.start()
    log.info("Health server listening on :%d", HEALTH_PORT)
    return server


# ── RTF / HTML → plaintext ─────────────────────────────────────────────────

def decode_win1251_byte(match):
    byte_val = int(match.group(1), 16)
    if byte_val > 127:
        try:
            return bytes([byte_val]).decode("windows-1251")
        except Exception:
            return chr(byte_val)
    return chr(byte_val)


def decode_unicode(match):
    code = int(match.group(1))
    return chr(code) if 0 <= code <= 0x10FFFF else ""


def remove_nested_group(text, keyword):
    idx = text.find("{\\"+keyword)
    while idx != -1:
        depth = 0
        end = idx
        for i in range(idx, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        text = text[:idx] + text[end:]
        idx = text.find("{\\"+keyword)
    return text


def html_to_text(raw: bytes) -> str | None:
    for enc in ["windows-1251", "utf-8", "latin1"]:
        try:
            html = raw.decode(enc)
            if re.search(r"[а-яіїєґА-ЯІЇЄҐ]", html):
                break
        except Exception:
            continue
    else:
        html = raw.decode("windows-1251", errors="replace")
    text = re.sub(r"<head[^>]*>.*?</head>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?p[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?div[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?tr[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?td[^>]*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    return text if len(text) >= 100 else None


def rtf_bytes_to_text(raw: bytes) -> str | None:
    if len(raw) > 50_000_000 or len(raw) < 50:
        return None
    if raw[:5] == b"<html" or raw[:14] == b"<!DOCTYPE html" or raw[:6] == b"<HTML ":
        return html_to_text(raw)
    text = raw.decode("latin1")
    if not text.startswith("{\\rtf"):
        if "<body" in text.lower() or "<p " in text.lower():
            return html_to_text(raw)
        return None
    for kw in ["fonttbl", "colortbl", "stylesheet", "info", "*\\"]:
        text = remove_nested_group(text, kw)
    text = re.sub(r"\\rtf1[^\\{]*", "", text)
    text = re.sub(r"\\par\b", "\n", text)
    text = re.sub(r"\\line\b", "\n", text)
    text = re.sub(r"\\tab\b", "\t", text)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", decode_win1251_byte, text)
    text = re.sub(r"\\u(\d+)\??", decode_unicode, text)
    text = re.sub(r"\\[a-zA-Z]+-?\d*\s?", "", text)
    text = text.replace("{", "").replace("}", "")
    text = text.replace("\x00", "")
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    text = text.encode("utf-8", errors="replace").decode("utf-8")
    return text if len(text) >= 100 else None


# ── Download logic ──────────────────────────────────────────────────────────

async def download_one(session, doc_id, adj_year, url, semaphore):
    """Returns (doc_id, adj_year, text) on success, or (doc_id, None, reason) on permanent failure."""
    async with semaphore:
        for attempt in range(MAX_RETRIES):
            try:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
                ) as resp:
                    if resp.status == 200:
                        raw = await resp.read()
                        text = rtf_bytes_to_text(raw)
                        if text:
                            return (doc_id, adj_year, text)
                        return (doc_id, None, "empty_rtf")
                    elif resp.status == 404:
                        return (doc_id, None, "404")
                    elif resp.status == 429:
                        await asyncio.sleep(10 * (attempt + 1))
                    elif resp.status >= 500:
                        await asyncio.sleep(3 * (attempt + 1))
                    else:
                        return (doc_id, None, f"http_{resp.status}")
            except (asyncio.TimeoutError, aiohttp.ClientError) as e:
                if attempt == MAX_RETRIES - 1:
                    return (doc_id, None, f"error:{type(e).__name__}")
                await asyncio.sleep(3 * (attempt + 1))
    return (doc_id, None, "max_retries")


async def download_chunk(docs: list[tuple], workers: int) -> tuple[list[tuple], list[tuple]]:
    """Returns (successes, failures) where successes are (doc_id, adj_year, text)
    and failures are (doc_id, reason).
    When SOURCE_IPS is configured, distributes downloads across multiple source IPs."""
    successes = []
    failures = []

    if SOURCE_IPS:
        # Multi-IP mode: create a session per IP, distribute docs round-robin
        sessions = []
        semaphores = []
        for ip in SOURCE_IPS:
            connector = aiohttp.TCPConnector(
                limit=WORKERS_PER_IP, limit_per_host=WORKERS_PER_IP,
                ttl_dns_cache=300, local_addr=(ip, 0),
            )
            sessions.append(aiohttp.ClientSession(connector=connector))
            semaphores.append(asyncio.Semaphore(WORKERS_PER_IP))

        try:
            tasks = []
            for i, (d, y, u) in enumerate(docs):
                idx = i % len(SOURCE_IPS)
                tasks.append(download_one(sessions[idx], d, y, u, semaphores[idx]))

            for coro in asyncio.as_completed(tasks):
                result = await coro
                if result and result[1] is not None:
                    successes.append(result)
                elif result:
                    failures.append((result[0], result[2]))
        finally:
            for s in sessions:
                await s.close()
    else:
        # Single-IP mode
        semaphore = asyncio.Semaphore(workers)
        connector = aiohttp.TCPConnector(
            limit=workers, limit_per_host=workers, ttl_dns_cache=300
        )
        async with aiohttp.ClientSession(connector=connector) as session:
            tasks = [download_one(session, d, y, u, semaphore) for d, y, u in docs]
            for coro in asyncio.as_completed(tasks):
                result = await coro
                if result and result[1] is not None:
                    successes.append(result)
                elif result:
                    failures.append((result[0], result[2]))

    return successes, failures


# ── DB operations ───────────────────────────────────────────────────────────

async def ensure_failed_table(pool: asyncpg.Pool):
    """Create tracking table for permanently failed downloads (404, empty RTF, etc.)."""
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS edrsr_fulltext_failed (
            doc_id BIGINT PRIMARY KEY,
            reason TEXT,
            created_at TIMESTAMP DEFAULT now()
        )
    """)
    log.info("Ensured edrsr_fulltext_failed table exists.")


async def create_pool() -> asyncpg.Pool:
    for attempt in range(30):
        try:
            pool = await asyncpg.create_pool(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                database=POSTGRES_DB,
                min_size=2,
                max_size=10,
                command_timeout=1200,
            )
            return pool
        except (asyncpg.CannotConnectNowError, OSError, ConnectionRefusedError) as e:
            wait = min(10 * (attempt + 1), 60)
            log.warning("DB not ready (attempt %d/30): %s. Retrying in %ds...", attempt + 1, e, wait)
            await asyncio.sleep(wait)
    raise RuntimeError("Could not connect to PostgreSQL after 30 attempts")


async def get_missing_batch(pool: asyncpg.Pool, year: int, limit: int, after_doc_id: int = 0) -> tuple[list[tuple], int]:
    """Fetch a batch of doc_ids missing fulltext using two lightweight queries
    instead of a single heavy anti-join.
    Returns (list of (doc_id, adj_year, url), last_doc_id_checked)."""

    # Step 1: Get candidate doc_ids (fast — uses date index + PK order)
    # Fetch more than limit because some will already have fulltext
    fetch_size = limit * 3
    candidates_sql = """
        SELECT d.doc_id, extract(year from d.adjudication_date)::int, d.doc_url
        FROM edrsr_documents d
        WHERE d.adjudication_date >= $1
          AND d.adjudication_date < $2
          AND d.doc_url IS NOT NULL AND d.doc_url != ''
          AND d.doc_id > $3
        ORDER BY d.doc_id
        LIMIT $4
    """
    rows = await pool.fetch(
        candidates_sql, date(year, 1, 1), date(year + 1, 1, 1), after_doc_id, fetch_size
    )
    if not rows:
        return [], after_doc_id

    candidates = [(r[0], r[1], r[2]) for r in rows]
    last_doc_id = candidates[-1][0]

    # Step 2: Check which doc_ids already have fulltext or are known-failed (fast — PK lookup)
    doc_ids = [c[0] for c in candidates]
    existing_sql = "SELECT doc_id FROM edrsr_fulltext WHERE doc_id = ANY($1::bigint[])"
    failed_sql = "SELECT doc_id FROM edrsr_fulltext_failed WHERE doc_id = ANY($1::bigint[])"
    existing_rows = await pool.fetch(existing_sql, doc_ids)
    try:
        failed_rows = await pool.fetch(failed_sql, doc_ids)
    except asyncpg.UndefinedTableError:
        failed_rows = []
    exclude_set = {r[0] for r in existing_rows} | {r[0] for r in failed_rows}

    # Filter to only missing ones
    missing = [(d, y, u) for d, y, u in candidates if d not in exclude_set]

    return missing[:limit], last_doc_id


async def insert_batch(pool: asyncpg.Pool, rows: list[tuple]) -> int:
    """Insert batch of (doc_id, adj_year, full_text) into edrsr_fulltext.
    Uses INSERT ... WHERE NOT EXISTS for partitioned table compatibility."""
    if not rows:
        return 0
    inserted = 0
    for i in range(0, len(rows), BATCH_INSERT_SIZE):
        batch = rows[i : i + BATCH_INSERT_SIZE]
        # Insert one-by-one with WHERE NOT EXISTS (partitioned tables don't support ON CONFLICT on parent)
        for doc_id, adj_year, text in batch:
            try:
                result = await pool.execute(
                    """INSERT INTO edrsr_fulltext (doc_id, adj_year, full_text)
                       SELECT $1, $2, $3
                       WHERE NOT EXISTS (SELECT 1 FROM edrsr_fulltext WHERE doc_id = $1)""",
                    doc_id, adj_year, text,
                )
                if result.endswith("1"):
                    inserted += 1
            except Exception as e:
                log.error("Insert error doc_id=%s: %s", doc_id, e)
    return inserted


async def save_failures(pool: asyncpg.Pool, failures: list[tuple]):
    """Save permanently failed doc_ids to edrsr_fulltext_failed."""
    if not failures:
        return
    for doc_id, reason in failures:
        try:
            await pool.execute(
                """INSERT INTO edrsr_fulltext_failed (doc_id, reason)
                   VALUES ($1, $2) ON CONFLICT (doc_id) DO NOTHING""",
                doc_id, reason[:100] if reason else "unknown",
            )
        except Exception:
            pass  # edrsr_fulltext_failed is a regular table, shouldn't fail


# ── Main loop ───────────────────────────────────────────────────────────────

async def process_year(pool: asyncpg.Pool, year: int) -> int:
    """Process one year using cursor-based pagination. Returns total imported count."""
    _health["current_year"] = year

    total_imported = 0
    total_downloaded = 0
    total_failed = 0
    total_scanned = 0
    after_doc_id = 0
    start = time.time()

    while not _shutdown.is_set():
        prev_doc_id = after_doc_id
        try:
            missing, after_doc_id = await get_missing_batch(pool, year, CHUNK_SIZE, after_doc_id)
        except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError) as e:
            log.warning("Year %d: DB connection error during batch fetch: %s", year, e)
            raise  # Will be caught by main_loop's try/except

        if after_doc_id == prev_doc_id:
            # No more candidates for this year
            break

        if not missing:
            # All candidates in this batch already have fulltext, continue scanning
            continue

        if total_downloaded == 0:
            log.info("Year %d: found %d missing documents, starting downloads...", year, len(missing))
            # Log sample URLs for first batch
            for d, y, u in missing[:3]:
                log.info("  Sample: doc_id=%s url=%s", d, u[:100])

        converted, failed_list = await download_chunk(missing, WORKERS)
        failed = len(failed_list)
        total_downloaded += len(missing)
        total_failed += failed

        if converted:
            inserted = await insert_batch(pool, converted)
            total_imported += inserted
            _health["total_imported"] += inserted

        # Save permanently failed doc_ids so we don't retry them
        if failed_list:
            await save_failures(pool, failed_list)

        _health["total_failed"] += failed

        elapsed = time.time() - start
        rate = total_imported / elapsed if elapsed > 0 else 0
        log.info(
            "Year %d: +%d imported (total %s) | %d downloaded | %d failed | %.0f/s",
            year,
            len(converted),
            f"{total_imported:,}",
            total_downloaded,
            total_failed,
            rate,
        )

        # Brief pause between chunks to avoid overwhelming the EDRSR server
        await asyncio.sleep(1)

    if total_imported > 0:
        log.info(
            "Year %d done: %s imported, %d failed in %.0fs",
            year, f"{total_imported:,}", total_failed, time.time() - start,
        )

    return total_imported


async def main_loop():
    while not _shutdown.is_set():
        pool = None
        try:
            log.info("Connecting to PostgreSQL %s:%d/%s...", POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB)
            pool = await create_pool()
            await ensure_failed_table(pool)
            log.info("Connected. Starting fulltext worker loop.")
            _health["status"] = "running"

            while not _shutdown.is_set():
                cycle_start = time.time()
                total_work = 0

                # Scan years newest first
                for year in range(YEAR_END, YEAR_START - 1, -1):
                    if _shutdown.is_set():
                        break
                    imported = await process_year(pool, year)
                    total_work += imported
                    if imported > 0:
                        await asyncio.sleep(YEAR_SLEEP)

                _health["last_cycle"] = datetime.now().isoformat()
                _health["current_year"] = None

                if total_work == 0:
                    _health["status"] = "idle"
                    log.info(
                        "No missing fulltext found. Sleeping %ds before next scan.",
                        IDLE_SLEEP,
                    )
                    try:
                        await asyncio.wait_for(_shutdown.wait(), timeout=IDLE_SLEEP)
                    except asyncio.TimeoutError:
                        pass
                    _health["status"] = "running"
                else:
                    log.info(
                        "Cycle complete: %s total imported in %.0fs. Starting next cycle.",
                        f"{total_work:,}", time.time() - cycle_start,
                    )

        except Exception as e:
            _health["status"] = "error"
            log.error("Fatal error in main loop: %s. Reconnecting in 30s...", e)
            await asyncio.sleep(30)
        finally:
            if pool:
                try:
                    await pool.close()
                except Exception:
                    pass

    log.info("Shutting down...")


def handle_signal(sig, frame):
    log.info("Received signal %s, shutting down gracefully...", sig)
    _shutdown.set()


def main():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    start_health_server()

    log.info("=" * 60)
    log.info("  EDRSR Fulltext Worker")
    if SOURCE_IPS:
        log.info("  IPs: %d (%s) | %d workers/IP | Chunk: %d",
                 len(SOURCE_IPS), ", ".join(SOURCE_IPS), WORKERS_PER_IP, CHUNK_SIZE)
    else:
        log.info("  Years: %d-%d | Workers: %d | Chunk: %d", YEAR_START, YEAR_END, WORKERS, CHUNK_SIZE)
    log.info("  DB: %s@%s:%d/%s", POSTGRES_USER, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB)
    log.info("=" * 60)

    asyncio.run(main_loop())


if __name__ == "__main__":
    main()
