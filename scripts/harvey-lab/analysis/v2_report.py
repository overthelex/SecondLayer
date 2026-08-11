import sys
rows = [l.rstrip().split("\t") for l in open(sys.argv[1], encoding="utf-8")]
d = [(t, int(p), int(n), int(a)) for t, p, n, a in rows if t.startswith("diligence")]
l = [(t, int(p), int(n), int(a)) for t, p, n, a in rows if t.startswith("litigation")]
for name, g in (("diligence (rebuilt)", d), ("litigation", l), ("TOTAL", d + l)):
    P = sum(x[1] for x in g); N = sum(x[2] for x in g); A = sum(x[3] for x in g)
    print(f"{name:22s} tasks={len(g):2d}  pooled={P:3d}/{N:3d} = {100*P/N:5.1f}%  all-pass={A}/{len(g)}")
print()
print("per task, hardest first:")
for t, p, n, a in sorted(d + l, key=lambda x: x[1] / x[2]):
    tag = "  ALL-PASS" if a else ""
    print(f"   {t.split('/')[-1][:46]:46s} {p:2d}/{n:<2d} = {100*p/n:5.1f}%{tag}")
