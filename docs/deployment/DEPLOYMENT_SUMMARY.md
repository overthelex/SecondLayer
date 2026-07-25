# SecondLayer Deployment Summary

## Current Deployment System

### Active Environments

- **Local**: `http://localhost:3000` (development)
- **Production**: `https://legal.org.ua/` (blue-green deploy via CI/CD)

There is **no staging environment**.

### Deployment Method

Production deploys via CI/CD pipeline only (merge PR to main):
- Pipeline: `.github/workflows/deploy-prod.yml`
- Runner: self-hosted (local.legal.org.ua)
- Pattern: blue-green deployment
- Never deploy manually via SSH

### Quick Commands

#### Local Development

```bash
cd deployment
docker compose -f docker-compose.local.yml --env-file .env.local up -d
```

#### Production Deploy

1. Create PR to `main`
2. Get approval and merge
3. CI/CD handles the rest automatically

### Documentation Index

- `deployment/README.md` - Deployment overview
- `deployment/LOCAL_DEVELOPMENT.md` - Local development setup
- `.github/workflows/deploy-prod.yml` - CI/CD pipeline
