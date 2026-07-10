# MCP API v2 — curated 15-tool surface (`/api/v2/mcp`)

**Plane:** LEXAI-1785 · **Supersedes surface of:** LEXAI-1784 (PR #2051/#2052, the single `legal_chat` v2)
**Date:** 2026-06-30 · **Branch:** `feat/mcp-v2-15-tools`

## Goal

Change the existing `/api/v2/mcp` endpoint so it exposes a **curated set of 15 tools** instead of a single `legal_chat` orchestrating tool. External MCP clients (Claude Code/Desktop, ChatGPT) get the same 15 tools the v3 web-chat uses internally, so they can drive retrieval themselves. v1 (`/api/v1/mcp` + `/v1/sse`, ~112 tools) stays unchanged.

## Background / current state

- `mcp_backend/src/routes/mcp-sse-routes.ts` already has v2 (merged, LEXAI-1784):
  - `LEGAL_CHAT_TOOL` constant + `buildMcpServerV2()` whose `ListTools` returns `[LEGAL_CHAT_TOOL]` and whose `CallTool` routes everything into `deps.chatService.chat()`.
  - Routes `POST/GET/DELETE /v2/mcp` (public `/api/v2/mcp`), OAuth (RFC 9728) resource metadata, `Mcp-Session-Id` sessions — all reused as-is.
- v1 `buildMcpServer()` is fully dynamic: `ListTools` → `toolRegistry.getAllToolDefinitions()`; `CallTool` → credit check → cost-tracking → `toolRegistry.executeTool()` → credit deduction. **v1 keeps no tool list** — the registry is the source of truth and it lets a client call *any* registered tool by name.

## Design

Rework **only** `buildMcpServerV2()`. Transports, routes, auth, OAuth metadata stay untouched.

### 1. The 15-tool set (source of truth)

Add a module-level constant in `mcp-sse-routes.ts` (decision: option A/C — own const in the open repo, not coupled to proprietary `secondlayer-core`):

```ts
// Mirrors secondlayer-core FIXED_V2_TOOLS (chat-service.ts) as of 2026-06-30.
// This is the PUBLIC v2 MCP contract — versioned deliberately; sync by hand if the
// chat toolset changes. Used both to filter tools/list and to allowlist tools/call.
const MCP_V2_TOOLS = new Set<string>([
  // Законодавство (6)
  'search_legislation', 'get_legislation_section', 'get_legislation_articles',
  'get_legislation_structure', 'list_legislation_editions', 'get_legislation_history',
  // ЄДРСР / судова практика (9)
  'search_court_decisions', 'get_court_decision', 'get_case_documents_chain',
  'load_full_texts', 'find_similar_fact_pattern_cases', 'compare_practice_pro_contra',
  'count_cases_by_party', 'check_precedent_status', 'get_citation_graph',
]);
```

### 2. `ListTools` — filter

```ts
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  const all = await deps.toolRegistry.getAllToolDefinitions();
  const tools = all.filter(t => MCP_V2_TOOLS.has(t.name));
  const missing = [...MCP_V2_TOOLS].filter(n => !tools.some(t => t.name === n));
  if (missing.length) logger.warn('[MCP v2] curated tools missing from registry', { missing });
  return { tools };
});
```

Descriptions are reused verbatim from each tool's existing `getToolDefinitions()` (already Ukrainian, already populated — verified for all 15).

### 3. `CallTool` — allowlist + per-tool dispatch (reuse v1 mechanics)

Replace the chat-pipeline `CallTool` with the v1 flow, gated by the allowlist:

1. **Guard:** `if (!MCP_V2_TOOLS.has(toolName)) return isError('tool not exposed by MCP v2')`. This is required — without it a client could call any of the 112 by name even though it is hidden from `tools/list`.
2. Credit check before (`creditService.calculateCreditsForTool` → `checkBalance`).
3. `costTracker.createTrackingRecord({ requestId: 'mcp-v2-…', toolName, clientKey, userId, … })`.
4. `requestContext.run(...)` → `toolRegistry.executeTool(toolName, args)` (with the same VAULT_TOOLS `userId` injection as v1 — though none of the 15 are vault tools, keep the pattern for safety).
5. `costTracker.completeTrackingRecord` + credit deduction on success; `{ isError }` on failure.

`buildMcpServerV2` no longer needs `deps.chatService` (leave the dep available for v1/other callers; just stop using it here). Drop `LEGAL_CHAT_TOOL`. Keep server `version: '2.0.0'`.

### 4. v1 deprecation header

v1 currently sets `Link: </api/v2/mcp>; rel="successor-version"`. Still valid — keep. (v2 is now a curated tool surface, a clean successor.)

## EDRSR coverage (audit result — informational)

The 15 tools cover EDRSR via:
- **FTS** — `search_court_decisions` mode=`fulltext` (+ `structured`). ✅
- **Semantic** (Qdrant HNSW, qdrant-readonly `edrsr_serving` 296.56M, jk 1-5) — mode=`semantic`/`hybrid` + `find_similar_fact_pattern_cases`. ✅
- **Neo4j graph** — `get_citation_graph`, **partial**: decision→article (CITES_ARTICLE/OF_LAW/co-cited) only. decision↔decision is not exposed and the data is empty on prod (pending LEXAI-1773 full extraction run). ⚠️

## Out of scope

- decision↔decision citation graph / a 16th tool (`find_citing_decisions`) — revisit after LEXAI-1773 lands `case_citation_edges`.
- Any change to the 15 tools' own implementations.
- v1 behaviour.

## Cleanup (bundled, low-risk)

- Fix stale comment `edrsr-unified-search-tool.ts:8` ("semantic available only for jk=5") — semantic now covers jk 1-5 (`VECTORIZED_JUSTICE_KINDS = {1..5}`).

## Testing

- Unit test for `buildMcpServerV2`: `tools/list` returns exactly the 15 names; `tools/call` on an in-set tool dispatches to `executeTool`; `tools/call` on an out-of-set tool (e.g. `parse_document`, `rada_*`) returns `isError`.
- Smoke: `tools/list` over `/api/v2/mcp` (Streamable HTTP) returns 15 with non-empty descriptions; one real call (e.g. `get_legislation_section` "ст. 625 ЦК") succeeds with billing recorded.

## Acceptance criteria

1. `GET/POST /api/v2/mcp` `tools/list` → exactly the 15 tools, each with its description.
2. `tools/call` works for all 15 with credit check + cost tracking (v1 mechanics).
3. `tools/call` for any non-listed tool is rejected.
4. v1 unchanged; build + tests green.
