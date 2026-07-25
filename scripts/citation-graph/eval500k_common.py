#!/usr/bin/env python3
"""
Shared helpers for the EVAL-500K citation-grounded retrieval benchmark.

Used by:
  12_sample_eval500k.py  - stratified corpus sampling + citation-stripped text export
  13_build_qrels.py      - graded qrels from the citation graph

Citation regexes mirror extract-citations-fast.py (the same patterns that
populated law_court_citations), so stripping removes exactly what the
ground-truth graph was built from.
"""

import os
import re

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_db_password@localhost:5432/secondlayer_local",
)

JUSTICE_KINDS = {1: "civil", 2: "criminal", 3: "commercial", 4: "administrative"}

# Substantive decisions only: Вирок (1), Постанова (2), Рішення (3).
# Судові накази (4) and ухвали (5) are template-dominated; 6/7/10 are marginal.
DEFAULT_JUDGMENT_CODES = (1, 2, 3)

YEAR_MIN, YEAR_MAX = 2010, 2025

# ── Citation patterns (same as extract-citations-fast.py) ───────────────────

STRIP_PATTERNS = [
    re.compile(
        r'(?:(?:ч(?:астин[аи]|\.)\s*\d+\s+)?'
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+))\s+'
        r'(ЦК|КК|ГК|ГПК|КПК|КАС|ЦПК|КЗпП|СК|ЗК|ПК|МК|БК|ВК|ЛК|ЖК|КУпАП|КАСУ)'
        r'(?:\s+України)?',
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)'
        r'\s+(?:Закону\s+України|ЗУ|Закону)\s+'
        r'(?:[«"]([^»"]+)[»"]|(?:від|№)\s*(\d[\d.\-/]+))',
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)\s+'
        r'Конституці[їі]\s+України',
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r'(?:справ[аи]\s*)?№\s*(\d{1,4}/\d+/\d{2,4})', re.IGNORECASE),
    re.compile(
        r'Закон(?:у|ом)?\s+України\s+'
        r'(?:від\s+(\d{2}\.\d{2}\.\d{4})\s+)?'
        r'№\s*([\d\-]+(?:\-[IVX]+)?)',
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r'(?:постанов[аиі]|ухвал[аиі])\s+'
        r'(?:Пленуму\s+)?'
        r'(?:Верховного\s+Суду|ВС|Великої\s+Палати\s+ВС)',
        re.IGNORECASE | re.UNICODE,
    ),
]

_WS = re.compile(r'[ \t]{2,}')


def strip_citations(text: str) -> str:
    """Remove citation strings so dense models cannot match citation tokens.

    Replaces each citation span with a single space (keeps sentence flow),
    then collapses runs of whitespace.
    """
    for pat in STRIP_PATTERNS:
        text = pat.sub(' ', text)
    return _WS.sub(' ', text)


# ── Article tokens for co-citation ──────────────────────────────────────────

ARTICLE_CITATION_TYPES = ('codex_article', 'law_article', 'constitution', 'law_by_number')

_NORM = re.compile(r'\s+')


def article_token(law_number: str, law_article: str) -> str:
    """Canonical token for an (act, article) pair, e.g. 'цивільний кодекс україни::625'."""
    ln = _NORM.sub(' ', (law_number or '').strip().lower())
    la = _NORM.sub(' ', (law_article or '').strip().lower())
    return f"{ln}::{la}"


def norm_cause_num(cause: str) -> str:
    return _NORM.sub('', (cause or '').strip().lower())
