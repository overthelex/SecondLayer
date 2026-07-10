#!/usr/bin/env python3
"""Download Article 1 (Стаття 1) of «Про культуру» (2778-17) from every Rada
edition, save each version, and count the real number of amendments.

Replicates the text extraction of scripts/rada/import-historical-editions.ts
(rvts9 span format) so results are comparable to the imported DB.
"""
import os, re, sys, time, hashlib, subprocess

RADA = "2778-17"
BASE = "https://zakon.rada.gov.ua"
OUT = os.path.expanduser("~/rada-culture-art1")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
os.makedirs(os.path.join(OUT, "raw"), exist_ok=True)

def fetch(url, tries=7, min_bytes=3000):
    """Fetch via curl. Treat tiny bodies (<min_bytes) as throttle stubs and retry
    with growing backoff."""
    for i in range(tries):
        try:
            out = subprocess.run(
                ["curl", "-s", "-m", "45", "--compressed",
                 "-A", UA, "-H", "Accept-Language: uk,en;q=0.9", url],
                capture_output=True, timeout=70)
            txt = out.stdout.decode("utf-8", "replace")
            if len(txt) >= min_bytes:
                return txt
        except Exception:
            pass
        time.sleep(3 + 4 * i)   # 3,7,11,15... seconds — back off through throttling
    return txt if 'txt' in dir() else ""

# ── 1. Edition discovery ─────────────────────────────────────────────────────
card4 = fetch(f"{BASE}/laws/show/{RADA}/card4")
open(os.path.join(OUT, "raw", "card4.html"), "w").write(card4)

hyperlink_dates = sorted(set(re.findall(r"/ed(\d{8})", card4)))

# History table: every row <span class="dat1">DD.MM.YYYY</span> ... whose cell
# mentions "редакц" is an edition (even without a hyperlink). Also capture the
# basis act ("підстава ... <number>") in the same row when present.
rows = re.findall(
    r'<span class="dat1">(\d{2})\.(\d{2})\.(\d{4})</span>(.*?)(?=<span class="dat1">|</tbody>|$)',
    card4, re.S)
table_dates, basis = {}, {}
for dd, mm, yyyy, rest in rows:
    if re.search(r"редакц", rest, re.I):
        key = f"{yyyy}{mm}{dd}"
        table_dates[key] = True
        acts = re.findall(r"\b(\d{3,5}-[IVXІ]+)\b", re.sub(r"<[^>]+>", " ", rest))
        if acts:
            basis[key] = acts[-1]

all_dates = sorted(set(hyperlink_dates) | set(table_dates.keys()))
all_dates = [d for d in all_dates if "1900" <= d[:4] <= "2099"]

print(f"hyperlink editions: {len(hyperlink_dates)}")
print(f"history-table edition rows: {len(table_dates)}")
print(f"UNION of edition dates: {len(all_dates)}")
print("dates:", " ".join(all_dates))

# ── 2. Extract Article 1 per edition (importer's rvts9 logic) ─────────────────
RVTS = re.compile(
    r'<span\s+class=["\']?rvts9["\']?>\s*Стаття\s+(\d+(?:-\d+)?)\.?\s*([^<]*)</span>\s*'
    r'(.*?)(?=<span\s+class=["\']?rvts9["\']?>\s*Стаття\s+\d|$)', re.S)

def clean(body):
    body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = (body.replace("&nbsp;", " ").replace("&mdash;", "—")
                .replace("&laquo;", "«").replace("&raquo;", "»").replace("&amp;", "&"))
    body = re.sub(r"\{[^}]*\}", "", body)          # drop {amendment notes}
    body = re.sub(r"\s+", " ", body).strip()
    return body

# Historical-edition format: <b>Стаття N.</b> body ... until <b>Стаття N+1</b>
PREBOLD = re.compile(
    r'<b>Стаття\s+(\d+(?:-\d+)?)\.?</b>\s*(.*?)(?=<b>Стаття\s+\d|</pre>\s*$|$)', re.S)

def clean_bold(body):
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    body = re.sub(r"<b>([^<]*)</b>", r"\1", body)
    return clean(body)

def extract_art1(html):
    # 1) current rvts9 span format
    for m in RVTS.finditer(html):
        if m.group(1).strip() == "1":
            return clean(m.group(3)), (m.group(2) or "").strip(), "rvts9"
    # 2) historical <b>Стаття</b> format
    for m in PREBOLD.finditer(html):
        if m.group(1).strip() == "1":
            return clean_bold(m.group(2)), "", "bold"
    return None, None, None

records = []
for d in all_dates:
    iso = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
    html = fetch(f"{BASE}/laws/show/{RADA}/ed{d}/print")
    art1, title, fmt = extract_art1(html)
    if art1 is None:
        print(f"  {iso}: Стаття 1 NOT FOUND ({len(html)} bytes)")
        records.append((iso, None, None, basis.get(d, "")))
        time.sleep(3)
        continue
    norm = re.sub(r"\s+", " ", art1).strip()
    h = hashlib.md5(norm.encode()).hexdigest()[:8]
    fn = os.path.join(OUT, f"art1_{iso}.txt")
    open(fn, "w").write(f"# Стаття 1. {title}\n# edition {iso}  basis {basis.get(d,'?')}  hash {h}  len {len(norm)}  fmt {fmt}\n\n{art1}\n")
    records.append((iso, h, len(norm), basis.get(d, "")))
    print(f"  {iso}: len={len(norm)} hash={h} fmt={fmt} basis={basis.get(d,'?')}")
    time.sleep(3)

# ── 3. Count real amendments (text transitions) ──────────────────────────────
present = [r for r in records if r[1] is not None]
changes = []
prev_h = None
for iso, h, ln, act in present:
    if prev_h is None:
        kind = "ORIGINAL"
    elif h != prev_h:
        kind = "CHANGED"
        changes.append((iso, act))
    else:
        kind = "same"
    prev_h = h

lines = []
lines.append(f"# Стаття 1 ЗУ «Про культуру» ({RADA}) — історія редакцій\n")
lines.append(f"- Hyperlink editions on card4: {len(hyperlink_dates)}")
lines.append(f"- History-table edition rows: {len(table_dates)}")
lines.append(f"- Editions fetched (union): {len(all_dates)}; Стаття 1 present in: {len(present)}")
lines.append(f"- **Реальних змін тексту Стаття 1: {len(changes)}** (без первинного прийняття)")
lines.append(f"- Дати змін: {', '.join(c[0] for c in changes)}\n")
lines.append("| Редакція | Стаття 1 | Підстава |")
lines.append("|---|---|---|")
prev_h = None
for iso, h, ln, act in records:
    if h is None:
        st = "НЕ ЗНАЙДЕНО"
    elif prev_h is None:
        st = "первинна"
    elif h != prev_h:
        st = "ЗМІНЕНО"
    else:
        st = "без змін"
    if h is not None:
        prev_h = h
    lines.append(f"| {iso} | {st} | {act or ''} |")
summary = "\n".join(lines) + "\n"
open(os.path.join(OUT, "SUMMARY.md"), "w").write(summary)
print("\n" + summary)
print(f"Saved to {OUT}/ (art1_*.txt + SUMMARY.md)")
