#!/usr/bin/env python3
"""
Prod DB Statistics — ЄДРСР покриття + огляд усіх таблиць.

Підключається до прод-бази через SSH (ssh prod),
читає pg_class statistics для швидкого результату без повного скану.

Usage:
    python3 scripts/edrsr/edrsr-stats.py
    python3 scripts/edrsr/edrsr-stats.py --format csv
    python3 scripts/edrsr/edrsr-stats.py --format json
"""

import argparse
import json
import os
import subprocess
import sys

CONTAINER = "secondlayer-postgres-prod"
PGUSER = "secondlayer"
PGDB = "secondlayer_prod"

# ── EDRSR queries ──

QUERY_DOCS = """
SELECT
  replace(replace(c.relname, 'edrsr_documents_p_', ''), 'pre', '<') AS year,
  reltuples::bigint AS cnt
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'edrsr_documents_p_%%'
  AND c.relkind = 'r'
ORDER BY c.relname;
"""

QUERY_FULLTEXT = """
SELECT
  replace(replace(c.relname, 'edrsr_fulltext_p_', ''), 'pre', '<') AS year,
  reltuples::bigint AS cnt
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'edrsr_fulltext_p_%%'
  AND c.relkind = 'r'
ORDER BY c.relname;
"""

QUERY_SIZES = """
SELECT
  replace(replace(c.relname, 'edrsr_fulltext_p_', ''), 'pre', '<') AS year,
  pg_total_relation_size(c.oid) AS size_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname LIKE 'edrsr_fulltext_p_%%'
  AND c.relkind = 'r'
ORDER BY c.relname;
"""

QUERY_TOTAL_SIZES = """
SELECT
  'docs' AS tbl,
  pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS size
FROM pg_class c
WHERE c.relname LIKE 'edrsr_documents_p_%%' AND c.relkind = 'r'
UNION ALL
SELECT
  'fulltext' AS tbl,
  pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS size
FROM pg_class c
WHERE c.relname LIKE 'edrsr_fulltext_p_%%' AND c.relkind = 'r';
"""

# ── All tables query ──

QUERY_ALL_TABLES = """
SELECT
  t.tablename,
  c.reltuples::bigint AS row_est,
  pg_total_relation_size(c.oid) AS size_bytes
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
  AND c.relkind = 'r'
  AND t.tablename NOT LIKE 'edrsr_%%'
  AND t.tablename NOT LIKE 'spain_%%'
ORDER BY pg_total_relation_size(c.oid) DESC;
"""


def prod_psql(sql: str) -> str:
    """Execute SQL on prod via SSH + docker exec."""
    flat_sql = " ".join(sql.strip().split())
    shell_cmd = f"docker exec {CONTAINER} psql -U {PGUSER} -d {PGDB} -t -A -c \"{flat_sql}\""
    cmd = ["ssh", "prod", shell_cmd]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"Error: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def parse_kv(raw: str) -> dict:
    """Parse psql pipe-separated output into {key: int_value}."""
    result = {}
    for line in raw.split("\n"):
        if not line or "|" not in line:
            continue
        parts = line.split("|")
        result[parts[0]] = int(parts[1])
    return result


def fmt_num(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def fmt_size(size_bytes: int) -> str:
    if size_bytes < 0:
        return "—"
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.0f} KB"
    elif size_bytes < 1024 ** 3:
        return f"{size_bytes / 1024**2:.0f} MB"
    else:
        return f"{size_bytes / 1024**3:.1f} GB"


def coverage_bar(pct: float, width: int = 20) -> str:
    filled = int(pct / 100 * width)
    return "█" * filled + "░" * (width - filled)


def wait_for_key():
    """Wait for space/enter to continue, q to quit."""
    print("  ─── натисніть ПРОБІЛ або ENTER для продовження, q для виходу ───", end="", flush=True)
    try:
        import tty
        import termios
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        print("\r" + " " * 70 + "\r", end="")
        if ch in ("q", "Q"):
            print()
            sys.exit(0)
    except (ImportError, termios.error, ValueError, EOFError):
        # Fallback for non-TTY (piped input) — just continue
        print("\r" + " " * 70 + "\r", end="")
        pass


def print_edrsr_section(args):
    """Fetch and print EDRSR coverage table."""
    docs_raw = prod_psql(QUERY_DOCS)
    ft_raw = prod_psql(QUERY_FULLTEXT)
    sizes_raw = prod_psql(QUERY_SIZES)
    totals_raw = prod_psql(QUERY_TOTAL_SIZES)

    docs = parse_kv(docs_raw)
    fulltexts = parse_kv(ft_raw)
    sizes = parse_kv(sizes_raw)

    total_sizes = {}
    for line in totals_raw.split("\n"):
        if "|" in line:
            k, v = line.split("|")
            total_sizes[k.strip()] = v.strip()

    all_years = sorted(
        set(list(docs.keys()) + list(fulltexts.keys())),
        key=lambda y: (-1 if y.startswith("<") else 9999 if y in ("default", "future") else int(y)),
    )

    rows = []
    total_docs = 0
    total_ft = 0
    total_size = 0

    for year in all_years:
        d = docs.get(year, 0)
        f = fulltexts.get(year, 0)
        s = sizes.get(year, 0)
        pct = round(f / d * 100, 1) if d > 0 else 0.0
        missing = d - f

        if d <= 0 and f <= 0:
            continue

        rows.append({
            "year": year, "docs": d, "fulltext": f, "missing": missing,
            "coverage": pct, "size_bytes": s, "size": fmt_size(s),
        })
        total_docs += d
        total_ft += f
        total_size += s

    if args.format == "json":
        return {
            "rows": rows,
            "totals": {
                "docs": total_docs, "fulltext": total_ft,
                "coverage": round(total_ft / total_docs * 100, 1) if total_docs else 0,
                "docs_size": total_sizes.get("docs", "?"),
                "fulltext_size": total_sizes.get("fulltext", "?"),
            },
        }

    if args.format == "csv":
        print("year,docs,fulltext,missing,coverage_pct,size")
        for r in rows:
            print(f"{r['year']},{r['docs']},{r['fulltext']},{r['missing']},{r['coverage']},{r['size']}")
        print(f"TOTAL,{total_docs},{total_ft},{total_docs - total_ft},{round(total_ft / total_docs * 100, 1) if total_docs else 0},{fmt_size(total_size)}")
        print()
        return None

    # Table format
    print()
    print(f"  📊 ЄДРСР — покриття повними текстами")
    print(f"  {'─' * 95}")
    print(f"  {'Рік':<8} {'Документів':>12} {'Повних текстів':>16} {'Без тексту':>12} {'Покриття':>9}  {'Розмір':>8}  {'':20}")
    print(f"  {'─' * 95}")

    for r in rows:
        if r["year"] in ("default", "future") and r["docs"] < 100:
            continue

        pct = r["coverage"]
        bar = coverage_bar(pct)

        if pct >= 90:
            status = "✅"
        elif pct >= 50:
            status = "⚠️"
        else:
            status = "❌"

        print(f"  {r['year']:<8} {fmt_num(r['docs']):>12} {fmt_num(r['fulltext']):>16} {fmt_num(r['missing']):>12} {pct:>7.1f}%  {r['size']:>8}  {bar} {status}")

    total_pct = round(total_ft / total_docs * 100, 1) if total_docs else 0
    print(f"  {'─' * 95}")
    print(f"  {'РАЗОМ':<8} {fmt_num(total_docs):>12} {fmt_num(total_ft):>16} {fmt_num(total_docs - total_ft):>12} {total_pct:>7.1f}%  {fmt_size(total_size):>8}  {coverage_bar(total_pct)}")
    print()
    print(f"  💾 Метадані: {total_sizes.get('docs', '?')}  |  Повні тексти: {total_sizes.get('fulltext', '?')}")
    print(f"  📍 БД: {PGDB} @ {CONTAINER}")
    print()
    return None


def print_all_tables_section(args, page_size=30):
    """Fetch and print all non-EDRSR, non-Spain open data tables with Ukrainian names."""
    # Import table names from db-status.py (same directory)
    import importlib.util
    db_status_path = os.path.join(os.path.dirname(__file__), "db-status.py")
    spec = importlib.util.spec_from_file_location("db_status", db_status_path)
    db_status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(db_status)
    TABLE_NAMES_UK = db_status.TABLE_NAMES_UK
    OPENDATA_TABLES = set(db_status.UPDATE_FREQ_DAYS.keys())

    raw = prod_psql(QUERY_ALL_TABLES)

    rows = []
    total_size = 0
    total_rows = 0

    for line in raw.split("\n"):
        if not line or "|" not in line:
            continue
        parts = line.split("|")
        name = parts[0]
        if name not in OPENDATA_TABLES:
            continue
        row_est = int(parts[1])
        size_bytes = int(parts[2])

        rows.append({
            "table": name,
            "display_name": TABLE_NAMES_UK.get(name, name),
            "rows": max(row_est, 0),
            "size_bytes": size_bytes,
            "size": fmt_size(size_bytes),
        })
        total_size += size_bytes
        if row_est > 0:
            total_rows += row_est

    if args.format == "json":
        return {
            "tables": rows,
            "totals": {"count": len(rows), "rows": total_rows, "size": fmt_size(total_size)},
        }

    if args.format == "csv":
        print("table,name_uk,rows,size_bytes,size")
        for r in rows:
            print(f"{r['table']},{r['display_name']},{r['rows']},{r['size_bytes']},{r['size']}")
        print(f"TOTAL ({len(rows)} tables),,{total_rows},{total_size},{fmt_size(total_size)}")
        return None

    # Table format with pagination
    W = 85
    print()
    print(f"  📋 Відкриті дані (без ЄДРСР) — {len(rows)} таблиць, {fmt_size(total_size)} загалом")
    print(f"  {'─' * W}")
    HDR = f"  {'#':<4} {'Реєстр':<50} {'Рядків':>14} {'Розмір':>10}"
    print(HDR)
    print(f"  {'─' * W}")

    for i, r in enumerate(rows):
        row_str = fmt_num(r["rows"]) if r["rows"] > 0 else "—"
        print(f"  {i + 1:<4} {r['display_name']:<50} {row_str:>14} {r['size']:>10}")

        if (i + 1) % page_size == 0 and i + 1 < len(rows):
            remaining = len(rows) - i - 1
            print(f"  {'─' * W}")
            print(f"  ... ще {remaining} таблиць")
            wait_for_key()
            print(f"  {'─' * W}")
            print(HDR)
            print(f"  {'─' * W}")

    print(f"  {'─' * W}")
    print(f"  {'':4} {'РАЗОМ: ' + str(len(rows)) + ' реєстрів':<50} {fmt_num(total_rows):>14} {fmt_size(total_size):>10}")
    print()
    return None


def main():
    parser = argparse.ArgumentParser(description="Prod DB stats: ЄДРСР coverage + all tables")
    parser.add_argument("--format", choices=["table", "csv", "json"], default="table")
    parser.add_argument("--page-size", type=int, default=30, help="rows per page for table output (default: 30)")
    args = parser.parse_args()

    print("⏳ Підключення до прод-бази...", file=sys.stderr)

    if args.format == "json":
        out = {}
        out["edrsr"] = print_edrsr_section(args)
        out["tables"] = print_all_tables_section(args, args.page_size)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    # EDRSR section
    print_edrsr_section(args)

    if args.format == "table":
        wait_for_key()

    # All tables section
    print_all_tables_section(args, args.page_size)


if __name__ == "__main__":
    main()
