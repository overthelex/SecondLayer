#!/usr/bin/env bash
# Test chat tool coverage — sends queries designed to trigger each MCP tool domain
# Usage: CHAT_AUDIT_JWT=... ./test-chat-tool-coverage.sh [base_url]

set -euo pipefail

BASE_URL="${1:-https://legal.org.ua}"
JWT="${CHAT_AUDIT_JWT:-}"
DELAY_BETWEEN="${DELAY_BETWEEN:-15}"  # seconds between queries to avoid Bedrock throttling
MAX_RETRIES=2
RETRY_DELAY=30

if [ -z "$JWT" ]; then
  echo "ERROR: Set CHAT_AUDIT_JWT env var with a valid JWT token"
  exit 1
fi

RESULTS_DIR="/home/vovkes/SecondLayer/scripts/testing/chat-audit-results"
mkdir -p "$RESULTS_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

declare -A QUERIES

# 1. Case number lookup (get_case_documents_chain, fast plan)
QUERIES["01_case_number"]="Знайди всі документи по справі №904/3256/23"

# 2. EDRPOU lookup (openreyestr_get_by_edrpou, fast plan)
QUERIES["02_edrpou"]="Знайди інформацію про компанію з ЄДРПОУ 00032112"

# 3. Legislation article (get_legislation_article, fast plan)
QUERIES["03_legislation_article"]="Стаття 16 Цивільного кодексу України"

# 4. Deputy info (rada_get_deputy_info, fast plan)
QUERIES["04_deputy"]="Інформація про народного депутата Гончаренко Олексій"

# 5. EDRSR fulltext search (search_edrsr_fulltext)
QUERIES["05_edrsr_fulltext"]="Знайди рішення судів де згадується самовільне будівництво на орендованій землі"

# 6. EDRSR semantic search (search_edrsr_semantic)
QUERIES["06_edrsr_semantic"]="Судова практика щодо визнання недійсним договору оренди землі через обман"

# 7. Practice analysis / compare_practice_pro_contra
QUERIES["07_practice_analysis"]="Порівняй позитивну та негативну практику КГС ВС щодо стягнення упущеної вигоди за договором поставки"

# 8. Legislation search (search_legislation)
QUERIES["08_legislation_search"]="Які норми регулюють відповідальність за порушення авторських прав в Україні?"

# 9. Supreme Court practice (search_supreme_court_practice)
QUERIES["09_supreme_court"]="Правові позиції Верховного Суду щодо строків позовної давності у спорах про визнання правочину недійсним"

# 10. Parliament bills (rada_search_parliament_bills)
QUERIES["10_parliament_bills"]="Які законопроекти про штучний інтелект зареєстровані у Верховній Раді?"

# 11. Entity search (openreyestr_search_entities)
QUERIES["11_entity_search"]="Знайди компанію Нова Пошта в реєстрі"

# 12. Beneficiaries (search_entity_beneficiaries)
QUERIES["12_beneficiaries"]="Хто є кінцевим бенефіціаром компанії Приватбанк?"

# 13. Debtors registry (search_erb_debtors)
QUERIES["13_debtors"]="Перевір чи є ТОВ Будівельна компанія Комфорт в реєстрі боржників"

# 14. ECHR practice (search_echr_practice)
QUERIES["14_echr"]="Практика ЄСПЛ щодо права на справедливий суд та розумні строки розгляду справи"

# 15. Court sessions (search_court_sessions)
QUERIES["15_court_sessions"]="Знайди найближчі судові засідання по справі 910/1234/24"

# 16. Legislation structure (get_legislation_structure)
QUERIES["16_legislation_structure"]="Покажи структуру Господарського процесуального кодексу — які розділи та глави він містить?"

# 17. Procedural norms (search_procedural_norms)
QUERIES["17_procedural_norms"]="Які строки подання апеляційної скарги в господарському процесі?"

# 18. Similar fact pattern (find_similar_fact_pattern_cases)
QUERIES["18_similar_facts"]="Знайди справи з подібними обставинами: орендар побудував прибудову без дозволу орендодавця, орендодавець вимагає знесення"

# 19. Voting record (rada_analyze_voting_record)
QUERIES["19_voting"]="Як голосувала фракція Слуга Народу за закон про мобілізацію?"

# 20. Document vault — list (list_documents)
QUERIES["20_vault_list"]="Покажи всі документи в моєму сховищі"

total=${#QUERIES[@]}
passed=0
failed=0
errors=0
throttled=0

echo "========================================"
echo " Chat Tool Coverage Audit"
echo " Base URL: $BASE_URL"
echo " Queries: $total"
echo " Delay: ${DELAY_BETWEEN}s between queries"
echo " $(date)"
echo "========================================"
echo ""

sorted_keys=$(echo "${!QUERIES[@]}" | tr ' ' '\n' | sort)

send_query() {
  local query="$1"
  curl -s --max-time 180 \
    -X POST "$BASE_URL/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT" \
    -d "{\"query\": \"$query\", \"budget\": \"standard\"}" \
    2>&1 || true
}

idx=0
for key in $sorted_keys; do
  query="${QUERIES[$key]}"
  ((idx++)) || true
  echo -ne "${CYAN}[$idx/$total]${NC} [$key] $(echo "$query" | cut -c1-70)... "

  outfile="$RESULTS_DIR/${key}.json"
  response=""
  attempt=0
  success=false

  while [ $attempt -le $MAX_RETRIES ]; do
    if [ $attempt -gt 0 ]; then
      echo -ne "\n  retry $attempt/$MAX_RETRIES after ${RETRY_DELAY}s... "
      sleep "$RETRY_DELAY"
    fi

    response=$(send_query "$query")
    echo "$response" > "$outfile"

    # Check for 429 throttling
    if echo "$response" | grep -q '429'; then
      ((attempt++)) || true
      ((throttled++)) || true
      if [ $attempt -le $MAX_RETRIES ]; then
        continue
      fi
    else
      success=true
      break
    fi
  done

  # Parse SSE events
  tools_used=$(echo "$response" | grep -oP '"tool":"[^"]*"' | sed 's/"tool":"//;s/"//' | grep -v '^_' | sort -u | tr '\n' ', ' | sed 's/,$//')
  internal_tools=$(echo "$response" | grep -oP '"tool":"_[^"]*"' | sed 's/"tool":"//;s/"//' | sort -u | tr '\n' ', ' | sed 's/,$//')
  has_answer=$(echo "$response" | grep -c 'event: answer' || true)
  has_error=$(echo "$response" | grep -c 'event: error' || true)
  thinking_steps=$(echo "$response" | grep -c 'event: thinking' || true)

  if [ "$has_error" -gt 0 ]; then
    error_msg=$(echo "$response" | grep 'event: error' -A1 | grep 'data:' | head -1 | sed 's/data: //' | cut -c1-120)
    echo -e "${RED}ERROR${NC} — $error_msg"
    ((errors++)) || true
  elif [ "$has_answer" -gt 0 ]; then
    echo -e "${GREEN}OK${NC} — tools: [${tools_used:-none}], steps: $thinking_steps"
    ((passed++)) || true
  else
    echo -e "${YELLOW}NO ANSWER${NC} — tools: [${tools_used:-none}]"
    ((failed++)) || true
  fi

  # Delay before next query (skip after last)
  if [ $idx -lt $total ]; then
    sleep "$DELAY_BETWEEN"
  fi
done

echo ""
echo "========================================"
echo -e " Results: ${GREEN}$passed passed${NC}, ${RED}$errors errors${NC}, ${YELLOW}$failed no-answer${NC} / $total total"
if [ $throttled -gt 0 ]; then
  echo -e " Throttled (429): $throttled times"
fi
echo " Raw output: $RESULTS_DIR/"
echo "========================================"

# Summary of tools triggered
echo ""
echo "Tools triggered across all queries:"
cat "$RESULTS_DIR"/*.json 2>/dev/null | grep -oP '"tool":"[^"]*"' | sed 's/"tool":"//;s/"//' | grep -v '^_' | sort | uniq -c | sort -rn
