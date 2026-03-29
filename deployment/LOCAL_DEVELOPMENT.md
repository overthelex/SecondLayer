# Local Development Guide

Quick start guide for running SecondLayer on your local development machine.

## Overview

The local environment runs all services in Docker, including frontend behind nginx with TLS:
- **HTTPS access**: `https://local.legal.org.ua` (self-signed TLS via mkcert)
- **Hot reload**: Frontend (Vite) runs in Docker with hot module replacement
- **All services**: PostgreSQL, Redis, Qdrant, Backend API, RADA MCP, OpenReyestr, Document Service
- **Auto-migrations**: Database migrations run automatically on startup
- **Nginx reverse proxy**: Same architecture as production

## Prerequisites

```bash
# Docker 24+ with Compose V2
docker --version
docker compose version

# Node.js 20+ (for shared package builds)
node --version
```

## Quick Start

### 1. Configure Environment

```bash
cd deployment

# Copy environment template
cp .env.local.example .env.local

# Edit and add your API keys
nano .env.local
```

**Minimum required:**
- `OPENAI_API_KEY` - OpenAI API key
- `POSTGRES_PASSWORD` - Database password

### 2. Start Services

```bash
cd deployment

# Start all services (builds images, runs migrations, starts containers)
./manage-gateway.sh start local

# Check status
./manage-gateway.sh status
```

### 3. Access Application

- **Application**: https://local.legal.org.ua (frontend + API via nginx)
- **Backend API direct**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Local Development Environment (Docker)                    │
└────────────────────────────────────────────────────────────┘

  Browser
    │
    ▼
┌──────────────────────────┐
│  nginx-local (TLS)       │
│  https://local.legal.org.ua
└──────────┬───────────────┘
           │
     ┌─────┴──────────────────────────┐
     │                                │
     ▼                                ▼
┌──────────────────┐    ┌──────────────────────┐
│  lexwebapp-local │    │  secondlayer-app-local│
│  Vite Dev Server │    │  Backend API (:3000)  │
└──────────────────┘    └──────────┬────────────┘
                                   │
                        ┌──────────┼──────────────┐
                        │          │              │
                        ▼          ▼              ▼
                   PostgreSQL    Redis         Qdrant
                    (:5432)     (:6379)       (:6333)

Optional services (profiles):
  - rada-mcp-app-local (:3001) — Parliament data
  - openreyestr-app-local (:3005) — Business registry
  - document-service-local (:3002) — OCR/PDF processing
```

## Port Reference

| Service | Port | Container Name |
|---------|------|----------------|
| Nginx (HTTPS) | 443 | nginx-local |
| Backend API | 3000 | secondlayer-app-local |
| Document Service | 3002 | document-service-local |
| RADA MCP | 3001 | rada-mcp-app-local |
| OpenReyestr | 3005 | openreyestr-app-local |
| PostgreSQL | 5432 | secondlayer-postgres-local |
| Redis | 6379 | secondlayer-redis-local |
| Qdrant HTTP | 6333 | secondlayer-qdrant-local |
| Qdrant gRPC | 6334 | secondlayer-qdrant-local |
| MinIO | 9000/9001 | minio-local |

## Common Commands

### Environment Management

```bash
cd deployment

# Start local environment
./manage-gateway.sh start local

# Stop local environment
./manage-gateway.sh stop local

# Restart local environment
./manage-gateway.sh restart local

# View logs (all services)
./manage-gateway.sh logs local

# View specific service logs
docker logs -f secondlayer-app-local      # Backend
docker logs -f lexwebapp-local            # Frontend (Vite)
docker logs -f nginx-local                # Nginx
docker logs -f secondlayer-postgres-local # Database
docker logs -f secondlayer-redis-local    # Cache
docker logs -f secondlayer-qdrant-local   # Vector DB

# Check status
./manage-gateway.sh status

# Health checks
curl http://localhost:3000/health         # Main backend
curl http://localhost:3001/health         # RADA MCP
curl http://localhost:3005/health         # OpenReyestr
```

### Database Operations

```bash
# Connect to PostgreSQL
PGPASSWORD=local_dev_password psql -h localhost -U secondlayer -d secondlayer_local

# Migrations run automatically on startup via migrate-local service
# To manually re-run migrations:
docker compose -f docker-compose.local.yml --env-file .env.local up migrate-local

# View tables
docker exec -it secondlayer-postgres-local psql -U secondlayer -d secondlayer_local -c "\dt"

# View migration logs
docker logs secondlayer-migrate-local
```

### Frontend Development

The frontend (lexwebapp) runs inside Docker with Vite hot reload:

```bash
# Logs from Vite dev server
docker logs -f lexwebapp-local

# If you need to run frontend commands locally:
cd lexwebapp
npm install --legacy-peer-deps
npm run dev          # Local dev server (outside Docker)
npm run build        # Production build
npm run test         # Vitest
npm run lint
```

### Backend Development

```bash
cd mcp_backend
npm run build        # Build TypeScript
npm run dev:http     # Dev mode with nodemon (outside Docker)
npm test             # Jest tests
npm run lint
```

After backend code changes, rebuild and restart:

```bash
cd deployment
docker compose -f docker-compose.local.yml --env-file .env.local build app-local
docker compose -f docker-compose.local.yml --env-file .env.local up -d app-local
```

## Environment Variables

### Essential Configuration

Copy `.env.local.example` to `.env.local` and configure:

```bash
# OpenAI API (REQUIRED)
OPENAI_API_KEY=sk-proj-your-key-here

# Database
POSTGRES_PASSWORD=local_dev_password_CHANGE_ME

# JWT Secret
JWT_SECRET=your-64-char-secret-here

# API authentication
SECONDARY_LAYER_KEYS=local-dev-key,test-key-123
```

### Optional Configuration

```bash
# Anthropic/Claude (multi-provider support)
ANTHROPIC_API_KEY=sk-ant-your-key-here
LLM_PROVIDER_STRATEGY=openai-first

# Google OAuth (optional for local dev)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Model selection (cost optimization)
OPENAI_MODEL_QUICK=gpt-4o-mini
OPENAI_MODEL_STANDARD=gpt-4o-mini
OPENAI_MODEL_DEEP=gpt-4o
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using a port
ss -tlnp | grep 3000
ss -tlnp | grep 5432

# Stop local environment cleanly
./manage-gateway.sh stop local
```

### Services Not Starting

```bash
# View detailed logs
docker logs secondlayer-app-local

# Check container status
docker ps --filter "name=-local" --format "table {{.Names}}\t{{.Status}}"

# Full rebuild
./manage-gateway.sh deploy local --no-cache
```

### Database Connection Issues

```bash
# Check if PostgreSQL is ready
docker exec secondlayer-postgres-local pg_isready -U secondlayer

# Reset database (WARNING: deletes all data)
./manage-gateway.sh stop local
docker volume rm deployment_postgres_local_data
./manage-gateway.sh start local
```

### Migration Failures

```bash
# Check migration logs
docker logs secondlayer-migrate-local

# Manually re-run migrations
docker compose -f docker-compose.local.yml --env-file .env.local up migrate-local --force-recreate
```

### Frontend Not Loading

```bash
# Check nginx is running
docker ps --filter "name=nginx-local"

# Check Vite dev server
docker logs -f lexwebapp-local

# Verify TLS certificates exist
ls deployment/nginx/certs/
```

## Clean Slate Reset

```bash
cd deployment

# Stop all local services
./manage-gateway.sh stop local

# Remove all local volumes (WARNING: deletes all data!)
docker volume ls | grep local | awk '{print $2}' | xargs -r docker volume rm

# Start fresh
./manage-gateway.sh start local
```

## Environment Comparison

| Feature | Local | Production |
|---------|-------|------------|
| **Location** | Your machine | AWS EC2 |
| **Domain** | local.legal.org.ua | legal.org.ua |
| **TLS** | Self-signed (mkcert) | Cloudflare |
| **Deploy method** | `manage-gateway.sh start local` | CI/CD (merge PR to main) |
| **Blue-green** | No | Yes (.active-colors) |
| **Hot reload** | Yes (Vite in Docker) | No |
| **Database** | secondlayer_local | secondlayer_prod |

## Deploying to Production

Production deployment is fully automated via CI/CD:

1. Create a feature branch and make changes
2. Open a Pull Request to `main`
3. Get review approval and merge
4. CI pipeline (`ci-local-deploy.yml`) builds and tests on self-hosted runner
5. Deploy pipeline (`deploy-prod.yml`) does blue-green deployment to prod
6. Preview is available at `preview.legal.org.ua` before promotion
7. After approval, traffic switches to new containers

Never manually recreate production containers or SSH to prod for deployments.

See `.github/workflows/deploy-prod.yml` for the full pipeline.

## Testing

```bash
# Backend tests
cd mcp_backend && npm test

# Frontend tests
cd lexwebapp && npm test

# Specific test file
cd mcp_backend && npx jest --no-cache path/to/file.test.ts

# E2E tests
cd tests && npx playwright test
```

See `TESTING.md` for complete testing documentation.
