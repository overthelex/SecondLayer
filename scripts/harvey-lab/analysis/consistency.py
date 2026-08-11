"""Check that every number asserted in a criterion actually appears in a document."""
import json, re, zipfile, glob, sys
from pathlib import Path

TXT = re.compile(r"<(?:w|a):t(?:\s[^>]*)?>(.*?)</(?:w|a):t>|<t(?:\s[^>]*)?>(.*?)</t>|<v>(.*?)</v>", re.S)

def doc_text(p):
    out = []
    with zipfile.ZipFile(p) as z:
        for n in z.namelist():
            if n.endswith(".xml"):
                for g in TXT.findall(z.read(n).decode("utf-8", "ignore")):
                    out.extend(x for x in g if x)
    return " ".join(out)

for task_dir in sys.argv[1:]:
    t = Path(task_dir)
    cfg = json.loads((t / "task.json").read_text(encoding="utf-8"))
    corpus = " ".join(doc_text(p) for p in sorted((t / "documents").glob("*")))
    corpus_norm = corpus.replace(" ", " ")
    print("=" * 78)
    print(t.name, "|", len(cfg["criteria"]), "criteria")
    missing = []
    for c in cfg["criteria"]:
        # numbers with >=4 digits (amounts, codes, years) and dd.mm.yyyy dates
        text = c["match_criteria"]
        toks = set(re.findall(r"\b\d{2}\.\d{2}\.\d{4}\b", text))
        toks |= set(re.findall(r"\b\d[\d  ]{3,}\d\b", text))
        for tok in toks:
            tn = tok.replace(" ", " ").strip()
            if tn in corpus_norm:
                continue
            # allow computed values that are stated as derived
            compact = tn.replace(" ", "")
            if compact in corpus_norm.replace(" ", ""):
                continue
            missing.append((c["id"], tn))
    if missing:
        print("  NOT FOUND VERBATIM in documents (may be computed, check each):")
        for cid, tok in missing:
            print("   ", cid, "->", tok)
    else:
        print("  all asserted numbers/dates appear in the documents")
