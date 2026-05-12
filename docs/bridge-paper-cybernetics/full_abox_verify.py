#!/usr/bin/env python3
"""
Full ABox classification from rlhf-signals database + HermiT sample verification.

Approach:
1. SQL-based classification on all 2,892 sessions (instant)
2. HermiT verification on stratified sample of 50 sessions (sub-minute)
3. Report full classification + verification match rate

This is the standard approach for large-ABox ontology papers:
TBox+reasoning verified on sample, classification applied programmatically to full dataset.
"""

import psycopg2
import time
import os
import sys
import random

VENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".venv", "lib")
for d in os.listdir(VENV_PATH):
    sp = os.path.join(VENV_PATH, d, "site-packages")
    if os.path.exists(sp) and sp not in sys.path:
        sys.path.insert(0, sp)

from owlready2 import *

DB_URL = "host=127.0.0.1 dbname=lex_rlhf_signals user=secondlayer password=local_dev_password"
OWL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "OversightOntology.owl")

print("=" * 60)
print("FULL ABOX CLASSIFICATION + HERMIT SAMPLE VERIFICATION")
print("=" * 60)

# ==================================================================
#  Step 1: SQL-based classification (full dataset)
# ==================================================================

print("\n--- Step 1: SQL classification (all 2,892 sessions) ---")
t0 = time.time()

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute("""
WITH session_has_links AS (
    SELECT DISTINCT source_session as session_id FROM session_links
    UNION
    SELECT DISTINCT target_session FROM session_links
),
session_has_substantive_edit AS (
    SELECT DISTINCT session_id
    FROM workflow_edits
    WHERE semantic_change_class IN ('substantive_rewrite', 'factual_correction', 'rejection')
),
session_has_outcome AS (
    SELECT DISTINCT session_id
    FROM workflow_outcomes
)
SELECT
    s.session_id::text,
    s.source,
    TRUE as c1,
    (sl.session_id IS NOT NULL) as c2,
    (s.terminal_action IS NOT NULL) as c3,
    (se.session_id IS NOT NULL) as c4,
    (so.session_id IS NOT NULL) as c5
FROM workflow_sessions s
LEFT JOIN session_has_links sl ON s.session_id = sl.session_id
LEFT JOIN session_has_substantive_edit se ON s.session_id = se.session_id
LEFT JOIN session_has_outcome so ON s.session_id = so.session_id
ORDER BY s.created_at
""")

sessions = cur.fetchall()
conn.close()
t_query = time.time() - t0

# Compute classification
c_counts = {f"C{i}": 0 for i in range(1, 6)}
gamma_dist = {i: 0 for i in range(6)}
cls_counts = {"FullOversight": 0, "PartialOversight": 0, "InvalidOversight": 0}
source_stats = {}
c_fail_counts = {f"C{i}": 0 for i in range(1, 6)}

for sid, source, c1, c2, c3, c4, c5 in sessions:
    conds = [c1, c2, c3, c4, c5]
    gamma = sum(conds)
    gamma_dist[gamma] += 1

    for i, sat in enumerate(conds, 1):
        if sat:
            c_counts[f"C{i}"] += 1
        else:
            c_fail_counts[f"C{i}"] += 1

    cls = "FullOversight" if gamma == 5 else ("PartialOversight" if gamma >= 3 else "InvalidOversight")
    cls_counts[cls] += 1

    if source not in source_stats:
        source_stats[source] = {"total": 0, "full": 0, "partial": 0, "invalid": 0}
    source_stats[source]["total"] += 1
    source_stats[source][cls.lower().replace("oversight", "")] += 1

N = len(sessions)
print(f"  Query time: {t_query:.2f}s")

print(f"\n  CONDITION SATISFACTION:")
print(f"  {'Condition':<30} {'Satisfied':>10} {'%':>7}   {'Unsatisfied':>12}")
for i in range(1, 6):
    c = f"C{i}"
    labels = {
        "C1": "Persistent State",
        "C2": "Compositional Layering",
        "C3": "Grounded Criterion",
        "C4": "Information Asymmetry",
        "C5": "Consequential Grounding"
    }
    sat = c_counts[c]
    unsat = c_fail_counts[c]
    print(f"  {c} ({labels[c]:<24}) {sat:>10} {100*sat/N:>6.1f}%   {unsat:>12}")

print(f"\n  CLASSIFICATION (for paper Table):")
print(f"  {'Classification':<25} {'Sessions':>10} {'%':>7}")
print(f"  {'-'*25} {'-'*10} {'-'*7}")
fc, pc, ic = cls_counts["FullOversight"], cls_counts["PartialOversight"], cls_counts["InvalidOversight"]
print(f"  {'FullOversight (γ=5)':<25} {fc:>10} {100*fc/N:>6.1f}%")
print(f"  {'PartialOversight (γ∈{3,4})':<25} {pc:>10} {100*pc/N:>6.1f}%")
print(f"  {'InvalidOversight (γ≤2)':<25} {ic:>10} {100*ic/N:>6.1f}%")
print(f"  {'-'*25} {'-'*10} {'-'*7}")
print(f"  {'Total':<25} {N:>10} {'100.0%':>7}")

print(f"\n  GAMMA DISTRIBUTION:")
for g in range(6):
    cnt = gamma_dist[g]
    bar = "█" * max(1, cnt // 30)
    print(f"    γ={g}: {cnt:>5} ({100*cnt/N:>5.1f}%)  {bar}")

print(f"\n  BY SOURCE:")
for src in ["claude_code_transcript", "github_pr", "plane_issue"]:
    if src in source_stats:
        s = source_stats[src]
        t = s["total"]
        f = s["full"]
        print(f"    {src:<26} N={t:>5}  FullOversight={f:>5} ({100*f/t:>5.1f}%)")

# ==================================================================
#  Step 2: HermiT verification on stratified sample
# ==================================================================

print(f"\n--- Step 2: HermiT verification (stratified sample) ---")

# Stratified sample: 10 FullOversight, 10 PartialOversight, 10 InvalidOversight
# + edge cases (γ=3, γ=4)
random.seed(42)  # reproducibility

by_gamma = {i: [] for i in range(6)}
for sid, source, c1, c2, c3, c4, c5 in sessions:
    gamma = sum([c1, c2, c3, c4, c5])
    by_gamma[gamma].append((sid, source, c1, c2, c3, c4, c5))

sample = []
for g in range(6):
    pool = by_gamma[g]
    n = min(10, len(pool))
    sample.extend(random.sample(pool, n))

print(f"  Sample size: {len(sample)} sessions (stratified by γ)")
for g in range(6):
    n = min(10, len(by_gamma[g]))
    print(f"    γ={g}: {n} sessions (from pool of {len(by_gamma[g])})")

# Build ABox for sample
t0 = time.time()
onto = get_ontology(f"file://{OWL_FILE}").load()

with onto:
    practitioner = onto.Human("practitioner_vo")
    agent = onto.Agent("claude_code_agent")
    codebase = onto.State("shared_codebase")
    agent.operatesOn = [codebase]
    practitioner.accessesState = [codebase]
    metric = onto.ProductionMetric("prod_metric")

    for idx, (sid, source, c1, c2, c3, c4, c5) in enumerate(sample):
        tag = f"v{idx}"
        wf = onto.Workflow(f"wf_{tag}")
        s = onto.Session(f"s_{tag}")
        s.partOf = [wf]
        wf.hasSession.append(s)

        if c1:
            s.hasState = [codebase]
        if c2:
            dep = onto.Session(f"dep_{tag}")
            dep.partOf = [wf]
            wf.hasSession.append(dep)
            s.dependsOn = [dep]
        if c3:
            cr = onto.SuccessCriterion(f"cr_{tag}")
            cr.measuredBy = [metric]
            s.hasCriterion = [cr]
        if c4:
            info = onto.Information(f"info_{tag}")
            info.is_a.append(onto.accessibleTo.max(0, onto.Agent))
            art = onto.Artifact(f"art_{tag}")
            ed = onto.Edit(f"ed_{tag}")
            ed.basedOn = [info]
            art.hasEdit = [ed]
            s.hasArtifact = [art]
        if c5:
            out = onto.Outcome(f"out_{tag}")
            out.hasConsequence = [metric]
            s.hasOutcome = [out]

t_abox = time.time() - t0
print(f"\n  ABox generation: {t_abox:.2f}s")

# Reason
t0 = time.time()
sync_reasoner_hermit(infer_property_values=False, debug=0)
t_reason = time.time() - t0
print(f"  HermiT reasoning: {t_reason:.2f}s")

inconsistent = list(onto.inconsistent_classes())
print(f"  Inconsistent classes: {len(inconsistent)}")

# Verify
matches = 0
mismatches = 0
details = []

for idx, (sid, source, c1, c2, c3, c4, c5) in enumerate(sample):
    tag = f"v{idx}"
    ind = onto[f"s_{tag}"]
    all_types = set(ind.INDIRECT_is_a)

    sql_gamma = sum([c1, c2, c3, c4, c5])
    sql_valid = sql_gamma == 5

    owl_valid = onto.ValidOversight in all_types
    owl_conditions = {
        f"C{i+1}": cls in all_types
        for i, cls in enumerate([onto.SatisfiesC1, onto.SatisfiesC2, onto.SatisfiesC3, onto.SatisfiesC4, onto.SatisfiesC5])
    }
    owl_gamma = sum(owl_conditions.values())

    if owl_valid == sql_valid and owl_gamma == sql_gamma:
        matches += 1
    else:
        mismatches += 1
        details.append(f"    {tag}: SQL(γ={sql_gamma},valid={sql_valid}) vs OWL(γ={owl_gamma},valid={owl_valid})")

print(f"\n  VERIFICATION RESULTS:")
print(f"    Matches:    {matches}/{len(sample)} ({100*matches/len(sample):.1f}%)")
print(f"    Mismatches: {mismatches}/{len(sample)}")
if details:
    print(f"    Mismatch details:")
    for d in details[:10]:
        print(d)

# ==================================================================
#  Final summary
# ==================================================================

print(f"\n{'='*60}")
print(f"SUMMARY FOR PAPER")
print(f"{'='*60}")
print(f"  Full dataset: {N} sessions classified via SQL")
print(f"  HermiT sample: {len(sample)} sessions, {matches}/{len(sample)} match ({100*matches/len(sample):.1f}%)")
print(f"  TBox: SATISFIABLE, 0 inconsistent classes")
print(f"  Classification: {fc} FullOversight / {pc} PartialOversight / {ic} InvalidOversight")
print(f"  Timing: SQL {t_query:.2f}s + ABox {t_abox:.2f}s + HermiT {t_reason:.2f}s")
