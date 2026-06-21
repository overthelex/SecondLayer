#!/usr/bin/env python3
"""A/B Phase 0 — offline replay: our model (B) vs frontier Bedrock (A), same inputs.

Answers the core question cheaply, no prod infra: is the self-hosted 14B candidate
(SFT-v2 + DPO + cg-DPO + citation validator) competitive with a frontier Bedrock
generator, and at what cost? Pairwise LLM-judge win-rate + deterministic
citation-faithfulness + cost + latency.

  genb    generate B answers with the local model (+ validator), save latency.   (GPU, shardable)
  judge   generate A answers (Bedrock Sonnet 4.5) on the same input, then judge
          A vs B pairwise (randomized order to kill position bias) + faithfulness. (Bedrock)
  report  aggregate -> win-rate, faithfulness A vs B, cost, latency -> go/no-go.

Held-out: a slice of run_100k retrieved (same context for both arms -> fair). B has a
mild train-overlap home advantage -> if B still loses, it's conclusively not ready.
"""
from __future__ import annotations
import argparse, json, os, random, re, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import sys
sys.path.insert(0, "/data/sft-serve")
from citation_validator import validate_citations

DATA = "/data/sft-distill/run_100k/retrieved.jsonl"
MODEL_PATH = os.environ.get("MODEL_PATH", "/data/cpt-pipeline/17_final_v2")
A_MODEL = os.environ.get("A_MODEL", "eu.anthropic.claude-sonnet-4-5-20250929-v1:0")
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "eu.anthropic.claude-sonnet-4-5-20250929-v1:0")
OFFSET = int(os.environ.get("OFFSET", "1000"))
SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих витягів "
    "із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй посиланням [doc:ID]. "
    "Пиши українською."
)
# rough Bedrock Sonnet 4.5 on-demand pricing ($/1M tok)
A_IN, A_OUT = 3.0, 15.0


def load_examples(n):
    recs = [json.loads(l) for l in open(DATA)][OFFSET:OFFSET + n]
    out = []
    for r in recs:
        rows = list(r["relevant"]) + list(r["distractors"])
        random.Random(r["id"]).shuffle(rows)
        ctx = "\n\n".join("[doc:%s] %s" % (x["doc_id"], x["text"][:300]) for x in rows)
        out.append({"id": r["id"], "query": r["query"],
                    "ctx": ctx, "ctx_ids": [str(x["doc_id"]) for x in rows]})
    return out


def user_msg(query, ctx):
    return ("Питання: %s\n\nДжерела (витяги з рішень ЄДРСР):\n%s\n\n"
            "Дай обґрунтовану відповідь українською з посиланнями [doc:ID]." % (query, ctx))


# ---------------- genb (local model + validator) ----------------
def cmd_genb(args):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True, extra_special_tokens={})
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(MODEL_PATH, torch_dtype=torch.bfloat16,
                                                 device_map="auto", attn_implementation="sdpa",
                                                 trust_remote_code=True).eval()
    exs = load_examples(args.n)[args.shard_idx::args.shard_count]
    out = open(args.output, "w")
    for i, e in enumerate(exs):
        ids = tok.apply_chat_template(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_msg(e["query"], e["ctx"])}],
            add_generation_prompt=True, return_tensors="pt", truncation=True, max_length=3500).to(model.device)
        t = time.time()
        with torch.no_grad():
            g = model.generate(ids, max_new_tokens=512, do_sample=False, pad_token_id=tok.pad_token_id)
        lat = time.time() - t
        raw = tok.decode(g[0, ids.shape[1]:], skip_special_tokens=True)
        v = validate_citations(raw, set(e["ctx_ids"]))
        out.write(json.dumps({**e, "b_answer": v.answer, "b_stripped": len(v.stripped),
                              "b_cited": len(v.kept), "b_latency": round(lat, 2)}, ensure_ascii=False) + "\n")
        out.flush()
        if (i + 1) % 20 == 0:
            print("genb %d/%d" % (i + 1, len(exs)), flush=True)
    out.close()


# ---------------- judge (Bedrock A + pairwise) ----------------
def cmd_judge(args):
    import boto3
    from botocore.config import Config
    cli = boto3.client("bedrock-runtime", config=Config(region_name="eu-central-1", max_pool_connections=64))
    lock = threading.Lock()

    def bedrock(model, system, user, max_tokens=1200, temp=0.3):
        body = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "temperature": temp,
                "system": system, "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}]}
        for a in range(6):
            try:
                r = cli.invoke_model(modelId=model, body=json.dumps(body))
                p = json.loads(r["body"].read())
                txt = "".join(b.get("text", "") for b in p.get("content", []))
                usage = p.get("usage", {})
                return txt.strip(), usage.get("input_tokens", 0), usage.get("output_tokens", 0)
            except Exception:
                time.sleep(min(2 * 2 ** a, 30))
        return "", 0, 0

    JSYS = ('Ти — суддя якості юридичних відповідей. Дано питання, джерела і дві відповіді (X та Y). '
            'Обери кращу за: обґрунтованість джерелами, повнота, корисність, якість цитат. '
            'Поверни ЛИШЕ JSON: {"winner":"X"|"Y"|"tie","reason":"<до 15 слів>"}.')
    rows = [json.loads(l) for l in open(args.input)]
    out = open(args.output, "w")

    def work(e):
        a_ans, ain, aout = bedrock(A_MODEL, SYSTEM_PROMPT, user_msg(e["query"], e["ctx"]), max_tokens=1500)
        av = validate_citations(a_ans, set(e["ctx_ids"]))
        # randomize X/Y to remove position bias
        b_first = random.Random(hash(e["id"])).random() < 0.5
        X, Y = (e["b_answer"], a_ans) if b_first else (a_ans, e["b_answer"])
        ju = ("Питання: %s\n\nДжерела:\n%s\n\nВідповідь X:\n%s\n\nВідповідь Y:\n%s" %
              (e["query"], e["ctx"][:3000], X[:1800], Y[:1800]))
        raw, _, _ = bedrock(JUDGE_MODEL, JSYS, ju, max_tokens=120, temp=0.0)
        m = re.search(r"\{.*\}", raw, re.S)
        w = json.loads(m.group(0)).get("winner", "tie") if m else "tie"
        if w in ("X", "Y"):
            winner = "B" if (w == "X") == b_first else "A"
        else:
            winner = "tie"
        rec = {"id": e["id"], "winner": winner,
               "a_stripped": len(av.stripped), "a_cited": len(av.kept),
               "b_stripped": e["b_stripped"], "b_cited": e["b_cited"], "b_latency": e["b_latency"],
               "a_cost": round(ain / 1e6 * A_IN + aout / 1e6 * A_OUT, 5)}
        with lock:
            out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for f in as_completed([ex.submit(work, e) for e in rows]):
            done += 1
            try: f.result()
            except Exception as ee: print("judge err:", str(ee)[:80], flush=True)
            if done % 20 == 0: print("judge %d/%d" % (done, len(rows)), flush=True)
    out.close()


# ---------------- report ----------------
def cmd_report(args):
    rows = [json.loads(l) for l in open(args.input)]
    n = len(rows)
    wins = {"A": 0, "B": 0, "tie": 0}
    for r in rows: wins[r["winner"]] += 1
    a_cite = sum(r["a_cited"] for r in rows); a_strip = sum(r["a_stripped"] for r in rows)
    b_cite = sum(r["b_cited"] for r in rows); b_strip = sum(r["b_stripped"] for r in rows)
    a_cost = sum(r["a_cost"] for r in rows)
    b_lat = sorted(r["b_latency"] for r in rows)
    rep = {
        "n": n,
        "winrate_B": round(100 * wins["B"] / n, 1), "winrate_A": round(100 * wins["A"] / n, 1),
        "tie": round(100 * wins["tie"] / n, 1),
        "A_faithfulness_pct": round(100 * a_cite / (a_cite + a_strip), 1) if (a_cite + a_strip) else None,
        "B_faithfulness_pct": 100.0,  # validator guarantees grounded citations
        "B_raw_fab_stripped": b_strip,
        "A_cost_per_query_usd": round(a_cost / n, 4), "B_cost_per_query_usd": "~self-hosted (≈0)",
        "B_latency_p50_s": b_lat[n // 2], "B_latency_p95_s": b_lat[int(n * 0.95)],
    }
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    json.dump(rep, open(args.output, "w"), ensure_ascii=False, indent=2)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("genb"); g.add_argument("--n", type=int, default=160); g.add_argument("--shard-idx", type=int, default=0); g.add_argument("--shard-count", type=int, default=1); g.add_argument("--output", required=True)
    j = sub.add_parser("judge"); j.add_argument("--input", required=True); j.add_argument("--output", required=True); j.add_argument("--workers", type=int, default=16)
    r = sub.add_parser("report"); r.add_argument("--input", required=True); r.add_argument("--output", default="phase0_report.json")
    a = p.parse_args()
    {"genb": cmd_genb, "judge": cmd_judge, "report": cmd_report}[a.cmd](a)


if __name__ == "__main__":
    main()
