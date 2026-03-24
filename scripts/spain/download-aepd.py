#!/usr/bin/env python3
"""
AEPD (Agencia Española de Protección de Datos) resolutions scraper.
Scrapes 46K+ GDPR decisions from aepd.es (no API available).
Runs 3 concurrent threads.

Usage: python3 download-aepd.py
Env: DATABASE_URL (postgres connection string)
"""

import os
import sys
import re
import json
import time
import logging
import requests
import psycopg2
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(threadName)s] %(levelname)s %(message)s')
log = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', '')
AEPD_BASE = 'https://www.aepd.es'
AEPD_LIST = f'{AEPD_BASE}/informes-y-resoluciones/resoluciones'
THREADS_PER_IP = 5
RESULTS_PER_PAGE = 10
TOTAL_PAGES = 4644  # ~46440 resolutions

# Bind each thread to a specific source IP to distribute load
SOURCE_IPS = [
    '172.31.29.20',
    '172.31.21.255',
    '172.31.31.40',
    '172.31.22.206',
    '172.31.28.109',
]
TOTAL_THREADS = len(SOURCE_IPS) * THREADS_PER_IP  # 10

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}


def get_db():
    return psycopg2.connect(DB_URL)


def scrape_list_page(page_num, session):
    """Scrape a single listing page and extract resolution metadata."""
    url = f'{AEPD_LIST}?search_api_fulltext=&sort_bef_combine=fecha_firma_ASC&page={page_num}'
    for attempt in range(3):
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 200:
                return parse_list_html(r.text)
            log.warning(f'Page {page_num}: HTTP {r.status_code}')
        except Exception as e:
            log.warning(f'Page {page_num} attempt={attempt}: {e}')
            time.sleep(2 ** attempt + 1)
    return []


def parse_list_html(html):
    """Extract resolution entries from HTML without BeautifulSoup (regex-based)."""
    resolutions = []

    # Each resolution is in a views-row div with class containing "node--type-resolucion"
    # Pattern: reference, expediente, date, excerpt, pdf link
    blocks = re.split(r'<article\b', html)

    for block in blocks[1:]:  # skip before first article
        res = {}

        # Reference (title/heading link)
        ref_match = re.search(r'href="[^"]*?/documento/([^"]+?)\.pdf"', block, re.I)
        if not ref_match:
            ref_match = re.search(r'<h\d[^>]*>.*?([A-Z]{2,3}-\d{4,5}-\d{4})', block, re.I)
        if ref_match:
            res['reference'] = ref_match.group(1).upper()

        # Also try to find reference in text
        if 'reference' not in res:
            ref_text = re.search(r'((?:PS|PD|TD|TU|EXP|RR|E|AI|AT|PT)-\d{4,6}-\d{4})', block)
            if ref_text:
                res['reference'] = ref_text.group(1).upper()

        if 'reference' not in res:
            continue  # skip entries without identifiable reference

        # Expediente
        exp_match = re.search(r'(EXP\d{9,12})', block)
        if exp_match:
            res['expediente'] = exp_match.group(1)

        # Date (fecha_firma)
        date_match = re.search(r'(\d{2}/\d{2}/\d{4})', block)
        if date_match:
            try:
                res['fecha_firma'] = datetime.strptime(date_match.group(1), '%d/%m/%Y').date()
            except:
                pass

        # Excerpt (main text content, strip HTML)
        text_match = re.search(r'<div[^>]*class="[^"]*field--name-body[^"]*"[^>]*>(.*?)</div>', block, re.S)
        if text_match:
            excerpt = re.sub(r'<[^>]+>', ' ', text_match.group(1))
            excerpt = re.sub(r'\s+', ' ', excerpt).strip()
            res['extracto'] = excerpt[:2000]

        # If no excerpt, try any long text block
        if 'extracto' not in res:
            text_blocks = re.findall(r'>([^<]{50,})<', block)
            if text_blocks:
                res['extracto'] = max(text_blocks, key=len)[:2000]

        # PDF URL
        pdf_match = re.search(r'href="([^"]*?\.pdf)"', block, re.I)
        if pdf_match:
            pdf_url = pdf_match.group(1)
            if not pdf_url.startswith('http'):
                pdf_url = AEPD_BASE + pdf_url
            res['pdf_url'] = pdf_url

        resolutions.append(res)

    return resolutions


def upsert_resolutions(conn, items):
    """Upsert a batch of AEPD resolutions."""
    if not items:
        return 0
    count = 0
    with conn.cursor() as cur:
        for item in items:
            cur.execute("""
                INSERT INTO spain_aepd_resolutions
                    (reference, expediente, fecha_firma, extracto, pdf_url, metadata, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (reference) DO UPDATE SET
                    expediente = COALESCE(EXCLUDED.expediente, spain_aepd_resolutions.expediente),
                    fecha_firma = COALESCE(EXCLUDED.fecha_firma, spain_aepd_resolutions.fecha_firma),
                    extracto = COALESCE(EXCLUDED.extracto, spain_aepd_resolutions.extracto),
                    pdf_url = COALESCE(EXCLUDED.pdf_url, spain_aepd_resolutions.pdf_url),
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            """, (
                item.get('reference'),
                item.get('expediente'),
                item.get('fecha_firma'),
                item.get('extracto'),
                item.get('pdf_url'),
                json.dumps(item, default=str),
            ))
            count += 1
    conn.commit()
    return count


class SourceIPAdapter(requests.adapters.HTTPAdapter):
    """Bind requests to a specific source IP."""
    def __init__(self, source_ip, **kwargs):
        self.source_ip = source_ip
        super().__init__(**kwargs)

    def send(self, request, **kwargs):
        import urllib3
        # Create a connection pool bound to our source IP
        if not hasattr(self, '_pool_connections'):
            self._pool_connections = {}
        return super().send(request, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs['source_address'] = (self.source_ip, 0)
        super().init_poolmanager(*args, **kwargs)


def scrape_page_range(start_page, end_page, source_ip=None):
    """Scrape a range of pages (for threading), optionally bound to a source IP."""
    conn = get_db()
    session = requests.Session()
    session.headers.update(HEADERS)
    if source_ip:
        adapter = SourceIPAdapter(source_ip)
        session.mount('https://', adapter)
        session.mount('http://', adapter)
    total = 0
    errors = 0

    for page in range(start_page, end_page):
        try:
            items = scrape_list_page(page, session)
            if items:
                try:
                    count = upsert_resolutions(conn, items)
                except Exception as db_err:
                    log.warning(f"DB error page {page}: {db_err}, reconnecting")
                    try:
                        conn.close()
                    except:
                        pass
                    conn = get_db()
                    count = upsert_resolutions(conn, items)
                total += count
            else:
                errors += 1

            if page % 50 == 0:
                log.info(f"Pages {start_page}-{end_page}: at page {page}, {total} resolutions so far")

            time.sleep(0.5)  # polite delay

        except Exception as e:
            log.error(f"Page {page} error: {e}")
            errors += 1
            try:
                conn.close()
            except:
                pass
            conn = get_db()
            time.sleep(2)

    conn.close()
    log.info(f"Thread done: pages {start_page}-{end_page} via {source_ip or 'default'}, {total} resolutions, {errors} errors")
    return total


def main():
    if not DB_URL:
        print("Set DATABASE_URL env var")
        sys.exit(1)

    conn = get_db()

    # Check how many we already have
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM spain_aepd_resolutions")
        existing = cur.fetchone()[0]
    conn.close()

    log.info(f"=== AEPD Resolutions Scraper ===")
    log.info(f"Existing: {existing}, Target: ~{TOTAL_PAGES * RESULTS_PER_PAGE}")
    log.info(f"Pages: 0-{TOTAL_PAGES}, IPs: {len(SOURCE_IPS)}, Threads/IP: {THREADS_PER_IP}, Total: {TOTAL_THREADS}")

    # Check which source IPs are actually available
    import subprocess
    result = subprocess.run(['ip', '-4', 'addr', 'show'], capture_output=True, text=True)
    available_ips = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith('inet ') and '127.0.0.1' not in line and 'docker' not in line and '172.17' not in line and '172.18' not in line and '172.20' not in line:
            ip = line.split()[1].split('/')[0]
            if ip in SOURCE_IPS:
                available_ips.append(ip)

    if not available_ips:
        log.warning("No source IPs from config found, running without IP binding")
        available_ips = [None]

    actual_threads = len(available_ips) * THREADS_PER_IP
    log.info(f"Available IPs: {available_ips}, threads: {actual_threads}")

    # Split pages across threads
    pages_per_thread = TOTAL_PAGES // actual_threads + 1
    tasks = []
    for i in range(actual_threads):
        start = i * pages_per_thread
        end = min(start + pages_per_thread, TOTAL_PAGES)
        ip = available_ips[i // THREADS_PER_IP]
        tasks.append((start, end, ip))
        log.info(f"  Thread {i}: pages {start}-{end} via {ip or 'default'}")

    with ThreadPoolExecutor(max_workers=actual_threads, thread_name_prefix='aepd') as pool:
        futures = [pool.submit(scrape_page_range, s, e, ip) for s, e, ip in tasks]
        total = 0
        for f in as_completed(futures):
            total += f.result()

    log.info(f"=== AEPD scrape complete: {total} resolutions ===")


if __name__ == '__main__':
    main()
