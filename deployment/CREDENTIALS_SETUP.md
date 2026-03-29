# Credentials Setup Guide

How to configure credentials for SecondLayer local development.

## Quick Setup

```bash
cd deployment
cp .env.local.example .env.local
nano .env.local
```

## Required Variables

### PostgreSQL

```bash
POSTGRES_USER=secondlayer              # Application database user
POSTGRES_PASSWORD=your_password_here   # Application user password
POSTGRES_DB=secondlayer_local          # Database name
```

The `migrate-local` container runs migrations automatically on startup. No manual database setup is needed.

### API Keys

```bash
OPENAI_API_KEY=sk-proj-your-key       # OpenAI API (required)
SECONDARY_LAYER_KEYS=local-dev-key    # API authentication tokens (comma-separated)
JWT_SECRET=your-64-char-secret        # JWT signing secret
```

### Optional

```bash
ANTHROPIC_API_KEY=sk-ant-your-key     # Claude AI (multi-provider)
REDIS_PASSWORD=local_redis_pass       # Redis password
QDRANT_API_KEY=local_qdrant_key       # Qdrant API key

# Google OAuth (not needed for local API key auth)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

## How Database Initialization Works

1. `postgres-local` container starts with `POSTGRES_USER` and `POSTGRES_PASSWORD`
2. `rada-db-init-local` creates the RADA schema and user
3. `migrate-local` runs all SQL migrations from `mcp_backend/src/migrations/`
4. `seed-admin-local` creates the admin user
5. `seed-test-user-local` creates a test user

All init containers run once and exit. Check their logs if something fails:

```bash
docker logs secondlayer-migrate-local
docker logs rada-db-init-local
docker logs secondlayer-seed-admin-local
```

## Verify Database

```bash
# Check PostgreSQL is ready
docker exec secondlayer-postgres-local pg_isready -U secondlayer

# Connect and check tables
PGPASSWORD=your_password psql -h localhost -U secondlayer -d secondlayer_local -c "\dt"

# Or via docker exec
docker exec -it secondlayer-postgres-local psql -U secondlayer -d secondlayer_local -c "\dt"
```

## Troubleshooting

### "password authentication failed"

The password in `.env.local` must match what PostgreSQL was initialized with. If you changed the password after first start:

```bash
# Reset: delete volume and restart
./manage-gateway.sh stop local
docker volume rm deployment_postgres_local_data
./manage-gateway.sh start local
```

### Migration failures

```bash
# Check migration logs
docker logs secondlayer-migrate-local

# Re-run migrations
docker compose -f docker-compose.local.yml --env-file .env.local up migrate-local --force-recreate
```

## Security Notes

- Never commit `.env.local` or `.env.prod` to git (already in `.gitignore`)
- Use strong passwords for production (managed via CI/CD secrets)
- Local dev can use simple passwords for convenience
- Production credentials are injected by GitHub Actions secrets, not stored in files on the server
