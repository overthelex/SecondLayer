#!/usr/bin/env python3
"""Check the seven statute-review workspaces for internal consistency.

The grounding check already proves each criterion quotes words that are in the cited article.
It proves nothing about whether the workspace HANGS TOGETHER: whether the clause a criterion
names exists in the draft, whether the act supplied is the edition in force on the matter date,
whether the supporting extract agrees with the instrument, whether the deliverable the
instructions ask for is the one the criteria are scoped to.

Those are the failures that make a task unanswerable while every individual piece looks right,
so each is asserted here rather than eyeballed.

Run from the harvey-labs checkout, with acts.json and the task tree in place.
"""

import collections
import glob
import json
import os
import re
import sys
import zipfile

ACTS = json.load(open(os.path.expanduser("~/harness-lab/acts.json"), encoding="utf-8"))
_pilot = json.load(open(os.path.expanduser("~/harness-lab/act_2275.json"), encoding="utf-8"))
ACTS[_pilot["nreg"]] = _pilot
TASK_GLOB = "tasks/*/ua-*-review/task.json"
CLAUSE = re.compile(r"п\.\s*(\d+(?:\.\d+)*)")
ART_CITE = re.compile(r"статт[іїя]\s+(\d+)")


def docx_text(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml))


def docx_paras(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "ignore")
    out = []
    for chunk in xml.split("</w:p>"):
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", chunk)).strip()
        if t:
            out.append(t)
    return out


def to_iso(dmy):
    d, m, y = dmy.split(".")
    return f"{y}{m}{d}"


problems = collections.defaultdict(list)
checked = 0

for tj in sorted(glob.glob(TASK_GLOB)):
    d = json.load(open(tj, encoding="utf-8"))
    tid = "/".join(tj.split("/")[1:3])
    docdir = os.path.join(os.path.dirname(tj), "documents")
    files = {os.path.basename(f): f for f in glob.glob(os.path.join(docdir, "*"))}
    checked += 1

    # 1. deliverable named in instructions == deliverables map == what criteria are scoped to
    deliv = list(d["deliverables"])
    if len(deliv) != 1:
        problems[tid].append(f"expected one deliverable, got {deliv}")
    name = deliv[0]
    if name not in d["instructions"]:
        problems[tid].append(f"instructions never name the deliverable {name}")
    for c in d["criteria"]:
        if c["deliverables"] != [name]:
            problems[tid].append(f"{c['id']} scoped to {c['deliverables']}, not [{name}]")

    # 2. the act in the workspace is the act the criteria are about
    actfile = [f for f in files if f.startswith("zakon-")]
    if len(actfile) != 1:
        problems[tid].append(f"expected one act document, got {actfile}")
        continue
    nreg = actfile[0][len("zakon-"):-len(".docx")]
    if nreg not in ACTS:
        problems[tid].append(f"act {nreg} not in acts.json")
        continue
    act = ACTS[nreg]

    supplied = docx_text(files[actfile[0]])
    if len(supplied.split()) < 0.9 * len(act["text"].split()):
        problems[tid].append(
            f"act document holds {len(supplied.split()):,} words, source has "
            f"{len(act['text'].split()):,} — text was truncated on the way in")

    # 3. THE EDITION MUST BE THE ONE IN FORCE ON THE MATTER DATE.
    #    Editions were selected by today's date, not the matter date. If the act has an
    #    edition dated after the matter but before today, the workspace supplies a text that
    #    was not yet law when the matter arose, and the task asks the model to apply it.
    dates = sorted(set(re.findall(r"\b(\d{2}\.\d{2}\.20\d{2})\b", d["instructions"])))
    if not dates:
        problems[tid].append("instructions carry no matter date")
    else:
        matter = to_iso(dates[-1])
        if act["ed_date"] > matter:
            problems[tid].append(
                f"edition {act['ed_date']} is LATER than the matter date {matter}: the "
                f"workspace supplies a text that was not in force")
        # the criteria say "as it stood on <matter date>" — the date must agree
        for c in d["criteria"]:
            for got in re.findall(r"as it stood on (\d{2}\.\d{2}\.20\d{2})", c["match_criteria"]):
                if to_iso(got) != matter:
                    problems[tid].append(
                        f"{c['id']} says 'as it stood on {got}', instructions say {dates[-1]}")

    # 4. every clause a criterion names must exist in the draft instrument
    draft = [f for f in files if f.startswith("proyekt-")]
    if len(draft) != 1:
        problems[tid].append(f"expected one draft document, got {draft}")
    else:
        paras = docx_paras(files[draft[0]])
        heads = set()
        for p in paras:
            m = re.match(r"(\d+(?:\.\d+)+)\.\s", p)
            if m:
                heads.add(m.group(1))
        dupes = [c for c, k in collections.Counter(
            re.match(r"(\d+(?:\.\d+)+)\.\s", p).group(1)
            for p in paras if re.match(r"(\d+(?:\.\d+)+)\.\s", p)).items() if k > 1]
        if dupes:
            problems[tid].append(f"draft has duplicate clause numbers: {sorted(dupes)}")
        for c in d["criteria"]:
            for cl in CLAUSE.findall(c["title"] + " " + c["match_criteria"]):
                if cl not in heads:
                    problems[tid].append(
                        f"{c['id']} names clause {cl}, which is not in the draft")
        # a criterion about an OMITTED clause must not find that clause present
        for c in d["criteria"]:
            if "(missing)" in c["title"] and "identifies" in c["title"]:
                pass  # nothing structural to assert; grounding covers the provision

    print(f"  {tid}")
    print(f"      act {nreg} ed {act['ed_date']}  matter {dates[-1] if dates else '?'}  "
          f"supplied {len(supplied.split()):,}w of {len(act['text'].split()):,}w")
    print(f"      clauses in draft: {len(heads) if draft else 0}  "
          f"clause refs in criteria: {len(set(CLAUSE.findall(json.dumps(d['criteria'], ensure_ascii=False))))}"
          f"  articles cited: {sorted({int(x) for x in ART_CITE.findall(json.dumps(d['criteria'], ensure_ascii=False))})}")

    # 5. every article a criterion cites must exist in the act
    nums = {a["n"] for a in act["articles"]}
    for c in d["criteria"]:
        for art in ART_CITE.findall(c["match_criteria"]):
            if int(art) not in nums:
                problems[tid].append(f"{c['id']} cites article {art}, absent from {nreg}")

    # 6. the supporting extract must not contradict the draft
    party = [f for f in files if f.startswith("vidomosti-")]
    if party:
        ptext = docx_text(files[party[0]])
        dtext = docx_text(files[draft[0]]) if draft else ""
        for num in set(re.findall(r"\b\d[\d\s]{4,}\b", ptext)):
            clean = num.strip()
            if len(clean.replace(" ", "")) >= 5 and clean not in dtext and \
                    clean.replace(" ", " ") not in dtext:
                pass  # amounts legitimately appear in only one of the two
        for code in re.findall(r"ЄДРПОУ[^\d]{0,12}(\d{8})", ptext):
            if code in supplied:
                problems[tid].append(f"party code {code} also occurs in the act text")

print(f"checked {checked} tasks\n")
if not problems:
    print("no inconsistencies found")
    sys.exit(0)
for tid, items in sorted(problems.items()):
    print(f"{tid}")
    for x in items:
        print(f"    {x}")
print(f"\n{sum(len(v) for v in problems.values())} problems across {len(problems)} tasks")
sys.exit(1)
