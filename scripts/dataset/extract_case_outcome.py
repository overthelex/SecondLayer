#!/usr/bin/env python3
"""
Extract case-outcome dataset from EDRSR for HuggingFace.

Parses Ukrainian court decisions into sections (facts, reasoning, dispositive)
and classifies outcomes as: granted / denied / partial / other.

Output: JSONL file ready for HuggingFace datasets upload.
"""

import json
import re
import sys
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dataclasses import dataclass, asdict
from typing import Optional

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5438,
    "dbname": "secondlayer_prod",
    "user": "secondlayer",
    "password": os.environ.get("PGPASSWORD", ""),
}

# Section boundary patterns
FACTS_START = re.compile(
    r'[вВуУ]\s*[сС]\s*[тТ]\s*[аА]\s*[нН]\s*[оО]\s*[вВ]\s*[иИі]\s*[вВлЛ]\s*:',
    re.IGNORECASE
)
REASONING_START = re.compile(
    r'[Зз]важаючи|[Вв]ідповідно до|[Сс]уд,?\s+(вважає|зазначає|враховує|приходить)',
    re.IGNORECASE
)
DISPOSITIVE_START = re.compile(
    r'[вВ]\s*[иИі]\s*[рР]\s*[іІ]\s*[шШ]\s*[иИі]\s*[вВ]\s*:|'
    r'[пП]\s*[оО]\s*[сС]\s*[тТ]\s*[аА]\s*[нН]\s*[оО]\s*[вВ]\s*[иИі]\s*[вВ]\s*:|'
    r'[уУ]\s*[хХ]\s*[вВ]\s*[аА]\s*[лЛ]\s*[иИі]\s*[вВ]\s*:',
    re.IGNORECASE
)
GUIDED_BY = re.compile(
    r'[Кк]еруючись',
    re.IGNORECASE
)

# Outcome classification patterns
OUTCOME_GRANTED = re.compile(
    r'позов(?:ні вимоги|ну заяву)?\s.*?задовол(?:ь|і)нити(?!\s+частково)|'
    r'позов\s.*?підлягає\s+задоволенню(?!\s+частково)|'
    r'задовол(?:ь|і)нити\s+позов|'
    r'[Зз]аяву\s.*?задовол(?:ь|і)нити|'
    r'задовол(?:ь|і)нити\s.*?заяву|'
    r'позов\s.*?задовол(?:ь|і)нити|'
    r'[Аа]дміністративний\s+позов\s*[-—–]\s*задовол(?:ь|і)нити|'
    r'[Сс]тягнути\s+з\s|'
    r'[Вв]ідшкодувати\s|'
    r'[Вв]изнати\s+протиправн',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_DENIED = re.compile(
    r'(?:у|в)\s+задоволенні\s.*?відмовити|'
    r'позов(?:ні вимоги)?\s.*?відмовити|'
    r'відмовити\s+(?:у|в)\s+задоволенні|'
    r'позов\s.*?не\s+підлягає\s+задоволенню|'
    r'залишити\s.*?без\s+задоволення|'
    r'[ВвУу]\s+позові\s+відмовити|'
    r'відмовити\s+повністю',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_PARTIAL = re.compile(
    r'задовольнити\s+частково|'
    r'частково\s+задовольнити|'
    r'позов(?:ні вимоги)?\s.*?задовольнити\s+частково',
    re.IGNORECASE | re.DOTALL
)
# Criminal/admin offense outcomes
OUTCOME_GUILTY = re.compile(
    r'визнати\s+винн(?:им|ою|ого|ими)|'
    r'визнати\s+винуват(?:им|ою|ого|ими)|'
    r'визнати\s.*?винуват(?:им|ою|ого)\s+(?:у|в)\s|'
    r'визнати\s.*?винн(?:им|ою|ого)\s+(?:у|в)\s|'
    r'винуват(?:им|ою|ого)\s+(?:у|в)\s+(?:вчиненні|скоєнні|пред)|'
    r'винн(?:им|ою|ого)\s+(?:у|в)\s+(?:вчиненні|скоєнні|пред)|'
    r'[Пп]ритягнути\s.*?(?:до\s+адміністративної\s+відповідальності|відповідальності)|'
    r'[Нн]акласти\s.*?(?:стягнення|штраф)',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_ACQUITTED = re.compile(
    r'виправдати|'
    r'визнати\s+невинн(?:им|ою|уватим|уватою)|'
    r'визнати\s+невинуватим',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_PLEA = re.compile(
    r'[Зз]атвердити\s+угоду\s+про\s+визнання\s+винуватості|'
    r'[Зз]атвердити\s+укладену',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_CLOSED = re.compile(
    r'[Пп]ровадження\s.*?(?:закрити|припинити)|'
    r'[Зз]акрити\s+(?:кримінальне\s+)?провадження|'
    r'[Пп]рипинити\s+провадження|'
    r'[Сс]праву\s+про\s+адміністративне\s+правопорушення.*?(?:закрити|припинити|повернути)|'
    r'[Мм]атеріал(?:и)?\s+(?:про\s+)?притягнення.*?(?:повернути|закрити)',
    re.IGNORECASE | re.DOTALL
)


@dataclass
class ParsedDecision:
    doc_id: int
    justice_kind: int
    judgment_code: int
    category_code: Optional[int]
    court_code: int
    judge: Optional[str]
    adjudication_date: Optional[str]
    facts: str
    dispositive: str
    outcome: str  # granted / denied / partial / guilty / plea_deal / closed / other
    epoch: str  # pre_war / hybrid_war / full_scale
    year: int
    full_text_length: int


def extract_sections(text: str) -> dict:
    # Find the FIRST standalone "встановив:" (not mid-sentence like "суд встановив, що")
    facts_match = None
    for m in FACTS_START.finditer(text):
        # Check it's a section header, not mid-sentence
        before = text[max(0, m.start()-5):m.start()].strip()
        if not before or before.endswith((',', '-', '\n', ' ')):
            facts_match = m
            break
    dispositive_match = DISPOSITIVE_START.search(text)
    guided_match = GUIDED_BY.search(text)

    facts = ""
    dispositive = ""

    if facts_match:
        facts_start = facts_match.end()
        facts_end = guided_match.start() if guided_match else (dispositive_match.start() if dispositive_match else len(text))
        facts = text[facts_start:facts_end].strip()

    if dispositive_match:
        dispositive = text[dispositive_match.end():].strip()
        # Trim boilerplate after the actual ruling
        boilerplate = re.search(
            r'Рішення\s+(?:може бути оскаржене|суду\s+набирає\s+законної\s+сили)',
            dispositive, re.IGNORECASE
        )
        if boilerplate:
            dispositive = dispositive[:boilerplate.start()].strip()

    return {"facts": facts, "dispositive": dispositive}


def classify_outcome(dispositive: str, justice_kind: int) -> str:
    if not dispositive:
        return "other"
    # Criminal (2) and admin offenses (5) have different outcome types
    if justice_kind in (2, 5):
        if OUTCOME_PLEA.search(dispositive):
            return "plea_deal"
        if OUTCOME_ACQUITTED.search(dispositive):
            return "closed"  # acquitted merged into closed (only ~8 records in 100M)
        if OUTCOME_CLOSED.search(dispositive):
            return "closed"
        if OUTCOME_GUILTY.search(dispositive):
            return "guilty"
    # Civil/admin/commercial
    if OUTCOME_PARTIAL.search(dispositive):
        return "partial"
    if OUTCOME_GRANTED.search(dispositive):
        return "granted"
    if OUTCOME_DENIED.search(dispositive):
        return "denied"
    if OUTCOME_CLOSED.search(dispositive):
        return "closed"
    return "other"


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'ОСОБА_\d+', '[PERSON]', text)
    text = re.sub(r'АДРЕСА_\d+', '[ADDRESS]', text)
    text = re.sub(r'НОМЕР_\d+', '[NUMBER]', text)
    text = re.sub(r'ІНФОРМАЦІЯ_\d+', '[INFO]', text)
    return text.strip()


def main():
    epochs = {
        "pre_war":    {"years": [2008, 2010, 2011, 2012, 2013], "per_kind": 600},
        "hybrid_war": {"years": [2014, 2018, 2019, 2020, 2021], "per_kind": 1000},
        "full_scale": {"years": [2022, 2023, 2024, 2025, 2026], "per_kind": 1400},
    }
    max_per_query = 20000
    output_file = sys.argv[1] if len(sys.argv) > 1 else "ua_case_outcome.jsonl"
    stats = {"total": 0, "granted": 0, "denied": 0, "partial": 0, "guilty": 0, "plea_deal": 0, "closed": 0, "other": 0, "skipped_no_facts": 0, "skipped_short": 0}

    conn = psycopg2.connect(**DB_CONFIG)
    conn.set_client_encoding('UTF8')

    with open(output_file, 'w', encoding='utf-8') as out:
        for epoch_name, epoch_cfg in epochs.items():
            epoch_years = epoch_cfg["years"]
            target_per_kind = epoch_cfg["per_kind"]
            per_kind_per_year = target_per_kind // len(epoch_years) + 1

            for justice_kind in [1, 2, 3, 4, 5]:
                kind_count = 0

                for year in epoch_years:
                    if kind_count >= target_per_kind:
                        break
                    year_count = 0
                    print(f"\n--- {epoch_name} / {year} / jk={justice_kind} ---")

                    jc = {1: 3, 2: 1, 3: 3, 4: 3, 5: 2}.get(justice_kind, 3)
                    doc_table = f"edrsr_documents_p_{year}"
                    ft_table = f"edrsr_fulltext_p_{year}"

                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        # Step 1: fast metadata-only query (indexed)
                        cur.execute(f"""
                            SELECT doc_id, justice_kind, judgment_code, category_code,
                                   court_code, judge, adjudication_date::text
                            FROM {doc_table}
                            WHERE justice_kind = %s AND judgment_code = %s
                            LIMIT %s
                        """, (justice_kind, jc, max_per_query))
                        meta_rows = cur.fetchall()

                        # Step 2: batch fetch fulltext for these doc_ids
                        batch_size = 200
                        for i in range(0, len(meta_rows), batch_size):
                            if kind_count >= target_per_kind or year_count >= per_kind_per_year:
                                break
                            batch = meta_rows[i:i+batch_size]
                            doc_ids = [r["doc_id"] for r in batch]
                            cur.execute(f"""
                                SELECT doc_id, full_text FROM {ft_table}
                                WHERE doc_id = ANY(%s)
                            """, (doc_ids,))
                            texts = {r["doc_id"]: r["full_text"] for r in cur.fetchall()}

                            for row in batch:
                                if kind_count >= target_per_kind or year_count >= per_kind_per_year:
                                    break

                                text = texts.get(row["doc_id"])
                                if not text or len(text) < 3000 or len(text) > 50000:
                                    continue

                                sections = extract_sections(text)
                                if not sections["facts"] or len(sections["facts"]) < 200:
                                    stats["skipped_no_facts"] += 1
                                    continue
                                if not sections["dispositive"] or len(sections["dispositive"]) < 50:
                                    stats["skipped_short"] += 1
                                    continue

                                outcome = classify_outcome(sections["dispositive"], justice_kind)

                                record = ParsedDecision(
                                    doc_id=row["doc_id"],
                                    justice_kind=row["justice_kind"],
                                    judgment_code=row["judgment_code"],
                                    category_code=row["category_code"],
                                    court_code=row["court_code"],
                                    judge=row["judge"],
                                    adjudication_date=row["adjudication_date"],
                                    facts=clean_text(sections["facts"]),
                                    dispositive=clean_text(sections["dispositive"]),
                                    outcome=outcome,
                                    epoch=epoch_name,
                                    year=year,
                                    full_text_length=len(text),
                                )
                                year_count += 1
                                out.write(json.dumps(asdict(record), ensure_ascii=False) + '\n')
                                stats[outcome] += 1
                                stats["total"] += 1
                                kind_count += 1

                                if kind_count % 200 == 0:
                                    print(f"  {epoch_name}/{year} jk={justice_kind}: {kind_count}/{target_per_kind}", flush=True)

                print(f"  {epoch_name} jk={justice_kind} done: {kind_count} records", flush=True)

    conn.close()

    print(f"\n=== Dataset stats ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"\nOutput: {output_file}")


if __name__ == "__main__":
    main()
