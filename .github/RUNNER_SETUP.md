# Self-Hosted Runner Setup

Both CI/CD pipelines use self-hosted GitHub Actions runners to avoid paying for hosted runners.

## Runner Labels

| Pipeline | Runner Label | Machine | Purpose |
|----------|-------------|---------|---------|
| Pipeline 1 (Local) | `self-hosted, local` | Dev machine (local) | Build & test in local Docker |
| Pipeline 2 (Stage) | `self-hosted, stage` | gate.lexapp.co.ua | Build & test in stage Docker |

## Setup on Local Machine

```bash
# 1. Create runner directory
mkdir -p ~/actions-runner && cd ~/actions-runner

# 2. Download runner (check latest version at github.com/actions/runner/releases)
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# 3. Configure (get token from GitHub: Settings → Actions → Runners → New self-hosted runner)
./config.sh --url https://github.com/overthelex/SecondLayer \
  --token YOUR_TOKEN \
  --labels local \
  --name "local-runner" \
  --work _work

# 4. Install as systemd service
sudo ./svc.sh install
sudo ./svc.sh start
```

## Setup on Stage Server

```bash
ssh vovkes@gate.lexapp.co.ua

# Same steps as above, but with label "stage"
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

./config.sh --url https://github.com/overthelex/SecondLayer \
  --token YOUR_TOKEN \
  --labels stage \
  --name "stage-runner" \
  --work _work

sudo ./svc.sh install
sudo ./svc.sh start
```

## GitHub Secrets Required

Set these in GitHub repo Settings → Secrets and variables → Actions:

| Secret | Value | Description |
|--------|-------|-------------|
| `PROD_SSH_KEY_PATH` | Path to `~/.ssh/secondlayer-prod.pem` on runner | SSH key for prod server |

> **Note**: Since runners are self-hosted, the SSH key already exists on the machine.
> Set `PROD_SSH_KEY_PATH` to the absolute path, e.g., `/home/vovkes/.ssh/secondlayer-prod.pem`

## GitHub Environment

Create a `production` environment in GitHub repo Settings → Environments:
- Add required reviewers (optional, for manual approval before prod deploy)
- This gates the `deploy-prod` job

## How It Works

### Pipeline 1 (Local → Prod)
```
merge to main
  → detect-changes (what services changed?)
  → build-shared
  → test-* (parallel: only changed services)
  → build-docker (build images locally)
  → integration-test (start local Docker stack, health checks)
  → deploy-prod (SSH to prod, rebuild only changed services)
  → tag deploy
```

### Pipeline 2 (Stage → Prod)
```
merge to main
  → detect-changes
  → build-and-test (unit tests on stage)
  → stage-deploy-and-test (deploy to stage Docker, health checks)
  → deploy-prod (SSH to prod, rebuild only changed services)
  → tag deploy
```

### Change Detection

Uses `deploy-prod-*` git tags to know what was last deployed. Compares file paths:

| Path | Triggers |
|------|----------|
| `packages/shared/*` | ALL backend services (shared dep) |
| `mcp_backend/*` | Backend + document-service |
| `mcp_rada/*` | RADA service |
| `mcp_openreyestr/*` | OpenReyestr service |
| `lexwebapp/*` | Frontend |
| `deployment/*` | ALL services (config change) |

## Choosing Which Pipeline to Use

You likely want only ONE pipeline active at a time. To disable one:

1. Go to GitHub Actions tab
2. Select the workflow
3. Click "..." → "Disable workflow"

Or rename the file to `.yml.disabled`.
