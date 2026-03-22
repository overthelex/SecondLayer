#!/usr/bin/env python3
"""
Local import of court session revisions (second half: 1052-2104).
Same logic as prod script but targets local docker postgres.
After completion, dump and merge into prod.
"""

import subprocess
import json
import sys
import os
import time
import argparse
import signal
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

RESOURCE_ID = "98d6ba0d-1c18-4835-ae68-bfc0af724bfa"
API_URL = f"https://data.gov.ua/api/3/action/resource_show?id={RESOURCE_ID}"
DB_CONTAINER = "secondlayer-postgres-local"
DB_USER = "secondlayer"
DB_NAME = "secondlayer_local"
WORK_DIR = "/tmp/court-sessions-import-local"
MAX_RETRIES = 3
DEADLOCK_RETRIES = 5

shutdown_requested = False
merge_lock = threading.Lock()

def signal_handler(sig, frame):
    global shutdown_requested
    print("\n[!] Shutdown requested, finishing current revisions...")
    shutdown_requested = True

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


class Stats:
    def __init__(self):
        self._lock = threading.Lock()
        self.imported = 0
        self.skipped = 0
        self.errors = 0
        self.start_time = time.time()

    def inc_imported(self):
        with self._lock:
            self.imported += 1

    def inc_error(self):
        with self._lock:
            self.errors += 1

    def inc_skipped(self):
        with self._lock:
            self.skipped += 1

    def snapshot(self):
        with self._lock:
            return self.imported, self.skipped, self.errors


def run_sql(sql, quiet=False, timeout=600):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME]
    if quiet:
        cmd.append("-q")
    cmd.extend(["-c", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()}")
    return result.stdout.strip()


def run_sql_value(sql, timeout=1800):
    cmd = ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"SQL error: {result.stderr.strip()}")
    return result.stdout.strip()


def fetch_revisions():
    print("[*] Fetching revision list from data.gov.ua API...")
    result = subprocess.run(
        ["curl", "-sS", "--connect-timeout", "30", "--max-time", "120", API_URL],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"API fetch failed: {result.stderr}")
    data = json.loads(result.stdout)
    revisions = data["result"]["resource_revisions"]
    revisions.reverse()  # oldest first
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
            if result.returncode == 0:
                size = os.path.getsize(dest_path)
                if size > 1_000_000:
                    return size
                else:
                    print(f"    [!] Too small ({size} bytes), retry {attempt+1}")
            else:
                print(f"    [!] curl failed, retry {attempt+1}")
        except subprocess.TimeoutExpired:
            print(f"    [!] Timeout, retry {attempt+1}")
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Failed to download after {MAX_RETRIES} attempts")


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


def merge_staging_to_main(staging_table, revision_date):
    sql = f"""
        INSERT INTO court_sessions (
            id, case_number, court_name, judge_name,
            session_date, session_time, session_place,
            involved_parties, first_seen_date, last_seen_date,
            created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            case_number,
            court_name,
            judges,
            session_date,
            session_time,
            court_room,
            case_involved,
            '{revision_date}'::date,
            '{revision_date}'::date,
            NOW(),
            NOW()
        FROM (
            SELECT DISTINCT ON (case_number, session_date, COALESCE(court_name, ''), COALESCE(judges, ''))
                case_number,
                court_name,
                judges,
                CASE
                    WHEN hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
                    THEN to_date(substring(hearing_date from 1 for 10), 'DD.MM.YYYY')
                    ELSE NULL
                END AS session_date,
                CASE
                    WHEN hearing_date ~ '\\d{{2}}:\\d{{2}}'
                    THEN substring(hearing_date from '\\d{{2}}:\\d{{2}}')
                    ELSE NULL
                END AS session_time,
                NULLIF(court_room, '') AS court_room,
                NULLIF(case_involved, '') AS case_involved
            FROM {staging_table}
            WHERE case_number IS NOT NULL
              AND case_number != ''
              AND hearing_date ~ '^\\d{{2}}\\.\\d{{2}}\\.\\d{{4}}'
            ORDER BY case_number, session_date, COALESCE(court_name, ''), COALESCE(judges, '')
        ) deduped
        WHERE session_date IS NOT NULL
        ON CONFLICT (case_number, session_date, COALESCE(court_name, ''), COALESCE(judge_name, ''))
        DO UPDATE SET
            last_seen_date = GREATEST(court_sessions.last_seen_date, EXCLUDED.last_seen_date),
            first_seen_date = LEAST(court_sessions.first_seen_date, EXCLUDED.first_seen_date),
            updated_at = NOW()
        WHERE court_sessions.last_seen_date IS NULL
           OR court_sessions.last_seen_date < EXCLUDED.last_seen_date;
    """
    for attempt in range(DEADLOCK_RETRIES):
        try:
            run_sql_value(sql, timeout=1800)
            return
        except RuntimeError as e:
            err_msg = str(e)
            if "deadlock" in err_msg.lower() or "lock timeout" in err_msg.lower():
                wait = 3 ** attempt + (threading.current_thread().ident % 5)
                print(f"    [D] Lock conflict on {revision_date}, retry {attempt+1} in {wait:.0f}s")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Deadlock persisted after {DEADLOCK_RETRIES} retries for {revision_date}")


def setup_tables(num_workers):
    print("[*] Preparing local database tables...")

    run_sql("""
        DO $$ BEGIN
            ALTER TABLE court_sessions ADD COLUMN IF NOT EXISTS first_seen_date DATE;
            ALTER TABLE court_sessions ADD COLUMN IF NOT EXISTS last_seen_date DATE;
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """, quiet=True)

    run_sql("""
        SET lock_timeout = 0;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_court_sessions_dedup
        ON court_sessions (case_number, session_date, COALESCE(court_name, ''), COALESCE(judge_name, ''));
    """, quiet=True)

    for i in range(num_workers):
        tbl = f"_cs_staging_{i}"
        run_sql(f"""
            DROP TABLE IF EXISTS {tbl};
            CREATE UNLOGGED TABLE {tbl} (
                hearing_date    TEXT,
                judges          TEXT,
                case_number     TEXT,
                court_name      TEXT,
                court_room      TEXT,
                case_involved   TEXT,
                case_description TEXT
            );
        """, quiet=True)

    print(f"[+] Tables ready ({num_workers} staging tables)")


def cleanup_staging(num_workers):
    for i in range(num_workers):
        run_sql(f"DROP TABLE IF EXISTS _cs_staging_{i};", quiet=True)


def process_revision(worker_id, rev_idx, total, revision, stats):
    if shutdown_requested:
        return

    rev_date = parse_revision_date(revision["url"])
    rev_size_mb = revision["size"] / 1e6
    staging_table = f"_cs_staging_{worker_id}"

    if not rev_date:
        stats.inc_skipped()
        return

    imp, skip, err = stats.snapshot()
    elapsed = time.time() - stats.start_time
    done = imp + skip + err
    rate = done / elapsed if elapsed > 0 and done > 0 else 0
    remaining = total - rev_idx
    eta = remaining / rate if rate > 0 else 0
    eta_str = f"{eta/3600:.1f}h" if eta > 3600 else f"{eta/60:.0f}m"

    print(f"  [W{worker_id}] [{rev_idx+1}/{total}] {rev_date} ({rev_size_mb:.0f}MB) | done={imp} err={err} | ETA ~{eta_str}", flush=True)

    csv_path = os.path.join(WORK_DIR, f"w{worker_id}_{rev_date}.csv")

    try:
        download_revision(revision["url"], csv_path)
        run_sql(f"TRUNCATE {staging_table};", quiet=True)
        copy_csv_to_staging(csv_path, staging_table)
        with merge_lock:
            merge_staging_to_main(staging_table, rev_date)
        stats.inc_imported()
    except Exception as e:
        stats.inc_error()
        print(f"  [W{worker_id}] [!] Error on {rev_date}: {str(e)[:300]}")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--start", type=int, default=1052, help="Start from revision index (default: 1052 = second half)")
    parser.add_argument("--end", type=int, default=0, help="End at revision index (0=all)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    num_workers = args.workers
    os.makedirs(WORK_DIR, exist_ok=True)

    revisions = fetch_revisions()
    total = len(revisions)
    end_idx = args.end if args.end > 0 else total
    work_range = list(range(args.start, min(end_idx, total)))

    slice_gb = sum(revisions[i]["size"] for i in work_range) / 1e9
    print(f"[*] Total revisions: {total}, processing {len(work_range)} (idx {args.start}-{end_idx-1})")
    print(f"[*] Download size for slice: {slice_gb:.1f} GB (streaming)")
    print(f"[*] Workers: {num_workers}")

    if args.dry_run:
        for i in work_range[:5]:
            print(f"  {i}: {parse_revision_date(revisions[i]['url'])} ({revisions[i]['size']/1e6:.0f} MB)")
        print(f"  ... and {len(work_range) - 5} more")
        return

    setup_tables(num_workers)

    current_count = int(run_sql_value("SELECT count(*) FROM court_sessions;"))
    print(f"[*] Current rows in local court_sessions: {current_count:,}")

    stats = Stats()
    print(f"\n[*] Starting {num_workers} workers for {len(work_range)} revisions...\n")

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {}
        worker_cycle = 0

        for rev_idx in work_range:
            if shutdown_requested:
                break
            worker_id = worker_cycle % num_workers
            worker_cycle += 1
            f = executor.submit(process_revision, worker_id, rev_idx, total, revisions[rev_idx], stats)
            futures[f] = rev_idx

            while len([f for f in futures if not f.done()]) >= num_workers * 2:
                time.sleep(0.5)
                if shutdown_requested:
                    break

        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"  [!] Unexpected error: {e}")

    cleanup_staging(num_workers)

    final_count = int(run_sql_value("SELECT count(*) FROM court_sessions;"))
    imp, skip, err = stats.snapshot()
    elapsed = time.time() - stats.start_time

    print(f"\n{'='*60}")
    print(f"LOCAL import complete!")
    print(f"  Revisions processed: {imp}")
    print(f"  Errors:              {err}")
    print(f"  Final row count:     {final_count:,}")
    print(f"  New rows:            {final_count - current_count:,}")
    print(f"  Time:                {elapsed/3600:.1f}h ({elapsed/60:.0f}m)")
    print(f"{'='*60}")
    print(f"\nNext step: dump and merge into prod:")
    print(f"  docker exec secondlayer-postgres-local pg_dump -U secondlayer -d secondlayer_local -t court_sessions --data-only | ssh prod 'docker exec -i secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod'")


if __name__ == "__main__":
    main()
