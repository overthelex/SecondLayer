# SecondLayer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-SDK-6E56CF)](https://modelcontextprotocol.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**AI-powered legal tech platform for Ukrainian law.** Semantic search over court decisions, legislation retrieval, parliament data, and business registry lookups — all exposed as [MCP](https://modelcontextprotocol.io/) tools for LLM integration.

## Overview

SecondLayer is a monorepo containing three MCP (Model Context Protocol) servers, a web frontend, and shared utilities. It provides 45 AI-powered tools for legal research and analysis.

### What it does

- **Semantic search** over millions of Ukrainian court decisions
- **Legislation retrieval** with intelligent article-level sectioning (Constitution, codes, laws)
- **Parliament data** — deputies, bills, voting records from Verkhovna Rada
- **Business registry** — entity search, beneficiaries, debtors (EDRPOU)
- **Document vault** — secure storage with encryption
- **Legal pattern analysis** — store and retrieve legal reasoning patterns
- **Citation validation** — verify legal references against source documents
- **Hallucination guard** — prevent AI from generating unsupported claims

### Architecture

All three MCP servers support a triple transport system:

| Transport | Use case |
|-----------|----------|
| **MCP stdio** | Local integration with Claude Desktop, Cursor, etc. |
| **HTTP API** | Web apps, REST clients |
| **SSE** | Remote MCP over HTTPS for distributed clients |

```
┌─────────────────────────────────────────────────┐
│                   Clients                        │
│  Claude Desktop  │  Web App  │  Remote MCP       │
└────────┬─────────┴─────┬────┴────────┬──────────┘
         │ stdio         │ HTTP       │ SSE
┌────────┴───────────────┴────────────┴──────────┐
│              Unified Gateway (45 tools)          │
├─────────────────┬──────────────┬────────────────┤
│  mcp_backend    │  mcp_rada    │ mcp_openreyestr│
│  36 tools       │  4 tools     │  5 tools       │
├─────────────────┴──────────────┴────────────────┤
│  PostgreSQL  │  Redis  │  Qdrant  │  OpenAI API  │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- PostgreSQL 15
- Redis 7
- [Qdrant](https://qdrant.tech/) (vector database)
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/SecondLayer.git
cd SecondLayer

# Install all dependencies
npm run install:all

# Build shared package first
cd packages/shared && npm run build && cd ../..
```

### Configuration

Copy `.env.example` files and configure:

```bash
cp mcp_backend/.env.example mcp_backend/.env
cp mcp_rada/.env.example mcp_rada/.env
cp mcp_openreyestr/.env.example mcp_openreyestr/.env
cp lexwebapp/.env.example lexwebapp/.env.local
cp deployment/.env.example deployment/.env.local
```

At minimum, set `OPENAI_API_KEY`, `POSTGRES_*`, and `SECONDARY_LAYER_KEYS`.

### Run with Docker (recommended)

```bash
cd deployment
./manage-gateway.sh start local
```

### Run without Docker

```bash
# Terminal 1 — Backend
cd mcp_backend && npm run dev:http    # Port 3000

# Terminal 2 — RADA server
cd mcp_rada && npm run dev:http       # Port 3001

# Terminal 3 — OpenReyestr server
cd mcp_openreyestr && npm run dev:http # Port 3005

# Terminal 4 — Frontend
cd lexwebapp && npm run dev           # Port 5173
```

### Database Setup

```bash
cd mcp_backend && npm run db:setup && npm run migrate
cd mcp_rada && npm run db:setup && npm run migrate
cd mcp_openreyestr && npm run db:setup && npm run migrate
```

## Project Structure

```
SecondLayer/
├── mcp_backend/        # Primary MCP server — court cases, legislation, vault
├── mcp_rada/           # Parliament data — deputies, bills, voting
├── mcp_openreyestr/    # Business registry — entities, beneficiaries
├── lexwebapp/          # Web frontend (React 19, Vite, TailwindCSS)
├── packages/shared/    # Shared TypeScript types and utilities
├── deployment/         # Docker configs, compose files, nginx
├── scripts/            # Data import and utility scripts
└── docs/               # Documentation (100+ files)
```

### Key Technologies

| Layer | Stack |
|-------|-------|
| **Runtime** | Node.js 20, TypeScript 5.3 |
| **Backend** | Express.js, MCP SDK |
| **Frontend** | React 19, Vite, TailwindCSS 3, Zustand, TanStack Query |
| **Databases** | PostgreSQL 15, Redis 7, Qdrant |
| **AI** | OpenAI (GPT-4o, embeddings), optional Anthropic |
| **Infra** | Docker Compose, nginx |

## MCP Tools (45 total)

### Backend (36 tools)
Court case search, semantic search, legislation retrieval, document analysis, legal patterns, citation validation, vault operations, cost tracking, and more.

### RADA (4 tools, `rada_*` prefix)
Deputies, bills, legislation text, voting records from Verkhovna Rada Open Data API.

### OpenReyestr (5 tools, `openreyestr_*` prefix)
Entity search by name/EDRPOU, beneficiary lookup, debtor registry.

Full tool list: [docs/ALL_MCP_TOOLS.md](docs/ALL_MCP_TOOLS.md)

## API Usage

### HTTP API

```bash
# List available tools
curl http://localhost:3000/api/tools

# Execute a tool
curl -X POST http://localhost:3000/api/tools/search_court_cases \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "відшкодування моральної шкоди"}'

# Health check
curl http://localhost:3000/health
```

### MCP Integration (Claude Desktop)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": ["path/to/SecondLayer/mcp_backend/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "OPENAI_API_KEY": "sk-...",
        "SECONDARY_LAYER_KEYS": "your-key"
      }
    }
  }
}
```

## Testing

```bash
# Backend tests (Jest)
cd mcp_backend && npm test

# Frontend tests (Vitest)
cd lexwebapp && npm run test

# E2E tests (Playwright)
cd tests && npx playwright test

# Single test file
cd mcp_backend && npx jest --no-cache path/to/file.test.ts
```

## Documentation

- [Getting Started](docs/guides/START_HERE.md)
- [API Reference](docs/api/)
- [All MCP Tools](docs/ALL_MCP_TOOLS.md)
- [Deployment Guide](docs/deployment/)
- [Database Setup](docs/backend/DATABASE_SETUP.md)
- [SSE Streaming](docs/backend/SSE_STREAMING.md)
- [Client Integration](docs/backend/CLIENT_INTEGRATION.md)
- [Security](docs/security/SECURITY.md)
- [Testing](docs/testing/)

Full index: [docs/README.md](docs/README.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

For reporting vulnerabilities, see [SECURITY.md](docs/security/SECURITY.md).

## License

[MIT](LICENSE)
