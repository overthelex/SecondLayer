# @secondlayer/shared

Shared utilities, types, and base classes for all SecondLayer MCP servers (mcp_backend, mcp_rada, mcp_openreyestr).

## Overview

This package contains common code used across all three MCP services: LLM client management, database connectivity, HTTP server scaffolding, cost tracking, SSE streaming, and shared TypeScript types.

Build this package before other services:

```bash
cd packages/shared && npm run build
```

## Installation

Used locally via file reference in each service's `package.json`:

```json
{
  "dependencies": {
    "@secondlayer/shared": "file:../packages/shared"
  }
}
```

## Exports

Everything is re-exported from `src/index.ts`. The full list of public APIs:

### Logger (`utils/logger.ts`)

```typescript
import { createLogger, logger, type Logger } from '@secondlayer/shared';

const log: Logger = createLogger('my-service');
log.info('Service started');
```

Winston-based structured logging with configurable service names.

### LLM Client Manager (`utils/llm-client-manager.ts`)

Unified interface across OpenAI, Anthropic, and AWS Bedrock with automatic retry, key rotation, and cost tracking.

```typescript
import {
  getLLMManager,
  type LLMClientManager,
  type UnifiedChatRequest,
  type UnifiedChatResponse,
  type UnifiedStreamChunk,
  type UnifiedMessage,
  type ToolDefinitionParam,
  type ToolCall,
} from '@secondlayer/shared';

const llm = getLLMManager();

const response = await llm.chatCompletion({
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' }
  ]
}, 'standard'); // budget: 'quick' | 'standard' | 'deep'
```

### Model Selector (`utils/model-selector.ts`)

Budget-aware model selection across providers. Supports OpenAI, Anthropic, and Bedrock with fallback chains.

```typescript
import {
  ModelSelector,
  type LLMProvider,    // 'openai' | 'anthropic' | 'bedrock'
  type BudgetLevel,    // 'quick' | 'standard' | 'deep'
  type ModelSelection,
  type TaskType,
} from '@secondlayer/shared';

const selection = ModelSelector.getModelSelection('deep');
// { provider: 'openai', model: 'gpt-5.1', budget: 'deep' }

const cost = ModelSelector.estimateCostAccurate('gpt-5-mini', 1000, 500);

const budget = ModelSelector.recommendBudget({ queryLength: 150 });

const providers = ModelSelector.getAvailableProviders();
// ['bedrock', 'openai'] — based on configured env vars
```

Default models (overridden via env vars):

| Budget | OpenAI | Anthropic | Bedrock |
|--------|--------|-----------|---------|
| quick | gpt-5-nano | claude-haiku-4-5-20251001 | eu.anthropic.claude-haiku-4-5-20251001-v1:0 |
| standard | gpt-5-mini | claude-sonnet-4-6-20250514 | eu.anthropic.claude-sonnet-4-6 |
| deep | gpt-5.1 | claude-opus-4-6-20250602 | eu.anthropic.claude-opus-4-6-v1 |

### OpenAI Client (`utils/openai-client.ts`)

```typescript
import {
  OpenAIClientManager,
  getOpenAIManager,
  requestContext,
  type RequestContext,
  type CostTrackerInterface,
} from '@secondlayer/shared';
```

Manages multiple OpenAI API keys with rotation and automatic cost tracking via `AsyncLocalStorage`.

### Anthropic Client (`utils/anthropic-client.ts`)

```typescript
import {
  AnthropicClientManager,
  getAnthropicManager,
} from '@secondlayer/shared';
```

Manages multiple Anthropic API keys with rotation and retry logic.

### Bedrock Client (`utils/bedrock-client.ts`)

```typescript
import {
  BedrockClientManager,
  getBedrockManager,
} from '@secondlayer/shared';
```

AWS Bedrock Runtime client with cost tracking. Requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### Base Database (`database/base-database.ts`)

PostgreSQL connection pooling, transactions, and error handling.

```typescript
import { BaseDatabase, createDatabaseFromEnv, type DatabaseConfig } from '@secondlayer/shared';

class MyDatabase extends BaseDatabase {
  constructor() {
    const config: DatabaseConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'myuser',
      password: process.env.POSTGRES_PASSWORD || 'mypassword',
      database: process.env.POSTGRES_DB || 'mydb',
      schema: process.env.POSTGRES_SCHEMA,
    };
    super(config);
  }
}

const db = new MyDatabase();
await db.connect();

const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

await db.transaction(async (client) => {
  await client.query('INSERT INTO users (name) VALUES ($1)', ['John']);
  await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
});
```

Or use the factory helper:

```typescript
const db = createDatabaseFromEnv({ prefix: 'POSTGRES', database: 'mydb' });
```

### SSE Handler (`http/sse-handler.ts`)

Server-Sent Events utilities for streaming tool responses.

```typescript
import { SSEHandler, type SSEEvent } from '@secondlayer/shared';

app.post('/stream', (req, res) => {
  SSEHandler.setupHeaders(res);
  SSEHandler.sendConnected(res, 'my-tool');
  SSEHandler.sendProgress(res, 'Processing...', 0.5);
  SSEHandler.sendComplete(res, { result: 'done' });
  SSEHandler.sendEnd(res);
});
```

### Base HTTP Server (`http/base-http-server.ts`)

Abstract Express server with built-in auth, CORS, health check, and tool execution routes.

```typescript
import { BaseHTTPServer, type BaseHTTPServerConfig } from '@secondlayer/shared';

class MyServer extends BaseHTTPServer {
  constructor() {
    super({
      serviceName: 'my-service',
      version: '1.0.0',
      port: 3000,
    });
  }
  // implement abstract methods...
}
```

### Base Cost Tracker (`services/base-cost-tracker.ts`)

Abstract cost tracking for LLM and API usage, with tiered SecondLayer pricing.

```typescript
import {
  BaseCostTracker,
  type CostTrackerConfig,
  type AdditionalCostResult,
} from '@secondlayer/shared';
```

### Types (`types/`)

Shared TypeScript types used across all services:

```typescript
import type {
  // HTTP types
  AuthenticatedRequest,
  HealthCheckResponse,
  ToolCallRequest,
  ToolCallResponse,
  BatchToolCall,
  BatchToolCallResponse,

  // Evidence types (backend -> frontend SSE)
  Decision,
  Citation,
  VaultDocument,
  ExtractedEvidence,

  // Cost tracking types
  OpenAICallRecord,
  AnthropicCallRecord,
  VoyageCallRecord,
  ZOCallRecord,
  RadaAPICallRecord,
  SecondLayerCallRecord,
  DatabaseQueryRecord,
  CostEstimate,
  CostBreakdown,
  CostTrackingRecord,
  MonthlyAPIUsage,
  ToolUsageStats,
} from '@secondlayer/shared';
```

## Architecture

```
packages/shared/
├── src/
│   ├── utils/
│   │   ├── logger.ts              # Winston logger factory
│   │   ├── openai-client.ts       # OpenAI client manager (multi-key)
│   │   ├── anthropic-client.ts    # Anthropic client manager (multi-key)
│   │   ├── bedrock-client.ts      # AWS Bedrock client manager
│   │   ├── llm-client-manager.ts  # Unified LLM interface (OpenAI + Anthropic + Bedrock)
│   │   └── model-selector.ts      # Budget-aware model selection + cost estimation
│   ├── database/
│   │   └── base-database.ts       # PostgreSQL base class with pooling
│   ├── http/
│   │   ├── sse-handler.ts         # SSE streaming utilities
│   │   └── base-http-server.ts    # Abstract Express HTTP server
│   ├── services/
│   │   └── base-cost-tracker.ts   # Abstract cost tracker with tiered pricing
│   ├── types/
│   │   ├── index.ts               # Re-exports all types
│   │   ├── http.ts                # AuthenticatedRequest, ToolCallResponse, etc.
│   │   ├── evidence.ts            # Decision, Citation, ExtractedEvidence
│   │   └── cost.ts                # CostBreakdown, CostTrackingRecord, etc.
│   └── index.ts                   # Main barrel export
├── dist/                          # Compiled output
├── package.json
└── tsconfig.json
```

## Environment Variables

### LLM Providers

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_API_KEY2=sk-...              # Optional fallback key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_API_KEY2=sk-ant-...       # Optional fallback key

# AWS Bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-central-1             # Default: eu-central-1

# Provider strategy
LLM_PROVIDER_STRATEGY=openai-first  # 'openai-first' | 'bedrock-first'

# Model overrides (per budget level)
OPENAI_MODEL_QUICK=gpt-5-nano
OPENAI_MODEL_STANDARD=gpt-5-mini
OPENAI_MODEL_DEEP=gpt-5.1

ANTHROPIC_MODEL_QUICK=claude-haiku-4-5-20251001
ANTHROPIC_MODEL_STANDARD=claude-sonnet-4-6-20250514
ANTHROPIC_MODEL_DEEP=claude-opus-4-6-20250602

BEDROCK_MODEL_QUICK=eu.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_MODEL_STANDARD=eu.anthropic.claude-sonnet-4-6
BEDROCK_MODEL_DEEP=eu.anthropic.claude-opus-4-6-v1

# Single model override (uses one model for all budget levels)
OPENAI_MODEL=...

# Embedding model
VOYAGEAI_EMBEDDING_MODEL=voyage-multilingual-2

# Logging
LOG_LEVEL=info  # debug | info | warn | error
```

### Database

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=mydb
POSTGRES_SCHEMA=public  # Optional
```

### HTTP Server

```bash
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
ALLOWED_ORIGINS=*       # Comma-separated
```

## Development

```bash
npm install
npm run build       # Compile TypeScript
npm run dev         # Watch mode
npm run clean       # Remove dist/
npm test            # Run Jest tests
npm run test:watch  # Watch mode
```

## License

MIT
