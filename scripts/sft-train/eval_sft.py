#!/usr/bin/env python3
"""Citation-faithfulness eval for SFT-v1 (LEXAI-1736).

Generates answers with the model (base, or base+LoRA) on held-out (query, context)
examples and measures whether it cites the RELEVANT sources and ignores the RAFT
distractors. Run twice (base vs SFT) on the same eval set to measure the SFT lift.

Eval data = a slice of scripts/sft-distill `retrieved.jsonl` (has ground-truth
relevant/distractor doc_ids per example). Use a run NOT in SFT training (e.g. run_100k)
for an honest held-out measure.

Usage:
  python3 eval_sft.py --base-model <ckpt> --eval-data <retrieved.jsonl> --n 200 \
      [--adapter <lora_dir>] --label base   --output base.json
"""
import argparse
import json
import random
import re

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих "
    "витягів із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй "
    "посиланням у форматі [doc:ID], де ID — це edrsr_doc_id відповідного джерела. "
    "Якщо у наданих джерелах немає достатньої підстави для відповіді — прямо "
    "напиши, що наданих джерел недостатньо, і не вигадуй. Пиши українською."
)
# Softer prompt: drop the hedging instruction, push to answer with citations.
SOFT_SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай по суті на основі наданих "
    "витягів із судових рішень ЄДРСР, активно використовуючи релевантні джерела. "
    "Кожне твердження підкріплюй посиланням [doc:ID] на відповідне джерело. "
    "Пиши українською."
)
# match doc IDs incl. comma-grouped form [doc:A, doc:B, doc:C] that SFT models emit
CITE = re.compile(r"doc:\s*([0-9]+)")
REFUSAL_HINT = re.compile(r"недостатньо|відсутн|не можу надати|немає підстав", re.I)
HEDGE_HINT = re.compile(r"недостатньо|на жаль|відсутн|не можу надати", re.I)


def build_prompt(rec):
    """Same context layout as the distillation teacher saw."""
    if rec.get("is_refusal"):
        ctx_rows = list(rec["distractors"])
    else:
        ctx_rows = list(rec["relevant"]) + list(rec["distractors"])
    random.Random(rec["id"]).shuffle(ctx_rows)
    ctx = "\n\n".join(f"[doc:{r['doc_id']}] {r['text']}" for r in ctx_rows)
    user = (
        f"Питання: {rec['query']}\n\n"
        f"Джерела (витяги з рішень ЄДРСР):\n{ctx}\n\n"
        "Дай обґрунтовану відповідь українською з посиланнями [doc:ID]."
    )
    return user


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", required=True)
    ap.add_argument("--adapter", default=None)
    ap.add_argument("--eval-data", required=True)
    ap.add_argument("--n", type=int, default=200, help="TOTAL examples (sharded across processes)")
    ap.add_argument("--max-new-tokens", type=int, default=512)
    ap.add_argument("--label", default="model")
    ap.add_argument("--shard-idx", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    ap.add_argument("--soft-prompt", action="store_true", help="use the softer (less hedging) system prompt")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    sys_prompt = SOFT_SYSTEM_PROMPT if args.soft_prompt else SYSTEM_PROMPT

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True,
                                              extra_special_tokens={})
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"[{args.label}] loading base {args.base_model}")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model, torch_dtype=torch.bfloat16, device_map="auto",
        attn_implementation="sdpa", trust_remote_code=True,
    )
    if args.adapter:
        print(f"[{args.label}] loading adapter {args.adapter}")
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    recs = []
    with open(args.eval_data) as f:
        for line in f:
            line = line.strip()
            if line:
                recs.append(json.loads(line))
            if len(recs) >= args.n:
                break
    # data-parallel: this process handles every shard_count-th example
    recs = recs[args.shard_idx::args.shard_count]
    print(f"[{args.label} shard {args.shard_idx}/{args.shard_count}] {len(recs)} examples", flush=True)

    tot_cit = rel_cit = dis_cit = oth_cit = 0
    answered = with_cite = 0
    ref_total = ref_correct = 0
    norm_total = 0
    norm_hedge = 0  # normal answers that open with a 'sources insufficient' hedge

    for i, rec in enumerate(recs):
        user = build_prompt(rec)
        msgs = [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user}]
        inputs = tokenizer.apply_chat_template(
            msgs, add_generation_prompt=True, return_tensors="pt", truncation=True, max_length=3500,
        ).to(model.device)
        with torch.no_grad():
            out = model.generate(inputs, max_new_tokens=args.max_new_tokens, do_sample=False,
                                 pad_token_id=tokenizer.pad_token_id)
        ans = tokenizer.decode(out[0, inputs.shape[1]:], skip_special_tokens=True)

        rel = {str(d["doc_id"]) for d in rec.get("relevant", [])}
        dis = {str(d["doc_id"]) for d in rec.get("distractors", [])}
        cites = set(CITE.findall(ans))

        if rec.get("is_refusal"):
            ref_total += 1
            # correct refusal: signals insufficiency AND doesn't fabricate relevant cites
            if REFUSAL_HINT.search(ans) and not cites:
                ref_correct += 1
        else:
            norm_total += 1
            answered += 1
            if HEDGE_HINT.search(ans[:200]):
                norm_hedge += 1
            if cites:
                with_cite += 1
            for c in cites:
                tot_cit += 1
                if c in rel:
                    rel_cit += 1
                elif c in dis:
                    dis_cit += 1
                else:
                    oth_cit += 1
        if (i + 1) % 25 == 0:
            print(f"[{args.label}] {i+1}/{len(recs)}")

    # raw counts (mergeable across shards); percentages are convenience for single-shard
    res = {
        "label": args.label, "adapter": args.adapter,
        "shard": [args.shard_idx, args.shard_count], "n": len(recs),
        "counts": {
            "tot_cit": tot_cit, "rel_cit": rel_cit, "dis_cit": dis_cit, "oth_cit": oth_cit,
            "norm_total": norm_total, "with_cite": with_cite, "norm_hedge": norm_hedge,
            "ref_total": ref_total, "ref_correct": ref_correct,
        },
        "pct_relevant": round(100 * rel_cit / tot_cit, 2) if tot_cit else None,
        "pct_distractor": round(100 * dis_cit / tot_cit, 2) if tot_cit else None,
        "pct_out_of_context": round(100 * oth_cit / tot_cit, 2) if tot_cit else None,
    }
    with open(args.output, "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
