# PR body: schema for non-English tasks (schema only, no task pack)

**Status**: draft, PR NOT opened. Target `harveyai/harvey-labs`, from
`overthelex/harvey-labs:feat/multilingual-schema`.

Schema and two fixes only, no tasks: 3 commits, 5 files, 427 insertions, cut clean from
`55510f0e6`. The Ukrainian pack it was built for follows separately once it is ready. This part
is worth landing on its own — it is what makes a non-English task expressible at all.

---

## What this adds

Four optional fields, all defaulting to current behaviour, so every one of the 2,010 existing
tasks is unchanged and no existing rubric moves.

| field | where | default | purpose |
|---|---|---|---|
| `language` | task | `en` | BCP-47 tag for the matter and the deliverables |
| `jurisdiction` | task | `US` | ISO 3166-1 alpha-2, optional subdivision |
| `judge_language` | task | `= language` | language the rubric itself is written in |
| `source` | criterion | `expert` | `expert` or `oracle` |

`judge_language` is the one that does real work. Setting it to `en` while `language` stays `uk`
keeps `match_criteria` readable by maintainers who do not read the task language, and lets the
existing judge grade the task with no changes at all. Without it, a non-English pack forces a
choice between a rubric no reviewer can check and a judge nobody has calibrated.

`source: "oracle"` marks a criterion that is verifiable mechanically against an external
authority — a statutory citation, a date computed from an official register — so a runner may
resolve it without spending a judge call. Nothing in this PR skips the judge; the field declares
the property so a runner can. On a Ukrainian statute-review task we build, 26 of 46 criteria
qualify, which is the kind of ratio that matters against ~6,300 judge calls per 100-task run.

`utils/describe_task` prints the new fields; `tests/test_task_integrity.py` validates them.

## Two fixes included

**Run IDs were not sanitised.** Every versioned Bedrock inference profile ends in `:0`
(`eu.anthropic.claude-haiku-4-5-20251001-v1:0`), the run ID goes into a container bind-mount
spec, and Docker rejects it with "too many colons". One line in `harness/run.py`:

```python
model_short = re.sub(r"[^0-9A-Za-z_-]+", "-", args.model.split("/")[-1]).strip("-")
```

This is not specific to non-English work; it hits anyone running LAB on Bedrock.

**A new test, `tests/test_no_real_identifiers.py`.** National identifiers usually carry a
checksum, so a code copied from a real document validates and an invented one does not. The test
scans task documents and fails if any identifier validates under the jurisdiction the task
declares. That gives the ground rule about synthetic entities something mechanical behind it,
for the case where it is hardest to eyeball.

Three things learned building it, all of which are in the code as comments because each cost a
false failure:

- **Scope checkers by declared jurisdiction.** This is the load-bearing design decision, so it
  is measured rather than argued. Running the Ukrainian checkers over the 11,046 upstream
  documents unscoped produces **375 ЄДРПОУ hits and 72 РНОКПП hits, which would block 55
  existing US tasks**. What they catch is ordinary matter content:

  | task | value | what it actually is |
  |---|---|---|
  | `corporate-governance/draft-position-letter-to-state-insurance-regulator` | 22019483 | an insurance producer licence number |
  | `bankruptcy-restructuring/identify-issues-in-counterpartys-...` | 0402038741 | a Virginia P.E. licence number |
  | `antitrust-competition/extract-pricing-data-from-document-production` | 0912151033 | part of an email Message-ID timestamp |
  | `corporate-ma/draft-commitment-letter` | 1175000000 | a dollar amount, $1.175bn |

  A task is therefore checked only against the scheme of the jurisdiction it declares.
- **Exclude well-formed dates.** An edition stamp like `20260424` passes that checksum;
  `20260101` does not. A Ukrainian task that carries statutory text carries such stamps, so
  roughly one such task in eleven would fail at random. Valid `YYYYMMDD` values are excluded
  before the checksum runs. This one was found by the gate failing on our own task.
- **Do not check IBAN.** Its mod-97 checksum says nothing about whether an account exists, and
  documentation IBANs are built valid precisely so they can be quoted, so the check flagged the
  canonical examples already in `contracts/banking`.

Scan text nodes rather than raw document XML; colour values like `00000000` otherwise match.

## Documentation

`CONTRIBUTING.md` gains a short "Non-English And Non-US Tasks" section: the three task fields,
the two rules that matter for a non-English pack (write the rubric in a language reviewers can
read; make identifiers synthetic in a checkable way), and the `source` field.

Two things noticed while writing it, neither changed here. `sources` is documented as an optional
per-criterion list of source documents but is `[]` on all 219 criteria that carry it — if it is
meant to be live it is the natural place to record which document grounds a criterion, and I would
populate it. And `docs/eval-strategies.md` states 1,660 tasks against 2,010 `task.json` in the tree.

## Verification

**Full suite, on this branch:**

```
uv run python -m pytest
21,766 passed, 309 skipped in 1:40
```

**Backward compatibility, proved directly.** A green suite does not establish it — tests that
never assert on the new fields pass either way. `utils.describe_task` was run on 64 tasks across
all 25 practice areas, on `55510f0e6` and on this branch, and the output compared:

```
tasks compared:            64
descriptions that changed:  0
```

**End-to-end on unmodified upstream tasks**, since everything above is offline. Three existing
English tasks through the harness and judge on this branch, `claude-haiku-4-5-20251001`, 20-turn
cap. Clean tree, no local patches — exactly the code in this PR:

| task | turns | score |
|---|---:|---|
| `trusts-estates-private-client/compare-trust-documents-against-client-instructions` | 16 | 20/23 |
| `employment-labor/identify-issues-in-counterparty-motion-brief` | 13 | 20/23 |
| `immigration/compare-uscis-filing-receipt-against-original-petition-submission` | 7 | 19/26 |

All three exited cleanly, produced the requested deliverable and graded normally. Agent side:
2,064,256 input and 70,327 output tokens, **$2.42 at published Haiku 4.5 rates**.

Noticed while costing it: `scores.json`'s `cost` object holds the AGENT's tokens, identical to
`metrics.json` for the same run, so judge spend is recorded nowhere.

**Positive controls**, asserted in `tests/test_no_real_identifiers.py`:

| control | result |
|---|---|
| a checksum-valid ЄДРПОУ, constructed arithmetically, in a UA matter | flagged |
| the same value in a US matter | not flagged |
| the same value with the check digit broken | not flagged |
| edition stamp `20260424` (which does pass the raw checksum) | not flagged |
| `bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0` before the run-id fix | contains `:`, which Docker rejects |
| the same after the fix | no colon, model still identifiable in the run id |

## Two things measured while building for this

Not part of the change, but they are why the pack that follows looks the way it does.

**Criteria count is a size-independent constant.** ~56 per task, essentially flat against both
document count (56 / 55 / 57 at 1-3, 4-6, 7-9 docs) and workspace size (60 / 55 / 64 at 10-25k,
25-50k, >50k words; rank correlation with words +0.18). What differs is the material: median
workspace 32,702 words. Read as a target rather than a consequence, it produces padding — I tried
twice and reverted both.

**LAB mostly grounds its law in the matter.** Across the 476 graded tasks whose criteria cite a
statutory authority, 1,030 of 1,336 citations (77%) also appear in that task's own documents. The
remaining 23% do expect recall. Worth knowing before writing a pack for a jurisdiction where
parametric coverage is thin, which is what `source: "oracle"` is for.

## What is not here

- **The Ukrainian task pack.** Held back deliberately, see above.
- **A Bedrock adapter.** We run on Bedrock and have one locally, but it is not offered here:
  `CONTRIBUTING.md` sets out what an adapter must implement (`SWEEP_MATRIX`, pricing in
  `evaluation/compare.py`, message-format tests) and ours does not yet meet that bar. Happy to
  raise it separately if it would be useful.
- **Any change to scoring or the judge.** `_llm_match_deliverables` constructing
  `anthropic.Anthropic()` directly costs 35.2 points on a non-Anthropic judge, silently, because
  a bare `except` swallows the failure. That is worth fixing but it is not this PR's business.
