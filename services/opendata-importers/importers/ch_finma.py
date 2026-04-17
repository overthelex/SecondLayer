"""CH FINMA — authorised institutions register.

Status: SPA per category (banks, insurance, fund managers, etc.) with
JS-rendered tables. Discovery: each category page has Excel export
button that triggers an XHR — inspect in devtools and curl directly.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers._stub import PlaywrightTodoStub  # noqa: E402
from shared.base import setup_logging  # noqa: E402


class CHFinmaImporter(PlaywrightTodoStub):
    SERVICE_NAME = "ch_finma"
    TARGET_TABLE = "ch_finma_regulated"
    COLUMNS = ["entity_name", "license_type", "license_number",
               "address", "status", "metadata_json"]
    PK_COLUMNS = []
    SOURCE_URL = "https://www.finma.ch/en/finma-public/authorised-institutions/"


if __name__ == "__main__":
    setup_logging("ch_finma")
    CHFinmaImporter().run()
