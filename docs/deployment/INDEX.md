# Deployment Files Index

Index of deployment-related files and documentation.

> **Current model:** Only **local** and **prod** environments. Deploy to prod via CI/CD (merge PR to main, blue-green deploy). No staging environment.

## Quick Navigation

- **Local Development**: [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md) - Start here for local development
- **Deployment Overview**: [`README.md`](./README.md) - How deployment works
- **Architecture**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) - System architecture (historical multi-env reference)

## Docker Compose Files

| File | Purpose | Location |
|------|---------|----------|
| `docker-compose.local.yml` | Local development | Your machine |
| `docker-compose.prod.yml` | Production environment | Prod server |
| `docker-compose.gateway.yml` | Nginx gateway proxy | Prod server |
| `docker-compose.stage.yml` | **Historical** (stage env removed) | N/A |

## Environment Variables

- `.env.local.example` - Local development variables template
- `.env.prod.example` - Production environment variables template

Copy `.env.*.example` to `.env.*` and fill in real values before starting.

## CI/CD

- `.github/workflows/deploy-prod.yml` - Production deploy pipeline (blue-green)
- `.github/workflows/ci-local-deploy.yml` - CI build & test

## Port Reference

| Environment | Backend | Frontend | PostgreSQL | Redis | Qdrant |
|------------|---------|----------|------------|-------|---------|
| **Local** | 3000 | 5173 | 5432 | 6379 | 6333-6334 |
| **Production** | 3000 (internal) | 8090 | 5438 (host) | 6379 | 6333-6334 |

## Getting Started

**For Local Development:**
1. Read [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md)
2. Copy `.env.local.example` to `.env.local`
3. Add your `OPENAI_API_KEY`
4. Run `docker compose -f docker-compose.local.yml --env-file .env.local up -d`

**For Production Deploy:**
1. Create PR to `main`
2. Get approval and merge
3. CI/CD handles the rest (blue-green deploy)

---

**Updated**: 2026-03-28
