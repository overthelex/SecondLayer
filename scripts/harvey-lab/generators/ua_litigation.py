#!/usr/bin/env python3
"""Ukrainian LAB pack: limitation-period litigation family.

Every statutory proposition used here was read from the text of the Civil Code
in force on the matter date at zakon.rada.gov.ua, not from recall:

  ст. 257        загальна позовна давність - три роки
  ст. 258 ч.2 п.1  один рік для вимог про стягнення неустойки (штрафу, пені)
  ст. 259 ч.1    може бути ЗБІЛЬШЕНА за домовленістю, у письмовій формі
  ст. 259 ч.2    НЕ МОЖЕ бути скорочена за домовленістю
  ст. 261 ч.5    за зобов'язаннями з визначеним строком виконання перебіг
                 починається зі спливом строку виконання
  ст. 267 ч.3    застосовується лише за заявою сторони, зробленою до
                 винесення рішення
  ст. 267 ч.4    сплив + заява = підстава для відмови у позові
  ст. 625 ч.2    індекс інфляції + три проценти річних
  п.12 Прикінц.  карантин COVID: строки ПРОДОВЖУЮТЬСЯ
  п.19 Прикінц.  воєнний стан: перебіг ЗУПИНЯЄТЬСЯ (в ред. Закону 3450-IX
                 від 08.11.2023; виключений Законом 4434-IX від 14.05.2025)

Each scenario is set before 14.05.2025 and says so in its instructions.

Usage:
    uv run --with python-docx --with openpyxl python ua_litigation.py <tasks_root>
"""

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from ua_pack import doc, sheet, synth, uah

DELIV = "analiz-pozovnoyi-davnosti.docx"


@dataclass
class Case:
    slug: str
    title: str
    question: str
    claimant: str
    claimant_code: str
    defendant: str
    defendant_code: str
    debt: int
    contract_date: str
    due_date: str
    start: str
    filed: str
    judgment: str
    contract_clause: str
    defence: str
    court_holding: str
    answer: str
    criteria: list = field(default_factory=list)


C = []

C.append(Case(
    slug="ua-limitation-contractual-shortening-void",
    title="Позовна давність: договірне скорочення строку",
    question="чи є чинним пункт договору, що скорочує позовну давність до одного року",
    claimant='ТОВ "ЛІСОВА ГАВАНЬ"', claimant_code=synth("41234568"),
    defendant='ТОВ "ДЕРЕВОТОРГ ПЛЮС"', defendant_code=synth("42345679"),
    debt=2_100_000,
    contract_date="10.02.2021", due_date="12.03.2021", start="13.03.2021",
    filed="04.10.2024", judgment="17.03.2025",
    contract_clause="5.4. Сторони домовились, що позовна давність за вимогами "
                    "з цього Договору становить один рік.",
    defence="Позивач звернувся до суду зі спливом однорічного строку, "
            "погодженого сторонами у пункті 5.4 Договору. Просимо відмовити "
            "у позові.",
    court_holding="Пункт 5.4 Договору є нікчемним у частині скорочення позовної "
                  "давності, оскільки частиною другою статті 259 Цивільного "
                  "кодексу України встановлено, що позовна давність, встановлена "
                  "законом, не може бути скорочена за домовленістю сторін. "
                  "Застосовується загальна позовна давність тривалістю три роки "
                  "(стаття 257 Цивільного кодексу України), перебіг якої, крім "
                  "того, зупинено на строк дії воєнного стану згідно з пунктом 19 "
                  "Прикінцевих та перехідних положень цього Кодексу.",
    answer="позов подано в межах строку, довід відповідача безпідставний",
    criteria=[
        ("Identifies that a contractual shortening of limitation is void",
         "PASS if the analysis states that clause 5.4 cannot shorten the limitation "
         "period because part 2 of Article 259 of the Civil Code of Ukraine "
         "prohibits shortening a statutory limitation period by agreement. FAIL if "
         "it treats the one-year contractual period as effective.", "oracle"),
        ("Does not confuse shortening with lengthening",
         "PASS if the analysis reflects that Article 259 permits limitation to be "
         "INCREASED by written agreement while prohibiting its reduction. FAIL if "
         "it states that any contractual variation of limitation is void, or that "
         "shortening is permitted.", "oracle"),
        ("Applies the three-year general period instead",
         "PASS if the analysis concludes that the applicable period is the "
         "three-year general period under Article 257. FAIL if it applies one year.",
         "oracle"),
        ("Concludes the claim is in time",
         "PASS if the analysis concludes that the claim was filed within time and "
         "the limitation objection should fail. FAIL if it concludes the claim is "
         "time-barred.", "expert"),
    ],
))

C.append(Case(
    slug="ua-limitation-extended-by-agreement",
    title="Позовна давність: договірне збільшення строку",
    question="чи є чинним пункт договору, що збільшує позовну давність до п'яти років",
    claimant='ТОВ "ПАКУВАЛЬНІ СИСТЕМИ"', claimant_code=synth("43456781"),
    defendant='ТОВ "ХІМРЕАГЕНТ ІНВЕСТ"', defendant_code=synth("44567892"),
    debt=3_780_000,
    contract_date="18.01.2019", due_date="20.02.2019", start="21.02.2019",
    filed="06.11.2024", judgment="24.02.2025",
    contract_clause="7.2. Сторони, керуючись частиною першою статті 259 "
                    "Цивільного кодексу України, збільшують позовну давність "
                    "за вимогами з цього Договору до п'яти років.",
    defence="Загальна позовна давність тривалістю три роки сплила 21.02.2022. "
            "Пункт 7.2 Договору не може подовжувати строк. Просимо відмовити.",
    court_holding="Частиною першою статті 259 Цивільного кодексу України прямо "
                  "передбачено, що позовна давність, встановлена законом, може "
                  "бути збільшена за домовленістю сторін, а договір про "
                  "збільшення позовної давності укладається у письмовій формі. "
                  "Пункт 7.2 Договору відповідає цим вимогам і є чинним.",
    answer="позов подано в межах збільшеного строку",
    criteria=[
        ("Identifies that limitation may be extended by written agreement",
         "PASS if the analysis states that part 1 of Article 259 of the Civil Code "
         "of Ukraine allows the parties to increase a statutory limitation period "
         "by agreement made in writing. FAIL if it treats clause 7.2 as ineffective.",
         "oracle"),
        ("Notes the written-form requirement",
         "PASS if the analysis notes that the agreement extending limitation must "
         "be in writing and that clause 7.2 of the contract satisfies this. FAIL if "
         "it does not address the form requirement.", "oracle"),
        ("Rejects the defendant's three-year argument",
         "PASS if the analysis concludes that the three-year general period does "
         "not govern because the parties validly extended it to five years. FAIL if "
         "it accepts the defendant's position.", "expert"),
    ],
))

C.append(Case(
    slug="ua-limitation-not-raised-by-party",
    title="Позовна давність: суд не може застосувати її з власної ініціативи",
    question="чи може суд відмовити у позові через сплив давності, якщо відповідач про це не заявляв",
    claimant='ТОВ "БУДСЕРВІС ІНЖИНІРИНГ"', claimant_code=synth("43567892"),
    defendant='ТОВ "ТЕПЛОМЕРЕЖА ПІВНІЧ"', defendant_code=synth("44678903"),
    debt=1_640_000,
    contract_date="05.04.2019", due_date="07.05.2019", start="08.05.2019",
    filed="15.08.2024", judgment="03.03.2025",
    contract_clause="6.1. Оплата здійснюється протягом 30 календарних днів з "
                    "дати підписання акта виконаних робіт.",
    defence="Відповідач заперечує обсяг виконаних робіт та їх якість. "
            "Заяви про застосування позовної давності відповідач не подавав.",
    court_holding="Відповідно до частини третьої статті 267 Цивільного кодексу "
                  "України позовна давність застосовується судом лише за заявою "
                  "сторони у спорі, зробленою до винесення ним рішення. "
                  "Відповідач такої заяви не подавав, тому суд не вправі "
                  "застосовувати позовну давність з власної ініціативи.",
    answer="суд не може відмовити у позові з підстав спливу давності",
    criteria=[
        ("Identifies that limitation applies only on a party's application",
         "PASS if the analysis states that under part 3 of Article 267 of the Civil "
         "Code of Ukraine limitation is applied by the court only on the "
         "application of a party to the dispute, made before judgment. FAIL if it "
         "suggests the court may apply limitation of its own motion.", "oracle"),
        ("Notes that no such application was made",
         "PASS if the analysis notes that the defendant did not apply for "
         "limitation to be applied. FAIL if it assumes such an application exists.",
         "oracle"),
        ("Does not advise on the merits as if limitation were decisive",
         "PASS if the analysis identifies that the real risk lies in the "
         "defendant's objections to the scope and quality of the works, not in "
         "limitation. FAIL if it treats limitation as the operative risk.",
         "expert"),
    ],
))

C.append(Case(
    slug="ua-limitation-penalty-one-year",
    title="Позовна давність: спеціальний однорічний строк для пені",
    question="який строк давності застосовується до вимоги про стягнення пені",
    claimant='ТОВ "ЕНЕРГОКОМПЛЕКТ ЗАХІД"', claimant_code=synth("43678903"),
    defendant='ТОВ "ПРОМИСЛОВІ РІШЕННЯ"', defendant_code=synth("44789014"),
    debt=5_250_000,
    contract_date="22.06.2020", due_date="24.07.2020", start="25.07.2020",
    filed="12.12.2024", judgment="28.04.2025",
    contract_clause="4.3. За прострочення оплати Покупець сплачує пеню в "
                    "розмірі подвійної облікової ставки НБУ за кожен день "
                    "прострочення.",
    defence="Вимога про стягнення пені заявлена зі спливом строку давності. "
            "Щодо основної суми заперечень немає.",
    court_holding="До вимог про стягнення неустойки (штрафу, пені) застосовується "
                  "спеціальна позовна давність в один рік згідно з пунктом 1 "
                  "частини другої статті 258 Цивільного кодексу України, на "
                  "відміну від загальної трирічної давності за статтею 257. "
                  "Перебіг обох строків зупинено на час дії воєнного стану "
                  "згідно з пунктом 19 Прикінцевих та перехідних положень.",
    answer="однорічний строк застосовується до пені, але його перебіг зупинено",
    criteria=[
        ("Applies the one-year special period to the penalty claim",
         "PASS if the analysis states that claims for penalty (неустойка, штраф, "
         "пеня) are subject to a one-year special limitation period under point 1 "
         "of part 2 of Article 258 of the Civil Code of Ukraine. FAIL if it applies "
         "the three-year general period to the penalty claim.", "oracle"),
        ("Keeps the three-year period for the principal debt",
         "PASS if the analysis applies the three-year general period under Article "
         "257 to the principal debt, separately from the one-year period for the "
         "penalty. FAIL if it applies a single period to both claims.", "oracle"),
        ("Notes that the one-year period is also suspended",
         "PASS if the analysis states that the running of the one-year period is "
         "also suspended for the duration of martial law, so the penalty claim is "
         "not time-barred. FAIL if it concludes the penalty claim expired.",
         "oracle"),
    ],
))

C.append(Case(
    slug="ua-limitation-quarantine-vs-martial-law",
    title="Позовна давність: карантин продовжує, воєнний стан зупиняє",
    question="як співвідносяться правила про карантин і про воєнний стан",
    claimant='ТОВ "ТЕКСТИЛЬ ГРУП"', claimant_code=synth("43789014"),
    defendant='ТОВ "ШВЕЙНА МАНУФАКТУРА"', defendant_code=synth("44890125"),
    debt=980_000,
    contract_date="14.09.2019", due_date="16.10.2019", start="17.10.2019",
    filed="29.07.2024", judgment="10.02.2025",
    contract_clause="3.5. Оплата здійснюється протягом 30 календарних днів з "
                    "дати поставки.",
    defence="Трирічна позовна давність сплила 17.10.2022. Позов подано пізніше.",
    court_holding="До спірних відносин застосовуються два різні механізми. "
                  "Пунктом 12 Прикінцевих та перехідних положень Цивільного "
                  "кодексу України передбачено, що під час дії карантину, "
                  "встановленого з метою запобігання поширенню COVID-19, строки, "
                  "визначені статтями 257, 258, 362, 559, 681, 728, 786, 1293 "
                  "цього Кодексу, ПРОДОВЖУЮТЬСЯ на строк дії такого карантину. "
                  "Натомість пунктом 19 тих самих Положень передбачено, що у "
                  "період дії воєнного стану перебіг позовної давності "
                  "ЗУПИНЯЄТЬСЯ. Це різні за змістом механізми.",
    answer="позов подано в межах строку з урахуванням обох механізмів",
    criteria=[
        ("Distinguishes extension from suspension",
         "PASS if the analysis states that paragraph 12 EXTENDS the periods "
         "(продовжуються) for the duration of COVID-19 quarantine while paragraph "
         "19 SUSPENDS the running of limitation (зупиняється) for the duration of "
         "martial law, and treats these as different mechanisms. FAIL if it "
         "describes both with the same verb or merges them into one rule.",
         "oracle"),
        ("Attaches the article list to paragraph 12 only",
         "PASS if the analysis attributes the list of articles 257, 258, 362, 559, "
         "681, 728, 786, 1293 to paragraph 12 (quarantine). FAIL if it attaches "
         "that list to paragraph 19.", "oracle"),
        ("Dates the start of martial law",
         "PASS if the analysis states that martial law took effect on 24.02.2022. "
         "FAIL if it gives a different date.", "oracle"),
        ("Concludes the claim is in time",
         "PASS if the analysis concludes the claim was filed within time. FAIL if "
         "it concludes the claim is time-barred.", "expert"),
    ],
))


def build(c: Case, root: Path) -> Path:
    t = root / "litigation-dispute-resolution" / c.slug
    d = t / "documents"

    doc(d / "dogovir.docx", f"ДОГОВІР № {c.slug[-4:].upper()} від {c.contract_date}", [
        ("p", f"Постачальник: {c.claimant}, код ЄДРПОУ {c.claimant_code}"),
        ("p", f"Покупець: {c.defendant}, код ЄДРПОУ {c.defendant_code}"),
        ("p", f"Загальна вартість: {uah(c.debt)},00 грн"),
        ("h", "Умови розрахунків та відповідальність"),
        ("p", c.contract_clause),
        ("p", f"Строк виконання грошового зобов'язання: {c.due_date}."),
    ])

    doc(d / "pozovna-zayava.docx", "ПОЗОВНА ЗАЯВА", [
        ("p", f"Позивач: {c.claimant}"),
        ("p", f"Відповідач: {c.defendant}"),
        ("p", f"Дата подання: {c.filed}"),
        ("p", f"Строк оплати сплив {c.due_date}, оплата не здійснена."),
        ("p", f"Просимо стягнути {uah(c.debt)},00 грн основної заборгованості, "
              f"а також 3% річних та інфляційні втрати відповідно до частини "
              f"другої статті 625 Цивільного кодексу України."),
    ])

    doc(d / "vidzyv-vidpovidacha.docx", "ВІДЗИВ НА ПОЗОВНУ ЗАЯВУ", [
        ("p", f"Відповідач: {c.defendant}"), ("p", c.defence),
    ])

    doc(d / "rishennya-sudu.docx",
        f"РІШЕННЯ суду першої інстанції від {c.judgment}", [
            ("p", f"Строк виконання грошового зобов'язання - {c.due_date}. "
                  f"Перебіг позовної давності розпочався {c.start} відповідно до "
                  f"частини п'ятої статті 261 Цивільного кодексу України."),
            ("b", "Щодо позовної давності"),
            ("p", c.court_holding),
            ("b", "Висновок"),
            ("p", f"Позов задовольнити. {c.answer.capitalize()}."),
        ])

    sheet(d / "hronolohiya.xlsx", "Хронологія", ["Подія", "Дата"], [
        ["Укладення договору", c.contract_date],
        ["Строк виконання зобов'язання", c.due_date],
        ["Початок перебігу позовної давності", c.start],
        ["Введення воєнного стану", "24.02.2022"],
        ["Подання позову", c.filed],
        ["Рішення суду першої інстанції", c.judgment],
    ])

    crit = []
    for i, (title, match, source) in enumerate(c.criteria, 1):
        crit.append({"id": f"C-{i:03d}", "title": title,
                     "deliverables": [DELIV], "match_criteria": match,
                     "source": source})
    n = len(crit)

    def add(title, match, source="expert"):
        nonlocal n
        n += 1
        crit.append({"id": f"C-{n:03d}", "title": title, "deliverables": [DELIV],
                     "match_criteria": match, "source": source})

    # DATES: one link of the chain per criterion, so a broken step is visible.
    add("DATES: fixes the start of the limitation period",
        f"PASS if the analysis states that the limitation period began to run on "
        f"{c.start}, the day after performance fell due. FAIL if it uses the "
        f"contract date {c.contract_date} or another start date.", "oracle")
    add("DATES: cites Article 261(5) for that start",
        "PASS if the analysis grounds the start date in part 5 of Article 261 of "
        "the Civil Code of Ukraine. FAIL if the start date is asserted without "
        "that basis.", "oracle")

    add("LAW: identifies Article 625(2) for 3% per annum and inflation losses",
        "PASS if the analysis cites part 2 of Article 625 of the Civil Code of "
        "Ukraine as the basis for the 3% per annum and inflation losses. FAIL if it "
        "cites another provision or treats these as contractual claims.", "oracle")
    add("LAW: applies the law in force as at the judgment date",
        f"PASS if the analysis applies the Civil Code as in force on {c.judgment}, "
        f"consistent with the instructions. Paragraph 19 of the Final and "
        f"Transitional Provisions was repealed by Law 4434-IX of 14.05.2025, the "
        f"repeal appearing in the consolidated text from the edition of "
        f"05.10.2025; either date is after this matter. FAIL if the analysis "
        f"states that paragraph 19 does not exist or has been repealed.", "oracle")
    add("LAW: states what the contract itself provides on limitation",
        f"PASS if the analysis states what the contract says about the limitation "
        f"period ({c.contract_clause}) rather than passing over it. FAIL if the "
        f"contract term is not addressed.", "oracle")

    add("PROCEDURE: states the defence actually raised",
        f"PASS if the analysis states the defendant's position as pleaded "
        f"({c.defence}). FAIL if the defence is not addressed or is misdescribed.",
        "expert")

    add("PARTIES: identifies the claimant",
        f"PASS if the analysis identifies {c.claimant} as claimant. FAIL if the "
        f"claimant is wrong or the roles are reversed.", "oracle")
    add("PARTIES: identifies the defendant",
        f"PASS if the analysis identifies {c.defendant} as defendant. FAIL if the "
        f"defendant is wrong or the roles are reversed.", "oracle")
    add("PARTIES: states the claimant's ЄДРПОУ code",
        f"PASS if the analysis gives the claimant's ЄДРПОУ code as "
        f"{c.claimant_code}. FAIL if it is absent or wrong.", "oracle")
    add("PARTIES: states the defendant's ЄДРПОУ code",
        f"PASS if the analysis gives the defendant's ЄДРПОУ code as "
        f"{c.defendant_code}. FAIL if it is absent or wrong.", "oracle")

    add("AMOUNTS: states the principal sum",
        f"PASS if the analysis states the principal claim as {uah(c.debt)} UAH. "
        f"FAIL if it gives a different amount.", "oracle")

    add("Answers the question the client actually asked",
        f"PASS if the analysis answers the client's question ({c.question}) in "
        f"terms, rather than only setting out the law. FAIL if the answer must be "
        f"inferred by the reader.", "expert")
    add("Does not invent a rule the workspace does not support",
        "PASS if every proposition of law in the analysis is either a provision of "
        "the Civil Code identified by number or a fact taken from the supplied "
        "documents. FAIL if the analysis relies on a rule it neither names nor "
        "grounds.", "expert")
    add("Written in Ukrainian",
        "PASS if the text of the deliverable is written in Ukrainian. FAIL if any "
        "heading or standing phrase in the text is in English or Russian. The file "
        "name is set by the instructions and is not assessed here.")

    cfg = {
        "title": c.title, "work_type": "analyze",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["Litigation (General)", "limitation-period", "civil-code-ukraine",
                 "ukraine", "martial-law"],
        "instructions": (
            f"Ознайомтеся з матеріалами справи та підготуйте для клієнта "
            f"(позивача) аналіз: {c.question}. Застосовуйте законодавство в "
            f"редакції, чинній станом на дату ухвалення рішення суду першої "
            f"інстанції ({c.judgment}). Результат: `{DELIV}`."
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
    total = 0
    for c in C:
        t = build(c, root)
        n = len(json.loads((t / "task.json").read_text(encoding="utf-8"))["criteria"])
        total += n
        print(f"{t.relative_to(root)}: {n} criteria, "
              f"{len(list((t/'documents').iterdir()))} documents")
    print(f"\n{len(C)} litigation scenarios, {total} criteria")


if __name__ == "__main__":
    main()
