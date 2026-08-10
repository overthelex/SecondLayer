#!/usr/bin/env python3
"""Single streaming pass over the NDJSON shards, producing one audit row per fetched edition.

Answers two questions at once:
  consistency - does what we fetched match what the metadata says we should have, and is the
    text actually the edition we asked for?
  storage sizing - how much of the corpus is duplicate text, how much has article structure,
    what the length distribution looks like. Those decide the schema, so they must be measured
    rather than extrapolated from the 585-act corpus (which is not a representative sample:
    it is hand-picked codes, the long structured tail of the distribution).

Emits TSV: nreg, ed_date, status, char_len, text_hash, src, declared_date, has_articles, flags
"""
import glob
import json
import re
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "/data/rada_npa/audit.tsv"

# "Текст документа від 06.03.2001:" - the edition the page says it is. Comparing this against
# the ed_date we requested is the only real check that Rada served the right version rather
# than silently falling back to the current text.
RE_DECLARED = re.compile(r"Текст документа від (\d{2})\.(\d{2})\.(\d{4})")
# Article structure: «Стаття 5» / «Стаття 5-1». Its presence decides whether an act can be
# split into an article layer at all.
RE_ARTICLE = re.compile(r"(?m)^\s*Стаття\s+\d+")
# Pages that return HTTP 200 while carrying no document.
RE_ERRORISH = re.compile(r"(Помилка|не знайдено|Доступ обмежено|Технічні роботи)", re.I)


def main():
    n = bad = 0
    with open(OUT, "w", encoding="utf-8") as out:
        for path in sorted(glob.glob("/data/rada_npa/texts/*/shard_*.ndjson")):
            for line in open(path, encoding="utf-8"):
                try:
                    r = json.loads(line)
                except Exception:
                    bad += 1
                    continue
                nreg, ed = r.get("nreg", ""), r.get("ed_date", "")
                st = r.get("http_status", 0)
                text = r.get("text") or ""
                declared = ""
                arts = 0
                flags = []
                if st == 200:
                    m = RE_DECLARED.search(text[:4000])
                    if m:
                        declared = f"{m.group(3)}{m.group(2)}{m.group(1)}"
                    arts = len(RE_ARTICLE.findall(text))
                    if len(text) < 400:
                        flags.append("short")
                    if RE_ERRORISH.search(text[:1500]):
                        flags.append("errorish")
                out.write("\t".join([
                    nreg, ed, str(st), str(r.get("char_len", 0)),
                    r.get("text_hash") or "", r.get("src") or "",
                    declared, str(arts), ",".join(flags) or "-",
                ]) + "\n")
                n += 1
    print(f"rows={n} unparsed={bad}", flush=True)


if __name__ == "__main__":
    main()
