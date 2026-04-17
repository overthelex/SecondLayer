"""IE Central Bank registers.

Status: ASP.NET WebForms with __doPostBack only. No direct CSV download.
Discovery: needs Playwright to click 'Export' on each register page,
or POST simulation of ViewState/EventValidation tokens.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers._stub import PlaywrightTodoStub  # noqa: E402
from shared.base import setup_logging  # noqa: E402


class IECentralBankImporter(PlaywrightTodoStub):
    SERVICE_NAME = "ie_central_bank"
    TARGET_TABLE = "ie_central_bank_registers"
    COLUMNS = ["entity_name", "register_type", "registration_number",
               "address", "status", "metadata_json"]
    PK_COLUMNS = []
    SOURCE_URL = "https://registers.centralbank.ie/DownloadsPage.aspx"


if __name__ == "__main__":
    setup_logging("ie_central_bank")
    IECentralBankImporter().run()
