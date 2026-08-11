#!/usr/bin/env python3
"""Second batch of register-screening scenarios (7), completing the 20-task pack.

Same design rule as batch one: the truth of every criterion is contained in the
supplied documents, so correctness is a matter of internal consistency rather
than legal research.

Usage:
    uv run --with python-docx --with openpyxl python ua_scenarios2.py <tasks_root>
"""

import json
import sys
from pathlib import Path

from ua_pack import CourtCase, Proceeding, Scenario, build_task, synth

S = []

S.append(Scenario(
    slug="ua-it-outsourcing-address-mismatch",
    title="Перевірка контрагента: розбіжність адрес і масова реєстрація",
    industry="розробка програмного забезпечення",
    deal="укласти договір аутсорсингу розробки на 6 200 000 грн на рік",
    target='ТОВ "КОД ФАБРИКА ЮА"', target_code=synth("45012347"),
    status="зареєстровано", registered="19.09.2022",
    address="м. Київ, вул. Хрещатик, 22, оф. 401", capital=100_000,
    parent='ТОВ "ДІДЖИТАЛ КАПІТАЛ"', parent_code=synth("45123458"),
    parent_share=100, ubo="ПАВЛЕНКО ДМИТРО ІГОРОВИЧ",
    director="ПАВЛЕНКО ДМИТРО ІГОРОВИЧ",
    proceedings=[
        Proceeding("73510288", 'ТОВ "ОФІС ОРЕНДА ЦЕНТР"', 340_000, "07.05.2025", "відкрито"),
    ],
    cases=[
        CourtCase("910/0955/25", "відповідач", "стягнення орендної плати", 340_000, "21.04.2025"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="контрагент має підтвердити фактичне місцезнаходження, "
                  "якщо за адресою реєстрації зареєстровано понад 10 юридичних осіб",
    policy_trigger="потрібне підтвердження фактичного місцезнаходження",
    hidden_link="the landlord suing the counterparty for unpaid rent in proceeding "
                "73510288 is the operator of the registered address itself, and 47 "
                "other companies are registered there, so the registered office is a "
                "mail-drop the counterparty is being evicted from.",
    hidden_detail="За адресою м. Київ, вул. Хрещатик, 22, оф. 401 зареєстровано "
                  "47 юридичних осіб. Орендодавцем приміщення є "
                  'ТОВ "ОФІС ОРЕНДА ЦЕНТР", код ЄДРПОУ 45234569',
    extra_criteria=[
        ("Counts the companies at the registered address",
         "PASS if the memo states that 47 legal entities are registered at the "
         "counterparty's address. FAIL if it gives a different number or misses the "
         "mass registration.", "oracle"),
        ("Connects the creditor to the address",
         "PASS if the memo identifies that the creditor in proceeding 73510288 is "
         "the operator of the registered address, so the counterparty is in arrears "
         "to its own landlord. FAIL if it does not make the connection.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-transport-fleet-pledged",
    title="Перевірка контрагента: конкуренція обтяжень на транспортний парк",
    industry="автомобільні перевезення",
    deal="укласти договір перевезення з депозитом 2 000 000 грн",
    target='ТОВ "АВТОПАРК МАГІСТРАЛЬ"', target_code=synth("45123458"),
    status="зареєстровано", registered="03.07.2014",
    address="м. Дніпро, вул. Криворізька, 41", capital=3_000_000,
    parent='ТОВ "ТРАНС АКТИВ ХОЛДИНГ"', parent_code=synth("45234569"),
    parent_share=100, ubo="ЛИСЕНКО ВАДИМ ОЛЕКСАНДРОВИЧ",
    director="ЛИСЕНКО ВАДИМ ОЛЕКСАНДРОВИЧ",
    proceedings=[
        Proceeding("72110977", 'АТ "БАНК КРЕДИТ ЦЕНТР"', 8_400_000, "11.11.2024", "відкрито"),
        Proceeding("73020144", 'ТОВ "ШИНОСЕРВІС"', 195_000, "02.04.2025", "відкрито"),
        Proceeding("70455201", 'ТОВ "СТО ПАРТНЕР"', 88_000, "17.06.2024", "завершено"),
    ],
    cases=[
        CourtCase("904/1033/24", "відповідач", "звернення стягнення на предмет застави", 8_400_000, "28.10.2024"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="депозит не допускається, якщо основні засоби контрагента "
                  "перебувають у заставі на суму, що перевищує статутний капітал",
    policy_trigger="депозит 2 000 000 грн не допускається",
    hidden_link="the entire vehicle fleet is pledged to АТ \"БАНК КРЕДИТ ЦЕНТР\" for "
                "8 400 000 UAH, the same creditor that has an open enforcement "
                "proceeding and is seeking to enforce against the pledged property, "
                "so the assets the client would rely on are already spoken for.",
    hidden_detail="Транспортні засоби товариства (14 одиниць) перебувають у "
                  'заставі на користь АТ "БАНК КРЕДИТ ЦЕНТР", код ЄДРПОУ 45345671, '
                  "на суму 8 400 000,00 грн згідно з договором застави від 09.08.2023",
    extra_criteria=[
        ("Identifies that the fleet is pledged",
         "PASS if the memo states that the counterparty's 14 vehicles are pledged to "
         "АТ \"БАНК КРЕДИТ ЦЕНТР\" for 8 400 000 UAH. FAIL if it does not report the "
         "pledge.", "oracle"),
        ("Compares the pledge to the share capital",
         "PASS if the memo notes that the pledged amount of 8 400 000 UAH exceeds "
         "the 3 000 000 UAH share capital. FAIL if it does not make the comparison "
         "the client's policy requires.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-food-tax-invoice-blocking",
    title="Перевірка контрагента: зупинення реєстрації податкових накладних",
    industry="харчова промисловість",
    deal="укласти договір поставки сировини на 4 500 000 грн",
    target='ТОВ "СМАК ПРОДУКТ ВИРОБНИЦТВО"', target_code=synth("45234569"),
    status="зареєстровано", registered="21.05.2019",
    address="м. Вінниця, вул. Хмельницьке шосе, 12", capital=600_000,
    parent='ТОВ "ФУД ІНВЕСТ ГРУП"', parent_code=synth("45345671"),
    parent_share=100, ubo="КОВАЛЬЧУК ІРИНА МИКОЛАЇВНА",
    director="КОВАЛЬЧУК ІРИНА МИКОЛАЇВНА",
    proceedings=[
        Proceeding("73330566", "ГУ ДПС у Вінницькій обл.", 1_920_000, "24.03.2025", "відкрито"),
    ],
    cases=[
        CourtCase("902/0477/25", "позивач", "оскарження рішення про відповідність критеріям ризиковості", 0, "09.04.2025"),
    ],
    tax_debt=1_920_000, tax_date="01.06.2025",
    client_policy="не допускається укладення договорів з контрагентами, "
                  "включеними до переліку ризикових платників податку",
    policy_trigger="укладення договору не допускається",
    hidden_link="the counterparty was classified as a risky taxpayer on 18.03.2025 "
                "and its VAT invoices are blocked from registration, which both "
                "engages the client's policy and means the client would not receive "
                "a VAT credit on the supply.",
    hidden_detail="Товариство включено до переліку платників податку, які "
                  "відповідають критеріям ризиковості, рішенням від 18.03.2025. "
                  "Реєстрацію податкових накладних зупинено.",
    extra_criteria=[
        ("Identifies the risky-taxpayer classification",
         "PASS if the memo states that the counterparty was classified as a risky "
         "taxpayer on 18.03.2025 and that registration of its VAT invoices is "
         "blocked. FAIL if it misses this.", "oracle"),
        ("Explains the commercial consequence for the client",
         "PASS if the memo explains that blocked VAT invoices mean the client would "
         "not obtain a VAT credit on the supply. FAIL if it reports the "
         "classification without its consequence for the client.", "expert"),
        ("Notes the pending challenge",
         "PASS if the memo notes that the counterparty has challenged the "
         "classification in case 902/0477/25, in which it is the claimant. FAIL if "
         "it treats that case as a claim against the counterparty.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-energy-prozorro-disqualification",
    title="Перевірка контрагента: історія дискваліфікацій у публічних закупівлях",
    industry="енергетичне обладнання",
    deal="залучити контрагента як субпідрядника за державним контрактом",
    target='ТОВ "ЕНЕРГО МОНТАЖ СИСТЕМИ"', target_code=synth("45345671"),
    status="зареєстровано", registered="08.10.2018",
    address="м. Полтава, вул. Європейська, 60", capital=450_000,
    parent='ТОВ "ЕНЕРГО ІНВЕСТ ПАРТНЕРС"', parent_code=synth("45456781"),
    parent_share=100, ubo="ШЕВЧЕНКО ОЛЕГ ПЕТРОВИЧ",
    director="ШЕВЧЕНКО ОЛЕГ ПЕТРОВИЧ",
    proceedings=[
        Proceeding("72660322", 'ТОВ "КАБЕЛЬ ПОСТАЧ"', 780_000, "19.02.2025", "відкрито"),
    ],
    cases=[
        CourtCase("917/0388/25", "відповідач", "стягнення заборгованості", 780_000, "05.02.2025"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="субпідрядники за державними контрактами не можуть мати "
                  "дискваліфікацій у публічних закупівлях за останні три роки",
    policy_trigger="залучення субпідрядника не допускається",
    hidden_link="the counterparty was disqualified from three tenders between 2023 "
                "and 2025 for submitting non-conforming documents, which falls "
                "inside the client's three-year look-back window and bars its use as "
                "a subcontractor.",
    hidden_detail="Історія участі у публічних закупівлях: дискваліфіковано у "
                  "тендерах UA-2023-04-11-000312, UA-2024-08-02-004517 та "
                  "UA-2025-01-23-000889 з підстав невідповідності поданих "
                  "документів кваліфікаційним критеріям",
    extra_criteria=[
        ("Counts the disqualifications",
         "PASS if the memo states that the counterparty was disqualified from three "
         "tenders. FAIL if it gives a different count or misses the history.",
         "oracle"),
        ("Places the disqualifications inside the look-back window",
         "PASS if the memo notes that all three disqualifications fall within the "
         "three-year window the client's policy applies. FAIL if it does not relate "
         "the dates to the policy.", "expert"),
    ],
))

S.append(Scenario(
    slug="ua-chemicals-licence-scope",
    title="Перевірка контрагента: обсяг дозволу не покриває предмет договору",
    industry="хімічна продукція",
    deal="укласти договір на перевезення та зберігання небезпечних речовин",
    target='ТОВ "ХІМТРАНС ЛОГІСТИКА"', target_code=synth("45456781"),
    status="зареєстровано", registered="15.02.2016",
    address="м. Черкаси, вул. Промислова, 5", capital=1_200_000,
    parent='ТОВ "ХІМ АКТИВ ІНВЕСТ"', parent_code=synth("45567892"),
    parent_share=100, ubo="МОРОЗ АНДРІЙ ВІКТОРОВИЧ",
    director="МОРОЗ АНДРІЙ ВІКТОРОВИЧ",
    proceedings=[
        Proceeding("72880199", 'ТОВ "ТАРА СЕРВІС"', 260_000, "13.03.2025", "відкрито"),
    ],
    cases=[],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="контрагент повинен мати чинний дозвіл, що покриває весь "
                  "предмет договору",
    policy_trigger="дозвіл не покриває зберігання, тому договір у запропонованому "
                   "обсязі укладати не можна",
    hidden_link="the permit covers carriage of hazardous substances but not their "
                "storage, while the proposed contract covers both, so the "
                "counterparty is not authorised for part of the intended scope.",
    hidden_detail="Дозвіл № ДН-4471 від 02.03.2023, чинний до 02.03.2026. "
                  "Обсяг дозволу: перевезення небезпечних речовин. "
                  "Зберігання небезпечних речовин дозволом не охоплюється.",
    extra_criteria=[
        ("Identifies the gap between permit scope and contract scope",
         "PASS if the memo states that permit ДН-4471 covers carriage but not "
         "storage, while the proposed contract covers both. FAIL if it reports the "
         "permit as sufficient.", "oracle"),
        ("Confirms the permit is otherwise current",
         "PASS if the memo notes that the permit is valid until 02.03.2026 and so is "
         "not expired, the defect being scope rather than validity. FAIL if it "
         "reports the permit as expired.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-media-circular-ownership",
    title="Перевірка контрагента: кругове володіння в структурі власності",
    industry="медіа та реклама",
    deal="укласти рамковий договір на медіа-закупівлю з передоплатою",
    target='ТОВ "МЕДІА ПЛАН ГРУП"', target_code=synth("45567892"),
    status="зареєстровано", registered="27.04.2021",
    address="м. Київ, вул. Антоновича, 176", capital=200_000,
    parent='ТОВ "АДВЕРТАЙЗ ХОЛДИНГ"', parent_code=synth("45678903"),
    parent_share=100, ubo="не визначено",
    director="САВЧЕНКО ЮЛІЯ ВАСИЛІВНА",
    proceedings=[
        Proceeding("73440877", 'ТОВ "ПРИНТ ЦЕНТР"', 520_000, "28.04.2025", "відкрито"),
    ],
    cases=[
        CourtCase("910/1122/25", "відповідач", "стягнення заборгованості", 520_000, "14.04.2025"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="передоплата не допускається контрагентам, у яких не розкрито "
                  "кінцевого бенефіціарного власника",
    policy_trigger="передоплата не допускається",
    hidden_link="the ownership chain is circular: the counterparty is held by "
                "ТОВ \"АДВЕРТАЙЗ ХОЛДИНГ\", which is held by ТОВ \"МЕДІА КАПІТАЛ\", "
                "which is in turn held by the counterparty itself, so no natural "
                "person is disclosed as ultimate beneficial owner.",
    hidden_detail='ТОВ "АДВЕРТАЙЗ ХОЛДИНГ" на 100% належить ТОВ "МЕДІА КАПІТАЛ", '
                  'код ЄДРПОУ 45789014, яке, у свою чергу, на 100% належить '
                  'ТОВ "МЕДІА ПЛАН ГРУП", код ЄДРПОУ 45567892. '
                  "Кінцевого бенефіціарного власника - фізичну особу не розкрито.",
    extra_criteria=[
        ("Identifies the circular ownership chain",
         "PASS if the memo traces the chain counterparty -> "
         "ТОВ \"АДВЕРТАЙЗ ХОЛДИНГ\" -> ТОВ \"МЕДІА КАПІТАЛ\" -> back to the "
         "counterparty, and identifies it as circular. FAIL if it does not detect "
         "that the chain closes on itself.", "oracle"),
        ("States that no natural-person UBO is disclosed",
         "PASS if the memo states that no natural person is disclosed as ultimate "
         "beneficial owner. FAIL if it names an individual as UBO.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-equipment-director-authority",
    title="Перевірка контрагента: повноваження підписанта обмежені статутом",
    industry="постачання промислового обладнання",
    deal="підписати договір на 9 800 000 грн з підписантом за довіреністю",
    target='ТОВ "ТЕХНО ПОСТАЧ ІНДУСТРІЯ"', target_code=synth("45678903"),
    status="зареєстровано", registered="11.12.2017",
    address="м. Кропивницький, вул. Велика Перспективна, 30", capital=750_000,
    parent='ТОВ "ІНДАСТРІ КАПІТАЛ ГРУП"', parent_code=synth("45789014"),
    parent_share=100, ubo="ДАНИЛЮК ПЕТРО СЕРГІЙОВИЧ",
    director="ДАНИЛЮК ПЕТРО СЕРГІЙОВИЧ",
    proceedings=[],
    cases=[
        CourtCase("912/0644/24", "позивач", "визнання договору недійсним", 4_100_000, "17.09.2024"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="договори понад 5 000 000 грн підписуються лише особою, "
                  "повноваження якої підтверджені без обмежень",
    policy_trigger="підписання запропонованим підписантом не допускається",
    hidden_link="the proxy holder's authority is capped at 5 000 000 UAH per "
                "transaction while the proposed contract is for 9 800 000 UAH, and "
                "the counterparty has itself previously sued to invalidate a "
                "contract signed beyond authority, so the risk is demonstrated "
                "rather than theoretical.",
    hidden_detail="Довіреність від 14.01.2025 на ім'я КРАВЕЦЬ ОКСАНА "
                  "ЛЕОНІДІВНА: право укладати договори на суму, що не перевищує "
                  "5 000 000,00 грн за одним правочином. "
                  "Статутом товариства правочини понад 5 000 000,00 грн віднесено "
                  "до компетенції загальних зборів учасників.",
    extra_criteria=[
        ("Identifies the authority cap",
         "PASS if the memo states that the proxy authorises transactions up to "
         "5 000 000 UAH while the proposed contract is for 9 800 000 UAH. FAIL if it "
         "does not compare the two figures.", "oracle"),
        ("Identifies the corporate approval requirement",
         "PASS if the memo states that under the counterparty's charter a "
         "transaction above 5 000 000 UAH requires a resolution of the general "
         "meeting of participants. FAIL if it treats the proxy alone as sufficient.",
         "oracle"),
        ("Uses the counterparty's own prior litigation as evidence of the risk",
         "PASS if the memo notes that in case 912/0644/24 the counterparty itself "
         "sued to invalidate a contract, and treats that as evidence the authority "
         "risk is live. FAIL if it counts that case as a claim against the "
         "counterparty.", "expert"),
    ],
))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    total = 0
    for s in S:
        t = build_task(s, root)
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        total += n
        print(f"{t.relative_to(root)}: {n} criteria, "
              f"{len(list((t/'documents').iterdir()))} documents")
    print(f"\n{len(S)} scenarios, {total} criteria")


if __name__ == "__main__":
    main()
