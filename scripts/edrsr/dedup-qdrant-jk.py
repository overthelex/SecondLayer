#!/usr/bin/env python3
"""
Deduplicate Qdrant edrsr_decisions collection by (edrsr_doc_id, chunk_index).

Keeps exactly one point per (edrsr_doc_id, chunk_index) pair, deletes the rest.
Uses standard UUID-offset scroll (reliable on large partitions) with streaming
deletes. Checkpoint file enables resume after interruption.

Usage:
    python3 dedup-qdrant-jk.py --justice-kind 3          # dedup jk=3 (smaller, run first)
    python3 dedup-qdrant-jk.py --justice-kind 1          # dedup jk=1
    python3 dedup-qdrant-jk.py --justice-kind 3 --dry-run  # scan only, no deletes
    python3 dedup-qdrant-jk.py --justice-kind 3 --resume   # resume from checkpoint
    python3 dedup-qdrant-jk.py --justice-kind 3 --verify-only  # post-dedup verification
"""

import argparse
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dedup-qdrant")

QDRANT_URL = os.environ.get("QDRANT_URL", "http://bigbox.lex:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "3cCOLVQESro11stD9LvVQm4TnWDm9DqUxKjfYBXy")
COLLECTION = "edrsr_decisions"

SCROLL_BATCH = 10_000
DELETE_BATCH = 500
DELETE_CONCURRENCY = 4
CHECKPOINT_EVERY = 500_000  # save checkpoint every N points scanned
VERIFY_SAMPLE = 200


def qdrant_request(method: str, path: str, body: dict | None = None, timeout: int = 120) -> dict:
    url = f"{QDRANT_URL}/collections/{COLLECTION}{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header("api-key", QDRANT_API_KEY)
    if data:
        req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def create_snapshot() -> str:
    log.info("Creating collection snapshot (safety backup)...")
    t0 = time.time()
    url = f"{QDRANT_URL}/collections/{COLLECTION}/snapshots?wait=true"
    req = Request(url, data=b"", method="POST")
    req.add_header("api-key", QDRANT_API_KEY)
    with urlopen(req, timeout=1800) as resp:
        result = json.loads(resp.read())
    snap = result["result"]["name"]
    elapsed = time.time() - t0
    log.info(f"Snapshot created: {snap} ({elapsed:.0f}s)")
    return snap


def count_points(justice_kind: int, exact: bool = False) -> int:
    result = qdrant_request("POST", "/points/count", {
        "filter": {"must": [{"key": "justice_kind", "match": {"value": justice_kind}}]},
        "exact": exact,
    })
    return result["result"]["count"]


def scroll_batch(justice_kind: int, offset: str | None) -> tuple[list[dict], str | None]:
    body = {
        "filter": {"must": [{"key": "justice_kind", "match": {"value": justice_kind}}]},
        "limit": SCROLL_BATCH,
        "with_payload": ["edrsr_doc_id", "chunk_index"],
        "with_vector": False,
    }
    if offset:
        body["offset"] = offset

    result = qdrant_request("POST", "/points/scroll", body)
    points = result["result"]["points"]
    next_offset = result["result"].get("next_page_offset")
    return points, next_offset


def delete_points(point_ids: list[str]) -> int:
    if not point_ids:
        return 0
    for attempt in range(3):
        try:
            qdrant_request("POST", "/points/delete?wait=false", {"points": point_ids}, timeout=60)
            return len(point_ids)
        except (HTTPError, URLError, TimeoutError) as e:
            if attempt < 2:
                log.warning(f"Delete retry {attempt+1}: {e}")
                time.sleep(2 ** attempt)
            else:
                log.error(f"Delete failed after 3 attempts: {e}, skipping {len(point_ids)} points")
                return 0
    return 0


class DedupState:
    def __init__(self, justice_kind: int, checkpoint_file: str):
        self.justice_kind = justice_kind
        self.checkpoint_file = checkpoint_file
        self.last_offset: str | None = None
        self.scanned = 0
        self.duplicates_found = 0
        self.deleted = 0
        self.pending_deletes: list[str] = []
        self.snapshot_name: str | None = None
        self.started_at = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.lock = Lock()

    def save(self):
        data = {
            "justice_kind": self.justice_kind,
            "last_offset": self.last_offset,
            "scanned": self.scanned,
            "duplicates_found": self.duplicates_found,
            "deleted": self.deleted,
            "pending_deletes": self.pending_deletes,
            "snapshot_name": self.snapshot_name,
            "started_at": self.started_at,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        tmp = self.checkpoint_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f)
        os.replace(tmp, self.checkpoint_file)

    @classmethod
    def load(cls, checkpoint_file: str) -> "DedupState":
        with open(checkpoint_file) as f:
            data = json.load(f)
        state = cls(data["justice_kind"], checkpoint_file)
        state.last_offset = data.get("last_offset")
        state.scanned = data.get("scanned", 0)
        state.duplicates_found = data.get("duplicates_found", 0)
        state.deleted = data.get("deleted", 0)
        state.pending_deletes = data.get("pending_deletes", [])
        state.snapshot_name = data.get("snapshot_name")
        state.started_at = data.get("started_at", "")
        return state


def flush_deletes(state: DedupState, executor: ThreadPoolExecutor, dry_run: bool):
    """Delete accumulated duplicate point IDs in parallel batches."""
    if not state.pending_deletes:
        return

    if dry_run:
        state.deleted += len(state.pending_deletes)
        state.pending_deletes = []
        return

    batches = []
    for i in range(0, len(state.pending_deletes), DELETE_BATCH):
        batches.append(state.pending_deletes[i:i + DELETE_BATCH])

    futures = []
    for batch in batches:
        futures.append(executor.submit(delete_points, batch))

    total_del = 0
    for f in as_completed(futures):
        total_del += f.result()

    with state.lock:
        state.deleted += total_del
        state.pending_deletes = []


def run_dedup(justice_kind: int, dry_run: bool, resume: bool, skip_snapshot: bool, checkpoint_file: str):
    if resume and os.path.exists(checkpoint_file):
        state = DedupState.load(checkpoint_file)
        log.info(f"Resuming from checkpoint: scanned={state.scanned}, deleted={state.deleted}, offset={state.last_offset}")
    else:
        state = DedupState(justice_kind, checkpoint_file)

    total = count_points(justice_kind)
    log.info(f"=== Dedup justice_kind={justice_kind}: {total:,} points ===")

    # Phase 0: snapshot
    if not skip_snapshot and not state.snapshot_name and not dry_run:
        state.snapshot_name = create_snapshot()
        state.save()
    elif state.snapshot_name:
        log.info(f"Using existing snapshot: {state.snapshot_name}")

    # Phase 1+2: scan and delete
    # seen maps (edrsr_doc_id, chunk_index) -> first point UUID
    seen: dict[tuple[int, int], str] = {}
    offset = state.last_offset
    last_log = time.time()
    t0 = time.time()
    batch_num = 0

    executor = ThreadPoolExecutor(max_workers=DELETE_CONCURRENCY)

    try:
        while True:
            points, next_offset = scroll_batch(justice_kind, offset)
            if not points:
                break

            for p in points:
                pid = p["id"]
                payload = p["payload"]
                doc_id = payload.get("edrsr_doc_id")
                chunk_idx = payload.get("chunk_index")

                if doc_id is None or chunk_idx is None:
                    continue

                key = (doc_id, chunk_idx)
                if key in seen:
                    state.pending_deletes.append(pid)
                    state.duplicates_found += 1
                else:
                    seen[key] = pid

            state.scanned += len(points)
            offset = next_offset
            state.last_offset = offset
            batch_num += 1

            # Flush deletes when buffer is large enough
            if len(state.pending_deletes) >= DELETE_BATCH * DELETE_CONCURRENCY:
                flush_deletes(state, executor, dry_run)

            # Periodic logging and checkpoint
            if time.time() - last_log > 10:
                elapsed = time.time() - t0
                rate = state.scanned / elapsed if elapsed > 0 else 0
                eta = (total - state.scanned) / rate if rate > 0 else 0
                pct = state.scanned / total * 100 if total > 0 else 0
                mem_mb = len(seen) * 80 / 1_000_000  # rough estimate
                log.info(
                    f"  {state.scanned:>12,}/{total:,} ({pct:.1f}%) | "
                    f"dups: {state.duplicates_found:,} | deleted: {state.deleted:,} | "
                    f"rate: {rate:,.0f}/s | ETA: {eta/60:.1f}m | "
                    f"seen_keys: {len(seen):,} (~{mem_mb:.0f} MB)"
                )
                last_log = time.time()

            if state.scanned % CHECKPOINT_EVERY < SCROLL_BATCH:
                state.save()

            if not next_offset:
                break

        # Final flush
        flush_deletes(state, executor, dry_run)
        state.save()

    finally:
        executor.shutdown(wait=True)

    elapsed = time.time() - t0
    log.info(f"=== Done: scanned {state.scanned:,}, dups found {state.duplicates_found:,}, "
             f"deleted {state.deleted:,} in {elapsed/60:.1f}m ===")
    log.info(f"Unique (doc_id, chunk_index) pairs: {len(seen):,}")

    # Phase 3: quick verify
    new_total = count_points(justice_kind)
    expected = len(seen)
    log.info(f"Post-dedup count: {new_total:,} (expected ~{expected:,})")
    if abs(new_total - expected) > expected * 0.01:
        log.warning(f"Count mismatch! Diff: {new_total - expected:,}")
    else:
        log.info("Count looks correct (within 1%)")

    return state


def run_verify(justice_kind: int):
    """Post-dedup verification: sample random docs and check chunk consistency."""
    total = count_points(justice_kind)
    log.info(f"=== Verify justice_kind={justice_kind}: {total:,} points ===")

    doc_checks = {}
    for prefix in [None, "2", "4", "6", "8", "a", "c", "e"]:
        body = {
            "filter": {"must": [
                {"key": "justice_kind", "match": {"value": justice_kind}},
                {"key": "chunk_index", "match": {"value": 0}},
            ]},
            "limit": 30,
            "with_payload": ["edrsr_doc_id", "total_chunks"],
            "with_vector": False,
        }
        if prefix:
            body["offset"] = f"{prefix}0000000-0000-0000-0000-000000000000"
        result = qdrant_request("POST", "/points/scroll", body)
        for p in result["result"]["points"]:
            doc_id = p["payload"].get("edrsr_doc_id")
            tc = p["payload"].get("total_chunks", 0)
            if doc_id and doc_id not in doc_checks:
                doc_checks[doc_id] = tc

    log.info(f"Verifying {len(doc_checks)} documents...")
    ok = 0
    bad = 0

    for doc_id, expected_chunks in doc_checks.items():
        result = qdrant_request("POST", "/points/count", {
            "filter": {"must": [{"key": "edrsr_doc_id", "match": {"value": doc_id}}]},
            "exact": True,
        })
        actual = result["result"]["count"]
        if actual == expected_chunks:
            ok += 1
        else:
            bad += 1
            if bad <= 10:
                log.warning(f"  doc_id={doc_id}: expected={expected_chunks}, actual={actual}")

    log.info(f"Verification: {ok}/{ok+bad} OK, {bad} mismatched")
    if bad > 0:
        log.warning(f"{bad} documents still have incorrect chunk counts")
    else:
        log.info("All sampled documents have correct chunk counts")


def main():
    parser = argparse.ArgumentParser(description="Dedup Qdrant edrsr_decisions by (edrsr_doc_id, chunk_index)")
    parser.add_argument("--justice-kind", type=int, required=True, choices=[1, 2, 3, 5])
    parser.add_argument("--dry-run", action="store_true", help="Scan and report, no deletes")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--skip-snapshot", action="store_true", help="Skip pre-flight snapshot")
    parser.add_argument("--verify-only", action="store_true", help="Only run verification")
    parser.add_argument("--checkpoint-file", type=str, default=None)
    args = parser.parse_args()

    if args.checkpoint_file is None:
        args.checkpoint_file = f"/tmp/dedup-jk{args.justice_kind}-checkpoint.json"

    if args.verify_only:
        run_verify(args.justice_kind)
        return

    state = run_dedup(
        justice_kind=args.justice_kind,
        dry_run=args.dry_run,
        resume=args.resume,
        skip_snapshot=args.skip_snapshot,
        checkpoint_file=args.checkpoint_file,
    )

    if not args.dry_run:
        log.info("Running post-dedup verification...")
        run_verify(args.justice_kind)


if __name__ == "__main__":
    main()
