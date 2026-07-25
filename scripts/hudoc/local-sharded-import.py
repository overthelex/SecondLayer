#!/usr/bin/env python3
"""
Sharded parallel import: 4 independent shard tables, each with own dedup index.
Each shard processes 1/4 of revisions with 8 download workers.
Zero lock contention between shards. Merge into one table at the end.

Usage: python3 local-sharded-import.py [--shards 4] [--workers-per-shard 8]
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
DB_CONTAINER = "secondlayer-postgres-local"
DB_USER = "secondlayer"
DB_NAME = "secondlayer_local"
WORK_DIR = "/tmp/court-sessions-sharded"
MAX_RETRIES = 3
DEADLOCK_RETRIES = 5

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


def run_sql(sql, quiet=False, timeout=600):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME]
    if quiet:
        cmd.append("-q")
    cmd.extend(["-c", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def run_sql_value(sql, timeout=1800):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql]
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


def download_revision(url, dest_path):
    for attempt in range(MAX_RETRIES):
        try:
            result = subprocess.run(
                ["curl", "-sS", "-L",
                 "--connect-timeout", "30", "--max-time", "600",
                 "-o", dest_path, url],
                capture_output=True, text=True, timeout=660
            )
            if result.returncode == 0 and os.path.getsize(dest_path) > 1_000_000:
                return os.path.getsize(dest_path)
            print(f"      [!] retry {attempt+1}")
        except subprocess.TimeoutExpired:
            print(f"      [!] timeout, retry {attempt+1}")
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("Download failed")


def copy_csv_to_staging(filepath, staging_table):
    cmd = (
        f"tail -n +2 '{filepath}' | "
        f"docker exec -i {DB_CONTAINER} psql -U {DB_USER} -d {DB_NAME} -q -c "
        f"\"COPY {staging_table} (hearing_date, judges, case_number, court_name, court_room, case_involved, case_description) "
        f"FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\\\"')\""
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=1200)
    if result.returncode != 0:
        raise RuntimeError(f"COPY error: {result.stderr.strip()[:500]}")


def merge_staging_to_shard(staging_table, shard_table, revision_date):
    sql = f"""
        INSERT INTO {shard_table} (
            id, case_number, court_name, judge_name,
            session_date, session_time, session_place,
            involved_parties, first_seen_date, last_seen_date,
            created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            case_number, court_name, judges,
            session_date, session_time, court_room, case_involved,
            '{revision_date}'::date, '{revision_date}'::date,
            NOW(), NOW()
        FROM (
            SELECT DISTINCT ON (case_number, session_date, COALESCE(court_name, ''), COALESCE(judges, ''))
                case_number, court_name, judges,
                CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                    THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                    ELSE NULL END AS session_date,
                CASE WHEN hearing_date ~ '\\d{{2}}:\\d{{2}}'
                    THEN substring(hearing_date from '\\d{{2}}:\\d{{2}}')
                    ELSE NULL END AS session_time,
                NULLIF(court_room, '') AS court_room,
                NULLIF(case_involved, '') AS case_involved
            FROM {staging_table}
            WHERE case_number IS NOT NULL AND case_number != ''
              AND hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
            ORDER BY case_number, session_date, COALESCE(court_name, ''), COALESCE(judges, '')
        ) deduped
        WHERE session_date IS NOT NULL
        ON CONFLICT (case_number, session_date, COALESCE(court_name, ''), COALESCE(judge_name, ''))
        DO UPDATE SET
            last_seen_date = GREATEST({shard_table}.last_seen_date, EXCLUDED.last_seen_date),
            first_seen_date = LEAST({shard_table}.first_seen_date, EXCLUDED.first_seen_date),
            updated_at = NOW()
        WHERE {shard_table}.last_seen_date IS NULL
           OR {shard_table}.last_seen_date < EXCLUDED.last_seen_date;
    """
    for attempt in range(DEADLOCK_RETRIES):
        try:
            run_sql_value(sql, timeout=1800)
            return
        except RuntimeError as e:
            if "deadlock" in str(e).lower() or "lock timeout" in str(e).lower():
                time.sleep(2 ** attempt)
            else:
                raise
    raise RuntimeError(f"Lock conflict persisted for {revision_date}")


def setup_shard(shard_id, workers_per_shard):
    shard_table = f"court_sessions_shard_{shard_id}"
    run_sql(f"""
        DROP TABLE IF EXISTS {shard_table};
        CREATE UNLOGGED TABLE {shard_table} (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            case_number varchar(255),
            court_name text,
            judge_name text,
            session_date date,
            session_time varchar(50),
            session_place text,
            involved_parties text,
            first_seen_date date,
            last_seen_date date,
            created_at timestamp DEFAULT NOW(),
            updated_at timestamp DEFAULT NOW()
        );
        CREATE UNIQUE INDEX idx_shard_{shard_id}_dedup
        ON {shard_table} (case_number, session_date, COALESCE(court_name, ''), COALESCE(judge_name, ''));
    """, quiet=True)

    for w in range(workers_per_shard):
        stg = f"_stg_s{shard_id}_w{w}"
        run_sql(f"""
            DROP TABLE IF EXISTS {stg};
            CREATE UNLOGGED TABLE {stg} (
                hearing_date TEXT, judges TEXT, case_number TEXT,
                court_name TEXT, court_room TEXT, case_involved TEXT, case_description TEXT
            );
        """, quiet=True)


def process_revision(shard_id, worker_id, rev_idx, total_in_shard, revision, stats, merge_lock):
    if shutdown_requested:
        return

    rev_date = parse_revision_date(revision["url"])
    if not rev_date:
        return

    shard_table = f"court_sessions_shard_{shard_id}"
    staging_table = f"_stg_s{shard_id}_w{worker_id}"
    csv_path = os.path.join(WORK_DIR, f"s{shard_id}_w{worker_id}_{rev_date}.csv")

    imp, err = stats.snapshot()
    elapsed = time.time() - stats.start_time
    rate = imp / elapsed if elapsed > 0 and imp > 0 else 0
    remaining = total_in_shard - imp
    eta = remaining / rate if rate > 0 else 0
    eta_str = f"{eta/3600:.1f}h" if eta > 3600 else f"{eta/60:.0f}m"

    print(f"  [S{shard_id}:W{worker_id}] {rev_date} | {imp}/{total_in_shard} err={err} | ETA ~{eta_str}", flush=True)

    try:
        download_revision(revision["url"], csv_path)
        run_sql(f"TRUNCATE {staging_table};", quiet=True)
        copy_csv_to_staging(csv_path, staging_table)
        with merge_lock:
            merge_staging_to_shard(staging_table, shard_table, rev_date)
        stats.inc_imported()
    except Exception as e:
        stats.inc_error()
        print(f"  [S{shard_id}:W{worker_id}] [!] {rev_date}: {str(e)[:200]}")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def run_shard(shard_id, revisions_slice, workers_per_shard):
    """Run one shard as a separate process."""
    total = len(revisions_slice)
    merge_lock = threading.Lock()
    stats = Stats(shard_id)

    print(f"[S{shard_id}] Starting: {total} revisions, {workers_per_shard} workers")

    with ThreadPoolExecutor(max_workers=workers_per_shard) as executor:
        futures = {}
        wcycle = 0
        for i, rev in enumerate(revisions_slice):
            if shutdown_requested:
                break
            wid = wcycle % workers_per_shard
            wcycle += 1
            f = executor.submit(process_revision, shard_id, wid, i, total, rev, stats, merge_lock)
            futures[f] = i
            while len([f for f in futures if not f.done()]) >= workers_per_shard * 2:
                time.sleep(0.5)
                if shutdown_requested:
                    break
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"  [S{shard_id}] Unexpected: {e}")

    imp, err = stats.snapshot()
    elapsed = time.time() - stats.start_time
    count = run_sql_value(f"SELECT count(*) FROM court_sessions_shard_{shard_id};")
    print(f"\n[S{shard_id}] DONE: {imp} imported, {err} errors, {count} rows, {elapsed/60:.0f}m")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shards", type=int, default=4)
    parser.add_argument("--workers-per-shard", type=int, default=8)
    parser.add_argument("--start", type=int, default=1052)
    parser.add_argument("--end", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    os.makedirs(WORK_DIR, exist_ok=True)

    print("[*] Fetching revisions...")
    all_revisions = fetch_revisions()
    total = len(all_revisions)
    end_idx = args.end if args.end > 0 else total
    revisions = all_revisions[args.start:end_idx]

    print(f"[*] Total: {len(revisions)} revisions (idx {args.start}-{end_idx-1})")
    print(f"[*] Shards: {args.shards}, workers/shard: {args.workers_per_shard}")
    print(f"[*] Total parallel downloads: {args.shards * args.workers_per_shard}")

    # Split into shards
    chunk_size = len(revisions) // args.shards
    shard_slices = []
    for i in range(args.shards):
        start = i * chunk_size
        end = start + chunk_size if i < args.shards - 1 else len(revisions)
        shard_slices.append(revisions[start:end])
        d0 = parse_revision_date(revisions[start]["url"])
        d1 = parse_revision_date(revisions[end-1]["url"])
        print(f"  Shard {i}: {len(shard_slices[i])} revisions ({d0} → {d1})")

    if args.dry_run:
        return

    # Setup shard tables
    print("\n[*] Setting up shard tables...")
    for i in range(args.shards):
        setup_shard(i, args.workers_per_shard)
    print("[+] All shard tables ready\n")

    # Launch shards as separate processes
    processes = []
    for i in range(args.shards):
        p = Process(target=run_shard, args=(i, shard_slices[i], args.workers_per_shard))
        p.start()
        processes.append(p)

    for p in processes:
        p.join()

    # Report
    print(f"\n{'='*60}")
    print("All shards complete! Shard counts:")
    total_rows = 0
    for i in range(args.shards):
        count = int(run_sql_value(f"SELECT count(*) FROM court_sessions_shard_{i};"))
        total_rows += count
        print(f"  Shard {i}: {count:,}")
    print(f"  Total across shards: {total_rows:,}")
    print(f"\nTo merge into prod, run the merge step.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
