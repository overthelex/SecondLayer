#!/usr/bin/env python3
"""Serving endpoint for the citation-grounded legal generator (LEXAI-1737).

Loads the final model (SFT-v2 + DPO de-hedge + cg-DPO, merged) and wraps generation
with the deterministic citation validator: every [doc:ID] the model emits that is NOT
in the retrieved context is stripped before returning. Grounded citations only.

POST /generate {query, context: [{doc_id, text}], max_new_tokens?}
  -> {answer, kept_citations, stripped_citations, fabrication_rate}

Production note: swap HF generate for vLLM (OpenAI-compatible server) for throughput;
the prompt format and the validator are unchanged. Run: uvicorn serve:app --port 8088
"""
import os

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

from citation_validator import validate_citations

MODEL_PATH = os.environ.get("MODEL_PATH", "/data/cpt-pipeline/17_final_v2")
SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих "
    "витягів із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй "
    "посиланням у форматі [doc:ID], де ID — це edrsr_doc_id відповідного джерела. "
    "Пиши українською."
)

app = FastAPI(title="lex-generator")
_tok = None
_model = None


class Source(BaseModel):
    doc_id: str
    text: str


class GenRequest(BaseModel):
    query: str
    context: list[Source]
    max_new_tokens: int = 512


def _load():
    global _tok, _model
    if _model is not None:
        return
    _tok = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True, extra_special_tokens={})
    if _tok.pad_token is None:
        _tok.pad_token = _tok.eos_token
    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, device_map="auto",
        attn_implementation="sdpa", trust_remote_code=True,
    )
    _model.eval()


def _build_user(req: GenRequest) -> str:
    ctx = "\n\n".join(f"[doc:{s.doc_id}] {s.text}" for s in req.context)
    return (f"Питання: {req.query}\n\nДжерела (витяги з рішень ЄДРСР):\n{ctx}\n\n"
            "Дай обґрунтовану відповідь українською з посиланнями [doc:ID].")


@app.on_event("startup")
def _startup():
    _load()


@app.get("/health")
def health():
    return {"ok": _model is not None, "model": MODEL_PATH}


@app.post("/generate")
def generate(req: GenRequest):
    _load()
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": _build_user(req)}]
    ids = _tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt",
                                   truncation=True, max_length=3500).to(_model.device)
    with torch.no_grad():
        out = _model.generate(ids, max_new_tokens=req.max_new_tokens, do_sample=False,
                              pad_token_id=_tok.pad_token_id)
    raw = _tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)
    # GUARDRAIL: keep only citations that are in the retrieved context
    v = validate_citations(raw, {s.doc_id for s in req.context})
    return {
        "answer": v.answer,
        "kept_citations": v.kept,
        "stripped_citations": v.stripped,    # fabricated/out-of-context, removed
        "fabrication_rate": round(v.fabrication_rate, 3),
    }
