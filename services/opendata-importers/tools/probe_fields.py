#!/usr/bin/env python3
"""Measure which RDF fields are recoverable for NL rows that currently lack full_text.

Input on stdin: "ecli,bucket" per line (bucket is any grouping label, e.g. year or YYYY-MM).
Reports per bucket how many documents expose a body, dcterms:subject, dcterms:abstract
(inhoudsindicatie), psi:procedure and dcterms:type.
"""
import asyncio
import sys
from collections import defaultdict
from xml.etree import ElementTree as ET

import aiohttp

UA = "SecondLayer-Legal-Platform/2.0 (legal.org.ua; opendata-importer)"
CONTENT_URL = "https://data.rechtspraak.nl/uitspraken/content?id="
CONCURRENCY = 16
FIELDS = ("body", "subject", "abstract", "procedure", "type", "zaaknummer")


def parse(body: str) -> dict:
    got = {}
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return {"parse_fail": True}
    for el in root.iter():
        tag = el.tag.split("}", 1)[-1]
        if tag in ("uitspraak", "conclusie"):
            if len("".join(el.itertext()).strip()) > 200:
                got["body"] = True
        elif tag in ("subject", "abstract", "inhoudsindicatie", "procedure", "type", "zaaknummer"):
            txt = "".join(el.itertext()).strip()
            if txt:
                got["abstract" if tag == "inhoudsindicatie" else tag] = True
    return got


async def one(session, sem, ecli, bucket, out):
    async with sem:
        for attempt in range(3):
            try:
                async with session.get(CONTENT_URL + ecli) as r:
                    if r.status != 200:
                        out.append((bucket, {"http_error": True}))
                        return
                    out.append((bucket, parse(await r.text())))
                    return
            except Exception:
                if attempt == 2:
                    out.append((bucket, {"fetch_fail": True}))
                await asyncio.sleep(1 + attempt)


async def main():
    rows = []
    for line in sys.stdin:
        line = line.strip()
        if line and "," in line:
            ecli, bucket = line.rsplit(",", 1)
            rows.append((ecli.strip(), bucket.strip()))
    print(f"probing {len(rows)} ECLIs", file=sys.stderr)

    out = []
    sem = asyncio.Semaphore(CONCURRENCY)
    async with aiohttp.ClientSession(headers={"User-Agent": UA},
                                     timeout=aiohttp.ClientTimeout(total=60)) as s:
        await asyncio.gather(*[one(s, sem, e, b, out) for e, b in rows])

    per = defaultdict(lambda: defaultdict(int))
    for bucket, got in out:
        per[bucket]["n"] += 1
        for k in got:
            per[bucket][k] += 1

    hdr = f"{'bucket':9} {'n':>5}" + "".join(f"{f:>11}" for f in FIELDS) + f"{'errors':>8}"
    print(hdr)
    tot = defaultdict(int)
    for bucket in sorted(per):
        d = per[bucket]
        n = d["n"]
        line = f"{bucket:9} {n:5}"
        for f in FIELDS:
            line += f"{d[f]:7} {100*d[f]//n:>3}%"
        line += f"{d['http_error']+d['fetch_fail']+d['parse_fail']:8}"
        print(line)
        for k, v in d.items():
            tot[k] += v
    n = tot["n"]
    line = f"{'TOTAL':9} {n:5}"
    for f in FIELDS:
        line += f"{tot[f]:7} {100*tot[f]//n:>3}%"
    print(line)


if __name__ == "__main__":
    asyncio.run(main())
