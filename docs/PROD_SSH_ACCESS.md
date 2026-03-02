# SSH доступ до production (SecondLayer)

Доступ **тільки на читання** — SELECT у базах, docker logs для контейнерів, GET для Qdrant.

## Підключення

```bash
ssh secondlayer-prod
```

Або явно:

```bash
ssh igor@18.192.189.254
```

Ключ: `~/.ssh/id_ed25519_secondlayer_prod` (alias `secondlayer-prod` у `~/.ssh/config`).

Публічний ключ на сервері: `ssh-ed25519 ...DWA secondlayer-prod`.

---

## Доступні команди

При логіні на сервері побачиш повний список; нижче — основне.

### Контейнери

| Команда | Опис |
|--------|------|
| `dps` | Статус всіх контейнерів |
| `logs-backend` | Логи backend (tail -f) |
| `logs-rada` | Логи rada сервера |
| `logs-openreyestr` | Логи openreyestr |
| `logs-docsvc` | Логи document-service |
| `logs-nginx` | Логи nginx |
| `logs-postgres` | Логи postgres |
| `logs-redis` | Логи redis |

### Бази даних (read-only)

| Команда | Опис |
|--------|------|
| `db` | psql до main DB (`secondlayer_prod`) |
| `db-or` | psql до openreyestr DB (`openreyestr_prod`) |

### Qdrant (vector DB)

| Команда | Опис |
|--------|------|
| `qdrant-collections` | Список колекцій |
| `qdrant-info` | Телеметрія/статус |

---

## Приклади

### Логи бекенду

```bash
logs-backend
```

### Пошук по `response_id` у cost_tracking

```bash
db
```

```sql
SELECT * FROM cost_tracking WHERE response_id = 'resp_xxx';
```

### Пошук по документах

```bash
db
```

```sql
SELECT id, title, created_at FROM documents WHERE title ILIKE '%пошук%' LIMIT 10;
```

### Qdrant — колекції

```bash
qdrant-collections
```

### Перегляд конкретної колекції

```bash
curl -s http://localhost:6339/collections/legal_patterns | python3 -m json.tool
```

### Пошук у Qdrant (приклад scroll)

```bash
curl -s -X POST http://localhost:6339/collections/legal_patterns/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit": 5}' | python3 -m json.tool
```

### Логи по конкретному чату

Чат: `#chat-bf676b3c-000d-4382-9449-cef7ec7bbc26` → UUID: `bf676b3c-000d-4382-9449-cef7ec7bbc26`.

**Скрипт (з твоєї машини, після `ssh secondlayer-prod` має працювати):**

```bash
./scripts/prod-chat-logs.sh chat-bf676b3c-000d-4382-9449-cef7ec7bbc26
```

Або вручну на проді:

```bash
# 1. Мета чату
db
SELECT id, title, user_id, created_at, updated_at FROM conversations WHERE id = 'bf676b3c-000d-4382-9449-cef7ec7bbc26';

# 2. Повідомлення чату
SELECT id, role, LEFT(content, 80) AS content_preview, created_at, cost_tracking_id
FROM conversation_messages
WHERE conversation_id = 'bf676b3c-000d-4382-9449-cef7ec7bbc26'
ORDER BY created_at;

# 3. cost_tracking для цього чату
SELECT ct.id, ct.request_id, ct.tool_name, ct.user_query, ct.openai_cost_usd, ct.total_cost_usd, ct.status, ct.created_at
FROM cost_tracking ct
WHERE ct.id IN (
  SELECT cost_tracking_id FROM conversation_messages
  WHERE conversation_id = 'bf676b3c-000d-4382-9449-cef7ec7bbc26' AND cost_tracking_id IS NOT NULL
)
ORDER BY ct.created_at;
```

Логи backend (на проді, ім’я контейнера може відрізнятися):

```bash
docker logs --tail 1000 $(docker ps -q -f name=backend | head -1) 2>&1 | grep -i bf676b3c-000d-4382-9449-cef7ec7bbc26
```

---

## Обмеження

- **Тільки читання**: SELECT у базах, docker logs, GET у Qdrant. Зміни (INSERT/UPDATE/DELETE, зміна контейнерів) не передбачені цим доступом.
