#!/usr/bin/env python3
"""Scan feed-vs-prod coverage for every day in a range and roll it up by month.

Usage: coverage_scan.py <prod_counts.csv> <from YYYY-MM-DD> <to YYYY-MM-DD> [out.csv]

prod_counts.csv is "YYYY-MM-DD,count" exported from prod. Writes the per-day
comparison to out.csv (default coverage_by_day.csv) and prints a monthly rollup.
"""
import asyncio
import sys
from collections import defaultdict
from datetime import date, timedelta
from xml.etree import ElementTree as ET

import aiohttp

UA = "SecondLayer-Legal-Platform/2.0 (legal.org.ua; opendata-importer)"
SEARCH = "https://data.rechtspraak.nl/uitspraken/zoeken"
ATOM = {"a": "http://www.w3.org/2005/Atom"}
CONCURRENCY = 12


async def feed_total(session, sem, day):
    async with sem:
        for attempt in range(4):
            try:
                async with session.get(f"{SEARCH}?date={day}&max=1") as r:
                    if r.status != 200:
                        raise RuntimeError(f"http {r.status}")
                    root = ET.fromstring(await r.text())
                    sub = root.find("a:subtitle", ATOM)
                    text = sub.text if sub is not None else ""
                    return day, int("".join(c for c in text if c.isdigit()) or 0)
            except Exception:
                if attempt == 3:
                    return day, None
                await asyncio.sleep(2 * (attempt + 1))


async def main():
    prod_file, start_s, end_s = sys.argv[1], sys.argv[2], sys.argv[3]
    out_path = sys.argv[4] if len(sys.argv) > 4 else "coverage_by_day.csv"

    prod = {}
    for line in open(prod_file):
        line = line.strip()
        if line and "," in line:
            d, c = line.rsplit(",", 1)
            prod[d.strip()] = int(c)

    start, end = date.fromisoformat(start_s), date.fromisoformat(end_s)
    days = [(start + timedelta(days=i)).isoformat()
            for i in range((end - start).days + 1)]
    print(f"scanning {len(days)} days {start}..{end}", file=sys.stderr)

    sem = asyncio.Semaphore(CONCURRENCY)
    async with aiohttp.ClientSession(headers={"User-Agent": UA},
                                     timeout=aiohttp.ClientTimeout(total=120)) as s:
        results = []
        for i in range(0, len(days), 200):
            batch = days[i:i + 200]
            results.extend(await asyncio.gather(
                *[feed_total(s, sem, d) for d in batch]))
            print(f"  {min(i + 200, len(days))}/{len(days)}", file=sys.stderr)

    per_month = defaultdict(lambda: [0, 0, 0])  # feed, prod, error_days
    with open(out_path, "w") as fh:
        fh.write("date,feed,prod,missing\n")
        for day, total in sorted(results):
            have = prod.get(day, 0)
            month = day[:7]
            if total is None:
                per_month[month][2] += 1
                continue
            per_month[month][0] += total
            per_month[month][1] += have
            fh.write(f"{day},{total},{have},{max(0, total - have)}\n")

    print(f"{'month':9} {'feed':>8} {'prod':>8} {'missing':>9} {'coverage':>9} {'errs':>5}")
    tf = tp = 0
    for month in sorted(per_month):
        feed, have, errs = per_month[month]
        tf += feed
        tp += have
        cov = f"{100 * have / feed:.0f}%" if feed else "-"
        print(f"{month:9} {feed:8} {have:8} {max(0, feed - have):9} {cov:>9} {errs:5}")
    print(f"{'TOTAL':9} {tf:8} {tp:8} {max(0, tf - tp):9} "
          f"{(100 * tp / tf if tf else 0):8.1f}%")
    print(f"per-day detail written to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
