#!/usr/bin/env python3
"""v2 rebuild of ua-agro-supply-framework, as a design probe.

v1 of this task scored 16/16 for Sonnet 4.6. Every one of those criteria was a
fact printed in one document. v2 keeps the same matter but makes the workspace
adversarial: two registers disagree, a document the client's question depends on
is absent, and the decisive finding needs three documents rather than two.

If Sonnet still scores near-perfect on this, the redesign is wrong and the
problem is elsewhere. That is the point of building one before rebuilding twenty.

Usage:
    uv run --with python-docx --with openpyxl python ua_v2_agro.py <tasks_root>
"""

import json
import sys
from pathlib import Path

from ua_pack import doc, sheet, synth, uah

SLUG = "ua-agro-supply-framework-v2"
DELIV = "dyu-dilidzhens-memo.docx"

TARGET = 'ТОВ "СТЕПОВА НИВА ТРЕЙД"'
TARGET_CODE = synth("43456781")
PARENT = 'ТОВ "ХОЛДИНГ ПІВДЕНЬ АГРО"'
PARENT_CODE = synth("44567892")
ELEVATOR = 'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ"'
ELEVATOR_CODE = synth("45678903")
UBO = "КРАВЧУК ІГОР СТЕПАНОВИЧ"


def build(root: Path) -> Path:
    t = root / "diligence" / SLUG
    d = t / "documents"

    doc(d / "zapyt-kliyenta.docx", "ЗАПИТ КЛІЄНТА", [
        ("p", "Галузь: агротрейдинг."),
        ("p", f"Плануємо рамковий договір поставки зерна з {TARGET} "
              f"з авансом 35% (орієнтовно 4 200 000 грн)."),
        ("b", "Політика: аванс понад 20% не допускається контрагентам з "
              "відкритими виконавчими провадженнями на суму понад 2 000 000 грн."),
        ("b", "Політика: аванс не допускається без підтвердження фінансового "
              "стану контрагента за останній звітний рік."),
        ("p", "Просимо перевірити контрагента та відповісти, чи можливий аванс "
              "у запропонованому розмірі."),
    ])

    doc(d / "vytyag-EDR.docx", "ВИТЯГ З ЄДР", [
        ("p", f"Найменування: {TARGET}"),
        ("p", f"Код ЄДРПОУ: {TARGET_CODE}"),
        ("p", "Дата державної реєстрації: 04.02.2018"),
        ("b", "Стан: зареєстровано"),
        ("p", "Розмір статутного капіталу: 250 000,00 грн"),
        ("p", "Місцезнаходження: м. Миколаїв, вул. Портова, 27"),
        ("h", "Засновники (учасники)"),
        ("p", f"{PARENT}, код ЄДРПОУ {PARENT_CODE}; розмір частки - 100%"),
        ("h", "Кінцевий бенефіціарний власник"),
        ("p", f"{UBO}; тип впливу - вирішальний вплив; відсоток частки - 100"),
        ("h", "Керівник"),
        ("p", UBO),
    ])

    doc(d / "vytyag-EDR-zasnovnyk.docx", "ВИТЯГ З ЄДР (засновник)", [
        ("p", f"Найменування: {PARENT}"),
        ("p", f"Код ЄДРПОУ: {PARENT_CODE}"),
        ("p", "Стан: зареєстровано"),
        ("h", "Кінцевий бенефіціарний власник"),
        ("p", f"{UBO}; відсоток частки - 100"),
        ("h", "Інші юридичні особи цього власника"),
        ("p", f"{ELEVATOR}, код ЄДРПОУ {ELEVATOR_CODE}; відсоток частки - 100"),
    ])

    # TRAP 1 (contradiction): the enforcement register and the court docket state
    # different amounts for the SAME dispute.
    sheet(d / "vykonavchi-provadzhennya.xlsx", "Виконавчі провадження",
          ["Номер ВП", "Боржник", "Код ЄДРПОУ", "Стягувач", "Сума, грн",
           "Дата відкриття", "Стан"],
          [["72100455", TARGET, TARGET_CODE, ELEVATOR, 3_450_000, "12.01.2025", "відкрито"],
           ["72455018", TARGET, TARGET_CODE, "ГУ ДПС у Миколаївській обл.", 1_180_000, "03.03.2025", "відкрито"],
           ["70012388", TARGET, TARGET_CODE, 'ТОВ "АГРОХІМ СЕРВІС"', 265_000, "19.05.2024", "завершено"]])

    sheet(d / "sudovi-spravy.xlsx", "Судові справи",
          ["Номер справи", "Суд", "Роль контрагента", "Стягувач/Відповідач",
           "Присуджена сума, грн", "Дата рішення"],
          [["915/0331/25", "Господарський суд Миколаївської області", "відповідач", ELEVATOR, 3_150_000, "08.01.2025"],
           ["915/0870/24", "Господарський суд Миколаївської області", "позивач", 'ТОВ "ПОРТ СЕРВІС"', 640_000, "22.04.2024"]])

    doc(d / "dovidka-podatkovyi-borh.docx", "ДОВІДКА ПРО СТАН РОЗРАХУНКІВ З БЮДЖЕТОМ", [
        ("p", f"Платник: {TARGET}, код ЄДРПОУ {TARGET_CODE}"),
        ("p", "Станом на 01.06.2025"),
        ("b", "Загальна сума податкового боргу: 1 180 000,00 грн"),
        ("p", "Заборгованість передана до примусового стягнення."),
    ])

    doc(d / "sankciyni-perevirky.docx", "ПЕРЕВІРКА ЗА САНКЦІЙНИМИ ПЕРЕЛІКАМИ", [
        ("p", f"{TARGET}, код ЄДРПОУ {TARGET_CODE}: у переліках не виявлено."),
        ("p", f"{PARENT}, код ЄДРПОУ {PARENT_CODE}: у переліках не виявлено."),
        ("p", f"{ELEVATOR}, код ЄДРПОУ {ELEVATOR_CODE}: у переліках не виявлено."),
        ("p", f"{UBO}: як фізична особа у переліках не виявлений."),
        ("p", "Перевірку проведено станом на 01.06.2025."),
    ])
    # TRAP 2 (absence): NO financial statements are supplied, though the client's
    # second policy turns on them. Nothing in the workspace says they are missing.

    H = []
    H.append((
        "Resolves the contradiction between the two registers",
        "PASS if the memo notices that the enforcement register shows 3 450 000 UAH "
        "for proceeding 72100455 while the court docket shows 3 150 000 UAH awarded "
        "in case 915/0331/25 for the same creditor and dispute, states that the two "
        "sources disagree by 300 000 UAH, and does not silently adopt one figure. "
        "FAIL if it reports only one of the amounts, averages them, or presents "
        "them as two separate debts.", "oracle"))
    H.append((
        "Does not double-count the disputed claim",
        "PASS if the memo treats case 915/0331/25 and proceeding 72100455 as the "
        "SAME dispute at two stages, not as two liabilities. FAIL if the exposure "
        "total adds both.", "oracle"))
    H.append((
        "States open exposure after the required exclusions",
        "PASS if the memo gives current open exposure as 4 630 000 UAH, being "
        "3 450 000 plus 1 180 000. That is only correct after excluding the "
        "completed proceeding 70012388 (265 000), excluding case 915/0870/24 where "
        "the counterparty is claimant, and not adding the court-docket figure on "
        "top of the enforcement figure. FAIL if any other total is given.", "oracle"))
    H.append((
        "Identifies that the tax debt and proceeding 72455018 are one liability",
        "PASS if the memo states that the 1 180 000 UAH tax debt and enforcement "
        "proceeding 72455018 are the same liability at two stages, so they are "
        "counted once. FAIL if they are added together.", "oracle"))
    H.append((
        "Assembles the related-party finding from three documents",
        f"PASS if the memo establishes that the largest claim against the "
        f"counterparty comes from a RELATED party, by combining three documents: "
        f"the shareholder's register extract (the UBO {UBO} also owns "
        f"{ELEVATOR}), the enforcement register ({ELEVATOR} is the creditor in "
        f"72100455), and the court docket (the same creditor obtained the award in "
        f"915/0331/25). FAIL if the memo names the creditor without establishing "
        f"the common ownership, or asserts the link without the shareholder "
        f"extract.", "oracle"))
    H.append((
        "Draws the consequence of the related-party claim",
        "PASS if the memo warns that a claim between commonly-owned companies may "
        "not be an arm's-length debt and should be verified before the exposure "
        "figure is relied on. FAIL if the relationship is reported as a neutral "
        "fact.", "expert"))
    H.append((
        "Flags that the financial statements are absent",
        "PASS if the memo states that no financial statements for the last "
        "reporting year are present in the supplied materials, and that the "
        "client's second policy condition therefore cannot be assessed on this "
        "record. FAIL if the memo assesses solvency anyway, or does not mention "
        "the gap.", "expert"))
    H.append((
        "Does not assert a solvency conclusion it cannot support",
        "PASS if the memo avoids any statement about the counterparty's financial "
        "condition, liquidity or ability to perform that is not traceable to a "
        "supplied document. FAIL if it characterises the counterparty as solvent, "
        "insolvent, or financially stable.", "expert"))
    H.append((
        "Reaches the correct policy conclusion on the advance",
        "PASS if the memo concludes the 35% advance is not permitted, and gives "
        "BOTH independent reasons: open enforcement exceeds the 2 000 000 UAH "
        "threshold, and the financial statements required by the second condition "
        "are absent. FAIL if only one reason is given, or if the conclusion is "
        "hedged.", "expert"))
    H.append(sequence_criterion())
    H.append((
        "Rules out sanctions exposure affirmatively",
        "PASS if the memo states that none of the counterparty, its shareholder, "
        "the related creditor, or the UBO appears on a sanctions list, citing the "
        "screening dated 01.06.2025. FAIL if sanctions are not addressed, or are "
        "asserted to be a risk.", "expert"))
    H.append((
        "Notes the screening date bounds the conclusion",
        "PASS if the memo notes that the sanctions screening speaks as at "
        "01.06.2025 and does not cover anything after that date. FAIL if the "
        "screening is presented as current without qualification.", "expert"))

    from ua_pack2 import assemble

    class S:
        target_code, status, address = TARGET_CODE, "зареєстровано", "м. Миколаїв, вул. Портова, 27"
        capital, parent, parent_share, ubo = 250_000, PARENT, 100, UBO

    cfg = {
        "title": "Перевірка контрагента: суперечності між реєстрами та неповний комплект",
        "work_type": "analyze",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["Diligence", "counterparty-screening", "ukraine",
                 "related-party", "incomplete-record"],
        "instructions": (
            "Клієнт розглядає рамковий договір поставки з авансом. Перевірте "
            "контрагента за наданими матеріалами та підготуйте меморандум про "
            "ризики з чіткою відповіддю, чи можливий аванс у запропонованому "
            f"розмірі. Результат: `{DELIV}`."
        ),
        "deliverables": {DELIV: DELIV},
        "criteria": assemble(S, DELIV, H),
    }
    t.mkdir(parents=True, exist_ok=True)
    (t / "task.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return t


def sequence_criterion():
    return (
        "Draws the conclusion from the order of events",
        "PASS if the memo observes that the award in case 915/0331/25 (08.01.2025) "
        "preceded the opening of enforcement 72100455 (12.01.2025) by four days, "
        "and uses that to establish they are the same dispute progressing to "
        "enforcement. FAIL if the memo lists both dates without drawing that "
        "conclusion.", "expert")


if __name__ == "__main__":
    p = build(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks"))
    n = len(json.loads((p / "task.json").read_text(encoding="utf-8"))["criteria"])
    print(f"{p}: {n} criteria, {len(list((p/'documents').iterdir()))} documents")
