#!/usr/bin/env python3
"""
Batch vectorization of ЦПК (justice_kind=1) court decisions.

Reads full texts from PostgreSQL (edrsr_fulltext + edrsr_documents),
generates embeddings via VoyageAI voyage-3.5,
upserts vectors to Qdrant edrsr_decisions collection.

Compatible with existing EdsrVectorizerService payload schema.

Usage:
    python3 vectorize-cpk-batch.py [--concurrency 35] [--batch-size 128] [--dry-run]

Estimated: ~33.7M docs, ~118M chunks, ~59.6B tokens, ~$3,576 @ voyage-3.5
"""

import argparse
import json
import logging
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Optional
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# ── Config ──────────────────────────────────────────────────────────────────

JUSTICE_KIND = 1  # ЦПК (Цивільне)
TOTAL_ESTIMATE = 33_700_000

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = os.environ.get("VOYAGEAI_EMBEDDING_MODEL", "voyage-3.5")

# Support multiple API keys for round-robin (doubles rate limits)
_voyage_keys = [k for k in [
    os.environ.get("VOYAGEAI_API_KEY", ""),
    os.environ.get("VOYAGEAI_API_KEY_2", ""),
] if k]
_voyage_key_idx = 0
_voyage_key_lock = Lock()

def get_next_voyage_key() -> str:
    global _voyage_key_idx
    with _voyage_key_lock:
        key = _voyage_keys[_voyage_key_idx % len(_voyage_keys)]
        _voyage_key_idx += 1
        return key

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
QDRANT_COLLECTION = "edrsr_decisions"

PG_CONNSTR = os.environ.get("DATABASE_URL", "")

# Chunking params (match edrsr-vectorizer-service.ts)
MAX_CHUNK_CHARS = 2048
CHUNK_OVERLAP_WORDS = 50
MIN_CHUNK_CHARS = 100

# ── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("vectorize-cpk")

# ── Progress tracker ────────────────────────────────────────────────────────

@dataclass
class Progress:
    total_docs: int = 0
    processed_docs: int = 0
    total_chunks: int = 0
    total_tokens: int = 0
    errors_429: int = 0
    errors_other: int = 0
    retries: int = 0
    skipped_existing: int = 0
    start_time: float = 0.0
    lock: Lock = None

    def __post_init__(self):
        self.lock = Lock()
        self.start_time = time.time()

    def add(self, docs=0, chunks=0, tokens=0, err429=0, err_other=0, retries=0, skipped=0):
        with self.lock:
            self.processed_docs += docs
            self.total_chunks += chunks
            self.total_tokens += tokens
            self.errors_429 += err429
            self.errors_other += err_other
            self.retries += retries
            self.skipped_existing += skipped

    def report(self):
        with self.lock:
            elapsed = time.time() - self.start_time
            rate = self.processed_docs / elapsed if elapsed > 0 else 0
            pct = (self.processed_docs / self.total_docs * 100) if self.total_docs > 0 else 0
            cost = self.total_tokens / 1_000_000 * 0.06
            eta_h = (self.total_docs - self.processed_docs) / rate / 3600 if rate > 0 else 0
            return (
                f"[{pct:5.1f}%] {self.processed_docs:,}/{self.total_docs:,} docs | "
                f"{self.total_chunks:,} chunks | "
                f"{self.total_tokens:,} tok (${cost:.2f}) | "
                f"{rate:.0f} docs/s | "
                f"ETA {eta_h:.1f}h | "
                f"429s: {self.errors_429} | errs: {self.errors_other} | "
                f"skip: {self.skipped_existing:,}"
            )

# ── Chunking (matches TS logic) ────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    chunks = []
    pos = 0
    while pos < len(text):
        end = pos + MAX_CHUNK_CHARS

        if end >= len(text):
            chunk = text[pos:].strip()
            if len(chunk) >= MIN_CHUNK_CHARS:
                chunks.append(chunk)
            break

        search_start = max(pos, end - 200)
        last_period = text.rfind(". ", search_start, end)
        if last_period > pos:
            end = last_period + 1

        chunk = text[pos:end].strip()
        if chunk:
            chunks.append(chunk)

        overlap_text = chunk.split()[-CHUNK_OVERLAP_WORDS:]
        overlap_str = " ".join(overlap_text)
        new_pos = end - len(overlap_str)
        if new_pos <= pos:
            new_pos = pos + MAX_CHUNK_CHARS // 2
        pos = new_pos

    return chunks if chunks else [text]

# ── VoyageAI embedding ─────────────────────────────────────────────────────

def _make_voyage_request(payload: bytes, api_key: str) -> Request:
    return Request(
        VOYAGE_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

def embed_texts(texts: list[str], max_retries: int = 5) -> tuple[list[list[float]], int]:
    payload = json.dumps({"input": texts, "model": VOYAGE_MODEL}).encode("utf-8")
    api_key = get_next_voyage_key()

    for attempt in range(max_retries):
        req = _make_voyage_request(payload, api_key)
        try:
            resp = urlopen(req, timeout=120)
            data = json.loads(resp.read())
            embeddings = [d["embedding"] for d in data["data"]]
            tokens = data.get("usage", {}).get("total_tokens", 0)
            return embeddings, tokens
        except HTTPError as e:
            if e.code == 429:
                api_key = get_next_voyage_key()
                wait = min(2 ** attempt * 2, 30)
                log.debug(f"429 rate limit, switching key, retry {attempt+1}/{max_retries} in {wait}s")
                time.sleep(wait)
                continue
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                api_key = get_next_voyage_key()
                time.sleep(2)
                continue
            raise

    raise RuntimeError(f"Failed to embed after {max_retries} retries")

# ── Qdrant upsert ──────────────────────────────────────��───────────────────

def qdrant_upsert(points: list[dict], max_retries: int = 3):
    url = f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points?wait=true"
    payload = json.dumps({"points": points}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if QDRANT_API_KEY:
        headers["api-key"] = QDRANT_API_KEY

    for attempt in range(max_retries):
        try:
            req = Request(url, data=payload, headers=headers, method="PUT")
            resp = urlopen(req, timeout=60)
            result = json.loads(resp.read())
            if result.get("status") != "ok":
                raise RuntimeError(f"Qdrant upsert failed: {result}")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise

def qdrant_scroll_doc_ids(batch_size: int = 1000) -> set[int]:
    log.info(f"Loading existing ЦПК doc_ids from Qdrant (justice_kind={JUSTICE_KIND})...")
    url = f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/scroll"
    headers = {"Content-Type": "application/json"}
    if QDRANT_API_KEY:
        headers["api-key"] = QDRANT_API_KEY

    doc_ids = set()
    offset = None

    while True:
        body = {
            "limit": batch_size,
            "with_payload": ["edrsr_doc_id"],
            "with_vector": False,
            "filter": {
                "must": [{"key": "justice_kind", "match": {"value": JUSTICE_KIND}}]
            },
        }
        if offset is not None:
            body["offset"] = offset

        req = Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
        resp = urlopen(req, timeout=30)
        data = json.loads(resp.read())
        points = data.get("result", {}).get("points", [])

        for p in points:
            doc_id = p.get("payload", {}).get("edrsr_doc_id")
            if doc_id is not None:
                doc_ids.add(int(doc_id))

        next_offset = data.get("result", {}).get("next_page_offset")
        if next_offset is None or not points:
            break
        offset = next_offset

    log.info(f"Found {len(doc_ids):,} already vectorized ЦПК doc_ids in Qdrant")
    return doc_ids

# ── PostgreSQL reader ───────────────────────────────────────────────────────

def pg_connect():
    import psycopg2
    conn = psycopg2.connect(PG_CONNSTR)
    conn.set_session(autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '120s'")
        cur.execute("SET work_mem = '64MB'")
    return conn

def pg_reconnect(conn):
    try:
        conn.close()
    except Exception:
        pass
    time.sleep(1)
    return pg_connect()

def pg_fetch_batch(conn, last_doc_id: int, batch_size: int) -> tuple[list[dict], int | None]:
    """Fetch next batch of ЦПК docs after last_doc_id.

    Uses index on (justice_kind, doc_id) for efficient cursor pagination.
    Fetches metadata first (lightweight), then fulltext in sub-batches.

    Returns (docs_with_fulltext, max_scanned_meta_id).
    max_scanned_meta_id is None if no metadata rows exist beyond last_doc_id
    (true end of data). When it's set but docs is empty, caller should advance
    the cursor past the fulltext gap instead of treating it as end-of-data.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT d.doc_id, d.court_code, d.judge, d.justice_kind,
                   d.cause_num, d.judgment_code, d.category_code,
                   d.adjudication_date
            FROM edrsr_documents d
            WHERE d.justice_kind = %s
              AND d.doc_id > %s
            ORDER BY d.doc_id ASC
            LIMIT %s
        """, (JUSTICE_KIND, last_doc_id, batch_size))

        cols = [c.name for c in cur.description]
        docs = [dict(zip(cols, row)) for row in cur.fetchall()]

    if not docs:
        return [], None

    max_scanned_id = docs[-1]["doc_id"]
    doc_ids = [d["doc_id"] for d in docs]
    doc_map = {d["doc_id"]: d for d in docs}

    # Fetch full_text in sub-batches of 200 (smaller than КУпАП — ЦПК texts are longer)
    FT_BATCH = 200
    for i in range(0, len(doc_ids), FT_BATCH):
        sub_ids = doc_ids[i : i + FT_BATCH]
        with conn.cursor() as cur:
            cur.execute("""
                SELECT doc_id, full_text
                FROM edrsr_fulltext
                WHERE doc_id = ANY(%s)
                  AND full_text IS NOT NULL
                  AND full_text != ''
            """, (sub_ids,))
            for row in cur.fetchall():
                if row[0] in doc_map:
                    doc_map[row[0]]["full_text"] = row[1]

    return [d for d in docs if d.get("full_text")], max_scanned_id

# ── Worker: process one batch ───────────────────────────────────────────────

def process_batch(docs: list[dict], progress: Progress, dry_run: bool = False) -> int:
    if not docs:
        return 0

    all_chunks = []
    for doc in docs:
        text = doc["full_text"]
        if not text or len(text.strip()) < MIN_CHUNK_CHARS:
            continue
        chunks = chunk_text(text)
        for i, chunk in enumerate(chunks):
            all_chunks.append((doc, chunk, i, len(chunks)))

    if not all_chunks:
        progress.add(docs=len(docs))
        return docs[-1]["doc_id"]

    EMBED_BATCH = 128
    points = []
    total_tokens = 0
    retries_429 = 0

    for i in range(0, len(all_chunks), EMBED_BATCH):
        sub = all_chunks[i : i + EMBED_BATCH]
        texts = [c[1] for c in sub]

        try:
            embeddings, tokens = embed_texts(texts)
            total_tokens += tokens
        except HTTPError as e:
            if e.code == 429:
                retries_429 += 1
                progress.add(err429=1, retries=1)
                time.sleep(5)
                try:
                    embeddings, tokens = embed_texts(texts)
                    total_tokens += tokens
                except Exception:
                    progress.add(err_other=1)
                    log.error(f"Failed to embed batch after 429 retry, skipping {len(texts)} chunks")
                    continue
            else:
                progress.add(err_other=1)
                log.error(f"Embed error {e.code}: {e.reason}")
                continue
        except Exception as e:
            progress.add(err_other=1)
            log.error(f"Embed error: {e}")
            continue

        for j, (doc, chunk_text_, chunk_idx, total_ch) in enumerate(sub):
            adj_date = doc.get("adjudication_date")
            if adj_date:
                if isinstance(adj_date, datetime):
                    adj_date = adj_date.strftime("%Y-%m-%d")
                else:
                    adj_date = str(adj_date)[:10]

            points.append({
                "id": str(uuid.uuid4()),
                "vector": embeddings[j],
                "payload": {
                    "edrsr_doc_id": int(doc["doc_id"]),
                    "court_code": doc.get("court_code"),
                    "judge": doc.get("judge"),
                    "cause_num": doc.get("cause_num"),
                    "justice_kind": doc.get("justice_kind"),
                    "adjudication_date": adj_date,
                    "judgment_code": doc.get("judgment_code"),
                    "category_code": doc.get("category_code"),
                    "chunk_index": chunk_idx,
                    "total_chunks": total_ch,
                    "text": chunk_text_,
                },
            })

    if not dry_run and points:
        UPSERT_BATCH = 100
        for i in range(0, len(points), UPSERT_BATCH):
            try:
                qdrant_upsert(points[i : i + UPSERT_BATCH])
            except Exception as e:
                progress.add(err_other=1)
                log.error(f"Qdrant upsert error: {e}")

    progress.add(
        docs=len(docs),
        chunks=len(points),
        tokens=total_tokens,
        err429=retries_429,
    )

    return docs[-1]["doc_id"]

# ── Checkpoint ──────────────────────────────────────────────────────────────

CHECKPOINT_FILE = "/tmp/vectorize-cpk-checkpoint.json"

def save_checkpoint(last_doc_id: int, progress: Progress):
    data = {
        "last_doc_id": last_doc_id,
        "processed_docs": progress.processed_docs,
        "total_chunks": progress.total_chunks,
        "total_tokens": progress.total_tokens,
        "timestamp": datetime.now().isoformat(),
    }
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(data, f)

def load_checkpoint() -> Optional[int]:
    try:
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        log.info(
            f"Resuming from checkpoint: doc_id={data['last_doc_id']:,}, "
            f"processed={data['processed_docs']:,}, tokens={data['total_tokens']:,}"
        )
        return data["last_doc_id"]
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None

# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Batch vectorize ЦПК (civil) court decisions")
    parser.add_argument("--concurrency", type=int, default=35, help="Concurrent embedding threads")
    parser.add_argument("--batch-size", type=int, default=500, help="Docs per worker batch")
    parser.add_argument("--pg-batch", type=int, default=2000, help="Docs per PG fetch")
    parser.add_argument("--embed-batch", type=int, default=128, help="Chunks per VoyageAI request")
    parser.add_argument("--dry-run", action="store_true", help="Skip Qdrant writes")
    parser.add_argument("--reset", action="store_true", help="Ignore checkpoint, start from 0")
    parser.add_argument("--skip-existing", action="store_true", help="Skip docs already in Qdrant")
    parser.add_argument("--limit", type=int, default=0, help="Max docs to process (0=all)")
    args = parser.parse_args()

    if not _voyage_keys:
        log.error("VOYAGEAI_API_KEY not set")
        sys.exit(1)
    if not PG_CONNSTR:
        log.error("DATABASE_URL not set")
        sys.exit(1)

    log.info(f"=== ЦПК (justice_kind={JUSTICE_KIND}) batch vectorization ===")
    log.info(f"Config: concurrency={args.concurrency}, batch={args.batch_size}, pg_batch={args.pg_batch}, model={VOYAGE_MODEL}, api_keys={len(_voyage_keys)}")
    log.info(f"Qdrant: {QDRANT_URL}/{QDRANT_COLLECTION}")
    log.info(f"Estimated: {TOTAL_ESTIMATE:,} docs, ~{TOTAL_ESTIMATE * 3.5 / 1e6:.0f}M chunks, ~${TOTAL_ESTIMATE * 1770 / 1e6 * 0.06:,.0f}")
    if args.dry_run:
        log.info("DRY RUN — no Qdrant writes")

    conn = pg_connect()

    last_doc_id = 0
    if not args.reset:
        checkpoint = load_checkpoint()
        if checkpoint is not None:
            last_doc_id = checkpoint

    existing_ids = set()
    if args.skip_existing:
        existing_ids = qdrant_scroll_doc_ids()

    progress = Progress(total_docs=TOTAL_ESTIMATE)
    report_interval = 30
    last_report = time.time()
    docs_processed_total = 0

    log.info(f"Starting from doc_id > {last_doc_id:,}")
    log.info("─" * 80)

    try:
        while True:
            try:
                pg_batch, max_scanned_id = pg_fetch_batch(conn, last_doc_id, args.pg_batch)
            except Exception as e:
                log.warning(f"PG fetch error: {e}, reconnecting...")
                conn = pg_reconnect(conn)
                try:
                    pg_batch, max_scanned_id = pg_fetch_batch(conn, last_doc_id, args.pg_batch)
                except Exception as e2:
                    log.error(f"PG fetch failed after reconnect: {e2}")
                    time.sleep(10)
                    conn = pg_reconnect(conn)
                    continue
            if max_scanned_id is None:
                log.info("No more documents to process")
                break
            if not pg_batch:
                # Metadata window exists but no fulltext in it — skip the gap.
                log.info(f"Fulltext gap, skipping {last_doc_id:,} → {max_scanned_id:,}")
                last_doc_id = max_scanned_id
                save_checkpoint(last_doc_id, progress)
                continue

            # Filter out already vectorized
            if existing_ids:
                before = len(pg_batch)
                pg_batch = [d for d in pg_batch if d["doc_id"] not in existing_ids]
                skipped = before - len(pg_batch)
                if skipped:
                    progress.add(skipped=skipped)

            if not pg_batch:
                last_doc_id = max_scanned_id
                continue

            # Split into worker batches
            worker_batches = []
            for i in range(0, len(pg_batch), args.batch_size):
                worker_batches.append(pg_batch[i : i + args.batch_size])

            with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                futures = {
                    pool.submit(process_batch, batch, progress, args.dry_run): batch
                    for batch in worker_batches
                }
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        log.error(f"Worker error: {e}")
                        progress.add(err_other=1)

            last_doc_id = max(d["doc_id"] for d in pg_batch)
            save_checkpoint(last_doc_id, progress)

            now = time.time()
            if now - last_report >= report_interval:
                log.info(progress.report())
                last_report = now

            docs_processed_total += len(pg_batch)
            if args.limit and docs_processed_total >= args.limit:
                log.info(f"Reached limit of {args.limit} docs")
                break

    except KeyboardInterrupt:
        log.info("\nInterrupted by user")
        save_checkpoint(last_doc_id, progress)
    finally:
        conn.close()

    log.info("─" * 80)
    log.info(f"DONE. {progress.report()}")
    elapsed = time.time() - progress.start_time
    log.info(f"Total time: {elapsed/3600:.1f}h")
    save_checkpoint(last_doc_id, progress)


if __name__ == "__main__":
    main()
