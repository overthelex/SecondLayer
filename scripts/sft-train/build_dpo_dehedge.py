#!/usr/bin/env python3
"""Build DPO preference pairs to remove the compulsive 'джерел недостатньо' hedge (LEXAI-1735).

rejected = the original hedged teacher answer (from sft-distill teacher.jsonl).
chosen   = a de-hedged rewrite (Haiku): same substance + ALL [doc:ID] citations,
           but answering directly, no insufficiency preamble.

Only NORMAL (non-refusal) answers whose text hedges are used. Output conversational
DPO format: {prompt:[sys,user], chosen:[asst], rejected:[asst]} -> train/eval.jsonl.
Resumable. Runs on Brev (Bedrock Haiku 4.5).
"""
import argparse, json, os, re, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3

REWRITE_MODEL = os.environ.get("REWRITE_MODEL", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")
SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих витягів "
    "із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй посиланням [doc:ID]. "
    "Якщо у наданих джерелах немає достатньої підстави — прямо напиши про це. Пиши українською."
)
REWRITE_SYS = (
    "Перепиши юридичну відповідь так, щоб вона відповідала ПРЯМО ПО СУТІ, впевнено, "
    "без вступних фраз про недостатність/відсутність джерел. ЗБЕРЕЖИ всю суть і ВСІ "
    "посилання [doc:ID] без змін. Не додавай нічого нового. Поверни лише переписану відповідь."
)
HEDGE = re.compile(r"недостатньо|відсутн|на жаль|не можу надати|жодне з.*джерел", re.I)

_lock = threading.Lock()
_bd = None
def bd():
    global _bd
    with _lock:
        if _bd is None:
            _bd = boto3.client("bedrock-runtime", region_name="eu-central-1")
        return _bd

def invoke(system, user, max_tokens=1500, retries=6):
    body = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
            "temperature": 0.3, "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}]}
    delay = 2.0
    for a in range(retries):
        try:
            r = bd().invoke_model(modelId=REWRITE_MODEL, body=json.dumps(body))
            return "".join(b.get("text", "") for b in json.loads(r["body"].read())["content"]).strip()
        except Exception as e:
            if a == retries - 1:
                raise
            time.sleep(delay); delay = min(delay * 2, 30)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--teacher", default="/data/sft-distill/run_30k/teacher.jsonl")
    p.add_argument("--out-dir", default="/data/cpt-pipeline/13_dpo_dehedge")
    p.add_argument("--limit", type=int, default=4000)
    p.add_argument("--workers", type=int, default=24)
    p.add_argument("--eval-frac", type=float, default=0.03)
    args = p.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    pairs_path = os.path.join(args.out_dir, "pairs.jsonl")

    done = set()
    if os.path.exists(pairs_path):
        for l in open(pairs_path):
            try: done.add(json.loads(l)["id"])
            except Exception: pass

    rows = []
    for l in open(args.teacher):
        r = json.loads(l)
        if r.get("is_refusal") or r["id"] in done:
            continue
        ans = r.get("answer", "")
        # only hedged normal answers that DO carry citations (so chosen keeps them)
        if HEDGE.search(ans[:300]) and "[doc:" in ans:
            rows.append(r)
        if len(rows) >= args.limit:
            break
    print(f"hedged-with-citation candidates: {len(rows)} (workers={args.workers})", flush=True)

    fh = open(pairs_path, "a")
    wlock = threading.Lock()

    def work(r):
        chosen = invoke(REWRITE_SYS, r["answer"], max_tokens=1600)
        if len(chosen) < 40 or "[doc:" not in chosen:
            return  # rewrite failed to keep citations -> skip
        user = (f"Питання: {r['query']}\n\nДжерела (витяги з рішень ЄДРСР):\n{r['context']}\n\n"
                "Дай обґрунтовану відповідь українською з посиланнями [doc:ID].")
        rec = {"id": r["id"],
               "prompt": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
               "chosen": [{"role": "assistant", "content": chosen}],
               "rejected": [{"role": "assistant", "content": r["answer"]}]}
        with wlock:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n"); fh.flush()

    n = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(work, r) for r in rows]
        for f in as_completed(futs):
            n += 1
            try: f.result()
            except Exception as e:
                if n % 50 == 0: print("err:", str(e)[:80], flush=True)
            if n % 100 == 0:
                print(f"{n}/{len(rows)}", flush=True)
    fh.close()

    # split train/eval
    allp = [json.loads(l) for l in open(pairs_path)]
    import random
    random.Random(42).shuffle(allp)
    ne = max(1, int(len(allp) * args.eval_frac))
    with open(os.path.join(args.out_dir, "eval.jsonl"), "w") as f:
        for r in allp[:ne]: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(os.path.join(args.out_dir, "train.jsonl"), "w") as f:
        for r in allp[ne:]: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"DONE: {len(allp)} pairs -> train {len(allp)-ne}, eval {ne}", flush=True)


if __name__ == "__main__":
    main()
