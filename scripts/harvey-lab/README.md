# Ukrainian pack for Harvey LAB

Everything that builds and checks the Ukrainian task pack for
[harveyai/harvey-labs](https://github.com/harveyai/harvey-labs). The tasks themselves live in a
fork (`overthelex/harvey-labs`), not here — this is the machinery that generates and verifies
them.

Run on **local.lex**, not the MacBook: the clone is 5 GB and the corpus extracts come off prod.

## Layout

| directory | what is in it |
|---|---|
| `generators/` | build the tasks: diligence (`ua_v2_*`), litigation (`ua_litigation`, `ua_windows`), statute review (`ua_review`, `ua_statut`), statutory extracts (`build_vytyag`) |
| `checks/` | verification. Nothing here is optional — every one of them exists because something got past the previous check |
| `analysis/` | scoring, cost, flip-rate and failure breakdowns over completed runs |
| `runs/` | the sweep scripts (`smoke*.sh`, `redo*.sh`, `pack4.sh`) |
| `review-package/` | builds the workbook sent to the reviewing advocate; `ua_claims.py` holds the Ukrainian statement of every proposition |

## What is deliberately NOT here

Twelve scripts stay on local.lex only. They patch a third-party checkout so it runs on a
Bedrock-only box — a Bedrock adapter, a matcher override, a run.py splice — and one of them
would eventually be mistaken for part of the contribution. `harness/adapters/bedrock.py` and the
edits to `evaluation/scoring.py`, `evaluation/judge.py` and `harness/run.py` are in the same
category: local environment, never committed to the fork.

The corpus extracts are also absent: `acts.json` (3.5 MB), `ck_provisions.json` (3.3 MB) and
`act_2275.json` (0.4 MB). They are derived data, rebuilt from the harvested shards on prod:

```bash
python3 extract_ck.py          # Civil Code provisions across all 182 editions
python3 extract_many.py        # the eight acts the review tasks are built on
```

The generators will not run without them. That is deliberate — a 7 MB blob of derived text does
not belong in this repository, and the extraction is a two-minute job.

## The rules these scripts encode

Each of these was learned by getting it wrong first, which is why they are code and not notes.

**A criterion earns its place only if it can fail for a competent attempt.** Measured twice:
splitting extraction criteria per fact gave 21/21, 15/15, 9/9, 6/6 — free points that moved the
pooled rate 68% → 87% while measuring nothing. Both attempts were reverted. `checks/flip2.py`
classes every criterion as always-pass / always-fail / flipping and is the tool for this.

**Never report a per-task score range.** Range grows with the number of trials by construction:
1.23 at three trials becomes 1.83 at six on the same tasks. `checks/spread_bias.py` demonstrates
it. Report the flip classes instead.

**Ground every legal claim in a dated primary source, mechanically.** `ua_review.py` refuses to
build a task whose defect quotes words that are not in the cited article of the harvested
edition. This exists because three legal errors reached committed tasks from recall alone.

**The date of a law is not the date the text changes.** Paragraph 19 of the Civil Code
transitional provisions was repealed on the authority of a law dated 14.05.2025 but is present in
the text on 28.08.2025 and gone on 04.09.2025. Pin temporal tasks to the edition in force;
`checks/weekend_check.py` and `checks/closed_universe.py` guard the neighbouring traps.

**An empty result from a checker means check the checker.** Several of the scripts here exit
non-zero when they match nothing, because a clean report over zero files reads exactly like
success.

## Where the numbers came from

Measurements quoted in `docs/lab-harness/` are produced by:

- `checks/density_model.py`, `checks/gap_anatomy.py` — upstream criteria density against document
  count and workspace words
- `checks/grounding_full.py` — how much of LAB's cited law appears in the task's own documents
- `checks/unscoped_rate.py` — what the identifier gate would flag if it were not scoped by
  jurisdiction
- `checks/backcompat.py` — that the schema change leaves every existing task's description
  byte-identical
- `analysis/token_cost.py`, `analysis/smoke_cost.py` — token spend per run, at published rates
