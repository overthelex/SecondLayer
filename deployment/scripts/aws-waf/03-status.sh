#!/usr/bin/env bash
#
# Show AWS WAF + ALB status, sampled requests, and rule metrics.
#
# Usage:
#   ./03-status.sh              # Full status
#   ./03-status.sh blocked      # Show recently blocked requests
#   ./03-status.sh metrics      # Show rule hit counts
#   ./03-status.sh test         # Test ALB health endpoint
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONFIG_FILE="$SCRIPT_DIR/alb-config.env"

if [ -f "$CONFIG_FILE" ]; then
    set -a; source "$CONFIG_FILE"; set +a
fi
if [ -f "$DEPLOY_DIR/.env.prod" ]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        export "$key=$value" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env.prod"
fi

REGION="${REGION:-eu-central-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${BLUE}[status]${NC} $*"; }
ok()   { echo -e "${GREEN}[status]${NC} $*"; }
warn() { echo -e "${YELLOW}[status]${NC} $*"; }

# ── Full status ───────────────────────────────────────────────────────────────
show_full_status() {
    echo -e "${CYAN}═══ ALB Status ═══${NC}"

    if [ -n "${ALB_ARN:-}" ]; then
        aws elbv2 describe-load-balancers \
            --load-balancer-arns "$ALB_ARN" \
            --region "$REGION" \
            --query 'LoadBalancers[0].{State:State.Code,DNS:DNSName,Scheme:Scheme,Type:Type}' \
            --output table 2>/dev/null || warn "ALB not found"

        echo ""
        echo -e "${CYAN}═══ Target Health ═══${NC}"
        aws elbv2 describe-target-health \
            --target-group-arn "$TG_ARN" \
            --region "$REGION" \
            --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
            --output table 2>/dev/null || warn "Target group not found"
    else
        warn "ALB_ARN not set. Run 01-create-alb.sh first."
    fi

    echo ""
    echo -e "${CYAN}═══ WAF WebACL ═══${NC}"

    if [ -n "${WAF_ID:-}" ]; then
        aws wafv2 get-web-acl \
            --name "${WAF_NAME:-secondlayer-prod-waf}" \
            --scope REGIONAL \
            --id "$WAF_ID" \
            --region "$REGION" \
            --query 'WebACL.{Name:Name,Id:Id,Capacity:Capacity,Rules:Rules[*].Name}' \
            --output table 2>/dev/null || warn "WebACL not found"

        echo ""
        echo -e "${CYAN}═══ WAF Association ═══${NC}"
        aws wafv2 get-web-acl-for-resource \
            --resource-arn "${ALB_ARN:-}" \
            --region "$REGION" \
            --query 'WebACL.Name' \
            --output text 2>/dev/null && ok "WAF is attached to ALB" \
            || warn "WAF NOT attached to ALB"
    else
        warn "WAF_ID not set. Run 02-create-waf.sh first."
    fi

    echo ""
    echo -e "${CYAN}═══ IP Set ═══${NC}"
    if [ -n "${IPSET_ID:-}" ]; then
        aws wafv2 get-ip-set \
            --name "${IPSET_NAME:-secondlayer-trusted-ips}" \
            --scope REGIONAL \
            --id "$IPSET_ID" \
            --region "$REGION" \
            --query 'IPSet.Addresses' \
            --output text 2>/dev/null || warn "IP set not found"
    fi
}

# ── Show blocked requests ────────────────────────────────────────────────────
show_blocked() {
    log "Fetching recently blocked requests (last 3 hours)..."

    if [ -z "${WAF_ARN:-}" ]; then
        warn "WAF_ARN not set"
        return
    fi

    NOW=$(date -u +%s)
    START=$((NOW - 10800))  # 3 hours ago

    RULES=$(aws wafv2 get-web-acl \
        --name "${WAF_NAME:-secondlayer-prod-waf}" \
        --scope REGIONAL \
        --id "$WAF_ID" \
        --region "$REGION" \
        --query 'WebACL.Rules[*].Name' \
        --output text 2>/dev/null || echo "")

    for rule in $RULES; do
        echo ""
        echo -e "${CYAN}── $rule ──${NC}"
        aws wafv2 get-sampled-requests \
            --web-acl-arn "$WAF_ARN" \
            --rule-metric-name "$rule" \
            --scope REGIONAL \
            --time-window "StartTime=$START,EndTime=$NOW" \
            --max-items 5 \
            --region "$REGION" \
            --query 'SampledRequests[*].{IP:Request.ClientIP,URI:Request.URI,Country:Request.Country,Action:Action,Time:Timestamp}' \
            --output table 2>/dev/null || echo "  (no samples)"
    done
}

# ── Show CloudWatch metrics ───────────────────────────────────────────────────
show_metrics() {
    log "Fetching WAF metrics (last 1 hour)..."

    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    START=$(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ")

    METRICS=("AllowedRequests" "BlockedRequests" "CountedRequests")
    RULES=("secondlayerProdWAF" "AllowTrustedIPs" "AWSCommonRules" "AWSKnownBadInputs" "AWSSQLiRules" "RateLimitGlobal" "RateLimitAuth" "RateLimitChat" "GeoRestrictAuth" "BlockBadUserAgents" "BlockPathTraversal")

    printf "\n%-30s %15s %15s %15s\n" "Rule" "Allowed" "Blocked" "Counted"
    printf "%s\n" "$(printf '─%.0s' {1..80})"

    for rule in "${RULES[@]}"; do
        ALLOWED=$(aws cloudwatch get-metric-statistics \
            --namespace "AWS/WAFV2" \
            --metric-name "AllowedRequests" \
            --dimensions Name=WebACL,Value="${WAF_NAME:-secondlayer-prod-waf}" Name=Rule,Value="$rule" Name=Region,Value="$REGION" \
            --start-time "$START" --end-time "$NOW" --period 3600 \
            --statistics Sum \
            --region "$REGION" \
            --query 'Datapoints[0].Sum' \
            --output text 2>/dev/null || echo "0")

        BLOCKED=$(aws cloudwatch get-metric-statistics \
            --namespace "AWS/WAFV2" \
            --metric-name "BlockedRequests" \
            --dimensions Name=WebACL,Value="${WAF_NAME:-secondlayer-prod-waf}" Name=Rule,Value="$rule" Name=Region,Value="$REGION" \
            --start-time "$START" --end-time "$NOW" --period 3600 \
            --statistics Sum \
            --region "$REGION" \
            --query 'Datapoints[0].Sum' \
            --output text 2>/dev/null || echo "0")

        COUNTED=$(aws cloudwatch get-metric-statistics \
            --namespace "AWS/WAFV2" \
            --metric-name "CountedRequests" \
            --dimensions Name=WebACL,Value="${WAF_NAME:-secondlayer-prod-waf}" Name=Rule,Value="$rule" Name=Region,Value="$REGION" \
            --start-time "$START" --end-time "$NOW" --period 3600 \
            --statistics Sum \
            --region "$REGION" \
            --query 'Datapoints[0].Sum' \
            --output text 2>/dev/null || echo "0")

        printf "%-30s %15s %15s %15s\n" "$rule" "${ALLOWED:-0}" "${BLOCKED:-0}" "${COUNTED:-0}"
    done
}

# ── Test ALB health ───────────────────────────────────────────────────────────
test_alb() {
    if [ -z "${ALB_DNS:-}" ]; then
        warn "ALB_DNS not set"
        return
    fi

    log "Testing ALB endpoint: $ALB_DNS"
    echo ""

    echo -n "  HTTP  → "
    curl -so /dev/null -w "%{http_code} (%{time_total}s)" "http://$ALB_DNS/health" 2>/dev/null || echo "FAIL"
    echo ""

    echo -n "  HTTPS → "
    curl -so /dev/null -w "%{http_code} (%{time_total}s)" --insecure "https://$ALB_DNS/health" 2>/dev/null || echo "FAIL"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
CMD="${1:-}"
case "$CMD" in
    blocked)  show_blocked  ;;
    metrics)  show_metrics  ;;
    test)     test_alb      ;;
    *)        show_full_status ;;
esac
