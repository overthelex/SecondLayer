> **ARCHIVED:** This document describes a historical 4-environment setup. Current deployment: only local and prod with CI/CD blue-green deploy. No stage/dev gateway environments.

# Multi-Environment Setup Complete (Historical)

## Summary

Successfully created a comprehensive 4-environment deployment structure for SecondLayer:

1. **Local** - Developer workstations (your machine)
2. **Development** - Testing on gate server
3. **Staging** - Pre-production on gate server
4. **Production** - Live system on gate server

## What Was Created

### New Files

| File | Purpose | Lines |
|------|---------|-------|
| `docker-compose.local.yml` | Local dev environment configuration | 193 |
| `.env.local.example` | Local environment variables template | 73 |
| `LOCAL_DEVELOPMENT.md` | Complete local dev guide | 593 |
| `ENVIRONMENTS_SETUP_COMPLETE.md` | This summary document | - |

### Modified Files

| File | Changes |
|------|---------|
| `manage-gateway.sh` | Added local environment support to all commands |
| `INDEX.md` | Updated to reflect 4-environment structure |

## Environment Comparison

| Feature | Local | Dev | Stage | Prod |
|---------|-------|-----|-------|------|
| **Location** | Your machine | Gate server | Gate server | Gate server |
| **Purpose** | Development | Testing | Pre-prod | Production |
| **Backend Port** | 3000 | 3003 | 3002 | 3001 |
| **Frontend Port** | 5173 | 8091 | 8092 | 8090 |
| **PostgreSQL** | 5432 | 5433 | 5434 | 5432 |
| **Redis** | 6379 | 6380 | 6381 | 6379 |
| **Qdrant** | 6333-6334 | 6335-6336 | 6337-6338 | 6333-6334 |
| **URL** | localhost:3000 | legal.org.ua/development | legal.org.ua/staging | legal.org.ua |
| **Gateway** | No | Yes (nginx) | Yes (nginx) | Yes (nginx) |
| **Hot Reload** | Yes (frontend) | No | No | No |
| **OAuth** | Optional | Yes | Yes | Yes |
| **Database** | secondlayer_local | secondlayer_dev | secondlayer_stage | secondlayer_db |
| **Use Case** | Active development | Feature testing | QA/Pre-release | Live users |

## Quick Start Commands

### For Developers (Local)

```bash
cd deployment

# Setup (first time)
cp .env.local.example .env.local
# Edit .env.local and add your API keys

# Start backend services
./manage-gateway.sh start local

# Start frontend (separate terminal)
cd ../frontend
npm run dev

# Access
open http://localhost:5173
```

### For DevOps (Gateway Environments)

```bash
cd deployment

# Setup (first time)
cp .env.dev.example .env.dev
cp .env.stage.example .env.stage
cp .env.prod.example .env.prod
# Edit each .env file with environment-specific values

# Build and deploy
./manage-gateway.sh build
./manage-gateway.sh deploy all
./manage-gateway.sh gateway start

# Access
open https://dev.legal.org.ua
open https://stage.legal.org.ua
open https://legal.org.ua
```

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                    Local Development                        │
│                    (Your Machine)                           │
│                                                             │
│  ┌──────────────┐         ┌──────────────────────┐         │
│  │   Frontend   │────────►│   Backend Services   │         │
│  │  (Vite Dev)  │   API   │      (Docker)        │         │
│  │  Port 5173   │         │   • App (3000)       │         │
│  └──────────────┘         │   • PostgreSQL       │         │
│                           │   • Redis            │         │
│                           │   • Qdrant           │         │
│                           └──────────────────────┘         │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│              Gateway Environments (Gate Server)             │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │           System Nginx (SSL)                    │       │
│  │           https://legal.org.ua                  │       │
│  └────────────┬─────────┬────────────┬─────────────┘       │
│               │         │            │                     │
│  ┌────────────▼─────────▼────────────▼──────────┐          │
│  │        Nginx Gateway (Port 8080)             │          │
│  │    Routes: / → prod, /staging → stage,       │          │
│  │            /development → dev                 │          │
│  └────────────┬─────────┬────────────┬──────────┘          │
│               │         │            │                     │
│       ┌───────▼─┐  ┌────▼───┐  ┌────▼────┐                │
│       │  Prod   │  │ Stage  │  │  Dev    │                │
│       │ (3001)  │  │ (3002) │  │ (3003)  │                │
│       └─────────┘  └────────┘  └─────────┘                │
└────────────────────────────────────────────────────────────┘
```

## File Structure

```
deployment/
├── docker-compose.local.yml         ✅ NEW - Local development
├── docker-compose.dev.yml           ✓ Gateway environment
├── docker-compose.stage.yml         ✓ Gateway environment
├── docker-compose.prod.yml          ✓ Gateway environment
├── docker-compose.gateway.yml       ✓ Nginx proxy
├── .env.local.example               ✅ NEW - Local template
├── .env.dev.example                 ✓ Dev template
├── .env.stage.example               ✓ Stage template
├── .env.prod.example                ✓ Prod template
├── manage-gateway.sh                ✅ UPDATED - Added local support
├── LOCAL_DEVELOPMENT.md             ✅ NEW - Local dev guide
├── INDEX.md                         ✅ UPDATED - 4-env structure
├── QUICK_START.md                   ✓ Gateway deployment
├── GATEWAY_SETUP.md                 ✓ Complete setup
└── ARCHITECTURE.md                  ✓ Architecture details
```

## Usage Examples

### Scenario 1: Developer Starting Work

```bash
# Morning routine
cd /path/to/SecondLayer/deployment
./manage-gateway.sh start local

# In another terminal
cd ../frontend
npm run dev

# Start coding with hot reload!
# Frontend auto-reloads on file save
```

### Scenario 2: Testing Feature Branch

```bash
# Make changes to code
git checkout feature/new-feature

# Rebuild backend
cd mcp_backend
npm run build

# Restart backend to pick up changes
cd ../deployment
./manage-gateway.sh restart local

# Test in browser
open http://localhost:5173
```

### Scenario 3: Deploy to Staging

```bash
# Push to staging branch
git push origin staging

# On gate server
cd ~/secondlayer-deployment
git pull origin staging

# Build and restart staging
./manage-gateway.sh build
./manage-gateway.sh restart stage

# Verify
curl https://stage.legal.org.ua/health
```

### Scenario 4: Production Deployment

```bash
# Merge to main and tag
git checkout main
git merge staging
git tag v1.2.3
git push origin main --tags

# Deploy to production
./manage-gateway.sh build
./manage-gateway.sh deploy prod
./manage-gateway.sh gateway restart

# Health check
curl https://legal.org.ua/health
```

## Environment-Specific Configuration

### Local (.env.local)

**Optimized for**: Fast development cycles, debugging

```bash
NODE_ENV=development
LOG_LEVEL=debug
HTTP_PORT=3000
POSTGRES_PASSWORD=local_dev_password  # Simple password OK
JWT_SECRET=local-dev-secret          # Simple secret OK
OPENAI_API_KEY=sk-proj-...           # Your dev key
ZAKONONLINE_API_TOKEN=...            # Your dev token
SECONDARY_LAYER_KEYS=local-dev-key   # Simple key OK
```

### Development (.env.dev)

**Optimized for**: Feature testing, team collaboration

```bash
NODE_ENV=development
LOG_LEVEL=debug
HTTP_PORT=3003
GOOGLE_CALLBACK_URL=https://dev.legal.org.ua/auth/google/callback
FRONTEND_URL=https://dev.legal.org.ua
```

### Staging (.env.stage)

**Optimized for**: Pre-production testing, QA

```bash
NODE_ENV=staging
LOG_LEVEL=info
HTTP_PORT=3002
GOOGLE_CALLBACK_URL=https://stage.legal.org.ua/auth/google/callback
FRONTEND_URL=https://stage.legal.org.ua
```

### Production (.env.prod)

**Optimized for**: Stability, performance, security

```bash
NODE_ENV=production
LOG_LEVEL=warn
HTTP_PORT=3001
GOOGLE_CALLBACK_URL=https://legal.org.ua/auth/google/callback
FRONTEND_URL=https://legal.org.ua
```

## Management Script Commands

### Start/Stop

```bash
# Start environments
./manage-gateway.sh start local    # Local only
./manage-gateway.sh start dev      # Dev only
./manage-gateway.sh start stage    # Stage only
./manage-gateway.sh start prod     # Prod only
./manage-gateway.sh start all      # All gateway envs (dev+stage+prod)

# Stop environments
./manage-gateway.sh stop local
./manage-gateway.sh stop dev
./manage-gateway.sh stop all
```

### Monitoring

```bash
# Status of all containers
./manage-gateway.sh status

# Logs (follows)
./manage-gateway.sh logs local
./manage-gateway.sh logs prod

# Health checks
./manage-gateway.sh health
```

### Deployment

```bash
# Deploy to gate server
./manage-gateway.sh deploy dev
./manage-gateway.sh deploy stage
./manage-gateway.sh deploy prod
./manage-gateway.sh deploy all

# Gateway operations
./manage-gateway.sh gateway start
./manage-gateway.sh gateway stop
./manage-gateway.sh gateway restart
./manage-gateway.sh gateway test
```

## Benefits of 4-Environment Setup

### 1. Local Development
- ✅ Fast iteration with hot reload
- ✅ No deployment needed for testing
- ✅ Full control over services
- ✅ Easy debugging with verbose logs
- ✅ Works offline (except API calls)

### 2. Development Environment
- ✅ Team collaboration on features
- ✅ Integration testing
- ✅ OAuth testing with real URLs
- ✅ Database migration testing
- ✅ CI/CD pipeline testing

### 3. Staging Environment
- ✅ Pre-production testing
- ✅ QA validation
- ✅ Performance testing
- ✅ Load testing
- ✅ Final checks before prod

### 4. Production Environment
- ✅ Live system for users
- ✅ Maximum stability
- ✅ Performance optimized
- ✅ Security hardened
- ✅ Monitored and backed up

## Workflow Best Practices

### Development Workflow

```
1. Local Development
   └─► Make changes on your machine
   └─► Test with hot reload
   └─► Commit when working

2. Push to Dev
   └─► Deploy to dev environment
   └─► Team reviews feature
   └─► Integration testing

3. Promote to Staging
   └─► QA testing
   └─► Performance validation
   └─► Client preview

4. Release to Production
   └─► Tag release
   └─► Deploy to prod
   └─► Monitor metrics
```

### Database Migrations

```
1. Create migration
   └─► Local: mcp_backend/src/migrations/NNN_description.sql
   └─► Test locally: npm run migrate

2. Test on Dev
   └─► Deploy to dev
   └─► Verify migration runs
   └─► Check data integrity

3. Validate on Staging
   └─► Run on staging data
   └─► Test rollback plan
   └─► Document process

4. Execute on Production
   └─► Backup database
   └─► Run migration
   └─► Verify success
```

## Next Steps

### For Developers

1. **Read local dev guide**: [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md)
2. **Setup local environment**:
   ```bash
   cd deployment
   cp .env.local.example .env.local
   # Add API keys
   ./manage-gateway.sh start local
   ```
3. **Start coding**: Frontend auto-reloads, backend requires restart

### For DevOps

1. **Read deployment guide**: [`QUICK_START.md`](./QUICK_START.md)
2. **Configure environments**:
   ```bash
   cp .env.dev.example .env.dev
   cp .env.stage.example .env.stage
   cp .env.prod.example .env.prod
   # Configure each environment
   ```
3. **Deploy to gate server**:
   ```bash
   ./manage-gateway.sh build
   ./manage-gateway.sh deploy all
   ```

### For Everyone

- **Index**: [`INDEX.md`](./INDEX.md) - Complete file index
- **Architecture**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) - Technical details
- **Troubleshooting**: [`GATEWAY_SETUP.md#troubleshooting`](./GATEWAY_SETUP.md#troubleshooting)

## Success Criteria

✅ **Local Environment**
- Docker services start without errors
- Frontend accessible on http://localhost:5173
- Backend API responds on http://localhost:3000
- Hot reload works for frontend changes

✅ **Gateway Environments**
- All containers running and healthy
- Nginx gateway routes correctly
- SSL certificates valid
- OAuth flow works
- Database migrations applied

✅ **Deployment**
- Zero-downtime deployments
- Health checks pass
- Logs show no errors
- Services auto-restart on failure

## Documentation Index

| Priority | Document | Purpose |
|----------|----------|---------|
| **🟢 START** | `LOCAL_DEVELOPMENT.md` | For developers - local setup |
| **🟡 DEPLOY** | `QUICK_START.md` | For DevOps - gateway deployment |
| **🔵 COMPLETE** | `GATEWAY_SETUP.md` | Complete reference |
| **⚪ INDEX** | `INDEX.md` | File index |
| **⚪ TECH** | `ARCHITECTURE.md` | Architecture details |

## Version Info

- **Version**: 1.1.0
- **Date**: 2026-01-21
- **Changes**: Added local development environment
- **Previous**: 1.0.0 (3-environment gateway)

---

## Summary

✨ **Multi-environment setup is complete and ready to use!**

**What you get**:
- 🏠 Local development with hot reload
- 🧪 Development environment for testing
- 🎭 Staging for pre-production validation
- 🚀 Production for live users

**How to start**:
- Developers: Read `LOCAL_DEVELOPMENT.md` and run `./manage-gateway.sh start local`
- DevOps: Read `QUICK_START.md` and run `./manage-gateway.sh deploy all`

**Get help**:
- Documentation: `INDEX.md`
- Troubleshooting: `GATEWAY_SETUP.md#troubleshooting`
- Management: `./manage-gateway.sh` (no args for help)

🎉 **Happy coding!**
