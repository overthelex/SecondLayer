"""
Experiment A — Step 1: Extract evaluation dataset from EDRSR prod DB.

Pulls a stratified sample of court decisions across case types.
Requires SSH tunnel: ssh -fN -L 15432:localhost:5438 prod

Usage:
  cd rlhf-signals
  EDRSR_DATABASE_URL="postgres://secondlayer:PASSWORD@localhost:15432/secondlayer_prod" \
    python3 analysis/exp_a_extract_eval.py
"""

import json
import os
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp_a_config import EVAL_DATA_PATH, N_EVAL_SAMPLES

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv(
    "EDRSR_DATABASE_URL",
    os.getenv("DATABASE_URL", "postgres://secondlayer@localhost:15432/secondlayer_prod"),
)

OUTPUT_PATH = Path(__file__).resolve().parent.parent / EVAL_DATA_PATH
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

JURISDICTION_MAP = {
    1: "цивільна",
    2: "кримінальна",
    3: "господарська",
    4: "адміністративна",
}

SAMPLES_PER_CATEGORY = N_EVAL_SAMPLES // len(JURISDICTION_MAP)


def extract_outcome_from_text(text: str) -> str | None:
    text_lower = text[-3000:].lower() if len(text) > 3000 else text.lower()

    if re.search(r"позов\s+задовольнити\s+частково", text_lower):
        return "частково задоволено"
    if re.search(r"позов(ні вимоги)?\s+задовольнити", text_lower):
        return "задоволено"
    if re.search(r"апеляційну скаргу\s+задовольнити\s+частково", text_lower):
        return "частково задоволено"
    if re.search(r"апеляційну скаргу\s+задовольнити", text_lower):
        return "задоволено"
    if re.search(r"(у задоволенні|в задоволенні).{0,30}відмовити", text_lower):
        return "відмовлено"
    if re.search(r"залишити без розгляду", text_lower):
        return "залишено без розгляду"
    if re.search(r"провадження.{0,20}закрити", text_lower):
        return "закрито"
    if re.search(r"визнати винним|визнати винною", text_lower):
        return "задоволено"
    if re.search(r"виправдати", text_lower):
        return "відмовлено"
    if re.search(r"скаргу\s+задовольнити\s+частково", text_lower):
        return "частково задоволено"
    if re.search(r"скаргу\s+задовольнити", text_lower):
        return "задоволено"
    if re.search(r"скаргу.{0,30}відхилити", text_lower):
        return "відмовлено"
    if re.search(r"вимоги\s+задовольнити\s+частково", text_lower):
        return "частково задоволено"
    if re.search(r"вимоги\s+задовольнити", text_lower):
        return "задоволено"
    if re.search(r"(у задоволенні|в задоволенні).{0,50}(скарг|вимог).{0,30}відмовити", text_lower):
        return "відмовлено"
    if re.search(r"стягнути з", text_lower):
        return "задоволено"
    if re.search(r"зобов.язати", text_lower):
        return "задоволено"

    return None


YEAR_PARTITIONS = ["2021", "2020", "2019", "2018"]


def fetch_decisions(conn, justice_kind: int, limit: int) -> list[dict]:
    all_rows = []
    for year in YEAR_PARTITIONS:
        if len(all_rows) >= limit * 4:
            break
        query = f"""
            WITH candidate_docs AS (
                SELECT doc_id, cause_num, court_code, judge,
                       adjudication_date, category_code, judgment_code
                FROM edrsr_documents_p_{year}
                WHERE justice_kind = %s
                ORDER BY random()
                LIMIT %s
            )
            SELECT
                cd.doc_id,
                cd.cause_num,
                c.name AS court_name,
                cd.judge,
                cd.adjudication_date,
                cd.category_code,
                cd.judgment_code,
                f.full_text,
                length(f.full_text) AS text_length
            FROM candidate_docs cd
            JOIN edrsr_fulltext_p_{year} f ON f.doc_id = cd.doc_id
            LEFT JOIN edrsr_courts c ON c.court_code = cd.court_code
            WHERE f.full_text IS NOT NULL
              AND length(f.full_text) BETWEEN 1000 AND 40000
        """
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SET statement_timeout = '300s'")
            cur.execute(query, (justice_kind, limit * 10))
            all_rows.extend(cur.fetchall())

    rows = all_rows

    results = []
    for row in rows:
        if len(results) >= limit:
            break

        text = row["full_text"]
        outcome = extract_outcome_from_text(text)
        if outcome is None:
            continue

        case_type = JURISDICTION_MAP.get(justice_kind, "невідомо")

        results.append({
            "doc_id": str(row["doc_id"]),
            "case_number": row["cause_num"],
            "court_name": row["court_name"],
            "judge": row["judge"],
            "judgment_date": str(row["adjudication_date"]) if row["adjudication_date"] else None,
            "justice_kind": justice_kind,
            "case_type": case_type,
            "category_code": row["category_code"],
            "judgment_code": row["judgment_code"],
            "outcome": outcome,
            "text": text,
            "text_length": row["text_length"] or len(text),
        })

    return results


def main():
    print(f"Connecting to: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_session(readonly=True)

    all_samples = []

    for jur_code, case_type in JURISDICTION_MAP.items():
        print(f"  Fetching {SAMPLES_PER_CATEGORY} {case_type} decisions (justice_kind={jur_code})...")
        samples = fetch_decisions(conn, jur_code, SAMPLES_PER_CATEGORY)
        print(f"    Got {len(samples)} with extractable outcomes")
        all_samples.extend(samples)

    conn.close()

    print(f"\nTotal samples: {len(all_samples)}")
    print("Distribution:")
    from collections import Counter
    type_counts = Counter(s["case_type"] for s in all_samples)
    for ct, count in type_counts.most_common():
        print(f"  {ct}: {count}")
    outcome_counts = Counter(s["outcome"] for s in all_samples)
    for oc, count in outcome_counts.most_common():
        print(f"  {oc}: {count}")

    avg_len = sum(s["text_length"] for s in all_samples) / len(all_samples) if all_samples else 0
    print(f"  Avg text length: {avg_len:.0f} chars")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    print(f"\nSaved to: {OUTPUT_PATH}")
    print(f"File size: {OUTPUT_PATH.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
