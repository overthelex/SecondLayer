#!/usr/bin/env bash
#
# Tear down AWS WAF + ALB infrastructure.
# Removes: WAF WebACL, IP Set, ALB, Listeners, Target Group, Security Group.
#
# Usage:
#   ./04-teardown.sh            # Interactive confirmation
#   ./04-teardown.sh --confirm  # Skip confirmation
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
BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[teardown]${NC} $*"; }
ok()   { echo -e "${GREEN}[teardown]${NC} $*"; }
warn() { echo -e "${YELLOW}[teardown]${NC} $*"; }
err()  { echo -e "${RED}[teardown]${NC} $*" >&2; }

if [[ "${1:-}" != "--confirm" ]]; then
    echo -e "${RED}WARNING: This will destroy ALL WAF + ALB infrastructure:${NC}"
    echo "  - WAF WebACL: ${WAF_NAME:-?}"
    echo "  - IP Set: ${IPSET_ID:-?}"
    echo "  - ALB: ${ALB_ARN:-?}"
    echo "  - Target Group: ${TG_ARN:-?}"
    echo "  - Security Group: ${ALB_SG_ID:-?}"
    echo ""
    echo "  Cloudflare DNS must be reverted to point to EC2 IP FIRST!"
    echo ""
    read -rp "Type 'destroy' to confirm: " confirm
    if [ "$confirm" != "destroy" ]; then
        log "Cancelled."
        exit 0
    fi
fi

# 1. Disassociate WAF from ALB
if [ -n "${WAF_ARN:-}" ] && [ -n "${ALB_ARN:-}" ]; then
    log "Disassociating WAF from ALB..."
    aws wafv2 disassociate-web-acl \
        --resource-arn "$ALB_ARN" \
        --region "$REGION" 2>/dev/null && ok "  Done" || warn "  Already disassociated"
fi

# 2. Delete WAF logging
if [ -n "${WAF_ARN:-}" ]; then
    log "Removing WAF logging..."
    aws wafv2 delete-logging-configuration \
        --resource-arn "$WAF_ARN" \
        --region "$REGION" 2>/dev/null && ok "  Done" || warn "  No logging config"
fi

# 3. Delete WebACL
if [ -n "${WAF_ID:-}" ]; then
    log "Deleting WebACL: ${WAF_NAME:-}..."
    LOCK=$(aws wafv2 get-web-acl \
        --name "${WAF_NAME:-secondlayer-prod-waf}" \
        --scope REGIONAL --id "$WAF_ID" \
        --region "$REGION" \
        --query 'LockToken' --output text 2>/dev/null || echo "")
    if [ -n "$LOCK" ]; then
        aws wafv2 delete-web-acl \
            --name "${WAF_NAME:-secondlayer-prod-waf}" \
            --scope REGIONAL --id "$WAF_ID" \
            --lock-token "$LOCK" \
            --region "$REGION" && ok "  Deleted" || warn "  Failed"
    fi
fi

# 4. Delete IP Set
if [ -n "${IPSET_ID:-}" ]; then
    log "Deleting IP Set..."
    LOCK=$(aws wafv2 get-ip-set \
        --name "secondlayer-trusted-ips" \
        --scope REGIONAL --id "$IPSET_ID" \
        --region "$REGION" \
        --query 'LockToken' --output text 2>/dev/null || echo "")
    if [ -n "$LOCK" ]; then
        aws wafv2 delete-ip-set \
            --name "secondlayer-trusted-ips" \
            --scope REGIONAL --id "$IPSET_ID" \
            --lock-token "$LOCK" \
            --region "$REGION" && ok "  Deleted" || warn "  Failed"
    fi
fi

# 5. Delete ALB listeners
if [ -n "${ALB_ARN:-}" ]; then
    log "Deleting ALB listeners..."
    LISTENERS=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$ALB_ARN" \
        --region "$REGION" \
        --query 'Listeners[*].ListenerArn' \
        --output text 2>/dev/null || echo "")
    for arn in $LISTENERS; do
        aws elbv2 delete-listener --listener-arn "$arn" --region "$REGION" 2>/dev/null
        ok "  Deleted listener: ${arn##*/}"
    done
fi

# 6. Delete ALB
if [ -n "${ALB_ARN:-}" ]; then
    log "Deleting ALB..."
    aws elbv2 delete-load-balancer \
        --load-balancer-arn "$ALB_ARN" \
        --region "$REGION" 2>/dev/null && ok "  Deleted (draining ~1 min)" || warn "  Failed"
    # Wait for ALB to fully drain before deleting SG
    log "  Waiting for ALB to drain..."
    aws elbv2 wait load-balancers-deleted \
        --load-balancer-arns "$ALB_ARN" \
        --region "$REGION" 2>/dev/null || sleep 30
fi

# 7. Delete Target Group
if [ -n "${TG_ARN:-}" ]; then
    log "Deleting Target Group..."
    aws elbv2 delete-target-group \
        --target-group-arn "$TG_ARN" \
        --region "$REGION" 2>/dev/null && ok "  Deleted" || warn "  Failed"
fi

# 8. Delete Security Group
if [ -n "${ALB_SG_ID:-}" ]; then
    log "Deleting Security Group: $ALB_SG_ID..."
    # Remove ingress rule from EC2 SG first
    if [ -n "${INSTANCE_SG:-}" ]; then
        aws ec2 revoke-security-group-ingress \
            --group-id "$INSTANCE_SG" \
            --protocol tcp --port 80 \
            --source-group "$ALB_SG_ID" \
            --region "$REGION" 2>/dev/null || true
    fi
    aws ec2 delete-security-group \
        --group-id "$ALB_SG_ID" \
        --region "$REGION" 2>/dev/null && ok "  Deleted" || warn "  Failed (may need to wait for ALB drain)"
fi

# 9. Delete CloudWatch log group
if [ -n "${WAF_LOG_GROUP:-}" ]; then
    log "Deleting CloudWatch log group: $WAF_LOG_GROUP..."
    aws logs delete-log-group \
        --log-group-name "$WAF_LOG_GROUP" \
        --region "$REGION" 2>/dev/null && ok "  Deleted" || warn "  Not found"
fi

# Clean up config file
rm -f "$CONFIG_FILE"
ok "Config file removed"

echo ""
ok "Teardown complete. Don't forget to:"
echo "  1. Revert Cloudflare DNS: legal.org.ua → A 18.192.189.254"
echo "  2. Re-open EC2 security group port 443 to Cloudflare IPs (if needed)"
