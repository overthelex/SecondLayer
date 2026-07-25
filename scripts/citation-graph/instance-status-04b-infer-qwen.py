#!/usr/bin/env python3
"""Phase 4 infer (run as nvidia, GPUs 4-7): Qwen2.5-72B-Instruct classifies 'other' operative parts."""
import argparse, re, json
PROMPT = (
 "Ти класифікуєш резолютивну частину постанови апеляційного або касаційного суду. "
 "Визнач, що суд зробив із рішенням суду нижчої інстанції, яке переглядав:\n"
 "- reversed: скасував (повністю або частково)\n"
 "- modified: змінив\n"
 "- affirmed: залишив без змін / скаргу без задоволення\n"
 "- procedural: суто процесуальне (виправлення описки, повернення/залишення скарги без розгляду, "
 "направлення за підсудністю, закриття провадження, поновлення строку тощо), по суті не переглядав\n"
 "Відповідай РІВНО одним словом англійською: reversed, modified, affirmed або procedural.\n\n"
 "Резолютивна частина:\n\"\"\"\n{oper}\n\"\"\"\n\nВідповідь:")
LABELS={'reversed','modified','affirmed','procedural'}
def parse(o):
    for t in re.findall(r'[a-z]+', o.lower()):
        if t in LABELS: return t
    return 'unknown'
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--inp',required=True); ap.add_argument('--out',required=True)
    ap.add_argument('--tp',type=int,default=8); ap.add_argument('--gpu-mem',type=float,default=0.80)
    a=ap.parse_args()
    rows=[json.loads(l) for l in open(a.inp)]
    print(f"# {len(rows)} docs, tp={a.tp} gpu_mem={a.gpu_mem}", flush=True)
    from vllm import LLM, SamplingParams
    llm=LLM(model="Qwen/Qwen2.5-72B-Instruct", tensor_parallel_size=a.tp,
            gpu_memory_utilization=a.gpu_mem, max_model_len=4096, dtype="bfloat16",
            enforce_eager=True)
    tok=llm.get_tokenizer()
    sp=SamplingParams(temperature=0.0, max_tokens=4)
    prompts=[tok.apply_chat_template([{"role":"user","content":PROMPT.format(oper=r["oper"])}],
             tokenize=False, add_generation_prompt=True) for r in rows]
    outs=llm.generate(prompts, sp)
    dist={};
    with open(a.out,'w') as w:
        for r,o in zip(rows,outs):
            lab=parse(o.outputs[0].text); dist[lab]=dist.get(lab,0)+1
            w.write(json.dumps({"doc_id":r["doc_id"],"disposition":lab})+"\n")
    print("## LLM label distribution:")
    for k in ('reversed','modified','affirmed','procedural','unknown'):
        print(f"  {k:11s} {dist.get(k,0)}")
    shown=0
    for r,o in zip(rows,outs):
        lab=parse(o.outputs[0].text)
        if lab in ('reversed','modified') and shown<6:
            shown+=1; print(f"[{lab}] doc={r['doc_id']}\n    {re.sub(chr(92)+'s+',' ',r['oper'])[:220]}\n")
if __name__=='__main__': main()
