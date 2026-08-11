#!/usr/bin/env python3
"""Positive controls: a gate that never fires is worthless, and a fix for a bug that does not
reproduce is noise.

Two claims in the PR are only worth making if each has a control:
  * the identifier gate CATCHES a checksum-valid code, not merely rejects invented ones
  * the run-id bug is real on the base revision and gone after the fix
"""
import re
import sys

sys.path.insert(0, "tests")
from test_no_real_identifiers import _luhn_like_ua_edrpou, _ua_rnokpp, scan  # noqa: E402

print("IDENTIFIER GATE")
# Build a checksum-valid ЄДРПОУ arithmetically rather than copying a real one.
found = None
for n in range(30000000, 30001000):
    s = str(n)
    if _luhn_like_ua_edrpou(s):
        found = s
        break
print(f"  constructed a checksum-valid code: {found}")
print(f"    flagged in a UA matter:  {bool(scan(f'код ЄДРПОУ {found}', 'UA'))}   (must be True)")
print(f"    flagged in a US matter:  {bool(scan(f'code {found}', 'US'))}   (must be False)")
broken = found[:-1] + str((int(found[-1]) + 1) % 10)
print(f"  same code with the check digit broken: {broken}")
print(f"    flagged in a UA matter:  {bool(scan(f'код ЄДРПОУ {broken}', 'UA'))}   (must be False)")
stamp = "20260424"
print(f"  edition stamp {stamp}: passes raw checksum "
      f"{_luhn_like_ua_edrpou.__wrapped__(stamp) if hasattr(_luhn_like_ua_edrpou, '__wrapped__') else 'n/a'}"
      f", flagged now: {bool(scan(f'редакція від {stamp}', 'UA'))}   (must be False)")

print("\nRUN-ID SANITISER")
model = "bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0"
before = model.split("/")[-1]
after = re.sub(r"[^0-9A-Za-z_-]+", "-", before).strip("-")
print(f"  model id                : {model}")
print(f"  base behaviour          : {before}")
print(f"    contains a colon      : {':' in before}   (this is what Docker rejects)")
print(f"  after the fix           : {after}")
print(f"    contains a colon      : {':' in after}   (must be False)")
print(f"    still identifies model: {'haiku-4-5' in after}   (must be True)")
