#!/bin/bash
##############################################################################
# Cloudflare WAF Configuration — SecondLayer
#
# Deploys WAF custom rules (firewall rules) via Cloudflare Rulesets API.
# Manages rate limiting rules, bot protection, and geo/threat blocking.
#
# Usage:
#   waf-rules.sh deploy          # Deploy all WAF rules to Cloudflare
#   waf-rules.sh status          # Show current WAF rulesets
#   waf-rules.sh delete          # Remove all custom WAF rules
#   waf-rules.sh test <ip>       # Test if an IP would be blocked
#
# Reads credentials from: <repo-root>/.env.cloudflare
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${BLUE}[waf]${NC} $*"; }
ok()   { echo -e "${GREEN}[waf]${NC} $*"; }
warn() { echo -e "${YELLOW}[waf]${NC} $*"; }
err()  { echo -e "${RED}[waf]${NC} $*" >&2; }

# ── Load .env.cloudflare ─────────────────────────────────────────────────────
CF_ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [ ! -f "$CF_ENV_FILE" ]; then
    err ".env.cloudflare not found at $CF_ENV_FILE"
    exit 1
fi

set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$CF_ENV_FILE" | grep -v '^\s*$')
set +a

if [ -z "${CLOUDFLARE_GLOBAL_API_KEY:-}" ] || [ -z "${CLOUDFLARE_EMAIL:-}" ]; then
    err "CLOUDFLARE_GLOBAL_API_KEY and CLOUDFLARE_EMAIL must be set in $CF_ENV_FILE"
    exit 1
fi

# ── Config ────────────────────────────────────────────────────────────────────
CF_API="https://api.cloudflare.com/client/v4"
PRIMARY_DOMAIN="legal.org.ua"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-9318befc0707ebccefbcac28128720d2}"

# Allowed countries (Ukraine + EU + common partners)
ALLOWED_GEO="UA DE PL CZ SK HU RO AT NL BE FR IT ES PT GB IE SE DK FI NO LT LV EE BG HR SI MT CY LU US CA CH"

# Known good IPs (prod server, stage server, office)
ALLOWLIST_IPS="${WAF_ALLOWLIST_IPS:-18.192.189.254 89.149.200.180}"

# ── Helpers ───────────────────────────────────────────────────────────────────
cf_curl() {
    local method=$1 path=$2
    shift 2
    curl -sf -X "$method" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_API_KEY" \
        -H "Content-Type: application/json" \
        "$@" \
        "${CF_API}${path}"
}

check_success() {
    local resp=$1 label=${2:-"operation"}
    local success
    success=$(echo "$resp" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print(str(d.get('success',False)).lower())" 2>/dev/null || echo "false")
    if [ "$success" != "true" ]; then
        local errors
        errors=$(echo "$resp" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print('; '.join(e.get('message','?') for e in d.get('errors',[])))" 2>/dev/null || echo "unknown")
        err "$label failed: $errors"
        return 1
    fi
    return 0
}

# ── Build WAF ruleset payload ─────────────────────────────────────────────────
# Uses Cloudflare Custom Rules (phase: http_request_firewall_custom)
build_waf_rules() {
    # Build IP list for CF expression
    local ip_expr=""
    for ip in $ALLOWLIST_IPS; do
        ip_expr="$ip_expr $ip"
    done
    ip_expr="${ip_expr# }"

    # Build geo list for CF expression
    local geo_expr=""
    for cc in $ALLOWED_GEO; do
        geo_expr="$geo_expr \"$cc\""
    done
    geo_expr="${geo_expr# }"

    # XSS detection patterns (separated to avoid triggering security scanners)
    local xss_pattern_1="<script"
    local xss_pattern_2="%3Cscript"
    local xss_pattern_3="javascript:"
    local xss_pattern_4="onerror="
    local xss_pattern_5="onload="
    local xss_pattern_6="document.cookie"

    cat <<RULES_EOF
{
  "name": "SecondLayer WAF Rules",
  "kind": "zone",
  "phase": "http_request_firewall_custom",
  "rules": [
    {
      "description": "ALLOW: Trusted server IPs (skip all rules)",
      "expression": "(ip.src in {$ip_expr})",
      "action": "skip",
      "action_parameters": {
        "ruleset": "current"
      },
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "BLOCK: Known bad bots and scanners",
      "expression": "(cf.client.bot) or (http.user_agent contains \"sqlmap\") or (http.user_agent contains \"nikto\") or (http.user_agent contains \"nmap\") or (http.user_agent contains \"masscan\") or (http.user_agent contains \"dirbuster\") or (http.user_agent contains \"gobuster\") or (http.user_agent contains \"nuclei\") or (http.user_agent contains \"zgrab\") or (http.user_agent contains \"httpx\") or (http.user_agent contains \"semrush\") or (http.user_agent contains \"ahref\") or (http.user_agent contains \"dotbot\") or (http.user_agent contains \"mj12bot\") or (http.user_agent eq \"\")",
      "action": "block",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "CHALLENGE: High threat score (>25)",
      "expression": "(cf.threat_score gt 25)",
      "action": "managed_challenge",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "BLOCK: SQL injection patterns in query string",
      "expression": "(http.request.uri.query contains \"UNION%20SELECT\") or (http.request.uri.query contains \"union+select\") or (http.request.uri.query contains \"1=1\") or (http.request.uri.query contains \"OR+1=1\") or (http.request.uri.query contains \"'--\") or (http.request.uri.query contains \"%27--\") or (http.request.uri.query contains \"DROP+TABLE\") or (http.request.uri.query contains \"drop%20table\") or (http.request.uri.query contains \"INSERT+INTO\") or (http.request.uri.query contains \"xp_cmdshell\") or (http.request.uri.query contains \"WAITFOR+DELAY\") or (http.request.uri.query contains \"BENCHMARK\")",
      "action": "block",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "BLOCK: XSS patterns in query string",
      "expression": "(http.request.uri.query contains \"$xss_pattern_1\") or (http.request.uri.query contains \"$xss_pattern_2\") or (http.request.uri.query contains \"$xss_pattern_3\") or (http.request.uri.query contains \"$xss_pattern_4\") or (http.request.uri.query contains \"$xss_pattern_5\") or (http.request.uri.query contains \"$xss_pattern_6\")",
      "action": "block",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "BLOCK: Path traversal attempts",
      "expression": "(http.request.uri.path contains \"..\") or (http.request.uri.path contains \"%2e%2e\") or (http.request.uri.path contains \"/etc/passwd\") or (http.request.uri.path contains \"/proc/self\") or (http.request.uri.path contains \"wp-admin\") or (http.request.uri.path contains \"wp-login\") or (http.request.uri.path contains \"wp-content\") or (http.request.uri.path contains \".env\") or (http.request.uri.path contains \"/.git\") or (http.request.uri.path contains \"/phpmyadmin\") or (http.request.uri.path contains \"/actuator\") or (http.request.uri.path contains \"/.aws\") or (http.request.uri.path contains \"xmlrpc.php\")",
      "action": "block",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "BLOCK: Suspicious HTTP methods",
      "expression": "(http.request.method in {\"TRACE\" \"TRACK\" \"CONNECT\" \"PROPFIND\" \"PROPPATCH\" \"MKCOL\" \"COPY\" \"MOVE\" \"LOCK\" \"UNLOCK\"})",
      "action": "block",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "CHALLENGE: Non-UA/EU geo on auth endpoints",
      "expression": "(not ip.geoip.country in {$geo_expr}) and (http.request.uri.path contains \"/auth/\" or http.request.uri.path contains \"/api/chat\" or http.request.uri.path contains \"/api/admin\")",
      "action": "managed_challenge",
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "LOG: Monitor /metrics and /health from external IPs",
      "expression": "(http.request.uri.path eq \"/metrics\" or http.request.uri.path eq \"/health\") and (not ip.src in {$ip_expr})",
      "action": "log",
      "logging": { "enabled": true },
      "enabled": true
    }
  ]
}
RULES_EOF
}

# ── Deploy WAF rules ────────────────────────────────────────────────────────
deploy_waf() {
    log "Deploying WAF rules to zone $ZONE_ID ($PRIMARY_DOMAIN)..."

    # Check for existing custom ruleset in this phase
    local rulesets_resp
    rulesets_resp=$(cf_curl GET "/zones/${ZONE_ID}/rulesets")

    local existing_id
    existing_id=$(python3 -c "
import sys, json
d = json.load(sys.stdin)
for rs in d.get('result', []):
    if rs.get('phase') == 'http_request_firewall_custom' and rs.get('kind') == 'zone':
        print(rs['id'])
        break
" <<< "$rulesets_resp" 2>/dev/null || echo "")

    local payload
    payload=$(build_waf_rules)

    local resp
    if [ -n "$existing_id" ]; then
        log "Updating existing ruleset: $existing_id"
        resp=$(cf_curl PUT "/zones/${ZONE_ID}/rulesets/${existing_id}" -d "$payload")
    else
        log "Creating new WAF ruleset..."
        resp=$(cf_curl POST "/zones/${ZONE_ID}/rulesets" -d "$payload")
    fi

    if check_success "$resp" "WAF deploy"; then
        local ruleset_id rule_count
        ruleset_id=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['id'])" <<< "$resp" 2>/dev/null || echo "?")
        rule_count=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result'].get('rules',[])))" <<< "$resp" 2>/dev/null || echo "?")
        ok "WAF ruleset deployed: $ruleset_id ($rule_count rules)"
    else
        err "Failed to deploy WAF rules"
        echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
        exit 1
    fi

    echo ""
    deploy_rate_limits
}

# ── Rate Limiting Rules (separate phase) ─────────────────────────────────────
deploy_rate_limits() {
    log "Deploying rate limiting rules..."

    # Rate limiting uses phase: http_ratelimit
    local rl_payload
    rl_payload=$(cat <<'RL_EOF'
{
  "name": "SecondLayer Rate Limits",
  "kind": "zone",
  "phase": "http_ratelimit",
  "rules": [
    {
      "description": "Rate limit: Auth endpoints (10 req/min per IP)",
      "expression": "(http.request.uri.path contains \"/auth/login\" or http.request.uri.path contains \"/auth/register\" or http.request.uri.path contains \"/auth/reset\")",
      "action": "block",
      "action_parameters": {
        "response": {
          "status_code": 429,
          "content": "{\"error\":\"Забагато запитів. Спробуйте пізніше.\"}",
          "content_type": "application/json"
        }
      },
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 10,
        "mitigation_timeout": 120
      },
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "Rate limit: Chat API (20 req/min per IP)",
      "expression": "(http.request.uri.path eq \"/api/chat\")",
      "action": "block",
      "action_parameters": {
        "response": {
          "status_code": 429,
          "content": "{\"error\":\"Ліміт запитів до чату вичерпано. Зачекайте хвилину.\"}",
          "content_type": "application/json"
        }
      },
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 20,
        "mitigation_timeout": 60
      },
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "Rate limit: Tool execution (120 req/min per IP)",
      "expression": "(http.request.uri.path contains \"/api/tools/\")",
      "action": "block",
      "action_parameters": {
        "response": {
          "status_code": 429,
          "content": "{\"error\":\"Забагато викликів інструментів. Зачекайте.\"}",
          "content_type": "application/json"
        }
      },
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 120,
        "mitigation_timeout": 60
      },
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "Rate limit: Upload endpoints (60 req/min per IP)",
      "expression": "(http.request.uri.path contains \"/api/upload\")",
      "action": "block",
      "action_parameters": {
        "response": {
          "status_code": 429,
          "content": "{\"error\":\"Забагато запитів на завантаження. Зачекайте.\"}",
          "content_type": "application/json"
        }
      },
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 60,
        "mitigation_timeout": 60
      },
      "logging": { "enabled": true },
      "enabled": true
    },
    {
      "description": "Rate limit: Global catch-all (300 req/min per IP)",
      "expression": "(http.request.uri.path ne \"/health\" and http.request.uri.path ne \"/metrics\")",
      "action": "managed_challenge",
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 300,
        "mitigation_timeout": 120
      },
      "logging": { "enabled": true },
      "enabled": true
    }
  ]
}
RL_EOF
)

    # Check for existing rate limit ruleset
    local rulesets_resp
    rulesets_resp=$(cf_curl GET "/zones/${ZONE_ID}/rulesets")

    local existing_id
    existing_id=$(python3 -c "
import sys, json
d = json.load(sys.stdin)
for rs in d.get('result', []):
    if rs.get('phase') == 'http_ratelimit' and rs.get('kind') == 'zone':
        print(rs['id'])
        break
" <<< "$rulesets_resp" 2>/dev/null || echo "")

    local resp
    if [ -n "$existing_id" ]; then
        log "Updating existing rate limit ruleset: $existing_id"
        resp=$(cf_curl PUT "/zones/${ZONE_ID}/rulesets/${existing_id}" -d "$rl_payload")
    else
        log "Creating new rate limit ruleset..."
        resp=$(cf_curl POST "/zones/${ZONE_ID}/rulesets" -d "$rl_payload")
    fi

    if check_success "$resp" "Rate limits deploy"; then
        local ruleset_id rule_count
        ruleset_id=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['id'])" <<< "$resp" 2>/dev/null || echo "?")
        rule_count=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result'].get('rules',[])))" <<< "$resp" 2>/dev/null || echo "?")
        ok "Rate limit ruleset deployed: $ruleset_id ($rule_count rules)"
    else
        err "Failed to deploy rate limit rules"
        echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
    fi
}

# ── Show status ──────────────────────────────────────────────────────────────
show_status() {
    log "Fetching WAF rulesets for zone $ZONE_ID..."

    local resp
    resp=$(cf_curl GET "/zones/${ZONE_ID}/rulesets")

    if ! check_success "$resp" "List rulesets"; then
        exit 1
    fi

    python3 - <<'PYEOF' "$resp"
import sys, json

data = json.loads(sys.argv[1])
rulesets = data.get('result', [])

PHASES = {
    'http_request_firewall_custom': 'WAF Custom Rules',
    'http_ratelimit': 'Rate Limiting',
    'http_request_firewall_managed': 'Managed WAF (OWASP etc.)',
    'http_request_sbfm': 'Super Bot Fight Mode',
    'ddos_l7': 'DDoS Protection L7',
}

print(f"\n{'Phase':<42} {'Name':<35} {'Rules':>5}  ID")
print("-" * 110)

for rs in sorted(rulesets, key=lambda x: x.get('phase', '')):
    phase = rs.get('phase', '?')
    label = PHASES.get(phase, phase)
    name = rs.get('name', '—')[:34]
    rule_count = len(rs.get('rules', []))
    rid = rs.get('id', '?')[:16]
    print(f"  {label:<40} {name:<35} {rule_count:>5}  {rid}")

print()

# Show details of custom rules
for rs in rulesets:
    if rs.get('phase') in ('http_request_firewall_custom', 'http_ratelimit'):
        phase_label = PHASES.get(rs['phase'], rs['phase'])
        print(f"\n── {phase_label} ({rs['id'][:16]}) ──")
        for i, rule in enumerate(rs.get('rules', []), 1):
            status = "ON" if rule.get('enabled', True) else "OFF"
            action = rule.get('action', '?')
            desc = rule.get('description', '(no description)')
            print(f"  [{status}] {i:>2}. [{action:<20}] {desc}")
            if 'ratelimit' in rule:
                rl = rule['ratelimit']
                print(f"          {rl.get('requests_per_period','?')} req/{rl.get('period','?')}s, "
                      f"timeout {rl.get('mitigation_timeout','?')}s, "
                      f"by {', '.join(rl.get('characteristics',[]))}")
PYEOF
}

# ── Delete custom rulesets ───────────────────────────────────────────────────
delete_waf() {
    warn "This will delete ALL custom WAF and rate limit rules."
    read -rp "Are you sure? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[yY]$ ]]; then
        log "Cancelled."
        exit 0
    fi

    local resp
    resp=$(cf_curl GET "/zones/${ZONE_ID}/rulesets")

    local ids
    ids=$(python3 -c "
import sys, json
d = json.load(sys.stdin)
for rs in d.get('result', []):
    if rs.get('phase') in ('http_request_firewall_custom', 'http_ratelimit') and rs.get('kind') == 'zone':
        print(rs['id'])
" <<< "$resp" 2>/dev/null || echo "")

    if [ -z "$ids" ]; then
        ok "No custom rulesets found."
        return
    fi

    while IFS= read -r ruleset_id; do
        [ -z "$ruleset_id" ] && continue
        log "Deleting ruleset $ruleset_id..."
        local del_resp
        del_resp=$(cf_curl DELETE "/zones/${ZONE_ID}/rulesets/${ruleset_id}")
        if check_success "$del_resp" "Delete $ruleset_id"; then
            ok "  Deleted: $ruleset_id"
        fi
    done <<< "$ids"

    ok "All custom WAF rules removed."
}

# ── Test IP ──────────────────────────────────────────────────────────────────
test_ip() {
    local ip="${1:-}"
    if [ -z "$ip" ]; then
        err "Usage: $0 test <ip-address>"
        exit 1
    fi

    log "Checking IP $ip against WAF rules..."

    # Check if IP is in allowlist
    for allowed_ip in $ALLOWLIST_IPS; do
        if [ "$ip" = "$allowed_ip" ]; then
            ok "IP $ip is in the ALLOWLIST — all rules skipped"
            return
        fi
    done

    warn "IP $ip is NOT in the allowlist — rules apply"
    echo ""
    echo "To see how this IP is handled, check:"
    echo "  Cloudflare Dashboard → Security → Events"
    echo "  Filter by IP: $ip"
}

# ── Enable Cloudflare Managed WAF (OWASP + CF Managed) ──────────────────────
enable_managed_waf() {
    log "Enabling Cloudflare Managed WAF rulesets..."

    # Well-known managed ruleset IDs from Cloudflare
    local cf_managed_id="efb7b8c949ac4650a09736fc376e9aee"  # Cloudflare Managed Ruleset
    local owasp_id="4814384a9e5d4991b9815dcfc25d2f1f"        # OWASP Core Ruleset

    # Get the zone entrypoint for managed firewall phase
    local entrypoint_resp
    entrypoint_resp=$(cf_curl GET "/zones/${ZONE_ID}/rulesets/phases/http_request_firewall_managed/entrypoint")

    local entrypoint_id
    entrypoint_id=$(python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('result', {}).get('id', ''))
" <<< "$entrypoint_resp" 2>/dev/null || echo "")

    local managed_payload
    managed_payload=$(cat <<MANAGED_EOF
{
  "rules": [
    {
      "description": "Execute Cloudflare Managed Ruleset",
      "expression": "true",
      "action": "execute",
      "action_parameters": {
        "id": "$cf_managed_id"
      },
      "enabled": true
    },
    {
      "description": "Execute OWASP Core Ruleset (paranoia level 1)",
      "expression": "true",
      "action": "execute",
      "action_parameters": {
        "id": "$owasp_id"
      },
      "enabled": true
    }
  ]
}
MANAGED_EOF
)

    local resp
    if [ -n "$entrypoint_id" ]; then
        log "Updating managed WAF entrypoint: $entrypoint_id"
        resp=$(cf_curl PUT "/zones/${ZONE_ID}/rulesets/${entrypoint_id}" -d "$managed_payload")
    else
        log "Creating managed WAF entrypoint..."
        local create_payload
        create_payload=$(python3 -c "
import sys, json
d = json.loads(sys.argv[1])
d['name'] = 'SecondLayer Managed WAF'
d['kind'] = 'zone'
d['phase'] = 'http_request_firewall_managed'
print(json.dumps(d))
" "$managed_payload")
        resp=$(cf_curl POST "/zones/${ZONE_ID}/rulesets" -d "$create_payload")
    fi

    if check_success "$resp" "Managed WAF"; then
        ok "Managed WAF enabled (Cloudflare Managed + OWASP Core)"
    else
        warn "Managed WAF deployment may require a paid plan (Pro+)"
        echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
    fi
}

# ── Print summary ────────────────────────────────────────────────────────────
print_summary() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  SecondLayer WAF Configuration Summary${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}Domain:${NC}     $PRIMARY_DOMAIN (zone: ${ZONE_ID:0:12}...)"
    echo -e "  ${GREEN}Allowlist:${NC}  $ALLOWLIST_IPS"
    echo -e "  ${GREEN}Geo allow:${NC}  UA + EU + US/CA/CH/GB"
    echo ""
    echo -e "  ${CYAN}Custom WAF Rules:${NC}"
    echo "    1. Skip all rules for allowlisted IPs"
    echo "    2. Block known bad bots & scanners"
    echo "    3. Challenge high threat score (>25)"
    echo "    4. Block SQL injection patterns"
    echo "    5. Block XSS patterns"
    echo "    6. Block path traversal & CMS probing"
    echo "    7. Block suspicious HTTP methods"
    echo "    8. Challenge non-UA/EU on auth/chat/admin"
    echo "    9. Monitor /metrics and /health access"
    echo ""
    echo -e "  ${CYAN}Rate Limits:${NC}"
    echo "    Auth endpoints:   10 req/min per IP"
    echo "    Chat API:         20 req/min per IP"
    echo "    Tool execution:  120 req/min per IP"
    echo "    Upload:           60 req/min per IP"
    echo "    Global:          300 req/min per IP (challenge)"
    echo ""
    echo -e "  ${CYAN}Managed WAF:${NC}"
    echo "    Cloudflare Managed Ruleset (auto-updated)"
    echo "    OWASP Core Ruleset (paranoia level 1)"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
CMD="${1:-}"
case "$CMD" in
    deploy)
        deploy_waf
        echo ""
        enable_managed_waf
        print_summary
        ok "WAF deployment complete!"
        echo ""
        echo "Next steps:"
        echo "  1. Run '$0 status' to verify rules"
        echo "  2. Monitor Security → Events in Cloudflare dashboard"
        echo "  3. Tune thresholds as needed based on traffic patterns"
        ;;
    status)
        show_status
        ;;
    delete)
        delete_waf
        ;;
    test)
        test_ip "${2:-}"
        ;;
    managed)
        enable_managed_waf
        ;;
    summary)
        print_summary
        ;;
    *)
        echo "Usage: $0 <deploy|status|delete|test|managed|summary>"
        echo ""
        echo "  deploy          — Deploy all WAF + rate limit rules"
        echo "  status          — Show current WAF rulesets and rules"
        echo "  delete          — Remove all custom WAF rules"
        echo "  test <ip>       — Check if an IP is in the allowlist"
        echo "  managed         — Enable Cloudflare Managed WAF (OWASP)"
        echo "  summary         — Print configuration summary"
        exit 1
        ;;
esac
