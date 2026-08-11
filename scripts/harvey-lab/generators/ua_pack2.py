#!/usr/bin/env python3
"""Ukrainian LAB pack, v2 rubric generator: cut extraction, keep what discriminates.

v1 measured almost nothing. Sonnet 4.6 scored 94.0% pooled and 55% all-pass, and
59% of criteria instances never failed once. The dead weight was formulaic:
every scenario emitted "Reports the tax debt", "Reports the correct company
code", "Identifies the ultimate beneficial owner", "Reports the registered
address", "Reports the share capital" and so on, which a frontier model reads
straight off the register extract and never misses.

The 18 criteria that did survive as failures were all of two kinds:
  - facts that only exist when two or three documents are read together
  - Ukrainian statutory distinctions that generic civil-law intuition gets wrong

So v2 keeps one cheap sanity criterion for basic accuracy and spends the rest of
the budget on:
  JOIN          a fact assembled from >=2 documents, none of which states it
  CONTRADICTION two documents disagree; the memo must notice and resolve
  ABSENCE       something required is missing; the memo must say what it cannot
                verify rather than assume
  ARITHMETIC    a figure that is only right after specific exclusions
  SEQUENCE      an order-of-events conclusion from dates
  NEGATIVE      a risk that must be ruled OUT with the document that rules it out

Extraction facts stay in the documents; they are simply no longer scored one by
one. A single criterion checks the whole register block, so a memo that garbles
the basics still fails, but a memo that gets them right earns one criterion
rather than seven.
"""

import json
from pathlib import Path

from ua_pack import uah


def basics(s, deliv):
    """One criterion for the whole register block, replacing seven of them."""
    return [(
        "Reports the register basics without error",
        f"PASS if the memo states ALL of the following correctly: ЄДРПОУ code "
        f"{s.target_code}; register status '{s.status}'; registered address "
        f"{s.address}; share capital {uah(s.capital)} UAH; direct shareholder "
        f"{s.parent} at {s.parent_share}%; ultimate beneficial owner {s.ubo}. "
        f"FAIL if any one of them is wrong, or omitted, or contradicted "
        f"elsewhere in the memo.",
        "oracle",
    )]


def join(title, what, source="oracle"):
    return (title,
            f"PASS if the memo states the following, which no single supplied "
            f"document contains and which requires reading at least two of them "
            f"together: {what} FAIL if the memo does not make the connection, or "
            f"states it without the linking fact that establishes it.",
            source)


def contradiction(title, a, b, governs):
    return (title,
            f"PASS if the memo notices that the workspace is internally "
            f"inconsistent on this point ({a} versus {b}), says so explicitly, "
            f"and concludes that {governs} FAIL if the memo silently adopts one "
            f"figure, averages them, or does not mention the discrepancy.",
            "oracle")


def absence(title, missing, consequence):
    return (title,
            f"PASS if the memo states that {missing} is NOT present in the "
            f"supplied materials and that, consequently, {consequence} FAIL if "
            f"the memo asserts the fact anyway, or stays silent about the gap.",
            "expert")


def arithmetic(title, figure, excluding):
    return (title,
            f"PASS if the memo gives the figure as {figure}, which is only "
            f"correct after excluding {excluding} FAIL if it reports any other "
            f"total, or reports the right total without excluding those items.",
            "oracle")


def sequence(title, conclusion):
    return (title,
            f"PASS if the memo draws the following conclusion from the ORDER of "
            f"the dated events, not merely from their existence: {conclusion} "
            f"FAIL if it lists the dates without drawing the conclusion.",
            "expert")


def negative(title, risk, ruled_out_by):
    return (title,
            f"PASS if the memo affirmatively rules OUT {risk}, citing "
            f"{ruled_out_by} as the basis. FAIL if the memo asserts the risk "
            f"exists, or simply omits it: a reader must be able to see that it "
            f"was checked.",
            "expert")


def deliverable_language(deliv):
    return ("Written in Ukrainian throughout, including headings and figures",
            "PASS if the entire deliverable is in Ukrainian. FAIL if any heading, "
            "section title, table caption or standing phrase is in English or "
            "Russian, even where the surrounding text is Ukrainian.",
            "expert")


def assemble(s, deliv, hard):
    """basics + the hard criteria + one language check, numbered."""
    out, n = [], 0
    for title, match, source in basics(s, deliv) + hard + [deliverable_language(deliv)]:
        n += 1
        out.append({
            "id": f"C-{n:03d}", "title": title, "deliverables": [deliv],
            "match_criteria": match, "source": source,
        })
    return out
