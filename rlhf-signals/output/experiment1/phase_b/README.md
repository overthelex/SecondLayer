# Experiment 1 — Phase B: Crowd Annotation Preparation

## Overview

This directory contains all deliverables for deploying Experiment 1 (oversight vs crowd editing) to Prolific. The 200 oversight-annotated samples are packaged for crowd annotation with quality controls, attention checks, and an analysis pipeline.

## Files

| File | Phase | Description |
|------|-------|-------------|
| `build_phase_b.py` | 2,3,6,7,8 | Main build script — generates PII report, translation manifest, batches |
| `pii_findings.md` | 2 | PII scan results: 14 high-severity, 70 medium-severity findings |
| `translation_manifest.json` | 3 | 88 non-English samples marked for Bedrock translation |
| `annotator_instructions.md` | 4 | Neutral instructions for Prolific participants (~1.5 pages) |
| `qualification_tasks.json` | 5 | 3 screening tasks (code bug, factual error, acceptable quality) |
| `prolific_batch.jsonl` | 7 | Full batch: 200 real + 2 attention checks = 202 items |
| `prolific_pilot_batch.jsonl` | 8 | Pilot batch: 20 stratified (English-only) + 2 attention checks = 22 items |
| `analyze_phase_b_results.py` | 9 | Post-collection analysis pipeline with synthetic test |
| `synthetic_annotations.jsonl` | 9 | Generated test data for validating analysis pipeline |
| `analysis_results.json` | 9 | Output from synthetic test run |

## Key Decisions

### PII (Phase 2)
- **14 high-severity findings** must be redacted before deployment:
  - Person names: Ovcharov, Kadelbach, Breidenbach, Tanisha Minev, Vladimir
  - Internal hostnames: mail.merged.com.ua, plane.legal.org.ua
  - Internal URL: 127.0.0.1:3000
- **70 medium-severity findings** are mostly project names (SecondLayer, Panoptic, Calendary, SneakyPiper) and IP addresses incorrectly flagged as phone numbers. These should be reviewed but most are acceptable — they appear in technical context and don't directly identify individuals.
- **Action required:** Manually review high-severity findings and redact before deploying to Prolific.

### Translation (Phase 3)
- 88 samples detected as non-English (56 Russian, 22 Ukrainian, 10 other)
- 83 need external translation (pure prose in ru/uk)
- 5 are mostly technical (code-heavy with minimal non-English words)
- **Decision:** Include originals in batch with `translation_needed: true`. Run Bedrock (Claude Sonnet) translation separately before deploying.
- Translation manifest preserves both `llm_output_original` and `founder_edit_original` for the translation pass.

### Annotator Instructions (Phase 4)
- Neutral framing: "edit to improve" with no leading language
- No mention of "substantive improvements" or quality thresholds
- Explicitly states that no-change edits are valid
- Compensation at Prolific recommended rate
- Rejection only for attention check failure or clearly random input

### Qualification (Phase 5)
- 3 synthetic screening tasks (not from real data):
  1. Code comment contradicts code logic (exponential vs linear backoff)
  2. HTTP status codes swapped (404/500/503 definitions)
  3. Clean dev setup instructions (tests over-editing tendency)

### Attention Checks (Phase 6)
- Embedded instruction: "type 'verified' at the start"
- Garbled text: random word permutation requiring heavy edit or reject

### Batch Design (Phase 7)
- Schema: `sample_id`, `input_text`, `stratum`, `is_attention_check`, `metadata`
- Metadata includes: `translation_needed`, `original_language`, `token_count`, `content_type`
- Non-English samples included with original text (translation_needed=true)
- Task instruction NOT included in batch (shown via Prolific study UI instead)

### Pilot (Phase 8)
- 20 samples stratified proportionally (14 substantive, 2 cosmetic, 1 each other)
- All English (no translation complications for pilot)
- 2 attention checks included
- Purpose: validate timing estimates, attention check calibration, UI

### Analysis Pipeline (Phase 9)
- Loads annotations in format: `{sample_id, annotator_id, edited_text, time_seconds, confidence}`
- Computes Levenshtein-based NED for each annotation
- Filters annotators by attention check pass rate (>=50%)
- Aggregates per sample: median NED from included annotators
- Classifies using same NED thresholds as oversight
- Statistical comparison: KS test, chi-square, Krippendorff's alpha (ordinal)
- Tested successfully on synthetic data (36 annotations, 3 annotators, 10 samples)

## Prolific Configuration Recommendations

| Parameter | Value |
|-----------|-------|
| Platform | Prolific |
| Participants per sample | 3 |
| Total participants needed | ~60 (200 samples / ~10 per session x 3) |
| Pilot participants | 5-10 |
| Session size | 10-12 samples + attention checks |
| Estimated time per session | 25-35 minutes |
| Compensation | Prolific recommended rate (currently ~$12/hr) |
| Screening | English fluency (Prolific pre-screen) + qualification task |
| Rejection criteria | Attention check failure OR <5 min completion |
| Data collection | Custom external task page (textarea per sample) |

## Pre-Deployment Checklist

1. [ ] Review and redact 14 high-severity PII findings
2. [ ] Run Bedrock translation for 88 non-English samples
3. [ ] Re-run `build_phase_b.py` after redaction/translation to regenerate batches
4. [ ] Deploy qualification task to Prolific
5. [ ] Run pilot with 22-item batch (5-10 participants)
6. [ ] Analyze pilot results with `analyze_phase_b_results.py`
7. [ ] Adjust timing/compensation if pilot shows under/over estimates
8. [ ] Deploy full batch in sessions of 10-12 items
9. [ ] Monitor attention check pass rates during collection
10. [ ] Run final analysis when collection complete

## Reproduction

```bash
# Generate all deliverables
python3 build_phase_b.py

# Test analysis pipeline on synthetic data
python3 analyze_phase_b_results.py --synthetic

# Analyze real results (after Prolific collection)
python3 analyze_phase_b_results.py /path/to/prolific_results.jsonl
```
