"""Control for genre: chars-per-token on a PARALLEL en/uk corpus.

Same sentences, two languages, so any chars-per-token difference is
attributable to language+script alone, not to document genre.
"""
import json, sys
from pathlib import Path

def get_parallel(n=40000):
    from datasets import load_dataset
    for name, cfg in [("Helsinki-NLP/opus-100", "en-uk"), ("Helsinki-NLP/opus_books", "en-uk")]:
        try:
            ds = load_dataset(name, cfg, split="train", streaming=True)
            en, uk = [], []
            for row in ds:
                tr = row.get("translation") or {}
                a, b = tr.get("en"), tr.get("uk")
                if a and b and len(a) > 30 and len(b) > 30:
                    en.append(a); uk.append(b)
                if len(en) >= n:
                    break
            if en:
                print(f"  [parallel source: {name}/{cfg}, {len(en)} pairs]", file=sys.stderr)
                return en, uk
        except Exception as e:
            print(f"  [{name}/{cfg} failed: {type(e).__name__}: {str(e)[:120]}]", file=sys.stderr)
    return [], []

def cpt(texts, encode):
    c = t = 0
    for x in texts:
        c += len(x); t += len(encode(x))
    return c / t if t else float("nan")

def main():
    en, uk = get_parallel()
    if not en:
        print("ABORT: no parallel corpus", file=sys.stderr); sys.exit(1)
    print(f"  EN {sum(map(len,en)):,} chars / UK {sum(map(len,uk)):,} chars", file=sys.stderr)

    encoders = {}
    try:
        import tiktoken
        encoders["o200k_base (GPT-4o/5)"] = tiktoken.get_encoding("o200k_base").encode
    except Exception as e:
        print(f"tiktoken: {e}", file=sys.stderr)
    try:
        from transformers import AutoTokenizer
        tk = AutoTokenizer.from_pretrained("deepseek-ai/DeepSeek-V3", trust_remote_code=True)
        encoders["DeepSeek-V3"] = lambda s, tk=tk: tk.encode(s, add_special_tokens=False)
    except Exception as e:
        print(f"deepseek: {type(e).__name__}", file=sys.stderr)

    rows = []
    print("\n=== PARALLEL corpus: same sentences, EN vs UK ===")
    print(f"{'tokenizer':<24} {'cpt_EN':>8} {'cpt_UK':>8} {'est/real EN':>12} {'est/real UK':>12} {'misrank':>9}")
    for label, encode in encoders.items():
        e, u = cpt(en, encode), cpt(uk, encode)
        # build_profile.py does est_tokens = chars // 4  =>  est/real = cpt/4
        re_, ru = e / 4.0, u / 4.0
        rows.append({"tokenizer": label, "cpt_en": round(e,3), "cpt_uk": round(u,3),
                     "est_over_real_en": round(re_,3), "est_over_real_uk": round(ru,3),
                     "misrank_factor": round(re_/ru,2)})
        print(f"{label:<24} {e:>8.3f} {u:>8.3f} {re_:>12.2f} {ru:>12.2f} {re_/ru:>8.2f}x")
    print("\nest/real = how the `chars//4` profiler scores the task vs its true token count.")
    print("misrank  = how much larger an EN task looks than a UK task of identical TRUE size.")
    Path("parallel_result.json").write_text(json.dumps(rows, indent=2))

if __name__ == "__main__":
    main()
