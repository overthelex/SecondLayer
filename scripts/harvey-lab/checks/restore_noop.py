#!/usr/bin/env python3
"""Restore documents that regeneration rewrote without changing their content.

Regenerating all seven tasks rewrites every document, and git sees them all as modified because
a docx is a zip whose entries carry timestamps. Committing that would put dozens of unexplained
document changes next to a handful of real ones. Compare the zip members and put back anything
whose content is identical.
"""

import io
import subprocess
import zipfile

changed = subprocess.run(["git", "status", "--porcelain", "tasks/"],
                         capture_output=True, text=True).stdout
restore, real = [], []
for line in changed.splitlines():
    path = line.split()[-1]
    if "/documents/" not in path:
        continue
    old = subprocess.run(["git", "show", "HEAD:" + path], capture_output=True).stdout
    if not old:
        continue
    try:
        a = zipfile.ZipFile(io.BytesIO(old))
        b = zipfile.ZipFile(path)
        differing = [n for n in a.namelist() if n in b.namelist() and a.read(n) != b.read(n)]
    except Exception:
        continue
    (real if differing else restore).append(path)

if restore:
    subprocess.run(["git", "checkout", "--"] + restore, check=True)
print(f"restored {len(restore)} documents that changed only in zip timestamps")
print(f"documents with real content changes: {len(real)}")
for p in real:
    print("   ", p)
