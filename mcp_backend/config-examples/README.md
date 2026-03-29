# SecondLayer MCP - Configuration Examples

Цей каталог містить приклади конфігурацій та інструкції для підключення SecondLayer MCP до різних типів клієнтів.

## 📁 Файли в цьому каталозі

### Локальне підключення (stdio)

| Файл | Призначення |
|------|-------------|
| `claude-desktop-config.json` | Готова конфігурація для Claude Desktop |
| `cursor-mcp-config.json` | Конфігурація для Cursor IDE (.cursor/mcp.json) |
| `vscode-mcp-config.json` | Конфігурація для VSCode (.vscode/mcp.json) |
| `continue-mcp-config.yaml` | Конфігурація для Continue.dev extension |
| `SETUP_DESKTOP.md` | Покрокова інструкція для desktop клієнтів |

### Віддалене підключення (HTTPS/SSE) 🌐

| Файл | Призначення |
|------|-------------|
| `remote-claude-desktop-config.json` | Віддалене підключення для Claude Desktop |
| `remote-cursor-config.json` | Віддалене підключення для Cursor IDE |
| `remote-vscode-config.json` | Віддалене підключення для VSCode |
| `REMOTE_MCP_SETUP.md` | **Повний гайд віддаленого підключення** |
| `GENERATE_TOKEN.md` | **Інструкції генерації JWT токенів** |

### Web API

| Файл | Призначення |
|------|-------------|
| `web-client-demo.html` | Інтерактивний HTML демо для тестування web API |
| `test-web-api.sh` | Bash скрипт для автоматичного тестування API |
| `SETUP_WEB.md` | Покрокова інструкція для web клієнтів |

---

## 🌐 Віддалене підключення (Рекомендовано для більшості користувачів)

### Що це?

Підключення до MCP сервера через HTTPS без локального розгортання інфраструктури.

**Переваги:**
- ✅ Не потрібно встановлювати PostgreSQL, Qdrant, Redis
- ✅ Працює з будь-якого місця через Інтернет
- ✅ Централізована база даних
- ✅ Автоматичні оновлення

### Швидкий старт

1. **Отримати JWT токен:**

```bash
# Згенерувати токен (для адміністраторів)
npx tsx scripts/generate-jwt-token.ts my-app 90d

# Або запросити у адміністратора legal.org.ua
```

2. **Налаштувати клієнт:**

**Claude Desktop:**
```bash
cp config-examples/remote-claude-desktop-config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Відредагувати файл та замінити YOUR-JWT-TOKEN-HERE
```

**Cursor IDE:**
```bash
mkdir -p .cursor
cp config-examples/remote-cursor-config.json .cursor/mcp.json

# Відредагувати файл та замінити YOUR-JWT-TOKEN-HERE
```

**VSCode:**
```bash
mkdir -p .vscode
cp config-examples/remote-vscode-config.json .vscode/mcp.json

# Відредагувати файл та замінити YOUR-JWT-TOKEN-HERE
```

3. **Тестувати підключення:**

```bash
curl https://mcp.legal.org.ua/health
```

### Детальна інструкція

📖 **Читайте:** [REMOTE_MCP_SETUP.md](./REMOTE_MCP_SETUP.md)
🔑 **Генерація токенів:** [GENERATE_TOKEN.md](./GENERATE_TOKEN.md)

---

## 🖥️ Локальне підключення (Desktop Client)

### Швидкий старт

1. **Зібрати проект:**
```bash
cd <project-root>/mcp_backend
npm run build
```

2. **Скопіювати конфігурацію:**

**Claude Desktop:**
```bash
# macOS
cp config-examples/claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
cp config-examples/claude-desktop-config.json ~/.config/Claude/claude_desktop_config.json

# Windows (PowerShell)
Copy-Item config-examples\claude-desktop-config.json $env:APPDATA\Claude\claude_desktop_config.json
```

**Cursor IDE:**
```bash
# Створіть .cursor/ в корені вашого проекту
mkdir -p .cursor
cp config-examples/cursor-mcp-config.json .cursor/mcp.json
```

**VSCode:**
```bash
# Створіть .vscode/ в корені workspace
mkdir -p .vscode
cp config-examples/vscode-mcp-config.json .vscode/mcp.json
```

**Continue.dev:**
```bash
# Створіть .continue/mcpServers/ в корені workspace
mkdir -p .continue/mcpServers
cp config-examples/continue-mcp-config.yaml .continue/mcpServers/secondlayer.yaml
```

3. **Запустити інфраструктуру:**
```bash
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d
```

4. **Перезапустити клієнт** (Claude Desktop, Cursor, VSCode)

### Детальна інструкція

Читайте: [SETUP_DESKTOP.md](./SETUP_DESKTOP.md)

---

## 🌐 Web Client (Browser, React, Mobile Apps)

### Швидкий старт

1. **Запустити HTTP сервер:**
```bash
cd <project-root>/mcp_backend
npm run dev:http
```

2. **Перевірити що працює:**
```bash
curl http://localhost:3000/health
```

3. **Запустити тести:**
```bash
./config-examples/test-web-api.sh
```

4. **Відкрити демо:**
```bash
open config-examples/web-client-demo.html
```

### Детальна інструкція

Читайте: [SETUP_WEB.md](./SETUP_WEB.md)

---

## 🔑 API Authentication

Всі web endpoints (крім `/health`) потребують API ключ:

```bash
Authorization: Bearer test-key-123
```

**Налаштування ключів:**

У файлі `.env`:
```bash
SECONDARY_LAYER_KEYS=test-key-123,dev-key-456,prod-key-789
```

---

## 🧪 Тестування

### Web API Tests

Автоматичний тест всіх endpoints:

```bash
chmod +x test-web-api.sh
./test-web-api.sh
```

Очікуваний вивід:
```
=========================================
SecondLayer MCP - Web API Tests
=========================================
1. Health Check
Testing: Health endpoint... ✓ OK (HTTP 200)

2. MCP Tools
Testing: List tools... ✓ OK (HTTP 200)

...
All tests completed!
```

### Manual Tests

**Health check:**
```bash
curl http://localhost:3000/health
```

**List tools:**
```bash
curl -H "Authorization: Bearer test-key-123" \
  http://localhost:3000/api/tools | jq '.tools[] | .name'
```

**Search precedents:**
```bash
curl -X POST http://localhost:3000/api/tools/search_legal_precedents \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"query": "мобілізація 2023", "limit": 3}' | jq .
```

---

## 📊 Порівняння Desktop vs Web

| Характеристика | Desktop | Web |
|----------------|---------|-----|
| **Протокол** | stdio | HTTP/SSE |
| **Складність** | Проста | Середня |
| **Аутентифікація** | Не потрібна | API ключі |
| **Streaming** | Не підтримується | SSE |
| **Використання** | IDE інтеграції | Веб-застосунки |
| **Масштабованість** | 1:1 | N:1 |

---

## 🛠️ Troubleshooting

### Desktop

**Проблема:** Server not found
```bash
# Перевірити шлях
ls -la <project-root>/mcp_backend/dist/index.js

# Зібрати якщо потрібно
npm run build
```

**Проблема:** Connection timeout
```bash
# Перевірити сервіси
docker compose ps

# Запустити якщо потрібно
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d
```

### Web

**Проблема:** Connection refused
```bash
# Запустити HTTP сервер
npm run dev:http
```

**Проблема:** 401 Unauthorized
```bash
# Перевірити API ключ
grep SECONDARY_LAYER_KEYS ../.env

# Використовувати правильний ключ
curl -H "Authorization: Bearer test-key-123" ...
```

**Проблема:** CORS errors
```typescript
// src/http-server.ts - додати ваш домен
app.use(cors({
  origin: ['http://localhost:8080', 'your-domain.com']
}));
```

---

## 📚 Доступні MCP Tools

Після підключення доступні такі інструменти:

Доступні 80+ інструментів. Основні категорії:

- **Court Decisions** -- `get_court_decision`, `search_edrsr_decisions`, `search_edrsr_fulltext`, `analyze_case_pattern`, `extract_document_sections`, `load_full_texts`, `count_cases_by_party`
- **Legal Advice** -- `search_legal_precedents`, `get_similar_reasoning`, `get_citation_graph`, `format_answer_pack`
- **Core Query** -- `classify_intent`, `retrieve_legal_sources`, `validate_response`, `check_precedent_status`
- **Legislation** -- `get_legislation_section`, `search_legal_acts`, `search_procedural_norms`
- **Procedural** -- `calculate_procedural_deadlines`, `build_procedural_checklist`, `calculate_monetary_claims`
- **Document Analysis** -- `parse_document`, `summarize_document`, `compare_documents`, `extract_key_clauses`
- **Vault** -- `store_document`, `get_document`, `list_documents`, `semantic_search`
- **Due Diligence** -- `bulk_review_runner`, `risk_scoring`, `generate_dd_report`
- **OpenData** -- `search_sanctions`, `search_trademarks`, `search_lawyers`, `search_judges` та 20+ інших
- **Remote (RADA)** -- 4 tools, **Remote (OpenReyestr)** -- 27 tools

**Детальна документація:**
```bash
curl -H "Authorization: Bearer test-key-123" \
  http://localhost:3000/api/tools | jq .
```

---

## 🎯 Приклади використання

### Desktop (через Claude Desktop)

Після підключення просто пишіть в Claude:

```
Знайди судові рішення про незаконну мобілізацію за 2023 рік
```

```
Проаналізуй практику у справах про ухилення від військової служби
```

```
Які статті закону найчастіше застосовуються у справах про мобілізацію?
```

### Web (JavaScript)

```javascript
// Простий запит
const response = await fetch('http://localhost:3000/api/tools/search_legal_precedents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test-key-123',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'мобілізація 2023',
    limit: 10
  })
});

const data = await response.json();
console.log(data.result);
```

```javascript
// SSE Streaming
const eventSource = new EventSource(
  'http://localhost:3000/api/tools/search_legal_precedents/stream?' +
  new URLSearchParams({
    authorization: 'Bearer test-key-123',
    query: 'мобілізація',
    limit: '5'
  })
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);

  if (data.type === 'complete') {
    eventSource.close();
  }
};
```

---

## 🚀 Production Deployment

### Для Desktop
- Збудувати з `npm run build`
- Розповсюдити `dist/` папку користувачам
- Користувачі налаштовують локально

### Для Web
```bash
# Локально
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d

# Production — через CI/CD (merge PR to main)
```

**Nginx reverse proxy:**
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_buffering off;  # Для SSE
        proxy_cache off;
    }
}
```

---

## 📖 Додаткова документація

- [Повна документація інтеграцій](../docs/CLIENT_INTEGRATION.md)
- [SSE Streaming гайд](../docs/SSE_STREAMING.md)
- [Database Setup](../docs/DATABASE_SETUP.md)
- [Головний README](../README.md)

---

## 🆘 Підтримка

Якщо виникли проблеми:

1. **Перевірити логи:**
```bash
# Desktop (Claude Desktop)
tail -f ~/Library/Logs/Claude/mcp*.log

# Web (HTTP Server)
tail -f logs/combined.log
```

2. **Перевірити сервіси:**
```bash
docker compose ps
docker compose logs -f
```

3. **Перевірити збірку:**
```bash
ls -la dist/index.js
ls -la dist/http-server.js
```

4. **Створити issue:** https://github.com/your-repo/issues

---

**Успішної інтеграції!** 🎉
