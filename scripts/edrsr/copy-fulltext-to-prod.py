#!/usr/bin/env python3
"""
Copy edrsr_fulltext from local PG to prod PG.
Phase 1: Export from local PG into chunk files on NVMe (fast sequential read).
Phase 2: Upload chunk files to prod PG in parallel (200 workers).

Usage:
  # Shard 1: doc_id < 112M → secondlayer_prod
  python3 copy-fulltext-to-prod.py --workers 200 --max-doc-id 112000000 --prod-db secondlayer_prod

  # Shard 2: doc_id >= 112M → secondlayer_prod_ft2
  python3 copy-fulltext-to-prod.py --workers 200 --min-doc-id 112000000 --prod-db secondlayer_prod_ft2
"""
import os
import subprocess
import sys
import time
import argparse
from pathlib import Path
from multiprocessing import Pool, Value
import ctypes

# ── Config ──
LOCAL_CMD = ["docker", "exec", "secondlayer-postgres-local", "psql", "-U", "secondlayer", "-d", "secondlayer_local"]
PROD_HOST = "18.192.189.254"
PROD_PORT = "5438"
PROD_USER = "secondlayer"
PROD_PASS = "1xfXUY8y7DM8Sm1w6T2cmBnNsnzfgnNJ2Ajl1Zl11xc"
CHUNK_DIR = Path("/tmp/edrsr-ft-chunks")

_prod_db = "secondlayer_prod"
_total_copied = Value(ctypes.c_long, 0)
_total_skipped = Value(ctypes.c_long, 0)


def _prod_cmd(db=None):
    return ["psql", "-h", PROD_HOST, "-p", PROD_PORT, "-U", PROD_USER, "-d", db or _prod_db]


def _prod_env():
    env = os.environ.copy()
    env["PGPASSWORD"] = PROD_PASS
    return env


def upload_chunk(chunk_file: str) -> tuple[int, int, int, str]:
    """Upload a single chunk file to prod PG."""
    path = Path(chunk_file)
    if not path.exists() or path.stat().st_size == 0:
        return (0, 0, 0, "empty")

    data = path.read_bytes()
    row_count = data.count(b'\n')
    if row_count == 0:
        return (0, 0, 0, "empty")

    tag = path.stem.replace('-', '_')

    sql_header = f"CREATE TEMP TABLE _ft_{tag} (doc_id bigint, full_text text);\nCOPY _ft_{tag} FROM stdin;\n"
    sql_footer = (
        f"\\.\n"
        f"INSERT INTO edrsr_fulltext(doc_id, full_text)\n"
        f"SELECT doc_id, full_text FROM _ft_{tag}\n"
        f"ON CONFLICT (doc_id) DO NOTHING;\n"
        f"DROP TABLE _ft_{tag};\n"
    )
    full_input = sql_header.encode() + data + sql_footer.encode()

    prod = subprocess.run(
        _prod_cmd(), input=full_input,
        capture_output=True, env=_prod_env(),
    )

    if prod.returncode != 0 or b'ERROR' in prod.stderr:
        return (0, 0, 1, f"prod err [{tag}]: rc={prod.returncode} {prod.stderr.decode()[:300]}")

    # Parse INSERT count — must find it, otherwise treat as failure
    copied = 0
    found_insert = False
    for line in prod.stdout.decode().strip().split('\n'):
        if line.startswith('INSERT '):
            found_insert = True
            try:
                copied = int(line.split()[2])
            except (IndexError, ValueError):
                pass

    if not found_insert:
        return (0, 0, 1, f"no INSERT in output [{tag}]: {prod.stdout.decode()[:200]}")

    skipped = row_count - copied

    with _total_copied.get_lock():
        _total_copied.value += copied
    with _total_skipped.get_lock():
        _total_skipped.value += skipped

    # Only delete chunk if INSERT actually worked
    if copied > 0 or skipped > 0:
        path.unlink(missing_ok=True)

    return (copied, skipped, 0, "ok")


def export_chunks(min_id: int, max_id: int, chunk_size: int, out_dir: Path,
                   resume_from_doc_id: int | None = None) -> list[str]:
    """Export fulltext from local PG into chunk files. Single stream, fast sequential.
    If resume_from_doc_id is set, appends new chunks starting from that doc_id."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # Find existing chunks to continue numbering
    existing_chunks = sorted(out_dir.glob("chunk-*.tsv"))
    if resume_from_doc_id and existing_chunks:
        chunk_idx = len(existing_chunks)
        actual_min = resume_from_doc_id
        print(f"  Resuming: {len(existing_chunks)} existing chunks, "
              f"exporting from doc_id {actual_min:,}", flush=True)
    else:
        chunk_idx = 0
        actual_min = min_id

    where = f"doc_id >= {actual_min} AND doc_id < {max_id}"
    print(f"  Exporting doc_id {actual_min:,}–{max_id:,} as single COPY stream...", flush=True)
    start = time.time()

    export_sql = (
        f"\\COPY (SELECT doc_id, full_text FROM edrsr_fulltext "
        f"WHERE {where} ORDER BY doc_id) TO STDOUT WITH (FORMAT text)"
    )

    proc = subprocess.Popen(
        LOCAL_CMD + ["-c", export_sql],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    new_chunk_files = []
    line_count = 0
    total_lines = 0
    current_file = None

    for line in proc.stdout:
        if line_count == 0:
            chunk_path = out_dir / f"chunk-{chunk_idx:05d}.tsv"
            current_file = open(chunk_path, 'wb')
            new_chunk_files.append(str(chunk_path))

        current_file.write(line)
        line_count += 1
        total_lines += 1

        if line_count >= chunk_size:
            current_file.close()
            current_file = None
            chunk_idx += 1
            line_count = 0

            if len(new_chunk_files) % 50 == 0:
                elapsed = time.time() - start
                rate = total_lines / elapsed if elapsed > 0 else 0
                print(f"    {total_lines:,} rows → {len(new_chunk_files)} new chunks ({rate:,.0f} rows/s)", flush=True)

    if current_file:
        current_file.close()
        if line_count == 0:
            Path(new_chunk_files[-1]).unlink(missing_ok=True)
            new_chunk_files.pop()

    proc.wait()
    elapsed = time.time() - start
    rate = total_lines / elapsed if elapsed > 0 else 0
    print(f"  Export done: {total_lines:,} new rows → {len(new_chunk_files)} new chunks "
          f"in {elapsed/60:.1f}m ({rate:,.0f} rows/s)", flush=True)

    # Return ALL chunk files (existing + new)
    all_chunks = sorted(str(f) for f in out_dir.glob("chunk-*.tsv"))
    print(f"  Total chunks ready: {len(all_chunks)}", flush=True)
    return all_chunks


def main():
    global _prod_db

    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=200)
    parser.add_argument('--chunk-rows', type=int, default=5000, help='Rows per chunk file')
    parser.add_argument('--min-doc-id', type=int, default=None)
    parser.add_argument('--max-doc-id', type=int, default=None)
    parser.add_argument('--prod-db', type=str, default='secondlayer_prod')
    parser.add_argument('--skip-export', action='store_true', help='Skip export, use existing chunks')
    parser.add_argument('--resume-from-doc-id', type=int, default=None, help='Resume export from this doc_id (keep existing chunks)')
    args = parser.parse_args()

    _prod_db = args.prod_db
    shard_name = _prod_db.replace('secondlayer_prod', 'shard')
    chunk_dir = CHUNK_DIR / shard_name

    print(f"=== Copy edrsr_fulltext → {_prod_db} ===")
    print(f"Workers: {args.workers}, Chunk rows: {args.chunk_rows}")
    print(flush=True)

    if not args.skip_export:
        # Get range from local
        where = "1=1"
        if args.min_doc_id:
            where += f" AND doc_id >= {args.min_doc_id}"
        if args.max_doc_id:
            where += f" AND doc_id < {args.max_doc_id}"

        r = subprocess.run(
            LOCAL_CMD + ["-Atc", f"SELECT min(doc_id), max(doc_id), count(*) FROM edrsr_fulltext WHERE {where};"],
            capture_output=True, text=True,
        )
        parts = r.stdout.strip().split('|')
        if not parts[0]:
            print("No rows in range!")
            return
        local_min, local_max, local_count = int(parts[0]), int(parts[1]), int(parts[2])
        print(f"  Local: {local_count:,} rows, doc_id {local_min:,}–{local_max:,}", flush=True)

        # Phase 1: Export to chunk files
        print(f"\n[Phase 1] Exporting to {chunk_dir}...", flush=True)
        chunk_files = export_chunks(local_min, local_max + 1, args.chunk_rows, chunk_dir,
                                     resume_from_doc_id=args.resume_from_doc_id)
    else:
        print(f"[Phase 1] Skipped, using existing chunks in {chunk_dir}", flush=True)
        chunk_files = sorted(str(f) for f in chunk_dir.glob("chunk-*.tsv"))
        print(f"  Found {len(chunk_files)} chunk files", flush=True)

    if not chunk_files:
        print("No chunks to upload!")
        return

    # Check prod
    r = subprocess.run(
        _prod_cmd() + ["-Atc", "SELECT count(*) FROM edrsr_fulltext;"],
        capture_output=True, text=True, env=_prod_env(),
    )
    prod_count = int(r.stdout.strip())
    print(f"  Prod ({_prod_db}): {prod_count:,} rows before upload", flush=True)

    # Phase 2: Upload in parallel
    print(f"\n[Phase 2] Uploading {len(chunk_files)} chunks ({args.workers} workers)...", flush=True)
    start_time = time.time()
    done = 0
    errors = 0

    with Pool(processes=args.workers) as pool:
        for result in pool.imap_unordered(upload_chunk, chunk_files, chunksize=1):
            copied, skipped, err, msg = result
            done += 1
            if err:
                errors += 1
                if "err" in msg:
                    print(f"  ERR: {msg}", file=sys.stderr, flush=True)

            if done % 200 == 0 or done == len(chunk_files):
                elapsed = time.time() - start_time
                total_c = _total_copied.value
                rate = total_c / elapsed if elapsed > 0 else 0
                remaining = len(chunk_files) - done
                eta = (remaining / (done / elapsed)) if done > 0 else 0
                pct = 100.0 * done / len(chunk_files)
                print(
                    f"  {done}/{len(chunk_files)} ({pct:.1f}%) | "
                    f"{total_c:,} copied, {_total_skipped.value:,} existed | "
                    f"{rate:,.0f}/s | err={errors} | ETA {eta/60:.0f}m",
                    flush=True,
                )

    elapsed = time.time() - start_time
    total_c = _total_copied.value
    total_s = _total_skipped.value
    rate = total_c / elapsed if elapsed > 0 else 0
    print(f"\n=== Done! {total_c:,} copied, {total_s:,} existed, {errors} errors "
          f"in {elapsed/60:.1f}m ({rate:,.0f}/s) ===", flush=True)

    # Verify
    r = subprocess.run(
        _prod_cmd() + ["-c", "SELECT count(*) AS total, pg_size_pretty(pg_total_relation_size('edrsr_fulltext')) AS size FROM edrsr_fulltext;"],
        capture_output=True, text=True, env=_prod_env(),
    )
    print(r.stdout, flush=True)

    # Cleanup empty chunk dir
    try:
        chunk_dir.rmdir()
    except OSError:
        pass


if __name__ == '__main__':
    main()
