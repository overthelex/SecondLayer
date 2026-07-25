#!/usr/bin/env python3
"""Full-registry harvester for the NIPO/UIPV SIS open-data API.

Unlike download_nipo.py (which only pulled registered trademarks + inventions
for the 2024-2026 window into one big in-memory JSON), this harvester covers:

  * all four object types  - inventions(1), utility models(2), trademarks(4),
                             industrial designs(6);
  * both object states     - applications (obj_state=1, filtered by app_date)
                             AND registered protection documents
                             (obj_state=2, filtered by reg_date);
  * the full history        - trademarks/inventions back to ~1993, utility
                             models/designs back to ~1994 (empty early windows
                             cost one request and are cached as empty).

Design notes:
  * The SIS API is a single origin behind Cloudflare with a ~1 req/sec limit.
    We therefore go sequential at a configurable rate (default 1.0s between
    requests). Do NOT crank concurrency against one egress IP - use the
    existing import-uipv-multi-ip.py path if you need multi-IP speed.
  * Resumable by construction: work is split into per (type, state, month)
    windows. Each finished window is written to its own NDJSON file via a
    tmp-file + atomic rename. On re-run, any window whose output file already
    exists is skipped - so an interrupted run re-fetches only the one window
    that was in flight, never duplicating records.
  * Output is NDJSON (one raw API record per line), the natural input for the
    downstream Postgres importer (task #2).

Usage:
  python3 harvest_nipo.py                       # everything, full history
  python3 harvest_nipo.py --obj-types 4         # trademarks only
  python3 harvest_nipo.py --obj-states 1        # applications only
  python3 harvest_nipo.py --start-year 2024     # narrow the range
  python3 harvest_nipo.py --updated-since 01.01.2026   # incremental sync
  python3 harvest_nipo.py --rate 1.5            # be gentler on the API
"""

import argparse
import calendar
import http.client
import json
import math
import os
import time
import urllib.request
from urllib.request import Request
from urllib.error import URLError, HTTPError

BASE_URL = "https://sis.nipo.gov.ua/api/v1/open-data/"

# Optional source-IP binding, so multiple shards on a multi-homed host (e.g.
# prod with N secondary IPs → N distinct public egress IPs) can each run at the
# SIS per-IP rate limit for near-linear speedup. Set once from --source-ip.
_SOURCE_IP = None


class _BoundHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *a, **k):
        if _SOURCE_IP:
            k.setdefault("source_address", (_SOURCE_IP, 0))
        super().__init__(*a, **k)


class _BoundHTTPConnection(http.client.HTTPConnection):
    def __init__(self, *a, **k):
        if _SOURCE_IP:
            k.setdefault("source_address", (_SOURCE_IP, 0))
        super().__init__(*a, **k)


class _BoundHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_BoundHTTPSConnection, req)


class _BoundHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_BoundHTTPConnection, req)


_OPENER = urllib.request.build_opener(_BoundHTTPSHandler(), _BoundHTTPHandler())
DEFAULT_OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "harvest")
MAX_RETRIES = 7

# obj_type -> (folder/slug, first year the register has data)
OBJ_TYPES = {
    1: ("inventions", 1993),
    2: ("utility_models", 1994),
    4: ("trademarks", 1993),
    6: ("designs", 1993),
}

# obj_state -> (folder/slug, date field used to window the query)
OBJ_STATES = {
    1: ("applications", "app_date"),
    2: ("registered", "reg_date"),
}


def log(msg):
    print(msg, flush=True)


def fetch_json(url, rate):
    """Fetch one JSON page with retries + exponential backoff.

    Sleeps `rate` seconds BEFORE every network call so the global request rate
    never exceeds 1/`rate` regardless of how many windows we walk.
    """
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(rate)
            req = Request(url, headers={"Accept": "application/json",
                                        "User-Agent": "Mozilla/5.0 (SecondLayer NIPO harvester)"})
            with _OPENER.open(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (URLError, HTTPError, TimeoutError, ConnectionError, OSError) as e:
            wait = min(2 ** attempt + 1, 60)
            if "429" in str(e) or "503" in str(e):
                wait = max(wait, 10)
            if attempt < MAX_RETRIES - 1:
                log(f"      retry {attempt + 1}/{MAX_RETRIES} in {wait}s ({e})")
                time.sleep(wait)
            else:
                raise
    return None


def iter_window_records(obj_type, obj_state, date_field, d_from, d_to, rate,
                        updated_since=None):
    """Yield every record for one (type, state, date-window) by following the
    API's `next` cursor. Returns (records, api_count)."""
    params = [f"obj_type={obj_type}", f"obj_state={obj_state}"]
    if d_from and d_to:
        params.append(f"{date_field}_from={d_from}")
        params.append(f"{date_field}_to={d_to}")
    if updated_since:
        params.append(f"last_update_from={updated_since}")
    url = f"{BASE_URL}?{'&'.join(params)}"

    first = fetch_json(url, rate)
    if first is None:
        raise RuntimeError("no response for first page")
    total = first.get("count", 0)
    records = list(first.get("results", []))
    if total == 0:
        return records, 0

    total_pages = math.ceil(total / max(len(records), 1)) if records else 1
    page = 1
    nxt = first.get("next")
    while nxt:
        page += 1
        if nxt.startswith("http://"):
            nxt = "https://" + nxt[len("http://"):]  # keep TLS + consistent binding
        data = fetch_json(nxt, rate)
        if data is None:
            log(f"      page {page}/{total_pages} empty response, stopping window")
            break
        records.extend(data.get("results", []))
        nxt = data.get("next")

    return records, total


def month_windows(start_year, end_year, end_month):
    """Generate (d_from, d_to) monthly windows from Jan start_year to
    end_month/end_year inclusive, as DD.MM.YYYY strings."""
    windows = []
    for y in range(start_year, end_year + 1):
        for m in range(1, 13):
            if y == end_year and m > end_month:
                break
            last = calendar.monthrange(y, m)[1]
            windows.append((f"01.{m:02d}.{y}", f"{last:02d}.{m:02d}.{y}", f"{y}-{m:02d}"))
    return windows


def write_window(path, records):
    """Atomically write a window's records as NDJSON (empty file if none)."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False))
            f.write("\n")
    os.replace(tmp, path)


def harvest(args):
    obj_types = [int(x) for x in args.obj_types.split(",")] if args.obj_types else list(OBJ_TYPES)
    obj_states = [int(x) for x in args.obj_states.split(",")] if args.obj_states else list(OBJ_STATES)

    grand_total = 0
    grand_windows = 0
    grand_skipped = 0
    start = time.time()

    for obj_type in obj_types:
        type_slug, type_start = OBJ_TYPES[obj_type]
        for obj_state in obj_states:
            state_slug, date_field = OBJ_STATES[obj_state]
            out_dir = os.path.join(args.out_dir, type_slug, state_slug)
            os.makedirs(out_dir, exist_ok=True)

            # Incremental sync: one wide window filtered by last_update.
            if args.updated_since:
                path = os.path.join(out_dir, f"updated_since_{args.updated_since.replace('.', '')}.ndjson")
                recs, count = iter_window_records(
                    obj_type, obj_state, date_field, None, None, args.rate,
                    updated_since=args.updated_since)
                write_window(path, recs)
                grand_total += len(recs)
                grand_windows += 1
                log(f"[{type_slug}/{state_slug}] updated since {args.updated_since}: "
                    f"{len(recs)} records (api count={count})")
                continue

            start_year = args.start_year or type_start
            windows = month_windows(start_year, args.end_year, args.end_month)
            type_total = 0
            for i, (d_from, d_to, tag) in enumerate(windows, 1):
                path = os.path.join(out_dir, f"{tag}.ndjson")
                if os.path.exists(path):
                    grand_skipped += 1
                    continue
                try:
                    recs, count = iter_window_records(
                        obj_type, obj_state, date_field, d_from, d_to, args.rate)
                    write_window(path, recs)
                    type_total += len(recs)
                    grand_total += len(recs)
                    grand_windows += 1
                    if recs:
                        log(f"[{type_slug}/{state_slug}] {i}/{len(windows)} {tag}: "
                            f"+{len(recs)} (type total {type_total})")
                except Exception as e:
                    log(f"[{type_slug}/{state_slug}] {tag} FAILED (will retry next run): {e}")
            log(f"[{type_slug}/{state_slug}] window sweep done: {type_total} new records")

    elapsed = time.time() - start
    log(f"\nDONE: {grand_total} records across {grand_windows} fetched windows "
        f"({grand_skipped} windows skipped as already done) in {elapsed:.0f}s")
    log(f"Output NDJSON tree: {args.out_dir}")


def parse_args():
    p = argparse.ArgumentParser(description="Harvest the full NIPO/UIPV registry via the SIS open-data API.")
    p.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="output root for NDJSON tree")
    p.add_argument("--obj-types", default="", help="comma list of obj_type ids (default: 1,2,4,6)")
    p.add_argument("--obj-states", default="", help="comma list of obj_state ids (default: 1,2)")
    p.add_argument("--start-year", type=int, default=0, help="override per-type start year")
    p.add_argument("--end-year", type=int, default=2026, help="last year to harvest (inclusive)")
    p.add_argument("--end-month", type=int, default=12, help="last month of end-year (inclusive)")
    p.add_argument("--rate", type=float, default=1.0, help="seconds between requests (>=1.0 recommended)")
    p.add_argument("--source-ip", default="", help="bind outbound socket to this local IP (multi-IP sharding)")
    p.add_argument("--updated-since", default="", help="DD.MM.YYYY incremental sync by last_update")
    args = p.parse_args()
    args.updated_since = args.updated_since or None
    return args


if __name__ == "__main__":
    a = parse_args()
    if a.source_ip:
        _SOURCE_IP = a.source_ip
    log("NIPO/UIPV full-registry harvester")
    log(f"  types={a.obj_types or 'all(1,2,4,6)'} states={a.obj_states or 'all(1,2)'} "
        f"rate={a.rate}s src_ip={a.source_ip or 'default'} out={a.out_dir}")
    harvest(a)
