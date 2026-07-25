#!/usr/bin/env python3
"""
Fast court sessions import: raw COPY without indexes, dedup at the end.

Phase 1: Parallel download + COPY into raw UNLOGGED tables (no indexes, no ON CONFLICT)
Phase 2: Deduplicate with DISTINCT ON into final table
Phase 3: Create indexes

10-50x faster than INSERT ON CONFLICT approach.

Usage: python3 fast-import-court-sessions.py [--shards 8] [--workers-per-shard 8] [--db main|hudoc]
"""

import subprocess
import json
import os
import time
import argparse
import signal
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import Process

RESOURCE_ID = "98d6ba0d-1c18-4835-ae68-bfc0af724bfa"
API_URL = f"https://data.gov.ua/api/3/action/resource_show?id={RESOURCE_ID}"
WORK_DIR = "/tmp/court-sessions-fast"
MAX_RETRIES = 3

DB_CONFIGS = {
    "main": {
        "container": "secondlayer-postgres-local",
        "user": "secondlayer",
        "dbname": "secondlayer_local",
    },
    "hudoc": {
        "container": "postgres-hudoc-local",
        "user": "hudoc",
        "dbname": "hudoc_local",
    },
}

shutdown_requested = False

def signal_handler(sig, frame):
    global shutdown_requested
    print("\n[!] Shutdown requested...")
    shutdown_requested = True

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


class Stats:
    def __init__(self, shard_id):
        self._lock = threading.Lock()
        self.shard_id = shard_id
        self.imported = 0
        self.errors = 0
        self.start_time = time.time()

    def inc_imported(self):
        with self._lock:
            self.imported += 1

    def inc_error(self):
        with self._lock:
            self.errors += 1

    def snapshot(self):
        with self._lock:
            return self.imported, self.errors


def run_sql(db_cfg, sql, quiet=False, timeout=3600):
    cmd = ["docker", "exec", db_cfg["container"], "psql", "-U", db_cfg["user"], "-d", db_cfg["dbname"]]
    if quiet:
        cmd.append("-q")
    cmd.extend(["-c", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def run_sql_value(db_cfg, sql, timeout=3600):
    cmd = ["docker", "exec", db_cfg["container"], "psql", "-U", db_cfg["user"], "-d", db_cfg["dbname"], "-t", "-A", "-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def fetch_revisions():
    result = subprocess.run(
        ["curl", "-sS", "--connect-timeout", "30", "--max-time", "120", API_URL],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"API fetch failed: {result.stderr}")
    data = json.loads(result.stdout)
    revisions = data["result"]["resource_revisions"]
    revisions.reverse()
    return revisions


def parse_revision_date(url):
    slug = url.rstrip("/").split("/revision/")[-1]
    date_part = slug.split("_")[0]
    if len(date_part) == 8:
        day, month, year = date_part[0:2], date_part[2:4], date_part[4:8]
        return f"{year}-{month}-{day}"
    return None


DOWNLOAD_VIA_PROD = os.environ.get("DOWNLOAD_VIA_PROD", "1") == "1"
PROD_IPS = ["172.31.21.255", "172.31.31.40"]  # two secondary IPs for round-robin

def download_revision(url, dest_path, shard_id=0):
    # Distribute shards across IPs to avoid rate limiting
    bind_ip = PROD_IPS[shard_id % len(PROD_IPS)]
    for attempt in range(MAX_RETRIES):
        try:
            if DOWNLOAD_VIA_PROD:
                cmd = f"ssh prod \"curl -sS -L --interface {bind_ip} --connect-timeout 30 --max-time 600 '{url}'\" > '{dest_path}'"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=660)
            else:
                result = subprocess.run(
                    ["curl", "-sS", "-L",
                     "--connect-timeout", "30", "--max-time", "600",
                     "-o", dest_path, url],
                    capture_output=True, text=True, timeout=660
                )
            if result.returncode == 0 and os.path.getsize(dest_path) > 1_000_000:
                return os.path.getsize(dest_path)
        except subprocess.TimeoutExpired:
            pass
        time.sleep(3 * (attempt + 1))
    raise RuntimeError("Download failed")


def copy_csv_direct(db_cfg, filepath, shard_table, revision_date):
    """COPY CSV directly into raw shard table — no staging, no ON CONFLICT."""
    cmd = (
        f"tail -n +2 '{filepath}' | "
        f"sed 's/$/\\t{revision_date}/' | "
        f"docker exec -i {db_cfg['container']} psql -U {db_cfg['user']} -d {db_cfg['dbname']} -q -c "
        f"\"COPY {shard_table} (hearing_date, judges, case_number, court_name, court_room, case_involved, case_description, revision_date) "
        f"FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\\\"')\""
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=1200)
    if result.returncode != 0:
        raise RuntimeError(f"COPY error: {result.stderr.strip()[:500]}")


def tune_pg_for_import(db_cfg):
    """Tune PG settings for fast bulk import."""
    print(f"  [{db_cfg['container']}] Tuning for import...")
    for sql in [
        "ALTER SYSTEM SET synchronous_commit = off;",
        "ALTER SYSTEM SET work_mem = '256MB';",
        "ALTER SYSTEM SET maintenance_work_mem = '2GB';",
        "ALTER SYSTEM SET checkpoint_completion_target = 0.9;",
        "ALTER SYSTEM SET wal_buffers = '64MB';",
        "ALTER SYSTEM SET max_wal_size = '4GB';",
        "SELECT pg_reload_conf();",
    ]:
        try:
            run_sql(db_cfg, sql, quiet=True)
        except Exception as e:
            print(f"    Warning: {sql[:40]}... {str(e)[:100]}")


def restore_pg_settings(db_cfg):
    """Restore safe PG settings after import."""
    print(f"  [{db_cfg['container']}] Restoring settings...")
    for sql in [
        "ALTER SYSTEM SET synchronous_commit = on;",
        "ALTER SYSTEM SET work_mem = '4MB';",
        "ALTER SYSTEM SET maintenance_work_mem = '64MB';",
        "SELECT pg_reload_conf();",
    ]:
        try:
            run_sql(db_cfg, sql, quiet=True)
        except:
            pass


def setup_shard(db_cfg, shard_id):
    """Create raw UNLOGGED table — NO indexes, just heap."""
    shard_table = f"court_raw_{shard_id}"
    run_sql(db_cfg, f"""
        DROP TABLE IF EXISTS {shard_table};
        CREATE UNLOGGED TABLE {shard_table} (
            hearing_date TEXT,
            judges TEXT,
            case_number TEXT,
            court_name TEXT,
            court_room TEXT,
            case_involved TEXT,
            case_description TEXT,
            revision_date DATE
        );
    """, quiet=True)


def process_revision(db_cfg, shard_id, worker_id, rev_idx, total_in_shard, revision, stats):
    if shutdown_requested:
        return

    rev_date = parse_revision_date(revision["url"])
    if not rev_date:
        return

    shard_table = f"court_raw_{shard_id}"
    csv_path = os.path.join(WORK_DIR, f"s{shard_id}_w{worker_id}_{rev_date}.csv")

    imp, err = stats.snapshot()
    elapsed = time.time() - stats.start_time
    rate = imp / elapsed if elapsed > 0 and imp > 0 else 0
    remaining = total_in_shard - imp
    eta = remaining / rate if rate > 0 else 0
    eta_str = f"{eta/60:.0f}m" if eta < 3600 else f"{eta/3600:.1f}h"

    print(f"  [S{shard_id}:W{worker_id}] {rev_date} | {imp}/{total_in_shard} err={err} | ETA ~{eta_str}", flush=True)

    try:
        download_revision(revision["url"], csv_path, shard_id)
        copy_csv_direct(db_cfg, csv_path, shard_table, rev_date)
        stats.inc_imported()
    except Exception as e:
        stats.inc_error()
        print(f"  [S{shard_id}:W{worker_id}] [!] {rev_date}: {str(e)[:200]}")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def run_shard(db_cfg, shard_id, revisions_slice, workers_per_shard):
    total = len(revisions_slice)
    stats = Stats(shard_id)
    print(f"[S{shard_id}] Starting: {total} revisions, {workers_per_shard} workers → {db_cfg['container']}")

    with ThreadPoolExecutor(max_workers=workers_per_shard) as executor:
        futures = {}
        wcycle = 0
        for i, rev in enumerate(revisions_slice):
            if shutdown_requested:
                break
            wid = wcycle % workers_per_shard
            wcycle += 1
            f = executor.submit(process_revision, db_cfg, shard_id, wid, i, total, rev, stats)
            futures[f] = i
            while len([f for f in futures if not f.done()]) >= workers_per_shard * 2:
                time.sleep(0.3)
                if shutdown_requested:
                    break
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"  [S{shard_id}] Unexpected: {e}")

    imp, err = stats.snapshot()
    elapsed = time.time() - stats.start_time
    count = run_sql_value(db_cfg, f"SELECT count(*) FROM court_raw_{shard_id};")
    print(f"\n[S{shard_id}] DONE: {imp} imported, {err} errors, {count} raw rows, {elapsed/60:.0f}m")


def dedup_shard(db_cfg, shard_id):
    """Deduplicate raw shard into clean table."""
    raw = f"court_raw_{shard_id}"
    clean = f"court_clean_{shard_id}"
    print(f"  Deduplicating {raw} → {clean}...")

    run_sql(db_cfg, f"""
        DROP TABLE IF EXISTS {clean};
        CREATE UNLOGGED TABLE {clean} AS
        SELECT
            case_number, court_name, judges AS judge_name,
            CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                ELSE NULL END AS session_date,
            CASE WHEN hearing_date ~ '\\d{{2}}:\\d{{2}}'
                THEN substring(hearing_date from '\\d{{2}}:\\d{{2}}')
                ELSE NULL END AS session_time,
            NULLIF(court_room, '') AS session_place,
            NULLIF(case_involved, '') AS involved_parties,
            MIN(revision_date) AS first_seen_date,
            MAX(revision_date) AS last_seen_date
        FROM {raw}
        WHERE case_number IS NOT NULL AND case_number != ''
          AND hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
        GROUP BY case_number, court_name, judges,
            CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                ELSE NULL END,
            CASE WHEN hearing_date ~ '\\d{{2}}:\\d{{2}}'
                THEN substring(hearing_date from '\\d{{2}}:\\d{{2}}')
                ELSE NULL END,
            NULLIF(court_room, ''),
            NULLIF(case_involved, '');
    """, quiet=True, timeout=3600)

    count = run_sql_value(db_cfg, f"SELECT count(*) FROM {clean};")
    print(f"  {clean}: {count} unique rows")
    return int(count)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shards", type=int, default=8)
    parser.add_argument("--workers-per-shard", type=int, default=8)
    parser.add_argument("--start", type=int, default=1052)
    parser.add_argument("--end", type=int, default=0)
    parser.add_argument("--phase", choices=["all", "load", "dedup"], default="all")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    os.makedirs(WORK_DIR, exist_ok=True)

    # Use two PG instances: shards 0-3 → main, shards 4-7 → hudoc
    db_main = DB_CONFIGS["main"]
    db_hudoc = DB_CONFIGS["hudoc"]

    if args.phase in ("all", "load"):
        print("[*] Fetching revisions...")
        all_revisions = fetch_revisions()
        total = len(all_revisions)
        end_idx = args.end if args.end > 0 else total
        revisions = all_revisions[args.start:end_idx]

        print(f"[*] Total: {len(revisions)} revisions (idx {args.start}-{end_idx-1})")
        print(f"[*] Shards: {args.shards}, workers/shard: {args.workers_per_shard}")
        print(f"[*] Total parallel downloads: {args.shards * args.workers_per_shard}")
        print(f"[*] DB split: shards 0-{args.shards//2 - 1} → main, {args.shards//2}-{args.shards-1} → hudoc")

        chunk_size = len(revisions) // args.shards
        shard_slices = []
        for i in range(args.shards):
            start = i * chunk_size
            end = start + chunk_size if i < args.shards - 1 else len(revisions)
            shard_slices.append(revisions[start:end])
            d0 = parse_revision_date(revisions[start]["url"])
            d1 = parse_revision_date(revisions[end-1]["url"])
            db_label = "main" if i < args.shards // 2 else "hudoc"
            print(f"  Shard {i} [{db_label}]: {len(shard_slices[i])} revisions ({d0} → {d1})")

        if args.dry_run:
            return

        # Tune both PGs
        print("\n[*] Tuning PostgreSQL instances...")
        tune_pg_for_import(db_main)
        tune_pg_for_import(db_hudoc)

        # Setup shard tables
        print("[*] Setting up shard tables...")
        half = args.shards // 2
        for i in range(half):
            setup_shard(db_main, i)
        for i in range(half, args.shards):
            setup_shard(db_hudoc, i)
        print("[+] All shard tables ready\n")

        # Launch shards as separate processes
        start_time = time.time()
        processes = []
        for i in range(args.shards):
            db_cfg = db_main if i < half else db_hudoc
            p = Process(target=run_shard, args=(db_cfg, i, shard_slices[i], args.workers_per_shard))
            p.start()
            processes.append(p)

        for p in processes:
            p.join()

        elapsed = time.time() - start_time
        print(f"\n[*] Phase 1 (COPY) complete in {elapsed/60:.0f}m")

        # Row counts
        total_raw = 0
        for i in range(half):
            c = int(run_sql_value(db_main, f"SELECT count(*) FROM court_raw_{i};"))
            total_raw += c
            print(f"  court_raw_{i} (main): {c:,}")
        for i in range(half, args.shards):
            c = int(run_sql_value(db_hudoc, f"SELECT count(*) FROM court_raw_{i};"))
            total_raw += c
            print(f"  court_raw_{i} (hudoc): {c:,}")
        print(f"  Total raw rows: {total_raw:,}")

    if args.phase in ("all", "dedup"):
        print(f"\n[*] Phase 2: Deduplicating shards...")
        half = args.shards // 2
        total_clean = 0
        for i in range(half):
            total_clean += dedup_shard(db_main, i)
        for i in range(half, args.shards):
            total_clean += dedup_shard(db_hudoc, i)
        print(f"\n  Total clean rows across all shards: {total_clean:,}")

        # Restore PG settings
        restore_pg_settings(db_main)
        restore_pg_settings(db_hudoc)

    print(f"\n{'='*60}")
    print("Fast import complete!")
    print(f"Next: dump court_clean_* tables and merge into prod")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
