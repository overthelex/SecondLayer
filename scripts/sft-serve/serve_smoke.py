#!/usr/bin/env python3
"""End-to-end serving smoke (no FastAPI): load final model, generate on a held-out
example, apply the citation validator, and report what got stripped."""
import json
import os
import sys

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from citation_validator import validate_citations

MODEL_PATH = os.environ.get("MODEL_PATH", "/data/cpt-pipeline/17_final_v2")
SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих "
    "витягів із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй "
    "посиланням у форматі [doc:ID], де ID — це edrsr_doc_id відповідного джерела. Пиши українською."
)

tok = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True, extra_special_tokens={})
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH, torch_dtype=torch.bfloat16, device_map="auto",
    attn_implementation="sdpa", trust_remote_code=True)
model.eval()

# take a couple held-out examples (with ground-truth context ids)
recs = [json.loads(l) for l in open("/data/sft-distill/run_100k/retrieved.jsonl")][50:50 + int(sys.argv[1] if len(sys.argv) > 1 else 2)]
for rec in recs:
    rows = list(rec["relevant"]) + list(rec["distractors"])
    ctx = "\n\n".join("[doc:%s] %s" % (r["doc_id"], r["text"][:280]) for r in rows)
    ctx_ids = {str(r["doc_id"]) for r in rows}
    user = ("Питання: %s\n\nДжерела (витяги з рішень ЄДРСР):\n%s\n\nДай обґрунтовану відповідь з посиланнями [doc:ID]." % (rec["query"], ctx))
    ids = tok.apply_chat_template([{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
                                  add_generation_prompt=True, return_tensors="pt", truncation=True, max_length=3500).to(model.device)
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=400, do_sample=False, pad_token_id=tok.pad_token_id)
    raw = tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)
    v = validate_citations(raw, ctx_ids)
    print("=" * 70)
    print("Q:", rec["query"][:90])
    print("--- RAW (model) ---\n", raw[:500])
    print("--- VALIDATED (served) ---\n", v.answer[:500])
    print("kept=%s stripped(fabricated)=%s fab_rate=%.0f%%" % (v.kept, v.stripped, 100 * v.fabrication_rate))
