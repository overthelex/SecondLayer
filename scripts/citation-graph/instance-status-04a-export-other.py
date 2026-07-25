#!/usr/bin/env python3
"""Phase 4 export (run as postgres): dump {doc_id, oper} JSONL for the regex 'other' bucket."""
import argparse, re, json, psycopg2
DSN = "dbname=edrsr_local"
def _spaced(w): return r'\s*'.join(list(w))
OPER_RE = re.compile('(' + '|'.join(_spaced(w) for w in
    ['ПОСТАНОВИВ','ПОСТАНОВИЛ','ВИРІШИВ','ВИРІШИЛ','УХВАЛИВ','УХВАЛИЛ']) + ')', re.IGNORECASE)
def operative_slice(text):
    if not text: return ''
    last=None
    for m in OPER_RE.finditer(text): last=m
    return (text[last.end():last.end()+2200] if last else text[-1400:]).strip()
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--limit',type=int,default=0); ap.add_argument('--out',required=True)
    a=ap.parse_args()
    q="SELECT d.doc_id, f.full_text FROM edrsr_instance_disposition d JOIN edrsr_fulltext f ON f.doc_id=d.doc_id WHERE d.disposition='other'"
    if a.limit: q+=f" LIMIT {int(a.limit)}"
    n=0
    with psycopg2.connect(DSN) as c, c.cursor(name='c_o') as cur, open(a.out,'w') as w:
        cur.itersize=4000; cur.execute(q)
        for doc_id, txt in cur:
            w.write(json.dumps({"doc_id":doc_id,"oper":operative_slice(txt)[:6000]}, ensure_ascii=False)+"\n"); n+=1
    print(f"wrote {n} -> {a.out}")
if __name__=='__main__': main()
