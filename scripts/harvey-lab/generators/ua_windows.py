#!/usr/bin/env python3
"""Three matters set in the other three states of paragraph 19.

Paragraph 19 of the Civil Code transitional provisions is the only provision in
this family that changed between 2022 and 2025. Articles 257, 258, 259, 261, 267
and 625 are byte-identical across the 20220101, 20220317, 20240101, 20250110 and
20250810 editions, so the matter date is the single variable and these tasks are
a controlled probe of temporal grounding.

  window A  judgment before 15.03.2022
            martial law is already in force (24.02.2022) but paragraph 19 does
            not exist yet, so there is NO martial-law extension. Only paragraph
            12, the COVID-19 quarantine rule, is available.
  window B  judgment while the ORIGINAL paragraph 19 governs
            "строки, визначені статтями 257-259, 362, 559, 681, 728, 786, 1293
            цього Кодексу, ПРОДОВЖУЮТЬСЯ на строк його дії" — an extension, and
            it carries its own article list, so it works like paragraph 12
            rather than against it.
  window D  judgment 12.11.2025
            paragraph 19 is gone from the text. Note the date carefully: Law
            4434-IX is dated 14.05.2025, but the provision was STILL PRESENT in
            the 10.08.2025 and 28.08.2025 editions and had disappeared by
            05.10.2025. A first draft dated this matter 20.08.2025 and marked the
            model wrong for applying paragraph 19 — the model was arguably right
            and the task was wrong. The judgment date now sits well clear of that
            boundary. Whether a repeal bites from the law's own date or from the
            consolidated text is a real question of law and is referred to the
            reviewing advocate rather than decided here.

Window C (the restated "зупиняється" wording) is the existing
ua-limitation-period-martial-law.

The court judgment in each matter states its outcome and the dates it found,
and deliberately does NOT set out the reasoning on limitation. A first draft did
spell the reasoning out, and Sonnet 4.6 then scored 10/10, 9/10 and 10/10 simply
by paraphrasing the judgment: the task measured reading rather than knowing which
version of the law applied. The law must come from the analysis, not from the
workspace.

The window D task deliberately does NOT assert what happens to a suspension that
had already accrued before the repeal: that is a real question of transitional
effect and it is flagged for the reviewing advocate rather than answered here.

Usage:
    uv run --with python-docx --with openpyxl python ua_windows.py <tasks_root>
"""

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from ua_pack import doc, sheet, synth, uah

DELIV = "analiz-pozovnoyi-davnosti.docx"


@dataclass
class W:
    slug: str
    title: str
    window: str
    claimant: str
    claimant_code: str
    defendant: str
    defendant_code: str
    debt: int
    due: str
    start: str
    filed: str
    judgment: str
    holding: str
    bare_expiry: str = ""            # when the unextended three years run out
    filed_after_bare_expiry: bool = False
    extra: list = field(default_factory=list)


C = []

C.append(W(
    slug="ua-limitation-window-before-p19",
    title="Позовна давність: воєнний стан уже введено, а пункту 19 ще немає",
    window="A",
    claimant='ТОВ "ПОЛІСЬКА ДЕРЕВООБРОБКА"', claimant_code=synth("41234568"),
    defendant='ТОВ "МЕБЛЕВА ФАБРИКА ЦЕНТР"', defendant_code=synth("42345679"),
    debt=1_640_000, due="12.02.2019", start="13.02.2019",
    filed="02.03.2022", judgment="10.03.2022",
    bare_expiry="14.02.2022", filed_after_bare_expiry=True,
    holding="Відповідач заявив про застосування позовної давності. Суд "
            "дослідив дати, встановлені матеріалами справи, та вирішив спір по "
            "суті. Мотиви щодо застосування норм про позовну давність викладено "
            "в повному тексті рішення, який сторонам ще не вручено.",
    extra=[
        ("Identifies that paragraph 19 did not yet exist",
         "PASS if the analysis states that, at the judgment date 10.03.2022, "
         "paragraph 19 of the Final and Transitional Provisions of the Civil Code "
         "had not yet been enacted, having been added by Law 2120-IX on "
         "15.03.2022. FAIL if it applies paragraph 19 to this matter in any form.",
         "oracle"),
        ("Does not infer a martial-law rule from martial law itself",
         "PASS if the analysis distinguishes the fact that martial law was in "
         "force from 24.02.2022 from the separate question of whether a statutory "
         "rule about limitation during martial law existed, and concludes that the "
         "former does not imply the latter. FAIL if it treats the introduction of "
         "martial law as itself extending or suspending limitation.", "expert"),
        ("Applies the quarantine rule instead",
         "PASS if the analysis identifies paragraph 12 of the Final and "
         "Transitional Provisions (COVID-19 quarantine) as the rule available on "
         "this date, extending the periods listed there. FAIL if it identifies no "
         "applicable rule, or names paragraph 19.", "oracle"),
        ("Confirms paragraph 12 reaches this claim",
         "PASS if the analysis states that the article list in paragraph 12 "
         "includes Article 257, so the general three-year period for this claim "
         "is among the periods it extends. FAIL if paragraph 12 is invoked "
         "without establishing that it covers the period in issue.", "oracle"),
        ("Identifies paragraph 12 as extending rather than suspending",
         "PASS if the analysis treats paragraph 12 as PROLONGING the period for "
         "the duration of the quarantine (продовжуються). FAIL if it describes "
         "paragraph 12 as suspending the running of limitation.", "oracle"),
        ("Places the quarantine inside the running period",
         "PASS if the analysis states that the COVID-19 quarantine was in force "
         "from 12.03.2020 and was still in force at the judgment date, so it ran "
         "while this limitation period was running. FAIL if the quarantine is "
         "invoked without locating it in time relative to this period.", "oracle"),
        ("Concludes the claim is in time ONLY because of the extension",
         "PASS if the analysis concludes that the claim is in time and that it "
         "would have been out of time on the unextended three-year period, so the "
         "outcome turns on the paragraph 12 extension. FAIL if it concludes the "
         "claim is in time on the bare three-year period, or concludes it is out "
         "of time.", "expert"),
    ],
))

C.append(W(
    slug="ua-limitation-window-original-p19",
    title="Позовна давність: первісна редакція пункту 19 продовжує строки",
    window="B",
    claimant='ТОВ "СТАЛЕВІ КОНСТРУКЦІЇ ПЛЮС"', claimant_code=synth("43456781"),
    defendant='ТОВ "БУДІВЕЛЬНИЙ АЛЬЯНС"', defendant_code=synth("44567892"),
    debt=2_870_000, due="18.09.2019", start="19.09.2019",
    filed="14.04.2023", judgment="26.06.2023",
    holding="Відповідач заявив про застосування позовної давності. Суд "
            "дослідив дати, встановлені матеріалами справи, та вирішив спір по "
            "суті. Мотиви щодо застосування норм про позовну давність викладено "
            "в повному тексті рішення, який сторонам ще не вручено.",
    extra=[
        ("Applies the ORIGINAL wording, which extends rather than suspends",
         "PASS if the analysis states that the wording of paragraph 19 in force on "
         "26.06.2023 EXTENDS the periods (продовжуються) for the duration of "
         "martial law. FAIL if it says the running of limitation is SUSPENDED "
         "(зупиняється), which is the later restatement by Law 3450-IX and does "
         "not govern this matter.", "oracle"),
        ("Recognises that the original paragraph 19 carried its own article list",
         "PASS if the analysis reflects that paragraph 19, in the wording in force "
         "on this date, applies to the periods defined by Articles 257-259, 362, "
         "559, 681, 728, 786 and 1293. FAIL if it states that paragraph 19 "
         "contains no article list, which is true only of the later restatement.",
         "oracle"),
        ("Does not treat paragraphs 12 and 19 as opposite mechanisms here",
         "PASS if the analysis treats both paragraph 12 and paragraph 19, in the "
         "wording in force on this date, as extension rules operating the same "
         "way. FAIL if it contrasts them as extension versus suspension, which is "
         "only true after the 3450-IX restatement.", "expert"),
    ],
))

C.append(W(
    slug="ua-limitation-window-after-repeal",
    title="Позовна давність: пункт 19 виключено, справа після 14.05.2025",
    window="D",
    claimant='ТОВ "АГРОХОЛОД СЕРВІС"', claimant_code=synth("45012347"),
    defendant='ТОВ "ТОРГОВИЙ ДІМ ПІВНІЧ"', defendant_code=synth("45123458"),
    debt=3_310_000, due="04.06.2021", start="05.06.2021",
    filed="12.09.2025", judgment="12.11.2025",
    holding="Відповідач заявив про застосування позовної давності. Суд "
            "дослідив дати, встановлені матеріалами справи, та вирішив спір по "
            "суті. Мотиви щодо застосування норм про позовну давність викладено "
            "в повному тексті рішення, який сторонам ще не вручено.",
    extra=[
        ("Identifies that paragraph 19 is no longer in force",
         "PASS if the analysis states that paragraph 19 is absent from the Civil "
         "Code as it stood on 12.11.2025, having been excluded on the basis of Law "
         "4434-IX. FAIL if it applies paragraph 19 as live law at that date.",
         "oracle"),
        ("Does not silently carry forward the repealed rule",
         "PASS if the analysis reaches a conclusion on limitation without relying "
         "on paragraph 19 as a rule operative on 12.11.2025. FAIL if its "
         "conclusion depends on paragraph 19 still applying at that date.",
         "expert"),
        ("Flags the transitional question rather than inventing an answer",
         "PASS if the analysis identifies that the effect of the repeal on a "
         "period that had already been suspended or extended before 14.05.2025 is "
         "a separate question, and either reasons it through explicitly or states "
         "that it is unresolved on the material provided. FAIL if the analysis "
         "asserts a confident answer with no basis in the supplied documents.",
         "expert"),
    ],
))


def build(c: W, root: Path) -> Path:
    t = root / "litigation-dispute-resolution" / c.slug
    d = t / "documents"

    doc(d / "dogovir.docx", "ДОГОВІР ПОСТАВКИ", [
        ("p", f"Постачальник: {c.claimant}, код ЄДРПОУ {c.claimant_code}"),
        ("p", f"Покупець: {c.defendant}, код ЄДРПОУ {c.defendant_code}"),
        ("p", f"Загальна вартість: {uah(c.debt)},00 грн"),
        ("p", f"Строк виконання грошового зобов'язання: {c.due}."),
        ("p", "Інших умов щодо позовної давності договір не містить."),
    ])
    doc(d / "pozovna-zayava.docx", "ПОЗОВНА ЗАЯВА", [
        ("p", f"Позивач: {c.claimant}"), ("p", f"Відповідач: {c.defendant}"),
        ("p", f"Дата подання: {c.filed}"),
        ("p", f"Строк оплати сплив {c.due}, оплата не здійснена."),
        ("p", f"Просимо стягнути {uah(c.debt)},00 грн, а також 3% річних та "
              f"інфляційні втрати відповідно до частини другої статті 625 "
              f"Цивільного кодексу України."),
    ])
    doc(d / "vidzyv.docx", "ВІДЗИВ НА ПОЗОВНУ ЗАЯВУ", [
        ("p", f"Відповідач: {c.defendant}"),
        ("p", f"Перебіг позовної давності розпочався {c.start}. Відповідач "
              f"заявляє про застосування позовної давності."),
    ])
    doc(d / "rishennya.docx", f"РІШЕННЯ суду першої інстанції від {c.judgment}", [
        ("p", f"Строк виконання грошового зобов'язання - {c.due}. Перебіг "
              f"позовної давності розпочався {c.start} відповідно до частини "
              f"п'ятої статті 261 Цивільного кодексу України."),
        ("b", "Щодо позовної давності"),
        ("p", c.holding),
    ])
    sheet(d / "hronolohiya.xlsx", "Хронологія", ["Подія", "Дата"], [
        ["Строк виконання зобов'язання", c.due],
        ["Початок перебігу позовної давності", c.start],
        ["Введення воєнного стану", "24.02.2022"],
        ["Подання позову", c.filed],
        ["Рішення суду першої інстанції", c.judgment],
    ])

    crit, n = [], 0

    def add(title, match, source="oracle"):
        nonlocal n
        n += 1
        crit.append({"id": f"C-{n:03d}", "title": title,
                     "deliverables": [DELIV], "match_criteria": match,
                     "source": source})

    add("Applies the law in force at the judgment date",
        f"PASS if the analysis applies the Civil Code as it stood on "
        f"{c.judgment} and says so. Paragraph 19 of the Final and Transitional "
        f"Provisions was added on 15.03.2022 by Law 2120-IX, later restated, and "
        f"later excluded on the basis of Law 4434-IX, so its content depends on "
        f"the date. FAIL if the analysis applies a version of paragraph 19 that "
        f"did not govern on {c.judgment}.")
    for title, match, source in c.extra:
        add(title, match, source)

    # DATES: the chain that decides the matter, one link per criterion. Bundling
    # these hid which link broke, and left the decisive arithmetic untested: in
    # window A a memo could name every rule correctly, never compute the expiry,
    # and still score full marks.
    add("DATES: fixes the start of the limitation period",
        f"PASS if the analysis states that limitation began to run on {c.start}, "
        f"the day after performance fell due. FAIL if it uses another start "
        f"date.")
    add("DATES: cites Article 261(5) for that start",
        "PASS if the analysis grounds the start date in part 5 of Article 261 of "
        "the Civil Code. FAIL if the start date is asserted without that basis.")
    if c.bare_expiry:
        add("DATES: computes the unextended expiry date",
            f"PASS if the analysis computes that the three-year period, taken on its own, "
            f"would run out on {c.bare_expiry}, and grounds that date in the rule that a "
            f"period ending on a non-working day ends on the next working day instead. "
            f"FAIL if another date is given, or the date is asserted without that basis.")
        add("DATES: compares the filing date against that expiry",
            "PASS if the analysis says in terms whether the claim was filed "
            "before or after the unextended period ran out. FAIL if both dates "
            "appear but are never compared.", "expert")

    add("LAW: identifies the three-year general period",
        "PASS if the analysis identifies the applicable general limitation period "
        "as three years. FAIL if it states another duration.")
    add("LAW: cites Article 257 for that period",
        "PASS if the analysis cites Article 257 of the Civil Code as the source "
        "of the three-year period. FAIL if it cites another provision.")
    add("LAW: identifies Article 625(2) for 3% per annum and inflation losses",
        "PASS if the analysis cites part 2 of Article 625 of the Civil Code as the "
        "basis for the 3% per annum and inflation losses. FAIL if it cites another "
        "provision or treats these as contractual claims.")
    add("LAW: notes the contract sets no limitation term of its own",
        "PASS if the analysis notes that the supply contract contains no term "
        "varying the limitation period, so the statutory period governs. FAIL if "
        "the contract is not addressed on this point.")

    add("PROCEDURE: notes the defendant raised the limitation objection",
        f"PASS if the analysis notes that {c.defendant} applied for limitation to "
        f"be applied, in its ВІДЗИВ. FAIL if the objection is not mentioned.")

    add("PARTIES: identifies the claimant",
        f"PASS if the analysis identifies {c.claimant} as claimant. FAIL if the "
        f"claimant is wrong or the roles are reversed.")
    add("PARTIES: identifies the defendant",
        f"PASS if the analysis identifies {c.defendant} as defendant. FAIL if the "
        f"defendant is wrong or the roles are reversed.")
    add("PARTIES: states the claimant's ЄДРПОУ code",
        f"PASS if the analysis gives the claimant's ЄДРПОУ code as "
        f"{c.claimant_code}. FAIL if it is absent or wrong.")
    add("PARTIES: states the defendant's ЄДРПОУ code",
        f"PASS if the analysis gives the defendant's ЄДРПОУ code as "
        f"{c.defendant_code}. FAIL if it is absent or wrong.")

    add("AMOUNTS: states the principal sum",
        f"PASS if the analysis states the principal claim as {uah(c.debt)} UAH. "
        f"FAIL if it gives a different amount.")

    add("Does not invent a rule the workspace does not support",
        "PASS if every proposition of law in the analysis is either a provision "
        "of the Civil Code identified by number or a fact taken from the supplied "
        "documents. FAIL if the analysis relies on a rule it neither names nor "
        "grounds.", "expert")
    add("Written in Ukrainian",
        "PASS if the text of the deliverable is written in Ukrainian. FAIL if any "
        "heading or standing phrase in the text is in English or Russian. The "
        "file name is set by the instructions and is not assessed here.",
        "expert")

    cfg = {
        "title": c.title, "work_type": "analyze",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["Litigation (General)", "limitation-period", "temporal-grounding",
                 "civil-code-ukraine", "ukraine", f"window-{c.window}"],
        "instructions": (
            f"Ознайомтеся з матеріалами справи та підготуйте аналіз щодо "
            f"позовної давності. Застосовуйте законодавство в редакції, чинній "
            f"станом на дату ухвалення рішення суду першої інстанції "
            f"({c.judgment}). Результат: `{DELIV}`."
        ),
        "deliverables": {DELIV: DELIV},
        "criteria": crit,
    }
    t.mkdir(parents=True, exist_ok=True)
    (t / "task.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return t


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    for c in C:
        t = build(c, root)
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        print(f"window {c.window}: {t.relative_to(root)} — {n} criteria, "
              f"{len(list((t/'documents').iterdir()))} documents, judgment {c.judgment}")


if __name__ == "__main__":
    main()
