# How We Built a 70-Tool MCP Server for Legal AI — Architecture Lessons

*One endpoint. Three services. Triple transport. Here's what it takes to build a production MCP server that actually scales.*

---

## The Problem: Legal AI Needs More Than One API Call

When a lawyer asks "Should I file a negatory or vindication claim for unauthorized land seizure?" — the answer requires:

- Searching 200+ court decisions across multiple phrasing variations
- Retrieving full text of Civil Code Article 391 and Land Code Article 212
- Comparing pro and contra practice lines
- Checking which precedents are still valid
- Synthesizing everything into a strategic recommendation

That's not one LLM call. That's an orchestrated pipeline of 5-7 tool calls, each hitting different data sources, each with its own cost profile and latency characteristics.

We needed a system where an AI agent could discover, select, and execute dozens of specialized legal tools in a single conversation. MCP (Model Context Protocol) gave us the framework. Building it in production taught us the rest.

## The Architecture: 70 Tools, Three Services, One Gateway

### Service Breakdown

Our platform runs three independent MCP servers, each owning its domain:

| Service             | Tools  | Domain                                                                              |
| ------------------- | ------ | ----------------------------------------------------------------------------------- |
| **mcp_backend**     | 50     | Court decisions, legislation, semantic search, document vault, due diligence        |
| **mcp_rada**        | 4      | Parliament data — bills, deputies, voting records, legislation text                 |
| **mcp_openreyestr** | 16     | State business registry — entities, beneficiaries, debtors, enforcement proceedings |
| **Total**           | **70** |                                                                                     |

Each service is a standalone Node.js/TypeScript application with its own PostgreSQL database, Redis cache, and (for the backend) Qdrant vector database.

### The Unified Gateway

In production, clients don't need to know about three services. A single environment variable — `ENABLE_UNIFIED_GATEWAY=true` — turns the backend into an aggregation point:

```
Client → POST /api/tools/rada_search_parliament_bills
       → Gateway checks ToolRegistry
       → Route: { service: 'rada', local: false }
       → ServiceProxy → POST rada-service:3001/api/tools/search_parliament_bills
       → Response flows back to client
```

The `ToolRegistry` maintains two data structures:

```typescript
private routes: Map<string, ToolRoute>;        // all routes (local + remote)
private handlerMap: Map<string, BaseToolHandler>; // local tool handlers
```

Local tools execute in-process. Remote tools proxy via HTTP with `X-Parent-Request-ID` header for distributed tracing. Remote tool definitions are lazily fetched on first `GET /api/tools` call and cached for the process lifetime.

The prefix convention makes routing unambiguous: `rada_*` goes to RADA, `openreyestr_*` goes to OpenReyestr, everything else is local.

## Triple Transport: One Server, Three Protocols

Every MCP server supports three ways to connect. This wasn't a design choice — it was a survival requirement. Different clients speak different protocols.

### Transport 1: stdio (MCP Native)

```typescript
const transport = new StdioServerTransport();
await this.server.connect(transport);
```

Pure JSON-RPC over stdin/stdout. This is what Claude Desktop and other MCP-native clients use. No HTTP, no ports, no auth — the client launches our server as a subprocess.

**When it matters:** Local development, Claude Desktop integration, MCP CLI testing. Zero overhead, instant tool discovery.

### Transport 2: HTTP REST API

```
POST /api/tools/:toolName     → execute tool
POST /api/tools/:toolName/stream → SSE streaming
POST /api/tools/batch          → parallel execution
GET  /api/tools                → list all tools (+ remote via gateway)
```

Standard REST with Bearer token auth. This is what our web frontend uses. The `Accept: text/event-stream` header on the regular endpoint switches the response to SSE — no separate URL needed.

**When it matters:** Web applications, API integrations, anything that speaks HTTP. The batch endpoint is critical for the agentic loop — when the AI's plan says "run these 3 searches in parallel," we `Promise.all()` them.

### Transport 3: SSE (MCP-over-SSE)

We actually run two SSE variants:

**Variant A (`/sse`)** — ChatGPT/OpenAI integration protocol. One HTTP request per JSON-RPC message, full OAuth discovery (`/.well-known/oauth-authorization-server`), 30s keepalive pings.

**Variant B (`/v1/sse`)** — Standard MCP SSE transport from the SDK. Creates a fresh MCP `Server` instance per connection with full session lifecycle. This is for Claude Desktop remote connections and other standard MCP clients.

**When it matters:** Remote MCP clients, distributed architectures, connections through reverse proxies that need long-lived streaming.

## The BaseToolHandler Pattern

Every tool domain extends a single abstract class:

```typescript
export abstract class BaseToolHandler {
  abstract getToolDefinitions(): ToolDefinition[];
  abstract executeTool(name: string, args: any): Promise<ToolResult | null>;

  protected wrapResponse(data: any): ToolResult { ... }
  protected wrapError(message: string): ToolResult { ... }
}
```

This gives us:

- **Standardized error handling.** `wrapError()` sets `isError: true` in the MCP response. The HTTP layer returns `200 OK` regardless (MCP convention) — errors are in-band, not HTTP status codes.
- **Consistent registration.** `toolRegistry.registerHandler(handler)` iterates `handler.getToolDefinitions()` and populates the handler map automatically. Adding a new tool domain is one line in the constructor.
- **Optional streaming.** `executeToolStream?()` is optional. The registry checks `supportsStreaming(name)` before routing to the streaming path.

13 handler classes cover the full domain: `CourtDecisionTools`, `ProceduralTools`, `LegislationTools`, `VaultTools`, `DocumentAnalysisTools`, `DueDiligenceTools`, `BusinessRegistryTools`, `ECHRPracticeTools`, and more.

## The Tool Call Flow: 11 Steps from Request to Response

Here's what happens when `POST /api/tools/search_legal_precedents` arrives:

1. **`dualAuth` middleware** — validates Bearer token as JWT (web users) or API key (programmatic clients)
2. **Balance check** — verifies account has sufficient credits; returns `402` if not
3. **Credit calculation** — estimates credits for this specific tool
4. **Cost tracking record** — inserts a `pending` row in `cost_tracking` table with request metadata
5. **Cost estimate** — logs estimated cost before execution (tool name, query length, reasoning budget)
6. **Gateway routing** — checks if tool is local or remote; proxies if remote
7. **Local execution** — runs inside `AsyncLocalStorage` context so all downstream OpenAI calls automatically attach token counts to this request ID
8. **Handler dispatch** — `toolRegistry.executeTool()` → `handler.executeTool()` → domain-specific logic
9. **Cost tracking completion** — records actual token usage, execution time, status
10. **Credit deduction** — charged after successful execution, not before
11. **Response** — includes result, cost breakdown, and request ID for tracing

The `AsyncLocalStorage` pattern deserves special mention. Every tool call that internally uses OpenAI embeddings or completions needs to track token usage. Instead of passing a `requestId` through 6 layers of function calls, we wrap the execution in `requestContext.run()`. Any OpenAI call anywhere in the call tree automatically finds the current request context and records its tokens.

## Patterns That Saved Us

### Cost Hints in Tool Descriptions

Every tool description includes estimated cost:

```
💰 Approximate cost: $0.01-$0.04 USD
Cost depends on analysis depth...
```

This propagates to LLM clients. When the AI agent plans which tools to call, it can reason about cost before executing. A `quick` budget classification call costs $0.001. A `deep` legal analysis costs $0.10. The AI sees this and adjusts.

### Budget-Aware Model Selection Per Tool

Many tools expose a `reasoning_budget` parameter:

```typescript
reasoning_budget: {
  type: 'string',
  enum: ['quick', 'standard', 'deep'],
  default: 'standard'
}
```

This flows to `ModelSelector` which maps it to different OpenAI models: `quick → gpt-5-nano`, `standard → gpt-5-mini`, `deep → gpt-5.1`. The same tool can run cheap or expensive depending on the query.

### Vault Tool User Isolation

Vault tools (document storage) need per-user scoping, but the MCP tool schema shouldn't expose auth parameters. We inject the user ID at the transport layer:

```typescript
const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search']);
const toolArgs = VAULT_TOOLS.has(toolName) ? { ...args, userId } : args;
```

The tool handler receives `userId` as if the client sent it. Clean separation between auth and business logic.

### Route Normalization for Metrics

With 70 tools and UUIDs in URLs, Prometheus cardinality explodes fast. Our `MetricsService` normalizes routes before recording:

- `/api/tools/search_legal_precedents` → `/api/tools/:toolName`
- `/api/documents/a1b2c3d4-...` → `/api/documents/:id`

Without this, every unique tool call creates a new time series. With it, we have ~20 route labels total.

## What We'd Do Differently

**Start with the gateway from day one.** We built three separate services first, then bolted on the unified gateway. The prefix convention (`rada_*`, `openreyestr_*`) works but feels like a patch. If starting over, we'd design the tool namespace upfront.

**Schema validation at the registry level.** Currently, each handler validates its own input. A central validation step in `executeTool()` using the JSON Schema from `getToolDefinitions()` would catch malformed requests before they reach handler code.

**Streaming for all tools.** We made streaming optional. In practice, every tool that takes more than 2 seconds should stream progress events. Users staring at a spinner for 10 seconds while a deep analysis runs is bad UX. We're retrofitting this now.

## The Numbers

- **70 tools** across 3 services
- **13 handler classes** in the backend alone
- **3 transport protocols** per service
- **11-step execution pipeline** with cost tracking at every stage
- **5,191 legislation articles** pre-loaded and searchable
- **16 Ukrainian state registries** queryable in real time
- Average tool call latency: **200ms** (cached) to **8s** (deep analysis with embeddings)

The MCP protocol gave us a standard way to describe and discover tools. The engineering challenge was everything else: cost tracking, credit management, multi-service aggregation, user isolation, and making it all observable.

The tool count will keep growing. The architecture doesn't care.

---

*We're building LEX AI — an AI-powered legal research platform for Ukrainian law. If you're building MCP servers or legal tech infrastructure, let's connect.*

*#MCP #AI #LegalTech #Architecture #TypeScript #OpenAI #BuildInPublic*
