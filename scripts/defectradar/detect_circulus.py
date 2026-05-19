#!/usr/bin/env python3
"""
Stage 2: Detect circulus in definiendo.

Reads definitions.jsonl and checks each definition for circular references:
  Tier 1 - Morphological overlap: lemma of definiendum appears in differentia specifica
  Tier 2 - Semantic similarity: embedding of definiendum is too similar to differentia

Output: circulus_results.jsonl
"""

import json
import sys
from dataclasses import dataclass, asdict
from typing import Optional

import pymorphy3
from tqdm import tqdm

from config import STOP_LEMMAS, GENUS_GENERIC_LEMMAS, SEMANTIC_THRESHOLD


@dataclass
class CirculusResult:
    rada_id: str
    law_title: str
    definiendum: str
    full_definiens: str
    is_circulus: bool
    tier: Optional[str]  # "morphological" | "semantic" | None
    overlapping_lemmas: list[str]
    semantic_score: Optional[float]
    explanation: str


def get_content_lemmas(text: str, morph: pymorphy3.MorphAnalyzer) -> set[str]:
    """Extract content-word lemmas from Ukrainian text."""
    import regex
    words = regex.findall(r"[\p{L}']+", text.lower())
    lemmas = set()
    for w in words:
        if len(w) < 3:
            continue
        parsed = morph.parse(w)
        if parsed:
            lemma = parsed[0].normal_form
            if lemma not in STOP_LEMMAS and len(lemma) >= 3:
                lemmas.add(lemma)
    return lemmas


def get_discriminating_lemmas(
    definiendum: str, morph: pymorphy3.MorphAnalyzer
) -> set[str]:
    """Extract lemmas that are discriminating (qualifying) in the definiendum.

    For "креативні індустрії", the discriminating word is "креативний" (adjective).
    For "культурна спадщина", it's "культурний".
    For "арбітражний керуючий", it's "арбітражний".

    Strategy: adjectives and participles are almost always discriminating.
    For nouns, only count them if the definiendum has >1 content word
    and the noun is NOT the head (last) noun.
    """
    import regex
    words = regex.findall(r"[\p{L}']+", definiendum)
    discriminating = set()
    all_parses = []

    for w in words:
        if len(w) < 3:
            continue
        parsed = morph.parse(w)
        if parsed:
            all_parses.append((w, parsed[0]))

    content_parses = [
        (w, p) for w, p in all_parses
        if p.normal_form not in STOP_LEMMAS and len(p.normal_form) >= 3
    ]

    for i, (w, p) in enumerate(content_parses):
        lemma = p.normal_form
        # Adjectives / participles are always discriminating
        if any(tag in p.tag for tag in ("ADJF", "PRTF")):
            if lemma not in GENUS_GENERIC_LEMMAS:
                discriminating.add(lemma)
        # Non-head nouns (if multi-word term)
        elif "NOUN" in p.tag and len(content_parses) > 1:
            is_last_noun = all(
                "NOUN" not in cp.tag
                for _, cp in content_parses[i + 1:]
            )
            if not is_last_noun and lemma not in GENUS_GENERIC_LEMMAS:
                discriminating.add(lemma)

    return discriminating


def detect_morphological_circulus(
    definiendum: str,
    differentia: str,
    genus: str,
    full_definiens: str,
    morph: pymorphy3.MorphAnalyzer,
) -> tuple[bool, list[str]]:
    """Tier 1: Check if discriminating lemmas from definiendum appear in differentia.

    Key insight: if definiendum is "креативні індустрії" and definiens starts
    with "види економічної діяльності через креативне вираження", the word
    "креативний" in "креативне вираження" IS circularity.
    But if definiendum is "індивідуальний тепловий пункт" and definiens starts
    with "тепловий пункт для потреб...", then "тепловий" is just the genus
    repeating (the head noun phrase minus the qualifier), NOT circularity.
    """
    dum_disc = get_discriminating_lemmas(definiendum, morph)
    if not dum_disc:
        return False, []

    # Build exclusion set: genus lemmas + generic lemmas + head-noun-phrase lemmas
    genus_lemmas = get_content_lemmas(genus, morph)

    # Also extract lemmas from the first few words of the full definiens
    # (these are the genus/head noun phrase and should be excluded)
    first_words = " ".join(full_definiens.split()[:6])
    head_lemmas = get_content_lemmas(first_words, morph)

    # The definiens itself (excluding head phrase)
    diff_lemmas = get_content_lemmas(differentia, morph)

    # Also exclude all lemmas that appear in the definiendum's head noun phrase
    # (i.e., the non-discriminating part)
    dum_all_lemmas = get_content_lemmas(definiendum, morph)
    dum_head_lemmas = dum_all_lemmas - dum_disc  # head noun lemmas

    exclude = genus_lemmas | GENUS_GENERIC_LEMMAS | head_lemmas | dum_head_lemmas
    diff_filtered = diff_lemmas - exclude

    overlap = dum_disc & diff_filtered
    return bool(overlap), sorted(overlap)


def detect_semantic_circulus(
    definiendum: str,
    genus: str,
    differentia: str,
    model,
) -> float:
    """Tier 2: Check if differentia is semantically too similar to definiendum."""
    query = f"{definiendum} ({genus})" if genus else definiendum
    emb_dum = model.encode(f"query: {query}", normalize_embeddings=True)
    emb_diff = model.encode(f"passage: {differentia[:512]}", normalize_embeddings=True)

    score = float(emb_dum @ emb_diff)
    return score


def main():
    input_path = "definitions.jsonl"
    output_path = "circulus_results.jsonl"
    use_semantic = "--semantic" in sys.argv

    print("Loading Ukrainian morphological analyzer...")
    morph = pymorphy3.MorphAnalyzer(lang="uk")

    model = None
    if use_semantic:
        print("Loading embedding model (this may take a minute)...")
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("intfloat/multilingual-e5-large")
        print("Model loaded.")

    definitions = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            definitions.append(json.loads(line))

    print(f"Loaded {len(definitions)} definitions")

    results: list[CirculusResult] = []
    circulus_count = 0

    for d in tqdm(definitions, desc="Detecting circulus"):
        definiendum = d["definiendum"]
        genus = d["genus_proximum"]
        differentia = d["differentia_specifica"]
        full_definiens = d["full_definiens"]

        # Tier 1: Morphological
        is_morph, overlap = detect_morphological_circulus(
            definiendum, differentia, genus, full_definiens, morph
        )

        # Tier 2: Semantic (only if Tier 1 didn't fire and model is loaded)
        sem_score = None
        is_semantic = False
        if not is_morph and model and differentia:
            sem_score = detect_semantic_circulus(definiendum, genus, differentia, model)
            is_semantic = sem_score > SEMANTIC_THRESHOLD

        is_circulus = is_morph or is_semantic
        if is_circulus:
            circulus_count += 1

        tier = None
        explanation = ""
        if is_morph:
            tier = "morphological"
            explanation = f"Lemma overlap in differentia: {', '.join(overlap)}"
        elif is_semantic:
            tier = "semantic"
            explanation = f"Semantic similarity {sem_score:.3f} > threshold {SEMANTIC_THRESHOLD}"
        else:
            explanation = "No circularity detected"

        results.append(CirculusResult(
            rada_id=d["rada_id"],
            law_title=d["law_title"],
            definiendum=definiendum,
            full_definiens=full_definiens,
            is_circulus=is_circulus,
            tier=tier,
            overlapping_lemmas=overlap,
            semantic_score=sem_score,
            explanation=explanation,
        ))

    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(asdict(r), ensure_ascii=False) + "\n")

    print(f"\nCirculus detection complete:")
    print(f"  Total definitions: {len(results)}")
    print(f"  Circulus detected: {circulus_count} ({circulus_count/len(results)*100:.1f}%)")
    morph_count = sum(1 for r in results if r.tier == "morphological")
    sem_count = sum(1 for r in results if r.tier == "semantic")
    print(f"    Morphological (Tier 1): {morph_count}")
    print(f"    Semantic (Tier 2): {sem_count}")
    print(f"  Output: {output_path}")

    # Show examples
    print(f"\nExample circulus defects:")
    for r in results:
        if r.is_circulus:
            print(f"  [{r.tier}] {r.definiendum}")
            print(f"    => {r.full_definiens[:120]}...")
            print(f"    {r.explanation}")
            print()
            circulus_count -= 1
            if circulus_count <= len(results) - 5:
                break


if __name__ == "__main__":
    main()
