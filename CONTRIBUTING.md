# Contributing to SecondLayer

Thank you for your interest in contributing to SecondLayer! This guide will help you get started.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies**: `npm run install:all`
3. **Set up environment**: Copy `.env.example` files in each workspace to `.env` and configure
4. **Start services**: See [docs/guides/START_HERE.md](docs/guides/START_HERE.md) for full setup

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run the TypeScript build to verify no type errors:
   ```bash
   cd packages/shared && npm run build
   cd mcp_backend && npm run build
   ```
4. Run tests:
   ```bash
   cd mcp_backend && npm test
   cd lexwebapp && npm run test
   ```
5. Commit with a descriptive message
6. Push and create a Pull Request against `main`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what and why
- Ensure all builds pass and tests are green
- Update documentation if your change affects public APIs or setup

## Code Style

- **Language**: TypeScript throughout the monorepo
- **UI text**: Ukrainian (uk-UA) for all user-facing strings
- **SQL**: Use parameterized queries or double-dollar quoting in JS string literals
- **Migrations**: Always use `IF NOT EXISTS` / `CREATE OR REPLACE` for idempotency

## Project Structure

```
SecondLayer/
├── mcp_backend/        # Primary MCP server (court decisions, legislation, registries, payments)
├── mcp_rada/           # Parliament data server (deputies, bills, voting)
├── mcp_openreyestr/    # State Register server (entities, beneficiaries, enforcement)
├── lexwebapp/          # Web frontend (React 19, Vite, TailwindCSS)
├── packages/shared/    # Shared TypeScript utilities
├── deployment/         # Docker, nginx, CI/CD scripts
├── tests/              # E2E tests (Playwright)
└── scripts/            # Utility and data import scripts
```

## Adding a New MCP Tool

1. Define tool schema in `mcp_backend/src/api/`
2. Implement handler method
3. Register in `getTools()` and `src/api/tool-registry.ts`
4. Add HTTP route in `http-server.ts` if needed
5. Write tests in `src/api/__tests__/`

## Reporting Issues

- Use [GitHub Issues](../../issues) for bug reports and feature requests
- Include reproduction steps, expected vs actual behavior
- For security vulnerabilities, see [SECURITY.md](docs/security/SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
