"""PDF text extraction + field parsing (runs in worker processes).

All Appeals Chamber PDFs are digitally-born with clean Ukrainian text layers
(verified on samples from both nipo.gov.ua and ukrpatent.org) — no OCR needed.
"""

import logging
import re
from typing import Optional

log = logging.getLogger(__name__)

APP_NUM_RE = re.compile(r"заявк\w*\s*№\s*([amus]\s?\d{4}\s?\d{4,6})", re.I)
INTL_REG_RE = re.compile(r"міжнародн\w+\s+реєстрац\w+\s*№?\s*(\d{5,9})", re.I)
TITLE_TM_RE = re.compile(r"торговельн\w+\s+марк\w+\s*[«\"„]([^»\"”]{1,200})[»\"”]")
TITLE_ZNAK_RE = re.compile(r"знак\w*(?:\s+для\s+товарів\s+і\s+послуг)?\s*[«\"„]([^»\"”]{1,200})[»\"”]")
TITLE_INV_RE = re.compile(r"(?:винах[іо]д\w*|корисн\w+\s+модел\w+)\s*[«\"„]([^»\"”]{1,300})[»\"”]")
APPELLANT_DASH_RE = re.compile(r"[Аа]пелянт\w*\s*[–—-]\s*([^\n]{3,200}?)\s*(?:\(далі|,\s*подан|$)", re.M)
OPPOSITION_RE = re.compile(
    r"(?:заперечення|заяв[уи])\s+(.{3,160}?)\s+(?:проти\s+рішення|про\s+визнання)", re.S
)
APPLICANT_RE = re.compile(r"заявник\w?\s*[–—-]\s*([^\n;]{3,160})", re.I)
OWNER_RE = re.compile(r"власник\w?\s*(?:свідоцтва|патенту)?\s*[–—-]\s*([^\n;]{3,160})", re.I)
COLLEGIUM_RE = re.compile(
    r"у\s+складі\s+головуючого\s+(.{3,80}?)\s+(?:та|і)\s+членів\s+колегії\s+(.{3,250}?)(?:,?\s*за\s+участю|,?\s*розглянул)",
    re.S,
)
REPS_RE = re.compile(r"Представник\w*\s+(апелянта|заявника|власника|УКРНОІВІ|Укрпатенту|заявник[аі]в)\s*[–—-]\s*([^\n]{3,150})")
OPERATIVE_RE = re.compile(r"(?:В\s*И\s*Р\s*І\s*Ш\s*И\s*Л\s*А|вирішила)\s*:?", re.I)


def extract_pdf_text(path: str) -> str:
    from pypdf import PdfReader  # imported here so worker processes load it lazily

    reader = PdfReader(path)
    pages = []
    for p in reader.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception as e:  # single corrupt page must not kill the document
            log.warning("page extraction failed in %s: %s", path, e)
            pages.append("")
    # pypdf occasionally emits NUL bytes from broken CMaps — Postgres rejects them
    return "\n".join(pages).replace("\x00", "")


def _norm(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s*\(далі.*$", "", s)  # drop '(далі – апелянт)' style tails
    s = s.strip(" ,;–—-.")
    return s or None


def _search_not_after(pattern: re.Pattern, text: str, forbidden_prefix: str) -> Optional[re.Match]:
    """First match whose preceding context does NOT contain forbidden_prefix
    (e.g. skip 'Представник заявника – …' when looking for 'заявник – …')."""
    for m in pattern.finditer(text):
        before = text[max(0, m.start() - 25) : m.start()].lower()
        if forbidden_prefix not in before:
            return m
    return None


def normalize_app_number(m: Optional[re.Match]) -> Optional[str]:
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1).lower()).strip()


def extract_fields(order_text: str, decision_text: str, section: str) -> dict:
    """Pull structured fields out of the наказ + рішення texts."""
    combined = (order_text or "") + "\n" + (decision_text or "")
    fields: dict = {}

    app_m = APP_NUM_RE.search(combined)
    fields["app_number"] = normalize_app_number(app_m)
    if not fields["app_number"]:
        intl = INTL_REG_RE.search(combined)
        fields["app_number"] = f"IR {intl.group(1)}" if intl else None

    # title from the decision text (authoritative for legacy items where the
    # listing only had a filename slug)
    title = None
    if section == "inventions":
        m = TITLE_INV_RE.search(combined)
        title = m.group(1) if m else None
        low = combined.lower()
        fields["object_type"] = (
            "utility_model" if "корисн" in low and "модел" in low and "винах" not in low[:2000] else None
        )
        if fields["object_type"] is None:
            fields["object_type"] = "invention" if "винах" in low else None
    else:
        m = TITLE_TM_RE.search(decision_text or "") or TITLE_ZNAK_RE.search(decision_text or "")
        title = m.group(1) if m else None
    fields["pdf_title"] = _norm(title)

    appellant = None
    m = _search_not_after(APPELLANT_DASH_RE, decision_text or "", "представник")
    if m:
        appellant = m.group(1)
    else:
        m = OPPOSITION_RE.search(decision_text or "")
        if m:
            appellant = m.group(1)
    fields["appellant"] = _norm(appellant)

    parties: dict = {}
    m = _search_not_after(APPLICANT_RE, decision_text or "", "представник")
    if m:
        parties["applicant"] = _norm(m.group(1))
    m = _search_not_after(OWNER_RE, decision_text or "", "представник")
    if m:
        parties["owner"] = _norm(m.group(1))
    m = COLLEGIUM_RE.search(decision_text or "")
    if m:
        head = _norm(m.group(1))
        members = [_norm(x) for x in re.split(r",| та | і ", m.group(2)) if _norm(x)]
        parties["collegium"] = {"head": head, "members": members}
    reps = {}
    for who, name in REPS_RE.findall(decision_text or ""):
        reps[who.lower()] = _norm(name)
    if reps:
        parties["representatives"] = reps
    fields["parties"] = parties

    fields["result_pdf"] = result_from_operative(decision_text or "")
    return fields


def result_from_operative(decision_text: str) -> Optional[str]:
    """Derive the outcome from the operative part (after 'ВИРІШИЛА:')."""
    m = None
    for m in OPERATIVE_RE.finditer(decision_text):
        pass  # keep the LAST occurrence — earlier ones may cite other decisions
    if not m:
        return None
    seg = decision_text[m.end() : m.end() + 1500]
    low = seg.lower()
    if re.search(r"задовольнити\s+частково|частково\s+задовольнити|задовольнити\s+в\s+частині", low):
        return "partial"
    # both word orders occur: "відмовити ... у задоволенні" and "у задоволенні ... відмовити"
    refused = (
        re.search(r"відмовити\b.{0,250}?у\s+задоволенн", low, re.S)
        or re.search(r"у\s+задоволенн\w*.{0,250}?\bвідмовити", low, re.S)
        or re.search(r"залишити\s+без\s+задоволенн", low)
    )
    granted = re.search(r"(?<!не\s)\bзадовольнити\b|визнати\s+.{0,160}?добре\s+відом", low, re.S)
    if refused and granted:
        # both verbs in the operative part — usually numbered points like
        # "1. Заперечення задовольнити ... 2. Відмовити у ..." -> judge by first verb
        return "granted" if granted.start() < refused.start() else "refused"
    if refused:
        return "refused"
    if granted:
        return "granted"
    # upholding the contested decision without the задоволення formula = refusal
    if re.search(r"рішення\s+.{0,120}?залишити\s+(чинним|в\s+силі)", low, re.S):
        return "refused"
    return None
