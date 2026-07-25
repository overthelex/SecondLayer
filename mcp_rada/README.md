# RADA MCP Server

Ukrainian Parliament (Verkhovna Rada) data analysis server implementing the Model Context Protocol (MCP).

## Overview

RADA MCP Server provides AI-powered analysis of Ukrainian parliamentary data including:
- **Deputies** - Member information, factions, committees, assistants, voting records
- **Bills** - Legislative proposals with status tracking
- **Legislation** - Full text of laws, codes, and Constitution
- **Voting Records** - Session votes with pattern analysis
- **Cross-referencing** - Links parliament data to court cases via SecondLayer

## Architecture

- **Dual Transport**: MCP stdio + HTTP REST API (with SSE streaming)
- **Database**: PostgreSQL with intelligent caching (TTL-based)
- **Cache Strategy**: Redis + PostgreSQL (deputies 7d, bills 1d, laws 30d)
- **AI Analysis**: OpenAI/Anthropic with budget-based model selection (via `@secondlayer/shared` LLMManager)
- **Cost Tracking**: Comprehensive API usage monitoring
- **Prometheus Metrics**: Built-in `/metrics` endpoint for monitoring
- **Factory Pattern**: Service composition via `createRadaCoreServices()`

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- OpenAI API key

### Installation

```bash
cd mcp_rada
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Setup database
npm run db:setup

# Run migrations
npm run migrate
```

### Development

```bash
# Start HTTP server (port 3001)
npm run dev:http

# Start MCP stdio server
npm run dev

# Sync initial data
npm run sync:deputies
npm run sync:laws
npm run sync:reference
```

### Production

```bash
# Build TypeScript
npm run build

# Start with Docker
docker compose up -d

# Or start directly
npm run start:http
```

## MCP Tools (4)

### 1. search_parliament_bills

Search and filter legislative bills with semantic analysis.

**Input:**
```json
{
  "query": "tax reform",
  "status": "adopted",
  "date_from": "2025-01-01",
  "limit": 20
}
```

**Parameters:** `query` (required), `status` (enum: registered, first_reading, second_reading, adopted, rejected, all), `initiator`, `committee`, `date_from`, `date_to`, `limit`

### 2. get_deputy_info

Get detailed deputy information with optional voting history and assistants.

**Input:**
```json
{
  "name": "Зеленський",
  "include_voting_record": true,
  "include_assistants": false
}
```

**Parameters:** `name`, `rada_id`, `faction`, `include_voting_record`, `include_assistants` (at least one of name/rada_id/faction required)

### 3. search_legislation_text

Search Ukrainian laws with full-text search and court citations.

**Input:**
```json
{
  "law_identifier": "constitution",
  "article": "124",
  "include_court_citations": true
}
```

**Parameters:** `law_identifier` (required), `article`, `search_text`, `include_court_citations`

**Aliases supported:** constitution, цивільний кодекс, кримінальний кодекс, кпк, etc.

### 4. analyze_voting_record

Analyze deputy voting patterns with AI insights.

**Input:**
```json
{
  "deputy_name": "Іванов",
  "date_from": "2025-01-01",
  "analyze_patterns": true
}
```

**Parameters:** `deputy_name` (required), `date_from`, `date_to`, `bill_number`, `analyze_patterns`

## API Endpoints

### Health & Monitoring (no auth required)

```
GET  /health          # Full health check (postgres + redis status)
GET  /health/live     # Liveness probe
GET  /health/ready    # Readiness probe (DB connectivity)
GET  /metrics         # Prometheus metrics
GET  /api/stats       # Data statistics (table row counts, sources, update times)
```

### Tool Endpoints (require `Authorization: Bearer <RADA_API_KEY>`)

```
GET  /api/tools                    # List available tools
POST /api/tools/:toolName          # Execute tool (JSON response)
POST /api/tools/:toolName/stream   # Execute tool (SSE streaming)
```

**SSE streaming** is also available via the main tool endpoint by setting `Accept: text/event-stream` header.

### Example

```bash
curl -X POST http://localhost:3001/api/tools/get_deputy_info \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"name": "Зеленський"}}'
```

## Database Schema

### Core Tables (rada schema)

- **deputies** - Parliament members (7d cache TTL)
- **deputy_assistants** - Deputy assistants
- **bills** - Legislative proposals (1d cache TTL)
- **legislation** - Law texts (30d cache TTL)
- **voting_records** - Session votes
- **factions** - Parliamentary factions
- **committees** - Parliamentary committees

### Cost Tracking

- **cost_tracking** - Per-request API usage
- **monthly_api_usage** - Monthly aggregates
- **tool_usage_stats** - Tool performance metrics

### Cross-Reference

- **law_court_citations** - Links laws to court cases
- **bill_court_impact** - Bill impact analysis
- **deputy_court_mentions** - Deputy mentions in cases

### Migrations

5 migrations in `src/migrations/`:
1. `001_initial_schema.sql` - Core tables
2. `002_add_cost_tracking.sql` - Cost tracking
3. `003_add_cross_reference.sql` - SecondLayer integration
4. `004_fix_fts_language.sql` - Full-text search language fix
5. `005_fix_voting_dedup.sql` - Voting deduplication fix

## Data Sync Scripts

```bash
# Sync all deputies (run weekly)
npm run sync:deputies

# Sync law texts (run monthly)
npm run sync:laws

# Sync reference data (factions, committees)
npm run sync:reference

# Cleanup expired cache
npm run cleanup:cache
```

Additional scripts in `src/scripts/`:
- `import-json-data.ts` - Import data from JSON files
- `sync-week-data.ts` - Weekly data sync

## Configuration

### Environment Variables

See `.env.example` for all available options. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PORT` | `5433` | PostgreSQL port (avoids conflict with mcp_backend on 5432) |
| `HTTP_PORT` | `3001` | HTTP server port |
| `REDIS_PORT` | `6380` | Redis port |
| `RADA_API_KEYS` | - | Comma-separated API keys for auth |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (optional) |
| `LLM_PROVIDER_STRATEGY` | `openai-first` | LLM provider preference |
| `SECONDLAYER_URL` | `http://localhost:3000` | SecondLayer backend URL |
| `SECONDLAYER_API_KEY` | - | SecondLayer API key for cross-referencing |

### Cache TTL

```bash
CACHE_TTL_DEPUTIES=604800   # 7 days
CACHE_TTL_BILLS=86400       # 1 day
CACHE_TTL_LAWS=2592000      # 30 days
CACHE_TTL_VOTING=259200     # 3 days
```

### Model Selection

Budget-based (uses `@secondlayer/shared` LLMManager):
```bash
OPENAI_MODEL_QUICK=gpt-4o-mini      # Simple tasks
OPENAI_MODEL_STANDARD=gpt-4o-mini   # Moderate complexity
OPENAI_MODEL_DEEP=gpt-4o            # Complex analysis
```

## Docker Deployment

The `docker-compose.yml` in this directory includes:
- PostgreSQL 15 (port 5433)
- Redis 7 (port 6380)
- rada-mcp-app (port 3001)

```bash
docker compose up -d
docker compose logs -f app
docker compose down
```

For production deployment via the monorepo, use the deployment configs in `deployment/`.

## Project Structure

```
mcp_rada/
├── src/
│   ├── index.ts              # MCP stdio entry point
│   ├── http-server.ts        # HTTP/SSE server entry point
│   ├── api/
│   │   ├── mcp-rada-api.ts   # MCP tools definition and routing
│   │   └── __tests__/        # Integration and smoke tests
│   ├── adapters/
│   │   ├── rada-api-adapter.ts    # data.rada.gov.ua API client
│   │   └── zakon-rada-adapter.ts  # zakon.rada.gov.ua adapter
│   ├── database/
│   │   └── database.ts       # PostgreSQL connection pool
│   ├── factories/
│   │   └── rada-services.ts  # Service composition factory
│   ├── middleware/
│   │   ├── dual-auth.ts      # API key authentication
│   │   └── rate-limit.ts     # Rate limiting middleware
│   ├── migrations/           # SQL migrations (001-005)
│   ├── scripts/
│   │   ├── import-json-data.ts
│   │   ├── sync-laws.ts
│   │   ├── sync-reference-data.ts
│   │   └── sync-week-data.ts
│   ├── services/
│   │   ├── bill-service.ts
│   │   ├── committee-service.ts
│   │   ├── cost-tracker.ts
│   │   ├── cross-reference-service.ts
│   │   ├── deputy-service.ts
│   │   ├── faction-service.ts
│   │   ├── legislation-service.ts
│   │   ├── metrics-service.ts    # Prometheus metrics
│   │   └── voting-service.ts
│   ├── types/
│   │   ├── index.ts          # Core RADA types
│   │   ├── cost.ts           # Cost tracking types
│   │   └── rada.ts           # RADA API types and known laws mapping
│   └── utils/
│       ├── llm-client-manager.ts  # LLM client management
│       ├── logger.ts              # Winston logger
│       ├── model-selector.ts      # Budget-based model selection
│       ├── openai-client.ts       # OpenAI client with request context
│       └── redis-client.ts        # Redis client singleton
├── scripts/
│   └── create-db.sh          # Database creation script
├── data/
│   └── RADA/                 # Reference data and documentation
├── docker-compose.yml        # Local Docker orchestration
├── Dockerfile                # Node.js 20 Alpine container
└── logs/                     # Application logs
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # ESLint
```

Test files are in `src/api/__tests__/`.

## SecondLayer Integration

Cross-referencing with court cases:

```bash
# In .env
SECONDLAYER_URL=http://localhost:3000
SECONDLAYER_API_KEY=your-secondlayer-key
```

Then use `include_court_citations: true` in `search_legislation_text` tool.

## Cost Tracking

Every API call is tracked with:
- OpenAI/Anthropic token usage and cost
- RADA API calls (free but bandwidth tracked)
- SecondLayer API calls (when cross-referencing)
- Execution time

Cost breakdown is included in HTTP responses:
```json
{
  "result": {},
  "cost_tracking": {
    "request_id": "abc-123",
    "estimate_before": {},
    "actual_cost": {
      "totals": {
        "cost_usd": 0.0234,
        "execution_time_ms": 1245
      }
    }
  }
}
```

## License

MIT
