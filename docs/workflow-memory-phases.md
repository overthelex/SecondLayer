# Workflow Memory Architecture: Phase Schedule

Supplementary material for the arXiv preprint.

## Phases

| Phase | Weeks | Scope | Status |
|-------|-------|-------|--------|
| 0 | 0 (deployed) | Prompt-Commit Bridge: `UserPromptSubmit` hook, bare git repo, GitHub sync, CLI query tool | Complete |
| 1.0 | 1--2 | Foundation: `workflow_memory_*` PostgreSQL schema, Qdrant collections (domain/workflow/practitioner), basic ingestion pipelines | In progress |
| 1.1 | 3--4 | Principle ledger population + ADR backfill from existing PRs and design docs | Planned |
| 1.2 | 5--6 | Practitioner layer bootstrap: nightly summarization of edit-traces into embeddable artifacts | Planned |
| 1.3 | 7 | Claude Code integration: session-start hook, `workflow_memory_query` MCP tool, thin CLAUDE.md | Planned |
| 1.4 | 8 | Retrieval-miss instrumentation: post-session reconciliation job, retrieval-correction candidate flagging | Planned |
| 1.5 | 9--11 | Long-term task orchestrator (push mode): Plane task watcher, Bedrock summarization pipeline, tool lineage delta | Planned |

## Dependencies

- Phase 1.0 requires existing Qdrant and PostgreSQL infrastructure (already in production).
- Phase 1.1 depends on Phase 1.0 schema.
- Phase 1.2 depends on the edit-trace pipeline (see [edit-trace-experiments](https://github.com/overthelex/edit-trace-experiments)).
- Phase 1.3 depends on Phase 1.0 (retrieval API must be functional).
- Phase 1.4 depends on Phase 1.3 (needs session-level retrieval logs).
- Phase 1.5 is independent of Phases 1.2--1.4 but benefits from principle ledger coverage (Phase 1.1).

## Evaluation checkpoints

- After Phase 1.3: measure session bootstrap (file reads, input tokens) with/without memory layer.
- After Phase 1.4: measure retrieval-correction edit detection rate and precision.
- After Phase 1.5: measure long-term task refresh latency (commit-to-digest).
