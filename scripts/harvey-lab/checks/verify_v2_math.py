"""Verify v2 arithmetic against the scenario definitions, not against scraped text.

Two claims per task must hold:
  open_total  == sum of proceedings whose state is "відкрито"
  the difference stated in the amount-mismatch criterion
              == |enforcement amount - court amount| for that same claim
"""
import re, sys
import ua_v2_cal, ua_v2_rest, ua_v2_rest2

bad = 0
for mod in (ua_v2_cal, ua_v2_rest, ua_v2_rest2):
    for s in mod.S:
        calc = sum(a for _, _, a, _, st in s.proceedings if st == "відкрито")
        ok = calc == s.open_total
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {s.slug:32s} open_total stated {s.open_total:>10,} "
              f"computed {calc:>10,}")

        # amount-mismatch contradiction: find the pair it names and check the delta
        for c in s.contradictions:
            m = re.search(r"differing by ([\d  ]+) UAH", c.resolution)
            if not m:
                continue
            stated = int(re.sub(r"\D", "", m.group(1)))
            a = int(re.sub(r"\D", "", c.val_a))
            b = int(re.sub(r"\D", "", c.val_b))
            good = abs(a - b) == stated
            bad += not good
            print(f"{'   OK' if good else '   BAD'} {s.slug:30s} delta stated {stated:>8,} "
                  f"= |{a:,} - {b:,}| = {abs(a-b):,}")
print(f"\nmismatches: {bad}")
sys.exit(1 if bad else 0)
