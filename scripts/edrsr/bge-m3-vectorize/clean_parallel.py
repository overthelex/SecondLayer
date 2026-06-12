#!/usr/bin/env python3
"""Parallel cleaning: one process per JSONL shard."""
import json
import os
import re
import sys
import time
from multiprocessing import Pool
from pathlib import Path

HEADER_PATTERNS = [
    re.compile(r'вул\.\s*[А-ЯІЇЄҐа-яіїєґA-Za-z\s\.\,\-]+,?\s*буд\.\s*\d+[а-яА-Я]?(?:\s*,\s*літера\s*[А-Я])?(?:\s*,\s*м\.\s*[А-ЯІЇЄҐа-яіїєґ\s\-]+)?(?:\s*,?\s*\d{5})?', re.UNICODE),
    re.compile(r'\(?\d{3}\)?\s*\d{3}[\-\s]?\d{2}[\-\s]?\d{2}'),
    re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'),
    re.compile(r'(?:ЄДРПОУ|код\s+ЄДРПОУ)\s*:?\s*\d{8}'),
    re.compile(r'https?://[^\s]+'),
    re.compile(r'(?<!\d)\d{5}(?!\d)(?:\s*,\s*м\.\s*[А-ЯІЇЄҐа-яіїєґ\s\-]+)?'),
]

def clean_text(text):
    lines = text.split('\n')
    cleaned_lines = []
    header_zone = True
    for line in lines:
        stripped = line.strip()
        if header_zone:
            if not stripped:
                continue
            if re.search(r'^\s*(У\s*Х\s*В\s*А\s*Л\s*А|Р\s*І\s*Ш\s*Е\s*Н\s*Н\s*Я|П\s*О\s*С\s*Т\s*А\s*Н\s*О\s*В\s*А|В\s*И\s*Р\s*О\s*К|УХВАЛА|РІШЕННЯ|ПОСТАНОВА|ВИРОК)', stripped, re.IGNORECASE):
                header_zone = False
                cleaned_lines.append(stripped)
                continue
            is_header = False
            for pattern in HEADER_PATTERNS:
                if pattern.search(stripped):
                    is_header = True
                    break
            if is_header:
                continue
            if len(stripped) < 20 and not re.search(r'(?:суд|справ|№)', stripped, re.IGNORECASE):
                continue
            cleaned_lines.append(stripped)
        else:
            cleaned_lines.append(stripped)
    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r'[ \t]{3,}', '  ', result)
    for pattern in HEADER_PATTERNS[1:4]:
        result = pattern.sub('', result)
    return result.strip()

def process_file(jsonl_path):
    t0 = time.time()
    count = 0
    saved_chars = 0
    cleaned_lines = []
    with open(jsonl_path) as fin:
        for line in fin:
            doc = json.loads(line)
            original = doc.get('text', '')
            cleaned = clean_text(original)
            saved_chars += len(original) - len(cleaned)
            doc['text'] = cleaned
            cleaned_lines.append(json.dumps(doc, ensure_ascii=False))
            count += 1
    with open(jsonl_path, 'w') as fout:
        for cl in cleaned_lines:
            fout.write(cl + '\n')
    elapsed = time.time() - t0
    saved_mb = round(saved_chars / 1024 / 1024, 1)
    print(f"  {jsonl_path}: {count} docs, saved {saved_mb} MB, {elapsed:.0f}s", flush=True)
    return {'file': jsonl_path, 'docs': count, 'saved_mb': saved_mb, 'elapsed': elapsed}

def main():
    data_dir = sys.argv[1]
    files = sorted(str(f) for f in Path(data_dir).glob('*.jsonl'))
    print(f"Cleaning {len(files)} files in parallel...", flush=True)
    with Pool(len(files)) as pool:
        results = pool.map(process_file, files)
    total_docs = sum(r['docs'] for r in results)
    total_saved = sum(r['saved_mb'] for r in results)
    print(f"\nTotal: {total_docs} docs, saved {total_saved} MB")

if __name__ == '__main__':
    main()
