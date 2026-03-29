# Quick Start: Local Development

## 5-Minute Setup

```bash
cd deployment

# 1. Create environment file from template
cp .env.local.example .env.local

# 2. Set required credentials
nano .env.local
# Required: OPENAI_API_KEY, POSTGRES_PASSWORD

# 3. Start all services
./manage-gateway.sh start local

# 4. Open application
# https://local.legal.org.ua
```

## Verify It Works

```bash
# Check all containers are running
docker ps --filter "name=-local" --format "table {{.Names}}\t{{.Status}}"

# Backend health check
curl http://localhost:3000/health

# Database connection
docker exec secondlayer-postgres-local pg_isready -U secondlayer
```

## Required Credentials

Edit `.env.local` and set:

```bash
# PostgreSQL
POSTGRES_PASSWORD=your_password_here

# OpenAI API
OPENAI_API_KEY=sk-proj-your-key-here

# API authentication
SECONDARY_LAYER_KEYS=local-dev-key
JWT_SECRET=your-64-char-secret-here
```

Database initialization (user creation, migrations) happens automatically on first start.

## Common Commands

```bash
cd deployment

# Start/stop/restart
./manage-gateway.sh start local
./manage-gateway.sh stop local
./manage-gateway.sh restart local

# Logs
./manage-gateway.sh logs local
docker logs -f secondlayer-app-local    # Backend only

# Status
./manage-gateway.sh status

# Full rebuild (after code changes)
./manage-gateway.sh deploy local --no-cache
```

## If Something Goes Wrong

```bash
# 1. Check logs
docker logs secondlayer-app-local
docker logs secondlayer-postgres-local

# 2. Check container status
docker ps --filter "name=-local" --format "table {{.Names}}\t{{.Status}}"

# 3. Reset everything (WARNING: deletes all data)
./manage-gateway.sh stop local
docker volume ls | grep local | awk '{print $2}' | xargs -r docker volume rm
./manage-gateway.sh start local
```

## Next Steps

- Full guide: `LOCAL_DEVELOPMENT.md`
- Testing: `TESTING.md`
- Credentials details: `CREDENTIALS_SETUP.md`
- Production deployment: see CI/CD in `.github/workflows/deploy-prod.yml`
