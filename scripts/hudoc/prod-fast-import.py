#!/usr/bin/env python3
"""
Fast import on prod: raw COPY without indexes, dedup at the end.
Downloads directly on prod (no SSH overhead).
Revisions 0-1052 (first half).
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
DB_CONTAINER = "secondlayer-postgres-prod"
DB_USER = "secondlayer"
DB_NAME = "secondlayer_prod"
WORK_DIR = "/tmp/court-sessions-fast"
MAX_RETRIES = 3

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


def run_sql(sql, quiet=False, timeout=3600):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME]
    if quiet:
        cmd.append("-q")
    cmd.extend(["-c", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def run_sql_value(sql, timeout=3600):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def fetch_revisions():
    json_path = "/tmp/revisions.json"
    result = subprocess.run(
        ["curl", "-sS", "--connect-timeout", "30", "--max-time", "120",
         "--retry", "3", "--retry-delay", "5",
         "-o", json_path, API_URL],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"API fetch failed: {result.stderr}")
    with open(json_path) as f:
        data = json.load(f)
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
        except subprocess.TimeoutExpired:
            pass
        time.sleep(3 * (attempt + 1))
    raise RuntimeError("Download failed")


def copy_csv_direct(filepath, shard_table, revision_date):
    cmd = (
        f"tail -n +2 '{filepath}' | "
        f"sed 's/$/\\t{revision_date}/' | "
        f"docker exec -i {DB_CONTAINER} psql -U {DB_USER} -d {DB_NAME} -q -c "
        f"\"COPY {shard_table} (hearing_date, judges, case_number, court_name, court_room, case_involved, case_description, revision_date) "
        f"FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\\\"')\""
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=1200)
    if result.returncode != 0:
        raise RuntimeError(f"COPY error: {result.stderr.strip()[:500]}")


def tune_pg():
    print("[*] Tuning PG for import...")
    for sql in [
        "ALTER SYSTEM SET synchronous_commit = off;",
        "ALTER SYSTEM SET work_mem = '256MB';",
        "ALTER SYSTEM SET maintenance_work_mem = '2GB';",
        "ALTER SYSTEM SET max_wal_size = '4GB';",
        "SELECT pg_reload_conf();",
    ]:
        try:
            run_sql(sql, quiet=True)
        except Exception as e:
            print(f"  Warning: {str(e)[:100]}")


def restore_pg():
    print("[*] Restoring PG settings...")
    for sql in [
        "ALTER SYSTEM SET synchronous_commit = on;",
        "ALTER SYSTEM SET work_mem = '4MB';",
        "ALTER SYSTEM SET maintenance_work_mem = '64MB';",
        "SELECT pg_reload_conf();",
    ]:
        try:
            run_sql(sql, quiet=True)
        except:
            pass


def setup_shard(shard_id):
    shard_table = f"court_raw_{shard_id}"
    run_sql(f"""
        DROP TABLE IF EXISTS {shard_table};
        CREATE UNLOGGED TABLE {shard_table} (
            hearing_date TEXT, judges TEXT, case_number TEXT,
            court_name TEXT, court_room TEXT, case_involved TEXT,
            case_description TEXT, revision_date DATE
        );
    """, quiet=True)


def process_revision(shard_id, worker_id, rev_idx, total_in_shard, revision, stats):
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
        download_revision(revision["url"], csv_path)
        copy_csv_direct(csv_path, shard_table, rev_date)
        stats.inc_imported()
    except Exception as e:
        stats.inc_error()
        print(f"  [S{shard_id}:W{worker_id}] [!] {rev_date}: {str(e)[:200]}")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def run_shard(shard_id, revisions_slice, workers_per_shard):
    total = len(revisions_slice)
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
            f = executor.submit(process_revision, shard_id, wid, i, total, rev, stats)
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
    count = run_sql_value(f"SELECT count(*) FROM court_raw_{shard_id};")
    print(f"\n[S{shard_id}] DONE: {imp} imported, {err} errors, {count} raw rows, {elapsed/60:.0f}m")


def dedup_and_merge():
    """Dedup all raw shards and merge into court_sessions."""
    print("\n[*] Phase 2: Dedup and merge into court_sessions...")

    # Count shards
    shards = []
    for i in range(20):
        try:
            run_sql_value(f"SELECT 1 FROM court_raw_{i} LIMIT 1;")
            shards.append(i)
        except:
            break

    if not shards:
        print("  No raw shards found!")
        return

    # Build UNION ALL of all shards
    union_parts = []
    for i in shards:
        union_parts.append(f"SELECT * FROM court_raw_{i}")
    union_sql = " UNION ALL ".join(union_parts)

    print(f"  Merging {len(shards)} shards...")

    run_sql(f"""
        SET lock_timeout = 0;
        SET work_mem = '512MB';
        INSERT INTO court_sessions (id, case_number, court_name, judge_name,
            session_date, session_time, session_place, involved_parties,
            first_seen_date, last_seen_date, created_at, updated_at)
        SELECT gen_random_uuid(), case_number, court_name, judge_name,
            session_date, session_time, session_place, involved_parties,
            first_seen_date, last_seen_date, NOW(), NOW()
        FROM (
            SELECT DISTINCT ON (case_number, session_date, COALESCE(court_name, ''), COALESCE(judges, ''))
                case_number, court_name, judges AS judge_name,
                CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                    THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                    ELSE NULL END AS session_date,
                CASE WHEN hearing_date ~ '\\d{{2}}:\\d{{2}}'
                    THEN substring(hearing_date from '\\d{{2}}:\\d{{2}}')
                    ELSE NULL END AS session_time,
                NULLIF(court_room, '') AS session_place,
                NULLIF(case_involved, '') AS involved_parties,
                MIN(revision_date) OVER w AS first_seen_date,
                MAX(revision_date) OVER w AS last_seen_date
            FROM ({union_sql}) raw
            WHERE case_number IS NOT NULL AND case_number != ''
              AND hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
            WINDOW w AS (PARTITION BY case_number,
                CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                    THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                    ELSE NULL END,
                COALESCE(court_name, ''), COALESCE(judges, ''))
            ORDER BY case_number,
                CASE WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                    THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                    ELSE NULL END,
                COALESCE(court_name, ''), COALESCE(judges, '')
        ) deduped
        WHERE session_date IS NOT NULL
        ON CONFLICT (case_number, session_date, COALESCE(court_name, ''), COALESCE(judge_name, ''))
        DO UPDATE SET
            last_seen_date = GREATEST(court_sessions.last_seen_date, EXCLUDED.last_seen_date),
            first_seen_date = LEAST(court_sessions.first_seen_date, EXCLUDED.first_seen_date),
            updated_at = NOW()
        WHERE court_sessions.last_seen_date IS NULL
           OR court_sessions.last_seen_date < EXCLUDED.last_seen_date;
    """, quiet=True, timeout=7200)

    final = run_sql_value("SELECT count(*) FROM court_sessions;")
    print(f"  Final court_sessions: {final}")

    # Cleanup raw tables
    for i in shards:
        run_sql(f"DROP TABLE IF EXISTS court_raw_{i};", quiet=True)
    print("  Raw tables dropped.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shards", type=int, default=8)
    parser.add_argument("--workers-per-shard", type=int, default=8)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=1052)
    parser.add_argument("--phase", choices=["all", "load", "dedup"], default="all")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    os.makedirs(WORK_DIR, exist_ok=True)

    if args.phase in ("all", "load"):
        print("[*] Fetching revisions...")
        all_revisions = fetch_revisions()
        end_idx = args.end if args.end > 0 else len(all_revisions)
        revisions = all_revisions[args.start:end_idx]

        print(f"[*] Total: {len(revisions)} revisions (idx {args.start}-{end_idx-1})")
        print(f"[*] Shards: {args.shards}, workers/shard: {args.workers_per_shard}")

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

        tune_pg()

        print("\n[*] Setting up shard tables...")
        for i in range(args.shards):
            setup_shard(i)
        print("[+] Ready\n")

        start_time = time.time()
        processes = []
        for i in range(args.shards):
            p = Process(target=run_shard, args=(i, shard_slices[i], args.workers_per_shard))
            p.start()
            processes.append(p)

        for p in processes:
            p.join()

        elapsed = time.time() - start_time
        print(f"\n[*] Phase 1 (COPY) complete in {elapsed/60:.0f}m")

        total_raw = 0
        for i in range(args.shards):
            c = int(run_sql_value(f"SELECT count(*) FROM court_raw_{i};"))
            total_raw += c
            print(f"  court_raw_{i}: {c:,}")
        print(f"  Total raw: {total_raw:,}")

    if args.phase in ("all", "dedup"):
        dedup_and_merge()
        restore_pg()

    print(f"\n{'='*60}")
    final = run_sql_value("SELECT count(*) FROM court_sessions;")
    print(f"DONE! court_sessions: {final}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
