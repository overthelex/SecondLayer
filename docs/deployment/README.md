# SecondLayer Deployment

## Environments

Only two environments exist:

| Environment | URL | Purpose |
|------------|-----|---------|
| **Local** | `http://localhost:3000` | Development on your machine |
| **Production** | `https://legal.org.ua/` | Live system |

There is **no staging environment**.

## Deployment to Production

Production deploys via **CI/CD only** (never manual SSH):

1. Create a feature branch from `main`
2. Push changes and create a Pull Request
3. Merge PR to `main` (requires approval)
4. CI/CD pipeline (self-hosted runner) automatically:
   - Detects changed services
   - Builds Docker images
   - Deploys via blue-green pattern (inactive color first)
   - After approval, switches production traffic to new color

See `.github/workflows/deploy-prod.yml` for the full pipeline.

### Blue-Green Deployment

Production uses blue-green deployment pattern:
- Two sets of containers (blue and green)
- `.active-colors` file tracks which color is currently serving traffic
- New deploys go to the inactive color, then traffic is switched
- Nginx must be `--force-recreated` after any upstream/backend change

## Local Development

```bash
cd deployment

# Copy environment template
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Start all services
docker compose -f docker-compose.local.yml --env-file .env.local up -d

# Or use the management script
./manage-gateway.sh start local
```

Standard local ports: PostgreSQL (5432), Redis (6379), Qdrant (6333-6334), Backend (3000), Frontend (5173).

See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for details.

## Docker Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.local.yml` | Local development |
| `docker-compose.prod.yml` | Production environment |
| `docker-compose.gateway.yml` | Nginx gateway |

## Key Notes

- Never push directly to `main` -- all changes go through PRs
- Never manually recreate production containers -- use the deploy pipeline
- After code changes, always rebuild Docker images before testing
- SSH to prod as `ubuntu` (alias: `ssh prod`)
