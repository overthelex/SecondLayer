"""Parsers for nipo.gov.ua Appeals Chamber listing pages (Elementor, server-rendered, no pagination).

Two layouts:
  * 'tm' and 'well_known' — 2-column sections: h6 title with ✔︎/✘ marker,
    Наказ/Рішення links with number+dates, mark image in the right column;
  * 'inventions' — 3-column: <strong>«TITLE»</strong> + object type line, links in own columns.
"""

import logging
import re
from typing import List, Optional

from .htmlutil import strip_tags, squash_ws, parse_dmy, result_from_marker, clean_title
from .models import DecisionItem

log = logging.getLogger(__name__)

SECTION_SPLIT = '<section class="elementor-section elementor-top-section'
LINK_RE = re.compile(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S | re.I)
H6_RE = re.compile(r'<h6 class="elementor-heading-title[^"]*">(.*?)</h6>', re.S)
STRONG_RE = re.compile(r"<strong>(.*?)</strong>", re.S)
ORDER_NUM_RE = re.compile(r"№\s*([\w\-]+/\d{4})")
IMG_EXT_RE = re.compile(r"\.(png|jpe?g|gif|webp)(\?|$)", re.I)
APP_NUM_LISTING_RE = re.compile(r"заявк\w*\s*№?\s*([amus]\s?\d{4}\s?\d{4,6})", re.I)


def _links_with_tails(chunk: str) -> List[dict]:
    """All <a> in a chunk: href, visible text (tags stripped) and tail text.

    Tail = text between </a> and the end of the same <p> (tm/well-known layout:
    "<a>Наказ</a> №179/2026 від 06.07.2026"). The inventions layout puts the
    number/date in the NEXT <p> of the same column — fall back to it when the
    in-paragraph tail is empty.
    """
    out = []
    for m in LINK_RE.finditer(chunk):
        href, inner = m.group(1), strip_tags(m.group(2))
        tail_raw = chunk[m.end() : m.end() + 600]
        tail = squash_ws(strip_tags(tail_raw.split("</p>")[0]))
        if not tail:
            next_p = re.search(r"<p[^>]*>(.*?)</p>", tail_raw, re.S)
            if next_p:
                tail = squash_ws(strip_tags(next_p.group(1)))
        out.append({"href": href, "text": squash_ws(inner), "tail": tail})
    return out


def _find_doc_link(links: List[dict], word: str) -> Optional[dict]:
    for l in links:
        if word.lower() in l["text"].lower() and l["href"].lower().endswith((".pdf", ".doc", ".docx")):
            return l
    return None


def _find_image(chunk: str) -> Optional[str]:
    # Prefer the lightbox <a href> (full-size); thumbs live in src on the dv-tm page.
    m = re.search(r'<a\s+href="([^"]+)"[^>]*data-elementor-open-lightbox', chunk)
    if m and IMG_EXT_RE.search(m.group(1)):
        return m.group(1)
    for m in re.finditer(r'<img[^>]+src="([^"]+)"', chunk):
        src = m.group(1)
        if IMG_EXT_RE.search(src) and "emoji" not in src and "/thumbs/" not in src:
            return src
    return None


def parse_section_page(html_text: str, section: str) -> List[DecisionItem]:
    items: List[DecisionItem] = []
    for chunk in html_text.split(SECTION_SPLIT)[1:]:
        item = _parse_chunk(chunk, section)
        if item:
            items.append(item)
    log.info("nipo/%s: parsed %d items", section, len(items))
    return items


def _parse_chunk(chunk: str, section: str) -> Optional[DecisionItem]:
    links = _links_with_tails(chunk)
    nakaz = _find_doc_link(links, "Наказ")
    rishennia = _find_doc_link(links, "Рішення")
    if not rishennia:
        return None  # header/nav/year-divider section

    if section == "inventions":
        title_m = STRONG_RE.search(chunk)
        title_raw = strip_tags(title_m.group(1)) if title_m else ""
        # object type is the standalone <p> line 'винахід' / 'корисна модель'
        object_type = None
        text_lines = [squash_ws(strip_tags(p)) for p in re.findall(r"<p[^>]*>(.*?)</p>", chunk, re.S)]
        for line in text_lines:
            low = line.lower()
            if low == "винахід":
                object_type = "invention"
            elif low.replace("’", "'") == "корисна модель":
                object_type = "utility_model"
    else:
        title_m = H6_RE.search(chunk)
        title_raw = strip_tags(title_m.group(1)) if title_m else ""
        object_type = "well_known_tm" if section == "well_known" else "tm"

    if not title_raw:
        return None

    result = result_from_marker(title_raw)
    order_tail = nakaz["tail"] if nakaz else ""
    order_num_m = ORDER_NUM_RE.search(order_tail)
    annex = _find_doc_link(links, "Додаток")

    item = DecisionItem(
        source="nipo",
        section=section,
        decision_pdf_url=rishennia["href"],
        object_title=clean_title(title_raw),
        object_type=object_type,
        result=result,
        result_source="marker" if result else None,
        order_number=order_num_m.group(1) if order_num_m else None,
        order_date=parse_dmy(order_tail),
        decision_date=parse_dmy(rishennia["tail"]),
        order_pdf_url=nakaz["href"] if nakaz else None,
        annex_url=annex["href"] if annex else None,
        image_url=_find_image(chunk),
        raw={"listing_title": title_raw, "order_tail": order_tail, "decision_tail": rishennia["tail"]},
    )
    return item


def find_well_known_xlsx_url(hub_html: str) -> Optional[str]:
    """Locate the well-known TM registry XLSX on the Appeals Chamber hub page."""
    m = re.search(r'href="([^"]*perelik[^"]*\.xlsx)"', hub_html, re.I)
    if m:
        return m.group(1)
    m = re.search(r'href="([^"]*dobre[_-]?vidom[^"]*\.xlsx)"', hub_html, re.I)
    return m.group(1) if m else None
