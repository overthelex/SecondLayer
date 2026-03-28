#!/usr/bin/env python3
"""
Інтерактивний браузер відкритих даних на проді.

Навігація:
  ↑↓       — вибір реєстру / документа в списку
  Enter    — відкрити реєстр → показати документи
  ←→       — попередній / наступний документ
  ↓        — прокрутити текст документа вниз
  ↑        — прокрутити вверх
  Escape   — назад до списку реєстрів
  q        — вихід

Usage:
    python3 scripts/edrsr/browse-data.py
"""

import curses
import json
import os
import subprocess
import sys
import textwrap

# ── Import table config from db-status.py ──

def _load_db_status():
    import importlib.util
    p = os.path.join(os.path.dirname(__file__), "db-status.py")
    spec = importlib.util.spec_from_file_location("db_status", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

_db = _load_db_status()
TABLE_NAMES_UK = _db.TABLE_NAMES_UK
UPDATE_FREQ_DAYS = _db.UPDATE_FREQ_DAYS

# ── DB config ──

DATABASES = {
    "secondlayer": {
        "container": "secondlayer-postgres-prod",
        "user": "secondlayer",
        "db": "secondlayer_prod",
    },
    "openreyestr": {
        "container": "openreyestr-postgres-prod",
        "user": "openreyestr",
        "db": "openreyestr_prod",
    },
}

# Which tables belong to which DB
OPENREYESTR_TABLES = {
    "debtors", "enforcement_proceedings", "arbitration_managers", "bankruptcy_cases",
    "court_experts", "forensic_methods", "notaries", "special_forms", "streets",
    "administrative_units", "legal_acts", "legal_entities", "individual_entrepreneurs",
    "founders", "signers", "beneficiaries", "exchange_data", "members", "predecessors",
    "assignees", "termination_started", "executive_power", "public_associations",
    "bankruptcy_info", "arma_assets", "nazk_declarations", "tax_debt", "esv_debt",
    "vat_payers", "single_tax_payers", "rnbo_sanctions", "inspection_plans",
    "dssu_financial_reports", "street_renamings", "prozorro_tenders",
}

# ── Preview columns per table (most readable fields first) ──

PREVIEW_COLUMNS = {
    # МВС
    "opendata_wanted_persons": ["last_name_u", "first_name_u", "middle_name_u", "birth_date", "sex", "ovd", "category", "lost_date", "lost_place", "article_crim", "restraint"],
    "opendata_missing_persons": ["last_name_u", "first_name_u", "middle_name_u", "birth_date", "sex", "ovd", "category", "lost_date", "lost_place", "contact"],
    "opendata_wanted_vehicles": ["brand_model", "car_type", "color", "vehicle_number", "body_number", "chassis_number", "engine_number", "organ_unit", "insert_date"],
    "opendata_vehicle_registrations": ["brand", "model", "make_year", "color", "kind", "body", "purpose", "fuel", "oper_name", "reg_addr_koatuu", "d_reg"],
    # НАЗК
    "opendata_corruption": ["last_name", "first_name", "patronymic", "offense_name", "codex_articles", "punishment_type", "punishment", "court_name", "sentence_date"],
    "opendata_corruption_offenders": ["last_name", "first_name", "patronymic", "offense_type", "court_name", "sentence_date"],
    # Санкції
    "opensanctions_entities": ["id", "schema", "name", "aliases", "birth_date", "countries", "sanctions", "datasets"],
    "rnbo_sanctions": ["name", "name_en", "entity_type", "sanction_type", "decree_number", "decree_date", "reason"],
    # Інтелектуальна власність
    "opendata_trademarks": ["registration_number", "app_number", "mark_text", "holder_name", "nice_classes", "status", "registration_date", "expiry_date"],
    "opendata_patents": ["registration_number", "obj_type_name", "title_ua", "title_en", "owner_name", "status", "registration_date"],
    # Юристи
    "opendata_advocates": ["full_name", "certificate_number", "status", "region", "bar_association"],
    "opendata_lawyers": ["full_name", "certificate_number", "status", "region"],
    "opendata_court_experts": ["full_name", "region", "organization", "status"],
    # ВРП / ВККС
    "vrp_decisions": ["date_time", "authority", "decision_num", "voting_title", "voting_result"],
    "vkks_judges": ["full_name", "court_name", "status"],
    "vkks_evaluations": ["judge_name", "court_name", "evaluation_date", "result"],
    "vkks_declarations": ["judge_name", "court_name", "year", "declaration_type"],
    "vkks_judge_efficiency": ["judge_name", "court_name", "period", "cases_resolved", "avg_duration_days"],
    "vkks_vacancies": ["court_name", "position", "announced_date", "status"],
    # Верховна Рада
    "bills": ["bill_number", "title", "registration_date", "status", "stage", "main_committee_name"],
    "deputies": ["full_name", "faction_name", "region", "committee_name"],
    "voting_records": ["session_date", "question_number", "question_text", "total_voted", "voted_for", "voted_against", "result"],
    "legislation": ["law_number", "title", "law_type", "adoption_date", "status"],
    "legislation_articles": ["law_number", "article_number", "title", "text"],
    "legislation_chunks": ["law_number", "section_type", "section_number", "title"],
    # Фінанси
    "spending_acts": ["doc_number", "doc_date", "payer_name", "payer_edrpou", "recipient_name", "amount", "purpose"],
    "spending_addendums": ["doc_number", "doc_date", "payer_name", "recipient_name", "amount"],
    "spending_contracts": ["contract_number", "contract_date", "customer_name", "executor_name", "amount"],
    "spending_peny": ["doc_number", "doc_date", "payer_name", "recipient_name", "amount"],
    # Документи / ЄДРНПА
    "opendata_edrnpa_cards": ["act_id", "publisher", "act_type", "act_number", "act_date", "act_title", "status"],
    "opendata_edrnpa_texts": ["act_id", "act_title", "publisher"],
    # Судова система
    "court_sessions": ["court_name", "judge", "case_number", "session_date", "session_form", "participants"],
    "opendata_court_case_status": ["case_number", "court_name", "judge", "status", "category"],
    "opendata_court_schedule": ["court_name", "judge", "case_number", "hearing_date", "hearing_type"],
    "dsa_case_distribution": ["cause_number", "court_name", "presiding_judge", "case_category", "case_essence", "distribution_start"],
    "judges": ["full_name", "court_name", "gender"],
    "judges_current": ["full_name", "court_name", "gender"],
    "judge_analytics": ["judge_name", "court_name", "total_cases", "avg_duration"],
    "echr_cases": ["case_number", "title", "judgment_date", "importance_level", "respondent_state"],
    "supreme_court_reviews": ["title", "review_date", "category"],
    # Паспорти / Люстрація / Держдопомога
    "opendata_invalid_passports": ["series", "number", "insert_date"],
    "opendata_invalid_passports_foreign": ["series", "number", "insert_date"],
    "opendata_lustration": ["full_name", "position", "authority", "lustration_date"],
    "opendata_state_aid": ["recipient_name", "recipient_edrpou", "aid_form", "amount", "decision_date"],
    "opendata_financial_statements": ["entity_name", "edrpou", "year", "total_assets", "net_income"],
    # Банкрутство / НКЦПФР
    "opendata_bankruptcy": ["debtor_name", "debtor_edrpou", "court_name", "status"],
    "opendata_bankruptcy_cases": ["debtor_name", "debtor_edrpou", "case_number", "court_name", "proceeding_status"],
    "opendata_securities_owners": ["issuer_name", "issuer_edrpou", "owner_name", "share_percent", "report_date"],
    "opendata_vat_payers": ["name", "kod_pdv", "dat_reestr"],
    "opendata_declaration_checks": ["declarant_name", "check_type", "status", "check_date"],
    "opendata_large_taxpayers": ["name", "edrpou", "inclusion_date"],
    "opendata_wage_debtors": ["name", "edrpou", "debt_amount", "region"],
    "opendata_public_organizations": ["name", "edrpou", "registry_type", "state", "address"],
    "opendata_judge_candidates": ["full_name", "court_name", "competition_date", "status"],
    "opendata_terrorism_orgs": ["name", "sanction_type"],
    "opendata_terrorism_persons": ["name", "sanction_type"],
    # OpenReyestr
    "notaries": ["full_name", "certificate_number", "region", "organization", "status"],
    "court_experts": ["full_name", "region", "organization", "status"],
    "arbitration_managers": ["full_name", "registration_number", "certificate_number", "certificate_status"],
    "enforcement_proceedings": ["proceeding_number", "opening_date", "debtor_name", "debtor_edrpou", "creditor_name", "enforcement_agency", "proceeding_status"],
    "debtors": ["proceeding_number", "debtor_name", "debtor_edrpou", "collection_category", "executor_name"],
    "legal_entities": ["name", "edrpou", "short_name", "stan"],
    "individual_entrepreneurs": ["name", "stan"],
    "founders": ["entity_edrpou", "founder_name", "founder_role"],
    "signers": ["entity_edrpou", "signer_name"],
    "beneficiaries": ["entity_edrpou", "beneficiary_name", "ownership_type"],
    "special_forms": ["series", "form_number", "recipient", "document_type", "usage_date"],
    "streets": ["street_name", "full_address", "region", "settlement"],
    "administrative_units": ["full_name", "region", "district", "settlement_name"],
    "legal_acts": ["act_id", "publisher", "act_type", "act_number", "act_date", "act_title", "status"],
    "bankruptcy_cases": ["registration_number", "debtor_name", "debtor_edrpou", "case_number", "court_name", "proceeding_status"],
    "forensic_methods": ["registration_code", "method_name", "expertise_type", "developer", "status"],
    "public_associations": ["name", "edrpou", "type_subject", "stan"],
    "arma_assets": ["asset_name", "asset_type", "owner_name", "seizure_date", "status"],
    "nazk_declarations": ["declarant_name", "declaration_type", "year", "status"],
    "tax_debt": ["entity_name", "edrpou", "tax_type", "debt_amount"],
    "esv_debt": ["entity_name", "edrpou", "debt_amount"],
    "vat_payers": ["name", "ind_pdv", "reg_date"],
    "single_tax_payers": ["name", "edrpou", "tax_group", "reg_date"],
    "inspection_plans": ["entity_name", "authority", "planned_date", "inspection_type"],
    "dssu_financial_reports": ["entity_name", "report_type", "period", "total_assets"],
    "street_renamings": ["old_name", "new_name", "settlement", "decision_date"],
    "prozorro_tenders": ["tender_id", "title", "procuring_entity", "expected_cost", "status"],
    "exchange_data": ["entity_edrpou", "entity_name"],
    "members": ["entity_edrpou", "member_name"],
    "predecessors": ["entity_edrpou", "predecessor_name"],
    "assignees": ["entity_edrpou", "assignee_name"],
    "termination_started": ["entity_edrpou", "entity_name", "termination_date"],
    "executive_power": ["entity_edrpou", "entity_name", "authority_type"],
    "bankruptcy_info": ["entity_edrpou", "entity_name", "status"],
}


def prod_psql(container: str, user: str, db: str, sql: str) -> str:
    flat_sql = " ".join(sql.strip().split())
    shell_cmd = f'docker exec {container} psql -U {user} -d {db} -t -A -c "{flat_sql}"'
    cmd = ["ssh", "prod", shell_cmd]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        return ""
    return r.stdout.strip()


def get_db_config(table: str):
    if table in OPENREYESTR_TABLES:
        return DATABASES["openreyestr"]
    return DATABASES["secondlayer"]


def fetch_row_count(table: str) -> int:
    cfg = get_db_config(table)
    raw = prod_psql(cfg["container"], cfg["user"], cfg["db"],
                    f"SELECT reltuples::bigint FROM pg_class WHERE relname = '{table}'")
    return int(raw) if raw else 0


def fetch_records(table: str, limit: int = 1, offset: int = 0) -> list[dict]:
    cfg = get_db_config(table)
    cols = PREVIEW_COLUMNS.get(table)
    if not cols:
        # Fallback: get first 8 columns from information_schema
        raw_cols = prod_psql(cfg["container"], cfg["user"], cfg["db"],
            f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' AND table_schema = 'public' ORDER BY ordinal_position LIMIT 8")
        cols = [c.strip() for c in raw_cols.split("\n") if c.strip()]
    if not cols:
        return []

    col_list = ", ".join(cols)
    raw = prod_psql(cfg["container"], cfg["user"], cfg["db"],
        f"SELECT row_to_json(t) FROM (SELECT {col_list} FROM {table} LIMIT {limit} OFFSET {offset}) t")
    rows = []
    for line in raw.split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def format_record(record: dict, width: int = 80) -> list[str]:
    """Format a single record as key-value lines for display."""
    lines = []
    for key, value in record.items():
        val_str = str(value) if value is not None else "—"
        label = key.replace("_", " ").title()
        # Wrap long values
        if len(val_str) > width - len(label) - 4:
            wrapped = textwrap.wrap(val_str, width=width - 4)
            lines.append(f"  {label}: {wrapped[0] if wrapped else '—'}")
            for w in wrapped[1:]:
                lines.append(f"    {w}")
        else:
            lines.append(f"  {label}: {val_str}")
    return lines


# ── Curses UI ──

class DataBrowser:
    def __init__(self, stdscr):
        self.stdscr = stdscr
        self.tables = sorted(
            [t for t in UPDATE_FREQ_DAYS.keys() if t in TABLE_NAMES_UK],
            key=lambda t: TABLE_NAMES_UK.get(t, t)
        )
        self.cursor = 0
        self.scroll_offset = 0
        self.mode = "list"  # list | records | detail
        self.current_table = ""
        self.records = []
        self.record_idx = 0
        self.record_total = 0
        self.detail_lines = []
        self.detail_scroll = 0
        self.status_msg = ""

        curses.curs_set(0)
        curses.start_color()
        curses.use_default_colors()
        curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_CYAN)   # selected
        curses.init_pair(2, curses.COLOR_CYAN, -1)                   # header
        curses.init_pair(3, curses.COLOR_YELLOW, -1)                 # status
        curses.init_pair(4, curses.COLOR_GREEN, -1)                  # key
        curses.init_pair(5, curses.COLOR_WHITE, -1)                  # value

    def run(self):
        while True:
            if self.mode == "list":
                self.draw_list()
            elif self.mode == "detail":
                self.draw_detail()

            key = self.stdscr.getch()

            if key == ord("q"):
                break
            elif key == 27:  # Escape
                if self.mode == "detail":
                    self.mode = "list"
                else:
                    break
            elif self.mode == "list":
                self.handle_list_key(key)
            elif self.mode == "detail":
                self.handle_detail_key(key)

    def draw_list(self):
        self.stdscr.clear()
        h, w = self.stdscr.getmaxyx()

        # Header
        title = " Відкриті дані — Браузер реєстрів "
        self.stdscr.attron(curses.color_pair(2) | curses.A_BOLD)
        self.stdscr.addnstr(0, 0, f"{'═' * w}", w - 1)
        self.stdscr.addnstr(1, max(0, (w - len(title)) // 2), title, w - 1)
        self.stdscr.addnstr(2, 0, f"{'═' * w}", w - 1)
        self.stdscr.attroff(curses.color_pair(2) | curses.A_BOLD)

        # Help line
        help_text = " ↑↓ вибір  Enter відкрити  q вихід"
        self.stdscr.attron(curses.color_pair(3))
        self.stdscr.addnstr(3, 0, help_text, w - 1)
        self.stdscr.attroff(curses.color_pair(3))

        # Table list
        list_start = 5
        visible = h - list_start - 2

        # Adjust scroll
        if self.cursor < self.scroll_offset:
            self.scroll_offset = self.cursor
        if self.cursor >= self.scroll_offset + visible:
            self.scroll_offset = self.cursor - visible + 1

        for i in range(visible):
            idx = self.scroll_offset + i
            if idx >= len(self.tables):
                break
            table = self.tables[idx]
            name = TABLE_NAMES_UK.get(table, table)
            line = f"  {idx + 1:>3}. {name}"

            y = list_start + i
            if y >= h - 1:
                break

            if idx == self.cursor:
                self.stdscr.attron(curses.color_pair(1) | curses.A_BOLD)
                self.stdscr.addnstr(y, 0, line.ljust(w - 1), w - 1)
                self.stdscr.attroff(curses.color_pair(1) | curses.A_BOLD)
            else:
                self.stdscr.addnstr(y, 0, line, w - 1)

        # Status bar
        if self.status_msg:
            self.stdscr.attron(curses.color_pair(3))
            self.stdscr.addnstr(h - 1, 0, f" {self.status_msg}".ljust(w - 1), w - 1)
            self.stdscr.attroff(curses.color_pair(3))

        self.stdscr.refresh()

    def handle_list_key(self, key):
        if key == curses.KEY_UP:
            self.cursor = max(0, self.cursor - 1)
        elif key == curses.KEY_DOWN:
            self.cursor = min(len(self.tables) - 1, self.cursor + 1)
        elif key == curses.KEY_PPAGE:  # Page Up
            self.cursor = max(0, self.cursor - 20)
        elif key == curses.KEY_NPAGE:  # Page Down
            self.cursor = min(len(self.tables) - 1, self.cursor + 20)
        elif key in (curses.KEY_ENTER, 10, 13):
            self.open_table()

    def open_table(self):
        table = self.tables[self.cursor]
        self.current_table = table
        self.record_idx = 0
        self.detail_scroll = 0
        self.status_msg = f"Завантаження {TABLE_NAMES_UK.get(table, table)}..."
        self.draw_list()

        # Fetch count and first record
        self.record_total = fetch_row_count(table)
        records = fetch_records(table, limit=1, offset=0)

        if records:
            self.records = records
            h, w = self.stdscr.getmaxyx()
            self.detail_lines = format_record(records[0], width=w - 4)
            self.mode = "detail"
            self.status_msg = ""
        else:
            self.status_msg = f"Порожній реєстр або помилка з'єднання"

    def load_record(self, idx: int):
        self.status_msg = f"Завантаження запису {idx + 1}..."
        self.draw_detail()

        records = fetch_records(self.current_table, limit=1, offset=idx)
        if records:
            self.records = records
            self.record_idx = idx
            self.detail_scroll = 0
            h, w = self.stdscr.getmaxyx()
            self.detail_lines = format_record(records[0], width=w - 4)
            self.status_msg = ""
        else:
            self.status_msg = "Не вдалося завантажити запис"

    def draw_detail(self):
        self.stdscr.clear()
        h, w = self.stdscr.getmaxyx()

        name = TABLE_NAMES_UK.get(self.current_table, self.current_table)
        total_str = f"{self.record_total:,}".replace(",", " ") if self.record_total > 0 else "?"

        # Header
        self.stdscr.attron(curses.color_pair(2) | curses.A_BOLD)
        header = f" {name}  —  запис {self.record_idx + 1} з {total_str} "
        self.stdscr.addnstr(0, 0, f"{'═' * w}", w - 1)
        self.stdscr.addnstr(1, max(0, (w - len(header)) // 2), header, w - 1)
        self.stdscr.addnstr(2, 0, f"{'═' * w}", w - 1)
        self.stdscr.attroff(curses.color_pair(2) | curses.A_BOLD)

        # Help
        help_text = " ←→ документи  ↑↓ скрол  Esc назад  q вихід"
        self.stdscr.attron(curses.color_pair(3))
        self.stdscr.addnstr(3, 0, help_text, w - 1)
        self.stdscr.attroff(curses.color_pair(3))

        # Record content
        content_start = 5
        visible = h - content_start - 2

        for i in range(visible):
            line_idx = self.detail_scroll + i
            if line_idx >= len(self.detail_lines):
                break

            y = content_start + i
            if y >= h - 1:
                break

            line = self.detail_lines[line_idx]

            # Color key: value
            colon_pos = line.find(":")
            if colon_pos > 0 and line.lstrip().find(":") == colon_pos - len(line) + len(line.lstrip()):
                # Key part
                self.stdscr.attron(curses.color_pair(4) | curses.A_BOLD)
                self.stdscr.addnstr(y, 0, line[:colon_pos + 1], min(colon_pos + 1, w - 1))
                self.stdscr.attroff(curses.color_pair(4) | curses.A_BOLD)
                # Value part
                if colon_pos + 1 < len(line):
                    self.stdscr.addnstr(y, colon_pos + 1, line[colon_pos + 1:], max(0, w - colon_pos - 2))
            else:
                self.stdscr.addnstr(y, 0, line, w - 1)

        # Scroll indicator
        if len(self.detail_lines) > visible:
            pct = int((self.detail_scroll / max(1, len(self.detail_lines) - visible)) * 100)
            scroll_info = f" [{pct}%] ↕ {len(self.detail_lines)} рядків"
            self.stdscr.attron(curses.color_pair(3))
            self.stdscr.addnstr(h - 1, w - len(scroll_info) - 1, scroll_info, len(scroll_info))
            self.stdscr.attroff(curses.color_pair(3))

        # Status bar
        if self.status_msg:
            self.stdscr.attron(curses.color_pair(3))
            self.stdscr.addnstr(h - 1, 0, f" {self.status_msg}", min(len(self.status_msg) + 1, w - 1))
            self.stdscr.attroff(curses.color_pair(3))

        self.stdscr.refresh()

    def handle_detail_key(self, key):
        h, _ = self.stdscr.getmaxyx()
        visible = h - 7

        if key == curses.KEY_DOWN:
            max_scroll = max(0, len(self.detail_lines) - visible)
            self.detail_scroll = min(max_scroll, self.detail_scroll + 1)
        elif key == curses.KEY_UP:
            self.detail_scroll = max(0, self.detail_scroll - 1)
        elif key == curses.KEY_NPAGE:
            max_scroll = max(0, len(self.detail_lines) - visible)
            self.detail_scroll = min(max_scroll, self.detail_scroll + visible)
        elif key == curses.KEY_PPAGE:
            self.detail_scroll = max(0, self.detail_scroll - visible)
        elif key == curses.KEY_RIGHT:
            # Next record
            if self.record_idx < self.record_total - 1:
                self.load_record(self.record_idx + 1)
        elif key == curses.KEY_LEFT:
            # Previous record
            if self.record_idx > 0:
                self.load_record(self.record_idx - 1)


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
        print(__doc__)
        sys.exit(0)

    curses.wrapper(lambda stdscr: DataBrowser(stdscr).run())


if __name__ == "__main__":
    main()
