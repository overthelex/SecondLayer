#!/usr/bin/env python3
"""Deterministic citation guardrail for the legal chat generator (LEXAI-1737).

The SFT+DPO model has high citation coverage and low hedge, but still fabricates
~15% out-of-context [doc:ID] citations. Fabrication is dangerous in a legal product
and is best handled NOT by training but post-hoc: every [doc:ID] the model emits is
checked against the doc_ids that were actually in the retrieved context; anything
outside the context is stripped. Citations that survive are guaranteed grounded.

Handles both single `[doc:123]` and grouped `[doc:123, doc:456]` forms; in a group,
only the invalid ids are dropped and valid ones kept.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# one [doc:...] bracket; the inner text may hold several comma-separated ids
_BRACKET = re.compile(r"\[doc:\s*([^\]]+?)\s*\]")
_ID = re.compile(r"\d+")


@dataclass
class ValidationResult:
    answer: str                       # answer with out-of-context citations stripped
    kept: list[str] = field(default_factory=list)        # grounded doc_ids that survived
    stripped: list[str] = field(default_factory=list)     # fabricated/out-of-context, removed
    n_citations: int = 0              # total citations the model emitted

    @property
    def fabrication_rate(self) -> float:
        return len(self.stripped) / self.n_citations if self.n_citations else 0.0


def validate_citations(answer: str, context_doc_ids) -> ValidationResult:
    """Strip every [doc:ID] not present in context_doc_ids. Returns the cleaned answer."""
    valid = {str(x) for x in context_doc_ids}
    res = ValidationResult(answer=answer)

    def repl(m: re.Match) -> str:
        ids = _ID.findall(m.group(1))
        res.n_citations += len(ids)
        kept = []
        for i in ids:
            if i in valid:
                kept.append(i)
                res.kept.append(i)
            else:
                res.stripped.append(i)
        if not kept:
            return ""  # whole citation was fabricated -> drop the bracket
        return "[" + ", ".join("doc:" + i for i in kept) + "]"

    cleaned = _BRACKET.sub(repl, answer)
    # tidy doubled spaces / space-before-punctuation left by removed brackets
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([,.;:)])", r"\1", cleaned)
    res.answer = cleaned.strip()
    return res


if __name__ == "__main__":
    ctx = {"100", "200", "300"}  # doc_ids actually retrieved
    tests = [
        "Суд визнав скаргу неподаною [doc:100], повернув її [doc:999].",
        "Підстави викладені у [doc:100, doc:888, doc:200].",
        "Жодного посилання немає.",
        "Усе вигадано [doc:777] і [doc:888].",
    ]
    for t in tests:
        r = validate_citations(t, ctx)
        print("IN :", t)
        print("OUT:", r.answer)
        print("    kept=%s stripped=%s fab_rate=%.0f%%" % (r.kept, r.stripped, 100 * r.fabrication_rate))
        print("-" * 60)
