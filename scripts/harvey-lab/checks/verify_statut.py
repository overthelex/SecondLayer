#!/usr/bin/env python3
"""Check every planted defect against the text of the Act, not against my reading of it.

Each defect claims that a clause breaks a named provision. This asserts, for each one, that the
provision exists in the harvested edition and that the words carrying the rule are actually in
it. A defect whose provision cannot be located, or whose key phrase is absent, is a criterion
the model can only fail by luck, so the script exits non-zero rather than reporting a warning.
"""

import json
import re
import sys
from pathlib import Path

ACT = json.loads(Path("act_2275.json").read_text(encoding="utf-8"))
ARTS = {a["n"]: a["text"] for a in ACT["articles"]}

# (article, phrase that must be present, what the defect relies on)
CHECKS = [
    (24, "становить менше 50 відсотків, може вийти з товариства у будь-який час без згоди",
     "4.6 exit without consent under 50%"),
    (24, "внаслідок якого у товаристві не залишиться жодного учасника, забороняється",
     "4.9 exit leaving no members is forbidden"),
    (24, "пропорційно до розміру оплаченої частини частки",
     "4.12 payout only on the paid-up part"),
    (24, "може встановлюватися інший строк для здійснення такої виплати",
     "LAWFUL 4.14 charter may set another payout period"),
    (20, "Позовна давність за такими вимогами становить один рік",
     "5.3 one-year limitation on pre-emption"),
    (20, "одностайним рішенням загальних зборів учасників",
     "5.7 unanimity to remove the pre-emption right"),
    (34, "приймаються трьома чвертями голосів усіх учасників",
     "7.4 three quarters to amend the charter"),
    (34, "приймаються одностайно всіма учасниками",
     "7.6 unanimity for valuing a non-monetary contribution"),
    (30, "не можуть бути віднесені до компетенції інших органів товариства",
     "8.2 reserved questions cannot move to another organ"),
    (30, "затвердження грошової оцінки негрошового вкладу учасника",
     "7.6 the valuation question is in part 2 of Article 30"),
    (27, "не має права виплачувати дивіденди учаснику, який повністю або частково не вніс свій вклад",
     "9.5 no dividend to a member who has not paid in"),
    (27, "майна товариства недостатньо для задоволення вимог кредиторів",
     "9.7 no dividend where property is insufficient"),
    (11, "підписується всіма учасниками товариства",
     "1.4 first version signed by all members"),
    (11, "Справжність підписів учасників засвідчується нотаріально",
     "1.4 signatures notarised"),
    (11, "обліковій системі часток",
     "OMISSION mandatory content on the share accounting system"),
    (46, "лише у разі подальшого схвалення правочину товариством",
     "12.1 not void, binds on subsequent approval"),
    (44, "якщо інше не передбачено статутом товариства",
     "LAWFUL 12.3 the charter may move the large-transaction decision"),
]


def norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("`", "'")).strip()


bad = 0
print(f"act {ACT['nreg']} edition {ACT['ed_date']}, {len(ACT['text'].split()):,} words, "
      f"{len(ARTS)} articles parsed\n")
for art, phrase, what in CHECKS:
    body = norm(ARTS.get(art, ""))
    ok = norm(phrase) in body
    print(f"  {'OK  ' if ok else 'MISS'} ст. {art:3d}  {what}")
    if not ok:
        bad += 1
        print(f"        looked for: {phrase}")

print(f"\n{len(CHECKS) - bad}/{len(CHECKS)} grounded")
sys.exit(1 if bad else 0)
