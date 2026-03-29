# Web Client Setup - Quick Start

Покрокова інструкція для підключення до SecondLayer MCP через HTTP API.

## ✅ Передумови

1. **Проект зібрано:**
```bash
cd <project-root>/mcp_backend
npm run build
```

2. **Інфраструктура запущена:**
```bash
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d
```

## 🚀 Крок 1: Запустити HTTP сервер

**Development режим (з hot reload):**
```bash
npm run dev:http
```

**Production режим:**
```bash
npm run build
npm run start:http
```

Сервер запуститься на `http://localhost:3000`

## 🧪 Крок 2: Перевірити що працює

**Простий тест:**
```bash
curl http://localhost:3000/health
```

**Очікуваний результат:**
```json
{"status":"ok","service":"secondlayer-mcp-http","version":"1.0.0"}
```

**Список інструментів:**
```bash
curl -H "Authorization: Bearer test-key-123" http://localhost:3000/api/tools
```

## 🎨 Крок 3: Відкрити демо інтерфейс

**Опція A: Відкрити HTML файл**
```bash
open config-examples/web-client-demo.html
```

**Опція B: Через HTTP сервер**
```bash
# У новому терміналі
cd config-examples
python3 -m http.server 8080

# Відкрити в браузері
open http://localhost:8080/web-client-demo.html
```

## 🔑 API Authentication

Всі запити (крім `/health`) потребують API ключ:

```javascript
fetch('http://localhost:3000/api/tools/search_legal_precedents', {
  headers: {
    'Authorization': 'Bearer test-key-123'
  }
})
```

**Налаштування ключів у `.env`:**
```bash
SECONDARY_LAYER_KEYS=test-key-123,dev-key-456,production-key-789
```

## 📡 Приклади використання

### 1. JavaScript/Fetch (Basic)

```javascript
async function searchCases(query) {
  const response = await fetch('http://localhost:3000/api/tools/search_legal_precedents', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-key-123',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      limit: 10
    })
  });

  const data = await response.json();
  return data.result;
}

// Використання
const results = await searchCases("мобілізація 2023");
console.log(results);
```

### 2. SSE Streaming

```javascript
function searchWithProgress(query) {
  const params = new URLSearchParams({
    authorization: 'Bearer test-key-123',
    query: query,
    limit: '5'
  });

  const eventSource = new EventSource(
    `http://localhost:3000/api/tools/search_legal_precedents/stream?${params}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
      case 'progress':
        console.log('Progress:', data.message);
        break;
      case 'result':
        console.log('Result:', data.data);
        break;
      case 'complete':
        console.log('Done!');
        eventSource.close();
        break;
      case 'error':
        console.error('Error:', data.error);
        eventSource.close();
        break;
    }
  };

  return eventSource;
}

// Використання
const stream = searchWithProgress("ухилення від мобілізації");
```

### 3. React Hook

```javascript
import { useState } from 'react';

function useSecondLayer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function callTool(toolName, params) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3000/api/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-key-123',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { callTool, loading, error };
}

// Використання в компоненті
function SearchComponent() {
  const { callTool, loading } = useSecondLayer();
  const [results, setResults] = useState([]);

  async function handleSearch(query) {
    const data = await callTool('search_legal_precedents', {
      query,
      limit: 10
    });
    setResults(data.result.results || []);
  }

  return (
    <div>
      <button onClick={() => handleSearch('мобілізація')} disabled={loading}>
        Search
      </button>
      {/* Display results */}
    </div>
  );
}
```

### 4. Curl Commands

**Пошук прецедентів:**
```bash
curl -X POST http://localhost:3000/api/tools/search_legal_precedents \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ухилення від мобілізації",
    "limit": 5
  }' | jq .
```

**Знайти статті закону:**
```bash
curl -X POST http://localhost:3000/api/tools/find_relevant_law_articles \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"topic": "мобілізація"}' | jq .
```

**Аналіз паттернів:**
```bash
curl -X POST http://localhost:3000/api/tools/analyze_case_pattern \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "незаконна мобілізація",
    "filters": {
      "start_date": "2023-01-01",
      "end_date": "2024-12-31"
    }
  }' | jq .
```

## 🧪 Automated Testing Script

```bash
chmod +x config-examples/test-web-api.sh
./config-examples/test-web-api.sh
```

Цей скрипт протестує всі основні endpoints.

## 🌐 CORS Configuration

**Development (всі домени):**
```typescript
// src/http-server.ts
app.use(cors({
  origin: '*',
  credentials: true
}));
```

**Production (конкретні домени):**
```typescript
app.use(cors({
  origin: [
    'https://yourdomain.com',
    'https://app.yourdomain.com'
  ],
  credentials: true
}));
```

## 🐛 Troubleshooting

### Помилка: Connection refused

**Причина:** Сервер не запущено

**Рішення:**
```bash
# Перевірити чи працює
curl http://localhost:3000/health

# Якщо ні - запустити
npm run dev:http
```

### Помилка: 401 Unauthorized

**Причина:** Неправильний API ключ

**Рішення:**
```bash
# Перевірити ключі в .env
grep SECONDARY_LAYER_KEYS .env

# Використовувати правильний ключ
curl -H "Authorization: Bearer test-key-123" ...
```

### Помилка: CORS blocked

**Причина:** Браузер блокує запити з іншого домену

**Рішення:**
```typescript
// Додати ваш домен у src/http-server.ts
app.use(cors({
  origin: ['http://localhost:8080', 'your-domain.com']
}));

// Перезапустити сервер
```

### Помилка: SSE не працює

**Причина:** Неправильний endpoint або формат

**Рішення:**
```javascript
// Переконатись що використовується /stream endpoint
const eventSource = new EventSource(
  'http://localhost:3000/api/tools/search_legal_precedents/stream?...'
);

// Параметри мають бути у query string, не у body
```

## 📊 Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (no auth) |
| `/api/tools` | GET | List all MCP tools |
| `/api/tools/:toolName` | POST | Execute tool (JSON) |
| `/api/tools/:toolName/stream` | POST/GET | Execute tool (SSE) |
| `/api/tools/batch` | POST | Batch execution |

## Available Tools

Доступні 80+ інструментів. Основні:

- `classify_intent` -- Класифікація запиту
- `search_legal_precedents` -- Пошук прецедентів
- `search_edrsr_decisions` -- Пошук рішень в ЄДРСР
- `search_edrsr_fulltext` -- Повнотекстовий пошук ЄДРСР
- `get_court_decision` -- Отримати рішення суду
- `analyze_case_pattern` -- Аналіз паттернів
- `get_similar_reasoning` -- Схоже обґрунтування
- `extract_document_sections` -- Витяг секцій
- `check_precedent_status` -- Статус прецеденту
- `get_citation_graph` -- Граф цитувань
- `parse_document` / `summarize_document` -- Аналіз документів
- `search_sanctions` / `search_trademarks` / `search_lawyers` -- OpenData
- `store_document` / `semantic_search` -- Vault
- `bulk_review_runner` / `risk_scoring` -- Due Diligence

**Детальна документація кожного інструменту:**
```bash
curl -H "Authorization: Bearer test-key-123" \
  http://localhost:3000/api/tools | jq '.tools[] | {name, description, inputSchema}'
```

## 🚀 Production Deployment

### Docker Compose
```bash
cd deployment
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Note:** Production deploy is via CI/CD (merge PR to main), not manual commands.

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### Environment Variables (Production)
```bash
NODE_ENV=production
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
SECONDARY_LAYER_KEYS=secure-production-key-here
LOG_LEVEL=warn
```

## 📈 Monitoring

**Логи:**
```bash
tail -f logs/combined.log    # Всі логи
tail -f logs/error.log        # Тільки помилки
```

**Метрики:**
```bash
curl -H "Authorization: Bearer test-key-123" \
  http://localhost:3000/api/tools | jq '.tools | length'
```

---

**Готово!** 🎉

Тепер ви можете інтегрувати SecondLayer MCP у ваш веб-застосунок.

**Наступні кроки:**
- Відкрити `web-client-demo.html` для інтерактивних тестів
- Прочитати [повну документацію](../docs/CLIENT_INTEGRATION.md)
- Подивитись [SSE streaming guide](../docs/SSE_STREAMING.md)
