#!/usr/bin/env python3
"""Materialize ua-temporal-drift-kas into the JSONL layout train_temporal.py expects:
  output/{pre_war,hybrid_war,full_scale}/{train,validation,test}.jsonl
with columns {text, label}, remapping KAS labels to the paper's taxonomy so the
KAS numbers are directly comparable to the civil/commercial matrix:
  granted -> approved,  denied -> dismissed,  partial -> partial
Run on the GPU box (pulls the public HF dataset directly)."""
import os, json
from datasets import load_dataset

REPO = "overthelex/ua-temporal-drift-kas"
EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
SPLITS = {"train": "train", "validation": "validation", "test": "test"}
REMAP = {"granted": "approved", "denied": "dismissed", "partial": "partial"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

def main():
    for ep in EPOCHS:
        ds = load_dataset(REPO, ep)
        for split, hf_split in SPLITS.items():
            d = os.path.join(OUT, ep)
            os.makedirs(d, exist_ok=True)
            n = 0
            with open(os.path.join(d, f"{split}.jsonl"), "w", encoding="utf-8") as f:
                for r in ds[hf_split]:
                    f.write(json.dumps({"text": r["text"], "label": REMAP[r["label"]]},
                                       ensure_ascii=False) + "\n")
                    n += 1
            print(f"{ep}/{split}: {n}")
    print("done ->", OUT)

if __name__ == "__main__":
    main()
