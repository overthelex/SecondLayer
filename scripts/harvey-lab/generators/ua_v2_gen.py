#!/usr/bin/env python3
"""v2 generator for the Ukrainian register-screening family.

What the v1 measurement forced:

  * 59% of v1 criteria never failed. They were extraction: code, status,
    address, capital, shareholder, UBO, tax debt. Collapsed here into ONE
    criterion covering the whole register block, so garbling the basics still
    fails but reciting them correctly earns one point rather than seven.

  * The single class that reliably discriminated in the probe was
    CONTRADICTION: two registers stating different values for the same fact.
    The probe memo printed both figures in separate sections and never noticed.
    So contradictions are the backbone here, three per matter, injected into the
    documents rather than asserted in the rubric.

  * Two probe criteria failed for the wrong reason: they demanded a particular
    phrasing ("and stop there", "the four-day gap") while the memo was right on
    substance. Criteria here test what must be concluded, never how it is said.

Density: v2 first landed at 14, against an upstream median of 53 for a
single-deliverable task. That gap was defended as "our tasks are smaller", and
the defence does not survive measurement: upstream density does not scale with
task size at all, running 56 criteria at 1-3 documents, 55 at 4-6 and 57 at 7-9.

Reading an upstream task of our size showed the gap is one of CONVENTION, not
content. Upstream groups criteria per issue and writes one criterion per finding
-- each gap in a paragraph, each proposed remedy, each supporting fact -- where
we bundled six register facts into a single "reports the basics" criterion and
three analytical moves into a single "resolves contradiction" criterion.

That reasoning was followed to 48 criteria per task, and a three-task smoke run
then killed most of it. Measured, per group:

    ENFORCEMENT, one per proceeding   21/21   100%
    SANCTIONS, one per screened entity 15/15  100%
    POLICY, "states the condition"      9/9   100%
    DOCKET, one per case                6/6   100%
    REGISTER, one per fact             23/24   96%
    ISSUE_*, the contradictions              50-75%

Pooled went 68% -> 87% purely by adding points the model cannot lose. That is v1's
death exactly, committed a second time with a better excuse. Upstream's density is
not built this way: their 56 criteria on a five-document task are 56 distinct
FINDINGS about a contested instrument, not one fact split six ways. Our matters
have fewer genuine findings, and no amount of splitting creates them -- the gap to
upstream is a content gap and is reported as one.

So the extraction fan-out is reverted here and only the decomposition that measured
as informative is kept: the contradictions, split into seeing each value, naming
the conflict and resolving it. That split earns its place -- reporting the values
passes while naming and resolving the conflict fail, which is precisely the
resolution the single bundled criterion could not give.

Usage:
    uv run --with python-docx --with openpyxl python ua_v2_gen.py <tasks_root>
"""

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from ua_pack import doc, sheet, synth, uah


@dataclass
class Contradiction:
    """One fact stated two ways across two documents.

    `inject` materialises the conflicting statement in a document when it is not
    already implied by the structured data. A contradiction that exists only in
    the rubric is an unpassable criterion, so the generator refuses to emit one
    without either natural support or an injection.
    """
    label: str          # what the fact is
    doc_a: str          # where the first value appears
    val_a: str
    doc_b: str
    val_b: str
    resolution: str     # what a correct memo must conclude
    inject: tuple | None = None   # (extra paragraph for the ЄДР/notes doc)


@dataclass
class V2:
    slug: str
    title: str
    deal: str
    policy: str
    policy_second: str          # the condition the ABSENT document would answer
    absent_doc: str
    target: str
    target_code: str
    status: str
    address: str
    capital: int
    parent: str
    parent_code: str
    ubo: str
    related: str                # commonly-owned counterparty used for the join
    related_code: str
    proceedings: list           # (number, creditor, amount, date, state)
    cases: list                 # (number, role, creditor, amount, date)
    contradictions: list
    open_total: int
    join_text: str
    sequence_text: str
    deliverable: str = "memorandum-perevirky-kontragenta.docx"
    extra: list = field(default_factory=list)


def build_docs(s: V2, d: Path) -> None:
    doc(d / "zapyt-kliyenta.docx", "ЗАПИТ КЛІЄНТА", [
        ("p", f"Плануємо {s.deal} з контрагентом {s.target}."),
        ("b", f"Політика: {s.policy}"),
        ("b", f"Політика: {s.policy_second}"),
        ("p", "Просимо перевірити контрагента та дати чітку відповідь, "
              "чи можлива угода на запропонованих умовах."),
    ])

    doc(d / "vytyag-EDR.docx", "ВИТЯГ З ЄДР", [
        ("p", f"Найменування: {s.target}"),
        ("p", f"Код ЄДРПОУ: {s.target_code}"),
        ("b", f"Стан: {s.status}"),
        ("p", f"Розмір статутного капіталу: {uah(s.capital)},00 грн"),
        ("p", f"Місцезнаходження: {s.address}"),
        ("h", "Засновники (учасники)"),
        ("p", f"{s.parent}, код ЄДРПОУ {s.parent_code}; розмір частки - 100%"),
        ("h", "Кінцевий бенефіціарний власник"),
        ("p", f"{s.ubo}; тип впливу - вирішальний вплив; відсоток частки - 100"),
        ("h", "Керівник"),
        ("p", s.ubo),
    ])

    doc(d / "vytyag-EDR-zasnovnyk.docx", "ВИТЯГ З ЄДР (засновник)", [
        ("p", f"Найменування: {s.parent}"),
        ("p", f"Код ЄДРПОУ: {s.parent_code}"),
        ("p", "Стан: зареєстровано"),
        ("h", "Кінцевий бенефіціарний власник"),
        ("p", f"{s.ubo}; відсоток частки - 100"),
        ("h", "Інші юридичні особи цього власника"),
        ("p", f"{s.related}, код ЄДРПОУ {s.related_code}; відсоток частки - 100"),
    ])

    sheet(d / "vykonavchi-provadzhennya.xlsx", "Виконавчі провадження",
          ["Номер ВП", "Боржник", "Код ЄДРПОУ", "Стягувач", "Сума, грн",
           "Дата відкриття", "Стан"],
          [[n, s.target, s.target_code, c, a, dt, st]
           for n, c, a, dt, st in s.proceedings])

    sheet(d / "sudovi-spravy.xlsx", "Судові справи",
          ["Номер справи", "Суд", "Роль контрагента", "Друга сторона",
           "Присуджена сума, грн", "Дата рішення"],
          [[n, "Господарський суд", role, other, a, dt]
           for n, role, other, a, dt in s.cases])

    injected = [c.inject for c in s.contradictions if c.inject]
    if injected:
        doc(d / "reyestrovi-prymitky.docx", "РЕЄСТРОВІ ПРИМІТКИ ТА ВІДМІТКИ", [
            ("p", "Службові відмітки, отримані разом з витягами."),
            *[("b", txt) for txt in injected],
        ])

    doc(d / "sankciyni-perevirky.docx", "ПЕРЕВІРКА ЗА САНКЦІЙНИМИ ПЕРЕЛІКАМИ", [
        ("p", f"{s.target}, код ЄДРПОУ {s.target_code}: у переліках не виявлено."),
        ("p", f"{s.parent}, код ЄДРПОУ {s.parent_code}: у переліках не виявлено."),
        ("p", f"{s.related}, код ЄДРПОУ {s.related_code}: у переліках не виявлено."),
        ("p", f"{s.ubo}: як фізична особа у переліках не виявлений."),
        ("b", "Перевірку проведено станом на 01.06.2025."),
    ])


def build_criteria(s: V2) -> list:
    out, n = [], 0

    def add(title, match, source="oracle"):
        nonlocal n
        n += 1
        out.append({"id": f"C-{n:03d}", "title": title,
                    "deliverables": [s.deliverable],
                    "match_criteria": match, "source": source})

    # REGISTER: kept as ONE all-of-six criterion. Splitting it into six was tried
    # and measured: the six passed 23/24, so five of them were free points that
    # moved the pooled rate without carrying information. The bundled form still
    # fails when the basics are garbled, which is all it is for.
    add("Reports the register basics without error",
        f"PASS if the memo states ALL of these correctly: ЄДРПОУ {s.target_code}; "
        f"status '{s.status}'; address {s.address}; share capital "
        f"{uah(s.capital)} UAH; shareholder {s.parent} at 100%; ultimate "
        f"beneficial owner {s.ubo}. FAIL if any one is wrong or missing.")
    add("Notes the UBO is also the director",
        f"PASS if the memo notes that {s.ubo} is recorded as the counterparty's "
        f"director as well as its beneficial owner. FAIL if the memo does not "
        f"connect the two roles.", "expert")

    # CONTRADICTIONS: the class that discriminates. Split into seeing each side,
    # naming the conflict and resolving it, so a memo that prints both values
    # without noticing loses three units rather than one.
    for i, c in enumerate(s.contradictions, 1):
        add(f"ISSUE_{i:03d} ({c.label}): reports the value given by {c.doc_a}",
            f"PASS if the memo reports that {c.doc_a} gives {c.val_a}. FAIL if "
            f"that value is absent or misstated.")
        add(f"ISSUE_{i:03d} ({c.label}): reports the value given by {c.doc_b}",
            f"PASS if the memo reports that {c.doc_b} gives {c.val_b}. FAIL if "
            f"that value is absent or misstated.")
        add(f"ISSUE_{i:03d} ({c.label}): states that the sources disagree",
            f"PASS if the memo says explicitly that the workspace states this "
            f"fact two different ways and that the sources conflict. FAIL if it "
            f"reports only one value, presents the two as separate items, "
            f"averages them, or reproduces both in different sections without "
            f"saying they conflict.", "expert")
        add(f"ISSUE_{i:03d} ({c.label}): resolves the conflict correctly",
            f"PASS if the memo concludes that {c.resolution} Judge on substance: "
            f"any wording carrying that conclusion passes. FAIL if it resolves "
            f"the conflict the other way or leaves it unresolved.", "expert")

    # ENFORCEMENT: the per-proceeding and per-case criteria that stood here were
    # measured at 21/21 and 6/6 — transcription the model never gets wrong. Only
    # the analytical moves survive, each separate so a wrong total shows which
    # move was missed.
    add("ENFORCEMENT: excludes disputes where the counterparty is the claimant",
        "PASS if the memo excludes from the counterparty's exposure any dispute "
        "in which the counterparty is itself the claimant, and says why. FAIL if "
        "such an amount is counted as exposure.", "expert")
    add("ENFORCEMENT: states the open exposure total",
        f"PASS if the memo gives current open exposure as {uah(s.open_total)} "
        f"UAH. FAIL on any other total.")

    add("RELATED PARTY: names the creditor behind the claim",
        f"PASS if the memo names {s.related} as the party behind a claim against "
        f"the counterparty. FAIL if the creditor is not identified.")
    add("RELATED PARTY: establishes common ownership",
        f"PASS if the memo establishes that the UBO {s.ubo} owns both the "
        f"counterparty's shareholder and {s.related}, citing the shareholder's "
        f"register extract. FAIL if the creditor is named without establishing "
        f"common ownership.")
    add("RELATED PARTY: states the register combination that proves it",
        f"PASS if the memo shows the finding rests on combining the "
        f"shareholder's register extract with the enforcement register or the "
        f"court docket. {s.join_text} FAIL if the connection is asserted without "
        f"showing which documents establish it.", "expert")

    add("Draws the consequence of the related-party claim",
        "PASS if the memo warns that a claim between commonly-owned companies "
        "may not be arm's length and should be verified before the exposure "
        "figure is relied on. FAIL if the relationship is reported as a neutral "
        "fact.", "expert")

    add(f"Flags that {s.absent_doc} is absent",
        f"PASS if the memo states that {s.absent_doc} is not present in the "
        f"supplied materials, so the client's second policy condition "
        f"({s.policy_second}) cannot be assessed on this record. It may say "
        f"anything else it likes in addition. FAIL only if the memo assesses "
        f"that condition anyway, or never mentions the gap.", "expert")

    add("Does not assert a conclusion the record cannot support",
        "PASS if every statement about the counterparty's financial condition or "
        "ability to perform is traceable to a supplied document. FAIL if the memo "
        "characterises the counterparty as solvent, insolvent or financially "
        "stable without a document saying so.", "expert")

    # POLICY: the two "states the condition" criteria measured 9/9 and are gone.
    # The comparison is the only part the model can actually miss.
    add("POLICY: compares the exposure against the threshold",
        f"PASS if the memo puts the open exposure figure directly against the "
        f"client's threshold and says which way the comparison goes. FAIL if "
        f"both are stated but never compared.", "expert")

    add("CONCLUSION: answers the client's question directly",
        "PASS if the memo concludes that the proposed terms are not acceptable. "
        "FAIL if the conclusion is hedged, deferred, or left to the client to "
        "draw.", "expert")
    add("CONCLUSION: gives the policy breach as a reason",
        f"PASS if the memo gives the breach of the policy threshold ({s.policy}) "
        f"as a reason for that conclusion. FAIL if the conclusion does not rest "
        f"on it.", "expert")
    add("CONCLUSION: gives the unverifiable condition as an independent reason",
        f"PASS if the memo gives, as a SEPARATE and independently sufficient "
        f"reason, that the second condition cannot be verified because "
        f"{s.absent_doc} is missing. FAIL if only the threshold reason is given, "
        f"or the two are merged into one.", "expert")

    add("Draws the conclusion the dated sequence supports",
        f"PASS if the memo concludes, from the ORDER of the dated events, that "
        f"{s.sequence_text} Any wording carrying that conclusion passes; the memo "
        f"need not compute an interval. FAIL if the dates are listed without the "
        f"conclusion.", "expert")

    # SANCTIONS: split per screened entity, this measured 15/15. Back to one
    # criterion covering all four, which at least fails if one is forgotten.
    add("SANCTIONS: rules out exposure and bounds it by the screening date",
        "PASS if the memo states that none of the counterparty, its shareholder, "
        "the related company or the UBO appears on a sanctions list, AND notes "
        "the screening speaks as at 01.06.2025. FAIL if any of the four is not "
        "addressed, sanctions are asserted to be a risk, or the screening is "
        "presented as current without qualification.")

    for title, match, source in s.extra:
        add(title, match, source)

    add("Written in Ukrainian throughout",
        "PASS if the text of the document, including headings and table "
        "captions, is in Ukrainian. FAIL if any heading or standing phrase in "
        "the text is in English or Russian. The file name is set by the "
        "instructions and is not assessed here.", "expert")
    return out


def build_task(s: V2, root: Path) -> Path:
    t = root / "diligence" / s.slug
    build_docs(s, t / "documents")
    cfg = {
        "title": s.title, "work_type": "analyze",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["Diligence", "counterparty-screening", "ukraine",
                 "contradictory-records", "related-party"],
        "instructions": (
            f"Клієнт розглядає {s.deal}. Перевірте контрагента за наданими "
            f"матеріалами та підготуйте меморандум про ризики з чіткою "
            f"відповіддю на питання клієнта. Результат: `{s.deliverable}`."
        ),
        "deliverables": {s.deliverable: s.deliverable},
        "criteria": build_criteria(s),
    }
    t.mkdir(parents=True, exist_ok=True)
    (t / "task.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return t
