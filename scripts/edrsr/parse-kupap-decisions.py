#!/usr/bin/env python3
"""
Structural parser for КУпАП (justice_kind=5) court decisions.

Extracts from the ПОСТАНОВИВ section:
  - КУпАП article(s) cited
  - Outcome: guilty / closed / returned
  - Penalty type: fine / license_revocation / arrest / warning / community_service
  - Fine amount in НМДГ and UAH
  - License revocation term (months)
  - Court fee (UAH)

Results are written to `kupap_parsed_decisions` table.

Usage:
    python3 parse-kupap-decisions.py --year 2024 --workers 4
    python3 parse-kupap-decisions.py --all --workers 8
    python3 parse-kupap-decisions.py --year 2024 --dry-run --sample 100
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from typing import Optional

import psycopg2
from psycopg2.extras import execute_values

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

BATCH_SIZE = 500

# ── Article extraction patterns ────────────────────────────────────

RE_CHARGE_ARTICLE = re.compile(
    r'(?:передбачен(?:ого|е|ій|им)|предусмотренн(?:ого|ое|ой|ым)|за)\s+'
    r'(?:ст\.?\s*(?:ст\.?\s*)?|стат(?:т[іея]|ей|ь[иею])\s*)'
    r'([\d]+(?:\s*-\s*\d+)?)\s*'
    r'(?:ч\.?\s*(\d+)\s+)?'
    r'(?:КУпАП|КУоАП|Кодексу\s+України\s+про\s+адмін|КоАП)',
    re.IGNORECASE | re.UNICODE,
)

RE_CHARGE_ARTICLE_PART_FIRST = re.compile(
    r'(?:передбачен(?:ого|е|ій|им)|предусмотренн(?:ого|ое|ой|ым)|за)\s+'
    r'(?:ч(?:астин[аиіє]|\.)\s*(\d+)\s+)'
    r'(?:ст\.?\s*(?:ст\.?\s*)?|стат(?:т[іея]|ей|ь[иею])\s*)'
    r'([\d]+(?:\s*-\s*\d+)?)\s*'
    r'(?:КУпАП|КУоАП|Кодексу\s+України\s+про\s+адмін|КоАП)',
    re.IGNORECASE | re.UNICODE,
)

# ── Outcome detection ──────────────────────────────────────────────

RE_GUILTY = re.compile(
    r'визнати\s+(?:\S+\s+)?(?:винн(?:им|ою|ий)|винуват(?:им|ою|ий))',
    re.IGNORECASE | re.UNICODE,
)

RE_GUILTY_RU = re.compile(
    r'(?:признать\s+(?:\S+\s+)?виновн(?:ым|ой)|подвергнуть\s+\S+\s+взыскани)',
    re.IGNORECASE | re.UNICODE,
)

RE_CLOSED = re.compile(
    r'(?:(?:провадження|справу)\s+(?:у\s+справі\s+)?(?:про\s+адміністративне\s+правопорушення\s+)?'
    r'(?:\.{0,3}\s*)?закрити'
    r'|закрити\s+провадження)',
    re.IGNORECASE | re.UNICODE,
)

RE_RETURNED = re.compile(
    r'(?:повернути\s+(?:матеріали|справу|протокол|адміністративний)'
    r'|(?:справу|матеріали|протокол)\s+.*?повернути)',
    re.IGNORECASE | re.UNICODE,
)

RE_PENALTY_IMPOSED = re.compile(
    r'(?:накласти\s+(?:на\s+)?|застосувати\s+|піддати\s+(?:до\s+)?)'
    r'(?:\S+\s+)?'
    r'(?:адміністративне\s+стягнення|адміністративного\s+стягнення|штраф|попередження|взыскани)',
    re.IGNORECASE | re.UNICODE,
)

RE_GUILTY_ПРИТЯГНУТИ = re.compile(
    r'притягнути\s+(?:\S+\s+)?(?:до\s+)?адміністративної\s+відповідальності',
    re.IGNORECASE | re.UNICODE,
)

RE_CLOSED_247 = re.compile(
    r'(?:провадження|справу?).*?'
    r'(?:п(?:ункт)?\.?\s*\d+\s+)?'
    r'(?:ч(?:астин)?\.?\s*\d+\s+)?'
    r'ст(?:атт)?\.?\s*247\s+'
    r'КУпАП',
    re.IGNORECASE | re.UNICODE,
)

RE_RELEASED = re.compile(
    r'звільнити\s+.*?від\s+(?:адміністративної\s+)?відповідальності',
    re.IGNORECASE | re.UNICODE,
)

RE_PROCEDURAL = re.compile(
    r'(?:зобов.язати\s+.*?доставити\s+приводом'
    r'|застосувати\s+привід'
    r'|піддати\s+приводу'
    r'|здійснити\s+(?:примусовий\s+)?привід'
    r'|доставити\s+приводом'
    r'|об.єднати\s+(?:в\s+одне\s+)?провадження'
    r'|передати\s+(?:справу\s+)?за\s+підсудністю'
    r'|відкласти\s+розгляд'
    r'|розгляд\s+справи\s+.*?відкласти'
    r'|зупинити\s+провадження'
    r'|поновити\s+провадження'
    r'|продовжити\s+строк\s+розгляду'
    r'|витребувати\s+(?:матеріали|справу|документи)'
    r'|викликати\s+(?:свідк|потерпіл)'
    r'|самовідвід'
    r'|заяв(?:у|і)\s+.*?(?:самовідвід|відвід)'
    r'|виправити\s+описку'
    r'|(?:матеріали|справу)\s+.*?(?:направити|передати)'
    r'|клопотання\s+.*?(?:задовольнити|відхилити|залишити)'
    r'|уточнити\s+постанову'
    r'|вилучен(?:і|ий|а)\s+реч'
    r'|роз.яснити\s+'
    r'|(?:у\s+задоволенні|в\s+задоволенні)\s+.*?відмовити'
    r'|відмовити\s+(?:у|в)\s+задоволенні'
    r'|розстрочити'
    r'|провести\s+.*?(?:відеоконференц|в\s+режимі)'
    r'|судове\s+засідання\s+.*?призначити'
    r'|(?:скаргу|апеляційну)\s+.*?повернути'
    r'|вважати\s+(?:вірним|правильним)'
    r')',
    re.IGNORECASE | re.UNICODE,
)

RE_APPEAL_UPHELD = re.compile(
    r'(?:(?:апеляційну\s+скаргу|скаргу)\s+.*?(?:залишити\s+без\s+задоволення|відхилити|відмовити)'
    r'|постанову\s+.*?залишити\s+без\s+змін'
    r'|залишити\s+без\s+змін.*?(?:скаргу|апеляційну)\s+.*?без\s+задоволення)',
    re.IGNORECASE | re.UNICODE,
)

RE_APPEAL_GRANTED = re.compile(
    r'(?:апеляційну\s+скаргу|скаргу)\s+.*?задовольнити',
    re.IGNORECASE | re.UNICODE,
)

# ── Penalty patterns ──────────────────────────────────────────────

RE_FINE_NMDG = re.compile(
    r'штраф[уі]?\s+(?:у\s+|в\s+)?(?:розмірі\s+)?'
    r'([\w\s\'-]+?)\s*'
    r'неоподатковуван(?:их|ого)\s+мінімум(?:ів|у)\s+доходів\s+громадян',
    re.IGNORECASE | re.UNICODE,
)

RE_FINE_UAH = re.compile(
    r'(?:штраф[уі]?\s+.*?)?'
    r'(?:що\s+становить|стягнувши\s+з\s+\S+)\s+'
    r'(\d[\d\s]*(?:[.,]\d{1,2})?)\s*'
    r'(?:\([^)]+\)\s*)?'
    r'(?:грн|гривень|грив)',
    re.IGNORECASE | re.UNICODE,
)

RE_FINE_UAH_DIRECT = re.compile(
    r'штраф[уі]?\s+(?:у\s+|в\s+)?розмірі\s+'
    r'(\d[\d\s]*(?:[.,]\d{1,2})?)\s*'
    r'(?:\([^)]+\)\s*)?'
    r'(?:грн|гривень|грив)',
    re.IGNORECASE | re.UNICODE,
)

RE_LICENSE_REVOCATION = re.compile(
    r'позбавленн(?:я|ям)\s+права\s+керування\s+'
    r'(?:транспортними\s+засобами\s+|всіма\s+видами\s+транспортних\s+засобів\s+)?'
    r'(?:строком\s+|на\s+строк\s+)?(?:на\s+)?'
    r'([\w\s\'-]+?)(?:\s*\.|\s*$)',
    re.IGNORECASE | re.UNICODE,
)

RE_ARREST = re.compile(
    r'адміністративн(?:ий|ого)\s+арешт(?:у)?\s+'
    r'(?:строком\s+|на\s+строк\s+)?(?:на\s+)?'
    r'([\w\s\'-]+?)(?:\s+д[іо]б|\s*\.)',
    re.IGNORECASE | re.UNICODE,
)

RE_WARNING = re.compile(
    r'(?:стягнення\s+у\s+виг(?:ляді|ді)|винести|оголосити|застосувати|взыскани\S*\s+в\s+виде)\s+'
    r'(?:усне\s+|усного\s+)?(?:попередження|предупреждени)',
    re.IGNORECASE | re.UNICODE,
)

RE_COMMUNITY_SERVICE = re.compile(
    r'громадськ(?:их|і)\s+робіт\s+'
    r'(?:строком\s+|на\s+строк\s+)?'
    r'([\w\s\'-]+?)(?:\s+годин|\s*\.)',
    re.IGNORECASE | re.UNICODE,
)

RE_COURT_FEE = re.compile(
    r'судов(?:ий|ого)\s+збір(?:у)?\s+'
    r'(?:в\s+розмірі\s+|у\s+розмірі\s+)?'
    r'(\d[\d\s]*(?:[.,]\d{1,2})?)\s*грн',
    re.IGNORECASE | re.UNICODE,
)

# ── НМДГ text → number ────────────────────────────────────────────

NMDG_WORDS = {
    "одн": 1, "два": 2, "три": 3, "чотири": 4, "п'ят": 5,
    "шіст": 6, "сім": 7, "вісім": 8, "дев'ят": 9, "десят": 10,
    "двадцят": 20, "тридцят": 30, "сорок": 40, "п'ятдесят": 50,
    "шістдесят": 60, "сімдесят": 70, "вісімдесят": 80, "дев'яност": 90,
    "ст": 100, "двіст": 200, "трист": 300, "чотирист": 400,
    "п'ятсот": 500, "шістсот": 600, "сімсот": 700, "вісімсот": 800,
    "дев'ятсот": 900, "тисяч": 1000, "однієї тисячі": 1000,
    "двох тисяч": 2000, "трьох тисяч": 3000, "п'яти тисяч": 5000,
}


def parse_nmdg_text(text: str) -> Optional[int]:
    text = text.strip().lower()
    if text.isdigit():
        return int(text)
    num_match = re.match(r'^(\d[\d\s]*)$', text.strip())
    if num_match:
        return int(num_match.group(1).replace(' ', ''))
    for word, val in sorted(NMDG_WORDS.items(), key=lambda x: -len(x[0])):
        if word in text:
            return val
    return None


def parse_uah(text: str) -> Optional[float]:
    cleaned = text.replace(' ', '').replace(',', '.')
    try:
        return float(cleaned)
    except ValueError:
        return None


MONTH_MAP = {
    "один місяць": 1, "одного місяця": 1, "два місяці": 2, "двох місяців": 2,
    "три місяці": 3, "трьох місяців": 3, "чотири місяці": 4,
    "п'ять місяців": 5, "шість місяців": 6, "шести місяців": 6,
    "сім місяців": 7, "вісім місяців": 8, "дев'ять місяців": 9,
    "десять місяців": 10, "одинадцять місяців": 11,
    "один рік": 12, "одного року": 12, "одного рік": 12,
    "півтора року": 18, "два роки": 24, "двох років": 24,
    "три роки": 36, "трьох років": 36, "п'ять років": 60,
}


def parse_license_term_months(text: str) -> Optional[int]:
    text = text.strip().lower()
    for phrase, months in sorted(MONTH_MAP.items(), key=lambda x: -len(x[0])):
        if phrase in text:
            return months
    m = re.search(r'(\d+)\s*(?:місяц|рік|років|року)', text)
    if m:
        val = int(m.group(1))
        if 'рік' in text or 'років' in text or 'року' in text:
            return val * 12
        return val
    return None


# ── Main parser ────────────────────────────────────────────────────

@dataclass
class ParsedDecision:
    doc_id: int
    articles: list[str] = field(default_factory=list)
    outcome: Optional[str] = None
    penalty_types: list[str] = field(default_factory=list)
    fine_nmdg: Optional[int] = None
    fine_uah: Optional[float] = None
    license_revocation_months: Optional[int] = None
    arrest_days: Optional[int] = None
    community_service_hours: Optional[int] = None
    court_fee_uah: Optional[float] = None
    parse_quality: str = 'partial'


def extract_dispositive(text: str) -> str:
    markers = [
        'П О С Т А Н О В И В', 'ПОСТАНОВИВ', 'постановив',
        'п о с т а н о в и в', 'П О С Т А Н О В И Л А', 'ПОСТАНОВИЛА',
        'У Х В А Л И В', 'УХВАЛИВ', 'ухвалив',
        'ПОСТАНОВИЛ', 'постановил',
    ]
    best_pos = -1
    for marker in markers:
        pos = text.rfind(marker)
        if pos > best_pos:
            best_pos = pos
    if best_pos >= 0:
        return text[best_pos:]
    last_third = text[len(text) * 2 // 3:]
    return last_third


PROCEDURAL_ARTICLES = {
    '7', '8', '9', '13', '23', '24-1', '27', '32', '33', '35', '36', '38', '40-1',
    '245', '246', '247', '248', '251', '252', '254', '256', '268', '274',
    '277', '278', '279', '280', '281', '283', '284', '285', '286', '294',
    '307', '308', '309',
}


def parse_decision(doc_id: int, full_text: str) -> ParsedDecision:
    result = ParsedDecision(doc_id=doc_id)

    if not full_text or len(full_text) < 50:
        result.parse_quality = 'empty'
        return result

    if ('Р' in full_text[:100] and 'Рµ' in full_text[:200]) or 'РїРѕС' in full_text[:500]:
        result.parse_quality = 'encoding_error'
        return result

    full_text = full_text.replace('\\~', ' ').replace('~', ' ')
    full_text = re.sub(r'\s{2,}', ' ', full_text)

    articles = set()
    for m in RE_CHARGE_ARTICLE.finditer(full_text):
        article = m.group(1).replace(' ', '')
        part = m.group(2)
        if article not in PROCEDURAL_ARTICLES:
            key = f"ст. {article}" + (f" ч. {part}" if part else "")
            articles.add(key)
    for m in RE_CHARGE_ARTICLE_PART_FIRST.finditer(full_text):
        part = m.group(1)
        article = m.group(2).replace(' ', '')
        if article not in PROCEDURAL_ARTICLES:
            key = f"ст. {article} ч. {part}"
            articles.add(key)
    deduped = set()
    for a in articles:
        base = a.split(' ч.')[0]
        has_specific = any(other.startswith(base + ' ч.') for other in articles if other != a)
        if ' ч.' not in a and has_specific:
            continue
        deduped.add(a)
    result.articles = sorted(deduped)

    dispositive = extract_dispositive(full_text)

    if RE_GUILTY.search(dispositive):
        result.outcome = 'guilty'
    elif RE_CLOSED.search(dispositive):
        result.outcome = 'closed'
    elif RE_CLOSED_247.search(dispositive):
        result.outcome = 'closed'
    elif RE_RETURNED.search(dispositive):
        result.outcome = 'returned'
    elif RE_PENALTY_IMPOSED.search(dispositive):
        result.outcome = 'guilty'
    elif RE_GUILTY_ПРИТЯГНУТИ.search(dispositive):
        result.outcome = 'guilty'
    elif RE_GUILTY.search(full_text):
        result.outcome = 'guilty'
    elif RE_CLOSED.search(full_text):
        result.outcome = 'closed'
    elif RE_CLOSED_247.search(full_text[-3000:]):
        result.outcome = 'closed'
    elif RE_PENALTY_IMPOSED.search(full_text[-2000:]):
        result.outcome = 'guilty'
    elif RE_GUILTY_ПРИТЯГНУТИ.search(full_text[-2000:]):
        result.outcome = 'guilty'
    elif RE_GUILTY_RU.search(dispositive) or RE_GUILTY_RU.search(full_text[-2000:]):
        result.outcome = 'guilty'
    elif RE_RELEASED.search(dispositive):
        result.outcome = 'closed'
    elif RE_APPEAL_UPHELD.search(dispositive):
        result.outcome = 'appeal_upheld'
    elif RE_APPEAL_GRANTED.search(dispositive):
        result.outcome = 'appeal_granted'
    elif RE_PROCEDURAL.search(dispositive):
        result.outcome = 'procedural'
    else:
        result.outcome = 'unknown'

    m = RE_FINE_NMDG.search(dispositive)
    if m:
        result.fine_nmdg = parse_nmdg_text(m.group(1))
        result.penalty_types.append('fine')

    for pattern in (RE_FINE_UAH, RE_FINE_UAH_DIRECT):
        m = pattern.search(dispositive)
        if m:
            val = parse_uah(m.group(1))
            if val and val != result.court_fee_uah:
                result.fine_uah = val
                if 'fine' not in result.penalty_types:
                    result.penalty_types.append('fine')
                break

    m = RE_COURT_FEE.search(full_text)
    if m:
        result.court_fee_uah = parse_uah(m.group(1))

    if result.fine_uah and result.court_fee_uah and result.fine_uah == result.court_fee_uah:
        result.fine_uah = None

    m = RE_LICENSE_REVOCATION.search(dispositive)
    if not m:
        m = RE_LICENSE_REVOCATION.search(full_text[-2000:])
    if m:
        result.license_revocation_months = parse_license_term_months(m.group(1))
        if result.license_revocation_months:
            result.penalty_types.append('license_revocation')

    m = RE_ARREST.search(dispositive)
    if m:
        try:
            result.arrest_days = int(re.search(r'\d+', m.group(1)).group())
        except (AttributeError, ValueError):
            pass
        result.penalty_types.append('arrest')

    if RE_WARNING.search(dispositive):
        result.penalty_types.append('warning')

    m = RE_COMMUNITY_SERVICE.search(dispositive)
    if m:
        try:
            result.community_service_hours = int(re.search(r'\d+', m.group(1)).group())
        except (AttributeError, ValueError):
            pass
        result.penalty_types.append('community_service')

    if result.articles and result.outcome not in ('unknown', None):
        if result.penalty_types or result.outcome in ('closed', 'returned', 'appeal_upheld', 'appeal_granted', 'procedural'):
            result.parse_quality = 'full'
        else:
            result.parse_quality = 'partial'
    elif result.articles:
        result.parse_quality = 'partial'
    elif result.outcome not in ('unknown', None):
        result.parse_quality = 'partial'
    else:
        result.parse_quality = 'minimal'

    return result


# ── DB operations ──────────────────────────────────────────────────

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS kupap_parsed_decisions (
    doc_id BIGINT PRIMARY KEY,
    articles TEXT[] NOT NULL DEFAULT '{}',
    outcome TEXT,
    penalty_types TEXT[] NOT NULL DEFAULT '{}',
    fine_nmdg INTEGER,
    fine_uah NUMERIC(12,2),
    license_revocation_months INTEGER,
    arrest_days INTEGER,
    community_service_hours INTEGER,
    court_fee_uah NUMERIC(10,2),
    parse_quality TEXT NOT NULL DEFAULT 'partial',
    parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kupap_parsed_outcome ON kupap_parsed_decisions (outcome);
CREATE INDEX IF NOT EXISTS idx_kupap_parsed_quality ON kupap_parsed_decisions (parse_quality);
CREATE INDEX IF NOT EXISTS idx_kupap_parsed_articles ON kupap_parsed_decisions USING GIN (articles);
CREATE INDEX IF NOT EXISTS idx_kupap_parsed_penalty ON kupap_parsed_decisions USING GIN (penalty_types);
"""


def ensure_table(dsn: str):
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
    conn.close()


def get_existing_doc_ids(dsn: str, year: Optional[int] = None) -> set[int]:
    conn = psycopg2.connect(dsn)
    with conn.cursor() as cur:
        if year:
            cur.execute("""
                SELECT p.doc_id FROM kupap_parsed_decisions p
                JOIN edrsr_documents d ON p.doc_id = d.doc_id
                WHERE EXTRACT(YEAR FROM d.adjudication_date) = %s
            """, (year,))
        else:
            cur.execute("SELECT doc_id FROM kupap_parsed_decisions")
        ids = {row[0] for row in cur}
    conn.close()
    return ids


def fetch_batch(dsn: str, year: int, offset: int, limit: int, exclude_ids: set[int]) -> list[tuple[int, str]]:
    conn = psycopg2.connect(dsn)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT d.doc_id, f.full_text
            FROM edrsr_documents d
            JOIN edrsr_fulltext f ON d.doc_id = f.doc_id
            WHERE d.justice_kind = 5
              AND EXTRACT(YEAR FROM d.adjudication_date) = %s
              AND f.full_text IS NOT NULL
              AND length(f.full_text) > 50
            ORDER BY d.doc_id
            OFFSET %s LIMIT %s
        """, (year, offset, limit))
        rows = [(r[0], r[1]) for r in cur if r[0] not in exclude_ids]
    conn.close()
    return rows


def save_batch(dsn: str, results: list[ParsedDecision]):
    if not results:
        return
    conn = psycopg2.connect(dsn)
    with conn.cursor() as cur:
        values = [
            (r.doc_id, r.articles, r.outcome, r.penalty_types,
             r.fine_nmdg, r.fine_uah, r.license_revocation_months,
             r.arrest_days, r.community_service_hours, r.court_fee_uah,
             r.parse_quality)
            for r in results
        ]
        execute_values(cur, """
            INSERT INTO kupap_parsed_decisions
                (doc_id, articles, outcome, penalty_types,
                 fine_nmdg, fine_uah, license_revocation_months,
                 arrest_days, community_service_hours, court_fee_uah,
                 parse_quality)
            VALUES %s
            ON CONFLICT (doc_id) DO UPDATE SET
                articles = EXCLUDED.articles,
                outcome = EXCLUDED.outcome,
                penalty_types = EXCLUDED.penalty_types,
                fine_nmdg = EXCLUDED.fine_nmdg,
                fine_uah = EXCLUDED.fine_uah,
                license_revocation_months = EXCLUDED.license_revocation_months,
                arrest_days = EXCLUDED.arrest_days,
                community_service_hours = EXCLUDED.community_service_hours,
                court_fee_uah = EXCLUDED.court_fee_uah,
                parse_quality = EXCLUDED.parse_quality,
                parsed_at = NOW()
        """, values)
    conn.commit()
    conn.close()


# ── Worker for parallel processing ─────────────────────────────────

def process_year(dsn: str, year: int, dry_run: bool = False, sample: int = 0) -> dict:
    start = time.time()
    exclude_ids = set() if dry_run else get_existing_doc_ids(dsn, year)

    stats = Counter()
    all_results: list[ParsedDecision] = []
    offset = 0

    while True:
        batch = fetch_batch(dsn, year, offset, BATCH_SIZE, exclude_ids)
        if not batch:
            break

        for doc_id, text in batch:
            parsed = parse_decision(doc_id, text)
            all_results.append(parsed)
            stats['total'] += 1
            stats[f'outcome_{parsed.outcome}'] += 1
            stats[f'quality_{parsed.parse_quality}'] += 1
            for pt in parsed.penalty_types:
                stats[f'penalty_{pt}'] += 1

            if sample and stats['total'] >= sample:
                break

        if not dry_run and all_results:
            save_batch(dsn, all_results)
            all_results = []

        offset += BATCH_SIZE
        if stats['total'] % 5000 == 0:
            elapsed = time.time() - start
            rate = stats['total'] / elapsed if elapsed > 0 else 0
            print(f"  [{year}] {stats['total']:,} docs | {rate:.0f} docs/s | "
                  f"guilty={stats.get('outcome_guilty', 0):,} closed={stats.get('outcome_closed', 0):,}")

        if sample and stats['total'] >= sample:
            break

    if not dry_run and all_results:
        save_batch(dsn, all_results)

    elapsed = time.time() - start
    return {
        'year': year,
        'elapsed_s': round(elapsed, 1),
        'stats': dict(stats),
    }


# ── Main ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Parse КУпАП court decisions')
    parser.add_argument('--year', type=int, help='Process single year')
    parser.add_argument('--all', action='store_true', help='Process all years (2006-2026)')
    parser.add_argument('--workers', type=int, default=4, help='Parallel workers')
    parser.add_argument('--dry-run', action='store_true', help='Parse but don\'t save')
    parser.add_argument('--sample', type=int, default=0, help='Process only N docs per year')
    parser.add_argument('--dsn', default=DB_DSN, help='Database connection string')
    args = parser.parse_args()

    if not args.year and not args.all:
        parser.error('Specify --year YYYY or --all')

    dsn = args.dsn

    if not args.dry_run:
        ensure_table(dsn)

    years = list(range(2006, 2027)) if args.all else [args.year]

    print(f"Processing {len(years)} year(s) with {args.workers} workers")
    print(f"{'DRY RUN - ' if args.dry_run else ''}{'Sample: ' + str(args.sample) if args.sample else 'Full run'}")
    print()

    total_stats = Counter()
    start = time.time()

    if args.workers <= 1 or len(years) == 1:
        for year in years:
            result = process_year(dsn, year, args.dry_run, args.sample)
            print(f"  Year {result['year']}: {result['stats'].get('total', 0):,} docs in {result['elapsed_s']}s")
            for k, v in result['stats'].items():
                total_stats[k] += v
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(process_year, dsn, y, args.dry_run, args.sample): y for y in years}
            for future in as_completed(futures):
                result = future.result()
                print(f"  Year {result['year']}: {result['stats'].get('total', 0):,} docs in {result['elapsed_s']}s")
                for k, v in result['stats'].items():
                    total_stats[k] += v

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"Total: {total_stats.get('total', 0):,} docs in {elapsed:.0f}s")
    print(f"\nOutcomes:")
    for k in sorted(total_stats):
        if k.startswith('outcome_'):
            print(f"  {k[8:]:20s} {total_stats[k]:>10,}")
    print(f"\nPenalties:")
    for k in sorted(total_stats):
        if k.startswith('penalty_'):
            print(f"  {k[8:]:20s} {total_stats[k]:>10,}")
    print(f"\nParse quality:")
    for k in sorted(total_stats):
        if k.startswith('quality_'):
            print(f"  {k[8:]:20s} {total_stats[k]:>10,}")

    if args.dry_run and args.sample:
        print(f"\nSample results (first 5):")
        batch = fetch_batch(dsn, years[0], 0, min(5, args.sample), set())
        for doc_id, text in batch[:5]:
            p = parse_decision(doc_id, text)
            print(f"\n  doc_id={p.doc_id}")
            print(f"    articles: {p.articles}")
            print(f"    outcome: {p.outcome}")
            print(f"    penalties: {p.penalty_types}")
            print(f"    fine: {p.fine_nmdg} НМДГ = {p.fine_uah} грн")
            print(f"    license_revocation: {p.license_revocation_months} months")
            print(f"    court_fee: {p.court_fee_uah} грн")
            print(f"    quality: {p.parse_quality}")


if __name__ == '__main__':
    main()
