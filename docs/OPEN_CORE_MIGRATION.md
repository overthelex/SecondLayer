# Open Core Migration Guide

## Architecture

```
@secondlayer/core-interfaces (open, Apache 2.0)
       ↑                ↑
@secondlayer/shared    @secondlayer/core (private, proprietary)
       ↑                ↑
  mcp_backend (open, optionally loads core via core-loader.ts)
```

## Current State (Phase 1-3 complete)

- ✅ `packages/core-interfaces/` — interface package with all type contracts
- ✅ `mcp_backend/src/services/noop/` — NoOp fallbacks for all core services
- ✅ `mcp_backend/src/factories/core-loader.ts` — dynamic import with fallback
- ✅ Build passes with zero errors

## Phase 4: Create Private Repo (when ready to go public)

```bash
# 1. Create secondlayer-core repo on GitHub (private)
gh repo create overthelex/secondlayer-core --private

# 2. Copy closed files (WITHOUT git history)
mkdir secondlayer-core && cd secondlayer-core
git init

# Copy services
mkdir -p src/services src/prompts/system-instructions src/prompts/templates
cp ../mcp_backend/src/services/chat-service.ts src/services/
cp ../mcp_backend/src/services/chat-intent-classifier.ts src/services/
cp ../mcp_backend/src/services/chat-context-builder.ts src/services/
cp ../mcp_backend/src/services/chat-result-compactor.ts src/services/
cp ../mcp_backend/src/services/chat-search-cache-service.ts src/services/
cp ../mcp_backend/src/services/chat-constants.ts src/services/
cp ../mcp_backend/src/services/query-planner.ts src/services/
cp ../mcp_backend/src/services/semantic-sectionizer.ts src/services/
cp ../mcp_backend/src/services/hallucination-guard.ts src/services/
cp ../mcp_backend/src/services/citation-validator.ts src/services/
cp ../mcp_backend/src/services/legal-pattern-store.ts src/services/
cp ../mcp_backend/src/services/evidence-extractor.ts src/services/
cp ../mcp_backend/src/services/shepardization-service.ts src/services/
cp ../mcp_backend/src/services/thinking-descriptions.ts src/services/
cp ../mcp_backend/src/services/billing-service.ts src/services/
cp ../mcp_backend/src/services/pricing-service.ts src/services/
cp ../mcp_backend/src/services/subscription-service.ts src/services/
cp ../mcp_backend/src/services/credit-service.ts src/services/

# Copy prompts
cp ../mcp_backend/src/prompts/chat-system-prompt.ts src/prompts/
cp ../mcp_backend/src/prompts/query-type-config.ts src/prompts/
cp ../mcp_backend/src/prompts/tool-registry-catalog.ts src/prompts/
cp -r ../mcp_backend/src/prompts/system-instructions/* src/prompts/system-instructions/
cp -r ../mcp_backend/src/prompts/templates/* src/prompts/templates/

# 3. Add package.json, tsconfig, LICENSE (proprietary)
# 4. Export createCoreServices() from src/index.ts
# 5. Push to private repo
```

## Phase 5: Remove from Public Repo (when ready)

```bash
# Delete proprietary files from public repo
rm mcp_backend/src/services/chat-service.ts
rm mcp_backend/src/services/chat-intent-classifier.ts
# ... (full list in task #417)

# Update core-services.ts factory to use core-loader.ts
# Update http-server.ts /api/chat route to check isProprietaryLoaded()

# Verify no broken imports
git grep -l "from.*chat-service" mcp_backend/src/
git grep -l "from.*query-planner" mcp_backend/src/
```

## Phase 6: CI/CD

Add to `.github/workflows/ci-local-deploy.yml`:

```yaml
- name: Install proprietary core (prod only)
  if: github.ref == 'refs/heads/main'
  run: npm install @secondlayer/core
  env:
    NPM_TOKEN_CORE: ${{ secrets.NPM_TOKEN_CORE }}
```

## Files to move to @secondlayer/core

### Chat Pipeline (8 files)
- chat-service.ts
- chat-intent-classifier.ts
- chat-context-builder.ts
- chat-result-compactor.ts
- chat-search-cache-service.ts
- chat-constants.ts
- query-planner.ts
- thinking-descriptions.ts

### Legal AI Quality (6 files)
- semantic-sectionizer.ts
- hallucination-guard.ts
- citation-validator.ts
- legal-pattern-store.ts
- evidence-extractor.ts
- shepardization-service.ts

### Prompts (3 files + 2 directories)
- prompts/chat-system-prompt.ts
- prompts/query-type-config.ts
- prompts/tool-registry-catalog.ts
- prompts/system-instructions/
- prompts/templates/

### Billing (4 files)
- billing-service.ts
- pricing-service.ts
- subscription-service.ts
- credit-service.ts

**Total: 21 files + 2 directories**
