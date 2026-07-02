#!/bin/bash

##############################################################################
# SecondLayer Environment Management Script
# Manages Production, Staging and Local environments
##############################################################################

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration — override via environment variables or .env file
STAGE_SERVER="${STAGE_SERVER:-stage.example.com}"
STAGE_USER="${STAGE_USER:-deploy}"
STAGE_REMOTE_PATH="${STAGE_REMOTE_PATH:-/home/${STAGE_USER}/SecondLayer/deployment}"
DEPLOY_USER="$STAGE_USER"  # Default for lib scripts; overridden per-env in deploy

PROD_SERVER="${PROD_SERVER:-prod.example.com}"
PROD_USER="${PROD_USER:-ubuntu}"
PROD_SSH_KEY="${PROD_SSH_KEY:-$HOME/.ssh/secondlayer-prod.pem}"
PROD_REMOTE_PATH="${PROD_REMOTE_PATH:-/home/${PROD_USER}/SecondLayer/deployment}"

NO_CACHE=""  # Set to "--no-cache" via --no-cache flag

# Helper: get SSH command for an environment
get_ssh_cmd() {
    local env=$1
    case $env in
        prod|production)
            echo "ssh -i ${PROD_SSH_KEY} ${PROD_USER}@${PROD_SERVER}"
            ;;
        stage|staging)
            echo "ssh ${STAGE_USER}@${STAGE_SERVER}"
            ;;
    esac
}

# Helper: get SCP command for an environment
get_scp_cmd() {
    local env=$1
    case $env in
        prod|production)
            echo "scp -i ${PROD_SSH_KEY}"
            ;;
        stage|staging)
            echo "scp"
            ;;
    esac
}

# Helper: get deploy user for an environment
get_deploy_user() {
    local env=$1
    case $env in
        prod|production) echo "$PROD_USER" ;;
        stage|staging)   echo "$STAGE_USER" ;;
    esac
}

# Helper: get target server for an environment
get_target_server() {
    local env=$1
    case $env in
        prod|production) echo "$PROD_SERVER" ;;
        stage|staging)   echo "$STAGE_SERVER" ;;
    esac
}

# Helper: get remote repo path for an environment
get_remote_repo() {
    local env=$1
    case $env in
        prod|production) echo "/home/${PROD_USER}/SecondLayer" ;;
        stage|staging)   echo "/home/${STAGE_USER}/SecondLayer" ;;
    esac
}

# Source orchestrator libraries
source "$SCRIPT_DIR/lib/preflight.sh"
source "$SCRIPT_DIR/lib/backup.sh"
source "$SCRIPT_DIR/lib/smoke-test.sh"
source "$SCRIPT_DIR/lib/report.sh"

# ── Cloudflare maintenance helpers ───────────────────────────────────────────
CF_MAINTENANCE="$SCRIPT_DIR/maintenance/cf-maintenance.sh"

enable_cf_maintenance() {
    local env="${1:-stage}"
    if [ ! -f "$CF_MAINTENANCE" ]; then return 0; fi
    print_msg "$BLUE" "Enabling Cloudflare maintenance page ($env)..."
    bash "$CF_MAINTENANCE" enable "$env" || print_msg "$YELLOW" "Warning: could not enable CF maintenance mode (site stays live during deploy)"
}

disable_cf_maintenance() {
    local env="${1:-stage}"
    if [ ! -f "$CF_MAINTENANCE" ]; then return 0; fi
    print_msg "$BLUE" "Disabling Cloudflare maintenance page ($env)..."
    bash "$CF_MAINTENANCE" disable "$env" || print_msg "$YELLOW" "Warning: could not disable CF maintenance mode — run manually: $CF_MAINTENANCE disable"
}

# Print colored message
print_msg() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Print usage
usage() {
    cat << EOF
SecondLayer Environment Manager

Usage: $0 <command> [environment] [options]

Commands:
  start <env>       Start environment (prod|stage|local)
  stop <env>        Stop environment (prod|stage|local)
  restart <env>     Restart environment (prod|stage|local)
  status            Show status of all environments
  logs <env>        Show logs for environment (prod|stage|local|gateway)
  deploy <env>      Deploy environment (prod|stage|local) [--no-cache]
  build             Build Docker images
  gateway           Manage nginx gateway
    - start         Start nginx gateway
    - stop          Stop nginx gateway
    - restart       Restart nginx gateway
    - test          Test nginx configuration
  health            Check health of all services
  clean <env>       Clean environment data (USE WITH CAUTION!)

Environments:
  prod              Production -> 18.192.189.254 (AWS EC2)
                    Domains: legal.org.ua, mcp.legal.org.ua
  stage             Staging -> gate.lexapp.co.ua (Cloudflare proxy)
                    Domains: stage.legal.org.ua, legal.org.ua, mcp.legal.org.ua
  local             Local development (local.legal.org.ua) -> localhost

Deployment Targets:
  - Prod:  Deploys to 18.192.189.254 (AWS EC2), serves legal.org.ua via Cloudflare
  - Stage: Deploys to gate.lexapp.co.ua, serves all 3 domains via nginx + Cloudflare
  - Local: Full rebuild on localhost (pull, rebuild --no-cache, migrate)

Examples:
  $0 start local             # Start local development environment
  $0 start stage             # Start staging environment
  $0 start prod              # Start production environment
  $0 stop stage              # Stop staging environment
  $0 restart prod            # Restart production environment
  $0 logs local              # Show local environment logs
  $0 logs prod               # Show production logs
  $0 deploy stage            # Deploy staging (cached build)
  $0 deploy prod             # Deploy production (cached build)
  $0 deploy prod --no-cache  # Deploy production (full rebuild)
  $0 deploy local --no-cache # Deploy local (full rebuild)
  $0 gateway start           # Start nginx gateway
  $0 health                  # Check health of all services
  $0 status                  # Show status of all containers

EOF
    exit 1
}

# Check if docker-compose is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_msg "$RED" "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        print_msg "$RED" "Docker Compose is not installed or not in PATH"
        exit 1
    fi
}

# Get docker compose command (handles both docker-compose and docker compose)
get_compose_cmd() {
    if command -v docker compose &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

# Start environment
start_env() {
    local env=$1
    local compose_cmd=$(get_compose_cmd)

    print_msg "$BLUE" "Starting $env environment..."

    case $env in
        prod|production)
            local ssh_cmd=$(get_ssh_cmd prod)
            print_msg "$BLUE" "Starting prod services on ${PROD_SERVER}..."
            $ssh_cmd \
                "cd ${PROD_REMOTE_PATH} && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d \
                    postgres-prod pgbouncer-prod redis-prod minio-prod postgres-openreyestr-prod \
                    app-prod rada-mcp-app-prod app-openreyestr-prod document-service-prod lexwebapp-prod \
                    nginx-prod \
                    prometheus-prod grafana-prod cadvisor-prod"
            ;;
        stage|staging)
            local ssh_cmd=$(get_ssh_cmd stage)
            print_msg "$BLUE" "Starting stage services on ${STAGE_SERVER}..."
            $ssh_cmd \
                "cd ${STAGE_REMOTE_PATH} && docker compose -f docker-compose.stage.yml --env-file .env.stage up -d \
                    postgres-stage pgbouncer-stage redis-stage qdrant-stage minio-stage postgres-openreyestr-stage \
                    app-stage rada-mcp-app-stage app-openreyestr-stage document-service-stage lexwebapp-stage \
                    nginx-stage \
                    prometheus-stage grafana-stage postgres-exporter-backend postgres-exporter-openreyestr \
                    redis-exporter node-exporter cadvisor-stage"
            ;;
        local)
            local local_compose_args="-f docker-compose.local.yml"
            if [ -f ".env.local" ]; then
                local_compose_args="$local_compose_args --env-file .env.local"
            else
                print_msg "$YELLOW" ".env.local not found. Using defaults from docker-compose.local.yml"
                print_msg "$YELLOW" "    Copy .env.local.example to .env.local for custom configuration"
            fi

            ensure_letsencrypt_certs "$local_compose_args"
            $compose_cmd $local_compose_args up -d --build

            # Open browser (nginx + Vite run inside Docker now)
            print_msg "$BLUE" "Opening https://local.legal.org.ua ..."
            if command -v xdg-open &> /dev/null; then
                xdg-open "https://local.legal.org.ua" 2>/dev/null &
            elif command -v open &> /dev/null; then
                open "https://local.legal.org.ua" 2>/dev/null &
            fi
            ;;
        *)
            print_msg "$RED" "Invalid environment: $env (use prod, stage, or local)"
            usage
            ;;
    esac

    print_msg "$GREEN" "$env environment started"
}

# Stop environment
stop_env() {
    local env=$1
    local compose_cmd=$(get_compose_cmd)

    print_msg "$BLUE" "Stopping $env environment..."

    case $env in
        prod|production)
            local ssh_cmd=$(get_ssh_cmd prod)
            print_msg "$BLUE" "Stopping prod services on ${PROD_SERVER}..."
            $ssh_cmd \
                "cd ${PROD_REMOTE_PATH} && docker compose -f docker-compose.prod.yml --env-file .env.prod stop \
                    nginx-prod \
                    app-prod rada-mcp-app-prod app-openreyestr-prod document-service-prod lexwebapp-prod \
                    prometheus-prod grafana-prod cadvisor-prod"
            ;;
        stage|staging)
            local ssh_cmd=$(get_ssh_cmd stage)
            print_msg "$BLUE" "Stopping stage services on ${STAGE_SERVER}..."
            $ssh_cmd \
                "cd ${STAGE_REMOTE_PATH} && docker compose -f docker-compose.stage.yml --env-file .env.stage stop \
                    nginx-stage \
                    app-stage rada-mcp-app-stage app-openreyestr-stage document-service-stage lexwebapp-stage \
                    prometheus-stage grafana-stage postgres-exporter-backend postgres-exporter-openreyestr \
                    redis-exporter node-exporter cadvisor-stage"
            ;;
        local)
            # Try compose down with env file first (matches how start works)
            if [ -f ".env.local" ]; then
                $compose_cmd -f docker-compose.local.yml --env-file .env.local down 2>/dev/null || true
            fi
            # Also try without env file (catches containers started without --env-file)
            $compose_cmd -f docker-compose.local.yml down 2>/dev/null || true

            # Clean up any orphaned local containers (Created/Dead/Exited state)
            local orphaned
            orphaned=$(docker ps -a --filter "name=-local" --format '{{.ID}} {{.Names}} {{.Status}}' 2>/dev/null | grep -v "^$" || true)
            if [ -n "$orphaned" ]; then
                print_msg "$YELLOW" "Cleaning up orphaned local containers..."
                docker ps -a --filter "name=-local" -q | xargs -r docker rm -f 2>/dev/null || true
            fi

            # Kill stale docker-proxy processes holding local ports
            local stale_proxies
            stale_proxies=$(ps aux 2>/dev/null | grep '[d]ocker-proxy' | grep -E '\-container-port (5432|6379|3000|3001|3002|3004|6333|6334|9000|9001|9090|9121|3100)' | awk '{print $2}' || true)
            if [ -n "$stale_proxies" ]; then
                for pid in $stale_proxies; do
                    print_msg "$YELLOW" "Killing stale docker-proxy (PID $pid)"
                    kill "$pid" 2>/dev/null || sudo kill "$pid" 2>/dev/null || true
                done
            fi
            ;;
        *)
            print_msg "$RED" "Invalid environment: $env (use prod, stage, or local)"
            usage
            ;;
    esac

    print_msg "$GREEN" "$env environment stopped"
}

# Restart environment
restart_env() {
    local env=$1
    stop_env "$env"
    sleep 2
    start_env "$env"
}

# Show status
show_status() {
    print_msg "$BLUE" "Environment Status\n"

    print_msg "$YELLOW" "=== Production (${PROD_SERVER}) ==="
    $(get_ssh_cmd prod) \
        "docker ps --filter 'name=-prod' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${PROD_SERVER}"
    echo ""

    print_msg "$YELLOW" "=== Staging (${STAGE_SERVER}) ==="
    $(get_ssh_cmd stage) \
        "docker ps --filter 'name=-stage' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${STAGE_SERVER}"
    echo ""

    print_msg "$YELLOW" "=== Local ==="
    docker ps --filter "name=-local" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""

    print_msg "$YELLOW" "=== Gateway ==="
    docker ps --filter "name=legal-nginx-gateway" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
}

# Show logs
show_logs() {
    local env=$1
    local compose_cmd=$(get_compose_cmd)

    case $env in
        prod|production)
            $(get_ssh_cmd prod) \
                "cd ${PROD_REMOTE_PATH} && docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f --tail=100"
            ;;
        stage|staging)
            $(get_ssh_cmd stage) \
                "cd ${STAGE_REMOTE_PATH} && docker compose -f docker-compose.stage.yml --env-file .env.stage logs -f --tail=100"
            ;;
        local)
            if [ -f ".env.local" ]; then
                $compose_cmd -f docker-compose.local.yml --env-file .env.local logs -f --tail=100
            else
                $compose_cmd -f docker-compose.local.yml logs -f --tail=100
            fi
            ;;
        gateway)
            $compose_cmd -f docker-compose.gateway.yml logs -f --tail=100
            ;;
        *)
            print_msg "$RED" "Invalid environment: $env (use prod, stage, local, or gateway)"
            usage
            ;;
    esac
}

# Manage gateway
manage_gateway() {
    local action=$1
    local compose_cmd=$(get_compose_cmd)

    case $action in
        start)
            print_msg "$BLUE" "Starting nginx gateway..."
            $compose_cmd -f docker-compose.gateway.yml up -d
            print_msg "$GREEN" "Nginx gateway started"
            ;;
        stop)
            print_msg "$BLUE" "Stopping nginx gateway..."
            $compose_cmd -f docker-compose.gateway.yml down
            print_msg "$GREEN" "Nginx gateway stopped"
            ;;
        restart)
            manage_gateway stop
            sleep 2
            manage_gateway start
            ;;
        test)
            print_msg "$BLUE" "Testing nginx configuration..."
            docker exec legal-nginx-gateway nginx -t
            print_msg "$GREEN" "Nginx configuration is valid"
            ;;
        *)
            print_msg "$RED" "Invalid gateway action: $action"
            echo "Valid actions: start, stop, restart, test"
            exit 1
            ;;
    esac
}

# Build Docker images
build_images() {
    print_msg "$BLUE" "Building Docker images..."

    cd ..

    # Build backend (from root context with mono Dockerfile)
    print_msg "$BLUE" "Building backend image..."
    docker build $NO_CACHE -f deployment/Dockerfile.mono-backend -t secondlayer-app:latest .

    # Build RADA MCP (from root context with mono Dockerfile)
    print_msg "$BLUE" "Building RADA MCP image..."
    docker build $NO_CACHE -f deployment/Dockerfile.mono-rada -t rada-mcp:latest .

    # Build OpenReyestr MCP (from root context with mono Dockerfile)
    print_msg "$BLUE" "Building OpenReyestr MCP image..."
    docker build $NO_CACHE -f deployment/Dockerfile.mono-openreyestr -t openreyestr-app:latest .

    # Build frontend (Dockerfile expects context=repo root)
    print_msg "$BLUE" "Building frontend image..."
    docker build $NO_CACHE -f lexwebapp/Dockerfile -t lexwebapp-lexwebapp:latest .

    cd deployment
    print_msg "$GREEN" "Images built successfully"
}

# Check health
check_health() {
    print_msg "$BLUE" "Checking health of all services...\n"

    # Production — container-level check via SSH
    print_msg "$YELLOW" "=== Production containers (${PROD_SERVER}) ==="
    $(get_ssh_cmd prod) \
        "docker ps --filter 'name=-prod' --format 'table {{.Names}}\t{{.Status}}'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${PROD_SERVER}"

    # Production — HTTP endpoints
    print_msg "$YELLOW" "\n=== Production HTTP endpoints ==="
    for domain in legal.org.ua mcp.legal.org.ua; do
        if curl -sf --max-time 10 "https://${domain}/health" > /dev/null 2>&1; then
            print_msg "$GREEN" "  Backend  (https://${domain}/health): healthy"
        else
            print_msg "$RED" "  Backend  (https://${domain}/health): unhealthy"
        fi
        if curl -skf --max-time 10 "https://${domain}/" > /dev/null 2>&1; then
            print_msg "$GREEN" "  Frontend (https://${domain}/): healthy"
        else
            print_msg "$RED" "  Frontend (https://${domain}/): unhealthy"
        fi
    done
    # Direct backend health on prod (bypasses Cloudflare)
    print_msg "$YELLOW" "\n=== Production direct (port 3007 on ${PROD_SERVER}) ==="
    $(get_ssh_cmd prod) \
        "curl -sf --max-time 5 http://localhost:3007/health && echo '  direct backend: healthy' || echo '  direct backend: unhealthy'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${PROD_SERVER}"

    # Staging — container-level check via SSH
    print_msg "$YELLOW" "\n=== Staging containers (${STAGE_SERVER}) ==="
    $(get_ssh_cmd stage) \
        "docker ps --filter 'name=-stage' --format 'table {{.Names}}\t{{.Status}}'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${STAGE_SERVER}"

    # Staging — HTTP endpoints via public domains
    print_msg "$YELLOW" "\n=== Staging HTTP endpoints ==="
    for domain in stage.legal.org.ua; do
        if curl -sf --max-time 10 "https://${domain}/health" > /dev/null 2>&1; then
            print_msg "$GREEN" "  Backend  (https://${domain}/health): healthy"
        else
            print_msg "$RED" "  Backend  (https://${domain}/health): unhealthy"
        fi
        if curl -skf --max-time 10 "https://${domain}/" > /dev/null 2>&1; then
            print_msg "$GREEN" "  Frontend (https://${domain}/): healthy"
        else
            print_msg "$RED" "  Frontend (https://${domain}/): unhealthy"
        fi
    done
    # Direct backend health on the gate server (bypasses Cloudflare)
    print_msg "$YELLOW" "\n=== Staging direct (port 3004 on ${STAGE_SERVER}) ==="
    $(get_ssh_cmd stage) \
        "curl -sf --max-time 5 http://localhost:3004/health && echo '  direct backend: healthy' || echo '  direct backend: unhealthy'" 2>/dev/null \
        || print_msg "$RED" "  Could not connect to ${STAGE_SERVER}"

    # Local
    print_msg "$YELLOW" "\n=== Local (localhost) ==="
    curl -sf --max-time 5 http://localhost:3000/health > /dev/null && print_msg "$GREEN" "  Backend (localhost:3000): healthy" || print_msg "$RED" "  Backend (localhost:3000): unhealthy"
    docker ps --filter "name=nginx-local" --format '{{.Status}}' 2>/dev/null | grep -qi "up" && print_msg "$GREEN" "  Nginx: running" || print_msg "$RED" "  Nginx: stopped"
    docker ps --filter "name=lexwebapp-local" --format '{{.Status}}' 2>/dev/null | grep -qi "up" && print_msg "$GREEN" "  Vite (Docker): running" || print_msg "$RED" "  Vite (Docker): stopped"
    curl -sf --max-time 10 https://local.legal.org.ua/ > /dev/null && print_msg "$GREEN" "  Frontend (local HTTPS): healthy" || print_msg "$RED" "  Frontend (local HTTPS): unhealthy"
    curl -sf --max-time 10 https://local.mcp.legal.org.ua/health > /dev/null && print_msg "$GREEN" "  MCP SSE (local.mcp HTTPS): healthy" || print_msg "$RED" "  MCP SSE (local.mcp HTTPS): unhealthy"

    echo ""
}


# Manage Let's Encrypt certificates for local environment
ensure_letsencrypt_certs() {
    local certs_dir="$SCRIPT_DIR/nginx/certs"
    local le_dir="/etc/letsencrypt/live/local.legal.org.ua"
    local domains="-d local.legal.org.ua -d local.mcp.legal.org.ua"
    local compose_cmd=$(get_compose_cmd)
    local compose_args="$1"

    # Check if LE cert exists and is still valid (>7 days)
    if sudo test -f "$le_dir/fullchain.pem" && \
       sudo openssl x509 -in "$le_dir/fullchain.pem" -noout -checkend 604800 2>/dev/null; then
        print_msg "$GREEN" "Let's Encrypt certificate is valid"
        # Ensure latest certs are copied
        sudo cp "$le_dir/fullchain.pem" "$certs_dir/fullchain.pem"
        sudo cp "$le_dir/privkey.pem" "$certs_dir/privkey.pem"
        # Keep the whole certs dir owned by the runner user. On the self-hosted
        # CI runner this dir lives inside the Actions workspace; if it (or any
        # file in it) stays root-owned, the next `actions/checkout` git-clean
        # fails with EACCES and blocks every subsequent deploy.
        sudo chown -R $(id -u):$(id -g) "$certs_dir"
        return 0
    fi

    print_msg "$BLUE" "Obtaining/renewing Let's Encrypt certificate..."

    # Ensure certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_msg "$BLUE" "Installing certbot..."
        sudo apt-get install -y certbot > /dev/null 2>&1
    fi

    # Stop nginx if running (to free port 80 for standalone mode)
    $compose_cmd $compose_args stop nginx-local 2>/dev/null || true

    # Obtain/renew certificate
    if sudo certbot certonly --standalone $domains \
        --non-interactive --agree-tos --email admin@legal.org.ua 2>&1; then
        print_msg "$GREEN" "Certificate obtained successfully"
        sudo cp "$le_dir/fullchain.pem" "$certs_dir/fullchain.pem"
        sudo cp "$le_dir/privkey.pem" "$certs_dir/privkey.pem"
        # Keep the whole certs dir runner-owned (see note above) so the next
        # CI checkout can git-clean the workspace without EACCES.
        sudo chown -R $(id -u):$(id -g) "$certs_dir"
    else
        print_msg "$YELLOW" "Let's Encrypt failed -- falling back to existing certs"
    fi
}

# Deploy local environment (full rebuild without cache)
deploy_local() {
    local compose_cmd=$(get_compose_cmd)
    local env_file=".env.local"
    local compose_file="docker-compose.local.yml"
    local compose_args="-f $compose_file"
    if [ -f "$env_file" ]; then
        compose_args="$compose_args --env-file $env_file"
    fi

    local deploy_start
    deploy_start=$(date +%s)

    print_msg "$BLUE" "Deploying local environment (full rebuild)..."

    # Phase 0: Ensure TLS
    ensure_letsencrypt_certs "$compose_args"

    # Phase 1: Pre-flight checks
    if ! preflight_check "local" "localhost" "$env_file" "$compose_file" "$REPO_ROOT"; then
        generate_deploy_report "local" "failure" "" "$deploy_start" "$REPO_ROOT"
        exit 1
    fi

    # Phase 2: Backup current state
    local backup_id
    backup_id=$(create_backup "local" "localhost" "$REPO_ROOT")

    # Phase 2b: Show maintenance page while services are rebuilding
    enable_cf_maintenance local

    # Phase 3: Deploy
    local deploy_exit=0
    (
        set -e

        # Step 1: Stop app containers only (keep infrastructure: postgres, redis, qdrant, minio)
        # Note: deploys from current branch (main)
        print_msg "$BLUE" "Stopping app containers (keeping databases running)..."
        $compose_cmd $compose_args stop \
            app-local rada-mcp-app-local app-openreyestr-local \
            document-service-local terminal-service-local nginx-local lexwebapp-local lexwebapp-deps-local \
            2>/dev/null || true
        $compose_cmd $compose_args rm -f \
            app-local rada-mcp-app-local app-openreyestr-local \
            document-service-local terminal-service-local nginx-local lexwebapp-local lexwebapp-deps-local \
            migrate-local rada-migrate-local migrate-openreyestr-local \
            rada-db-init-local \
            2>/dev/null || true

        # Step 3: Cleanup exited/dead containers and dangling images
        print_msg "$BLUE" "Cleaning up stopped containers..."
        docker ps -a --filter "name=-local" --filter "status=exited" -q | xargs -r docker rm -f
        docker ps -a --filter "name=-local" --filter "status=dead" -q | xargs -r docker rm -f
        print_msg "$BLUE" "Removing dangling images..."
        docker image prune -f

        # Step 3b: Pre-build shared + all service dists (mirrors stage pre-build; ensures dist/ is fresh before Docker COPY)
        print_msg "$BLUE" "Building shared package and all service dists..."
        (
            cd "$REPO_ROOT"
            npm --prefix packages/shared install && npm --prefix packages/shared run build
            npm --prefix mcp_backend install && npm --prefix mcp_backend run build
            npm --prefix mcp_rada install && npm --prefix mcp_rada run build
            npm --prefix mcp_openreyestr install && npm --prefix mcp_openreyestr run build
        )

        # Step 4: Rebuild images (use --no-cache flag for full rebuild)
        if [ -n "$NO_CACHE" ]; then
            print_msg "$BLUE" "Building all images without cache..."
        else
            print_msg "$BLUE" "Building all images (cached)..."
        fi
        $compose_cmd $compose_args build $NO_CACHE \
            app-local \
            rada-mcp-app-local \
            app-openreyestr-local \
            migrate-local \
            rada-migrate-local \
            migrate-openreyestr-local \
            document-service-local \
            terminal-service-local \
            lexwebapp-local \
            nginx-local

        # Step 5: Ensure infrastructure services are running
        print_msg "$BLUE" "Ensuring infrastructure services are running..."
        $compose_cmd $compose_args up -d postgres-local redis-local qdrant-local postgres-openreyestr-local minio-local

        # Step 6: Wait for databases to be healthy, then run init
        print_msg "$BLUE" "Waiting for databases..."
        sleep 5
        print_msg "$BLUE" "Running RADA DB init..."
        $compose_cmd $compose_args up rada-db-init-local

        # Step 7: Run migrations (backend first, then rada + openreyestr in parallel)
        print_msg "$BLUE" "Running backend migrations..."
        $compose_cmd $compose_args up migrate-local
        print_msg "$BLUE" "Running RADA + OpenReyestr migrations in parallel..."
        $compose_cmd $compose_args up rada-migrate-local migrate-openreyestr-local

        # Step 8: Start frontend deps + app services (including nginx + frontend in Docker)
        print_msg "$BLUE" "Installing frontend dependencies..."
        $compose_cmd $compose_args up lexwebapp-deps-local
        print_msg "$BLUE" "Starting application services..."
        $compose_cmd $compose_args up -d app-local rada-mcp-app-local app-openreyestr-local document-service-local terminal-service-local lexwebapp-local nginx-local

        # Step 9: Start monitoring services
        print_msg "$BLUE" "Starting monitoring services..."
        $compose_cmd $compose_args up -d \
            prometheus-local \
            grafana-local \
            redis-exporter-local \
            cadvisor-local \
            2>/dev/null || echo "  (some monitoring services may not exist)"
    ) || deploy_exit=$?

    if [ $deploy_exit -ne 0 ]; then
        print_msg "$RED" "Deploy failed, rolling back..."
        rollback_to_backup "local" "localhost" "$compose_file" "$env_file"
        disable_cf_maintenance local
        generate_deploy_report "local" "rollback" "$backup_id" "$deploy_start" "$REPO_ROOT"
        exit 1
    fi

    # Services are up — remove maintenance page before smoke tests
    disable_cf_maintenance local

    # Phase 4: Smoke tests
    if ! run_smoke_tests "local" "localhost" "$compose_file" "$env_file"; then
        print_msg "$RED" "Smoke tests failed, rolling back..."
        rollback_to_backup "local" "localhost" "$compose_file" "$env_file"
        generate_deploy_report "local" "rollback" "$backup_id" "$deploy_start" "$REPO_ROOT"
        exit 1
    fi

    # Phase 5: Open browser (nginx + Vite run inside Docker now)
    print_msg "$BLUE" "Opening https://local.legal.org.ua ..."
    if command -v xdg-open &> /dev/null; then
        xdg-open "https://local.legal.org.ua" 2>/dev/null &
    elif command -v open &> /dev/null; then
        open "https://local.legal.org.ua" 2>/dev/null &
    fi

    # Phase 6: Report
    generate_deploy_report "local" "success" "$backup_id" "$deploy_start" "$REPO_ROOT"
    print_msg "$GREEN" "Local deployment complete"
    $compose_cmd $compose_args ps
}

# Deploy to remote server (stage or prod)
deploy_to_server() {
    local env=$1

    case $env in
        prod|production)
            env="prod"
            ;;
        stage|staging)
            env="stage"
            ;;
        local)
            deploy_local
            return
            ;;
        *)
            print_msg "$RED" "Invalid environment: $env (use prod, stage, or local)"
            exit 1
            ;;
    esac

    local target_server=$(get_target_server "$env")
    local deploy_user=$(get_deploy_user "$env")
    local remote_repo=$(get_remote_repo "$env")
    local ssh_cmd=$(get_ssh_cmd "$env")
    local scp_cmd=$(get_scp_cmd "$env")
    local env_file=".env.${env}"
    local compose_file="docker-compose.${env}.yml"
    local server_name
    case $env in
        prod) server_name="production server (AWS)" ;;
        stage) server_name="gate server" ;;
    esac

    local deploy_start
    deploy_start=$(date +%s)

    print_msg "$BLUE" "Deploying $env to $server_name ($target_server)..."

    # Safety confirmation for production
    if [ "$env" = "prod" ]; then
        print_msg "$RED" "  *** PRODUCTION DEPLOYMENT ***"
        print_msg "$YELLOW" "  Target: $target_server ($server_name)"
        read -p "  Type 'deploy-prod' to confirm: " confirm
        if [ "$confirm" != "deploy-prod" ]; then
            print_msg "$YELLOW" "Aborted"
            exit 0
        fi
    fi

    # Phase 1: Pre-flight checks (use DEPLOY_USER override for preflight SSH)
    local ORIG_DEPLOY_USER="$DEPLOY_USER"
    DEPLOY_USER="$deploy_user"
    if [ "$env" = "prod" ]; then
        # Override SSH for preflight to use key-based auth
        export PROD_SSH_OPTS="-i $PROD_SSH_KEY"
    fi
    if ! preflight_check "$env" "$target_server" "$env_file" "$compose_file" "$REPO_ROOT"; then
        generate_deploy_report "$env" "failure" "" "$deploy_start" "$REPO_ROOT"
        DEPLOY_USER="$ORIG_DEPLOY_USER"
        exit 1
    fi

    # Phase 2: Backup current state
    local backup_id
    backup_id=$(create_backup "$env" "$target_server" "$REPO_ROOT")

    # Phase 2b: Show maintenance page while services are down (stage only — prod uses blue-green)
    if [ "$env" != "prod" ]; then
        enable_cf_maintenance "$env"
    fi

    # Phase 3: Deploy
    local deploy_failed=false

    # Step 1: Pull latest code on the server via git
    print_msg "$BLUE" "Pulling latest code on $server_name..."
    if ! $ssh_cmd "git -C ${remote_repo} fetch origin main && git -C ${remote_repo} reset --hard origin/main"; then
        print_msg "$RED" "Git sync failed, rolling back..."
        rollback_to_backup "$env" "$target_server" "$compose_file" "$env_file"
        generate_deploy_report "$env" "rollback" "$backup_id" "$deploy_start" "$REPO_ROOT"
        DEPLOY_USER="$ORIG_DEPLOY_USER"
        exit 1
    fi

    # Step 2: Copy env file (not tracked in git)
    print_msg "$BLUE" "Copying env file to $server_name..."
    $scp_cmd $env_file ${deploy_user}@${target_server}:${remote_repo}/deployment/

    # Step 3: Build, migrate, and start services
    print_msg "$BLUE" "Updating containers on $server_name..."

    local GIT_SHA
    GIT_SHA=$(git -C "${REPO_ROOT}" rev-parse HEAD)

    # Determine env-specific values for the remote script
    local env_suffix="$env"
    local direct_backend_port
    local nginx_check_port
    local health_domains
    case $env in
        prod)
            direct_backend_port="3007"
            nginx_check_port="80"
            health_domains="legal.org.ua mcp.legal.org.ua"
            ;;
        stage)
            direct_backend_port="3004"
            nginx_check_port="8080"
            health_domains="stage.legal.org.ua legal.org.ua mcp.legal.org.ua"
            ;;
    esac

    if ! $ssh_cmd "export REMOTE_REPO='${remote_repo}'; export NO_CACHE='${NO_CACHE}'; export GIT_SHA='${GIT_SHA}'; export ENV_SUFFIX='${env_suffix}'; export DIRECT_BACKEND_PORT='${direct_backend_port}'; export NGINX_CHECK_PORT='${nginx_check_port}'; export HEALTH_DOMAINS='${health_domains}'; bash -s" << 'EOF'
        set -e
        cd "$REMOTE_REPO/deployment"

        COMPOSE_FILE="docker-compose.${ENV_SUFFIX}.yml"
        ENV_FILE=".env.${ENV_SUFFIX}"
        DC="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"
        COLOR_FILE="$REMOTE_REPO/deployment/.deploy-color"

        # ── Blue-Green deploy (prod only) ──────────────────────────────────
        if [ "$ENV_SUFFIX" = "prod" ]; then

            # Detect current active color
            ACTIVE_COLOR="blue"
            if [ -f "$COLOR_FILE" ]; then
                ACTIVE_COLOR=$(cat "$COLOR_FILE")
            fi
            if [ "$ACTIVE_COLOR" = "green" ]; then
                TARGET_COLOR="blue"
            else
                TARGET_COLOR="green"
            fi
            echo "=== Blue-Green Deploy: active=$ACTIVE_COLOR, target=$TARGET_COLOR ==="

            # Blue service names (default, no profile)
            BLUE_SERVICES="app-prod rada-mcp-app-prod app-openreyestr-prod document-service-prod lexwebapp-prod"
            # Green service names (profile: green)
            GREEN_SERVICES="app-prod-green rada-mcp-app-prod-green app-openreyestr-prod-green document-service-prod-green lexwebapp-prod-green"

            if [ "$TARGET_COLOR" = "green" ]; then
                TARGET_SERVICES="$GREEN_SERVICES"
                OLD_SERVICES="$BLUE_SERVICES"
                TARGET_BACKEND="app-prod-green"
                TARGET_FRONTEND="lexwebapp-prod-green"
            else
                TARGET_SERVICES="$BLUE_SERVICES"
                OLD_SERVICES="$GREEN_SERVICES"
                TARGET_BACKEND="app-prod"
                TARGET_FRONTEND="lexwebapp-prod"
            fi

            # Step 1: Cleanup exited/dead containers and dangling images
            echo "Cleaning up stopped containers..."
            docker ps -a --filter "name=-prod" --filter "status=exited" -q | xargs -r docker rm -f
            docker ps -a --filter "name=-prod" --filter "status=dead" -q | xargs -r docker rm -f
            $DC rm -f migrate-prod rada-migrate-prod migrate-openreyestr-prod rada-db-init-prod seed-admin-prod 2>/dev/null || true
            docker image prune -f

            # Step 2: Pre-build shared + all service dists
            echo "Building shared package and all service dists..."
            cd "$REMOTE_REPO"
            npm --prefix packages/shared install && npm --prefix packages/shared run build
            npm --prefix mcp_backend install && npm --prefix mcp_backend run build
            npm --prefix mcp_rada install && npm --prefix mcp_rada run build
            npm --prefix mcp_openreyestr install && npm --prefix mcp_openreyestr run build
            cd "$REMOTE_REPO/deployment"

            # Step 3: Build images
            if [ -n "$NO_CACHE" ]; then
                echo "Building all images without cache..."
            else
                echo "Building all images (cached)..."
            fi
            GIT_SHA_ENV="GIT_SHA=${GIT_SHA:-$(git -C "$REMOTE_REPO" rev-parse HEAD 2>/dev/null || echo unknown)}"
            $DC build $NO_CACHE --build-arg "$GIT_SHA_ENV" \
                app-prod rada-mcp-app-prod app-openreyestr-prod \
                migrate-prod rada-migrate-prod migrate-openreyestr-prod \
                document-service-prod lexwebapp-prod

            # Step 4: Ensure infrastructure services are running
            echo "Ensuring infrastructure services are running..."
            INFRA_FLAGS=""
            if [ -n "$NO_CACHE" ]; then
                INFRA_FLAGS="--force-recreate"
            fi
            $DC up -d $INFRA_FLAGS \
                postgres-prod redis-prod \
                postgres-openreyestr-prod minio-prod
            $DC up -d pgbouncer-prod 2>/dev/null || true

            # Step 5: Run migrations (old services still serving traffic)
            echo "Waiting for databases..."
            sleep 5
            echo "Running RADA DB init..."
            $DC up rada-db-init-prod
            echo "Running backend migrations..."
            $DC up migrate-prod
            echo "Running RADA + OpenReyestr migrations in parallel..."
            $DC up rada-migrate-prod migrate-openreyestr-prod
            echo "Seeding admin users..."
            $DC up seed-admin-prod 2>/dev/null || echo "  (seed-admin not defined)"

            # Step 6: Start target color services (old services still serving traffic)
            echo "Starting $TARGET_COLOR services..."
            if [ "$TARGET_COLOR" = "green" ]; then
                $DC --profile green up -d $TARGET_SERVICES
            else
                $DC up -d $TARGET_SERVICES
            fi

            # Step 7: Wait for target services to become healthy
            echo "Waiting for $TARGET_COLOR services health checks..."
            HEALTH_TIMEOUT=120
            HEALTH_INTERVAL=5
            ELAPSED=0
            ALL_HEALTHY=false
            while [ $ELAPSED -lt $HEALTH_TIMEOUT ]; do
                HEALTHY_COUNT=0
                TOTAL=0
                for svc in $TARGET_SERVICES; do
                    TOTAL=$((TOTAL + 1))
                    CONTAINER=$(docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps -q "$svc" 2>/dev/null || true)
                    if [ -n "$CONTAINER" ]; then
                        STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
                        if [ "$STATUS" = "healthy" ]; then
                            HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
                        fi
                    fi
                done
                echo "  Health check: $HEALTHY_COUNT/$TOTAL healthy (${ELAPSED}s/${HEALTH_TIMEOUT}s)"
                if [ "$HEALTHY_COUNT" -eq "$TOTAL" ]; then
                    ALL_HEALTHY=true
                    break
                fi
                sleep $HEALTH_INTERVAL
                ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
            done

            if [ "$ALL_HEALTHY" = false ]; then
                echo "ERROR: $TARGET_COLOR services failed health checks after ${HEALTH_TIMEOUT}s"
                echo "Stopping $TARGET_COLOR services (old services still running)..."
                if [ "$TARGET_COLOR" = "green" ]; then
                    $DC --profile green stop $TARGET_SERVICES 2>/dev/null || true
                    $DC --profile green rm -f $TARGET_SERVICES 2>/dev/null || true
                else
                    $DC stop $TARGET_SERVICES 2>/dev/null || true
                    $DC rm -f $TARGET_SERVICES 2>/dev/null || true
                fi
                echo "ROLLBACK: $ACTIVE_COLOR services still active, no downtime occurred"
                exit 1
            fi
            echo "All $TARGET_COLOR services are healthy!"

            # Step 8: Switch nginx upstreams to target color
            echo "Switching nginx upstreams to $TARGET_COLOR ($TARGET_BACKEND / $TARGET_FRONTEND)..."
            cat > "$REMOTE_REPO/deployment/nginx/includes/prod-upstreams.conf" << UPSTREAM_EOF
# Active upstreams — managed by deploy script (blue-green switching)
# Active color: $TARGET_COLOR — switched at $(date -u +"%Y-%m-%dT%H:%M:%SZ")

upstream prod_mcp_backend {
    server ${TARGET_BACKEND}:3000;
    keepalive 128;
}

upstream prod_frontend {
    server ${TARGET_FRONTEND}:80;
    keepalive 32;
}
UPSTREAM_EOF

            # Ensure nginx is running
            $DC up -d nginx-prod

            # Validate and reload nginx config (retry up to 5 times — Docker DNS may need a moment)
            NGINX_OK=false
            for NGINX_TRY in 1 2 3 4 5; do
                if docker exec nginx-prod nginx -t 2>&1; then
                    NGINX_OK=true
                    break
                fi
                echo "nginx -t attempt $NGINX_TRY/5 failed — waiting 3s for Docker DNS..."
                sleep 3
            done
            if [ "$NGINX_OK" != "true" ]; then
                echo "ERROR: nginx config validation failed! Reverting upstream..."
                # Revert to old color upstream
                if [ "$ACTIVE_COLOR" = "blue" ]; then
                    OLD_BACKEND="app-prod"; OLD_FRONTEND="lexwebapp-prod"
                else
                    OLD_BACKEND="app-prod-green"; OLD_FRONTEND="lexwebapp-prod-green"
                fi
                cat > "$REMOTE_REPO/deployment/nginx/includes/prod-upstreams.conf" << REVERT_EOF
upstream prod_mcp_backend {
    server ${OLD_BACKEND}:3000;
    keepalive 128;
}

upstream prod_frontend {
    server ${OLD_FRONTEND}:80;
    keepalive 32;
}
REVERT_EOF
                exit 1
            fi
            docker exec nginx-prod nginx -s reload
            echo "Nginx reloaded — traffic now flowing to $TARGET_COLOR"

            # Step 9: Brief pause for connections to drain from old services
            sleep 5

            # Step 10: Verify traffic through nginx
            echo "Verifying domain health (direct nginx on :${NGINX_CHECK_PORT})..."
            for domain in $HEALTH_DOMAINS; do
                ok=false
                for attempt in 1 2 3; do
                    if curl -sf --max-time 10 -H "Host: ${domain}" "http://localhost:${NGINX_CHECK_PORT}/health" > /dev/null 2>&1; then
                        echo "  [OK] ${domain}"
                        ok=true
                        break
                    fi
                    sleep 5
                done
                if [ "$ok" = false ]; then
                    echo "  [WARN] ${domain} nginx routing not ready after 3 attempts"
                    curl -sf --max-time 5 "http://localhost:${DIRECT_BACKEND_PORT}/health" 2>/dev/null \
                        && echo "    Backend is up on :${DIRECT_BACKEND_PORT} — nginx config issue" \
                        || echo "    Backend not responding on :${DIRECT_BACKEND_PORT} either"
                fi
            done

            # Step 11: Stop old color services
            echo "Stopping old $ACTIVE_COLOR services..."
            if [ "$ACTIVE_COLOR" = "green" ]; then
                $DC --profile green stop $OLD_SERVICES 2>/dev/null || true
                $DC --profile green rm -f $OLD_SERVICES 2>/dev/null || true
            else
                $DC stop $OLD_SERVICES 2>/dev/null || true
                $DC rm -f $OLD_SERVICES 2>/dev/null || true
            fi

            # Step 12: Update state file
            echo "$TARGET_COLOR" > "$COLOR_FILE"
            echo "Deploy color updated: $TARGET_COLOR"

            # Step 13: Start monitoring services
            echo "Starting monitoring services..."
            $DC up -d prometheus-prod grafana-prod cadvisor-prod 2>/dev/null \
                || echo "  (some monitoring services may not exist)"
            $DC up -d postgres-exporter-backend postgres-exporter-openreyestr redis-exporter node-exporter 2>/dev/null || true

            echo "=== Blue-Green deploy complete: $TARGET_COLOR is now active ==="
            $DC --profile green ps

        # ── Standard deploy (stage) ────────────────────────────────────────
        else
            # Step 1: Stop app containers only (keep infra running)
            echo "Stopping app containers (keeping databases running)..."
            $DC stop \
                nginx-${ENV_SUFFIX} \
                app-${ENV_SUFFIX} rada-mcp-app-${ENV_SUFFIX} app-openreyestr-${ENV_SUFFIX} \
                document-service-${ENV_SUFFIX} lexwebapp-${ENV_SUFFIX} \
                prometheus-${ENV_SUFFIX} grafana-${ENV_SUFFIX} \
                2>/dev/null || true
            $DC rm -f \
                nginx-${ENV_SUFFIX} \
                app-${ENV_SUFFIX} rada-mcp-app-${ENV_SUFFIX} app-openreyestr-${ENV_SUFFIX} \
                document-service-${ENV_SUFFIX} lexwebapp-${ENV_SUFFIX} \
                migrate-${ENV_SUFFIX} rada-migrate-${ENV_SUFFIX} migrate-openreyestr-${ENV_SUFFIX} \
                rada-db-init-${ENV_SUFFIX} \
                prometheus-${ENV_SUFFIX} grafana-${ENV_SUFFIX} \
                2>/dev/null || true

            # Step 2: Cleanup
            echo "Cleaning up stopped containers..."
            docker ps -a --filter "name=-${ENV_SUFFIX}" --filter "status=exited" -q | xargs -r docker rm -f
            docker ps -a --filter "name=-${ENV_SUFFIX}" --filter "status=dead" -q | xargs -r docker rm -f
            docker image prune -f

            # Step 3: Pre-build
            echo "Building shared package and all service dists..."
            cd "$REMOTE_REPO"
            npm --prefix packages/shared install && npm --prefix packages/shared run build
            npm --prefix mcp_backend install && npm --prefix mcp_backend run build
            npm --prefix mcp_rada install && npm --prefix mcp_rada run build
            npm --prefix mcp_openreyestr install && npm --prefix mcp_openreyestr run build
            cd "$REMOTE_REPO/deployment"

            # Step 4: Build images
            if [ -n "$NO_CACHE" ]; then
                echo "Building all images without cache..."
            else
                echo "Building all images (cached)..."
            fi
            GIT_SHA_ENV="GIT_SHA=${GIT_SHA:-$(git -C "$REMOTE_REPO" rev-parse HEAD 2>/dev/null || echo unknown)}"
            $DC build $NO_CACHE --build-arg "$GIT_SHA_ENV" \
                app-${ENV_SUFFIX} rada-mcp-app-${ENV_SUFFIX} app-openreyestr-${ENV_SUFFIX} \
                migrate-${ENV_SUFFIX} rada-migrate-${ENV_SUFFIX} migrate-openreyestr-${ENV_SUFFIX} \
                document-service-${ENV_SUFFIX} lexwebapp-${ENV_SUFFIX}

            # Step 5: Ensure infrastructure
            echo "Ensuring infrastructure services are running..."
            INFRA_FLAGS=""
            if [ -n "$NO_CACHE" ]; then
                INFRA_FLAGS="--force-recreate"
            fi
            $DC up -d $INFRA_FLAGS \
                postgres-${ENV_SUFFIX} redis-${ENV_SUFFIX} qdrant-${ENV_SUFFIX} \
                postgres-openreyestr-${ENV_SUFFIX} minio-${ENV_SUFFIX}
            $DC up -d pgbouncer-${ENV_SUFFIX} 2>/dev/null || true

            # Step 6: Migrations
            echo "Waiting for databases..."
            sleep 5
            echo "Running RADA DB init..."
            $DC up rada-db-init-${ENV_SUFFIX}
            echo "Running backend migrations..."
            $DC up migrate-${ENV_SUFFIX}
            echo "Running RADA + OpenReyestr migrations in parallel..."
            $DC up rada-migrate-${ENV_SUFFIX} migrate-openreyestr-${ENV_SUFFIX}
            echo "Seeding admin users..."
            $DC up seed-admin-${ENV_SUFFIX} 2>/dev/null || echo "  (seed-admin not defined)"

            # Step 7: Start app services
            echo "Starting application services..."
            $DC up -d \
                app-${ENV_SUFFIX} rada-mcp-app-${ENV_SUFFIX} app-openreyestr-${ENV_SUFFIX} \
                document-service-${ENV_SUFFIX} lexwebapp-${ENV_SUFFIX}

            # Step 8: Start nginx
            echo "Starting nginx reverse proxy..."
            $DC up -d nginx-${ENV_SUFFIX}

            # Step 9: Start monitoring
            echo "Starting monitoring services..."
            $DC up -d \
                prometheus-${ENV_SUFFIX} grafana-${ENV_SUFFIX} cadvisor-${ENV_SUFFIX} \
                2>/dev/null || echo "  (some monitoring services may not exist)"
            if [ "$ENV_SUFFIX" = "stage" ]; then
                $DC up -d \
                    postgres-exporter-backend postgres-exporter-openreyestr \
                    redis-exporter node-exporter \
                    2>/dev/null || true
            fi

            # Step 10: Verify health
            echo "Waiting for nginx and services to initialize..."
            sleep 10
            echo "Verifying domain health (direct nginx on :${NGINX_CHECK_PORT})..."
            for domain in $HEALTH_DOMAINS; do
                ok=false
                for attempt in 1 2 3; do
                    if curl -sf --max-time 10 -H "Host: ${domain}" "http://localhost:${NGINX_CHECK_PORT}/health" > /dev/null 2>&1; then
                        echo "  [OK] ${domain}"
                        ok=true
                        break
                    fi
                    sleep 5
                done
                if [ "$ok" = false ]; then
                    echo "  [WARN] ${domain} nginx routing not ready after 3 attempts"
                    curl -sf --max-time 5 "http://localhost:${DIRECT_BACKEND_PORT}/health" 2>/dev/null \
                        && echo "    Backend is up on :${DIRECT_BACKEND_PORT} — nginx config issue" \
                        || echo "    Backend not responding on :${DIRECT_BACKEND_PORT} either"
                fi
            done

            echo "Container deployment complete"
            $DC ps
        fi
EOF
    then
        deploy_failed=true
    fi

    if [ "$deploy_failed" = true ]; then
        print_msg "$RED" "Remote deploy failed, rolling back..."
        rollback_to_backup "$env" "$target_server" "$compose_file" "$env_file"
        if [ "$env" != "prod" ]; then
            disable_cf_maintenance "$env"
        fi
        generate_deploy_report "$env" "rollback" "$backup_id" "$deploy_start" "$REPO_ROOT"
        DEPLOY_USER="$ORIG_DEPLOY_USER"
        exit 1
    fi

    # Services are up — remove maintenance page before smoke tests (stage only)
    if [ "$env" != "prod" ]; then
        disable_cf_maintenance "$env"
    fi

    # Phase 4: Smoke tests
    if ! run_smoke_tests "$env" "$target_server" "$compose_file" "$env_file"; then
        print_msg "$RED" "Smoke tests failed, rolling back..."
        rollback_to_backup "$env" "$target_server" "$compose_file" "$env_file"
        generate_deploy_report "$env" "rollback" "$backup_id" "$deploy_start" "$REPO_ROOT"
        DEPLOY_USER="$ORIG_DEPLOY_USER"
        exit 1
    fi

    DEPLOY_USER="$ORIG_DEPLOY_USER"

    # Phase 5: Report
    generate_deploy_report "$env" "success" "$backup_id" "$deploy_start" "$REPO_ROOT"
    print_msg "$GREEN" "${env^} deployed to $server_name ($target_server)"
}

# Clean environment data
clean_env() {
    local env=$1
    local compose_cmd=$(get_compose_cmd)

    print_msg "$RED" "WARNING: This will delete all data for $env environment!"
    read -p "Are you sure? Type 'yes' to confirm: " confirm

    if [ "$confirm" != "yes" ]; then
        print_msg "$YELLOW" "Aborted"
        exit 0
    fi

    case $env in
        prod|production)
            print_msg "$RED" "  *** PRODUCTION DATA WIPE ***"
            read -p "  Type 'wipe-prod' to DOUBLE confirm: " confirm2
            if [ "$confirm2" != "wipe-prod" ]; then
                print_msg "$YELLOW" "Aborted"
                exit 0
            fi
            $(get_ssh_cmd prod) \
                "cd ${PROD_REMOTE_PATH} && docker compose -f docker-compose.prod.yml --env-file .env.prod down -v"
            ;;
        stage|staging)
            $(get_ssh_cmd stage) \
                "cd ${STAGE_REMOTE_PATH} && docker compose -f docker-compose.stage.yml --env-file .env.stage down -v"
            ;;
        local)
            local compose_cmd=$(get_compose_cmd)
            local compose_args="-f docker-compose.local.yml"
            if [ -f ".env.local" ]; then
                compose_args="$compose_args --env-file .env.local"
            fi
            $compose_cmd $compose_args down -v
            ;;
        *)
            print_msg "$RED" "Invalid environment: $env (use prod, stage, or local)"
            exit 1
            ;;
    esac

    print_msg "$GREEN" "$env environment cleaned"
}

# Main script
check_docker

if [ $# -eq 0 ]; then
    usage
fi

COMMAND=$1
shift

# Parse global flags
for arg in "$@"; do
    case $arg in
        --no-cache)
            NO_CACHE="--no-cache"
            ;;
    esac
done

case $COMMAND in
    start)
        if [ $# -eq 0 ]; then
            usage
        fi
        start_env "$1"
        ;;
    stop)
        if [ $# -eq 0 ]; then
            usage
        fi
        stop_env "$1"
        ;;
    restart)
        if [ $# -eq 0 ]; then
            usage
        fi
        restart_env "$1"
        ;;
    status)
        show_status
        ;;
    logs)
        if [ $# -eq 0 ]; then
            usage
        fi
        show_logs "$1"
        ;;
    deploy)
        if [ $# -eq 0 ]; then
            usage
        fi
        deploy_to_server "$1"
        ;;
    build)
        build_images
        ;;
    gateway)
        if [ $# -eq 0 ]; then
            usage
        fi
        manage_gateway "$1"
        ;;
    health)
        check_health
        ;;
    clean)
        if [ $# -eq 0 ]; then
            usage
        fi
        clean_env "$1"
        ;;
    *)
        print_msg "$RED" "Unknown command: $COMMAND"
        usage
        ;;
esac
