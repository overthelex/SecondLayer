#!/usr/bin/env python3
"""The final 7 register-screening scenarios, completing the v2 rebuild.

Contradiction types are varied on purpose across the whole family, so the pack
does not rest on one trick: amount mismatch, status mismatch, date mismatch,
role mismatch, count mismatch, scope mismatch (permit vs contract), authority
mismatch (proxy cap vs contract value), and ownership that closes on itself.

Usage:
    uv run --with python-docx --with openpyxl python ua_v2_rest2.py <tasks_root>
"""

import json
import sys
from pathlib import Path

from ua_v2_gen import V2, Contradiction, build_task
from ua_pack import synth

S = []

S.append(V2(
    slug="ua-chemicals-permit-v2",
    title="Перевірка контрагента: обсяг дозволу і предмет договору (хімія)",
    deal="договір на перевезення та зберігання небезпечних речовин",
    policy="співпраця не допускається за відкритих виконавчих проваджень понад "
           "200 000 грн",
    policy_second="контрагент повинен мати чинний дозвіл, що покриває ВЕСЬ "
                  "предмет договору",
    absent_doc="документ, що підтверджує право на зберігання небезпечних речовин",
    target='ТОВ "ХІМТРАНС ЛОГІСТИКА"', target_code=synth("45456781"),
    status="зареєстровано", address="м. Черкаси, вул. Промислова, 5",
    capital=1_200_000,
    parent='ТОВ "ХІМ АКТИВ ІНВЕСТ"', parent_code=synth("45567892"),
    ubo="МОРОЗ АНДРІЙ ВІКТОРОВИЧ",
    related='ТОВ "ТАРА СЕРВІС"', related_code=synth("45678903"),
    proceedings=[
        ("72880199", 'ТОВ "ТАРА СЕРВІС"', 260_000, "13.03.2025", "відкрито"),
        ("73110488", 'ТОВ "ПАЛИВО РЕГІОН"', 118_000, "21.04.2025", "відкрито"),
        ("70990122", 'ТОВ "РЕМСЕРВІС"', 64_000, "09.10.2023", "завершено"),
    ],
    cases=[
        ("925/0288/25", "відповідач", 'ТОВ "ТАРА СЕРВІС"', 244_000, "27.02.2025"),
        ("925/0641/24", "позивач", 'ТОВ "ЗАМОВНИК ХІМ"', 390_000, "12.06.2024"),
    ],
    contradictions=[
        Contradiction("what the permit actually covers",
                      "the permit, whose scope line", "carriage only",
                      "the client's request, whose subject",
                      "carriage AND storage",
                      "the permit does not cover storage, so the contract as "
                      "proposed exceeds what the counterparty is authorised to do.",
                      inject="Дозвіл № ДН-4471 від 02.03.2023, чинний до "
                             "02.03.2026. Обсяг дозволу: ПЕРЕВЕЗЕННЯ небезпечних "
                             "речовин. Зберігання небезпечних речовин дозволом НЕ "
                             "охоплюється."),
        Contradiction("the amount of the ТАРА СЕРВІС claim",
                      "the enforcement register (72880199)", "260 000 UAH",
                      "the court docket (925/0288/25)", "244 000 UAH",
                      "one claim at two stages, differing by 16 000 UAH."),
        Contradiction("whether the permit is a problem of validity or of scope",
                      "the permit validity date", "чинний до 02.03.2026",
                      "the permit scope line", "carriage only",
                      "the permit is current, so the defect is scope and not "
                      "expiry, and saying it expired would be wrong."),
    ],
    open_total=378_000,
    join_text="The larger open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the permit (02.03.2023) predates the proposed contract, so its "
                  "scope was knowable before negotiations began.",
))

S.append(V2(
    slug="ua-counterparty-tax-v2",
    title="Перевірка контрагента: подвійний облік податкового боргу",
    deal="рамковий договір поставки з авансом 30%",
    policy="аванс не допускається за відкритих виконавчих проваджень понад "
           "2 000 000 грн",
    policy_second="аванс не допускається без довідки про відсутність "
                  "податкового боргу",
    absent_doc="довідка про відсутність податкового боргу",
    target='ТОВ "ГРАНІТ-ІНВЕСТ ЮА"', target_code=synth("43456780"),
    status="в стані припинення", address="м. Кривий Ріг, вул. Каштанова, 3",
    capital=100_000,
    parent='ТОВ "ПІВДЕННА ХОЛДИНГОВА ГРУПА"', parent_code=synth("44567891"),
    ubo="ЗАЛІСНИЙ ОСТАП ВАЛЕРІЙОВИЧ",
    related='ТОВ "ДНІПРОЕНЕРГОЗБУТ"', related_code=synth("45789014"),
    proceedings=[
        ("71204588", 'ТОВ "ДНІПРОЕНЕРГОЗБУТ"', 1_840_000, "14.03.2024", "відкрито"),
        ("71880341", "ГУ ДПС у Дніпропетровській обл.", 962_400, "07.06.2024", "відкрито"),
        ("69551027", 'ТОВ "СПЕЦМОНТАЖ ПЛЮС"', 145_000, "22.08.2023", "завершено"),
    ],
    cases=[
        ("904/1188/24", "відповідач", 'ТОВ "ДНІПРОЕНЕРГОЗБУТ"', 1_755_000, "05.02.2024"),
        ("904/0912/23", "позивач", 'ТОВ "ПІДРЯДНИК"', 320_000, "14.04.2023"),
    ],
    contradictions=[
        Contradiction("how many separate tax liabilities exist",
                      "the tax certificate", "962 400 UAH of tax debt",
                      "the enforcement register (71880341, creditor ГУ ДПС)",
                      "962 400 UAH being enforced",
                      "these are one liability at two stages and must be counted "
                      "once, not added together.",
                      inject="Довідка про стан розрахунків з бюджетом: загальна "
                             "сума податкового боргу 962 400,00 грн, передано до "
                             "примусового стягнення."),
        Contradiction("the amount of the ДНІПРОЕНЕРГОЗБУТ claim",
                      "the enforcement register (71204588)", "1 840 000 UAH",
                      "the court docket (904/1188/24)", "1 755 000 UAH",
                      "one claim at two stages, differing by 85 000 UAH."),
        Contradiction("whether the counterparty is an operating company",
                      "the ЄДР status line", "'в стані припинення'",
                      "the client's request, which assumes an ongoing supplier",
                      "a framework supply agreement",
                      "a company in termination cannot be treated as an ongoing "
                      "supplier, whatever its trading history."),
    ],
    open_total=2_802_400,
    join_text="The largest open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the court award (05.02.2024) preceded the enforcement "
                  "(14.03.2024), so they are one claim progressing.",
))

S.append(V2(
    slug="ua-energy-tenders-v2",
    title="Перевірка контрагента: історія дискваліфікацій (енергетика)",
    deal="залучення субпідрядника за державним контрактом",
    policy="субпідрядник не залучається за відкритих виконавчих проваджень "
           "понад 500 000 грн",
    policy_second="субпідрядник не може мати дискваліфікацій у публічних "
                  "закупівлях за останні три роки",
    absent_doc="довідка замовника про відсутність дискваліфікацій",
    target='ТОВ "ЕНЕРГО МОНТАЖ СИСТЕМИ"', target_code=synth("45345671"),
    status="зареєстровано", address="м. Полтава, вул. Європейська, 60",
    capital=450_000,
    parent='ТОВ "ЕНЕРГО ІНВЕСТ ПАРТНЕРС"', parent_code=synth("45456781"),
    ubo="ШЕВЧЕНКО ОЛЕГ ПЕТРОВИЧ",
    related='ТОВ "КАБЕЛЬ ПОСТАЧ"', related_code=synth("45567892"),
    proceedings=[
        ("72660322", 'ТОВ "КАБЕЛЬ ПОСТАЧ"', 780_000, "19.02.2025", "відкрито"),
        ("73200155", 'ТОВ "МОНТАЖ СЕРВІС"', 132_000, "30.04.2025", "відкрито"),
        ("70770233", 'ТОВ "ІНСТРУМЕНТ"', 58_000, "05.07.2023", "завершено"),
    ],
    cases=[
        ("917/0388/25", "відповідач", 'ТОВ "КАБЕЛЬ ПОСТАЧ"', 742_000, "05.02.2025"),
        ("917/0155/24", "позивач", 'ТОВ "ЗАМОВНИК ЕНЕРГО"', 410_000, "18.01.2024"),
    ],
    contradictions=[
        Contradiction("how many tender disqualifications there are",
                      "the tender history note", "three disqualifications",
                      "the client's assumption of a clean record",
                      "none mentioned in the request",
                      "the three-year look-back is breached, so the "
                      "subcontractor cannot be engaged.",
                      inject="Історія участі у публічних закупівлях: "
                             "дискваліфіковано у тендерах UA-2023-04-11-000312, "
                             "UA-2024-08-02-004517 та UA-2025-01-23-000889."),
        Contradiction("the amount of the КАБЕЛЬ ПОСТАЧ claim",
                      "the enforcement register (72660322)", "780 000 UAH",
                      "the court docket (917/0388/25)", "742 000 UAH",
                      "one claim at two stages, differing by 38 000 UAH."),
        Contradiction("which cases count against the counterparty",
                      "case 917/0388/25, where it is respondent",
                      "742 000 UAH against it",
                      "case 917/0155/24, where it is claimant",
                      "410 000 UAH in its favour",
                      "only the first is exposure; adding the second overstates "
                      "the risk."),
    ],
    open_total=912_000,
    join_text="The largest open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the most recent disqualification (23.01.2025) falls inside the "
                  "three-year window, so the bar is current rather than historic.",
))

S.append(V2(
    slug="ua-equipment-authority-v2",
    title="Перевірка контрагента: повноваження підписанта (обладнання)",
    deal="договір на 9 800 000 грн з підписанням за довіреністю",
    policy="договори не укладаються за відкритих виконавчих проваджень понад "
           "300 000 грн",
    policy_second="договори понад 5 000 000 грн підписуються лише особою, "
                  "повноваження якої підтверджені без обмежень",
    absent_doc="рішення загальних зборів учасників про схвалення правочину",
    target='ТОВ "ТЕХНО ПОСТАЧ ІНДУСТРІЯ"', target_code=synth("45678903"),
    status="зареєстровано", address="м. Кропивницький, вул. Велика Перспективна, 30",
    capital=750_000,
    parent='ТОВ "ІНДАСТРІ КАПІТАЛ ГРУП"', parent_code=synth("45789014"),
    ubo="ДАНИЛЮК ПЕТРО СЕРГІЙОВИЧ",
    related='ТОВ "КОМПЛЕКТ СЕРВІС"', related_code=synth("45012347"),
    proceedings=[
        ("73050277", 'ТОВ "КОМПЛЕКТ СЕРВІС"', 415_000, "11.04.2025", "відкрито"),
        ("73390811", 'ТОВ "СКЛАД ОРЕНДА"', 96_000, "26.05.2025", "відкрито"),
    ],
    cases=[
        ("912/0644/24", "позивач", 'ТОВ "КОНТРАГЕНТ БУД"', 4_100_000, "17.09.2024"),
        ("912/0901/25", "відповідач", 'ТОВ "КОМПЛЕКТ СЕРВІС"', 390_000, "28.03.2025"),
    ],
    contradictions=[
        Contradiction("what the signatory may sign",
                      "the power of attorney cap", "5 000 000 UAH per transaction",
                      "the proposed contract value", "9 800 000 UAH",
                      "the proxy does not authorise this contract, so signature by "
                      "that person would exceed authority.",
                      inject="Довіреність від 14.01.2025 на ім'я КРАВЕЦЬ ОКСАНА "
                             "ЛЕОНІДІВНА: право укладати договори на суму, що не "
                             "перевищує 5 000 000,00 грн за одним правочином. "
                             "Статутом правочини понад 5 000 000,00 грн віднесено "
                             "до компетенції загальних зборів учасників."),
        Contradiction("the amount of the КОМПЛЕКТ СЕРВІС claim",
                      "the enforcement register (73050277)", "415 000 UAH",
                      "the court docket (912/0901/25)", "390 000 UAH",
                      "one claim at two stages, differing by 25 000 UAH."),
        Contradiction("who bears the authority risk",
                      "case 912/0644/24, where the counterparty itself sued to "
                      "invalidate a contract", "as claimant",
                      "a reading that treats every listed case as exposure",
                      "an apparent 4 100 000 UAH liability",
                      "that case is the counterparty's own claim, and it shows the "
                      "authority risk is demonstrated rather than theoretical."),
    ],
    open_total=511_000,
    join_text="The larger open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the power of attorney (14.01.2025) predates the proposed "
                  "contract, so its cap was knowable in advance.",
))

S.append(V2(
    slug="ua-it-address-v2",
    title="Перевірка контрагента: масова реєстрація за адресою (IT)",
    deal="договір аутсорсингу розробки на 6 200 000 грн на рік",
    policy="співпраця не допускається за відкритих виконавчих проваджень понад "
           "250 000 грн",
    policy_second="контрагент має підтвердити фактичне місцезнаходження, якщо за "
                  "адресою реєстрації зареєстровано понад 10 юридичних осіб",
    absent_doc="документ про фактичне місцезнаходження (договір оренди офісу)",
    target='ТОВ "КОД ФАБРИКА ЮА"', target_code=synth("45012347"),
    status="зареєстровано", address="м. Київ, вул. Хрещатик, 22, оф. 401",
    capital=100_000,
    parent='ТОВ "ДІДЖИТАЛ КАПІТАЛ"', parent_code=synth("45123458"),
    ubo="ПАВЛЕНКО ДМИТРО ІГОРОВИЧ",
    related='ТОВ "ОФІС ОРЕНДА ЦЕНТР"', related_code=synth("45234569"),
    proceedings=[
        ("73510288", 'ТОВ "ОФІС ОРЕНДА ЦЕНТР"', 340_000, "07.05.2025", "відкрито"),
        ("73620144", 'ТОВ "ХОСТИНГ ПРО"', 72_000, "02.06.2025", "відкрито"),
    ],
    cases=[
        ("910/0955/25", "відповідач", 'ТОВ "ОФІС ОРЕНДА ЦЕНТР"', 318_000, "21.04.2025"),
        ("910/0330/24", "позивач", 'ТОВ "ЗАМОВНИК СОФТ"', 155_000, "11.02.2024"),
    ],
    contradictions=[
        Contradiction("who the counterparty is in arrears to",
                      "the enforcement register, naming the creditor",
                      "ТОВ \"ОФІС ОРЕНДА ЦЕНТР\"",
                      "the address note, naming the operator of the registered "
                      "office", "the same company",
                      "the counterparty is being pursued by its own landlord, so "
                      "its registered address is not secure.",
                      inject="Відмітка за адресою: м. Київ, вул. Хрещатик, 22, "
                             "оф. 401 зареєстровано 47 юридичних осіб. "
                             "Орендодавцем приміщення є ТОВ \"ОФІС ОРЕНДА ЦЕНТР\"."),
        Contradiction("the amount of the landlord claim",
                      "the enforcement register (73510288)", "340 000 UAH",
                      "the court docket (910/0955/25)", "318 000 UAH",
                      "one claim at two stages, differing by 22 000 UAH."),
        Contradiction("how many companies share the address",
                      "the address note", "47 companies",
                      "the client's policy threshold", "10 companies",
                      "the threshold is exceeded almost fivefold, so proof of "
                      "actual location is required before contracting."),
    ],
    open_total=412_000,
    join_text="The larger open claim is brought by a company sharing the "
              "counterparty's ultimate beneficial owner.",
    sequence_text="the landlord's claim (21.04.2025) preceded its enforcement "
                  "(07.05.2025), so the counterparty's tenancy was already in "
                  "dispute before the client's enquiry.",
))

S.append(V2(
    slug="ua-logistics-nominee-v2",
    title="Перевірка контрагента: ознаки номінальної структури (логістика)",
    deal="аутсорс логістики з місячним лімітом 1 800 000 грн",
    policy="ліміт не встановлюється за відкритих виконавчих проваджень понад "
           "300 000 грн",
    policy_second="контрагентам зі статутним капіталом менше 50 000 грн місячний "
                  "ліміт не може перевищувати 300 000 грн",
    absent_doc="фінансова звітність за перший рік діяльності",
    target='ТОВ "ШЛЯХ ЕКСПРЕС ЛОГІСТИК"', target_code=synth("43567892"),
    status="зареєстровано", address="м. Одеса, вул. Базарна, 5, оф. 12",
    capital=1_000,
    parent='ТОВ "КОМЕРЦ ІНВЕСТ ГРУП"', parent_code=synth("44678903"),
    ubo="МЕЛЬНИЧУК ОЛЕНА ПЕТРІВНА",
    related='ТОВ "КАРГО ЛАЙН ЮА"', related_code=synth("45123458"),
    proceedings=[
        ("73220100", 'ТОВ "ПАЛИВО ОПТ"', 410_000, "14.04.2025", "відкрито"),
        ("73480266", 'ТОВ "КАРГО ЛАЙН ЮА"', 95_000, "22.05.2025", "відкрито"),
    ],
    cases=[
        ("916/0221/25", "відповідач", 'ТОВ "ПАЛИВО ОПТ"', 386_000, "02.04.2025"),
        ("916/0044/25", "позивач", 'ТОВ "ЗАМОВНИК ЛОГ"', 120_000, "15.01.2025"),
    ],
    contradictions=[
        Contradiction("the scale the counterparty can support",
                      "the ЄДР share capital", "1 000 UAH",
                      "the client's proposed monthly limit", "1 800 000 UAH",
                      "the limit is 1800 times the capital, and the client's own "
                      "policy caps it at 300 000 UAH."),
        Contradiction("how independent the counterparty is",
                      "the ЄДР extract, which shows one company",
                      "a single entity",
                      "the address note", "five companies at one address with the "
                      "same director",
                      "the structure has the marks of a nominee arrangement rather "
                      "than an operating business.",
                      inject="Відмітка за адресою: за адресою м. Одеса, "
                             "вул. Базарна, 5, оф. 12 зареєстровано ще чотири "
                             "юридичні особи, керівником і кінцевим бенефіціарним "
                             "власником яких є МЕЛЬНИЧУК ОЛЕНА ПЕТРІВНА. Дата "
                             "державної реєстрації товариства: 27.11.2024."),
        Contradiction("the amount of the ПАЛИВО ОПТ claim",
                      "the enforcement register (73220100)", "410 000 UAH",
                      "the court docket (916/0221/25)", "386 000 UAH",
                      "one claim at two stages, differing by 24 000 UAH."),
    ],
    open_total=505_000,
    join_text="One open claim is brought by a company sharing the counterparty's "
              "ultimate beneficial owner.",
    sequence_text="the company was registered on 27.11.2024, only months before "
                  "the first enforcement against it, so it has almost no trading "
                  "history.",
))

S.append(V2(
    slug="ua-media-ownership-v2",
    title="Перевірка контрагента: кругове володіння (медіа)",
    deal="рамковий договір на медіа-закупівлю з передоплатою",
    policy="передоплата не допускається за відкритих виконавчих проваджень понад "
           "400 000 грн",
    policy_second="передоплата не допускається контрагентам, у яких не розкрито "
                  "кінцевого бенефіціарного власника - фізичну особу",
    absent_doc="структура власності з розкриттям фізичної особи-власника",
    target='ТОВ "МЕДІА ПЛАН ГРУП"', target_code=synth("45567892"),
    status="зареєстровано", address="м. Київ, вул. Антоновича, 176",
    capital=200_000,
    parent='ТОВ "АДВЕРТАЙЗ ХОЛДИНГ"', parent_code=synth("45678903"),
    ubo="не визначено (фізичну особу не розкрито)",
    related='ТОВ "МЕДІА КАПІТАЛ"', related_code=synth("45789014"),
    proceedings=[
        ("73440877", 'ТОВ "ПРИНТ ЦЕНТР"', 520_000, "28.04.2025", "відкрито"),
        ("73580199", 'ТОВ "МЕДІА КАПІТАЛ"', 88_000, "19.05.2025", "відкрито"),
    ],
    cases=[
        ("910/1122/25", "відповідач", 'ТОВ "ПРИНТ ЦЕНТР"', 495_000, "14.04.2025"),
        ("910/0700/24", "позивач", 'ТОВ "РЕКЛАМОДАВЕЦЬ"', 210_000, "03.06.2024"),
    ],
    contradictions=[
        Contradiction("whether a beneficial owner is disclosed",
                      "the ЄДР extract, whose UBO line",
                      "'не визначено'",
                      "the ownership note, which traces the chain",
                      "back to the counterparty itself",
                      "the chain is circular, so no natural person is disclosed "
                      "and the client's policy bars prepayment.",
                      inject="Структура власності: ТОВ \"АДВЕРТАЙЗ ХОЛДИНГ\" на "
                             "100% належить ТОВ \"МЕДІА КАПІТАЛ\", яке, у свою "
                             "чергу, на 100% належить ТОВ \"МЕДІА ПЛАН ГРУП\". "
                             "Кінцевого бенефіціарного власника - фізичну особу "
                             "не розкрито."),
        Contradiction("the amount of the ПРИНТ ЦЕНТР claim",
                      "the enforcement register (73440877)", "520 000 UAH",
                      "the court docket (910/1122/25)", "495 000 UAH",
                      "one claim at two stages, differing by 25 000 UAH."),
        Contradiction("whether the second creditor is independent",
                      "the enforcement register, naming the creditor",
                      "ТОВ \"МЕДІА КАПІТАЛ\"",
                      "the ownership note, which places that company inside the "
                      "same circle", "part of the counterparty's own chain",
                      "that claim is intra-group and cannot be treated as an "
                      "arm's-length debt."),
    ],
    open_total=608_000,
    join_text="One of the open claims is brought by a company inside the "
              "counterparty's own ownership chain.",
    sequence_text="the award (14.04.2025) preceded its enforcement (28.04.2025), "
                  "so they are one claim progressing.",
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
