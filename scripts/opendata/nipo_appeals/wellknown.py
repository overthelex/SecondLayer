"""Well-known trademarks registry (XLSX from the Appeals Chamber hub page) -> rows."""

import logging
import re
from datetime import datetime
from typing import List, Optional

log = logging.getLogger(__name__)

# Header row (verified on perelik_dobre_vidomykh_TM_30052025.xlsx):
# A Тип об'єкта | B Стан | C Номер заявки | D Дата подання заявки | E Номер охоронного документа
# F Дата охоронного документа | G Ключові слова | H Заявник | I Власник | J Винахідник\автор
# K Представник | L МПК | M МКТП | N МКПЗ | O (441) Дата публікації | P Зображення ТМ
COLUMN_MAP = {
    "номер заявки": "app_number",
    "дата подання заявки": "app_date",
    "номер охоронного документа": "doc_number",
    "дата охоронного документа": "recognition_date",
    "ключові слова": "tm_name",
    "заявник": "applicant",
    "власник": "owner",
    "представник": "representative",
    "мктп": "nice_classes",
    "(441)": "publication_441",
}

DATE_FIELDS = {"app_date", "recognition_date"}


def _cell_str(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%d.%m.%Y")
    s = str(v).replace("_x000D_", " ").replace("\r", " ").replace("\n", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def _to_iso_date(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", str(v))
    if not m:
        return None
    d, mo, y = m.groups()
    try:
        return datetime(int(y), int(mo), int(d)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_registry_xlsx(path: str, source_file: str) -> List[dict]:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter)

    field_by_idx = {}
    for idx, cell in enumerate(header):
        label = (_cell_str(cell) or "").lower()
        for key, field in COLUMN_MAP.items():
            if label.startswith(key):
                field_by_idx[idx] = field
                break

    if "tm_name" not in field_by_idx.values():
        raise RuntimeError(f"registry XLSX header not recognized: {header}")

    out: List[dict] = []
    for row in rows_iter:
        rec: dict = {}
        raw: dict = {}
        for idx, field in field_by_idx.items():
            v = row[idx] if idx < len(row) else None
            raw[field] = _cell_str(v)
            rec[field] = _to_iso_date(v) if field in DATE_FIELDS else _cell_str(v)
        if not rec.get("tm_name"):
            continue
        rec["source_file"] = source_file
        rec["raw"] = raw
        out.append(rec)
    log.info("well-known registry: parsed %d rows from %s", len(out), source_file)
    return out
