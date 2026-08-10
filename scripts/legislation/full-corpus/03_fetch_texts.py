#!/usr/bin/env python3
"""Stage 2: fetch full text of every edition from Rada → NDJSON shards on disk.

Host-agnostic: reads the pending (nreg, ed_date) list from a FILE (no DB needed), so it can
run on any Rada-reachable node. Writes NDJSON shards + a done-set to OUTDIR.

Two sources (env SOURCE):
  - `opendata` (default): `data.rada.gov.ua/laws/show/{nreg}/ed{date}` with `User-Agent: OpenData`.
    No Cloudflare, ~10x the throughput of zakon. Historical editions are honoured (verified
    2026-08-10: distinct text per ed date, «Текст документа від <ed date>» in the header).
    403 is heavily overloaded here, which is why a 403 RATE is never treated as a ban:
      * per-document — OpenData answers 403, not 404, for a non-existent edition, anything
        pre-1991, and international treaties (`995_*`, `196_*`). Since pending.tsv is sorted
        by ed_date, its whole early stretch is 100% 403 on a perfectly healthy IP. Falls back
        to zakon, which answers such rows definitively (usually 404).
      * per-IP ban — over-hammering earns a multi-hour 403 on that IP for EVERY document
        (2026-07 incident; 172.31.29.20 + 172.31.22.206 were still banned a month later).
    Only a canary document known to return 200 separates the two; see BanGuard.
  - `zakon`: `zakon.rada.gov.ua/laws/show/{nreg}/ed{date}/print` with a browser UA. Slower
    (Cloudflare rate-limits every IP: sustainable ~0.3-1 req/s), but never IP-banned.

Perf model (measured 2026-07-08): zakon.rada from prod is DIRECT origin nginx (no Cloudflare);
good-path request ~0.16s, but a FRESH TCP+TLS per request intermittently stalls ~2s (SYN
retransmit) and the connection churn trips origin's per-IP 429 limit. So:
  - **keep-alive session per worker** (reused connection, bound to SRC_IP) — kills handshake
    cost + the 2s stalls + lowers 429 rate; gzip on.
  - tight timeouts (connect 4s / read 8s); network failures are abandoned immediately and left
    PENDING (a rerun mops them up) — never park a worker in a 25s hang.
  - persist ONLY 200/404 (definitive); transient (0/403/429/5xx) stay pending.

Each shard line: {"nreg","ed_date","http_status","char_len","text_hash","text","src"}

Env: PENDING (required tsv nreg\\ted_date), OUTDIR, WORKERS(=8), RATE(=2/s), SHARDS(=64),
     SRC_IP (bind outbound to this secondary IP), SOURCE(=opendata|zakon).
"""
import os, re, html, time, json, hashlib, threading, queue, collections
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import requests
from requests.adapters import HTTPAdapter

PENDING = os.environ["PENDING"]
OUTDIR = os.environ.get("OUTDIR", "/data/rada_npa/texts")
WORKERS = int(os.environ.get("WORKERS", "8"))
RATE = float(os.environ.get("RATE", "2.0"))
SHARDS = int(os.environ.get("SHARDS", "64"))
SRC_IP = os.environ.get("SRC_IP", "").strip()
SOURCE = os.environ.get("SOURCE", "opendata").strip().lower()
ZAKON = "https://zakon.rada.gov.ua/laws/show"
OPENDATA = "https://data.rada.gov.ua/laws/show"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "uk,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}
OD_HEADERS = dict(HEADERS, **{"User-Agent": "OpenData"})

_tag = re.compile(r"(?s)<[^>]+>")
_scriptstyle = re.compile(r"(?is)<(script|style|head).*?</\1>")
_ws = re.compile(r"[ \t\xa0]+")
_nl = re.compile(r"\s*\n\s*")


# --- keep-alive session per worker thread, bound to SRC_IP ----------------------
class _SrcAdapter(HTTPAdapter):
    def init_poolmanager(self, *a, **kw):
        if SRC_IP:
            kw["source_address"] = (SRC_IP, 0)
        super().init_poolmanager(*a, **kw)


_tls = threading.local()


def get_session(kind: str):
    sessions = getattr(_tls, "sessions", None)
    if sessions is None:
        sessions = _tls.sessions = {}
    s = sessions.get(kind)
    if s is None:
        s = requests.Session()
        s.mount("https://", _SrcAdapter(pool_connections=1, pool_maxsize=1, max_retries=0))
        s.headers.update(OD_HEADERS if kind == "opendata" else HEADERS)
        sessions[kind] = s
    return s


def _drop_session(kind: str):
    sessions = getattr(_tls, "sessions", None) or {}
    s = sessions.pop(kind, None)
    if s is not None:
        try:
            s.close()
        except Exception:
            pass


# --- per-IP ban guard: only a CANARY can tell a banned IP from a 403-ing document -------
# 403 is OpenData's ordinary "no such edition" for anything pre-1991 or non-existent, and for
# international treaties — measured 2026-08-10, and the pending list is sorted by ed_date, so
# whole stretches of it are 100% 403 on a perfectly healthy IP. A 403 RATE therefore proves
# nothing. What separates the two cases is a document known to answer 200: on a banned IP even
# that 403s. So a 403 wave only triggers a canary probe, and the canary decides.
CANARY = ("183-2006-р", "20060405")   # short КМУ розпорядження, 200 on every healthy IP


class BanGuard:
    def __init__(self, window=40, threshold=0.9, min_samples=30, probe_gap=60.0):
        self.lock = threading.Lock()
        self.recent = collections.deque(maxlen=window)
        self.threshold, self.min_samples, self.probe_gap = threshold, min_samples, probe_gap
        self.banned = False
        self.last_probe = 0.0

    def record(self, forbidden: bool):
        """Returns True once the IP is confirmed banned."""
        with self.lock:
            if self.banned:
                return True
            self.recent.append(1 if forbidden else 0)
            if len(self.recent) < self.min_samples or \
                    sum(self.recent) / len(self.recent) < self.threshold:
                return False
            now = time.time()
            if now - self.last_probe < self.probe_gap:
                return False
            self.last_probe = now
            rate, size = sum(self.recent), len(self.recent)

        status, _, _ = fetch_one("opendata", *CANARY)   # outside the lock: it does network I/O
        if status == 200:
            with self.lock:
                self.recent.clear()      # healthy IP, just a dead stretch of the list
            print(f"[03] OpenData 403 {rate}/{size} on src={SRC_IP or 'default'} but canary "
                  f"is 200 -> documents are missing, not the IP; continuing", flush=True)
            return False

        with self.lock:
            self.banned = True
        relax_rate(ZAKON_RATE)           # zakon cannot take the OpenData pace
        print(f"[03] OpenData 403 {rate}/{size} AND canary={status} on "
              f"src={SRC_IP or 'default'} -> IP is banned, finishing on zakon at "
              f"{ZAKON_RATE}/s", flush=True)
        return True

    def is_banned(self):
        with self.lock:
            return self.banned


_guard = BanGuard()


# --- non-blocking rate gate (sleep OUTSIDE the lock) ----------------------------
_rate_lock = threading.Lock()
_next_slot = [0.0]
_interval = [1.0 / RATE if RATE > 0 else 0.0]
ZAKON_RATE = float(os.environ.get("ZAKON_RATE", "0.6"))


def relax_rate(new_rate: float):
    if new_rate > 0:
        _interval[0] = max(_interval[0], 1.0 / new_rate)


def rate_gate():
    if _interval[0] <= 0:
        return
    with _rate_lock:
        now = time.time()
        slot = max(now, _next_slot[0])
        _next_slot[0] = slot + _interval[0]
    wait = slot - time.time()
    if wait > 0:
        time.sleep(wait)


def clean_html(raw: bytes) -> str:
    h = raw.decode("utf-8", "replace").replace("\x00", "")
    h = _scriptstyle.sub(" ", h)
    h = _tag.sub(" ", h)
    h = html.unescape(h)
    h = _ws.sub(" ", h)
    h = _nl.sub("\n", h)
    return h.strip()


def shard_of(nreg: str) -> int:
    return int(hashlib.md5(nreg.encode()).hexdigest(), 16) % SHARDS


def fetch_one(kind: str, nreg: str, ed_date: str):
    """One source. Returns (status, text, hash); status 0 = transient, leave pending."""
    enc = quote(nreg, safe="")
    url = (f"{OPENDATA}/{enc}/ed{ed_date}" if kind == "opendata"
           else f"{ZAKON}/{enc}/ed{ed_date}/print")
    sess = get_session(kind)
    # (connect, read). data.rada is a weak origin: 2.1-2.9s unloaded, but 11-14s once the fleet
    # pushes ~4 req/s at it (measured 2026-08-10 by stopping the fleet and re-probing). An 8s
    # read timeout there turns almost every request into a transient failure, so give OpenData
    # real headroom and keep the pressure down with RATE instead.
    tmo = (6, 25) if kind == "opendata" else (4, 10)
    for attempt in range(2):
        rate_gate()
        try:
            r = sess.get(url, timeout=tmo)            # requests auto-gunzips
            status = r.status_code
            if status in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(1.5); continue             # transient origin throttle → one quick retry
            if status != 200:
                return status, "", ""
            text = clean_html(r.content)
            if len(text) < 60 and attempt == 0:
                time.sleep(1); continue               # empty/broken 200 → one retry
            return status, text, hashlib.md5(text.encode("utf-8")).hexdigest()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            _drop_session(kind)                        # dead keep-alive socket → reset
            return 0, "", ""                           # abandon: left pending for a rerun
        except requests.exceptions.RequestException:
            _drop_session(kind)
            return 0, "", ""
    return 0, "", ""


def fetch(nreg: str, ed_date: str):
    """Returns (status, text, hash, src). OpenData first when enabled; a 403 there is either a
    restricted document or a banned IP, and zakon answers both definitively."""
    if SOURCE == "opendata" and not _guard.is_banned():
        status, text, h = fetch_one("opendata", nreg, ed_date)
        if status != 403:
            _guard.record(False)
            return status, text, h, "opendata"
        _guard.record(True)
    status, text, h = fetch_one("zakon", nreg, ed_date)
    return status, text, h, "zakon"


def load_done():
    import glob as _g
    done = set()
    parent = os.path.dirname(OUTDIR.rstrip("/"))
    paths = set(_g.glob(os.path.join(parent, "*", "done.txt"))) | {os.path.join(OUTDIR, "done.txt")}
    for p in paths:
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                for line in f:
                    k = line.rstrip("\n")
                    if k:
                        done.add(k)
    return done


def load_pending():
    out = []
    with open(PENDING, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            nreg, _, ed = line.partition("\t")
            if nreg and ed:
                out.append((nreg, ed))
    return out


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    # Liveness handshake with supervise.sh. Matching `ps` output by pattern kept mis-counting
    # (the ssh/bash command line contains the script name too), so the worker states its own
    # PID instead and the supervisor just kill(0)s it.
    with open(os.path.join(OUTDIR, "worker.pid"), "w") as f:
        f.write(str(os.getpid()))
    done = load_done()
    allp = load_pending()
    pending = [(n, d) for (n, d) in allp if f"{n}\t{d}" not in done]
    total = len(pending)
    print(f"[03] list={len(allp)} done={len(done)} pending={total} source={SOURCE} "
          f"workers={WORKERS} rate={RATE}/s src={SRC_IP or 'default'} shards={SHARDS}", flush=True)
    if not total:
        return

    results = queue.Queue(maxsize=WORKERS * 8)
    finished = threading.Event()

    def worker(item):
        nreg, ed_date = item
        status, text, h, src = fetch(nreg, ed_date)
        results.put((nreg, ed_date, status, len(text), h, text, src))

    def writer():
        shard_files = {i: open(os.path.join(OUTDIR, f"shard_{i}.ndjson"), "a", encoding="utf-8")
                       for i in range(SHARDS)}
        donef = open(os.path.join(OUTDIR, "done.txt"), "a", encoding="utf-8")
        n, ok, skip, t0, last, last_flush = 0, 0, 0, time.time(), time.time(), time.time()
        while not (finished.is_set() and results.empty()):
            try:
                nreg, ed_date, status, ln, h, text, src = results.get(timeout=1.0)
            except queue.Empty:
                continue
            if status not in (200, 404):               # persist only definitive; rest stay pending
                skip += 1
                continue
            rec = {"nreg": nreg, "ed_date": ed_date, "http_status": status,
                   "char_len": ln, "text_hash": h, "text": text, "src": src}
            shard_files[shard_of(nreg)].write(json.dumps(rec, ensure_ascii=False) + "\n")
            donef.write(f"{nreg}\t{ed_date}\n")
            n += 1; ok += (status == 200)
            now = time.time()
            if now - last_flush > 5:
                for f in shard_files.values():
                    f.flush()
                donef.flush(); last_flush = now
            if now - last > 15:
                rate = n / max(1e-3, now - t0)
                eta = (total - n) / max(1e-3, rate) / 3600
                print(f"[03] persisted={n}/{total} ({100*n/total:.1f}%) ok={ok} "
                      f"retry_later={skip} {rate:.2f}/s ETA {eta:.1f}h", flush=True)
                last = now
        for f in shard_files.values():
            f.flush(); f.close()
        donef.flush(); donef.close()
        print(f"[03] persisted {n} ({ok} ok), {skip} transient left pending, "
              f"in {(time.time()-t0)/3600:.2f}h", flush=True)

    wt = threading.Thread(target=writer, daemon=True)
    wt.start()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for item in pending:
            ex.submit(worker, item)
    finished.set()
    wt.join()


if __name__ == "__main__":
    try:
        main()
    finally:
        try:
            os.remove(os.path.join(OUTDIR, "worker.pid"))
        except OSError:
            pass
