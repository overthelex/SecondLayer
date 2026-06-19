#!/usr/bin/env python3
"""
SFT distillation pipeline for the chat-model training plan (Plane LEXAI-1732, Track A / 14B).

Turns the raw EDRSR retrieval corpus into citation-grounded ChatML SFT examples:

    gen-queries   reverse-QA: court decision -> realistic user question  (Bedrock Haiku)
    retrieve      embed query (BGE-M3) -> top-k chunks from Qdrant edrsr_decisions
                  (+ RAFT distractors, + refusal/negative examples)
    teacher       grounded answer with [doc:ID] citations               (Bedrock Sonnet 4)
    judge         faithfulness filter: programmatic citation check + LLM judge
    build         assemble ChatML JSONL train set

    run-all       gen-queries -> retrieve -> teacher -> judge -> build

Design notes
------------
* Runs ON BREV (where /data corpora + Qdrant + GPU live). No data egress.
* Every stage writes one JSONL keyed by a stable id and is RESUMABLE: re-running
  skips ids already present in the output file.
* Bedrock calls go through a shared client with exponential backoff on throttling,
  bounded concurrency via ThreadPoolExecutor (I/O bound).
* Teacher/judge models are inference profiles (eu. prefix for eu-central-1), per
  the project rule that Claude on Bedrock needs a us./eu./global. profile prefix.

Usage (smoke test, 20 examples):
    HF_HOME=/data/hf_cache python3 distill.py run-all \
        --work /data/sft-distill/run1 --limit 20 --per-jk 20

Full run is driven by --per-jk (queries per justice_kind) -> total SFT target.
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

import requests

try:
    import zstandard as zstd  # for reading *-fulltext-clean/*.jsonl.zst
except Exception:  # pragma: no cover
    zstd = None

log = logging.getLogger("distill")

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

# 6343 = GPU serving copy (answers searches); 6333 = CPU copy (saturated under indexing).
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6343")
COLLECTION = os.environ.get("QDRANT_COLLECTION", "edrsr_decisions")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "eu-central-1")

# Only these are enabled+invokable in this account/region (probed 2026-06-16):
#   Sonnet 4.5 (teacher/judge), Haiku 4.5 (query-gen). Sonnet 4 / 3.x are access-denied.
# Teacher rotates across the eu. AND global. inference profiles: they draw from SEPARATE
# tokens-per-day pools (eu 238M + global 476M), so alternating ~3x the daily headroom
# (the per-day cap is the real bottleneck and is non-adjustable; per-minute quotas are not hit).
TEACHER_MODELS = [m.strip() for m in os.environ.get(
    "TEACHER_MODELS",
    "eu.anthropic.claude-sonnet-4-5-20250929-v1:0,global.anthropic.claude-sonnet-4-5-20250929-v1:0",
).split(",") if m.strip()]
TEACHER_MODEL = os.environ.get("TEACHER_MODEL", TEACHER_MODELS[0])
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "eu.anthropic.claude-sonnet-4-5-20250929-v1:0")
QUERYGEN_MODEL = os.environ.get("QUERYGEN_MODEL", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")

# code on disk (/data/<code>-fulltext-clean) -> justice_kind value in Qdrant payload.
# NOTE: justice_kind is an INTEGER payload index in Qdrant — filter must use int, not str,
# or the index is bypassed and search full-scans 296M points (times out).
CODE_TO_JK = {"tspk": 1, "gpk": 3, "kupap": 5}  # kpk=2 / kas=4 lack fulltext-clean
DATA_ROOT = os.environ.get("DATA_ROOT", "/data")

TOP_K = 6              # relevant chunks per query
N_DISTRACTORS = 4      # RAFT distractor chunks mixed in
SEARCH_WORKERS = 4     # cap concurrent Qdrant searches (serving node is fragile under indexing)
REFUSAL_FRACTION = 0.12  # share of examples built as distractor-only -> expected refusal
MAX_CHUNK_CHARS = 1200   # truncate each chunk shown to the model

SYSTEM_PROMPT = (
    "Ти — український юридичний асистент. Відповідай ВИКЛЮЧНО на основі наданих "
    "витягів із судових рішень ЄДРСР. Кожне фактичне твердження підкріплюй "
    "посиланням у форматі [doc:ID], де ID — це edrsr_doc_id відповідного джерела. "
    "Якщо у наданих джерелах немає достатньої підстави для відповіді — прямо "
    "напиши, що наданих джерел недостатньо, і не вигадуй. Пиши українською."
)

# --------------------------------------------------------------------------- #
# Small utilities
# --------------------------------------------------------------------------- #


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )


def read_jsonl(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def load_done_ids(path: Path, key: str = "id") -> set[str]:
    done: set[str] = set()
    for row in read_jsonl(path):
        if key in row:
            done.add(str(row[key]))
    return done


class JsonlWriter:
    """Append-only, thread-safe JSONL writer for resumable stages."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = path.open("a")
        self._lock = threading.Lock()

    def write(self, row: dict) -> None:
        line = json.dumps(row, ensure_ascii=False)
        with self._lock:
            self._fh.write(line + "\n")
            self._fh.flush()

    def close(self) -> None:
        self._fh.close()


def parallel_map(fn: Callable[[Any], Any], items: list, workers: int, desc: str) -> None:
    """Run fn over items with bounded concurrency; fn is responsible for writing output."""
    done = 0
    total = len(items)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(fn, it) for it in items]
        for fut in as_completed(futs):
            done += 1
            try:
                fut.result()
            except Exception as e:  # keep going; one bad item must not kill the run
                log.warning("%s: item failed: %s", desc, e)
            if done % 25 == 0 or done == total:
                log.info("%s: %d/%d", desc, done, total)


# --------------------------------------------------------------------------- #
# Bedrock client (lazy, retrying)
# --------------------------------------------------------------------------- #


class Bedrock:
    def __init__(self, region: str = BEDROCK_REGION):
        import boto3  # noqa: import here so non-bedrock stages don't need it
        from botocore.config import Config

        # default pool is 10 -> "Connection pool is full" warnings + lost concurrency
        # under 16-32 workers. Size it above the worker count.
        cfg = Config(
            region_name=region,
            max_pool_connections=int(os.environ.get("BEDROCK_POOL", "64")),
            retries={"max_attempts": 2, "mode": "standard"},
        )
        self._client = boto3.client("bedrock-runtime", config=cfg)

    def invoke(
        self,
        model_id: str,
        system: str,
        user: str,
        max_tokens: int = 1500,
        temperature: float = 0.3,
        max_retries: int = 6,
    ) -> str:
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}],
        }
        delay = 2.0
        for attempt in range(max_retries):
            try:
                resp = self._client.invoke_model(
                    modelId=model_id, body=json.dumps(body)
                )
                payload = json.loads(resp["body"].read())
                return "".join(
                    blk.get("text", "") for blk in payload.get("content", [])
                ).strip()
            except Exception as e:  # ThrottlingException / ModelTimeout / transient
                name = type(e).__name__
                if attempt == max_retries - 1:
                    raise
                if "Throttl" in name or "TooManyRequests" in str(e) or "Timeout" in name:
                    time.sleep(delay)
                    delay = min(delay * 2, 45)
                else:
                    time.sleep(min(delay, 8))
                    delay = min(delay * 1.5, 30)
        raise RuntimeError("unreachable")


_bedrock: Bedrock | None = None
_bedrock_lock = threading.Lock()


def bedrock() -> Bedrock:
    global _bedrock
    with _bedrock_lock:
        if _bedrock is None:
            _bedrock = Bedrock()
        return _bedrock


# --------------------------------------------------------------------------- #
# BGE-M3 query embedder (lazy, GPU)
# --------------------------------------------------------------------------- #


class Embedder:
    def __init__(self):
        from FlagEmbedding import BGEM3FlagModel

        self._model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)

    def encode(self, texts: list[str]) -> list[list[float]]:
        out = self._model.encode(texts, batch_size=32, max_length=512)["dense_vecs"]
        return [v.tolist() for v in out]


_embedder: Embedder | None = None


def embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


# --------------------------------------------------------------------------- #
# Qdrant search (REST; auto-detects named vs default vector)
# --------------------------------------------------------------------------- #

_vector_name: str | None | bool = False  # False=unknown, None=default, str=named
_vector_size: int = 1024  # bge-m3 dense
_detect_lock = threading.Lock()


def _qdrant(method: str, path: str, body: dict | None = None,
            timeout: int = 60, attempts: int = 5) -> requests.Response:
    """Qdrant HTTP with retry/backoff — the serving node spikes past timeouts under indexing."""
    delay = 2.0
    last: Exception | None = None
    url = f"{QDRANT_URL}{path}"
    for _ in range(attempts):
        try:
            r = requests.request(method, url, json=body, timeout=timeout)
            if r.status_code == 200:
                return r
            last = RuntimeError(f"qdrant {r.status_code}: {r.text[:120]}")
        except Exception as e:  # ReadTimeout / ConnectionError
            last = e
        time.sleep(delay)
        delay = min(delay * 2, 20)
    raise last if last else RuntimeError("qdrant: unreachable")


def _detect_vector_name() -> str | None:
    global _vector_name, _vector_size
    if _vector_name is not False:
        return _vector_name  # type: ignore
    with _detect_lock:
        if _vector_name is not False:
            return _vector_name  # type: ignore
        r = _qdrant("GET", f"/collections/{COLLECTION}")
        vectors = r.json()["result"]["config"]["params"]["vectors"]
    # named vectors -> dict of name->cfg with "size"; default -> dict with "size"
    if isinstance(vectors, dict) and "size" not in vectors:
        name = next(iter(vectors.keys()))
        _vector_name = name
        _vector_size = int(vectors[name]["size"])
    else:
        _vector_name = None
        _vector_size = int(vectors["size"])
    log.info("qdrant vector: name=%s size=%d", _vector_name or "<default>", _vector_size)
    return _vector_name  # type: ignore


def qdrant_search(vec: list[float], justice_kind: str, limit: int, exclude_doc: str | None = None) -> list[dict]:
    name = _detect_vector_name()
    vector_field: Any = {"name": name, "vector": vec} if name else vec
    flt: dict = {"must": [{"key": "justice_kind", "match": {"value": justice_kind}}]}
    if exclude_doc:
        flt["must_not"] = [{"key": "edrsr_doc_id", "match": {"value": exclude_doc}}]
    body = {
        "vector": vector_field,
        "limit": limit,
        "filter": flt,
        "with_payload": True,
        "with_vector": False,
    }
    r = _qdrant("POST", f"/collections/{COLLECTION}/points/search", body)
    return r.json()["result"]


def qdrant_random(justice_kind_not: str, limit: int) -> list[dict]:
    """Varied RAFT distractors from OTHER justice kinds, via a random-vector search."""
    name = _detect_vector_name()
    vec = [random.gauss(0.0, 1.0) for _ in range(_vector_size)]
    vector_field: Any = {"name": name, "vector": vec} if name else vec
    body = {
        "vector": vector_field,
        "limit": limit,
        "filter": {"must_not": [{"key": "justice_kind", "match": {"value": justice_kind_not}}]},
        "with_payload": True,
        "with_vector": False,
    }
    try:
        r = _qdrant("POST", f"/collections/{COLLECTION}/points/search", body)
        return r.json()["result"]
    except Exception:
        return []  # distractors are best-effort


# --------------------------------------------------------------------------- #
# Stage 1: gen-queries  (reverse-QA)
# --------------------------------------------------------------------------- #

QGEN_SYSTEM = (
    "Ти формулюєш реалістичні юридичні запити українських користувачів. "
    "На основі витягу із судового рішення сформулюй ОДНЕ коротке природне питання "
    "(1-2 речення), яке міг би поставити користувач і на яке це рішення дає відповідь. "
    "Не згадуй номер справи чи суд. Поверни ЛИШЕ текст питання."
)


def iter_decisions(code: str, max_docs: int) -> Iterable[dict]:
    """Stream decisions from /data/<code>-fulltext-clean/*.jsonl.zst (newest years first)."""
    if zstd is None:
        raise RuntimeError("pip install zstandard")
    d = Path(DATA_ROOT) / f"{code}-fulltext-clean"
    files = sorted(d.glob(f"{code}_*.jsonl.zst"), reverse=True)
    dctx = zstd.ZstdDecompressor()
    n = 0
    for f in files:
        with f.open("rb") as fh, dctx.stream_reader(fh) as reader:
            text = io.TextIOWrapper(reader, encoding="utf-8")
            for line in text:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                body = (row.get("text") or "")
                if len(body) < 600:  # skip stubs
                    continue
                yield row
                n += 1
                if n >= max_docs:
                    return


def stage_gen_queries(args) -> Path:
    work = Path(args.work)
    out = work / "queries.jsonl"
    # Idempotent resume: if we already have the target number of queries, do not
    # generate more (otherwise a resume scans deeper and produces a fresh batch).
    target = args.per_jk * len(CODE_TO_JK)
    existing = sum(1 for _ in read_jsonl(out))
    if existing >= target:
        log.info("gen-queries: %d/%d already present -> skip", existing, target)
        return out
    done = load_done_ids(out, key="source_doc_id")
    writer = JsonlWriter(out)
    bd = bedrock()

    # collect candidate decisions per justice_kind
    candidates: list[dict] = []
    for code, jk in CODE_TO_JK.items():
        got = 0
        for row in iter_decisions(code, max_docs=args.per_jk * 4):
            did = str(row.get("doc_id"))
            if did in done:
                continue
            # excerpt: holding tends to live in the back third; take a middle slice
            body = row["text"]
            excerpt = body[len(body) // 3 : len(body) // 3 + 2500]
            candidates.append(
                {"source_doc_id": did, "justice_kind": jk, "code": code,
                 "category_code": row.get("category_code"), "excerpt": excerpt}
            )
            got += 1
            if got >= args.per_jk:
                break
        log.info("gen-queries: %s (jk=%s) -> %d candidates", code, jk, got)

    if args.limit:
        candidates = candidates[: args.limit]

    def work_one(c: dict) -> None:
        q = bd.invoke(QGEN_MODEL_ID, QGEN_SYSTEM, c["excerpt"], max_tokens=120, temperature=0.7)
        q = q.strip().strip('"').split("\n")[0].strip()
        if len(q) < 8:
            return
        writer.write({"id": c["source_doc_id"], "source_doc_id": c["source_doc_id"],
                      "justice_kind": c["justice_kind"], "code": c["code"],
                      "category_code": c["category_code"], "query": q})

    global QGEN_MODEL_ID
    QGEN_MODEL_ID = QUERYGEN_MODEL
    parallel_map(work_one, candidates, args.workers, "gen-queries")
    writer.close()
    log.info("gen-queries done -> %s", out)
    return out


# --------------------------------------------------------------------------- #
# Stage 2: retrieve
# --------------------------------------------------------------------------- #


def _clip(t: str) -> str:
    t = re.sub(r"\s+", " ", t or "").strip()
    return t[:MAX_CHUNK_CHARS]


def stage_retrieve(args) -> Path:
    work = Path(args.work)
    src = work / "queries.jsonl"
    out = work / "retrieved.jsonl"
    done = load_done_ids(out, key="id")
    queries = [q for q in read_jsonl(src) if str(q["id"]) not in done]
    # Queries arrive grouped by justice_kind; shuffle so each batch mixes kinds and the
    # in-batch distractor pool has OTHER-jk chunks (otherwise distractors come out empty).
    random.shuffle(queries)
    if args.limit:
        queries = queries[: args.limit]
    if not queries:
        log.info("retrieve: nothing to do")
        return out
    writer = JsonlWriter(out)
    emb = embedder()
    # Qdrant (serving node, still indexing) can't take many concurrent searches -> cap low.
    search_workers = min(args.workers, SEARCH_WORKERS)

    def search_one(pair):
        q, vec = pair
        try:
            hits = qdrant_search(vec, q["justice_kind"], TOP_K, exclude_doc=None)
        except Exception as e:
            log.warning("retrieve: search failed id=%s (%s) -> retry on resume", q["id"], e)
            return None
        relevant = [
            {"doc_id": h["payload"]["edrsr_doc_id"], "text": _clip(h["payload"]["text"]),
             "score": h.get("score")}
            for h in hits
        ]
        return (q, relevant)

    # embed batch on GPU -> ONE filtered search per query (no expensive random-vector
    # distractor search). RAFT distractors are drawn from the relevant chunks of OTHER
    # justice_kinds in the same batch: free, and realistic hard negatives.
    BATCH = 256
    for i in range(0, len(queries), BATCH):
        chunk = queries[i : i + BATCH]
        vecs = emb.encode([q["query"] for q in chunk])
        found: list[tuple] = []
        with ThreadPoolExecutor(max_workers=search_workers) as ex:
            for f in as_completed([ex.submit(search_one, p) for p in zip(chunk, vecs)]):
                try:
                    r = f.result()
                    if r:
                        found.append(r)
                except Exception as e:
                    log.warning("retrieve: item error: %s", e)
        pool_by_jk: dict[int, list] = {}
        for q, rel in found:
            pool_by_jk.setdefault(q["justice_kind"], []).extend(rel)
        for q, rel in found:
            other = [c for jk, cs in pool_by_jk.items() if jk != q["justice_kind"] for c in cs]
            distractors = random.sample(other, min(N_DISTRACTORS, len(other))) if other else []
            is_refusal = random.random() < REFUSAL_FRACTION
            writer.write({**{k: q[k] for k in ("id", "query", "justice_kind", "code", "source_doc_id")},
                          "relevant": rel, "distractors": distractors, "is_refusal": is_refusal})
        log.info("retrieve: %d/%d", min(i + BATCH, len(queries)), len(queries))

    writer.close()
    log.info("retrieve done -> %s", out)
    return out


# --------------------------------------------------------------------------- #
# Stage 3: teacher
# --------------------------------------------------------------------------- #


def _format_context(rows: list[dict]) -> str:
    blocks = []
    for r in rows:
        blocks.append(f"[doc:{r['doc_id']}] {r['text']}")
    return "\n\n".join(blocks)


def _build_context(row: dict) -> tuple[str, list[str]]:
    """Returns (context_text, valid_doc_ids). Refusal examples get distractors only."""
    if row.get("is_refusal"):
        ctx_rows = list(row["distractors"])
        valid_ids: list[str] = []  # nothing relevant -> answer must refuse
    else:
        ctx_rows = list(row["relevant"]) + list(row["distractors"])
        valid_ids = [r["doc_id"] for r in row["relevant"]]
    random.shuffle(ctx_rows)
    return _format_context(ctx_rows), valid_ids


def stage_teacher(args) -> Path:
    work = Path(args.work)
    src = work / "retrieved.jsonl"
    out = work / "teacher.jsonl"
    done = load_done_ids(out, key="id")
    rows = [r for r in read_jsonl(src) if str(r["id"]) not in done]
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        log.info("teacher: nothing to do")
        return out
    writer = JsonlWriter(out)
    bd = bedrock()

    def work_one(row: dict) -> None:
        ctx, valid_ids = _build_context(row)
        user = (
            f"Питання: {row['query']}\n\n"
            f"Джерела (витяги з рішень ЄДРСР):\n{ctx}\n\n"
            "Дай обґрунтовану відповідь українською з посиланнями [doc:ID] "
            "виключно на наведені джерела. Якщо підстав недостатньо — так і напиши."
        )
        # rotate teacher across inference profiles (separate per-day token pools)
        teacher_model = TEACHER_MODELS[hash(row["id"]) % len(TEACHER_MODELS)]
        answer = bd.invoke(teacher_model, SYSTEM_PROMPT, user,
                           max_tokens=1500, temperature=0.3)
        writer.write({"id": row["id"], "query": row["query"], "justice_kind": row["justice_kind"],
                      "is_refusal": row.get("is_refusal", False),
                      "context": ctx, "valid_doc_ids": valid_ids, "answer": answer})

    parallel_map(work_one, rows, args.workers, "teacher")
    writer.close()
    log.info("teacher done -> %s", out)
    return out


# --------------------------------------------------------------------------- #
# Stage 4: judge
# --------------------------------------------------------------------------- #

CITE_RE = re.compile(r"\[doc:([0-9]+)\]")

JUDGE_SYSTEM = (
    "Ти — суворий рецензент юридичних відповідей. Оціни відповідь СТРОГО за наданими джерелами. "
    "Поверни ЛИШЕ компактний JSON В ОДИН РЯДОК, без markdown і без тексту до/після, "
    "у порядку: "
    '{"verdict": "keep"|"reject", "grounded": true|false, "complete": 0.0-1.0, "reason": "<до 12 слів>"}. '
    "grounded=false якщо є твердження без опори у джерелах або вигадані факти. "
    "Якщо у джерелах не було підстав, правильна відповідь — відмова; тоді відмова = keep. "
    "reason — максимум 12 слів."
)


def parse_judge(raw: str) -> dict:
    """Robust to ```json fences and to truncated JSON (salvage verdict/grounded by regex)."""
    s = raw.strip()
    s = re.sub(r"^```(?:json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    m = re.search(r"\{.*\}", s, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    v = re.search(r'"verdict"\s*:\s*"(keep|reject)"', s)
    if v:
        g = re.search(r'"grounded"\s*:\s*(true|false)', s)
        return {"verdict": v.group(1), "grounded": (g.group(1) == "true") if g else True,
                "reason": "salvaged-truncated"}
    return {"verdict": "reject", "grounded": False, "reason": "no-json"}


def _programmatic_check(row: dict) -> tuple[bool, str]:
    """Citations must reference only doc_ids present in the shown context."""
    cited = set(CITE_RE.findall(row["answer"]))
    ctx_ids = set(CITE_RE.findall(row["context"]))
    hallucinated = cited - ctx_ids
    if hallucinated:
        return False, f"cites doc_ids not in context: {sorted(hallucinated)}"
    if row.get("is_refusal"):
        # refusal example: a good answer cites little/nothing and signals insufficiency
        return True, "refusal-case"
    if not cited:
        return False, "no citations in a grounded answer"
    return True, "ok"


def stage_judge(args) -> Path:
    work = Path(args.work)
    src = work / "teacher.jsonl"
    out = work / "judged.jsonl"
    done = load_done_ids(out, key="id")
    rows = [r for r in read_jsonl(src) if str(r["id"]) not in done]
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        log.info("judge: nothing to do")
        return out
    writer = JsonlWriter(out)
    bd = bedrock()

    def work_one(row: dict) -> None:
        ok, reason = _programmatic_check(row)
        if not ok:
            writer.write({**_keep_fields(row), "keep": False, "stage": "programmatic", "reason": reason})
            return
        user = (
            f"Питання: {row['query']}\n\nДжерела:\n{row['context']}\n\n"
            f"Відповідь:\n{row['answer']}\n\nОціни."
        )
        try:
            raw = bd.invoke(JUDGE_MODEL, JUDGE_SYSTEM, user, max_tokens=400, temperature=0.0)
            verdict = parse_judge(raw)
        except Exception as e:
            verdict = {"verdict": "reject", "reason": f"judge-error: {e}", "grounded": False}
        keep = verdict.get("verdict") == "keep" and verdict.get("grounded", True)
        writer.write({**_keep_fields(row), "keep": keep, "stage": "llm",
                      "complete": verdict.get("complete"), "reason": verdict.get("reason")})

    parallel_map(work_one, rows, args.workers, "judge")
    writer.close()
    kept = sum(1 for r in read_jsonl(out) if r.get("keep"))
    log.info("judge done -> %s  (kept %d / %d)", out, kept, sum(1 for _ in read_jsonl(out)))
    return out


def _keep_fields(row: dict) -> dict:
    return {k: row[k] for k in ("id", "query", "justice_kind", "is_refusal", "context", "answer")}


# --------------------------------------------------------------------------- #
# Stage 5: build ChatML
# --------------------------------------------------------------------------- #


def stage_build(args) -> Path:
    work = Path(args.work)
    judged = work / "judged.jsonl"
    out = work / "sft_chatml.jsonl"
    kept = [r for r in read_jsonl(judged) if r.get("keep")]
    with out.open("w") as fh:
        for r in kept:
            user = (
                f"Питання: {r['query']}\n\n"
                f"Джерела (витяги з рішень ЄДРСР):\n{r['context']}\n\n"
                "Дай обґрунтовану відповідь українською з посиланнями [doc:ID]."
            )
            example = {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user},
                    {"role": "assistant", "content": r["answer"]},
                ],
                "meta": {"justice_kind": r["justice_kind"], "is_refusal": r.get("is_refusal", False)},
            }
            fh.write(json.dumps(example, ensure_ascii=False) + "\n")
    log.info("build done -> %s  (%d examples)", out, len(kept))
    return out


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def main() -> None:
    setup_logging()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("stage", choices=["gen-queries", "retrieve", "teacher", "judge", "build", "run-all"])
    p.add_argument("--work", required=True, help="working dir for this run (holds all stage JSONLs)")
    p.add_argument("--per-jk", type=int, default=100, help="queries per justice_kind (gen-queries)")
    p.add_argument("--limit", type=int, default=0, help="cap items per stage (smoke test)")
    p.add_argument("--workers", type=int, default=8, help="concurrent Bedrock calls")
    args = p.parse_args()
    Path(args.work).mkdir(parents=True, exist_ok=True)

    stages = {
        "gen-queries": stage_gen_queries,
        "retrieve": stage_retrieve,
        "teacher": stage_teacher,
        "judge": stage_judge,
        "build": stage_build,
    }
    if args.stage == "run-all":
        for name in ["gen-queries", "retrieve", "teacher", "judge", "build"]:
            log.info("=== stage: %s ===", name)
            stages[name](args)
    else:
        stages[args.stage](args)


if __name__ == "__main__":
    main()
