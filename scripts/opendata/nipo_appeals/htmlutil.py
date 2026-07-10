"""Small HTML helpers (regex-based; both sites are static server-rendered pages)."""

import html
import re
from datetime import datetime
from typing import Optional

TAG_RE = re.compile(r"<[^>]+>")
DATE_RE = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})")

GRANTED_MARKS = "✔"  # ✔ (nipo pages use ✔︎ = U+2714 U+FE0E)
REFUSED_MARKS = "✘✖"  # ✘ and ✖ (both glyphs occur)


def strip_tags(fragment: str) -> str:
    return html.unescape(TAG_RE.sub(" ", fragment)).replace("\xa0", " ").strip()


def squash_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_dmy(text: str) -> Optional[str]:
    """First DD.MM.YYYY in text -> ISO date string, validated."""
    m = DATE_RE.search(text or "")
    if not m:
        return None
    d, mo, y = m.groups()
    try:
        return datetime(int(y), int(mo), int(d)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def result_from_marker(title_text: str) -> Optional[str]:
    has_granted = any(ch in title_text for ch in GRANTED_MARKS)
    has_refused = any(ch in title_text for ch in REFUSED_MARKS)
    if has_granted and has_refused:
        return "partial"
    if has_granted:
        return "granted"
    if has_refused:
        return "refused"
    return None


def clean_title(title_text: str) -> str:
    """Drop result markers and surrounding quotes/whitespace from a listing title."""
    t = title_text
    for ch in GRANTED_MARKS + REFUSED_MARKS + "︎️":
        t = t.replace(ch, "")
    t = t.replace("\xa0", " ").strip()
    # strip one symmetric layer of quotes: "..." «...» “...”
    m = re.match(r'^["«“„\'](.*)["»”“\']$', t)
    if m:
        t = m.group(1).strip()
    return t


def absolutize(url: str, base: str) -> str:
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if not url.startswith("/"):
        url = "/" + url
    return base.rstrip("/") + url
