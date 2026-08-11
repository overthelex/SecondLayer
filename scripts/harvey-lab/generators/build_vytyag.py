#!/usr/bin/env python3
"""Put the statutory text into the litigation workspaces, without giving the answer away.

Measured on 2026-08-11: across 44 upstream tasks whose criteria cite a legal authority, 276 of
300 citations (92%) also appear in the task's own documents. LAB plants the legal hook in the
matter. Five of our nine litigation workspaces contained no statement of the rules their criteria
turn on at all, so they graded recall of the Civil Code rather than work on the documents.

Supplying only the edition in force on the matter date would fix that and destroy the task: the
temporal question would collapse into reading. So each task gets SEVERAL dated snapshots, the way
a legal research system prints them, and the analysis has to work out which one governs. The
snapshots carry no commentary, no validity ranges and no "this one applies" marker — an edition
where paragraph 19 does not exist simply does not show it.

Chrome is stripped hard: the harvested text carries zakon.rada URLs and edition stamps, and a URL
has no business in a closed-universe workspace.
"""

import json
import re
import sys
from pathlib import Path

from ua_pack import doc

PROV = json.loads(Path(__file__).with_name("ck_provisions.json").read_text(encoding="utf-8"))

# Articles 253 and 254 carry the general rules on when a period begins and ends — including
# part 5 of 254, "днем закінчення строку є перший за ним робочий день", which decides an expiry
# falling on a weekend. Every task here computes dates, so every task gets them; leaving them out
# is what made the window A criterion demand a Sunday.
GENERAL = [253, 254]

# matter date -> which provisions that task's criteria rely on
TASKS = {
    "ua-limitation-contractual-shortening-void":  ("20250317", [257, 259, 261, 625], [19]),
    "ua-limitation-extended-by-agreement":        ("20250224", [259, 261, 625], [19]),
    "ua-limitation-not-raised-by-party":          ("20250303", [261, 267, 625], [19]),
    "ua-limitation-penalty-one-year":             ("20250428", [257, 258, 261, 625], [19]),
    "ua-limitation-period-martial-law":           ("20250211", [257, 258, 261, 625], [12, 19]),
    "ua-limitation-quarantine-vs-martial-law":    ("20250210", [257, 261, 625], [12, 19]),
    "ua-limitation-window-after-repeal":          ("20251112", [257, 261, 625], [12, 19]),
    "ua-limitation-window-before-p19":            ("20220310", [257, 261, 625], [12, 19]),
    "ua-limitation-window-original-p19":          ("20230626", [257, 261, 625], [12, 19]),
}

# Contrast editions, chosen so paragraph 19 appears in all four of its states across the set:
# absent, original (продовжуються, with its own article list), restated (зупиняється), removed.
CONTRAST = ["20220101", "20220317", "20250110", "20250904"]

# Paragraph 19 is the last item in the transitional block, so the extractor had nothing to stop
# at and ran on into the page furniture: "Редакція від … Постійна адреса: https://… Законодавство
# України станом на 09.07.2026 попередня редакція ⚠ Увага! … Це не поточна редакція документу".
# That injects a foreign date, a URL and a strong hint into a workspace that is supposed to be
# closed. So the text is TRUNCATED at the first furniture marker rather than patched afterwards.
FURNITURE = re.compile(
    r"(?:Документ\s+435-15|Редакція від\s+\d{2}\.\d{2}\.\d{4}|Постійна адреса"
    r"|Законодавство України станом|Публікації документа|Увага!|⚠|попередня редакція"
    r"|Перейти до поточної)")
LAWLIST = re.compile(r"\{[^{}]*\}")


def strip_chrome(t: str) -> str:
    m = FURNITURE.search(t)
    if m:
        t = t[:m.start()]
    t = LAWLIST.sub("", t)
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()


def in_force(matter: str) -> str:
    """The edition governing on the matter date — max edition at or before it."""
    return max(e for e in PROV if e <= matter)


def editions_for(matter: str) -> list:
    """The governing edition plus contrasts, in date order, deduplicated."""
    eds = {in_force(matter)} | {e for e in CONTRAST if e in PROV}
    return sorted(eds)


def build(slug: str, matter: str, arts: list, paras: list, root: Path) -> tuple:
    eds = editions_for(matter)
    blocks = [
        ("p", "Довідка сформована автоматично. Наведено тексти норм станом на кілька "
              "дат. Визначення редакції, чинної на потрібну дату, здійснюється "
              "користувачем."),
    ]
    for ed in eds:
        human = f"{ed[6:]}.{ed[4:6]}.{ed[:4]}"
        blocks.append(("h", f"Цивільний кодекс України, текст станом на {human}"))
        for n in GENERAL + arts:
            body = PROV[ed]["articles"].get(str(n))
            if body:
                blocks.append(("p", strip_chrome(body)))
        present = [(n, PROV[ed]["transitional"].get(str(n))) for n in paras]
        present = [(n, t) for n, t in present if t]
        if present:
            blocks.append(("b", "Прикінцеві та перехідні положення"))
            for n, t in present:
                blocks.append(("p", strip_chrome(t)))

    target = root / "litigation-dispute-resolution" / slug / "documents"
    target.mkdir(parents=True, exist_ok=True)
    path = target / "vytyag-cyvilnyi-kodeks.docx"
    doc(path, "ВИТЯГ З ЦИВІЛЬНОГО КОДЕКСУ УКРАЇНИ", blocks)
    words = sum(len(str(x[1]).split()) for x in blocks)
    return eds, words, path


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tasks")
    total = 0
    for slug, (matter, arts, paras) in TASKS.items():
        eds, words, path = build(slug, matter, arts, paras, root)
        gov = in_force(matter)
        total += words
        human = f"{matter[6:]}.{matter[4:6]}.{matter[:4]}"
        p19 = "present" if PROV[gov]["transitional"]["19"] else "absent"
        print(f"  {slug[:44]:44s} matter {human}  governing {gov} (п.19 {p19})")
        print(f"      editions supplied: {eds}  ~{words:,} words")
    print(f"\ntotal added: ~{total:,} words across {len(TASKS)} tasks")


if __name__ == "__main__":
    main()
