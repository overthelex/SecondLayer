# Testing Guide

How to run tests for SecondLayer services.

## Quick Start

```bash
# Backend unit tests
cd mcp_backend && npm test

# Frontend tests
cd lexwebapp && npm test

# E2E tests
cd tests && npx playwright test
```

## Prerequisites

Local services must be running for integration tests:

```bash
cd deployment
./manage-gateway.sh start local

# Verify services are healthy
curl http://localhost:3000/health   # Main backend
curl http://localhost:3001/health   # RADA MCP
curl http://localhost:3005/health   # OpenReyestr
```

## Test Suites

### Backend (mcp_backend) - Jest

```bash
cd mcp_backend

# All tests
npm test

# Specific test file
npx jest --no-cache src/api/__tests__/specific-test.test.ts

# Tests with coverage
npm test -- --coverage

# Watch mode
npx jest --watch
```

**Test categories:**
- `src/controllers/__tests__/` - Controller unit tests
- `src/middleware/__tests__/` - Middleware tests
- `src/adapters/__tests__/` - Adapter tests
- `src/services/__tests__/` - Service tests
- `src/api/__tests__/` - API integration tests

**Jest config:** `maxWorkers=1`, `testTimeout=120000` (tests may call external APIs).

### Frontend (lexwebapp) - Vitest

```bash
cd lexwebapp

# All tests
npm test

# Specific test
npx vitest run src/components/specific.test.ts

# Watch mode
npx vitest

# Coverage
npm run test:coverage
```

### RADA MCP (mcp_rada) - Jest

```bash
cd mcp_rada

# All tests
npm test

# Specific test
npx jest --no-cache path/to/test.test.ts
```

### OpenReyestr (mcp_openreyestr) - Jest

```bash
cd mcp_openreyestr
npm test
```

### E2E Tests - Playwright

```bash
cd tests
npx playwright test

# Specific test
npx playwright test e2e/specific-test.spec.ts

# With UI
npx playwright test --ui
```

## Environment Variables for Tests

Tests that hit running services need these:

```bash
# Backend
TEST_BASE_URL=http://localhost:3000
TEST_API_KEY=test-key-123

# RADA
RADA_TEST_BASE_URL=http://localhost:3001
RADA_TEST_API_KEY=test-key-123

# Database (direct access)
DATABASE_URL=postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local
```

Ensure `SECONDARY_LAYER_KEYS` in `.env.local` includes `test-key-123`.

## CI/CD Tests

Tests run automatically in the CI pipeline:

1. **On push to main** (`ci-local-deploy.yml`):
   - Builds shared package
   - Builds and tests backend (controller, middleware, adapter, service tests)
   - Builds and tests frontend (Vitest)
   - Runs on self-hosted runner

2. **Before prod deploy** (`deploy-prod.yml`):
   - Same test suite as CI
   - If tests fail, self-heal agent attempts auto-fix
   - Deployment blocked until tests pass

## Running Tests Inside Docker

```bash
# Backend
docker exec -it secondlayer-app-local npm test

# Specific test
docker exec -it secondlayer-app-local npx jest --no-cache src/api/__tests__/smoke-test.test.ts
```

## Troubleshooting

### Tests Timeout

Increase timeout or check external API connectivity:

```bash
# Run with longer timeout
npx jest --no-cache --testTimeout=300000 path/to/test.test.ts
```

### API Key Authentication Errors

Ensure test API key is in the allowed list:

```bash
# In deployment/.env.local
SECONDARY_LAYER_KEYS=local-dev-key,test-key-123
```

### Database Connection Issues

```bash
docker exec secondlayer-postgres-local pg_isready -U secondlayer
docker logs secondlayer-postgres-local
```
