# SecondLayer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-SDK-6E56CF)](https://modelcontextprotocol.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**AI-powered legal tech platform for Ukrainian law.** Court decision search, legislation retrieval, parliament data, business registries, open data registries, ECHR practice, and more — all exposed as [MCP](https://modelcontextprotocol.io/) tools for LLM integration.

## Overview

SecondLayer is a monorepo containing three MCP (Model Context Protocol) servers, a web frontend, and shared utilities. It provides **95+ AI-powered tools** for legal research and analysis.

### What it does

- **Court decisions** — search, full-text retrieval, and semantic analysis over the Ukrainian court registry (EDRSR)
- **Legislation** — retrieval with intelligent article-level sectioning (Constitution, codes, laws)
- **Parliament data** — deputies, bills, voting records from Verkhovna Rada
- **Business registry** — entity search, beneficiaries, debtors, bankruptcy, enforcement proceedings (EDRPOU/OpenReyestr)
- **Open data registries** — sanctions, corruption register, patents, trademarks, lawyers, judges, court experts, public spending, NBU banks, wage debtors, and more
- **ECHR practice** — search and retrieval of European Court of Human Rights case law
- **Spain legal tools** — BOE legislation and AEPD data protection resolutions
- **Procedural tools** — deadline calculation, monetary claims, checklists, norm search
- **Legal advice** — precedent search, citation graphs, similar reasoning, answer formatting
- **Payments** — Monobank integration for UAH/USD billing
- **Diia integration** — digital identity verification via Diia (Ukrainian digital services platform)

### Architecture

All three MCP servers support a triple transport system:

| Transport | Use case |
|-----------|----------|
| **MCP stdio** | Local integration with Claude Desktop, Cursor, etc. |
| **HTTP API** | Web apps, REST clients |
| **SSE** | Remote MCP over HTTPS for distributed clients |

```
┌──────────────────────────────────────────────────────┐
│                     Clients                           │
│  Claude Desktop  │  Web App  │  Remote MCP            │
└────────┬─────────┴─────┬─────┴────────┬──────────────┘
         │ stdio         │ HTTP        │ SSE
┌────────┴───────────────┴─────────────┴───────────────┐
│              Unified Gateway (95+ tools)              │
├──────────────────┬──────────────┬─────────────────────┤
│  mcp_backend     │  mcp_rada    │  mcp_openreyestr    │
│  64 tools        │  4 tools     │  27 tools           │
├──────────────────┴──────────────┴─────────────────────┤
│  PostgreSQL  │  Redis  │  Qdrant  │  OpenAI API       │
└──────────────────────────────────────────────────────┘
```

### Deployment

- **Production**: `https://legal.org.ua` — blue-green deployment via CI/CD (merge PR to `main`)
- **Local dev**: Docker Compose
- CI/CD runs on a self-hosted GitHub Actions runner; deploy pipeline auto-detects changed services

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
git clone https://github.com/overthelex/secondlayer.git
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
cp deployment/.env.local.example deployment/.env.local
```

At minimum, set `OPENAI_API_KEY`, `POSTGRES_*`, and `SECONDARY_LAYER_KEYS`.

### Run with Docker (recommended)

```bash
cd deployment
docker compose -f docker-compose.local.yml --env-file .env.local up -d
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
├── mcp_backend/        # Primary MCP server — court decisions, legislation, registries, payments
├── mcp_rada/           # Parliament data — deputies, bills, voting
├── mcp_openreyestr/    # Business registry — entities, beneficiaries, enforcement
├── lexwebapp/          # Web frontend (React 19, Vite, TailwindCSS)
├── packages/shared/    # Shared TypeScript types and utilities
├── deployment/         # Docker configs, compose files, nginx, CI/CD scripts
├── scripts/            # Data import and utility scripts
├── tests/              # E2E tests (Playwright)
├── docs/               # Documentation
└── legacy/             # Archived code (not in active use)
```

### Key Technologies

| Layer | Stack |
|-------|-------|
| **Runtime** | Node.js 20, TypeScript 5.3 |
| **Backend** | Express.js, MCP SDK |
| **Frontend** | React 19, Vite, TailwindCSS 3, Zustand, TanStack Query |
| **Databases** | PostgreSQL 15, Redis 7, Qdrant |
| **AI** | OpenAI (GPT-4o, embeddings), optional Anthropic |
| **Payments** | Monobank (UAH/USD) |
| **Auth** | Google OAuth, Diia, JWT |
| **Infra** | Docker Compose, nginx, GitHub Actions (self-hosted runner) |
| **Deploy** | Blue-green deployment via CI/CD |

## MCP Tools (95+)

### Backend (64 tools)
Court decision search (EDRSR), full-text retrieval, semantic search, legislation, ECHR practice, procedural tools (deadlines, checklists, monetary claims), legal advice (precedents, citation graphs), open data registries (sanctions, corruption, patents, trademarks, lawyers, judges, spending, NBU banks, etc.), court sessions, case status, Spain legal tools, Nextcloud integration, import management.

### RADA (4 tools)
Deputies, bills, legislation text, voting records from Verkhovna Rada Open Data API.

### OpenReyestr (27 tools)
Entity search by name/EDRPOU, entity details, beneficiaries, debtors, bankruptcy cases, enforcement proceedings, arbitration managers, ARMA seized assets, ESV debt, tax debt, single tax payers, VAT payers, notaries, court experts, forensic methods, NAZK declarations, legal acts, Prozorro procurement, RNBO sanctions, special forms, streets, street renamings, administrative units, exchange data, statistics.

Full tool list: [docs/ALL_MCP_TOOLS.md](docs/ALL_MCP_TOOLS.md)

## API Usage

### HTTP API

```bash
# List available tools
curl http://localhost:3000/api/tools

# Execute a tool
curl -X POST http://localhost:3000/api/tools/search_edrsr_decisions \
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
