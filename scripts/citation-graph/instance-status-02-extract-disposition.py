#!/usr/bin/env python3
"""
EDRSR instance-status Phase 1: classify the disposition of higher-instance
merits decisions (appeal/cassation postanova/rishennia) in multi-instance
case chains, by parsing the operative part.

Reads:  isl_chain (staging) JOIN edrsr_fulltext
Writes: edrsr_instance_disposition (doc_id, cause_num, instance_code,
        adjudication_date, disposition, method, oper_len)

disposition in {reversed, modified, affirmed, dismissed, other}
"""
import argparse, re, sys
import psycopg2
from psycopg2.extras import execute_values
from concurrent.futures import ProcessPoolExecutor, as_completed

DSN = "dbname=edrsr_local"

# operative-part markers (allow spaced-out letters: "П О С Т А Н О В И В")
def _spaced(word):
    return r'\s*'.join(list(word))

OPER_RE = re.compile(
    '(' + '|'.join(_spaced(w) for w in [
        'ПОСТАНОВИВ', 'ПОСТАНОВИЛ',
        'ВИРІШИВ', 'ВИРІШИЛ',
        'УХВАЛИВ', 'УХВАЛИЛ',
    ]) + ')',
    re.IGNORECASE)

def operative_slice(text):
    """Return text after the LAST operative marker, else last 1500 chars."""
    if not text:
        return ''
    last = None
    for m in OPER_RE.finditer(text):
        last = m
    if last:
        return text[last.end():last.end()+2500]
    return text[-1500:]

# disposition classification on the operative slice
_SKASUV = re.compile(r'скасув', re.IGNORECASE)
_ZMINY  = re.compile(r'змін(ити|ено|ивши|и)', re.IGNORECASE)
_BEZ_ZMIN = re.compile(r'без\s+змін', re.IGNORECASE)
_ZALYSH_BEZ_ZMIN = re.compile(r'залиш\w+\s+без\s+змін', re.IGNORECASE)
_NEW_DECISION = re.compile(r'ухвалити\s+нов\w+\s+(рішенн|постанов)', re.IGNORECASE)
_CLOSE_PROC = re.compile(r'закрити\s+(апеляційн\w+|касаційн\w+)?\s*провадженн', re.IGNORECASE)
_LEAVE_UNCHANGED_ANY = re.compile(r'без\s+задоволенн', re.IGNORECASE)

# a reversal/modification must act on a court DECISION, not on a seizure/measure
_DECISION_NOUN = re.compile(r'(рішенн|постанов|ухвал|вирок|судов\w+\s+наказ|заочн\w+\s+рішенн)', re.IGNORECASE)
# "скасув ... <decision noun>" or "<decision noun> ... скасув" within a short window
_SKASUV_DEC = re.compile(
    r'(скасув\w*[^.]{0,60}(рішенн|постанов|ухвал|вирок|наказ))'
    r'|((рішенн|постанов|ухвал|вирок|наказ)\w*[^.]{0,60}скасув)', re.IGNORECASE)
_ZMINY_DEC = re.compile(
    r'(змін(ити|ено|ивши)[^.]{0,60}(рішенн|постанов|ухвал|вирок|наказ))'
    r'|((рішенн|постанов|ухвал|вирок|наказ)\w*[^.]{0,60}змін(ити|ено|ивши))', re.IGNORECASE)

def classify(text):
    op = operative_slice(text)
    s = re.sub(r'\s+', ' ', op)
    has_skasuv = bool(_SKASUV.search(s))
    has_dec_noun = bool(_DECISION_NOUN.search(s))
    has_skasuv_dec = has_skasuv and has_dec_noun
    has_zminy_dec  = bool(_ZMINY.search(s)) and has_dec_noun
    has_bez_zmin = bool(_BEZ_ZMIN.search(s))
    if _CLOSE_PROC.search(s) and not has_skasuv and not has_zminy_dec and not has_bez_zmin:
        return 'dismissed', len(op)
    # reversal dominates (full or partial skasuvannia of the reviewed decision)
    if has_skasuv_dec:
        return 'reversed', len(op)
    if has_zminy_dec and not has_bez_zmin:
        return 'modified', len(op)
    if has_bez_zmin:
        return 'affirmed', len(op)
    # skasuv present but NOT on a decision (e.g. "скасувати арешт") -> not an overrule
    return 'other', len(op)

# ---- DB paths ----

def fetch_smoke(limit, year):
    q = """
      SELECT ic.doc_id, ic.instance_code, ic.judgment_code, f.full_text
      FROM isl_chain ic
      JOIN edrsr_fulltext f ON f.doc_id = ic.doc_id
      WHERE ic.instance_code IN (1,2) AND ic.judgment_code IN (2,3)
        AND f.adj_year = %s
      LIMIT %s
    """
    with psycopg2.connect(DSN) as c, c.cursor() as cur:
        cur.execute(q, (year, limit))
        return cur.fetchall()

def run_smoke(limit, year):
    rows = fetch_smoke(limit, year)
    counts = {}
    print(f"# smoke: {len(rows)} higher-instance merits docs, year {year}\n")
    for doc_id, inst, jc, txt in rows:
        disp, olen = classify(txt)
        counts[disp] = counts.get(disp, 0) + 1
    print("## label distribution:")
    for k in ('reversed','modified','affirmed','dismissed','other'):
        print(f"  {k:10s} {counts.get(k,0)}")
    print("\n## samples (operative snippet):")
    shown = {}
    for doc_id, inst, jc, txt in rows:
        disp, olen = classify(txt)
        if shown.get(disp,0) >= 4:
            continue
        shown[disp] = shown.get(disp,0)+1
        op = re.sub(r'\s+',' ', operative_slice(txt))[:240]
        print(f"[{disp}] doc={doc_id} inst={inst} jc={jc} olen={olen}\n    {op}\n")

# ---- full extraction by partition ----

def _relax(conn):
    with conn.cursor() as cc:
        cc.execute("SET idle_in_transaction_session_timeout=0")
        cc.execute("SET statement_timeout=0")
    conn.commit()

def process_year(year):
    with psycopg2.connect(DSN) as c:
        c.autocommit = False
        _relax(c)
        with c.cursor(name=f'cur_{year}') as cur:
            cur.itersize = 5000
            cur.execute("""
              SELECT ic.doc_id, ic.cause_num, ic.instance_code, ic.adjudication_date, f.full_text
              FROM isl_chain ic
              JOIN edrsr_fulltext f ON f.doc_id = ic.doc_id
              WHERE ic.instance_code IN (1,2) AND ic.judgment_code IN (2,3)
                AND f.adj_year = %s
            """, (year,))
            batch = []
            n = 0
            wc = psycopg2.connect(DSN); _relax(wc); wcur = wc.cursor()
            for doc_id, cause_num, inst, adate, txt in cur:
                disp, olen = classify(txt)
                batch.append((doc_id, cause_num, inst, adate, disp, 'regex_operative', olen))
                if len(batch) >= 5000:
                    execute_values(wcur,
                      "INSERT INTO edrsr_instance_disposition "
                      "(doc_id, cause_num, instance_code, adjudication_date, disposition, method, oper_len) "
                      "VALUES %s ON CONFLICT (doc_id) DO NOTHING", batch)
                    wc.commit(); n += len(batch); batch = []
            if batch:
                execute_values(wcur,
                  "INSERT INTO edrsr_instance_disposition "
                  "(doc_id, cause_num, instance_code, adjudication_date, disposition, method, oper_len) "
                  "VALUES %s ON CONFLICT (doc_id) DO NOTHING", batch)
                wc.commit(); n += len(batch)
            wcur.close(); wc.close()
    return (year, n)

def run_full(years, workers):
    print(f"# full extraction, years {years[0]}-{years[-1]}, {workers} workers", flush=True)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(process_year, y): y for y in years}
        total = 0
        for fut in as_completed(futs):
            y, n = fut.result()
            total += n
            print(f"  year {y}: {n} classified (running total {total})", flush=True)
    print(f"# DONE total={total}", flush=True)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--smoke', action='store_true')
    ap.add_argument('--limit', type=int, default=400)
    ap.add_argument('--year', type=int, default=2023)
    ap.add_argument('--full', action='store_true')
    ap.add_argument('--from', dest='yfrom', type=int, default=2005)
    ap.add_argument('--to', dest='yto', type=int, default=2026)
    ap.add_argument('--workers', type=int, default=14)
    a = ap.parse_args()
    if a.smoke:
        run_smoke(a.limit, a.year)
    elif a.full:
        run_full(list(range(a.yfrom, a.yto+1)), a.workers)
    else:
        ap.error("choose --smoke or --full")
