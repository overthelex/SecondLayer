#!/usr/bin/env python3
"""Three v2 scenarios, used to calibrate difficulty before rebuilding all 14.

Each carries three genuine contradictions between documents. Amounts are chosen
so the correct exposure total is only reachable after the exclusions, and so a
memo that adopts the wrong side of any contradiction lands on a different number.

Usage:
    uv run --with python-docx --with openpyxl python ua_v2_cal.py <tasks_root>
"""

import json
import sys
from pathlib import Path

from ua_v2_gen import V2, Contradiction, build_task
from ua_pack import synth

S = []

S.append(V2(
    slug="ua-agro-supply-v2",
    title="Перевірка контрагента: суперечності між реєстрами (агротрейдинг)",
    deal="рамковий договір поставки зерна з авансом 35% (4 200 000 грн)",
    policy="аванс понад 20% не допускається контрагентам з відкритими "
           "виконавчими провадженнями на суму понад 2 000 000 грн",
    policy_second="аванс не допускається без підтвердження фінансового стану "
                  "за останній звітний рік",
    absent_doc="фінансова звітність за останній звітний рік",
    target='ТОВ "СТЕПОВА НИВА ТРЕЙД"', target_code=synth("43456781"),
    status="зареєстровано", address="м. Миколаїв, вул. Портова, 27",
    capital=250_000,
    parent='ТОВ "ХОЛДИНГ ПІВДЕНЬ АГРО"', parent_code=synth("44567892"),
    ubo="КРАВЧУК ІГОР СТЕПАНОВИЧ",
    related='ТОВ "ЕЛЕВАТОР ПІВДЕНЬ"', related_code=synth("45678903"),
    proceedings=[
        ("72100455", 'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ"', 3_450_000, "12.01.2025", "відкрито"),
        ("72455018", "ГУ ДПС у Миколаївській обл.", 1_180_000, "03.03.2025", "відкрито"),
        ("70012388", 'ТОВ "АГРОХІМ СЕРВІС"', 265_000, "19.05.2024", "завершено"),
    ],
    cases=[
        ("915/0331/25", "відповідач", 'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ"', 3_150_000, "08.01.2025"),
        ("915/0870/24", "позивач", 'ТОВ "ПОРТ СЕРВІС"', 640_000, "22.04.2024"),
    ],
    contradictions=[
        Contradiction("the amount of the ЕЛЕВАТОР ПІВДЕНЬ debt",
                      "the enforcement register (72100455)", "3 450 000 UAH",
                      "the court docket (915/0331/25)", "3 150 000 UAH",
                      "they are one dispute at two stages and the 300 000 UAH "
                      "difference must be flagged rather than resolved silently."),
        Contradiction("the counterparty's registered status",
                      "the ЄДР extract", "'зареєстровано'",
                      "the enforcement register header for 72455018",
                      "'боржник у процедурі примусового стягнення'",
                      "the register status does not by itself show the "
                      "counterparty is free of enforcement.",
                      inject="Відмітка до ВП 72455018: боржник у процедурі "
                             "примусового стягнення."),
        Contradiction("the date the ЕЛЕВАТОР ПІВДЕНЬ claim arose",
                      "the enforcement register", "12.01.2025",
                      "the court docket", "08.01.2025",
                      "the court decision preceded enforcement, so these are "
                      "sequential stages of the same claim."),
    ],
    open_total=4_630_000,
    join_text="The largest claim against the counterparty is brought by "
              "ТОВ \"ЕЛЕВАТОР ПІВДЕНЬ\", which shares the counterparty's ultimate "
              "beneficial owner.",
    sequence_text="the award in case 915/0331/25 preceded the opening of "
                  "enforcement 72100455, so the two are the same claim moving to "
                  "enforcement rather than two separate debts.",
))

S.append(V2(
    slug="ua-transport-fleet-v2",
    title="Перевірка контрагента: суперечності між реєстрами (перевезення)",
    deal="договір перевезення з депозитом 2 000 000 грн",
    policy="депозит не допускається, якщо відкриті виконавчі провадження "
           "перевищують статутний капітал контрагента",
    policy_second="депозит не допускається без чинного договору страхування "
                  "відповідальності перевізника",
    absent_doc="договір страхування відповідальності перевізника",
    target='ТОВ "АВТОПАРК МАГІСТРАЛЬ"', target_code=synth("45123458"),
    status="зареєстровано", address="м. Дніпро, вул. Криворізька, 41",
    capital=3_000_000,
    parent='ТОВ "ТРАНС АКТИВ ХОЛДИНГ"', parent_code=synth("45234569"),
    ubo="ЛИСЕНКО ВАДИМ ОЛЕКСАНДРОВИЧ",
    related='АТ "БАНК КРЕДИТ ЦЕНТР"', related_code=synth("45345671"),
    proceedings=[
        ("72110977", 'АТ "БАНК КРЕДИТ ЦЕНТР"', 8_400_000, "11.11.2024", "відкрито"),
        ("73020144", 'ТОВ "ШИНОСЕРВІС"', 195_000, "02.04.2025", "відкрито"),
        ("70455201", 'ТОВ "СТО ПАРТНЕР"', 88_000, "17.06.2024", "завершено"),
    ],
    cases=[
        ("904/1033/24", "відповідач", 'АТ "БАНК КРЕДИТ ЦЕНТР"', 8_150_000, "28.10.2024"),
        ("904/0512/24", "позивач", 'ТОВ "АВТОЗАПЧАСТИНИ"', 310_000, "14.03.2024"),
    ],
    contradictions=[
        Contradiction("the amount owed to the bank",
                      "the enforcement register (72110977)", "8 400 000 UAH",
                      "the court docket (904/1033/24)", "8 150 000 UAH",
                      "these are one claim at two stages, differing by "
                      "250 000 UAH, which must be flagged."),
        Contradiction("the number of vehicles",
                      "the ЄДР extract activity description", "14 units",
                      "the enforcement register note on 72110977", "11 units",
                      "the fleet size is not reliably established on this record.",
                      inject="Основний вид діяльності: вантажні перевезення, "
                             "автопарк 14 одиниць. Відмітка до ВП 72110977: "
                             "під арештом 11 одиниць транспортних засобів."),
        Contradiction("the counterparty's share capital relative to exposure",
                      "the ЄДР extract", "3 000 000 UAH",
                      "the sum of the open proceedings in the enforcement "
                      "register",
                      "8 595 000 UAH (which the memo must compute)",
                      "open enforcement exceeds share capital, so the policy "
                      "threshold is breached."),
    ],
    open_total=8_595_000,
    join_text="The largest creditor is also a company sharing the counterparty's "
              "ultimate beneficial owner.",
    sequence_text="the court award of 28.10.2024 preceded the enforcement opened "
                  "on 11.11.2024, so they are the same claim progressing.",
))

S.append(V2(
    slug="ua-food-tax-v2",
    title="Перевірка контрагента: суперечності між реєстрами (харчова галузь)",
    deal="договір поставки сировини на 4 500 000 грн з відстрочкою 60 днів",
    policy="відстрочка не допускається контрагентам з відкритими виконавчими "
           "провадженнями на суму понад 1 500 000 грн",
    policy_second="відстрочка не допускається без підтвердження статусу "
                  "платника ПДВ",
    absent_doc="витяг з реєстру платників ПДВ",
    target='ТОВ "СМАК ПРОДУКТ ВИРОБНИЦТВО"', target_code=synth("45234569"),
    status="зареєстровано", address="м. Вінниця, вул. Хмельницьке шосе, 12",
    capital=600_000,
    parent='ТОВ "ФУД ІНВЕСТ ГРУП"', parent_code=synth("45345671"),
    ubo="КОВАЛЬЧУК ІРИНА МИКОЛАЇВНА",
    related='ТОВ "АГРОСИРОВИНА ОПТ"', related_code=synth("45456781"),
    proceedings=[
        ("73330566", "ГУ ДПС у Вінницькій обл.", 1_920_000, "24.03.2025", "відкрито"),
        ("73441002", 'ТОВ "АГРОСИРОВИНА ОПТ"', 760_000, "08.04.2025", "відкрито"),
        ("71220455", 'ТОВ "ТАРА ПЛЮС"', 143_000, "02.02.2024", "завершено"),
    ],
    cases=[
        ("902/0477/25", "позивач", "ГУ ДПС у Вінницькій обл.", 0, "09.04.2025"),
        ("902/0810/25", "відповідач", 'ТОВ "АГРОСИРОВИНА ОПТ"', 690_000, "21.03.2025"),
    ],
    contradictions=[
        Contradiction("the amount of the АГРОСИРОВИНА ОПТ claim",
                      "the enforcement register (73441002)", "760 000 UAH",
                      "the court docket (902/0810/25)", "690 000 UAH",
                      "one claim at two stages, differing by 70 000 UAH."),
        Contradiction("the tax position",
                      "the enforcement register (73330566, creditor ГУ ДПС)",
                      "1 920 000 UAH being enforced",
                      "the court docket (902/0477/25, counterparty as claimant)",
                      "the counterparty is challenging that very assessment",
                      "the tax liability is disputed and not final, so it cannot "
                      "be treated as a settled debt."),
        Contradiction("who is suing whom",
                      "case 902/0477/25", "counterparty is claimant",
                      "case 902/0810/25", "counterparty is respondent",
                      "only the second is exposure; the first must not be counted "
                      "against the counterparty."),
    ],
    open_total=2_680_000,
    join_text="One of the two open claims is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the counterparty began challenging the tax assessment "
                  "(09.04.2025) only after enforcement had already been opened "
                  "on it (24.03.2025).",
))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    for s in S:
        t = build_task(s, root)
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        print(f"{t.relative_to(root)}: {n} criteria, "
              f"{len(list((t/'documents').iterdir()))} documents")


if __name__ == "__main__":
    main()
