# Core overlay version

The proprietary chat pipeline (`overthelex/secondlayer-core`) is **not** a pinned
dependency — `deploy-prod.yml` clones it `--depth 1` at build time and overlays
`src/services/*.ts` + `src/prompts/*` onto `mcp_backend/`. This file records which
core commit a deploy is intended to ship, for audit, and bumps the backend path so
a core-only change triggers a backend build + deploy.

| Date | Core commit | Notes |
|------|-------------|-------|
| 2026-06-23 | `17b1b0a` | CORE-21 P0.1 quote-or-drop (#55) + P0.2 claim↔source verifier (#57): warn-only citation-grounding gates (`ungrounded_quote`, `claim_unsupported`). |
| 2026-06-23 | `3fd3bed` | CORE-21 P0.3 verify-before-stream (#58): high-stakes query types (practice/institutional/comparative_analysis, due_diligence) verify + repair citations before the answer is streamed — final answer renders at once, not token-by-token. |

> Update this row whenever a core change must reach prod. The overlay always uses
> core `main` HEAD; keep the recorded commit equal to that HEAD at merge time.
