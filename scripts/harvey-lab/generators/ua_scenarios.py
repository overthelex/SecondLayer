#!/usr/bin/env python3
"""The 14 register-screening scenarios that make up the Ukrainian diligence family.

Each carries its own entities, amounts and trap. Codes are checksum-invalid on
purpose. Amounts and dates are internally consistent, which is what the
generated rubric is checked against.

Usage:
    uv run --with python-docx --with openpyxl python ua_scenarios.py <tasks_root>
"""

import sys
from pathlib import Path

from ua_pack import CourtCase, Proceeding, Scenario, build_task, synth, uah

S = []

S.append(Scenario(
    slug="ua-agro-supply-framework",
    title="Перевірка контрагента: рамкова поставка зерна з авансом",
    industry="агротрейдинг",
    deal="укласти рамковий договір поставки зерна з авансом 35%",
    target='ТОВ "СТЕПОВА НИВА ТРЕЙД"', target_code=synth("43456781"),
    status="зареєстровано", registered="04.02.2018",
    address="м. Миколаїв, вул. Портова, 27", capital=250_000,
    parent='ТОВ "ХОЛДИНГ ПІВДЕНЬ АГРО"', parent_code=synth("44567892"),
    parent_share=100, ubo="КРАВЧУК ІГОР СТЕПАНОВИЧ",
    director="КРАВЧУК ІГОР СТЕПАНОВИЧ",
    proceedings=[
        Proceeding("72100455", 'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ"', 3_450_000, "12.01.2025", "відкрито"),
        Proceeding("72455018", "ГУ ДПС у Миколаївській обл.", 1_180_000, "03.03.2025", "відкрито"),
        Proceeding("70012388", 'ТОВ "АГРОХІМ СЕРВІС"', 265_000, "19.05.2024", "завершено"),
    ],
    cases=[
        CourtCase("915/0331/25", "відповідач", "стягнення заборгованості", 3_450_000, "08.01.2025"),
        CourtCase("915/0870/24", "позивач", "стягнення збитків", 640_000, "22.04.2024"),
    ],
    tax_debt=1_180_000, tax_date="01.06.2025",
    client_policy="аванс понад 20% не допускається контрагентам, "
                  "які мають відкриті виконавчі провадження на суму понад 2 000 000 грн",
    policy_trigger="запропонований аванс 35% не допускається",
    hidden_link="the same ultimate beneficial owner also controls "
                'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ", which is the creditor in enforcement '
                "proceeding 72100455 against the counterparty, so the largest "
                "claim against the counterparty is from a related party.",
    hidden_detail='КРАВЧУК ІГОР СТЕПАНОВИЧ є кінцевим бенефіціарним власником '
                  'ТОВ "ЕЛЕВАТОР ПІВДЕНЬ", код ЄДРПОУ 45678903; відсоток частки - 100',
    extra_criteria=[
        ("Flags the related-party nature of the largest claim",
         "PASS if the memo warns that a claim from a related party may not be an "
         "arm's-length debt and should be verified before relying on the exposure "
         "figure. FAIL if it treats proceeding 72100455 as an ordinary third-party "
         "claim.", "expert"),
    ],
))

S.append(Scenario(
    slug="ua-logistics-nominee-structure",
    title="Перевірка контрагента: ознаки номінальної структури",
    industry="вантажні перевезення",
    deal="передати на аутсорс логістику з місячним лімітом 1 800 000 грн",
    target='ТОВ "ШЛЯХ ЕКСПРЕС ЛОГІСТИК"', target_code=synth("43567892"),
    status="зареєстровано", registered="27.11.2024",
    address="м. Одеса, вул. Базарна, 5, оф. 12", capital=1_000,
    parent='ТОВ "КОМЕРЦ ІНВЕСТ ГРУП"', parent_code=synth("44678903"),
    parent_share=100, ubo="МЕЛЬНИЧУК ОЛЕНА ПЕТРІВНА",
    director="МЕЛЬНИЧУК ОЛЕНА ПЕТРІВНА",
    proceedings=[
        Proceeding("73220100", 'ТОВ "ПАЛИВО ОПТ"', 410_000, "14.04.2025", "відкрито"),
    ],
    cases=[
        CourtCase("916/0221/25", "відповідач", "стягнення заборгованості", 410_000, "02.04.2025"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="контрагентам зі статутним капіталом менше 50 000 грн "
                  "місячний ліміт не може перевищувати 300 000 грн",
    policy_trigger="запропонований ліміт 1 800 000 грн не допускається",
    hidden_link="the same individual is director and UBO of four other companies "
                "registered at the identical address, which together with a 1 000 UAH "
                "share capital and a registration date of 27.11.2024 indicates a "
                "nominee structure rather than an operating business.",
    hidden_detail="МЕЛЬНИЧУК ОЛЕНА ПЕТРІВНА є керівником і кінцевим бенефіціарним "
                  'власником ще чотирьох юридичних осіб, зареєстрованих за адресою '
                  'м. Одеса, вул. Базарна, 5, оф. 12: ТОВ "КАРГО ЛАЙН ЮА", '
                  'ТОВ "ТРАНС ОПТІМА", ТОВ "ВАНТАЖ ПЛЮС", ТОВ "РЕЙС СЕРВІС"',
    extra_criteria=[
        ("Identifies the low share capital as a risk indicator",
         "PASS if the memo flags that a share capital of 1 000 UAH is negligible "
         "relative to the proposed 1 800 000 UAH monthly limit. FAIL if it does not "
         "compare the two.", "oracle"),
        ("Notes the recent incorporation date",
         "PASS if the memo notes that the counterparty was registered on 27.11.2024 "
         "and therefore has almost no trading history. FAIL if it does not address "
         "the registration date.", "oracle"),
        ("Counts the co-registered companies",
         "PASS if the memo states that four other companies share the same address "
         "and the same director. FAIL if it gives a different count or misses the "
         "pattern.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-construction-capital-reduction",
    title="Перевірка контрагента: зменшення капіталу і зміна керівника перед угодою",
    industry="будівництво",
    deal="укласти договір генерального підряду на 12 400 000 грн",
    target='ТОВ "МОНОЛІТ БУД ГРУП"', target_code=synth("43678903"),
    status="зареєстровано", registered="16.08.2016",
    address="м. Львів, вул. Личаківська, 143", capital=80_000,
    parent='ТОВ "ІНВЕСТ БУД АКТИВ"', parent_code=synth("44789014"),
    parent_share=100, ubo="ГАВРИЛЮК БОГДАН ЯРОСЛАВОВИЧ",
    director="ПРОЦЕНКО ВІТАЛІЙ МИКОЛАЙОВИЧ",
    proceedings=[
        Proceeding("71905233", 'ТОВ "БУДМАТЕРІАЛИ ЗАХІД"', 2_260_000, "21.02.2025", "відкрито"),
        Proceeding("72330871", 'ПрАТ "ЕНЕРГОПОСТАЧ"', 890_000, "07.04.2025", "відкрито"),
        Proceeding("69880102", 'ТОВ "ОРЕНДА ТЕХНІКИ"', 512_000, "13.09.2023", "повернуто стягувачу"),
    ],
    cases=[
        CourtCase("914/0455/25", "відповідач", "стягнення заборгованості", 2_260_000, "11.02.2025"),
        CourtCase("914/0688/25", "відповідач", "розірвання договору підряду", 5_100_000, "19.03.2025"),
    ],
    tax_debt=430_000, tax_date="01.06.2025",
    client_policy="договори понад 10 000 000 грн потребують забезпечення, "
                  "якщо статутний капітал контрагента менший за 5% суми договору",
    policy_trigger="договір на 12 400 000 грн потребує забезпечення",
    hidden_link="the share capital was reduced from 4 200 000 UAH to 80 000 UAH on "
                "22.01.2025 and the director was replaced on 24.01.2025, both within "
                "a month before the first enforcement proceeding was opened, which "
                "together suggest asset stripping ahead of enforcement.",
    hidden_detail="Історія змін: 22.01.2025 зменшено статутний капітал з "
                  "4 200 000,00 грн до 80 000,00 грн; 24.01.2025 змінено керівника "
                  "з ГАВРИЛЮК БОГДАН ЯРОСЛАВОВИЧ на ПРОЦЕНКО ВІТАЛІЙ МИКОЛАЙОВИЧ",
    extra_criteria=[
        ("Identifies the scale of the capital reduction",
         "PASS if the memo states that share capital fell from 4 200 000 UAH to "
         "80 000 UAH, a reduction of over 98%. FAIL if it does not quantify the "
         "reduction.", "oracle"),
        ("Notes that the director differs from the UBO",
         "PASS if the memo notes that the current director "
         "ПРОЦЕНКО ВІТАЛІЙ МИКОЛАЙОВИЧ is not the ultimate beneficial owner "
         "ГАВРИЛЮК БОГДАН ЯРОСЛАВОВИЧ, and that the change happened on 24.01.2025. "
         "FAIL if it conflates the two roles.", "oracle"),
        ("Places the changes before the enforcement proceedings",
         "PASS if the memo observes that both changes predate the first open "
         "enforcement proceeding of 21.02.2025. FAIL if it does not relate the "
         "timing.", "expert"),
    ],
))

S.append(Scenario(
    slug="ua-pharma-sanctioned-founder",
    title="Перевірка контрагента: санкції щодо засновника, але не щодо компанії",
    industry="дистрибуція фармацевтичної продукції",
    deal="укласти дистриб'юторський договір на 8 600 000 грн на рік",
    target='ТОВ "МЕДФАРМ ДИСТРИБ\'ЮШН"', target_code=synth("43789014"),
    status="зареєстровано", registered="09.05.2017",
    address="м. Харків, просп. Науки, 60", capital=500_000,
    parent='ТОВ "ФАРМ КАПІТАЛ ІНВЕСТ"', parent_code=synth("44890125"),
    parent_share=100, ubo="ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ",
    director="ЛИТВИН НАТАЛІЯ ІВАНІВНА",
    proceedings=[
        Proceeding("72700411", 'ТОВ "ЛОГІСТИК ФАРМ"', 620_000, "18.03.2025", "відкрито"),
    ],
    cases=[
        CourtCase("922/0512/25", "позивач", "стягнення заборгованості", 1_340_000, "26.02.2025"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="забороняється співпраця з контрагентами, кінцеві бенефіціарні "
                  "власники яких включені до санкційних переліків",
    policy_trigger="співпраця заборонена, оскільки КБВ під санкціями",
    hidden_link="the counterparty itself is not on any sanctions list, but its "
                "ultimate beneficial owner ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ is, by a "
                "decision of 07.03.2024, so the client's policy is engaged even "
                "though a screening of the company alone comes back clean.",
    hidden_detail="ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ включений до переліку осіб, до яких "
                  "застосовано санкції, рішенням від 07.03.2024; строк застосування - 5 років",
    extra_docs=[(
        "sankciyni-perevirky.docx", "РЕЗУЛЬТАТИ ПЕРЕВІРКИ ЗА САНКЦІЙНИМИ ПЕРЕЛІКАМИ",
        [("p", 'ТОВ "МЕДФАРМ ДИСТРИБ\'ЮШН": у переліках не виявлено.'),
         ("p", 'ТОВ "ФАРМ КАПІТАЛ ІНВЕСТ": у переліках не виявлено.'),
         ("b", "ЗАХАРЧЕНКО РУСЛАН ОЛЕГОВИЧ (фізична особа): включено до переліку "
               "рішенням від 07.03.2024, строк застосування - 5 років."),
         ("p", "ЛИТВИН НАТАЛІЯ ІВАНІВНА: у переліках не виявлена.")],
    )],
    extra_criteria=[
        ("States that the company itself is not sanctioned",
         "PASS if the memo states that neither the counterparty nor its direct "
         "shareholder appears on a sanctions list, while still flagging the UBO. "
         "FAIL if it asserts that the counterparty itself is sanctioned.", "oracle"),
        ("Dates the sanctions decision",
         "PASS if the memo states that sanctions were imposed on the UBO by a "
         "decision of 07.03.2024 for a term of 5 years. FAIL if it gives a "
         "different date or term.", "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-metals-arma-seizure",
    title="Перевірка контрагента: арешт виробничих активів за адресою реєстрації",
    industry="металообробка",
    deal="розмістити замовлення на металоконструкції з передоплатою 40%",
    target='ТОВ "СТАЛЬ ПРОФІЛЬ ВИРОБНИЦТВО"', target_code=synth("43890125"),
    status="зареєстровано", registered="12.03.2015",
    address="м. Запоріжжя, вул. Заводська, 8", capital=1_500_000,
    parent='ТОВ "ІНДУСТРІАЛ ГРУП ЗАПОРІЖЖЯ"', parent_code=synth("44901236"),
    parent_share=100, ubo="ТКАЧЕНКО СЕРГІЙ ВАЛЕНТИНОВИЧ",
    director="ТКАЧЕНКО СЕРГІЙ ВАЛЕНТИНОВИЧ",
    proceedings=[
        Proceeding("71440200", 'АТ "ОБЛЕНЕРГО"', 1_960_000, "05.12.2024", "відкрито"),
        Proceeding("72880533", 'ТОВ "МЕТАЛОБАЗА ЦЕНТР"', 3_120_000, "22.04.2025", "відкрито"),
    ],
    cases=[
        CourtCase("908/0733/25", "відповідач", "справа про банкрутство", 0, "14.05.2025"),
        CourtCase("908/0299/25", "відповідач", "стягнення заборгованості", 3_120_000, "10.03.2025"),
    ],
    tax_debt=740_000, tax_date="01.06.2025",
    client_policy="передоплата не допускається контрагентам, щодо яких "
                  "відкрито провадження у справі про банкрутство",
    policy_trigger="передоплата 40% не допускається",
    hidden_link="the production complex seized on 28.05.2025 is at "
                "вул. Заводська, 8, м. Запоріжжя, the counterparty's own registered "
                "address, so the encumbered asset is its operating base rather than "
                "an incidental holding.",
    hidden_detail="ТКАЧЕНКО СЕРГІЙ ВАЛЕНТИНОВИЧ є кінцевим бенефіціарним власником "
                  'ТОВ "ІНДУСТРІАЛ ГРУП ЗАПОРІЖЖЯ", код ЄДРПОУ 44901236; '
                  "відсоток частки - 100",
    extra_docs=[(
        "arma-aktyvy.docx", "ВІДОМОСТІ ПРО АРЕШТОВАНІ АКТИВИ",
        [("p", "Справа: 908/0733/25"),
         ("p", 'Власник: ТОВ "СТАЛЬ ПРОФІЛЬ ВИРОБНИЦТВО", код ЄДРПОУ 43890125'),
         ("b", "Тип активу: нерухоме майно, виробничий комплекс"),
         ("p", "Опис: виробничий комплекс, м. Запоріжжя, вул. Заводська, 8"),
         ("p", "Дата арешту: 28.05.2025")],
    )],
    extra_criteria=[
        ("Identifies the open bankruptcy case",
         "PASS if the memo identifies case 908/0733/25, opened 14.05.2025, as a "
         "bankruptcy case in which the counterparty is respondent. FAIL if it "
         "misses it or misclassifies it as an ordinary debt claim.", "oracle"),
        ("Identifies the seized production complex",
         "PASS if the memo states that the production complex was seized on "
         "28.05.2025 in case 908/0733/25. FAIL if it does not report the seizure.",
         "oracle"),
    ],
))

S.append(Scenario(
    slug="ua-retail-successor-liability",
    title="Перевірка контрагента: правонаступництво після приєднання",
    industry="роздрібна торгівля",
    deal="укласти договір поставки з відстрочкою платежу 60 днів",
    target='ТОВ "МАРКЕТ ЛАЙН РІТЕЙЛ"', target_code=synth("43901236"),
    status="зареєстровано", registered="30.06.2020",
    address="м. Київ, вул. Кирилівська, 102", capital=900_000,
    parent='ТОВ "РІТЕЙЛ ХОЛДИНГ ЦЕНТР"', parent_code=synth("45012347"),
    parent_share=100, ubo="БОНДАРЕНКО АРТЕМ ВОЛОДИМИРОВИЧ",
    director="БОНДАРЕНКО АРТЕМ ВОЛОДИМИРОВИЧ",
    proceedings=[
        Proceeding("72990644", 'ТОВ "ДИСТРИБ\'ЮЦІЯ ПЛЮС"', 1_480_000, "16.05.2025", "відкрито"),
    ],
    cases=[
        CourtCase("910/0812/25", "відповідач", "стягнення заборгованості", 1_480_000, "29.04.2025"),
        CourtCase("910/0433/24", "позивач", "стягнення збитків", 275_000, "18.03.2024"),
    ],
    tax_debt=0, tax_date="01.06.2025",
    client_policy="сукупна експозиція на одного контрагента не може перевищувати "
                  "3 000 000 грн з урахуванням зобов'язань правопопередників",
    policy_trigger="сукупна експозиція перевищує ліміт з урахуванням правопопередника",
    hidden_link="the counterparty absorbed ТОВ \"ПРОДУКТ СІТІ\" on 11.02.2025 and is "
                "its universal successor, so that company's 2 350 000 UAH of "
                "liabilities must be added to the counterparty's own 1 480 000 UAH, "
                "giving 3 830 000 UAH in total.",
    hidden_detail="11.02.2025 до складу товариства приєднано "
                  'ТОВ "ПРОДУКТ СІТІ", код ЄДРПОУ 45123458; товариство є '
                  "правонаступником за всіма зобов'язаннями приєднаної особи",
    extra_docs=[(
        "vidomosti-pro-pravonastupnytstvo.docx", "ВІДОМОСТІ ПРО ПРАВОНАСТУПНИЦТВО",
        [("p", 'Приєднана особа: ТОВ "ПРОДУКТ СІТІ", код ЄДРПОУ 45123458'),
         ("p", "Дата приєднання: 11.02.2025"),
         ("b", "Непогашені зобов'язання приєднаної особи на дату приєднання: "
               "2 350 000,00 грн"),
         ("p", "Виконавче провадження 71330922 щодо приєднаної особи: відкрито")],
    )],
    extra_criteria=[
        ("Computes the combined exposure",
         "PASS if the memo states the combined exposure as 3 830 000 UAH, being "
         "1 480 000 UAH against the counterparty plus 2 350 000 UAH inherited from "
         "ТОВ \"ПРОДУКТ СІТІ\". FAIL if it reports only the counterparty's own "
         "figure or a different total.", "oracle"),
        ("Identifies the counterparty as universal successor",
         "PASS if the memo states that the counterparty is the successor to the "
         "obligations of the absorbed company as of 11.02.2025. FAIL if it treats "
         "the absorbed company's debts as unrelated.", "oracle"),
    ],
))


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    total = 0
    for s in S:
        t = build_task(s, root)
        import json
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        ndocs = len(list((t / "documents").iterdir()))
        total += n
        print(f"{t.relative_to(root)}: {n} criteria, {ndocs} documents")
    print(f"\n{len(S)} scenarios, {total} criteria")


if __name__ == "__main__":
    main()
