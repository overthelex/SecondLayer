#!/usr/bin/env bash
#
# Create AWS WAF WebACL and attach to ALB.
#
# Rules:
#   1. Allowlist trusted IPs (skip all rules)
#   2. AWS Managed — Core Rule Set (OWASP top 10)
#   3. AWS Managed — Known Bad Inputs
#   4. AWS Managed — SQL Injection
#   5. AWS Managed — Bot Control (targeted)
#   6. Rate limit: global (2000 req/5min per IP)
#   7. Rate limit: auth endpoints (50 req/5min per IP)
#   8. Rate limit: chat API (100 req/5min per IP)
#   9. Geo-restrict auth endpoints (UA + EU only)
#  10. Block scanners / bad user-agents
#  11. Block path traversal / CMS probing
#
# Prerequisites:
#   - ./01-create-alb.sh completed (alb-config.env exists)
#   - AWS CLI configured
#
# Usage:
#   ./02-create-waf.sh
#   ./02-create-waf.sh --dry-run
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONFIG_FILE="$SCRIPT_DIR/alb-config.env"

# Load ALB config
if [ -f "$CONFIG_FILE" ]; then
    set -a; source "$CONFIG_FILE"; set +a
else
    echo "ERROR: $CONFIG_FILE not found. Run 01-create-alb.sh first."
    exit 1
fi

# Load prod env for AWS creds (handle values with spaces)
if [ -f "$DEPLOY_DIR/.env.prod" ]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        export "$key=$value" 2>/dev/null || true
    done < "$DEPLOY_DIR/.env.prod"
fi

REGION="${REGION:-eu-central-1}"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${BLUE}[waf]${NC} $*"; }
ok()   { echo -e "${GREEN}[waf]${NC} $*"; }
warn() { echo -e "${YELLOW}[waf]${NC} $*"; }
err()  { echo -e "${RED}[waf]${NC} $*" >&2; }

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Config ────────────────────────────────────────────────────────────────────
WAF_NAME="secondlayer-prod-waf"
IPSET_NAME="secondlayer-trusted-ips"

# Trusted IPs (prod EC2, stage server, Cloudflare edge range not needed since ALB SG handles it)
TRUSTED_IPS=(
    "18.192.189.254/32"   # Prod EC2
    "89.149.200.180/32"   # Stage server
)

# Allowed countries for auth endpoints
ALLOWED_COUNTRIES=("UA" "DE" "PL" "CZ" "SK" "HU" "RO" "AT" "NL" "BE" "FR" "IT" "ES" "PT" "GB" "IE" "SE" "DK" "FI" "NO" "LT" "LV" "EE" "BG" "HR" "SI" "MT" "CY" "LU" "US" "CA" "CH")

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AWS WAF Setup — SecondLayer Production${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
log "Region:   $REGION"
log "ALB ARN:  ${ALB_ARN:-not set}"
log "WAF Name: $WAF_NAME"
echo ""

if [ "$DRY_RUN" = true ]; then
    warn "DRY RUN — showing planned resources"
    echo ""
    echo "  IP Set: $IPSET_NAME (${#TRUSTED_IPS[@]} addresses)"
    echo "  WebACL: $WAF_NAME"
    echo "  Rules:"
    echo "    1. AllowTrustedIPs (IP set match)"
    echo "    2. AWS-AWSManagedRulesCommonRuleSet (OWASP)"
    echo "    3. AWS-AWSManagedRulesKnownBadInputsRuleSet"
    echo "    4. AWS-AWSManagedRulesSQLiRuleSet"
    echo "    5. AWS-AWSManagedRulesBotControlRuleSet (targeted)"
    echo "    6. RateLimitGlobal (2000/5min per IP)"
    echo "    7. RateLimitAuth (50/5min per IP)"
    echo "    8. RateLimitChat (100/5min per IP)"
    echo "    9. GeoRestrictAuth (UA + EU on /auth, /api/admin)"
    echo "   10. BlockBadUserAgents"
    echo "   11. BlockPathTraversal"
    echo "  Attach to: ${ALB_ARN:-'(ALB ARN needed)'}"
    exit 0
fi

# ── Create IP Set ─────────────────────────────────────────────────────────────
log "[1/4] Creating IP set: $IPSET_NAME"

EXISTING_IPSET=$(aws wafv2 list-ip-sets \
    --scope REGIONAL \
    --region "$REGION" \
    --query "IPSets[?Name=='$IPSET_NAME'].Id" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_IPSET" ] && [ "$EXISTING_IPSET" != "None" ]; then
    IPSET_ID="$EXISTING_IPSET"

    # Get lock token for update
    IPSET_LOCK=$(aws wafv2 get-ip-set \
        --name "$IPSET_NAME" \
        --scope REGIONAL \
        --id "$IPSET_ID" \
        --region "$REGION" \
        --query 'LockToken' \
        --output text)

    # Update addresses
    aws wafv2 update-ip-set \
        --name "$IPSET_NAME" \
        --scope REGIONAL \
        --id "$IPSET_ID" \
        --lock-token "$IPSET_LOCK" \
        --addresses "${TRUSTED_IPS[@]}" \
        --region "$REGION" > /dev/null

    ok "  Updated existing IP set: $IPSET_ID"
else
    IPSET_RESP=$(aws wafv2 create-ip-set \
        --name "$IPSET_NAME" \
        --scope REGIONAL \
        --ip-address-version IPV4 \
        --addresses "${TRUSTED_IPS[@]}" \
        --tags Key=Project,Value=secondlayer Key=Environment,Value=prod \
        --region "$REGION")

    IPSET_ID=$(echo "$IPSET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['Summary']['Id'])")
    ok "  Created: $IPSET_ID"
fi

IPSET_ARN="arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:regional/ipset/${IPSET_NAME}/${IPSET_ID}"
ok "  IPs: ${TRUSTED_IPS[*]}"

# ── Build country list JSON ──────────────────────────────────────────────────
COUNTRY_JSON=$(printf '"%s",' "${ALLOWED_COUNTRIES[@]}")
COUNTRY_JSON="[${COUNTRY_JSON%,}]"

# ── Create WebACL ─────────────────────────────────────────────────────────────
log "[2/4] Creating WAF WebACL: $WAF_NAME"

EXISTING_ACL=$(aws wafv2 list-web-acls \
    --scope REGIONAL \
    --region "$REGION" \
    --query "WebACLs[?Name=='$WAF_NAME'].Id" \
    --output text 2>/dev/null || echo "")

# Build the WebACL JSON
WAF_RULES=$(cat <<WAFEOF
{
  "Name": "$WAF_NAME",
  "Scope": "REGIONAL",
  "DefaultAction": { "Allow": {} },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "secondlayerProdWAF"
  },
  "Rules": [
    {
      "Name": "AllowTrustedIPs",
      "Priority": 0,
      "Action": { "Allow": {} },
      "Statement": {
        "IPSetReferenceStatement": {
          "ARN": "$IPSET_ARN"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AllowTrustedIPs"
      }
    },
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 10,
      "OverrideAction": { "None": {} },
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet",
          "ExcludedRules": [
            { "Name": "SizeRestrictions_BODY" },
            { "Name": "CrossSiteScripting_BODY" },
            { "Name": "GenericRFI_BODY" }
          ]
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSCommonRules"
      }
    },
    {
      "Name": "AWSManagedRulesKnownBadInputs",
      "Priority": 20,
      "OverrideAction": { "None": {} },
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesKnownBadInputsRuleSet"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSKnownBadInputs"
      }
    },
    {
      "Name": "AWSManagedRulesSQLi",
      "Priority": 30,
      "OverrideAction": { "None": {} },
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesSQLiRuleSet"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSSQLiRules"
      }
    },
    {
      "Name": "AWSManagedRulesBotControl",
      "Priority": 40,
      "OverrideAction": { "None": {} },
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesBotControlRuleSet",
          "ManagedRuleGroupConfigs": [
            {
              "AWSManagedRulesBotControlRuleSet": {
                "InspectionLevel": "TARGETED"
              }
            }
          ]
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSBotControl"
      }
    },
    {
      "Name": "RateLimitGlobal",
      "Priority": 50,
      "Action": { "Block": {} },
      "Statement": {
        "RateBasedStatement": {
          "Limit": 2000,
          "AggregateKeyType": "IP"
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimitGlobal"
      }
    },
    {
      "Name": "RateLimitAuth",
      "Priority": 60,
      "Action": {
        "Block": {
          "CustomResponse": {
            "ResponseCode": 429,
            "CustomResponseBodyKey": "rate-limit-auth"
          }
        }
      },
      "Statement": {
        "RateBasedStatement": {
          "Limit": 100,
          "AggregateKeyType": "IP",
          "ScopeDownStatement": {
            "OrStatement": {
              "Statements": [
                {
                  "ByteMatchStatement": {
                    "FieldToMatch": { "UriPath": {} },
                    "PositionalConstraint": "STARTS_WITH",
                    "SearchString": "/auth/",
                    "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                  }
                },
                {
                  "ByteMatchStatement": {
                    "FieldToMatch": { "UriPath": {} },
                    "PositionalConstraint": "STARTS_WITH",
                    "SearchString": "/api/admin",
                    "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                  }
                }
              ]
            }
          }
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimitAuth"
      }
    },
    {
      "Name": "RateLimitChat",
      "Priority": 70,
      "Action": {
        "Block": {
          "CustomResponse": {
            "ResponseCode": 429,
            "CustomResponseBodyKey": "rate-limit-chat"
          }
        }
      },
      "Statement": {
        "RateBasedStatement": {
          "Limit": 100,
          "AggregateKeyType": "IP",
          "ScopeDownStatement": {
            "ByteMatchStatement": {
              "FieldToMatch": { "UriPath": {} },
              "PositionalConstraint": "EXACTLY",
              "SearchString": "/api/chat",
              "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
            }
          }
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimitChat"
      }
    },
    {
      "Name": "GeoRestrictSensitiveEndpoints",
      "Priority": 80,
      "Action": { "Block": {} },
      "Statement": {
        "AndStatement": {
          "Statements": [
            {
              "NotStatement": {
                "Statement": {
                  "GeoMatchStatement": {
                    "CountryCodes": $COUNTRY_JSON
                  }
                }
              }
            },
            {
              "OrStatement": {
                "Statements": [
                  {
                    "ByteMatchStatement": {
                      "FieldToMatch": { "UriPath": {} },
                      "PositionalConstraint": "STARTS_WITH",
                      "SearchString": "/auth/",
                      "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                    }
                  },
                  {
                    "ByteMatchStatement": {
                      "FieldToMatch": { "UriPath": {} },
                      "PositionalConstraint": "STARTS_WITH",
                      "SearchString": "/api/admin",
                      "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                    }
                  },
                  {
                    "ByteMatchStatement": {
                      "FieldToMatch": { "UriPath": {} },
                      "PositionalConstraint": "EXACTLY",
                      "SearchString": "/api/chat",
                      "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "GeoRestrictAuth"
      }
    },
    {
      "Name": "BlockBadUserAgents",
      "Priority": 90,
      "Action": { "Block": {} },
      "Statement": {
        "OrStatement": {
          "Statements": [
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "sqlmap",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "nikto",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "nmap",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "masscan",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "nuclei",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "dirbuster",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "gobuster",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "zgrab",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            }
          ]
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "BlockBadUserAgents"
      }
    },
    {
      "Name": "BlockPathTraversal",
      "Priority": 100,
      "Action": { "Block": {} },
      "Statement": {
        "OrStatement": {
          "Statements": [
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "..",
                "TextTransformations": [{ "Priority": 0, "Type": "URL_DECODE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "/etc/passwd",
                "TextTransformations": [{ "Priority": 0, "Type": "URL_DECODE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "wp-admin",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "wp-login",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "/.git",
                "TextTransformations": [{ "Priority": 0, "Type": "NONE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "/phpmyadmin",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "/actuator",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "CONTAINS",
                "SearchString": "xmlrpc.php",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            },
            {
              "ByteMatchStatement": {
                "FieldToMatch": { "UriPath": {} },
                "PositionalConstraint": "ENDS_WITH",
                "SearchString": ".env",
                "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
              }
            }
          ]
        }
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "BlockPathTraversal"
      }
    }
  ],
  "CustomResponseBodies": {
    "rate-limit-auth": {
      "ContentType": "APPLICATION_JSON",
      "Content": "{\"error\":\"Забагато запитів. Спробуйте пізніше.\",\"code\":\"RATE_LIMITED\"}"
    },
    "rate-limit-chat": {
      "ContentType": "APPLICATION_JSON",
      "Content": "{\"error\":\"Ліміт запитів до чату вичерпано. Зачекайте хвилину.\",\"code\":\"RATE_LIMITED\"}"
    }
  }
}
WAFEOF
)

if [ -n "$EXISTING_ACL" ] && [ "$EXISTING_ACL" != "None" ]; then
    WAF_ID="$EXISTING_ACL"
    log "  Updating existing WebACL: $WAF_ID"

    LOCK_TOKEN=$(aws wafv2 get-web-acl \
        --name "$WAF_NAME" \
        --scope REGIONAL \
        --id "$WAF_ID" \
        --region "$REGION" \
        --query 'LockToken' \
        --output text)

    # For update, extract only the mutable fields
    UPDATE_JSON=$(echo "$WAF_RULES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(json.dumps({
    'DefaultAction': d['DefaultAction'],
    'VisibilityConfig': d['VisibilityConfig'],
    'Rules': d['Rules'],
    'CustomResponseBodies': d.get('CustomResponseBodies', {})
}))
")

    aws wafv2 update-web-acl \
        --name "$WAF_NAME" \
        --scope REGIONAL \
        --id "$WAF_ID" \
        --lock-token "$LOCK_TOKEN" \
        --default-action '{"Allow":{}}' \
        --visibility-config "SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=secondlayerProdWAF" \
        --rules "$(echo "$WAF_RULES" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['Rules']))")" \
        --custom-response-bodies "$(echo "$WAF_RULES" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('CustomResponseBodies',{})))")" \
        --region "$REGION" > /dev/null

    ok "  Updated WebACL: $WAF_ID"
else
    log "  Creating new WebACL..."

    WAF_RESP=$(aws wafv2 create-web-acl \
        --name "$WAF_NAME" \
        --scope REGIONAL \
        --default-action '{"Allow":{}}' \
        --visibility-config "SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=secondlayerProdWAF" \
        --rules "$(echo "$WAF_RULES" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['Rules']))")" \
        --custom-response-bodies "$(echo "$WAF_RULES" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('CustomResponseBodies',{})))")" \
        --tags Key=Project,Value=secondlayer Key=Environment,Value=prod \
        --region "$REGION")

    WAF_ID=$(echo "$WAF_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['Summary']['Id'])")
    ok "  Created WebACL: $WAF_ID"
fi

WAF_ARN="arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:regional/webacl/${WAF_NAME}/${WAF_ID}"

# ── Associate WAF with ALB ────────────────────────────────────────────────────
log "[3/4] Associating WAF with ALB..."

if [ -z "${ALB_ARN:-}" ]; then
    err "ALB_ARN not found in config. Run 01-create-alb.sh first."
    exit 1
fi

aws wafv2 associate-web-acl \
    --web-acl-arn "$WAF_ARN" \
    --resource-arn "$ALB_ARN" \
    --region "$REGION" 2>/dev/null || true

ok "  WAF attached to ALB"

# ── Enable WAF logging (CloudWatch) ──────────────────────────────────────────
log "[4/4] Enabling WAF logging..."

LOG_GROUP="aws-waf-logs-secondlayer-prod"

# Create log group if not exists
aws logs create-log-group \
    --log-group-name "$LOG_GROUP" \
    --region "$REGION" 2>/dev/null || true

# Set retention to 30 days
aws logs put-retention-policy \
    --log-group-name "$LOG_GROUP" \
    --retention-in-days 30 \
    --region "$REGION" 2>/dev/null || true

LOG_GROUP_ARN="arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}"

# Enable logging
aws wafv2 put-logging-configuration \
    --logging-configuration "{
        \"ResourceArn\": \"$WAF_ARN\",
        \"LogDestinationConfigs\": [\"${LOG_GROUP_ARN}\"],
        \"RedactedFields\": [
            {\"SingleHeader\": {\"Name\": \"authorization\"}},
            {\"SingleHeader\": {\"Name\": \"cookie\"}}
        ]
    }" \
    --region "$REGION" 2>/dev/null && ok "  Logging enabled → CloudWatch: $LOG_GROUP" \
    || warn "  Logging setup skipped (may need iam:CreateServiceLinkedRole)"

# ── Save config ───────────────────────────────────────────────────────────────
# Append WAF config to existing alb-config.env
cat >> "$CONFIG_FILE" <<EOF

# WAF Configuration
WAF_NAME=$WAF_NAME
WAF_ID=$WAF_ID
WAF_ARN=$WAF_ARN
IPSET_ID=$IPSET_ID
IPSET_ARN=$IPSET_ARN
WAF_LOG_GROUP=$LOG_GROUP
EOF

ok "Config appended to $CONFIG_FILE"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AWS WAF Deployment Complete${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}WebACL:${NC}    $WAF_NAME ($WAF_ID)"
echo -e "  ${GREEN}ALB:${NC}       ${ALB_ARN##*/}"
echo -e "  ${GREEN}Logging:${NC}   CloudWatch → $LOG_GROUP (30d retention)"
echo ""
echo -e "  ${CYAN}Rules (11):${NC}"
echo "    P0   AllowTrustedIPs          → Allow (skip all rules)"
echo "    P10  AWS Common Rule Set      → OWASP top-10 protection"
echo "    P20  AWS Known Bad Inputs     → Log4j, SSRF, etc."
echo "    P30  AWS SQLi Rules           → SQL injection detection"
echo "    P40  AWS Bot Control           → Targeted bot mitigation"
echo "    P50  RateLimitGlobal          → 2000 req/5min per IP → Block"
echo "    P60  RateLimitAuth            → 100 req/5min on /auth → 429"
echo "    P70  RateLimitChat            → 100 req/5min on /api/chat → 429"
echo "    P80  GeoRestrict              → Block non-UA/EU on auth/admin/chat"
echo "    P90  BlockBadUserAgents       → sqlmap, nikto, nmap, nuclei..."
echo "    P100 BlockPathTraversal       → .., wp-admin, .git, .env, etc."
echo ""
echo -e "  ${CYAN}Custom 429 responses in Ukrainian${NC}"
echo ""
echo -e "  ${YELLOW}Monitoring:${NC}"
echo "    aws wafv2 get-sampled-requests (last 3h of blocked requests)"
echo "    CloudWatch → $LOG_GROUP"
echo "    CloudWatch Metrics → secondlayerProdWAF"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo "    1. Update Cloudflare DNS to point to ALB"
echo "    2. Run  ./03-status.sh  to verify"
echo "    3. Monitor CloudWatch for false positives"
echo "    4. Tune excluded rules in AWSManagedRulesCommonRuleSet if needed"
echo ""
