#!/usr/bin/env python3
"""Pilot task of the shape that closes the density gap: review a draft against a real statute.

The gap to upstream was measured on 2026-08-11 and it is a VOLUME gap, not a convention one:
upstream workspaces carry 32,711 words at the median and ours carried 299, so their tasks yield
56 findings and ours yielded 29 no matter how the criteria were sliced. Two attempts at closing
it by decomposition produced padding and were reverted.

This closes it with material instead. The workspace holds the actual text of the ТОВ/ТДВ Act
(nreg 2275-19, edition 20260101, 14,306 words, taken from the harvest in /data/rada_npa/texts)
plus a draft charter carrying planted defects. Every defect contradicts text that was READ from
that edition, quoted below next to the clause it breaks, so no criterion rests on recall.

Two clauses are deliberately LAWFUL but look wrong: a three-year payout term, which part 7 and
part 12 of Article 24 expressly let the charter set, and a director-level threshold for large
transactions, which part 2 of Article 44 permits with "якщо інше не передбачено статутом". A
review that flags them is over-flagging, and criteria test that it does not. Upstream rubrics
do the same, and without them the task rewards indiscriminate suspicion.

Usage:
    uv run --with python-docx --with openpyxl python ua_statut.py <tasks_root>
"""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from ua_pack import doc, synth, uah

ACT = Path(__file__).with_name("act_2275.json")
DELIV = "visnovok-shchodo-proyektu-statutu.docx"

COMPANY = 'ТОВ "ГІРСЬКА ЕНЕРГОСЕРВІСНА КОМПАНІЯ"'
CODE = synth("43219876")
P1, P1_SHARE = "Ковальчук Оксана Тарасівна", 62
P2, P2_SHARE = "Гнатюк Роман Ілліч", 30
P3, P3_SHARE = 'ТОВ "ЕНЕРГОПРОЕКТ ЗАХІД"', 8
P3_CODE = synth("44328765")
CAPITAL = 8_400_000
MEETING = "18.02.2026"


@dataclass
class Defect:
    """A charter clause that contradicts the Act, with the text it contradicts."""
    clause: str          # numbering inside the draft charter
    heading: str
    text: str            # the clause as drafted
    article: str         # the provision it breaks, as cited in criteria
    breach: str          # what is wrong with it
    fix: str             # what a correct clause must say


@dataclass
class Lawful:
    """A clause that looks aggressive but the Act expressly permits."""
    clause: str
    heading: str
    text: str
    article: str
    why: str


DEFECTS = [
    Defect("4.6", "Вихід учасника",
           "Учасник товариства може вийти з товариства виключно за письмовою "
           "згодою всіх інших учасників, незалежно від розміру його частки.",
           "частина перша статті 24",
           "the Act lets a member holding LESS than 50 per cent leave at any time "
           "without anyone's consent, so requiring consent from every member "
           "regardless of size takes away a right the Act confers",
           "a member with under 50 per cent may leave at will; only a holder of 50 "
           "per cent or more needs the consent of the others"),
    Defect("4.9", "Вихід останнього учасника",
           "У разі виходу останнього учасника товариство продовжує діяльність до "
           "моменту прийняття рішення про його припинення.",
           "частина п'ята статті 24",
           "the Act forbids an exit that would leave the company with no members at "
           "all; this clause contemplates exactly that",
           "an exit leaving no members is prohibited"),
    Defect("4.12", "Розрахунок з учасником, що вийшов",
           "Товариство виплачує учаснику, що вийшов, вартість його частки у "
           "повному розмірі незалежно від того, чи оплатив він свій вклад.",
           "частина десята статті 24",
           "the Act pays out only in proportion to the PAID-UP part of the share, so "
           "paying in full regardless of contribution is contrary to it",
           "payment is proportionate to the paid-up part of the share"),
    Defect("5.3", "Переважне право: строк на позов",
           "Учасник, чиє переважне право порушено, може звернутися до суду "
           "протягом трьох років.",
           "частина п'ята статті 20",
           "the Act fixes limitation for that claim at ONE year, and the charter "
           "cannot restate it as three",
           "limitation for a claim to transfer the buyer's rights is one year"),
    Defect("5.7", "Скасування переважного права",
           "Положення про переважне право може бути виключене зі статуту рішенням "
           "загальних зборів, прийнятим простою більшістю голосів.",
           "частина шоста статті 20",
           "provisions on the pre-emption right may be introduced, changed or "
           "removed only by a UNANIMOUS decision of a meeting attended by every "
           "member, not by simple majority",
           "removal requires unanimity of all members participating"),
    Defect("7.4", "Кворум та більшість для змін до статуту",
           "Рішення про внесення змін до статуту приймається простою більшістю "
           "голосів учасників, присутніх на загальних зборах.",
           "частина друга статті 34 у зв'язку з пунктом 2 частини другої статті 30",
           "amending the charter needs three quarters of the votes of ALL members "
           "entitled to vote, not a simple majority of those present",
           "three quarters of the votes of all members entitled to vote"),
    Defect("7.6", "Грошова оцінка негрошового вкладу",
           "Затвердження грошової оцінки негрошового вкладу учасника здійснюється "
           "трьома чвертями голосів усіх учасників.",
           "частина третя статті 34 у зв'язку з пунктом 4 частини другої статті 30",
           "that decision must be UNANIMOUS among the members entitled to vote, and "
           "part 5 of Article 34 does not let the charter lower a decision the Act "
           "requires to be unanimous",
           "unanimity of all members entitled to vote"),
    Defect("8.2", "Компетенція наглядової ради",
           "До виключної компетенції наглядової ради належить зміна розміру "
           "статутного капіталу товариства.",
           "частина третя статті 30",
           "questions listed in part 2 of Article 30, which include changing the "
           "share capital, cannot be moved to another organ of the company",
           "changing the share capital stays with the general meeting"),
    Defect("9.5", "Дивіденди учаснику, який не вніс вклад",
           "Дивіденди виплачуються всім учасникам пропорційно до їхніх часток, у "
           "тому числі учасникам, які не внесли вклад повністю.",
           "частина третя статті 27",
           "the Act forbids paying dividends to a member who has not made his "
           "contribution in full or in part",
           "no dividend to a member who has not paid in his contribution"),
    Defect("9.7", "Виплата дивідендів за недостатності майна",
           "Наявність незадоволених вимог кредиторів не є перешкодою для прийняття "
           "рішення про виплату дивідендів.",
           "пункт 2 частини першої статті 27",
           "the Act bars a dividend decision where the company's property is, or "
           "would become, insufficient to meet creditor claims already due",
           "no dividend where property is or would become insufficient for due "
           "creditor claims"),
    Defect("1.4", "Підписання першої редакції статуту",
           "Першу редакцію статуту підписує голова загальних зборів учасників; "
           "нотаріальне засвідчення підписів не вимагається.",
           "частина друга статті 11",
           "the first version of the charter is signed by ALL members and the "
           "signatures are notarised",
           "signature by every member with notarised signatures"),
    Defect("12.1", "Значний правочин, вчинений з порушенням",
           "Правочин, вчинений з порушенням встановленого цим статутом порядку "
           "надання згоди, є нікчемним.",
           "частина перша статті 46",
           "such a transaction is not void: it creates rights and obligations for "
           "the company if the company subsequently approves it in the same manner "
           "prescribed for consent",
           "the transaction binds the company upon subsequent approval"),
]

# Missing rather than wrong: mandatory content the draft simply omits.
OMISSION = Defect(
    "-", "Облік часток в обліковій системі",
    "(у проєкті відсутні)",
    "пункт 4 частини п'ятої статті 11",
    "the charter must state how the company's shares are recorded in the share "
    "accounting system kept by the Central Securities Depository, and the draft "
    "says nothing about it",
    "a clause on recording shares in the share accounting system")

LAWFUL = [
    Lawful("4.14", "Строк виплати вартості частки",
           "Вартість частки виплачується учаснику, що вийшов, протягом трьох років "
           "з дня, коли товариство дізналося про вихід.",
           "частини сьома і дванадцята статті 24",
           "the one-year period is the default and the charter is expressly allowed "
           "to set a different period, so a three-year term is lawful however "
           "unattractive it is to a departing member"),
    Lawful("12.3", "Поріг значного правочину",
           "Рішення про надання згоди на правочин, вартість предмета якого "
           "перевищує 50 відсотків вартості чистих активів товариства, приймає "
           "директор одноосібно.",
           "частина друга статті 44",
           "that rule applies 'якщо інше не передбачено статутом', so the charter "
           "may place the decision elsewhere, including with the director"),
]

# Neutral clauses, so the draft reads as a charter rather than a list of traps.
FILLER = [
    ("1.1", "Загальні положення",
     f"{COMPANY} (далі - Товариство) створене та діє відповідно до Цивільного "
     f"кодексу України, Господарського кодексу України, Закону України \"Про "
     f"товариства з обмеженою та додатковою відповідальністю\" та цього Статуту."),
    ("1.2", "Найменування",
     f"Повне найменування: {COMPANY}. Скорочене найменування: ТОВ \"ГЕСК\"."),
    ("1.3", "Місцезнаходження",
     "Місцезнаходження Товариства: 79008, м. Львів, вул. Староміська, 14, офіс 3."),
    ("2.1", "Мета та предмет діяльності",
     "Товариство створене з метою одержання прибутку шляхом провадження "
     "господарської діяльності у сфері постачання, монтажу та сервісного "
     "обслуговування енергетичного обладнання, виконання пусконалагоджувальних "
     "робіт та надання інжинірингових послуг."),
    ("2.2", "Правовий статус",
     "Товариство є юридичною особою приватного права, має самостійний баланс, "
     "рахунки в банках, печатку зі своїм найменуванням, бланки та інші реквізити."),
    ("3.1", "Статутний капітал",
     f"Статутний капітал Товариства становить {uah(CAPITAL)},00 грн."),
    ("3.2", "Частки учасників",
     f"{P1} - {P1_SHARE} відсотків статутного капіталу; "
     f"{P2} - {P2_SHARE} відсотків; {P3} (код ЄДРПОУ {P3_CODE}) - {P3_SHARE} відсотків."),
    ("3.4", "Внесення вкладів",
     "Вклади вносяться учасниками у грошовій або негрошовій формі у строк, що не "
     "перевищує шести місяців з дати державної реєстрації Товариства, якщо інше "
     "не встановлено рішенням загальних зборів."),
    ("6.1", "Права учасників",
     "Учасники Товариства мають право брати участь в управлінні Товариством, "
     "отримувати інформацію про господарську діяльність Товариства, одержувати "
     "частину прибутку, здійснювати відчуження часток у порядку, встановленому "
     "законом і цим Статутом."),
    ("6.2", "Обов'язки учасників",
     "Учасники зобов'язані дотримуватися цього Статуту, виконувати рішення "
     "загальних зборів, вносити вклади у розмірі, порядку та засобами, що "
     "передбачені цим Статутом, не розголошувати комерційну таємницю Товариства."),
    ("7.1", "Загальні збори учасників",
     "Вищим органом Товариства є загальні збори учасників. Кожен учасник має "
     "кількість голосів, пропорційну розміру його частки у статутному капіталі."),
    # This clause used to end "зазначену в обліковій системі", which collided with the
    # omission: the charter is supposed to say NOTHING about the share accounting system,
    # and a reviewer could fairly point here and say it does. The notice address does not
    # need to come from there, so it no longer does.
    ("7.2", "Скликання загальних зборів",
     "Загальні збори скликаються виконавчим органом. Повідомлення надсилається не "
     "менше ніж за 30 днів до дати проведення зборів на адресу кожного учасника, "
     "зазначену в переліку учасників Товариства."),
    ("8.1", "Наглядова рада",
     "Товариство утворює наглядову раду у складі трьох членів, які обираються "
     "загальними зборами строком на три роки."),
    ("10.1", "Виконавчий орган",
     "Виконавчим органом Товариства є одноосібний директор, який обирається "
     "загальними зборами учасників."),
    ("10.3", "Повноваження директора",
     "Директор діє від імені Товариства без довіреності, укладає правочини, видає "
     "накази, затверджує штатний розпис, приймає та звільняє працівників."),
    ("11.1", "Аудит",
     "Товариство проводить аудит фінансової звітності на вимогу учасника або "
     "учасників, які разом володіють 10 і більше відсотками статутного капіталу."),
    ("13.1", "Зберігання документів",
     "Товариство зберігає статут, протоколи загальних зборів, документи звітності "
     "та інші документи за своїм місцезнаходженням."),
    ("14.1", "Припинення Товариства",
     "Товариство припиняється в результаті реорганізації або ліквідації за "
     "рішенням загальних зборів учасників або за рішенням суду."),
]


def charter_body():
    """Assemble the draft in clause order so it reads as one instrument."""
    rows = [(d.clause, d.heading, d.text) for d in DEFECTS]
    rows += [(l.clause, l.heading, l.text) for l in LAWFUL]
    rows += FILLER

    def key(r):
        return [int(x) for x in r[0].split(".")]

    return sorted(rows, key=key)


def build_docs(d: Path, act) -> None:
    d.mkdir(parents=True, exist_ok=True)

    doc(d / "zapyt-kliyenta.docx", "ЗАПИТ КЛІЄНТА", [
        ("p", f"Ми готуємо до затвердження нову редакцію статуту {COMPANY}."),
        ("p", f"Загальні збори призначено на {MEETING}."),
        ("b", "Просимо перевірити проєкт статуту на відповідність Закону України "
              "\"Про товариства з обмеженою та додатковою відповідальністю\" у "
              "редакції, чинній на дату загальних зборів."),
        ("p", "За кожним виявленим невідповідністю зазначте: пункт проєкту, норму "
              "Закону, у чому полягає невідповідність, та як пункт має бути "
              "викладений."),
        ("p", "Окремо підтвердіть ті положення, які нам радили змінити, але які, на "
              "вашу думку, Закону не суперечать - ми не хочемо переписувати те, що "
              "закон дозволяє."),
    ])

    doc(d / "proyekt-statutu.docx", f"ПРОЄКТ СТАТУТУ {COMPANY}",
        [("p", "Затверджено загальними зборами учасників (проєкт)")]
        + [x for clause, heading, text in charter_body()
           for x in (("h", f"{clause}. {heading}"), ("p", text))])

    doc(d / "vytyag-EDR.docx", "ВИТЯГ З ЄДР", [
        ("p", f"Найменування: {COMPANY}"),
        ("p", f"Код ЄДРПОУ: {CODE}"),
        ("p", "Стан: зареєстровано"),
        ("p", f"Розмір статутного капіталу: {uah(CAPITAL)},00 грн"),
        ("h", "Учасники"),
        ("p", f"{P1}; розмір частки - {P1_SHARE}%"),
        ("p", f"{P2}; розмір частки - {P2_SHARE}%"),
        ("p", f"{P3}, код ЄДРПОУ {P3_CODE}; розмір частки - {P3_SHARE}%"),
        ("h", "Керівник"),
        ("p", P2),
    ])

    doc(d / "protokol-zboriv.docx", "ПРОТОКОЛ (проєкт порядку денного)", [
        ("p", f"Загальні збори учасників {COMPANY}"),
        ("p", f"Дата проведення: {MEETING}"),
        ("h", "Порядок денний"),
        ("p", "1. Затвердження нової редакції статуту Товариства."),
        ("p", "2. Затвердження грошової оцінки негрошового вкладу учасника "
              f"{P3} (обладнання)."),
        ("p", "3. Про виплату дивідендів за результатами 2025 року."),
        ("p", f"Присутні: {P1}, {P2}. Учасник {P3} участі не бере."),
    ])

    # The Act itself, verbatim from the harvested edition. This is what takes the
    # workspace from a page to the size upstream tasks work at.
    doc(d / "zakon-2275-19.docx",
        f"ЗАКОН УКРАЇНИ \"Про товариства з обмеженою та додатковою "
        f"відповідальністю\" (редакція від {act['ed_date']})",
        [("p", para) for para in act["text"].split("\n") if para.strip()])


def build_criteria() -> list:
    out, n = [], 0

    def add(title, match, source="oracle"):
        nonlocal n
        n += 1
        out.append({"id": f"C-{n:03d}", "title": title, "deliverables": [DELIV],
                    "match_criteria": match, "source": source})

    for i, df in enumerate(DEFECTS, 1):
        tag = f"ISSUE_{i:03d} (п. {df.clause})"
        add(f"{tag}: identifies the defect",
            f"PASS if the opinion identifies clause {df.clause} of the draft "
            f"charter as contrary to the Act. FAIL if the clause is not raised, or "
            f"is reported as compliant.")
        add(f"{tag}: names the provision it breaks",
            f"PASS if the opinion cites {df.article} of the ТОВ/ТДВ Act as the "
            f"provision that clause {df.clause} breaks. FAIL if no provision is "
            f"named, or a different one is.")
        add(f"{tag}: states what is wrong and how to fix it",
            f"PASS if the opinion conveys that {df.breach}, and says the clause "
            f"should instead provide for {df.fix}. Judge on substance, not wording. "
            f"FAIL if the clause is flagged with no reason, or the correction "
            f"contradicts the Act.", "expert")

    add("ISSUE_013 (missing clause): identifies the omission",
        f"PASS if the opinion states that the draft is missing the information "
        f"required by {OMISSION.article} — {OMISSION.breach}. FAIL if the omission "
        f"is not raised.")
    add("ISSUE_013 (missing clause): says what must be added",
        f"PASS if the opinion says the charter must include {OMISSION.fix}. FAIL if "
        f"the gap is noted without saying what has to go in.", "expert")

    for i, lw in enumerate(LAWFUL, 1):
        add(f"OVER-FLAGGING {i}: does not treat clause {lw.clause} as unlawful",
            f"PASS if the opinion does NOT state that clause {lw.clause} breaches "
            f"the Act. It may call the clause commercially unattractive or advise "
            f"changing it, which is not a breach. FAIL if the clause is listed as a "
            f"non-compliance.", "expert")
        add(f"OVER-FLAGGING {i}: explains why clause {lw.clause} is permitted",
            f"PASS if the opinion explains that {lw.why}, citing {lw.article}. FAIL "
            f"if the clause is passed over in silence with no reason given.",
            "expert")

    add("Applies the edition in force at the meeting date",
        f"PASS if the opinion works from the Act as it stood on {MEETING}, which is "
        f"the edition supplied in the workspace. FAIL if it relies on a provision "
        f"that is not in the supplied text.")
    add("Does not invent defects the Act does not support",
        "PASS if every non-compliance asserted is tied to a provision of the Act "
        "that actually says what the opinion claims. FAIL if any asserted breach "
        "cannot be traced to the supplied text of the Act.", "expert")
    add("Gives the client a usable list rather than an essay",
        "PASS if the findings are set out clause by clause, so each one can be "
        "acted on separately. FAIL if the analysis is continuous prose in which the "
        "individual defects cannot be told apart.", "expert")
    add("Written in Ukrainian",
        "PASS if the text of the deliverable is written in Ukrainian. FAIL if any "
        "heading or standing phrase in the text is in English or Russian. The file "
        "name is set by the instructions and is not assessed here.", "expert")
    return out


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    act = json.loads(ACT.read_text(encoding="utf-8"))
    t = root / "corporate-ma" / "ua-statut-tov-compliance-review"
    build_docs(t / "documents", act)

    cfg = {
        "title": "Перевірка проєкту статуту ТОВ на відповідність Закону 2275-VIII",
        "work_type": "review",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["Corporate M&A", "charter-review", "statutory-compliance",
                 "ukraine", "llc"],
        "instructions": (
            f"Клієнт готує нову редакцію статуту {COMPANY} до затвердження "
            f"загальними зборами {MEETING}. Перевірте проєкт статуту на "
            f"відповідність Закону України \"Про товариства з обмеженою та "
            f"додатковою відповідальністю\", текст якого надано у матеріалах. "
            f"За кожним пунктом, що суперечить Закону, зазначте норму та як його "
            f"слід викласти; окремо підтвердіть положення, які Закону не "
            f"суперечать. Результат: `{DELIV}`."
        ),
        "deliverables": {DELIV: DELIV},
        "criteria": build_criteria(),
    }
    t.mkdir(parents=True, exist_ok=True)
    (t / "task.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    words = sum(len(x.split()) for _, _, x in charter_body()) + len(act["text"].split())
    print(f"{t.relative_to(root)}: {len(cfg['criteria'])} criteria, "
          f"{len(list((t / 'documents').iterdir()))} documents, "
          f"~{words:,} words in the workspace")


if __name__ == "__main__":
    main()
