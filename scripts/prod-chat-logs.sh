#!/usr/bin/env bash
# Отримати логи по чату на проді (БД + docker logs).
# ID — це request_id (response_id) у cost_tracking, формат: chat-<uuid>.
# Використання: ./scripts/prod-chat-logs.sh [request_id]
# Приклад: ./scripts/prod-chat-logs.sh chat-bf676b3c-000d-4382-9449-cef7ec7bbc26

set -e
REQUEST_ID="${1:-chat-bf676b3c-000d-4382-9449-cef7ec7bbc26}"

# Якщо передано тільки UUID — додати префікс chat-
if [[ "$REQUEST_ID" != chat-* ]]; then
  REQUEST_ID="chat-$REQUEST_ID"
fi

echo "=== request_id (response_id): $REQUEST_ID ==="
echo ""

PG_CONTAINER="secondlayer-postgres-prod"

# 1) Запис у cost_tracking по request_id (основний запис чату ai_chat)
echo "=== cost_tracking по request_id ==="
ssh secondlayer-prod "docker exec $PG_CONTAINER psql -U secondlayer -d secondlayer_prod -c \"
SELECT id, request_id, tool_name, user_id, user_query, query_params,
       openai_prompt_tokens, openai_completion_tokens, openai_cost_usd, total_cost_usd,
       status, execution_time_ms, error_message, created_at, completed_at
FROM cost_tracking
WHERE request_id = '$REQUEST_ID';
\" 2>/dev/null || true"

# 2) Conversation і messages за conversation_id з query_params цього request
echo ""
echo "=== conversation (за query_params.conversationId) та messages ==="
ssh secondlayer-prod "docker exec $PG_CONTAINER psql -U secondlayer -d secondlayer_prod -c \"
SELECT c.id, c.title, c.user_id, c.created_at
FROM conversations c
WHERE c.id::text = (SELECT query_params->>'conversationId' FROM cost_tracking WHERE request_id = '$REQUEST_ID' LIMIT 1);
SELECT id, role, LEFT(content, 150) AS content_preview, created_at, cost_tracking_id
FROM conversation_messages
WHERE conversation_id::text = (SELECT query_params->>'conversationId' FROM cost_tracking WHERE request_id = '$REQUEST_ID' LIMIT 1)
ORDER BY created_at;
\" 2>/dev/null || true"

echo ""
echo "=== Логи backend по request_id (якщо є в поточному контейнері) ==="
LOG_MATCH=$(ssh secondlayer-prod "docker logs --tail 50000 secondlayer-app-prod 2>&1 | grep -i '$REQUEST_ID' || true")
if [[ -z "$LOG_MATCH" ]]; then
  echo "(логів не знайдено — контейнер міг перезапускатися, старі логи втрачені; основний слід — запис у cost_tracking вище)"
else
  echo "$LOG_MATCH"
fi
