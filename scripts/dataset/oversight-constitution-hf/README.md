---
license: cc-by-4.0
task_categories:
  - text-classification
language:
  - en
tags:
  - legal
  - oversight
  - alignment
  - edit-traces
  - software-engineering
  - ontology
pretty_name: "Oversight Constitution: Session-Level Oversight Grades"
size_categories:
  - 1K<n<10K
---

# Oversight Constitution: Session-Level Oversight Grades

Session-level aggregate dataset from the paper:

> **From Ontology-Controlled Systems to Oversight-Controlled Training: Formal Foundations for Human-LLM Alignment Signal Validation**
> Volodymyr Ovcharov (LEX AI LLC, Kyiv, Ukraine)

## Dataset Description

This dataset contains 2,892 agentic coding sessions classified by a formal oversight constitution -- a set of five necessary and sufficient conditions (C1-C5) for valid human-LLM alignment signal. Each session is graded on a scale from gamma=0 (no oversight) to gamma=5 (full oversight).

The data comes from a production legal-technology platform (70+ MCP tools, 380M+ indexed records) where a single practitioner shipped 1,547 merged PRs in 105 days using Claude Code.

## Fields

| Field | Type | Description |
|---|---|---|
| session_id | string | Anonymized session identifier |
| gamma | int | Oversight grade (0-5) |
| oversight_grade | string | FullOversight / PartialOversight / InvalidOversight |
| C1_persistence | bool | State persists across sessions |
| C2_compositional_layering | bool | Explicit cross-session dependencies |
| C3_iterative_refinement | bool | Multi-turn edit traces present |
| C4_information_asymmetry | bool | Practitioner has private domain knowledge |
| C5_consequential_grounding | bool | Attributed downstream outcome |
| has_strong_outcome | bool | Strong-confidence outcome attribution |
| positive_outcome | bool/null | Positive downstream outcome (null if no attribution) |
| total_edits | int | Number of edit-trace pairs in session |
| mean_edit_distance | float | Mean normalized edit distance (0-1) |
| median_edit_distance | float | Median normalized edit distance (0-1) |
| substantive_rewrite_pct | float | Percentage of edits that are substantive rewrites |
| rejection_rate_pct | float | Percentage of edits that are binary rejections |

## Key Statistics

| Grade | Sessions | % |
|---|---|---|
| FullOversight (gamma=5) | 24 | 0.8% |
| PartialOversight (gamma in {3,4}) | 1,970 | 68.1% |
| InvalidOversight (gamma<=2) | 898 | 31.1% |

## Key Findings

1. **Counterintuitive outcome rates**: FullOversight sessions have a *lower* positive outcome rate (76.5%) than PartialOversight (96.5-97.0%), because fully instrumented sessions tackle structurally harder compositional tasks.

2. **C2 bottleneck**: Only 19.4% of sessions satisfy C2 (compositional layering) -- the dominant barrier to FullOversight classification.

3. **Rejection concentration**: FullOversight sessions have 3-6x the rejection rate (15.4%) of other tiers (2.5-4.7%), concentrating the most informative oversight signal.

## OWL Ontology

The formal ontology (SHOIQ description logic) that defines the oversight classification is available in the companion repository.

## Citation

```bibtex
@article{ovcharov2026bridge,
  title={From Ontology-Controlled Systems to Oversight-Controlled Training:
         Formal Foundations for Human-LLM Alignment Signal Validation},
  author={Ovcharov, Volodymyr},
  year={2026},
  note={arXiv preprint}
}
```

## Links

- Paper repository: [github.com/overthelex/SecondLayer](https://github.com/overthelex/SecondLayer)
- Platform: [legal.org.ua](https://legal.org.ua)
