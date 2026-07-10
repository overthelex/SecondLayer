"""Decision record model shared by both source parsers."""

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class DecisionItem:
    """One Appeals Chamber decision — listing metadata + fields parsed from PDFs."""

    source: str  # 'nipo' | 'ukrpatent'
    section: str  # 'tm' | 'inventions' | 'well_known'
    decision_pdf_url: str  # natural key
    object_title: str = ""
    object_type: Optional[str] = None  # 'tm' | 'invention' | 'utility_model' | 'well_known_tm'
    result: Optional[str] = None  # 'granted' | 'refused' | 'partial'
    result_source: Optional[str] = None  # 'marker' | 'pdf'
    order_number: Optional[str] = None
    order_date: Optional[str] = None  # ISO YYYY-MM-DD
    decision_date: Optional[str] = None
    order_pdf_url: Optional[str] = None
    annex_url: Optional[str] = None
    image_url: Optional[str] = None

    # filled by the PDF stage
    app_number: Optional[str] = None
    appellant: Optional[str] = None
    parties: dict = field(default_factory=dict)
    order_text: Optional[str] = None
    decision_text: Optional[str] = None

    # filled by the storage stage
    order_object_key: Optional[str] = None
    decision_object_key: Optional[str] = None
    image_object_key: Optional[str] = None

    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)
