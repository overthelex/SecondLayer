# rlhf-signals

RLHF preference signal collection from recursive founder workflows. Implements the data collection pipeline described in the [Recursive Workflow Signals as Training Data for RLHF](https://legal.org.ua/blog/recursive-workflow-signals-rlhf) methodology.

## Quickstart

```bash
cd rlhf-signals
npm install

# Create .env from template
cp .env.example .env
# Edit .env with your credentials

# Create database
createdb lex_rlhf_signals

# Run migrations
npm run rlhf:migrate

# Extract retrospective signals
npm run rlhf:retro                          # all sources
npm run rlhf:retro -- --source=github       # GitHub PRs only
npm run rlhf:retro -- --source=plane        # Plane issues only
npm run rlhf:retro -- --source=claude-code  # Claude Code transcripts

# Attribute outcomes
npm run rlhf:attribute

# Generate feasibility report
npm run rlhf:feasibility
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run rlhf:migrate` | Create/update database schema |
| `npm run rlhf:retro` | Extract retrospective signals from all sources |
| `npm run rlhf:attribute` | Run outcome attribution for all sessions |
| `npm run rlhf:feasibility` | Generate feasibility report with signal density metrics |
| `npm run rlhf:ingest` | Manual session ingestion (email/LinkedIn drafts) |
| `npm run rlhf:outcome` | Manual outcome recording |
| `npm run rlhf:redact` | Run PII redaction on all artifacts |
| `npm run rlhf:export` | Export anonymized dataset (requires `--confirm-public-release`) |
| `npm test` | Run test suite |

## Manual Ingestion

```bash
npm run rlhf:ingest -- --source email_thread \
  --prompt-file draft1.md --output-file gpt-response.md \
  --final-file sent.md --terminal-action sent
```

## Manual Outcome

```bash
npm run rlhf:outcome -- --session-id <uuid> \
  --type response_received --confidence strong \
  --observed-at 2026-05-08
```

## Architecture

```
rlhf-signals/
├── migrations/          SQL migrations (idempotent)
├── src/
│   ├── schema/          Zod validators & typed queries
│   ├── retro/           Retrospective extractors (Phase 0)
│   ├── capture/         Live signal capture (Phase 1)
│   ├── attribution/     Outcome attribution
│   ├── redaction/       PII detection & redaction
│   ├── export/          Dataset export
│   └── lib/             DB, config, logger
├── scripts/             CLI entry points
└── tests/               Vitest test suite
```

## Database

Isolated PostgreSQL database `lex_rlhf_signals` with four tables:

- **workflow_sessions** — one per recursive workflow instance (PR, issue, transcript, email)
- **workflow_artifacts** — ordered sequence of prompts, LLM outputs, edits, finals
- **workflow_edits** — edit distance and semantic classification between artifact pairs
- **workflow_outcomes** — attributed outcomes with confidence and temporal window

## Phases

1. **Phase 0** (current): Retrospective extraction + feasibility assessment
2. **Phase 1**: Live capture via MCP middleware and Claude Code hooks
3. **Phase 2**: Redaction + dataset export for public release
