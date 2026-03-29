# Lexwebapp Documentation Index

Complete documentation for the lexwebapp frontend.

---

## Quick Start

**New to the project?** Start here:

1. **[QUICK_START.md](QUICK_START.md)** - Get running in 5 minutes
2. **[MCP_STREAMING_INTEGRATION.md](MCP_STREAMING_INTEGRATION.md)** - Complete streaming integration guide

---

## Documentation by Category

### Getting Started

| Document | Description | Audience |
|----------|-------------|----------|
| [QUICK_START.md](QUICK_START.md) | 5-minute quick start guide | Developers |
| [../README.md](../README.md) | Project overview, structure, scripts | All |

### Developer Guides

| Document | Description |
|----------|-------------|
| [MCP_STREAMING_INTEGRATION.md](MCP_STREAMING_INTEGRATION.md) | Complete SSE streaming integration guide |
| [../src/__tests__/README.md](../src/__tests__/README.md) | Testing guide and patterns |

### API Reference

| Document | Description |
|----------|-------------|
| [../../docs/ALL_MCP_TOOLS.md](../../docs/ALL_MCP_TOOLS.md) | All 45 MCP tools reference |
| [../../mcp_backend/docs/api-explorer.html](../../mcp_backend/docs/api-explorer.html) | Interactive API explorer |

### Architecture

| Document | Description |
|----------|-------------|
| [MCP_STREAMING_INTEGRATION.md#architecture](MCP_STREAMING_INTEGRATION.md#architecture) | Frontend streaming architecture |
| [../../docs/MCP_CLIENT_INTEGRATION_GUIDE.md](../../docs/MCP_CLIENT_INTEGRATION_GUIDE.md) | Client integration patterns |

### Deployment

| Document | Description |
|----------|-------------|
| [../../deployment/LOCAL_DEVELOPMENT.md](../../deployment/LOCAL_DEVELOPMENT.md) | Local dev setup |
| [../../deployment/GATEWAY_SETUP.md](../../deployment/GATEWAY_SETUP.md) | Gateway configuration |

### Backend Docs

| Document | Description |
|----------|-------------|
| [../../mcp_backend/docs/SSE_STREAMING.md](../../mcp_backend/docs/SSE_STREAMING.md) | SSE protocol docs |
| [../../mcp_backend/docs/CLIENT_INTEGRATION.md](../../mcp_backend/docs/CLIENT_INTEGRATION.md) | Backend integration |

---

## Reading Paths

### Path 1: Developer Onboarding

1. Read: [QUICK_START.md](QUICK_START.md)
2. Skim: [MCP_STREAMING_INTEGRATION.md](MCP_STREAMING_INTEGRATION.md)
3. Code: Follow usage examples
4. Test: Run `npm test`
5. Reference: [API Explorer](../../mcp_backend/docs/api-explorer.html)

### Path 2: Integration Implementation

1. Read: [MCP_STREAMING_INTEGRATION.md#usage-examples](MCP_STREAMING_INTEGRATION.md#usage-examples)
2. Reference: [API Reference](MCP_STREAMING_INTEGRATION.md#api-reference)
3. Code: Use `useMCPTool` hook
4. Test: Write unit tests

### Path 3: Deployment

1. Configure: Environment variables (`.env.local` for local, `.env.production` for prod)
2. Build: `npm run build`
3. Test: `npm test`
4. Deploy: Via CI/CD (merge PR to main)

### Path 4: Troubleshooting

1. Check: [MCP_STREAMING_INTEGRATION.md#troubleshooting](MCP_STREAMING_INTEGRATION.md#troubleshooting)
2. Debug: Browser console + network tab
3. Test: Backend with curl
4. Verify: Environment variables

---

## Finding Information

### By Topic

| Topic | Document | Section |
|-------|----------|---------|
| **SSE Streaming** | MCP_STREAMING_INTEGRATION.md | Architecture |
| **All Tools** | ../../docs/ALL_MCP_TOOLS.md | Full list |
| **Hook Usage** | MCP_STREAMING_INTEGRATION.md | Usage Examples |
| **Testing** | src/__tests__/README.md | All sections |
| **Troubleshooting** | MCP_STREAMING_INTEGRATION.md | Troubleshooting |
| **API Reference** | MCP_STREAMING_INTEGRATION.md | API Reference |

### By File

| File/Component | Document | Section |
|----------------|----------|---------|
| SSEClient.ts | MCP_STREAMING_INTEGRATION.md | Core Components |
| MCPService.ts | MCP_STREAMING_INTEGRATION.md | Core Components |
| useMCPTool.ts | MCP_STREAMING_INTEGRATION.md | Core Components |
| chatStore.ts | MCP_STREAMING_INTEGRATION.md | Core Components |

---

## External Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/)

### Related Projects

- [MCP Backend](../../mcp_backend/README.md)
- [RADA Server](../../mcp_rada/README.md)
- [OpenReyestr](../../mcp_openreyestr/README.md)

---

**Last Updated:** 2026-03-28
