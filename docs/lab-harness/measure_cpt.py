"""Measure chars-per-token for EN vs UA legal text.

Tests the `est_tokens = chars // 4` heuristic in
harness-optimization/legal_agent_bench/splits/build_profile.py:69,
which drives context-size bucketing in the frozen LAB split.

EN sample: the actual harvey-labs task documents (.docx) = the exact text
the heuristic was calibrated on. UA sample: Ukrainian court decisions.
"""
import glob, json, random, statistics, sys
from pathlib import Path

random.seed(20260611)  # same seed as lab_split.json

LAB = Path.home() / "harness-lab" / "harvey-labs"


def read_docx(p):
    import docx
    try:
        return "\n".join(x.text for x in docx.Document(p).paragraphs)
    except Exception:
        return ""


def en_sample(n=120):
    files = glob.glob(str(LAB / "tasks" / "**" / "documents" / "*.docx"), recursive=True)
    random.shuffle(files)
    out = []
    for f in files:
        t = read_docx(f)
        if len(t) > 2000:
            out.append(t)
        if len(out) >= n:
            break
    return out


def ua_sample(n=120):
    from datasets import load_dataset
    for name, field in [
        ("overthelex/ua-legal-bench", None),
        ("overthelex/ukrainian-court-decisions", "text"),
    ]:
        try:
            ds = load_dataset(name, split="train", streaming=True)
            out = []
            for row in ds:
                txt = None
                if field and field in row:
                    txt = row[field]
                else:
                    for k in ("text", "full_text", "facts", "content", "input"):
                        if isinstance(row.get(k), str) and len(row[k]) > 2000:
                            txt = row[k]; break
                if txt and len(txt) > 2000:
                    out.append(txt)
                if len(out) >= n:
                    break
            if out:
                print(f"  [ua source: {name}, {len(out)} docs]", file=sys.stderr)
                return out
        except Exception as e:
            print(f"  [ua source {name} failed: {type(e).__name__}: {str(e)[:120]}]", file=sys.stderr)
    return []


def cpt(texts, encode):
    """chars per token, aggregated over the corpus (not mean of ratios)."""
    c = t = 0
    for x in texts:
        c += len(x)
        t += len(encode(x))
    return c / t if t else float("nan")


def main():
    print("sampling EN from harvey-labs .docx ...", file=sys.stderr)
    en = en_sample()
    print(f"  {len(en)} EN docs, {sum(map(len,en)):,} chars", file=sys.stderr)
    print("sampling UA ...", file=sys.stderr)
    ua = ua_sample()
    print(f"  {len(ua)} UA docs, {sum(map(len,ua)):,} chars", file=sys.stderr)
    if not en or not ua:
        print("ABORT: missing a sample", file=sys.stderr); sys.exit(1)

    encoders = {}
    try:
        import tiktoken
        enc = tiktoken.get_encoding("o200k_base")
        encoders["o200k_base (GPT-4o/5)"] = enc.encode
    except Exception as e:
        print(f"tiktoken failed: {e}", file=sys.stderr)
    for hf_id, label in [("deepseek-ai/DeepSeek-V3", "DeepSeek-V3")]:
        try:
            from transformers import AutoTokenizer
            tk = AutoTokenizer.from_pretrained(hf_id, trust_remote_code=True)
            encoders[label] = lambda s, tk=tk: tk.encode(s, add_special_tokens=False)
        except Exception as e:
            print(f"{hf_id} failed: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)

    rows = []
    for label, encode in encoders.items():
        e, u = cpt(en, encode), cpt(ua, encode)
        rows.append({
            "tokenizer": label,
            "cpt_en": round(e, 3), "cpt_ua": round(u, 3),
            "ua_underestimate_pct": round((4.0 / u - 1) * 100, 1),
            "en_error_pct": round((4.0 / e - 1) * 100, 1),
        })

    print("\n=== chars per token, EN (LAB docs) vs UA (court decisions) ===")
    print(f"{'tokenizer':<24} {'cpt_EN':>8} {'cpt_UA':>8} {'//4 err EN':>12} {'//4 err UA':>12}")
    for r in rows:
        print(f"{r['tokenizer']:<24} {r['cpt_en']:>8} {r['cpt_ua']:>8} "
              f"{r['en_error_pct']:>11}% {r['ua_underestimate_pct']:>11}%")
    print("\nPositive error = `chars//4` UNDERESTIMATES real token count by that much.")
    Path("cpt_result.json").write_text(json.dumps(rows, indent=2))
    print("\nwrote cpt_result.json")


if __name__ == "__main__":
    main()
