#!/usr/bin/env python3
"""Print full SFT generations on held-out examples to manually assess citation behavior."""
import json, re, random, sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

B = "/data/cpt-pipeline/09_checkpoints/qwen25-14b/checkpoint-3000/checkpoint-3000/final"
A = "/data/cpt-pipeline/12_sft_output_14b/final"
SYS = ("Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих витягів із "
       "судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй посиланням у форматі [doc:ID], "
       "де ID — це edrsr_doc_id відповідного джерела. Якщо у наданих джерелах немає достатньої "
       "підстави для відповіді — прямо напиши, що наданих джерел недостатньо, і не вигадуй. Пиши українською.")
CITE = re.compile(r"doc:\s*([0-9]+)")
OFFSET = int(sys.argv[1]) if len(sys.argv) > 1 else 100
K = int(sys.argv[2]) if len(sys.argv) > 2 else 10

tok = AutoTokenizer.from_pretrained(B, trust_remote_code=True, extra_special_tokens={})
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
m = AutoModelForCausalLM.from_pretrained(B, torch_dtype=torch.bfloat16, device_map="auto", trust_remote_code=True)
m = PeftModel.from_pretrained(m, A); m.eval()

recs = [json.loads(l) for l in open("/data/sft-distill/run_100k/retrieved.jsonl")][OFFSET:OFFSET + K]
for rec in recs:
    if rec.get("is_refusal"):
        rows = list(rec["distractors"])
    else:
        rows = list(rec["relevant"]) + list(rec["distractors"])
    random.Random(rec["id"]).shuffle(rows)
    ctx = "\n\n".join("[doc:%s] %s" % (r["doc_id"], r["text"][:280]) for r in rows)
    user = ("Питання: %s\n\nДжерела:\n%s\n\nДай обґрунтовану відповідь з посиланнями [doc:ID]." %
            (rec["query"], ctx))
    ids = tok.apply_chat_template([{"role": "system", "content": SYS}, {"role": "user", "content": user}],
                                  add_generation_prompt=True, return_tensors="pt",
                                  truncation=True, max_length=3500).to(m.device)
    out = m.generate(ids, max_new_tokens=512, do_sample=False, pad_token_id=tok.pad_token_id)
    ans = tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)
    rel = {str(d["doc_id"]) for d in rec.get("relevant", [])}
    dis = {str(d["doc_id"]) for d in rec.get("distractors", [])}
    cited = CITE.findall(ans)
    tag = lambda c: "REL" if c in rel else ("DIS" if c in dis else "OOC")
    print("\n" + "=" * 70)
    print("REFUSAL-CASE" if rec.get("is_refusal") else "NORMAL", "| Q:", rec["query"][:110])
    print("cited:", [(c, tag(c)) for c in cited], "| has_cite:", bool(cited))
    print("ANSWER:\n" + ans[:900])
