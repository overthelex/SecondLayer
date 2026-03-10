#!/usr/bin/env bash
#
# Create ALB infrastructure for AWS WAF integration.
# Creates: Security Group, Target Group, ALB, ACM certificate, Listeners.
#
# Architecture:
#   Cloudflare (edge) → ALB (SSL termination + WAF) → EC2 Nginx (HTTP:80)
#
# Prerequisites:
#   - AWS CLI configured
#   - .env.prod has AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
#   - EC2 instance running with Elastic IP
#
# Usage:
#   ./01-create-alb.sh
#   ./01-create-alb.sh --dry-run     # Show what would be created
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONFIG_FILE="$SCRIPT_DIR/alb-config.env"

# Load env if available (use env to handle values with spaces)
if [ -f "$DEPLOY_DIR/.env.prod" ]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        export "$key=$value" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env.prod"
fi

# ── Config ────────────────────────────────────────────────────────────────────
REGION="${AWS_REGION:-eu-central-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PREFIX="secondlayer-prod"

EC2_INSTANCE_ID="${EC2_INSTANCE_ID:-i-04e39a795576e33f0}"
ELASTIC_IP="18.192.189.254"
DOMAIN="legal.org.ua"
ALT_DOMAINS="mcp.legal.org.ua"

# Resource names
ALB_NAME="${PREFIX}-alb"
TG_NAME="${PREFIX}-tg"
SG_NAME="${PREFIX}-alb-sg"
ACM_CERT_TAG="${PREFIX}-cert"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${BLUE}[alb]${NC} $*"; }
ok()   { echo -e "${GREEN}[alb]${NC} $*"; }
warn() { echo -e "${YELLOW}[alb]${NC} $*"; }
err()  { echo -e "${RED}[alb]${NC} $*" >&2; }

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    warn "DRY RUN MODE — no resources will be created"
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  ALB Infrastructure Setup — SecondLayer Production${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
log "Region:       $REGION"
log "Account:      $ACCOUNT_ID"
log "EC2 Instance: $EC2_INSTANCE_ID"
log "Elastic IP:   $ELASTIC_IP"
log "Domain:       $DOMAIN, $ALT_DOMAINS"
echo ""

# ── Get VPC and subnet info from EC2 instance ────────────────────────────────
log "[1/6] Discovering VPC and subnets from EC2 instance..."

VPC_ID=$(aws ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].VpcId' \
    --output text)

INSTANCE_SUBNET=$(aws ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].SubnetId' \
    --output text)

INSTANCE_SG=$(aws ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
    --output text)

# ALB requires at least 2 AZs — get all subnets in the VPC
SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --region "$REGION" \
    --query 'Subnets[*].[SubnetId,AvailabilityZone]' \
    --output text)

# Pick one subnet per AZ (ALB needs min 2 AZs)
declare -A AZ_SUBNET_MAP
while IFS=$'\t' read -r subnet_id az; do
    if [ -z "${AZ_SUBNET_MAP[$az]:-}" ]; then
        AZ_SUBNET_MAP[$az]=$subnet_id
    fi
done <<< "$SUBNETS"

SUBNET_IDS=""
AZ_COUNT=0
for az in "${!AZ_SUBNET_MAP[@]}"; do
    if [ $AZ_COUNT -lt 3 ]; then
        SUBNET_IDS="${SUBNET_IDS:+$SUBNET_IDS }${AZ_SUBNET_MAP[$az]}"
        ((AZ_COUNT++))
    fi
done

ok "  VPC: $VPC_ID"
ok "  Instance subnet: $INSTANCE_SUBNET"
ok "  ALB subnets ($AZ_COUNT AZs): $SUBNET_IDS"

if [ "$DRY_RUN" = true ]; then
    echo ""
    ok "DRY RUN complete. Resources that would be created:"
    echo "  - Security Group: $SG_NAME"
    echo "  - Target Group: $TG_NAME (HTTP:80)"
    echo "  - ACM Certificate: *.$DOMAIN"
    echo "  - ALB: $ALB_NAME (internet-facing)"
    echo "  - HTTPS Listener (443) + HTTP redirect (80)"
    exit 0
fi

# ── Create ALB Security Group ─────────────────────────────────────────────────
log "[2/6] Creating ALB security group: $SG_NAME"

EXISTING_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --region "$REGION" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_SG" != "None" ] && [ -n "$EXISTING_SG" ]; then
    ALB_SG_ID="$EXISTING_SG"
    ok "  Security group already exists: $ALB_SG_ID"
else
    ALB_SG_ID=$(aws ec2 create-security-group \
        --group-name "$SG_NAME" \
        --description "ALB security group for SecondLayer production (WAF-protected)" \
        --vpc-id "$VPC_ID" \
        --region "$REGION" \
        --query 'GroupId' \
        --output text)

    # Inbound: HTTPS from Cloudflare IPs + HTTP for redirect
    # Cloudflare IP ranges: https://www.cloudflare.com/ips/
    CLOUDFLARE_IPV4=(
        173.245.48.0/20
        103.21.244.0/22
        103.22.200.0/22
        103.31.4.0/22
        141.101.64.0/18
        108.162.192.0/18
        190.93.240.0/20
        188.114.96.0/20
        197.234.240.0/22
        198.41.128.0/17
        162.158.0.0/15
        104.16.0.0/13
        104.24.0.0/14
        172.64.0.0/13
        131.0.72.0/22
    )

    for cidr in "${CLOUDFLARE_IPV4[@]}"; do
        aws ec2 authorize-security-group-ingress \
            --group-id "$ALB_SG_ID" \
            --protocol tcp --port 443 --cidr "$cidr" \
            --region "$REGION" 2>/dev/null || true
        aws ec2 authorize-security-group-ingress \
            --group-id "$ALB_SG_ID" \
            --protocol tcp --port 80 --cidr "$cidr" \
            --region "$REGION" 2>/dev/null || true
    done

    # Also allow health checks from within VPC
    VPC_CIDR=$(aws ec2 describe-vpcs \
        --vpc-ids "$VPC_ID" \
        --region "$REGION" \
        --query 'Vpcs[0].CidrBlock' \
        --output text)

    aws ec2 authorize-security-group-ingress \
        --group-id "$ALB_SG_ID" \
        --protocol tcp --port 80 --cidr "$VPC_CIDR" \
        --region "$REGION" 2>/dev/null || true

    aws ec2 create-tags \
        --resources "$ALB_SG_ID" \
        --tags Key=Name,Value="$SG_NAME" Key=Project,Value=secondlayer Key=Environment,Value=prod \
        --region "$REGION"

    ok "  Created: $ALB_SG_ID (Cloudflare IPs only on 80/443)"
fi

# Allow ALB SG to reach EC2 on port 80
log "  Allowing ALB → EC2 traffic on port 80..."
aws ec2 authorize-security-group-ingress \
    --group-id "$INSTANCE_SG" \
    --protocol tcp --port 80 \
    --source-group "$ALB_SG_ID" \
    --region "$REGION" 2>/dev/null || warn "  Rule already exists (OK)"

# ── Create Target Group ───────────────────────────────────────────────────────
log "[3/6] Creating target group: $TG_NAME"

EXISTING_TG=$(aws elbv2 describe-target-groups \
    --names "$TG_NAME" \
    --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_TG" ] && [ "$EXISTING_TG" != "None" ]; then
    TG_ARN="$EXISTING_TG"
    ok "  Target group already exists: $TG_ARN"
else
    TG_ARN=$(aws elbv2 create-target-group \
        --name "$TG_NAME" \
        --protocol HTTP \
        --port 80 \
        --vpc-id "$VPC_ID" \
        --target-type instance \
        --health-check-protocol HTTP \
        --health-check-path "/health" \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 10 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --matcher HttpCode=200 \
        --region "$REGION" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text)

    # Enable stickiness for SSE/WebSocket connections
    aws elbv2 modify-target-group-attributes \
        --target-group-arn "$TG_ARN" \
        --attributes \
            Key=stickiness.enabled,Value=true \
            Key=stickiness.type,Value=lb_cookie \
            Key=stickiness.lb_cookie.duration_seconds,Value=3600 \
            Key=deregistration_delay.timeout_seconds,Value=60 \
        --region "$REGION" > /dev/null

    ok "  Created: $TG_ARN"
fi

# Register EC2 instance
log "  Registering EC2 instance $EC2_INSTANCE_ID..."
aws elbv2 register-targets \
    --target-group-arn "$TG_ARN" \
    --targets Id="$EC2_INSTANCE_ID",Port=80 \
    --region "$REGION" 2>/dev/null || true
ok "  Instance registered on port 80"

# ── Request ACM Certificate ───────────────────────────────────────────────────
log "[4/6] Requesting ACM certificate for *.$DOMAIN"

# Check for existing cert
EXISTING_CERT=$(aws acm list-certificates \
    --region "$REGION" \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_CERT" ] && [ "$EXISTING_CERT" != "None" ]; then
    ACM_CERT_ARN="$EXISTING_CERT"
    ok "  Certificate already exists: $ACM_CERT_ARN"
else
    ACM_CERT_ARN=$(aws acm request-certificate \
        --domain-name "$DOMAIN" \
        --subject-alternative-names "*.$DOMAIN" "$ALT_DOMAINS" \
        --validation-method DNS \
        --tags Key=Name,Value="$ACM_CERT_TAG" Key=Project,Value=secondlayer \
        --region "$REGION" \
        --query 'CertificateArn' \
        --output text)

    ok "  Certificate requested: $ACM_CERT_ARN"
    warn ""
    warn "  ╔════════════════════════════════════════════════════════════╗"
    warn "  ║  ACTION REQUIRED: DNS validation                         ║"
    warn "  ║                                                          ║"
    warn "  ║  Add CNAME records in Cloudflare DNS to validate cert.   ║"
    warn "  ║  Run this to see the required records:                   ║"
    warn "  ║                                                          ║"
    warn "  ║  aws acm describe-certificate \\                         ║"
    warn "  ║    --certificate-arn $ACM_CERT_ARN \\                    ║"
    warn "  ║    --query 'Certificate.DomainValidationOptions'         ║"
    warn "  ║                                                          ║"
    warn "  ║  Wait for validation, then re-run this script.           ║"
    warn "  ╚════════════════════════════════════════════════════════════╝"
    warn ""

    # Show validation records
    sleep 5  # ACM needs a moment
    log "  DNS validation records:"
    aws acm describe-certificate \
        --certificate-arn "$ACM_CERT_ARN" \
        --region "$REGION" \
        --query 'Certificate.DomainValidationOptions[*].ResourceRecord' \
        --output table 2>/dev/null || warn "  (not available yet, check in a minute)"
fi

# Check cert status
CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn "$ACM_CERT_ARN" \
    --region "$REGION" \
    --query 'Certificate.Status' \
    --output text)

if [ "$CERT_STATUS" != "ISSUED" ]; then
    warn "  Certificate status: $CERT_STATUS (need ISSUED to create HTTPS listener)"
    warn "  Add DNS validation records and re-run this script."

    # Save partial config and exit
    cat > "$CONFIG_FILE" <<EOF
# ALB Infrastructure Config (partial — cert not yet validated)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
REGION=$REGION
VPC_ID=$VPC_ID
ALB_SG_ID=$ALB_SG_ID
TG_ARN=$TG_ARN
ACM_CERT_ARN=$ACM_CERT_ARN
EC2_INSTANCE_ID=$EC2_INSTANCE_ID
SUBNET_IDS="$SUBNET_IDS"
CERT_STATUS=$CERT_STATUS
EOF
    ok "  Partial config saved to $CONFIG_FILE"
    ok "  Re-run after certificate is validated."
    exit 0
fi

ok "  Certificate status: ISSUED"

# ── Create Application Load Balancer ──────────────────────────────────────────
log "[5/6] Creating ALB: $ALB_NAME"

EXISTING_ALB=$(aws elbv2 describe-load-balancers \
    --names "$ALB_NAME" \
    --region "$REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_ALB" ] && [ "$EXISTING_ALB" != "None" ]; then
    ALB_ARN="$EXISTING_ALB"
    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns "$ALB_ARN" \
        --region "$REGION" \
        --query 'LoadBalancers[0].DNSName' \
        --output text)
    ALB_ZONE_ID=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns "$ALB_ARN" \
        --region "$REGION" \
        --query 'LoadBalancers[0].CanonicalHostedZoneId' \
        --output text)
    ok "  ALB already exists: $ALB_ARN"
else
    # Convert space-separated to proper CLI format
    SUBNET_ARGS=()
    for s in $SUBNET_IDS; do
        SUBNET_ARGS+=("$s")
    done

    ALB_ARN=$(aws elbv2 create-load-balancer \
        --name "$ALB_NAME" \
        --subnets "${SUBNET_ARGS[@]}" \
        --security-groups "$ALB_SG_ID" \
        --scheme internet-facing \
        --type application \
        --ip-address-type ipv4 \
        --tags Key=Name,Value="$ALB_NAME" Key=Project,Value=secondlayer Key=Environment,Value=prod \
        --region "$REGION" \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text)

    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns "$ALB_ARN" \
        --region "$REGION" \
        --query 'LoadBalancers[0].DNSName' \
        --output text)

    ALB_ZONE_ID=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns "$ALB_ARN" \
        --region "$REGION" \
        --query 'LoadBalancers[0].CanonicalHostedZoneId' \
        --output text)

    # Enable access logs (optional — S3 bucket needed)
    # Enable HTTP/2
    aws elbv2 modify-load-balancer-attributes \
        --load-balancer-arn "$ALB_ARN" \
        --attributes \
            Key=routing.http2.enabled,Value=true \
            Key=idle_timeout.timeout_seconds,Value=120 \
            Key=routing.http.drop_invalid_header_fields.enabled,Value=true \
        --region "$REGION" > /dev/null

    ok "  Created: $ALB_ARN"
    ok "  DNS: $ALB_DNS"
fi

# ── Create Listeners ──────────────────────────────────────────────────────────
log "[6/6] Creating listeners..."

# HTTPS listener (443)
EXISTING_HTTPS=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --region "$REGION" \
    --query "Listeners[?Port==\`443\`].ListenerArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_HTTPS" ] && [ "$EXISTING_HTTPS" != "None" ]; then
    HTTPS_LISTENER_ARN="$EXISTING_HTTPS"
    ok "  HTTPS listener already exists: $HTTPS_LISTENER_ARN"
else
    HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
        --load-balancer-arn "$ALB_ARN" \
        --protocol HTTPS \
        --port 443 \
        --certificates CertificateArn="$ACM_CERT_ARN" \
        --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
        --default-action Type=forward,TargetGroupArn="$TG_ARN" \
        --region "$REGION" \
        --query 'Listeners[0].ListenerArn' \
        --output text)
    ok "  HTTPS listener created: $HTTPS_LISTENER_ARN"
fi

# HTTP listener (80) — redirect to HTTPS
EXISTING_HTTP=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --region "$REGION" \
    --query "Listeners[?Port==\`80\`].ListenerArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_HTTP" ] && [ "$EXISTING_HTTP" != "None" ]; then
    ok "  HTTP redirect listener already exists"
else
    aws elbv2 create-listener \
        --load-balancer-arn "$ALB_ARN" \
        --protocol HTTP \
        --port 80 \
        --default-action Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
        --region "$REGION" > /dev/null
    ok "  HTTP → HTTPS redirect listener created"
fi

# ── Save config ───────────────────────────────────────────────────────────────
cat > "$CONFIG_FILE" <<EOF
# ALB Infrastructure Config — SecondLayer Production
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
REGION=$REGION
VPC_ID=$VPC_ID
ALB_SG_ID=$ALB_SG_ID
INSTANCE_SG=$INSTANCE_SG
TG_ARN=$TG_ARN
ACM_CERT_ARN=$ACM_CERT_ARN
ALB_ARN=$ALB_ARN
ALB_DNS=$ALB_DNS
ALB_ZONE_ID=$ALB_ZONE_ID
HTTPS_LISTENER_ARN=${HTTPS_LISTENER_ARN:-}
EC2_INSTANCE_ID=$EC2_INSTANCE_ID
SUBNET_IDS="$SUBNET_IDS"
CERT_STATUS=ISSUED
EOF

ok "Config saved to $CONFIG_FILE"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  ALB Setup Complete${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}ALB DNS:${NC}  $ALB_DNS"
echo -e "  ${GREEN}ALB ARN:${NC}  $ALB_ARN"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo "    1. Run  ./02-create-waf.sh  to deploy AWS WAF rules"
echo "    2. Update Cloudflare DNS: legal.org.ua → CNAME $ALB_DNS"
echo "       (replace A record $ELASTIC_IP with CNAME to ALB)"
echo "    3. Update mcp.legal.org.ua → CNAME $ALB_DNS"
echo "    4. Ensure Cloudflare SSL mode is 'Full (strict)'"
echo ""
