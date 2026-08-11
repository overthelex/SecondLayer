#!/usr/bin/env python3
"""The remaining 11 register-screening scenarios, rebuilt on the v2 design.

Calibrated on three: 73.8% pooled, 0/3 all-pass, against 96.5% and 10/14 for v1
and 63.4% for Niklaus' vanilla LAB baseline. All nine contradiction criteria
failed there, so contradictions carry the discrimination and each matter here
gets three.

Deliberate variation, because a pack whose difficulty rests on one trick
collapses the moment a model learns that trick. The contradiction types rotate:
amount mismatches, status mismatches, date mismatches, role mismatches, count
mismatches, and scope mismatches between a permit and a contract.

Usage:
    uv run --with python-docx --with openpyxl python ua_v2_rest.py <tasks_root>
"""

import json
import sys
from pathlib import Path

from ua_v2_gen import V2, Contradiction, build_task
from ua_pack import synth

S = []

S.append(V2(
    slug="ua-construction-capital-v2",
    title="Перевірка контрагента: зменшення капіталу і розбіжності реєстрів (будівництво)",
    deal="договір генерального підряду на 12 400 000 грн",
    policy="договори понад 10 000 000 грн потребують забезпечення, якщо відкриті "
           "виконавчі провадження перевищують 3 000 000 грн",
    policy_second="договір підряду не укладається без чинного дозволу на "
                  "виконання будівельних робіт",
    absent_doc="дозвіл на виконання будівельних робіт",
    target='ТОВ "МОНОЛІТ БУД ГРУП"', target_code=synth("43678903"),
    status="зареєстровано", address="м. Львів, вул. Личаківська, 143",
    capital=80_000,
    parent='ТОВ "ІНВЕСТ БУД АКТИВ"', parent_code=synth("44789014"),
    ubo="ГАВРИЛЮК БОГДАН ЯРОСЛАВОВИЧ",
    related='ТОВ "БУДМАТЕРІАЛИ ЗАХІД"', related_code=synth("45012347"),
    proceedings=[
        ("71905233", 'ТОВ "БУДМАТЕРІАЛИ ЗАХІД"', 2_260_000, "21.02.2025", "відкрито"),
        ("72330871", 'ПрАТ "ЕНЕРГОПОСТАЧ"', 890_000, "07.04.2025", "відкрито"),
        ("69880102", 'ТОВ "ОРЕНДА ТЕХНІКИ"', 512_000, "13.09.2023", "повернуто стягувачу"),
    ],
    cases=[
        ("914/0455/25", "відповідач", 'ТОВ "БУДМАТЕРІАЛИ ЗАХІД"', 2_040_000, "11.02.2025"),
        ("914/0688/25", "позивач", 'ТОВ "ЗАМОВНИК ПЛЮС"', 5_100_000, "19.03.2025"),
    ],
    contradictions=[
        Contradiction("the share capital",
                      "the ЄДР extract", "80 000 UAH",
                      "the register history note", "4 200 000 UAH until 22.01.2025",
                      "the capital was reduced by over 98% a month before the "
                      "first enforcement, which the memo must treat as a risk "
                      "indicator rather than a static figure.",
                      inject="Історія змін: 22.01.2025 зменшено статутний капітал "
                             "з 4 200 000,00 грн до 80 000,00 грн; 24.01.2025 "
                             "змінено керівника."),
        Contradiction("the amount of the БУДМАТЕРІАЛИ ЗАХІД claim",
                      "the enforcement register (71905233)", "2 260 000 UAH",
                      "the court docket (914/0455/25)", "2 040 000 UAH",
                      "one claim at two stages, differing by 220 000 UAH."),
        Contradiction("who manages the company",
                      "the ЄДР extract, which names the UBO as director",
                      "ГАВРИЛЮК БОГДАН ЯРОСЛАВОВИЧ",
                      "the register history note", "changed on 24.01.2025",
                      "the current director is not the beneficial owner, and the "
                      "change coincided with the capital reduction."),
    ],
    open_total=3_150_000,
    join_text="The largest claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the capital reduction and director change (22-24.01.2025) both "
                  "preceded the first enforcement proceeding (21.02.2025).",
))

S.append(V2(
    slug="ua-pharma-sanctions-v2",
    title="Перевірка контрагента: санкції щодо власника (фармацевтика)",
    deal="дистриб'юторський договір на 8 600 000 грн на рік",
    policy="співпраця не допускається, якщо відкриті виконавчі провадження "
           "перевищують 500 000 грн",
    policy_second="співпраця не допускається без ліцензії на оптову торгівлю "
                  "лікарськими засобами",
    absent_doc="ліцензія на оптову торгівлю лікарськими засобами",
    target='ТОВ "МЕДФАРМ ДИСТРИБ\'ЮШН"', target_code=synth("43789014"),
    status="зареєстровано", address="м. Харків, просп. Науки, 60",
    capital=500_000,
    parent='ТОВ "ФАРМ КАПІТАЛ ІНВЕСТ"', parent_code=synth("44890125"),
    ubo="ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ",
    related='ТОВ "ЛОГІСТИК ФАРМ"', related_code=synth("45123458"),
    proceedings=[
        ("72700411", 'ТОВ "ЛОГІСТИК ФАРМ"', 620_000, "18.03.2025", "відкрито"),
        ("72910233", 'ТОВ "СКЛАД СЕРВІС"', 310_000, "02.05.2025", "відкрито"),
        ("70110988", 'ТОВ "ПАКУВАННЯ"', 96_000, "11.01.2024", "завершено"),
    ],
    cases=[
        ("922/0512/25", "позивач", 'ТОВ "АПТЕЧНА МЕРЕЖА"', 1_340_000, "26.02.2025"),
        ("922/0733/25", "відповідач", 'ТОВ "ЛОГІСТИК ФАРМ"', 585_000, "05.03.2025"),
    ],
    contradictions=[
        Contradiction("whether sanctions touch this counterparty",
                      "the sanctions screening for the company", "not listed",
                      "the sanctions screening for the beneficial owner",
                      "listed by a decision of 07.03.2024 for 5 years",
                      "the company itself is clean but its owner is sanctioned, "
                      "so a screening of the company alone is misleading.",
                      inject="Санкційна перевірка, доповнення: ЗАХАРЧЕНКО РУСЛАН "
                             "ОЛЕГОВИЧ включений до переліку осіб, до яких "
                             "застосовано санкції, рішенням від 07.03.2024, строк "
                             "застосування 5 років."),
        Contradiction("the amount of the ЛОГІСТИК ФАРМ claim",
                      "the enforcement register (72700411)", "620 000 UAH",
                      "the court docket (922/0733/25)", "585 000 UAH",
                      "one claim at two stages, differing by 35 000 UAH."),
        Contradiction("who is the director",
                      "the ЄДР extract, which names the UBO",
                      "ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ",
                      "the register note", "ЛИТВИН НАТАЛІЯ ІВАНІВНА since 2023",
                      "the sanctioned owner is not the signatory, which does not "
                      "cure the ownership problem.",
                      inject="Відмітка: керівником з 2023 року є ЛИТВИН НАТАЛІЯ "
                             "ІВАНІВНА; кінцевим бенефіціарним власником "
                             "залишається ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ."),
    ],
    open_total=930_000,
    join_text="One of the open claims is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="sanctions were imposed on the owner (07.03.2024) well before "
                  "the proposed contract, so this is not a new development.",
))

S.append(V2(
    slug="ua-metals-seizure-v2",
    title="Перевірка контрагента: арешт активів і банкрутство (металообробка)",
    deal="замовлення металоконструкцій з передоплатою 40%",
    policy="передоплата не допускається контрагентам з відкритими виконавчими "
           "провадженнями понад 2 000 000 грн",
    policy_second="передоплата не допускається щодо контрагента у процедурі "
                  "банкрутства",
    absent_doc="ухвала про відкриття провадження у справі про банкрутство",
    target='ТОВ "СТАЛЬ ПРОФІЛЬ ВИРОБНИЦТВО"', target_code=synth("43890125"),
    status="зареєстровано", address="м. Запоріжжя, вул. Заводська, 8",
    capital=1_500_000,
    parent='ТОВ "ІНДУСТРІАЛ ГРУП ЗАПОРІЖЖЯ"', parent_code=synth("44901236"),
    ubo="ТКАЧЕНКО СЕРГІЙ ВАЛЕНТИНОВИЧ",
    related='ТОВ "МЕТАЛОБАЗА ЦЕНТР"', related_code=synth("45234569"),
    proceedings=[
        ("71440200", 'АТ "ОБЛЕНЕРГО"', 1_960_000, "05.12.2024", "відкрито"),
        ("72880533", 'ТОВ "МЕТАЛОБАЗА ЦЕНТР"', 3_120_000, "22.04.2025", "відкрито"),
        ("70330100", 'ТОВ "ТРАНСПОРТ ПЛЮС"', 210_000, "14.08.2023", "завершено"),
    ],
    cases=[
        ("908/0299/25", "відповідач", 'ТОВ "МЕТАЛОБАЗА ЦЕНТР"', 2_950_000, "10.03.2025"),
        ("908/0733/25", "відповідач", "кредитори", 0, "14.05.2025"),
    ],
    contradictions=[
        Contradiction("the address of the seized asset",
                      "the ЄДР extract, giving the registered office",
                      "вул. Заводська, 8",
                      "the seizure note", "the same вул. Заводська, 8",
                      "the seized production complex is the counterparty's own "
                      "operating base, not an incidental holding.",
                      inject="Відмітка про арешт: у справі 908/0733/25 накладено "
                             "арешт на виробничий комплекс за адресою "
                             "м. Запоріжжя, вул. Заводська, 8, дата арешту "
                             "28.05.2025."),
        Contradiction("the amount of the МЕТАЛОБАЗА ЦЕНТР claim",
                      "the enforcement register (72880533)", "3 120 000 UAH",
                      "the court docket (908/0299/25)", "2 950 000 UAH",
                      "one claim at two stages, differing by 170 000 UAH."),
        Contradiction("the nature of case 908/0733/25",
                      "the court docket, which shows no monetary claim", "0 UAH",
                      "the seizure note, which acts in the same case",
                      "an asset seizure",
                      "the zero amount does not mean the case is immaterial; it is "
                      "insolvency-type rather than a debt claim."),
    ],
    open_total=5_080_000,
    join_text="The largest open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the seizure (28.05.2025) followed the opening of case "
                  "908/0733/25 (14.05.2025), so the asset was encumbered as part "
                  "of that proceeding.",
))

S.append(V2(
    slug="ua-retail-successor-v2",
    title="Перевірка контрагента: правонаступництво і подвійний облік (рітейл)",
    deal="договір поставки з відстрочкою платежу 60 днів",
    policy="сукупна експозиція на контрагента не може перевищувати 3 000 000 грн "
           "з урахуванням зобов'язань правопопередників",
    policy_second="відстрочка не надається без акта звірки взаєморозрахунків",
    absent_doc="акт звірки взаєморозрахунків",
    target='ТОВ "МАРКЕТ ЛАЙН РІТЕЙЛ"', target_code=synth("43901236"),
    status="зареєстровано", address="м. Київ, вул. Кирилівська, 102",
    capital=900_000,
    parent='ТОВ "РІТЕЙЛ ХОЛДИНГ ЦЕНТР"', parent_code=synth("45012347"),
    ubo="БОНДАРЕНКО АРТЕМ ВОЛОДИМИРОВИЧ",
    related='ТОВ "ДИСТРИБ\'ЮЦІЯ ПЛЮС"', related_code=synth("45345671"),
    proceedings=[
        ("72990644", 'ТОВ "ДИСТРИБ\'ЮЦІЯ ПЛЮС"', 1_480_000, "16.05.2025", "відкрито"),
        ("71330922", 'ТОВ "ЛОГІСТИКА СТОЛИЦЯ"', 820_000, "03.03.2025", "відкрито"),
        ("70880311", 'ТОВ "ОБЛАДНАННЯ"', 175_000, "22.11.2023", "завершено"),
    ],
    cases=[
        ("910/0812/25", "відповідач", 'ТОВ "ДИСТРИБ\'ЮЦІЯ ПЛЮС"', 1_390_000, "29.04.2025"),
        ("910/0433/24", "позивач", 'ТОВ "ОРЕНДОДАВЕЦЬ"', 275_000, "18.03.2024"),
    ],
    contradictions=[
        Contradiction("whose debts the counterparty owes",
                      "the ЄДР extract, which shows only its own obligations",
                      "no predecessor liabilities",
                      "the succession note",
                      "2 350 000 UAH inherited from ТОВ \"ПРОДУКТ СІТІ\" on "
                      "11.02.2025",
                      "the counterparty is universal successor, so the inherited "
                      "obligations count toward the client's limit.",
                      inject="Відомості про правонаступництво: 11.02.2025 "
                             "приєднано ТОВ \"ПРОДУКТ СІТІ\"; непогашені "
                             "зобов'язання приєднаної особи на дату приєднання "
                             "2 350 000,00 грн."),
        Contradiction("the amount of the ДИСТРИБ'ЮЦІЯ ПЛЮС claim",
                      "the enforcement register (72990644)", "1 480 000 UAH",
                      "the court docket (910/0812/25)", "1 390 000 UAH",
                      "one claim at two stages, differing by 90 000 UAH."),
        Contradiction("the direction of case 910/0433/24",
                      "the court docket role column", "позивач",
                      "a reading that counts every listed case as exposure",
                      "an apparent 275 000 UAH liability",
                      "the counterparty brought that claim, so it is not exposure "
                      "against it."),
    ],
    open_total=2_300_000,
    join_text="The largest open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the absorption (11.02.2025) preceded both open enforcement "
                  "proceedings, so the inherited liabilities were already part of "
                  "the counterparty when they arose.",
))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    tot = 0
    for s in S:
        t = build_task(s, root)
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        tot += n
        print(f"{t.relative_to(root)}: {n} criteria, "
              f"{len(list((t/'documents').iterdir()))} documents")
    print(f"\n{len(S)} scenarios, {tot} criteria")


if __name__ == "__main__":
    main()
