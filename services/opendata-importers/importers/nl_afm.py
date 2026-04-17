"""NL AFM registers — Authority for the Financial Markets.

Status: SPA, no static CSV/Excel exposed. Discovery: AFM has a search
API per register category at /sector/registers/* — needs Playwright or
network-tab inspection to find AJAX calls.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers._stub import PlaywrightTodoStub  # noqa: E402
from shared.base import setup_logging  # noqa: E402


class NLAfmImporter(PlaywrightTodoStub):
    SERVICE_NAME = "nl_afm"
    TARGET_TABLE = "nl_afm_registers"
    COLUMNS = ["entity_name", "register_type", "license_number",
               "address", "status", "metadata_json"]
    PK_COLUMNS = []
    SOURCE_URL = "https://www.afm.nl/en/sector/registers"


if __name__ == "__main__":
    setup_logging("nl_afm")
    NLAfmImporter().run()
