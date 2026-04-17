"""NL DNB regulated entities — De Nederlandsche Bank openbaar register.

Status: Akamai-protected SPA. Direct curl returns 403; bulk Excel /
'total register' link is gated behind JS-driven flow. Discovery hint:
inspect XHR calls on https://www.dnb.nl/en/sector-information/open-book-supervision/
in browser devtools — there is likely a JSON endpoint.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers._stub import PlaywrightTodoStub  # noqa: E402
from shared.base import setup_logging  # noqa: E402


class NLDnbImporter(PlaywrightTodoStub):
    SERVICE_NAME = "nl_dnb"
    TARGET_TABLE = "nl_dnb_regulated_entities"
    COLUMNS = ["entity_name", "trade_name", "license_type", "license_number",
               "lei_code", "address", "registration_number", "status", "metadata_json"]
    PK_COLUMNS = []  # serial id PK; no upsert
    SOURCE_URL = "https://www.dnb.nl/en/sector-information/open-book-supervision/registers/"


if __name__ == "__main__":
    setup_logging("nl_dnb")
    NLDnbImporter().run()
