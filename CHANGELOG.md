# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Open-source release preparation (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT)
- `.env.example` files for all workspaces
- Comprehensive developer documentation (100+ docs)

### Architecture
- **Triple transport system**: MCP stdio, HTTP API, SSE for all servers
- **Unified Gateway**: 45 MCP tools aggregated behind single endpoint
- **Three MCP servers**: backend (court cases), rada (parliament), openreyestr (business registry)
- **Web frontend**: React 19 + Vite + TailwindCSS
- **Shared package**: Common TypeScript utilities, LLM managers, cost tracking

### Services
- Semantic search over Ukrainian court decisions
- Legislation retrieval with intelligent article-level sectioning
- Parliament data: deputies, bills, voting records
- Business registry lookups (EDRPOU, beneficiaries)
- Document vault with encryption
- Legal pattern storage and retrieval
- Citation validation and hallucination guard
- Cost tracking per request (OpenAI/Anthropic)
- Monobank payment integration (UAH)
- NOWPayments crypto integration
- Diia digital signature integration
