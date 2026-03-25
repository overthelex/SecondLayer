#!/usr/bin/env python3
"""
Bulk import NKCPFR major shareholders (5%+) from nssmc.gov.ua API.
Fetches all АТ/ПАТ/ПрАТ EDRPOU codes from OpenReyestr DB,
then queries NSSMC API in parallel with rate limiting.

Usage:
  python3 nkcpfr-bulk-import.py [--workers 20] [--report-date 2025-12-31]

Env:
  MAIN_DB_HOST, MAIN_DB_PORT, MAIN_DB_NAME, MAIN_DB_USER, MAIN_DB_PASS
  OR_DB_HOST, OR_DB_PORT, OR_DB_NAME, OR_DB_USER, OR_DB_PASS
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime

import aiohttp
import psycopg2
from psycopg2.extras import execute_values

# ── Config ──────────────────────────────────────────────────────────────
API_URL = "https://www.nssmc.gov.ua/api/owners"
CHECKPOINT_FILE = "/tmp/nkcpfr-bulk-checkpoint.json"

def get_args():
    p = argparse.ArgumentParser()
    p.add_argument("--workers", type=int, default=20)
    p.add_argument("--report-date", default="2025-12-31")
    p.add_argument("--report-dates", default="2025-12-31,2025-09-30,2025-06-30,2025-03-31,2024-12-31,2024-09-30,2024-06-30,2024-03-31")
    p.add_argument("--resume", action="store_true")
    return p.parse_args()

def get_main_db():
    return psycopg2.connect(
        host=os.environ.get("MAIN_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("MAIN_DB_PORT", "5438")),
        dbname=os.environ.get("MAIN_DB_NAME", "secondlayer_prod"),
        user=os.environ.get("MAIN_DB_USER", "secondlayer"),
        password=os.environ["MAIN_DB_PASS"],
    )

def get_or_db():
    return psycopg2.connect(
        host=os.environ.get("OR_DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("OR_DB_PORT", "5435")),
        dbname=os.environ.get("OR_DB_NAME", "openreyestr_prod"),
        user=os.environ.get("OR_DB_USER", "openreyestr"),
        password=os.environ["OR_DB_PASS"],
    )

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {"processed": [], "imported": 0}

def save_checkpoint(data):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(data, f)

# ── Fetch EDRPOU codes from OpenReyestr ─────────────────────────────────
def fetch_jsc_edrpous(or_conn):
    """Get all JSC (АТ/ПАТ/ПрАТ) EDRPOU codes from OpenReyestr."""
    cur = or_conn.cursor()
    cur.execute("""
        SELECT DISTINCT edrpou FROM legal_entities
        WHERE edrpou IS NOT NULL AND LENGTH(edrpou) = 8
          AND (name ILIKE '%%акціонерне%%' OR name ILIKE '%%публічне акціонерне%%'
               OR name ILIKE '%%приватне акціонерне%%')
        ORDER BY edrpou
    """)
    codes = [r[0] for r in cur.fetchall()]
    cur.close()
    return codes

# ── Async API fetch ─────────────────────────────────────────────────────
async def fetch_owners(session, edrpou, report_date, semaphore, stats):
    async with semaphore:
        url = f"{API_URL}?z_edre={edrpou}&fid={report_date}"
        for attempt in range(3):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    stats["requests"] += 1
                    if resp.status == 429:
                        await asyncio.sleep(5)
                        continue
                    if resp.status in (404, 204):
                        return []
                    if resp.status != 200:
                        return []
                    text = await resp.text()
                    if not text or text.strip() in ("", "[]"):
                        return []
                    data = json.loads(text)
                    return data if isinstance(data, list) else []
            except (asyncio.TimeoutError, aiohttp.ClientError):
                if attempt == 2:
                    return []
                await asyncio.sleep(1 * (attempt + 1))
        return []

# ── Batch insert ────────────────────────────────────────────────────────
def batch_insert(conn, records):
    if not records:
        return 0
    cur = conn.cursor()
    values = []
    seen = set()
    for r in records:
        key = f"{r.get('fid','')}|{r.get('z_edre','')}|{r.get('z_kedevl','') or ''}|{r.get('z_namev1','') or ''}"
        if key in seen:
            continue
        seen.add(key)
        values.append((
            r.get("fid", ""),
            r.get("z_edre", ""),
            r.get("z_ename"),
            r.get("z_isin"),
            r.get("z_kedevl") if r.get("z_kedevl") != "." else None,
            r.get("z_namev1"),
            r.get("z_namev2"),
            r.get("z_videp"),
            r.get("z_skach"),
            r.get("z_nom_v"),
            r.get("z_kisor"),
            r.get("vlkraina"),
            json.dumps(r, ensure_ascii=False),
        ))

    if not values:
        return 0

    execute_values(cur, """
        INSERT INTO opendata_securities_owners
            (report_date, issuer_edrpou, issuer_name, isin_code, owner_edrpou,
             owner_name, owner_name_alt, owner_type, share_percent, nominal_value,
             share_count, country_code, raw_data)
        VALUES %s
        ON CONFLICT (report_date, issuer_edrpou, coalesce(owner_edrpou, ''), coalesce(owner_name, ''))
        DO UPDATE SET
            issuer_name = EXCLUDED.issuer_name,
            share_percent = EXCLUDED.share_percent,
            nominal_value = EXCLUDED.nominal_value,
            raw_data = EXCLUDED.raw_data,
            imported_at = NOW()
    """, values)
    conn.commit()
    cur.close()
    return len(values)

# ── Main ────────────────────────────────────────────────────────────────
async def main():
    args = get_args()
    report_dates = args.report_dates.split(",")

    print("=" * 60)
    print("НКЦПФР Bulk Import — Major Shareholders (5%+)")
    print("=" * 60)
    print(f"Workers:      {args.workers}")
    print(f"Report dates: {', '.join(report_dates)}")
    print()

    # Connect to DBs
    or_conn = get_or_db()
    main_conn = get_main_db()

    # Fetch EDRPOU codes
    print("Fetching JSC EDRPOU codes from OpenReyestr...")
    edrpous = fetch_jsc_edrpous(or_conn)
    or_conn.close()
    print(f"  Found {len(edrpous)} joint stock companies")

    # Load checkpoint
    checkpoint = load_checkpoint() if args.resume else {"processed": [], "imported": 0}
    processed_set = set(checkpoint["processed"])
    total_imported = checkpoint["imported"]

    # Filter out already processed
    remaining = [e for e in edrpous if e not in processed_set]
    print(f"  Remaining: {len(remaining)} (already processed: {len(processed_set)})")

    # Rate limiting: workers concurrent, but controlled
    semaphore = asyncio.Semaphore(args.workers)
    stats = {"requests": 0, "found": 0}
    start_time = time.time()

    headers = {
        "Accept": "application/json",
        "User-Agent": "SecondLayer-Legal-Platform/1.0",
    }

    connector = aiohttp.TCPConnector(limit=args.workers, ttl_dns_cache=300)
    async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
        for report_date in report_dates:
            print(f"\n📅 Report date: {report_date}")
            batch_records = []
            batch_edrpous = []

            for i, edrpou in enumerate(remaining):
                owners = await fetch_owners(session, edrpou, report_date, semaphore, stats)

                if owners:
                    batch_records.extend(owners)
                    stats["found"] += len(owners)

                batch_edrpous.append(edrpou)

                # Insert every 200 companies
                if len(batch_edrpous) >= 200 or i == len(remaining) - 1:
                    if batch_records:
                        inserted = batch_insert(main_conn, batch_records)
                        total_imported += inserted

                    processed_set.update(batch_edrpous)

                    elapsed = time.time() - start_time
                    rps = stats["requests"] / elapsed if elapsed > 0 else 0
                    pct = (i + 1) / len(remaining) * 100

                    print(f"  {i+1}/{len(remaining)} ({pct:.1f}%) | "
                          f"requests: {stats['requests']} ({rps:.1f}/s) | "
                          f"found: {stats['found']} | "
                          f"imported: {total_imported} | "
                          f"{elapsed:.0f}s")

                    # Save checkpoint
                    save_checkpoint({
                        "processed": list(processed_set),
                        "imported": total_imported,
                        "ts": datetime.now().isoformat(),
                    })

                    batch_records = []
                    batch_edrpous = []

    main_conn.close()

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"Done in {elapsed:.0f}s")
    print(f"Total requests: {stats['requests']}")
    print(f"Records found:  {stats['found']}")
    print(f"Records saved:  {total_imported}")
    print(f"Companies:      {len(edrpous)}")

if __name__ == "__main__":
    asyncio.run(main())
