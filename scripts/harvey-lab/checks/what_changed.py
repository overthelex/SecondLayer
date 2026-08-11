#!/usr/bin/env python3
"""Only the charter should have changed in content; the rest is zip-timestamp churn.

Regenerating rewrites all five documents, and git sees five modified files. Committing that
without checking would put four unexplained document changes in the diff next to a one-clause
fix. Compare the zip members so the claim is checked, not assumed.
"""
import io
import subprocess
import zipfile

BASE = "tasks/corporate-ma/ua-statut-tov-compliance-review/documents/"
FILES = ["protokol-zboriv.docx", "proyekt-statutu.docx", "vytyag-EDR.docx",
         "zakon-2275-19.docx", "zapyt-kliyenta.docx"]

for f in FILES:
    old = subprocess.run(["git", "show", "HEAD:" + BASE + f], capture_output=True).stdout
    a = zipfile.ZipFile(io.BytesIO(old))
    b = zipfile.ZipFile(BASE + f)
    diff = [n for n in a.namelist() if n in b.namelist() and a.read(n) != b.read(n)]
    print(f"  {f:26s} {diff if diff else 'identical content, timestamps only'}")
