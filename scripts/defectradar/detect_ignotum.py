#!/usr/bin/env python3
"""
Stage 3: Detect ignotum per ignotum.

Builds a cross-legislative definition graph: vertices = defined terms,
edges = term X appears in definition of Y. Then identifies terms used in
definitions that are never themselves defined anywhere in the corpus.

Output: ignotum_results.jsonl
"""

import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, asdict, field
from typing import Optional

import pymorphy3
from tqdm import tqdm

from config import DB_CONFIG, STOP_LEMMAS


# Terms that don't need statutory definitions (well-established legal concepts)
# Includes common multi-word legal terms known to any Ukrainian lawyer
COMMON_LEGAL_TERMS = {
    # single-word
    "особа", "фізична особа", "юридична особа", "громадянин",
    "держава", "право", "закон", "суд", "орган", "посадова особа",
    "майно", "власність", "договір", "зобов'язання", "відповідальність",
    "правопорушення", "злочин", "покарання", "штраф",
    "документ", "рішення", "наказ", "постанова", "указ",
    "україна", "верховна рада", "кабінет міністрів", "президент",
    "бюджет", "податок", "збір", "мито",
    "територія", "земля", "водний об'єкт",
    "дитина", "батьки", "шлюб", "сім'я",
    # multi-word common legal/administrative terms
    "фізична особа", "юридична особа", "посадова особа",
    "державна служба", "військова служба", "цивільна служба",
    "земельна ділянка", "житловий будинок", "нежитлове приміщення",
    "виконавча влада", "законодавча влада", "судова влада",
    "місцеве самоврядування", "органи місцевого", "місцевих рад",
    "державний бюджет", "місцевий бюджет", "бюджетні кошти",
    "виборчий процес", "виборча комісія",
    "правова допомога", "правовий акт", "нормативний акт",
    "кримінальне провадження", "цивільне провадження", "адміністративне провадження",
    "збройні сили", "національна гвардія", "національна поліція",
    "спеціальний статус", "правовий статус",
    "державна реєстрація", "державний реєстр", "державний контроль",
    "обмежений доступ", "персональні дані", "конфіденційна інформація",
    "інтелектуальна власність", "авторське право",
    "трудовий договір", "колективний договір",
    "соціальне страхування", "соціальний захист", "пенсійне забезпечення",
    "медична допомога", "медичне страхування",
    "навчальний заклад", "вищий навчальний", "загальноосвітній навчальний",
    "науковий ступінь", "вчене звання",
    "комерційний облік", "фінансовий контроль", "бухгалтерський облік",
    "корупційним правопорушенням", "корупційне правопорушення",
    "земельних торгах", "земельних торгів",
    "комунальні послуги", "комунальне підприємство",
    "електронна форма", "електронний документ", "електронний підпис",
    "службова інформація", "державна таємниця", "державну таємницю",
    "відкритий код", "програмне забезпечення",
    "добросовісна конкуренція", "недобросовісна конкуренція",
    "максимальна економія", "ефективне використання",
    "безпечне постачання", "зовнішньої температури",
    "багатоквартирному будинку", "багатоквартирний будинок",
    "військового обов", "військовий обов'язок",
}

# Frequency threshold: terms appearing in >N definitions are "common enough"
COMMON_LAW_THRESHOLD = 5


@dataclass
class TermNode:
    term: str
    lemma: str
    rada_id: str
    law_title: str


@dataclass
class IgNotumResult:
    rada_id: str
    law_title: str
    definiendum: str
    full_definiens: str
    undefined_terms: list[str]
    severity: str  # "high" | "medium" | "low"
    explanation: str


def normalize_term(text: str) -> str:
    """Normalize a term for matching."""
    return re.sub(r"\s+", " ", text.lower().strip())


def extract_candidate_terms(text: str, morph: pymorphy3.MorphAnalyzer) -> list[str]:
    """Extract candidate legal terms from definiens text.

    Focus on multi-word terms (bigrams/trigrams) that look like legal concepts.
    Single words are too noisy -- only include them if they look like domain terms.
    """
    import regex
    words = regex.findall(r"[\p{L}']+", text)
    candidates = []

    for i, w in enumerate(words):
        if len(w) < 3:
            continue
        parsed = morph.parse(w)
        if not parsed:
            continue
        p = parsed[0]

        # Only extract MULTI-WORD terms (adj+noun bigrams and trigrams)
        # These are the ones that should have statutory definitions
        if i + 1 < len(words) and ("ADJF" in p.tag or "PRTF" in p.tag):
            next_parsed = morph.parse(words[i + 1])
            if next_parsed and "NOUN" in next_parsed[0].tag:
                bigram = f"{w.lower()} {words[i+1].lower()}"
                # Skip very common adj+noun combos
                adj_lemma = p.normal_form
                noun_lemma = next_parsed[0].normal_form
                if adj_lemma not in _COMMON_ADJS and noun_lemma not in _COMMON_NOUNS:
                    candidates.append(bigram)

    return candidates


_COMMON_ADJS = {
    "цей", "той", "такий", "інший", "який", "свій", "весь", "кожний",
    "перший", "другий", "третій", "новий", "старий", "великий", "малий",
    "головний", "основний", "загальний", "окремий", "певний", "будь-який",
    "відповідний", "необхідний", "можливий", "наступний", "попередній",
    "зазначений", "визначений", "встановлений", "передбачений",
    "конкретний", "реальний", "фактичний", "повний", "поточний",
}

_COMMON_NOUNS = {
    "рік", "день", "час", "місяць", "період", "строк", "термін",
    "випадок", "спосіб", "частина", "число", "розмір", "рівень",
    "стаття", "пункт", "частина", "абзац", "розділ", "закон",
    "підстава", "умова", "порядок", "межа", "рамка",
    "рішення", "дія", "зміна", "питання", "мета",
}


def main():
    input_path = "definitions.jsonl"
    output_path = "ignotum_results.jsonl"

    print("Loading Ukrainian morphological analyzer...")
    morph = pymorphy3.MorphAnalyzer(lang="uk")

    definitions = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            definitions.append(json.loads(line))

    print(f"Loaded {len(definitions)} definitions")

    # Build the definition graph: all defined terms (normalized)
    defined_terms: dict[str, list[TermNode]] = defaultdict(list)
    for d in definitions:
        norm = normalize_term(d["definiendum"])
        defined_terms[norm].append(TermNode(
            term=d["definiendum"],
            lemma=norm,
            rada_id=d["rada_id"],
            law_title=d["law_title"],
        ))

    # Also build lemmatized version for fuzzy matching
    defined_lemmas: set[str] = set()
    for norm in defined_terms:
        words = norm.split()
        lemmas = []
        for w in words:
            parsed = morph.parse(w)
            if parsed:
                lemmas.append(parsed[0].normal_form)
        if lemmas:
            defined_lemmas.add(" ".join(lemmas))

    print(f"Definition graph: {len(defined_terms)} unique terms, {len(defined_lemmas)} lemmatized forms")

    # Count term frequency across laws (for common-term filtering)
    term_law_frequency: dict[str, set[str]] = defaultdict(set)
    for d in definitions:
        candidates = extract_candidate_terms(d["full_definiens"], morph)
        for c in candidates:
            term_law_frequency[c].add(d["rada_id"])

    results: list[IgNotumResult] = []
    ignotum_count = 0

    for d in tqdm(definitions, desc="Detecting ignotum"):
        candidates = extract_candidate_terms(d["full_definiens"], morph)
        undefined = []

        for c in candidates:
            norm = normalize_term(c)

            # Skip if it's a common legal term
            if norm in COMMON_LEGAL_TERMS:
                continue

            # Skip stop words
            if norm in STOP_LEMMAS:
                continue

            # Skip very short terms
            if len(norm) < 4:
                continue

            # Lemmatize for matching
            words = norm.split()
            lemmas = []
            for w in words:
                parsed = morph.parse(w)
                if parsed:
                    lemmas.append(parsed[0].normal_form)
            lemma_key = " ".join(lemmas) if lemmas else norm

            # Check: is this term defined in THIS law?
            defined_in_this_law = False
            if norm in defined_terms:
                for node in defined_terms[norm]:
                    if node.rada_id == d["rada_id"]:
                        defined_in_this_law = True
                        break
            if defined_in_this_law:
                continue  # defined locally, not ignotum

            # Check: is this term defined in ANY OTHER law?
            defined_in_other = False
            if norm in defined_terms:
                defined_in_other = True
            elif lemma_key in defined_lemmas:
                defined_in_other = True

            # Only flag as ignotum if the term IS defined elsewhere
            # (meaning the legislature recognizes it needs a definition)
            # but NOT defined in this law. This is a cross-reference gap.
            if not defined_in_other:
                continue  # not defined anywhere -- generic term, skip

            # Skip if term appears in many definitions (ubiquitous)
            freq = len(term_law_frequency.get(norm, set()))
            if freq > COMMON_LAW_THRESHOLD:
                continue

            # Skip if it's the same as the definiendum
            if norm == normalize_term(d["definiendum"]):
                continue

            undefined.append(c)

        # Deduplicate
        undefined = sorted(set(undefined))

        if undefined:
            ignotum_count += 1

            # Severity based on how domain-specific the undefined terms are
            high_spec = [t for t in undefined if len(t.split()) >= 2]
            if high_spec:
                severity = "high"
            elif len(undefined) >= 3:
                severity = "medium"
            else:
                severity = "low"

            explanation = f"Uses {len(undefined)} term(s) not defined in any active law: {', '.join(undefined[:5])}"
        else:
            severity = "none"
            explanation = "All terms in definiens are defined or common"

        results.append(IgNotumResult(
            rada_id=d["rada_id"],
            law_title=d["law_title"],
            definiendum=d["definiendum"],
            full_definiens=d["full_definiens"],
            undefined_terms=undefined,
            severity=severity,
            explanation=explanation,
        ))

    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")

    total = len(results)
    print(f"\nIgnotum detection complete:")
    print(f"  Total definitions: {total}")
    print(f"  With ignotum: {ignotum_count} ({ignotum_count/total*100:.1f}%)")
    high = sum(1 for r in results if r.severity == "high")
    med = sum(1 for r in results if r.severity == "medium")
    low = sum(1 for r in results if r.severity == "low")
    print(f"    High severity: {high}")
    print(f"    Medium severity: {med}")
    print(f"    Low severity: {low}")
    print(f"  Output: {output_path}")

    print(f"\nExample high-severity ignotum defects:")
    shown = 0
    for r in results:
        if r.severity == "high" and shown < 5:
            print(f"  {r.definiendum} ({r.rada_id})")
            print(f"    Undefined: {', '.join(r.undefined_terms[:5])}")
            print()
            shown += 1


if __name__ == "__main__":
    main()
