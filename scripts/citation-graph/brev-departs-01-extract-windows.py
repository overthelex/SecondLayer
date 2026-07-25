#!/usr/bin/env python3
# =====================================================================
# brev-departs-01-extract-windows.py   (runs ON brev, as postgres)
# DEPARTS_FROM layer, step 1: extract Grand Chamber (Велика Палата ВС,
# court_code=9951) "відступ" windows for LLM classification.
#
# Scope is tiny (~27K GC decisions), so we pull their fulltext by doc_id
# (indexed) instead of scanning the 133M edrsr_fulltext. For each decision
# whose text contains departure language, emit one JSONL record per
# 'відступ' hit: a ±130/700 char window + a regex-guessed target case №.
# The Bedrock Haiku pass (departs-02-classify.py, on prod) decides which
# windows are real formal departures and pins the departed-from case.
#
#   sudo -u postgres python3 brev-departs-01-extract-windows.py \
#       > /home/nvidia/citation-rebuild/gc_departs_windows.jsonl
# =====================================================================
import json, re, sys, psycopg2

DSN = "dbname=edrsr_local"
GC_COURT = "9951"
PRE, POST = 130, 700

# departure language: "відступ..." followed (nearby) by "висновк|правов"
DEPART_RE = re.compile(r"відступ\w*", re.IGNORECASE)
DEPART_CTX_RE = re.compile(r"відступ\w*[\s\S]{0,60}?(висновк|правов)", re.IGNORECASE)
# obvious negatives: "не вбачає/відсутні підстав ... відступ"
NEG_RE = re.compile(r"(не\s+вбача\w+|відсутн\w+\s+підстав\w*)[\s\S]{0,80}?відступ", re.IGNORECASE)
# candidate departed-from case number: "№ 826/3858/18" / "справі № 580/6246/23"
CASE_RE = re.compile(r"(?:№|справі\s+№)\s*(\d+/\d+/\d+(?:-[а-яіїєґA-Za-z0-9]+)?)", re.IGNORECASE)


def main():
    conn = psycopg2.connect(DSN)
    conn.set_session(readonly=True)
    cur = conn.cursor("gc_docs")          # server-side cursor
    cur.itersize = 2000
    # GC decisions + own case number + date, join fulltext by doc_id
    cur.execute(f"""
        SELECT d.doc_id, d.cause_num, d.adjudication_date, f.full_text
        FROM edrsr_documents d
        JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.court_code = %s
    """, (GC_COURT,))

    n_docs = n_windows = 0
    for doc_id, cause_num, adj_date, text in cur:
        if not text or "відступ" not in text.lower():
            continue
        n_docs += 1
        low = text
        for m in DEPART_RE.finditer(low):
            i = m.start()
            window = text[max(0, i - PRE): i + POST]
            if not DEPART_CTX_RE.search(window):
                continue
            neg = bool(NEG_RE.search(window))
            cand = CASE_RE.search(window)
            candidate = cand.group(1) if cand else None
            # skip self-reference (departing from own case is meaningless)
            if candidate and cause_num and candidate == cause_num:
                continue
            rec = {
                "doc_id": doc_id,
                "cause_num": cause_num,
                "adj_date": adj_date.isoformat() if adj_date else None,
                "candidate_case": candidate,
                "likely_negative": neg,
                "window": window,
            }
            print(json.dumps(rec, ensure_ascii=False))
            n_windows += 1
    sys.stderr.write(f"GC decisions with departure text: {n_docs}; windows emitted: {n_windows}\n")


if __name__ == "__main__":
    main()
