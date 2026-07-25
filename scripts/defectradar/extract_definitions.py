#!/usr/bin/env python3
"""
Stage 1: Extract legal definitions from Ukrainian legislation.

Reads legislation_articles from PostgreSQL, identifies articles containing
definitions (Article 1 or "визначення термінів" sections), and parses
individual definitions into (definiendum, genus, differentia) triples.

Output: definitions.jsonl
"""

import json
import re
import sys
from dataclasses import dataclass, asdict
from typing import Optional

import psycopg2
from tqdm import tqdm

from config import DB_CONFIG


@dataclass
class Definition:
    rada_id: str
    law_title: str
    article_number: str
    definiendum: str
    genus_proximum: str
    differentia_specifica: str
    full_definiens: str
    raw_text: str
    extraction_method: str


DEFINITION_ARTICLE_PATTERNS = [
    re.compile(r"визначення\s+термін", re.IGNORECASE),
    re.compile(r"терміни\s+та\s+їх\s+визначення", re.IGNORECASE),
    re.compile(r"основні\s+терміни", re.IGNORECASE),
    re.compile(r"терміни\s+вживаються\s+в\s+такому\s+значенні", re.IGNORECASE),
    re.compile(r"у\s+цьому\s+(Законі|Кодексі|Кодекс)\s+.{0,50}терміни", re.IGNORECASE),
    re.compile(r"для\s+цілей\s+цього", re.IGNORECASE),
]

# Pattern: "term - definition;" or "term - definition."
# Ukrainian laws use hyphen-minus (-), en-dash (–), or em-dash (—) as copula
DEFINITION_COPULA = re.compile(
    r"^(?P<definiendum>[^—–\-]{2,80})\s*[—–\-]\s*(?P<definiens>.{10,}?)$",
    re.MULTILINE,
)

# Semicolon-delimited definitions within a definition block
SEMICOLON_SPLIT = re.compile(r";\s*(?=[А-ЯІЇЄҐA-Z])")

# Genus pattern: first noun phrase after copula
GENUS_PATTERN = re.compile(
    r"^(?:це\s+)?(?P<genus>(?:[а-яіїєґ']+\s+){0,3}[а-яіїєґ']+)"
    r"(?:\s*,\s*|\s+(?:який|яка|яке|які|що|де|метою|для|з)\s+)"
)


def is_definition_article(article_number: str, full_text: str) -> bool:
    """Check if an article likely contains legal definitions."""
    if article_number in ("1", "2"):
        for pat in DEFINITION_ARTICLE_PATTERNS:
            if pat.search(full_text[:500]):
                return True
    for pat in DEFINITION_ARTICLE_PATTERNS:
        if pat.search(full_text[:300]):
            return True
    return False


def split_definition_block(text: str) -> list[str]:
    """Split a definition block into individual definitions.

    Ukrainian law definitions are typically separated by semicolons,
    with the last one ending with a period.
    """
    # Remove leading header text (e.g., "У цьому Законі терміни вживаються...")
    header_end = 0
    for pat in DEFINITION_ARTICLE_PATTERNS:
        m = pat.search(text[:500])
        if m:
            # Find the colon or end of the header sentence
            colon_pos = text.find(":", m.end())
            if colon_pos != -1 and colon_pos < m.end() + 200:
                header_end = colon_pos + 1
            break

    body = text[header_end:].strip()

    # Try semicolon split first
    parts = SEMICOLON_SPLIT.split(body)
    if len(parts) > 1:
        return [p.strip() for p in parts if len(p.strip()) > 10]

    # Fallback: split by newlines that start with a term-like pattern
    lines = body.split("\n")
    definitions = []
    current = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Check if this line starts a new definition (starts with a term + dash)
        if re.match(r"^[А-ЯІЇЄҐа-яіїєґ']{2,}", stripped) and re.search(r"\s[—–\-]\s", stripped[:100]):
            if current:
                definitions.append(" ".join(current))
            current = [stripped]
        else:
            current.append(stripped)
    if current:
        definitions.append(" ".join(current))

    return [d for d in definitions if len(d) > 10]


def parse_definition(raw: str, rada_id: str, law_title: str, article_number: str) -> Optional[Definition]:
    """Parse a raw definition string into structured components."""
    raw = raw.strip().rstrip(";").rstrip(".")

    # Find the copula (dash)
    m = re.match(
        r"^(?P<definiendum>[^—–\-]{2,80}?)\s*[—–\-]\s*(?P<definiens>.+)",
        raw,
        re.DOTALL,
    )
    if not m:
        return None

    definiendum = m.group("definiendum").strip()
    full_definiens = m.group("definiens").strip()

    # Skip if definiendum looks like a sentence, not a term
    if len(definiendum.split()) > 8:
        return None
    # Skip if definiendum contains verbs/sentences indicators
    if any(w in definiendum.lower() for w in ("є", "має", "може", "повинен", "здійснює")):
        return None

    # Extract genus proximum
    genus = ""
    differentia = full_definiens
    gm = GENUS_PATTERN.match(full_definiens)
    if gm:
        genus = gm.group("genus").strip()
        differentia = full_definiens[gm.end():].strip().lstrip(",").strip()
    else:
        # Simple fallback: first 1-3 words
        words = full_definiens.split()
        if words:
            # Skip "це" at start
            start = 1 if words[0].lower() == "це" else 0
            genus = " ".join(words[start:start + 3])
            differentia = " ".join(words[start + 3:])

    return Definition(
        rada_id=rada_id,
        law_title=law_title,
        article_number=article_number,
        definiendum=definiendum,
        genus_proximum=genus,
        differentia_specifica=differentia,
        full_definiens=full_definiens,
        raw_text=raw,
        extraction_method="article1_parser",
    )


def extract_inline_definitions(text: str, rada_id: str, law_title: str, article_number: str) -> list[Definition]:
    """Extract definitions from inline patterns like 'під X розуміється Y'."""
    results = []
    patterns = [
        re.compile(r"під\s+(?P<term>[а-яіїєґА-ЯІЇЄҐ'\s]{3,40}?)\s+розуміється\s+(?P<def>.{10,200}?)(?:[;.])", re.IGNORECASE),
        re.compile(r"(?P<term>[А-ЯІЇЄҐ][а-яіїєґ'\s]{2,40}?)\s*\(далі\s*[—–\-]\s*(?P<def>[^)]{3,60})\)", re.IGNORECASE),
    ]
    for pat in patterns:
        for m in pat.finditer(text):
            term = m.group("term").strip()
            defn = m.group("def").strip()
            if len(term.split()) <= 6:
                results.append(Definition(
                    rada_id=rada_id,
                    law_title=law_title,
                    article_number=article_number,
                    definiendum=term,
                    genus_proximum="",
                    differentia_specifica=defn,
                    full_definiens=defn,
                    raw_text=m.group(0),
                    extraction_method="inline",
                ))
    return results


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Get all articles that might contain definitions
    cur.execute("""
        SELECT l.rada_id, COALESCE(l.title, ''), la.article_number, la.full_text
        FROM legislation_articles la
        JOIN legislation l ON la.legislation_id = l.id
        WHERE la.is_current = true
        ORDER BY l.rada_id, la.article_number
    """)

    rows = cur.fetchall()
    print(f"Loaded {len(rows)} articles from {cur.rowcount} rows")

    all_definitions: list[Definition] = []
    definition_articles = 0

    for rada_id, law_title, article_number, full_text in tqdm(rows, desc="Extracting definitions"):
        if not full_text:
            continue

        if is_definition_article(article_number, full_text):
            definition_articles += 1
            raw_defs = split_definition_block(full_text)
            for raw in raw_defs:
                d = parse_definition(raw, rada_id, law_title, article_number)
                if d:
                    all_definitions.append(d)

        # Also check for inline definitions in all articles
        inline = extract_inline_definitions(full_text, rada_id, law_title, article_number)
        all_definitions.extend(inline)

    cur.close()
    conn.close()

    # Deduplicate by (rada_id, definiendum)
    seen = set()
    unique = []
    for d in all_definitions:
        key = (d.rada_id, d.definiendum.lower())
        if key not in seen:
            seen.add(key)
            unique.append(d)

    output_path = "definitions.jsonl"
    with open(output_path, "w", encoding="utf-8") as f:
        for d in unique:
            f.write(json.dumps(asdict(d), ensure_ascii=False) + "\n")

    print(f"\nExtraction complete:")
    print(f"  Articles scanned: {len(rows)}")
    print(f"  Definition articles found: {definition_articles}")
    print(f"  Raw definitions extracted: {len(all_definitions)}")
    print(f"  Unique definitions: {len(unique)}")
    print(f"  Output: {output_path}")

    # Summary by law
    by_law = {}
    for d in unique:
        by_law.setdefault(d.rada_id, []).append(d)
    print(f"\n  Laws with definitions: {len(by_law)}")
    print(f"  Top 10 laws by definition count:")
    for rid, defs in sorted(by_law.items(), key=lambda x: -len(x[1]))[:10]:
        title = defs[0].law_title or rid
        print(f"    {rid}: {len(defs)} defs - {title[:60]}")


if __name__ == "__main__":
    main()
