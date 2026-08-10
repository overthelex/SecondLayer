#!/usr/bin/env python3
"""Step 3: recover the true effective date for the editions where it actually matters.

Rada serves the CURRENT text when the requested /ed{date} is not a real edition boundary, so
ed_date is a fetch key, not a fact. Only data.rada OpenData admits which edition it served, in a
«Текст документа від DD.MM.YYYY» line; zakon /print never does. (An attempt to derive the date
from the amendment preamble was tested against 15 000 known-truth rows and scored 17.3%
precision, so it was discarded — see the audit.)

Re-fetching all 338k texts through OpenData would take ~31h because that origin saturates
globally at ~3 req/s. It is not needed: temporal questions are asked of codes and laws, which
are exactly the acts that carry an article layer. That is ~14k editions, about 80 minutes.

Writes back declared_date only. The generated date_verified column follows from it, so an
edition whose text turns out to be a different version stops counting as verified without any
row being deleted or rewritten.
"""
import os
import re
import sys
import time
import threading
import queue
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor

import requests

PENDING = sys.argv[1]
OUT = sys.argv[2]
RATE = float(os.environ.get("RATE", "3.0"))
WORKERS = int(os.environ.get("WORKERS", "6"))
BASE = "https://data.rada.gov.ua/laws/show"
HEADERS = {"User-Agent": "OpenData", "Accept-Encoding": "gzip, deflate"}
RE_DECLARED = re.compile(r"Текст документа від (\d{2})\.(\d{2})\.(\d{4})")

_lock = threading.Lock()
_slot = [0.0]
_iv = 1.0 / RATE if RATE > 0 else 0.0


def gate():
    if _iv <= 0:
        return
    with _lock:
        now = time.time()
        s = max(now, _slot[0])
        _slot[0] = s + _iv
    w = s - time.time()
    if w > 0:
        time.sleep(w)


_tls = threading.local()


def sess():
    s = getattr(_tls, "s", None)
    if s is None:
        s = requests.Session()
        s.headers.update(HEADERS)
        _tls.s = s
    return s


def fetch(nreg, ed):
    """Returns (declared_yyyymmdd, http_status). '' when the page carries no date line."""
    url = f"{BASE}/{quote(nreg, safe='')}/ed{ed}"
    for attempt in range(2):
        gate()
        try:
            r = sess().get(url, timeout=(6, 25))
            if r.status_code in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(2)
                continue
            if r.status_code != 200:
                return "", r.status_code
            m = RE_DECLARED.search(r.content.decode("utf-8", "replace")[:6000])
            return (f"{m.group(3)}{m.group(2)}{m.group(1)}" if m else ""), 200
        except requests.exceptions.RequestException:
            _tls.s = None
            return "", 0
    return "", 0


def main():
    rows = []
    seen = set()
    if os.path.exists(OUT):                       # resumable: a rerun skips what already landed
        with open(OUT, encoding="utf-8") as f:
            for line in f:
                p = line.split("\t")
                if len(p) >= 2:
                    seen.add((p[0], p[1]))
    with open(PENDING, encoding="utf-8") as f:
        for line in f:
            n, _, d = line.rstrip("\n").partition("\t")
            if n and d and (n, d) not in seen:
                rows.append((n, d))
    print(f"[verify] {len(rows)} to check, {len(seen)} already done, rate={RATE}/s", flush=True)

    out = open(OUT, "a", encoding="utf-8")
    q = queue.Queue()
    done = threading.Event()

    def writer():
        n = ok = miss = nodate = 0
        t0 = last = time.time()
        while not (done.is_set() and q.empty()):
            try:
                nreg, ed, decl, st = q.get(timeout=1.0)
            except queue.Empty:
                continue
            if st != 200:
                continue                          # leave it unverified rather than guess
            out.write(f"{nreg}\t{ed}\t{decl}\n")
            n += 1
            if not decl:
                nodate += 1
            elif decl == ed:
                ok += 1
            else:
                miss += 1
            now = time.time()
            if now - last > 15:
                out.flush()
                rate = n / max(1e-3, now - t0)
                print(f"[verify] {n}/{len(rows)} confirmed={ok} MISMATCH={miss} "
                      f"no_date={nodate} {rate:.2f}/s", flush=True)
                last = now
        out.flush()
        print(f"[verify] done: {n} checked, confirmed={ok}, mismatched={miss}, no_date={nodate}",
              flush=True)

    wt = threading.Thread(target=writer, daemon=True)
    wt.start()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for nreg, ed in rows:
            ex.submit(lambda a=nreg, b=ed: q.put((a, b) + fetch(a, b)))
    done.set()
    wt.join()


if __name__ == "__main__":
    main()
