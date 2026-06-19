#!/usr/bin/env python3
"""Merge the SFT-v1 LoRA adapter into the CPT base -> a standalone model for DPO/serving."""
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "/data/cpt-pipeline/09_checkpoints/qwen25-14b/checkpoint-3000/checkpoint-3000/final"
ADAPTER = "/data/cpt-pipeline/12_sft_output_14b/final"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/data/cpt-pipeline/12_sft_merged"

tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True, extra_special_tokens={})
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
print("loading base...", flush=True)
m = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16, device_map="cuda:0",
                                         trust_remote_code=True)
print("applying + merging adapter...", flush=True)
m = PeftModel.from_pretrained(m, ADAPTER)
m = m.merge_and_unload()
print("saving merged ->", OUT, flush=True)
m.save_pretrained(OUT, safe_serialization=True)
tok.save_pretrained(OUT)
print("DONE merge ->", OUT, flush=True)
