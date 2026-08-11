#!/usr/bin/env python3
"""Seven more review tasks of the shape that closes the density gap.

The pilot (corporate-ma/ua-statut-tov-compliance-review) established the form: put the real
text of the governing act in the workspace, hand the agent a drafted instrument, and ask which
clauses break which provision. Workspace volume is what upstream density actually tracks —
32,711 words at their median against 299 at ours — and a real statute supplies it honestly,
where slicing facts finer did not.

Grounding is enforced by construction here rather than by a separate checker. Every defect
carries the exact words of the provision it relies on, and build() asserts those words are in
the cited article of the harvested edition. A quote that has drifted, or an article number that
is wrong, fails the build instead of producing a criterion the model can only pass by luck.

Editions are the ones in force on the matter date, not the latest: the register carries
future-dated editions and three of these acts have them.

Usage:
    uv run --with python-docx --with openpyxl python ua_review.py <tasks_root>
"""

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from ua_pack import doc, synth, uah

ACTS = json.loads(Path(__file__).with_name("acts.json").read_text(encoding="utf-8"))


@dataclass
class Defect:
    clause: str
    heading: str
    text: str            # the clause as drafted
    art: int             # article of the act it breaks
    cite: str            # how the criterion names the provision
    quote: str           # exact words of the provision, asserted against the act
    breach: str
    fix: str


@dataclass
class Lawful:
    clause: str
    heading: str
    text: str
    art: int
    cite: str
    quote: str
    why: str


@dataclass
class Omission:
    art: int
    cite: str
    quote: str
    missing: str
    add: str


@dataclass
class Spec:
    slug: str
    area: str
    nreg: str
    title: str
    instrument: str      # what the drafted document is called
    deliverable: str
    matter_date: str
    request: list        # extra paragraphs for the client request
    parties: list        # (label, value) for the supporting extract
    defects: list
    lawful: list
    omission: Omission
    filler: list = field(default_factory=list)


def ed_human(stamp: str) -> str:
    """20260424 -> 24.04.2026, the way a date is written in a Ukrainian document."""
    return f"{stamp[6:]}.{stamp[4:6]}.{stamp[:4]}"


def norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("`", "'")).strip()


SPECS = [
    Spec(
        slug="ua-dogovir-orendy-zemli-review", area="real-estate", nreg="161-14",
        title="Перевірка проєкту договору оренди землі на відповідність Закону",
        instrument="проєкт договору оренди землі",
        deliverable="visnovok-shchodo-dogovoru-orendy.docx",
        matter_date="06.03.2026",
        request=["Ділянка сільськогосподарського призначення для ведення товарного "
                 "сільськогосподарського виробництва.",
                 "Ділянка перебуває у комунальній власності та була передана в оренду "
                 "за результатами земельних торгів."],
        parties=[("Орендодавець", "Гірська селищна рада"),
                 ("Орендар", 'ТОВ "АГРОПОЛЕ СХІД"'),
                 ("Кадастровий номер", "3222483600:04:012:0117"),
                 ("Площа", "48,6 га")],
        defects=[
            Defect("3.1", "Строк дії договору",
                   "Договір укладається строком на 75 років.",
                   19, "частина перша статті 19",
                   "не може перевищувати 50 років",
                   "the Act caps a land lease at 50 years",
                   "a term of no more than 50 years"),
            Defect("3.2", "Мінімальний строк",
                   "Сторони погодили, що строк оренди становить 5 років.",
                   19, "частина третя статті 19",
                   "не може бути меншим як 7 років",
                   "for land let for commodity agricultural production the term cannot "
                   "be shorter than seven years",
                   "a term of at least seven years"),
            Defect("5.4", "Зменшення орендної плати",
                   "Орендна плата може бути зменшена за письмовою згодою сторін у "
                   "будь-який час протягом строку дії договору.",
                   23, "частина четверта статті 23",
                   "не може бути зменшена за згодою сторін протягом строку дії договору",
                   "rent for communal land let at auction cannot be reduced by agreement "
                   "during the term",
                   "no reduction by agreement for land let at auction"),
            Defect("1.5", "Нотаріальне посвідчення",
                   "Договір не підлягає нотаріальному посвідченню, і жодна із сторін "
                   "не вправі вимагати такого посвідчення.",
                   14, "частина перша статті 14",
                   "за бажанням однієї із сторін може бути посвідчений нотаріально",
                   "either party may ask for the lease to be notarised, so the clause "
                   "takes away a right the Act gives",
                   "notarisation at the wish of either party"),
            Defect("9.3", "Наслідки недійсності",
                   "У разі визнання договору недійсним орендодавець повертає орендарю "
                   "всю сплачену орендну плату.",
                   21, "стаття 21",
                   "не повертається",
                   "rent already received for the actual period of use is not returned "
                   "when a land lease is declared invalid",
                   "rent for the actual period of use is not returned"),
        ],
        lawful=[
            Lawful("5.6", "Індексація орендної плати",
                   "Розмір орендної плати не підлягає індексації.",
                   21, "стаття 21", "якщо інше не передбачено договором оренди",
                   "indexation is the default only where the contract is silent, and the "
                   "Act lets the contract provide otherwise"),
            Lawful("2.2", "Кілька ділянок",
                   "Цей договір поширюється на дві земельні ділянки одного орендодавця.",
                   15, "частина четверта статті 15",
                   "надання в оренду декількох земельних ділянок",
                   "one lease may cover several plots of the same lessor"),
        ],
        omission=Omission(15, "стаття 15", "відповідальності за її несплату",
                          "the rent clause says nothing about liability for non-payment, "
                          "which the Act lists among the essential terms",
                          "a term on liability for failure to pay rent"),
        filler=[
            ("1.1", "Сторони", "Договір укладено між Гірською селищною радою "
                               "(Орендодавець) та ТОВ \"АГРОПОЛЕ СХІД\" (Орендар)."),
            ("2.1", "Об'єкт оренди", "В оренду передається земельна ділянка площею "
                                     "48,6 га, кадастровий номер 3222483600:04:012:0117."),
            ("5.1", "Розмір орендної плати", "Орендна плата становить 12 відсотків "
                                             "нормативної грошової оцінки на рік."),
            ("5.2", "Строки внесення", "Орендна плата вноситься щоквартально до 30 числа "
                                       "місяця, наступного за звітним кварталом."),
            ("6.1", "Обов'язки орендаря", "Орендар зобов'язаний використовувати ділянку "
                                          "за цільовим призначенням, додержуватися вимог "
                                          "земельного законодавства."),
            ("7.1", "Обов'язки орендодавця", "Орендодавець зобов'язаний передати ділянку "
                                             "у користування у стані, що відповідає "
                                             "умовам договору."),
            ("8.1", "Передача ділянки", "Передача ділянки оформлюється актом "
                                        "приймання-передачі."),
        ],
    ),
    Spec(
        slug="ua-polityka-personalnyh-danyh-review", area="data-privacy-cybersecurity", nreg="2297-17",
        title="Перевірка політики обробки персональних даних на відповідність Закону",
        instrument="проєкт політики обробки персональних даних",
        deliverable="visnovok-shchodo-polityky.docx",
        matter_date="24.03.2026",
        request=["Політику планується оприлюднити на сайті та застосовувати до клієнтів "
                 "і працівників."],
        parties=[("Володілець персональних даних", 'ТОВ "МЕДТЕХ СЕРВІС"'),
                 ("Код ЄДРПОУ", synth("42876543")),
                 ("Сфера обробки", "клієнти сервісного центру, працівники")],
        defects=[
            Defect("4.2", "Строк відповіді на запит",
                   "Відповідь на запит суб'єкта персональних даних надається протягом "
                   "60 календарних днів з дня його надходження.",
                   8, "пункт 4 частини другої статті 8",
                   "не пізніш як за тридцять календарних днів",
                   "the Act gives the data subject an answer within thirty calendar days",
                   "an answer within thirty calendar days"),
            Defect("3.5", "Повідомлення про збирання",
                   "Якщо дані отримано не від суб'єкта, Товариство повідомляє його "
                   "протягом шести місяців з дня збору.",
                   12, "частина друга статті 12",
                   "протягом тридцяти робочих днів з дня збору",
                   "the Act allows thirty working days, not six months",
                   "notification within thirty working days"),
            Defect("2.4", "Зміна мети обробки",
                   "Товариство вправі в односторонньому порядку змінювати мету обробки "
                   "без отримання нової згоди.",
                   6, "частина перша статті 6",
                   "повинен отримати згоду суб'єкта персональних даних на обробку його "
                   "даних відповідно до зміненої мети",
                   "a change to a purpose incompatible with the original requires fresh "
                   "consent",
                   "fresh consent where the new purpose is incompatible"),
            Defect("2.6", "Обсяг даних",
                   "Товариство збирає будь-які дані, які вважає корисними для розвитку "
                   "бізнесу.",
                   6, "частина третя статті 6",
                   "відповідними, адекватними та ненадмірними",
                   "the composition of data must be relevant, adequate and not excessive "
                   "for the stated purpose",
                   "collection limited to what the stated purpose requires"),
            Defect("5.1", "Строк зберігання",
                   "Персональні дані зберігаються безстроково, у тому числі після "
                   "припинення відносин із суб'єктом.",
                   15, "пункт 2 частини другої статті 15",
                   "припинення правовідносин між суб'єктом персональних даних та "
                   "володільцем",
                   "data must be erased or destroyed when the relationship ends, unless "
                   "the law provides otherwise",
                   "erasure when the relationship ends"),
        ],
        lawful=[
            Lawful("2.2", "Обробка без згоди",
                   "Товариство обробляє дані клієнта без окремої згоди, якщо обробка "
                   "потрібна для укладення та виконання договору з ним.",
                   11, "пункт 3 частини першої статті 11",
                   "укладення та виконання правочину, стороною якого є суб'єкт "
                   "персональних даних",
                   "consent is one ground among several, and performance of a contract "
                   "with the data subject is itself a ground"),
        ],
        omission=Omission(8, "пункт 2 частини другої статті 8",
                          "інформацію про третіх осіб, яким передаються його персональні дані",
                          "the policy never says who the data are passed to, although the "
                          "data subject has a right to that information",
                          "a statement of the third parties the data are transferred to"),
        filler=[
            ("1.1", "Загальні положення", "Ця Політика визначає порядок обробки "
                                          "персональних даних у ТОВ \"МЕДТЕХ СЕРВІС\"."),
            ("2.1", "Мета обробки", "Дані обробляються з метою надання сервісних послуг "
                                    "та виконання вимог законодавства."),
            ("3.1", "Джерела даних", "Дані збираються безпосередньо від суб'єкта під час "
                                     "оформлення заявки на обслуговування."),
            ("4.1", "Права суб'єкта", "Суб'єкт має право знати про джерела збирання, мету "
                                      "обробки та місцезнаходження володільця."),
            ("6.1", "Захист даних", "Товариство вживає організаційних і технічних заходів "
                                    "для захисту даних від незаконної обробки."),
            ("7.1", "Відповідальна особа", "Обов'язки щодо організації роботи із захисту "
                                           "даних покладено на керівника ІТ-відділу."),
        ],
    ),
    Spec(
        slug="ua-polozhennya-ohorona-praci-review", area="employment-labor", nreg="2694-12",
        title="Перевірка положення про охорону праці на відповідність Закону",
        instrument="проєкт положення про систему управління охороною праці",
        deliverable="visnovok-shchodo-polozhennya.docx",
        matter_date="19.05.2026",
        request=["На підприємстві є роботи з підвищеною небезпекою та працівники віком "
                 "до 21 року."],
        parties=[("Роботодавець", 'ТОВ "ЛИВАРНИЙ ЗАВОД ПІВНІЧ"'),
                 ("Код ЄДРПОУ", synth("41987654")),
                 ("Чисельність працівників", "214"),
                 ("Фонд оплати праці за попередній рік", f"{uah(38_600_000)} грн")],
        defects=[
            Defect("6.1", "Витрати на охорону праці",
                   "Витрати на охорону праці плануються у розмірі 0,2 відсотка від фонду "
                   "оплати праці за попередній рік.",
                   19, "частина третя статті 19",
                   "не менше 0,5 відсотка від фонду оплати праці за попередній рік",
                   "the Act sets a floor of 0.5 per cent of the previous year's payroll",
                   "at least 0.5 per cent of the previous year's payroll"),
            Defect("4.2", "Оплата медичних оглядів",
                   "Попередній та періодичні медичні огляди оплачуються працівником "
                   "самостійно з подальшою компенсацією на розсуд роботодавця.",
                   17, "частина перша статті 17",
                   "за свої кошти забезпечити фінансування та організувати проведення "
                   "попереднього",
                   "the employer must finance and organise those examinations at its own "
                   "expense",
                   "examinations financed and organised by the employer"),
            Defect("4.5", "Ухилення від медогляду",
                   "Працівник, який ухиляється від обов'язкового медичного огляду, може "
                   "бути відсторонений від роботи зі збереженням середнього заробітку.",
                   17, "частина друга статті 17",
                   "зобов'язаний відсторонити його від роботи без збереження заробітної плати",
                   "the employer is obliged to suspend such a worker without pay, so the "
                   "clause is wrong both on the duty and on the pay",
                   "mandatory suspension without pay"),
            Defect("4.7", "Щорічний огляд молодих працівників",
                   "Щорічному обов'язковому медичному огляду підлягають працівники віком "
                   "до 18 років.",
                   17, "частина перша статті 17",
                   "щорічного обов'язкового медичного огляду осіб віком до 21 року",
                   "the annual examination covers workers under 21, not under 18",
                   "annual examination of workers under 21"),
            Defect("6.3", "Джерела фінансування",
                   "Фінансування заходів з охорони праці здійснюється роботодавцем та "
                   "частково за рахунок утримань із заробітної плати працівників.",
                   19, "частина перша статті 19",
                   "Фінансування охорони праці здійснюється роботодавцем",
                   "occupational safety is financed by the employer, and deductions from "
                   "wages are not a source of it",
                   "financing by the employer alone"),
        ],
        lawful=[
            Lawful("2.4", "Комплексні заходи у колдоговорі",
                   "Комплексні заходи з охорони праці розробляються за участю сторін "
                   "колективного договору.",
                   13, "стаття 13",
                   "розробляє за участю сторін колективного договору",
                   "the Act itself has the employer draw those measures with the parties "
                   "to the collective agreement"),
        ],
        omission=Omission(5, "частина друга статті 5",
                          "поінформувати працівника під розписку про умови праці",
                          "nothing in the draft requires the worker to be informed against "
                          "signature about working conditions and the hazards not yet "
                          "eliminated at the workplace",
                          "informing the worker against signature on hiring"),
        filler=[
            ("1.1", "Призначення положення", "Це Положення визначає систему управління "
                                             "охороною праці на підприємстві."),
            ("2.1", "Обов'язки роботодавця", "Роботодавець створює умови праці відповідно "
                                             "до нормативно-правових актів з охорони праці."),
            ("3.1", "Служба охорони праці", "На підприємстві створюється служба охорони "
                                            "праці у складі двох осіб."),
            ("3.4", "Комісія з питань охорони праці", "Рішенням трудового колективу може "
                                                      "створюватися комісія з питань "
                                                      "охорони праці."),
            ("5.1", "Навчання", "Працівники проходять навчання та перевірку знань з "
                                "питань охорони праці під час прийняття на роботу."),
            ("7.1", "Розслідування нещасних випадків", "Нещасні випадки розслідуються та "
                                                       "обліковуються в установленому "
                                                       "порядку."),
        ],
    ),
    Spec(
        slug="ua-ipotechnyi-dogovir-review", area="banking-finance", nreg="898-15",
        title="Перевірка проєкту іпотечного договору на відповідність Закону",
        instrument="проєкт іпотечного договору",
        deliverable="visnovok-shchodo-ipotechnogo-dogovoru.docx",
        matter_date="12.05.2026",
        request=["Іпотекою забезпечується кредит, наданий іпотекодавцю."],
        parties=[("Іпотекодержатель", 'ТОВ "ФІНАНСОВА КОМПАНІЯ ОРІОН"'),
                 ("Код ЄДРПОУ", synth("43765432")),
                 ("Іпотекодавець", 'ТОВ "СКЛАДСЬКІ РІШЕННЯ"'),
                 ("Код ЄДРПОУ іпотекодавця", synth("44654321")),
                 ("Основне зобов'язання", f"кредит {uah(24_000_000)} грн")],
        defects=[
            Defect("1.6", "Форма договору",
                   "Договір укладається у простій письмовій формі та не потребує "
                   "нотаріального посвідчення.",
                   18, "частина перша статті 18",
                   "підлягає нотаріальному посвідченню",
                   "a mortgage contract must be notarised",
                   "notarisation of the mortgage contract"),
            Defect("7.2", "Вимога про усунення порушення",
                   "Іпотекодержатель надсилає вимогу про усунення порушення із строком "
                   "на виконання 10 днів.",
                   35, "частина перша статті 35",
                   "у не менш ніж тридцятиденний строк",
                   "the demand must allow at least thirty days",
                   "a period of at least thirty days"),
            Defect("7.5", "Окремий договір про задоволення вимог",
                   "Окремий договір про задоволення вимог іпотекодержателя укладається у "
                   "простій письмовій формі.",
                   36, "частина перша статті 36",
                   "що підлягає нотаріальному посвідченню",
                   "that separate contract is itself subject to notarisation",
                   "notarisation of the separate satisfaction contract"),
        ],
        lawful=[
            Lawful("2.5", "Витрати на страхування",
                   "Іпотекою забезпечуються також витрати іпотекодержателя на страхування "
                   "предмета іпотеки.",
                   7, "стаття 7", "витрат на страхування предмета іпотеки",
                   "the Act itself extends the mortgage to those costs unless the contract "
                   "says otherwise"),
        ],
        omission=Omission(18, "пункт 3 частини першої статті 18",
                          "опис предмета іпотеки, достатній для його ідентифікації",
                          "the draft never describes the mortgaged property in terms "
                          "sufficient to identify it, which is an essential term",
                          "a description of the mortgaged property sufficient to identify it"),
        filler=[
            ("1.1", "Сторони", "Договір укладено між ТОВ \"ФІНАНСОВА КОМПАНІЯ ОРІОН\" "
                               "(Іпотекодержатель) та ТОВ \"СКЛАДСЬКІ РІШЕННЯ\" "
                               "(Іпотекодавець)."),
            ("2.1", "Основне зобов'язання", f"Іпотекою забезпечується кредит у розмірі "
                                            f"{uah(24_000_000)} грн."),
            ("2.2", "Строк виконання", "Строк повернення кредиту - 60 місяців з дати "
                                       "видачі."),
            ("3.1", "Права іпотекодержателя", "Іпотекодержатель має право перевіряти стан "
                                              "предмета іпотеки."),
            ("4.1", "Обов'язки іпотекодавця", "Іпотекодавець зобов'язаний вживати заходів "
                                              "для збереження предмета іпотеки."),
            ("8.1", "Вирішення спорів", "Спори вирішуються у судовому порядку за "
                                        "законодавством України."),
        ],
    ),
    Spec(
        slug="ua-spozhyvchyi-dogovir-review", area="contracts", nreg="1023-12",
        title="Перевірка публічної оферти на відповідність Закону про захист прав споживачів",
        instrument="проєкт публічної оферти (договору із споживачем)",
        deliverable="visnovok-shchodo-oferty.docx",
        matter_date="09.02.2026",
        request=["Оферту планується розмістити на сайті інтернет-магазину побутової "
                 "техніки."],
        parties=[("Продавець", 'ТОВ "ТЕХНОДІМ УКРАЇНА"'),
                 ("Код ЄДРПОУ", synth("42109876")),
                 ("Предмет", "роздрібний продаж побутової техніки")],
        defects=[
            Defect("8.1", "Обмеження відповідальності",
                   "Продавець не несе відповідальності за будь-яку шкоду, у тому числі "
                   "шкоду життю та здоров'ю споживача.",
                   18, "пункт 1 частини третьої статті 18",
                   "звільнення або обмеження юридичної відповідальності продавця "
                   "(виконавця, виробника) у разі смерті або ушкодження здоров'я споживача",
                   "the Act names exactly this as an unfair term",
                   "no exclusion of liability for death or injury"),
            Defect("6.4", "Неповернення коштів",
                   "У разі відмови споживача від договору сплачені кошти поверненню не "
                   "підлягають.",
                   18, "пункт 4 частини третьої статті 18",
                   "не повертати кошти на оплату, здійснену споживачем, у разі відмови "
                   "споживача укласти або виконати договір",
                   "retaining the consumer's payment on withdrawal, with no corresponding "
                   "compensation right, is listed as unfair",
                   "return of payment, or a matching compensation right"),
            Defect("6.6", "Штраф за відмову",
                   "У разі відмови від замовлення споживач сплачує штраф у розмірі 80 "
                   "відсотків вартості товару.",
                   18, "пункт 5 частини третьої статті 18",
                   "сплати споживачем непропорційно великої суми компенсації",
                   "requiring a disproportionately large payment from the consumer is "
                   "listed as unfair",
                   "a proportionate charge, if any"),
            Defect("5.2", "Односторонній розсуд продавця",
                   "Продавець на власний розсуд визначає, чи буде замовлення виконано, "
                   "тоді як споживач зобов'язаний оплатити його повністю наперед.",
                   18, "пункт 3 частини третьої статті 18",
                   "встановлення жорстких обов'язків споживача, тоді як надання послуги "
                   "обумовлене лише власним розсудом виконавця",
                   "binding the consumer while leaving performance to the seller's "
                   "discretion is listed as unfair",
                   "obligations that match on both sides"),
            Defect("7.3", "Права при істотних недоліках",
                   "У разі виявлення істотних недоліків споживач має право лише на "
                   "безоплатне усунення недоліків.",
                   8, "частина перша статті 8",
                   "розірвання договору та повернення сплаченої за товар грошової суми",
                   "on a substantial defect the consumer may choose termination with a "
                   "refund, or replacement, and the clause removes that choice",
                   "the consumer's choice of termination with refund or replacement"),
        ],
        lawful=[
            Lawful("4.1", "Комісійні товари",
                   "Щодо непродовольчих товарів, що були у використанні та реалізуються "
                   "через комісійну торгівлю, вимоги споживача задовольняються за згодою "
                   "продавця.",
                   8, "частина друга статті 8",
                   "задовольняються за згодою продавця",
                   "the Act itself makes those claims subject to the seller's agreement"),
        ],
        omission=Omission(15, "пункт 6 частини першої статті 15",
                          "дані про ціну (тариф), умови та правила придбання продукції",
                          "the offer never sets out the price and the conditions and rules "
                          "of purchase, which the consumer is entitled to before buying",
                          "the price and the conditions and rules of purchase"),
        filler=[
            ("1.1", "Загальні положення", "Ця оферта є пропозицією ТОВ \"ТЕХНОДІМ "
                                          "УКРАЇНА\" укласти договір купівлі-продажу."),
            ("2.1", "Акцепт", "Акцептом оферти є оформлення замовлення на сайті."),
            ("3.1", "Доставка", "Доставка здійснюється перевізником протягом п'яти "
                                "робочих днів."),
            ("9.1", "Гарантійний строк", "Гарантійний строк на товар становить 12 місяців "
                                         "з дати продажу."),
            ("10.1", "Персональні дані", "Обробка персональних даних споживача "
                                         "здійснюється згідно з політикою Продавця."),
        ],
    ),
    Spec(
        slug="ua-tenderna-dokumentaciya-review", area="contracts", nreg="922-19",
        title="Перевірка тендерної документації на відповідність Закону про публічні закупівлі",
        instrument="проєкт тендерної документації",
        deliverable="visnovok-shchodo-tendernoyi-dokumentaciyi.docx",
        matter_date="17.07.2026",
        request=["Очікувана вартість предмета закупівлі становить 9 400 000 грн.",
                 "Замовник просить перевірити документацію до її оприлюднення."],
        parties=[("Замовник", "Комунальне підприємство \"МІСЬКЕ ОСВІТЛЕННЯ\""),
                 ("Код ЄДРПОУ", synth("43219087")),
                 ("Предмет закупівлі", "світлодіодні світильники та роботи з монтажу"),
                 ("Очікувана вартість", f"{uah(9_400_000)} грн")],
        defects=[
            Defect("3.2", "Фінансова спроможність",
                   "Учасник підтверджує річний дохід (виручку) у розмірі не менше "
                   "28 200 000 грн, що втричі перевищує очікувану вартість закупівлі.",
                   16, "частина третя статті 16",
                   "не має права вимагати надання підтвердження обсягу річного доходу "
                   "(виручки) у розмірі більшому, ніж очікувана вартість предмета закупівлі",
                   "the buyer may not require turnover above the expected value of the "
                   "subject of procurement",
                   "a turnover requirement no higher than the expected value"),
            Defect("4.1", "Підтвердження публічної інформації",
                   "Учасник подає документальне підтвердження відсутності підстав, "
                   "передбачених статтею 17 Закону, у повному обсязі, у тому числі щодо "
                   "відомостей з відкритих реєстрів.",
                   22, "пункт 2 частини другої статті 22",
                   "не вимагає документального підтвердження інформації про відповідність "
                   "підставам, встановленим статтею 17 цього Закону, у разі якщо така "
                   "інформація є публічною",
                   "documentary proof may not be demanded where the information is public "
                   "open data or sits in a freely accessible state register",
                   "no documentary proof for publicly available information"),
            Defect("1.3", "Плата за документацію",
                   "Тендерна документація надається учасникам після сплати 1 200 грн за "
                   "її підготовку.",
                   22, "частина перша статті 22",
                   "безоплатно оприлюднюється замовником",
                   "tender documentation is published free of charge in the electronic "
                   "procurement system",
                   "free publication in the electronic system"),
        ],
        lawful=[
            Lawful("3.5", "Залучення субпідрядників",
                   "Учасник може підтвердити наявність обладнання та працівників, "
                   "залучивши спроможності інших суб'єктів господарювання як "
                   "субпідрядників.",
                   16, "частина третя статті 16",
                   "залучити спроможності інших суб'єктів господарювання",
                   "the Act expressly allows a bidder to rely on the capacity of others "
                   "for those criteria"),
        ],
        omission=Omission(22, "пункт 1 частини другої статті 22",
                          "інструкція з підготовки тендерних пропозицій",
                          "the documentation contains no instruction on how to prepare a "
                          "tender, which the Act lists first among its required contents",
                          "an instruction for preparing tender proposals"),
        filler=[
            ("1.1", "Замовник", "Комунальне підприємство \"МІСЬКЕ ОСВІТЛЕННЯ\"."),
            ("2.1", "Предмет закупівлі", "Світлодіодні світильники та роботи з монтажу."),
            ("2.3", "Строк поставки", "Поставка та монтаж - до 30 листопада поточного "
                                      "року."),
            ("5.1", "Забезпечення тендерної пропозиції", "Забезпечення пропозиції не "
                                                         "вимагається."),
            ("6.1", "Оцінка пропозицій", "Єдиним критерієм оцінки є ціна."),
            ("7.1", "Проєкт договору", "Проєкт договору наведено у додатку 3 до цієї "
                                       "документації."),
        ],
    ),
    Spec(
        slug="ua-orenda-derzhmayna-review", area="real-estate", nreg="157-20",
        title="Перевірка договору оренди державного майна на відповідність Закону",
        instrument="проєкт договору оренди державного майна",
        deliverable="visnovok-shchodo-orendy-derzhmayna.docx",
        matter_date="03.08.2026",
        request=["Договір укладається вперше, за результатами аукціону.",
                 "Клієнт планує згодом продовжити договір без аукціону."],
        parties=[("Орендодавець", "Регіональне відділення Фонду державного майна"),
                 ("Орендар", 'ТОВ "ПРОСТІР ЛОГІСТИКА"'),
                 ("Код ЄДРПОУ орендаря", synth("44098765")),
                 ("Об'єкт оренди", "нежитлові приміщення площею 1 240 кв. м")],
        defects=[
            Defect("2.3", "Нотаріальне посвідчення",
                   "Договір укладається строком на 7 років і не підлягає нотаріальному "
                   "посвідченню.",
                   16, "частина третя статті 16",
                   "підлягає нотаріальному посвідченню, якщо строк, на який укладається "
                   "цей договір, перевищує п'ять років",
                   "a lease for more than five years must be notarised, and this one runs "
                   "for seven",
                   "notarisation, the term being over five years"),
            Defect("9.1", "Продовження без аукціону",
                   "Договір продовжується вперше без проведення аукціону незалежно від "
                   "строку, на який його укладено.",
                   18, "частина друга статті 18",
                   "укладені та продовжуються вперше, за умови, якщо строк оренди за "
                   "такими договорами становить п'ять років або менше",
                   "renewal without auction on a first renewal is available only where the "
                   "term is five years or less, and this lease runs for seven",
                   "renewal through auction, the term being over five years"),
            Defect("9.3", "Строк подання заяви",
                   "Заява про продовження договору подається орендодавцю не пізніше ніж "
                   "за один місяць до закінчення строку дії договору.",
                   18, "частина третя статті 18",
                   "не пізніше ніж за три місяці до закінчення строку дії договору оренди",
                   "the application must be filed no later than three months before expiry",
                   "an application at least three months before expiry"),
        ],
        lawful=[
            Lawful("4.2", "Цільове призначення",
                   "Орендар використовує майно за будь-яким цільовим призначенням у межах "
                   "обмежень, передбачених Порядком передачі майна в оренду.",
                   16, "частина друга статті 16",
                   "має право використовувати майно за будь-яким цільовим призначенням",
                   "a tenant who took the lease at auction has that right under the Act"),
        ],
        omission=None,
        filler=[
            ("1.1", "Сторони", "Договір укладено між Регіональним відділенням Фонду "
                               "державного майна та ТОВ \"ПРОСТІР ЛОГІСТИКА\"."),
            ("2.1", "Об'єкт оренди", "Нежитлові приміщення площею 1 240 кв. м."),
            ("3.1", "Орендна плата", f"Орендна плата за результатами аукціону становить "
                                     f"{uah(184_000)} грн на місяць."),
            ("5.1", "Страхування", "Орендар зобов'язаний застрахувати об'єкт оренди на "
                                   "користь балансоутримувача."),
            ("6.1", "Поточний ремонт", "Поточний ремонт здійснюється орендарем за власний "
                                       "рахунок."),
            ("8.1", "Повернення майна", "Після припинення договору майно повертається за "
                                        "актом приймання-передачі."),
        ],
    ),
]


def check_grounding(spec) -> None:
    """Refuse to build a task whose criteria quote words the act does not contain."""
    act = ACTS[spec.nreg]
    arts = {}
    for a in act["articles"]:
        arts.setdefault(a["n"], "")
        arts[a["n"]] += " " + norm(a["text"])
    whole = norm(act["text"])
    items = [(d.art, d.quote, f"defect {d.clause}") for d in spec.defects]
    items += [(l.art, l.quote, f"lawful {l.clause}") for l in spec.lawful]
    if spec.omission:
        items.append((spec.omission.art, spec.omission.quote, "omission"))
    for art, quote, what in items:
        q = norm(quote)
        if q in arts.get(art, ""):
            continue
        where = "elsewhere in the act" if q in whole else "NOWHERE in the act"
        raise SystemExit(
            f"{spec.slug}: quote for {what} is not in article {art} ({where}):\n  {quote}")


def build(spec, root: Path) -> Path:
    check_grounding(spec)
    act = ACTS[spec.nreg]
    t = root / spec.area / spec.slug
    d = t / "documents"
    d.mkdir(parents=True, exist_ok=True)

    doc(d / "zapyt-kliyenta.docx", "ЗАПИТ КЛІЄНТА",
        [("p", f"Просимо перевірити {spec.instrument} на відповідність Закону України "
               f"\"{act['name']}\" у редакції, чинній станом на {spec.matter_date}.")]
        + [("p", x) for x in spec.request]
        + [("b", "За кожним пунктом, що суперечить Закону, зазначте норму, у чому полягає "
                 "невідповідність і як пункт має бути викладений."),
           ("p", "Окремо підтвердіть положення, які Закону не суперечать - ми не хочемо "
                 "переписувати те, що закон дозволяє.")])

    rows = [(x.clause, x.heading, x.text) for x in spec.defects + spec.lawful] + spec.filler
    rows.sort(key=lambda r: [int(y) for y in r[0].split(".")])
    doc(d / "proyekt-dokumenta.docx", spec.instrument.upper(),
        [x for clause, heading, text in rows
         for x in (("h", f"{clause}. {heading}"), ("p", text))])

    doc(d / "vidomosti-pro-storony.docx", "ВІДОМОСТІ ПРО СТОРОНИ ТА ОБ'ЄКТ",
        [("p", f"{k}: {v}") for k, v in spec.parties])

    doc(d / f"zakon-{spec.nreg}.docx",
        f"ЗАКОН УКРАЇНИ \"{act['name']}\" (редакція від {ed_human(act['ed_date'])})",
        [("p", p) for p in act["text"].split("\n") if p.strip()])

    crit, n = [], 0

    def add(title, match, source="oracle"):
        nonlocal n
        n += 1
        crit.append({"id": f"C-{n:03d}", "title": title, "deliverables": [spec.deliverable],
                     "match_criteria": match, "source": source})

    for i, df in enumerate(spec.defects, 1):
        tag = f"ISSUE_{i:03d} (п. {df.clause})"
        add(f"{tag}: identifies the defect",
            f"PASS if the opinion identifies clause {df.clause} of the draft as contrary "
            f"to the Act. FAIL if the clause is not raised, or is reported as compliant.")
        add(f"{tag}: names the provision it breaks",
            f"PASS if the opinion cites {df.cite} as the provision clause {df.clause} "
            f"breaks. FAIL if no provision is named, or a different one is.")
        add(f"{tag}: states what is wrong and how to fix it",
            f"PASS if the opinion conveys that {df.breach}, and says the clause should "
            f"instead provide for {df.fix}. Judge on substance, not wording. FAIL if the "
            f"clause is flagged with no reason, or the correction contradicts the Act.",
            "expert")

    if spec.omission:
        o = spec.omission
        k = len(spec.defects) + 1
        add(f"ISSUE_{k:03d} (missing): identifies the omission",
            f"PASS if the opinion states that {o.missing}, citing {o.cite}. FAIL if the "
            f"omission is not raised.")
        add(f"ISSUE_{k:03d} (missing): says what must be added",
            f"PASS if the opinion says the document must include {o.add}. FAIL if the gap "
            f"is noted without saying what has to go in.", "expert")

    for i, lw in enumerate(spec.lawful, 1):
        add(f"OVER-FLAGGING {i}: does not treat clause {lw.clause} as unlawful",
            f"PASS if the opinion does NOT state that clause {lw.clause} breaches the Act. "
            f"It may call the clause commercially unattractive or advise changing it, "
            f"which is not a breach. FAIL if it is listed as a non-compliance.", "expert")
        add(f"OVER-FLAGGING {i}: explains why clause {lw.clause} is permitted",
            f"PASS if the opinion explains that {lw.why}, citing {lw.cite}. FAIL if the "
            f"clause is passed over in silence with no reason given.", "expert")

    add("Applies the edition supplied in the workspace",
        f"PASS if the opinion works from the Act as it stood on {spec.matter_date}, which "
        f"is the edition supplied. FAIL if it relies on a provision that is not in the "
        f"supplied text.")
    add("Does not invent defects the Act does not support",
        "PASS if every non-compliance asserted is tied to a provision of the Act that "
        "actually says what the opinion claims. FAIL if any asserted breach cannot be "
        "traced to the supplied text.", "expert")
    add("Gives the client a usable list rather than an essay",
        "PASS if the findings are set out clause by clause, so each can be acted on "
        "separately. FAIL if the analysis is continuous prose in which the individual "
        "defects cannot be told apart.", "expert")
    add("Written in Ukrainian",
        "PASS if the text of the deliverable is written in Ukrainian. FAIL if any heading "
        "or standing phrase in the text is in English or Russian. The file name is set by "
        "the instructions and is not assessed here.", "expert")

    cfg = {
        "title": spec.title, "work_type": "review",
        "language": "uk", "jurisdiction": "UA", "judge_language": "en",
        "tags": ["statutory-compliance", "ukraine", "document-review", spec.nreg],
        "instructions": (
            f"Перевірте {spec.instrument} на відповідність Закону України "
            f"\"{act['name']}\", текст якого надано у матеріалах, у редакції, чинній "
            f"станом на {spec.matter_date}. За кожним пунктом, що суперечить Закону, "
            f"зазначте норму та як його слід викласти; окремо підтвердіть положення, які "
            f"Закону не суперечать. Результат: `{spec.deliverable}`."
        ),
        "deliverables": {spec.deliverable: spec.deliverable},
        "criteria": crit,
    }
    (t / "task.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    words = sum(len(x.split()) for _, _, x in rows) + len(act["text"].split())
    print(f"  {spec.area}/{spec.slug}: {len(crit)} criteria, "
          f"{len(list(d.iterdir()))} documents, ~{words:,} words")
    return t


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    print(f"building {len(SPECS)} review tasks")
    for spec in SPECS:
        build(spec, root)


if __name__ == "__main__":
    main()
