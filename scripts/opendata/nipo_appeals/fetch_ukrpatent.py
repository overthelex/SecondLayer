"""Parser for the legacy ukrpatent.org Appeals Chamber archive (2011–2022).

Year pages render a plain HTML table, one decision per <tr>:
  <tr>
    <td><img src="/i_upload/blablabus.jpg" ...></td>      -- mark image (may be absent)
    <td>02.11.2021</td>                                    -- decision date
    <td><a href="/atachs/BLABLABUS-nakaz-2021.pdf">16.12.2021 № 284-Н/2021</a></td>
    <td><a href="/atachs/BLABLABUS-res-2021.pdf">PDF</a></td>
  </tr>
Listing has no result marker and no textual title — both are backfilled from the
decision PDF at the parse stage; the slug from the file name is the provisional title.
"""

import logging
import re
from typing import List, Optional

from .config import UKRPATENT_BASE
from .htmlutil import strip_tags, squash_ws, parse_dmy, absolutize
from .models import DecisionItem

log = logging.getLogger(__name__)

TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S | re.I)
ATACH_LINK_RE = re.compile(r'<a\s+[^>]*href="((?:https?://ukrpatent\.org)?/atachs/[^"]+\.pdf)"[^>]*>(.*?)</a>', re.S | re.I)
IMG_RE = re.compile(r'<img[^>]+src="([^"]+)"', re.I)
# '№ 284-Н/2021' (2019+), but older years write bare '№ 32' / '№ 42-Н' — year optional
ORDER_NUM_RE = re.compile(r"№\s*([\w\-]+(?:/\d{4})?)")
NAKAZ_NAME_RE = re.compile(r"nakaz", re.I)


def slug_from_pdf_url(url: str) -> str:
    name = url.rsplit("/", 1)[-1]
    name = re.sub(r"\.pdf$", "", name, flags=re.I)
    name = re.sub(r"[-_](nakaz|res|rish\w*)[-_]?\d{4}$", "", name, flags=re.I)
    name = re.sub(r"[-_](nakaz|res)[-_]?", " ", name, flags=re.I)
    return squash_ws(name.replace("-", " ").replace("_", " "))


def parse_year_page(html_text: str, section: str, year: int) -> List[DecisionItem]:
    items: List[DecisionItem] = []
    seen: set = set()
    for tr_m in TR_RE.finditer(html_text):
        row = tr_m.group(1)
        links = ATACH_LINK_RE.findall(row)
        if not links:
            continue
        nakaz = next(((h, t) for h, t in links if NAKAZ_NAME_RE.search(h)), None)
        decision = next(((h, t) for h, t in links if not NAKAZ_NAME_RE.search(h)), None)
        guessed = False
        if not decision and nakaz:
            # site glitch: a couple of rows link the наказ twice (or omit the decision).
            # Derive the conventional -res- URL; the download stage rejects it loudly
            # if the guess doesn't exist.
            guess = re.sub(r"nakaz", "res", nakaz[0], flags=re.I)
            if guess != nakaz[0]:
                decision = (guess, "PDF")
                guessed = True
                log.warning("ukrpatent/%s-%d: no decision link, guessing %s", section, year, guess)
        if not decision:
            log.warning("ukrpatent/%s-%d: row without decision pdf, skipped: %s", section, year, links)
            continue

        decision_url = absolutize(decision[0], UKRPATENT_BASE)
        if decision_url in seen:
            continue
        seen.add(decision_url)

        tds = [squash_ws(strip_tags(td)) for td in TD_RE.findall(row)]
        # decision date = first standalone date cell that is NOT inside the nakaz link text
        nakaz_text = squash_ws(strip_tags(nakaz[1])) if nakaz else ""
        decision_date = None
        for td in tds:
            if td and td != nakaz_text and parse_dmy(td) and "№" not in td:
                decision_date = parse_dmy(td)
                break

        # order number is usually in the nakaz link text, but some years put it
        # in a separate cell — fall back to scanning all cells of the row
        order_num_m = ORDER_NUM_RE.search(nakaz_text) or ORDER_NUM_RE.search(" | ".join(tds))
        img_m = IMG_RE.search(row)
        image_url = absolutize(img_m.group(1), UKRPATENT_BASE) if img_m else None

        object_type = {"tm": "tm", "inventions": None, "well_known": "well_known_tm"}[section]

        items.append(
            DecisionItem(
                source="ukrpatent",
                section=section,
                decision_pdf_url=decision_url,
                object_title=slug_from_pdf_url(decision_url),  # provisional; replaced from PDF
                object_type=object_type,
                order_number=order_num_m.group(1) if order_num_m else None,
                order_date=parse_dmy(nakaz_text),
                decision_date=decision_date,
                order_pdf_url=absolutize(nakaz[0], UKRPATENT_BASE) if nakaz else None,
                image_url=image_url,
                raw={"year_page": year, "nakaz_text": nakaz_text, "row_tds": tds[:6],
                     **({"decision_url_guessed": True} if guessed else {})},
            )
        )
    log.info("ukrpatent/%s-%d: parsed %d items", section, year, len(items))
    return items
