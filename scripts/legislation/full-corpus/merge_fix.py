#!/usr/bin/env python3
"""Emit the re-harvested slash-act editions for merging into npa.

Same verdict rules as the first load, deliberately: an empty body or an error page served as
HTTP 200 gets its own status so it is excluded by the very filter that excludes a 404. If these
two loads disagreed about what counts as a usable text, the metadata and the text table would
drift apart and nothing downstream would notice.

Writes:
  meta.tsv  nreg, ed_date, status, char_len, text_hash, source, declared_date
  text.csv  nreg, ed_date, is_current, body
"""
import csv
import glob
import json
import re
import sys

OUT_META = sys.argv[1]
OUT_TEXT = sys.argv[2]
CURRENT_FILE = sys.argv[3]

RE_DECLARED = re.compile(r"Текст документа від (\d{2})\.(\d{2})\.(\d{4})")
RE_ERRORISH = re.compile(r"(Помилка|не знайдено|Доступ обмежено|Технічні роботи)", re.I)


def main():
    current = set()
    with open(CURRENT_FILE, encoding="utf-8") as f:
        for line in f:
            a, _, b = line.rstrip("\n").partition("\t")
            if a and b:
                current.add((a, b))

    best = {}          # pair -> (status, text, declared, hash) ; re-runs may overlap
    for path in sorted(glob.glob("/data/rada_npa/fix/node*/shard_*.ndjson")):
        for line in open(path, encoding="utf-8"):
            try:
                r = json.loads(line)
            except Exception:
                continue
            key = (r.get("nreg"), r.get("ed_date"))
            if not key[0]:
                continue
            st = r.get("http_status", 0)
            text = r.get("text") or ""
            if st == 200:
                if not text:
                    st = 900
                elif RE_ERRORISH.search(text[:1500]):
                    st = 901
            m = RE_DECLARED.search(text[:4000]) if st == 200 else None
            decl = f"{m.group(3)}{m.group(2)}{m.group(1)}" if m else ""
            cand = (st, text, decl, r.get("text_hash") or "", r.get("src") or "")
            prev = best.get(key)
            # lowest status wins, then the longest text: a truncated retry must not displace a
            # complete fetch
            if prev is None or (cand[0], -len(cand[1])) < (prev[0], -len(prev[1])):
                best[key] = cand

    nm = nt = 0
    fm = open(OUT_META, "w", encoding="utf-8")
    ft = open(OUT_TEXT, "w", encoding="utf-8", newline="")
    wt = csv.writer(ft)
    for (nreg, ed), (st, text, decl, h, src) in best.items():
        iso = f"{ed[0:4]}-{ed[4:6]}-{ed[6:8]}"
        di = f"{decl[0:4]}-{decl[4:6]}-{decl[6:8]}" if decl else ""
        fm.write("\t".join([nreg, iso, str(st), str(len(text)), h, src, di]) + "\n")
        nm += 1
        if st == 200:
            wt.writerow([nreg, iso, "t" if (nreg, ed) in current else "f", text])
            nt += 1
    fm.close()
    ft.close()
    by = {}
    for (st, *_rest) in best.values():
        by[st] = by.get(st, 0) + 1
    print(f"[merge] editions={nm} texts={nt} by_status={dict(sorted(by.items()))}", flush=True)


if __name__ == "__main__":
    main()
