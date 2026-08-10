#!/usr/bin/env python3
"""Verify a source-independent way to recover an edition's REAL effective date.

Problem: asking Rada for /ed{date} does not reliably return that edition. When the requested
date is not an actual edition boundary it serves the current text instead, so the date we
requested is a fetch key, not a fact about the text. The OpenData pages admit this in a
«Текст документа від DD.MM.YYYY» line, but that line is absent from every zakon /print page,
which is where 48% of the corpus came from.

Candidate detector, available in BOTH sources: the preamble lists the amendments folded in,
«Із змінами, внесеними згідно з ... від DD.MM.YYYY». The LATEST such date should be the
edition actually served.

This script tests that candidate against the rows where the truth is known (declared date
present). Verify the detector before trusting it on the 90% where it cannot be checked.
"""
import glob
import json
import re
import sys

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
RE_DECLARED = re.compile(r"Текст документа від (\d{2})\.(\d{2})\.(\d{4})")
# Dates inside the amendment preamble. Restricted to the head of the document: later "від"
# dates belong to cited acts in the body and would poison the maximum.
RE_AMEND = re.compile(r"(?:[Ii]з змінами|внесеними згідно)", re.I)
RE_DATE = re.compile(r"від (\d{2})\.(\d{2})\.(\d{4})")


def effective_from_text(text: str) -> str:
    head = text[:12000]
    if not RE_AMEND.search(head):
        return ""
    # take the amendment block: from the first marker to the end of the head window
    start = RE_AMEND.search(head).start()
    block = head[start:start + 8000]
    dates = [f"{y}{m}{d}" for d, m, y in RE_DATE.findall(block)]
    return max(dates) if dates else ""


def main():
    checked = agree = disagree = nodetect = 0
    examples = []
    for path in sorted(glob.glob("/data/rada_npa/texts/*/shard_*.ndjson")):
        for line in open(path, encoding="utf-8"):
            if checked >= LIMIT:
                break
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("http_status") != 200:
                continue
            text = r.get("text") or ""
            m = RE_DECLARED.search(text[:4000])
            if not m:
                continue                      # truth unknown, cannot score
            truth = f"{m.group(3)}{m.group(2)}{m.group(1)}"
            got = effective_from_text(text)
            checked += 1
            if not got:
                nodetect += 1
            elif got == truth:
                agree += 1
            else:
                disagree += 1
                if len(examples) < 6:
                    examples.append((r["nreg"], r["ed_date"], truth, got))
        if checked >= LIMIT:
            break
    print(f"checked={checked} agree={agree} disagree={disagree} no_detection={nodetect}")
    if checked:
        print(f"precision_when_detected={100*agree/max(agree+disagree,1):.1f}%  "
              f"coverage={100*(agree+disagree)/checked:.1f}%")
    for e in examples:
        print("  disagree:", e)


if __name__ == "__main__":
    main()
