#!/usr/bin/env python3
"""Fetch Dutch legislation text, edition by edition, and load it into prod (LEXAI-1895).

Runs ON the prod host, unlike every other NL importer, and the reason is
measured rather than stylistic: on 26 Jul the workstation could not complete a
single TLS handshake to any of the KOOP addresses, while prod pinned to
147.181.13.83 answered 8 of 8 in ~0.12s. KOOP fronts the repository with a GSLB
that hands out several addresses, some of which do not answer, so the address is
pinned rather than resolved per request. If the pinned address stops answering,
pass a new one in KOOP_IP; the script fails loudly rather than silently falling
back to a broken one.

The worklist is the database: editions in nl_law_editions with no row in
nl_law_edition_texts. That makes the run resumable with no checkpoint file and
safe to run twice - a killed run just leaves fewer rows for the next one.

Every edition ends with a row in nl_law_edition_texts, including failures
(status fetch_failed / parse_failed), so "not downloaded yet" and "downloaded,
came back empty" never look the same.
"""
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET

PG = ["docker", "exec", "-i", os.environ.get("PG_CONTAINER", "secondlayer-postgres-prod"),
      "psql", "-U", os.environ.get("PG_USER", "secondlayer"),
      "-d", os.environ.get("PG_DB", "secondlayer_prod")]

KOOP_HOST = "repository.officiele-overheidspublicaties.nl"
KOOP_IP = os.environ.get("KOOP_IP", "147.181.13.83")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
WORKERS = int(os.environ.get("WORKERS", "8"))
BATCH = int(os.environ.get("BATCH", "400"))
LIMIT = int(os.environ.get("LIMIT", "0"))          # 0 = no limit, for smoke runs
TRIES = int(os.environ.get("TRIES", "4"))

started = time.time()
counts = {"ok": 0, "no_articles": 0, "fetch_failed": 0, "parse_failed": 0, "articles": 0}


def log(msg):
    el = int(time.time() - started)
    done = sum(counts[k] for k in ("ok", "no_articles", "fetch_failed", "parse_failed"))
    rate = done / el if el else 0
    print(f"[{el:>6}s] {msg} | done={done} ok={counts['ok']} "
          f"noart={counts['no_articles']} fail={counts['fetch_failed']} "
          f"arts={counts['articles']} | {rate:.1f}/s", flush=True)


def psql(sql, stdin=None):
    r = subprocess.run(PG + ["-v", "ON_ERROR_STOP=1", "-c", sql],
                       input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()[:400]}")
    return r.stdout


def psql_copy(sql, data):
    r = subprocess.run(PG + ["-v", "ON_ERROR_STOP=1", "-c", sql],
                       input=data, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"COPY failed: {r.stderr.strip()[:400]}")


def worklist(n):
    sql = (f"COPY (SELECT e.bwb_id, e.valid_from, e.seq, e.xml_url "
           f"FROM nl_law_editions e "
           f"LEFT JOIN nl_law_edition_texts t "
           f"  ON t.bwb_id=e.bwb_id AND t.valid_from=e.valid_from AND t.seq=e.seq "
           f"WHERE t.bwb_id IS NULL AND e.xml_url IS NOT NULL "
           f"ORDER BY e.bwb_id, e.valid_from, e.seq LIMIT {n}) TO STDOUT WITH (FORMAT text)")
    out = psql(sql)
    rows = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 4:
            rows.append(tuple(parts))
    return rows


def fetch(url):
    """curl with the address pinned. urllib would re-resolve and land on a dead
    GSLB member roughly half the time."""
    for attempt in range(TRIES):
        r = subprocess.run(
            ["curl", "-s", "-L", "-m", "90", "-A", UA,
             "--resolve", f"{KOOP_HOST}:443:{KOOP_IP}", url],
            capture_output=True)
        if r.returncode == 0 and r.stdout and b"<toestand" in r.stdout[:4000]:
            return r.stdout
        time.sleep(2 * (attempt + 1))
    return None


def clean(s):
    return re.sub(r"[ \t\u00a0]+", " ", re.sub(r"\n{3,}", "\n\n", s)).strip()


def node_text(el):
    """Plain text of an element, keeping paragraph boundaries. Drops <meta-data>,
    which carries the jci reference block and is not part of the provision."""
    parts = []

    def walk(e):
        if e.tag == "meta-data":
            return
        if e.text:
            parts.append(e.text)
        for c in e:
            walk(c)
            if c.tail:
                parts.append(c.tail)
        if e.tag in ("al", "lid", "kop", "li", "artikel", "row"):
            parts.append("\n")

    walk(el)
    return clean("".join(parts))


def parse(xml_bytes):
    """Return (articles, full_text, article_count).

    Articles are labelled the way Dutch practice cites them: bare number for a
    flat act, book:number inside a code that has books, which is what
    nl_legislation_citations.article already holds.
    """
    root = ET.fromstring(xml_bytes)
    articles = []
    ord_i = 0

    def article_label(el, book):
        kop = el.find("kop")
        nr = None
        if kop is not None:
            nrel = kop.find("nr")
            if nrel is not None and nrel.text:
                nr = nrel.text.strip()
        if not nr:
            lab = (el.get("label") or "").strip()
            m = re.search(r"(\d+[a-zA-Z]*(?:[.:]\d+[a-zA-Z]*)*)", lab)
            nr = m.group(1) if m else None
        if not nr:
            return None, None
        return (f"{book}:{nr}" if book else nr), nr

    def article_title(el):
        kop = el.find("kop")
        if kop is None:
            return None
        t = kop.find("titel")
        if t is not None:
            s = clean("".join(t.itertext()))
            return s or None
        return None

    def walk(el, book):
        nonlocal ord_i
        if el.tag == "boek":
            kop = el.find("kop")
            nr = kop.find("nr") if kop is not None else None
            book = (nr.text or "").strip() if nr is not None and nr.text else book
        if el.tag == "artikel":
            label, bare = article_label(el, book)
            if label:
                txt = node_text(el)
                if txt:
                    ord_i += 1
                    articles.append({
                        "label": label, "nr": bare, "book": book,
                        "title": article_title(el), "text": txt, "ord": ord_i,
                    })
            return                      # articles do not nest
        for c in el:
            walk(c, book)

    walk(root, None)
    full = node_text(root)
    return articles, full, len(articles)


def esc(v):
    if v is None or v == "":
        return r"\N"
    return (str(v).replace("\\", "\\\\").replace("\t", " ")
            .replace("\n", "\\n").replace("\r", " "))


def handle(row):
    bwb, vfrom, seq, url = row
    xml = fetch(url)
    if xml is None:
        counts["fetch_failed"] += 1
        return [], [(bwb, vfrom, seq, None, 0, 0, None, "fetch_failed")]
    try:
        arts, full, n = parse(xml)
    except Exception:
        counts["parse_failed"] += 1
        return [], [(bwb, vfrom, seq, None, 0, 0, len(xml), "parse_failed")]

    art_rows = [(bwb, vfrom, seq, a["label"], a["nr"], a["book"], a["title"],
                 a["text"], len(a["text"]), a["ord"]) for a in arts]
    # Full text is kept only when no article came out, so a provision's text is
    # never stored twice.
    keep_full = None if n else full
    status = "ok" if n else "no_articles"
    counts["ok" if n else "no_articles"] += 1
    counts["articles"] += n
    return art_rows, [(bwb, vfrom, seq, keep_full, len(full), n, len(xml), status)]


def flush(art_rows, ed_rows):
    if art_rows:
        data = "".join("\t".join(esc(c) for c in r) + "\n" for r in art_rows)
        psql_copy("COPY nl_law_articles (bwb_id, valid_from, seq, article_label, "
                  "article_nr, book_nr, title, text, n_chars, ord) FROM STDIN", data)
    if ed_rows:
        data = "".join("\t".join(esc(c) for c in r) + "\n" for r in ed_rows)
        psql_copy("COPY nl_law_edition_texts (bwb_id, valid_from, seq, text, "
                  "n_chars, article_count, xml_bytes, status) FROM STDIN", data)


def main():
    total_done = 0
    while True:
        n = BATCH if not LIMIT else min(BATCH, LIMIT - total_done)
        if n <= 0:
            break
        rows = worklist(n)
        if not rows:
            log("worklist empty, done")
            break
        art_all, ed_all = [], []
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for arts, eds in pool.map(handle, rows):
                art_all += arts
                ed_all += eds
        flush(art_all, ed_all)
        total_done += len(rows)
        log(f"batch of {len(rows)}")
        if LIMIT and total_done >= LIMIT:
            break
    log("finished")


if __name__ == "__main__":
    sys.exit(main())
