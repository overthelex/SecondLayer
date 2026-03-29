# Remote MCP Server Setup Guide

Підключення до SecondLayer MCP через HTTPS (віддалений доступ з будь-якої точки світу)

---

## 🌐 Огляд

SecondLayer MCP підтримує віддалене підключення через **Server-Sent Events (SSE)** транспорт. Це дозволяє клієнтам підключатися до MCP сервера через HTTPS замість локального stdio процесу.

### Переваги віддаленого підключення:

✅ **Немає локального розгортання** - не потрібно встановлювати PostgreSQL, Qdrant, Redis
✅ **Централізована база даних** - всі клієнти працюють з однією базою судових рішень
✅ **Підключення з будь-якого місця** - робота через Інтернет
✅ **Масштабованість** - один сервер обслуговує багато клієнтів
✅ **Автоматичні оновлення** - не потрібно оновлювати локальну версію

---

## 🔑 Аутентифікація

Віддалений MCP сервер використовує **JWT (JSON Web Tokens)** для аутентифікації.

### Отримання JWT токена

**Варіант 1: Генерація токена (для адміністраторів)**

```bash
cd mcp_backend

# Встановити залежності (якщо ще не зроблено)
npm install

# Згенерувати токен
npx tsx scripts/generate-jwt-token.ts <client-id> <expires-in>

# Приклад: токен для клієнта "my-app" на 90 днів
npx tsx scripts/generate-jwt-token.ts my-app 90d
```

**Варіант 2: Запит токена у адміністратора**

Якщо ви користувач сервісу legal.org.ua, зв'яжіться з адміністратором для отримання персонального JWT токена.

---

## 📋 Конфігурація клієнтів

### Claude Desktop

**Файл конфігурації (macOS):**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Файл конфігурації (Windows):**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Файл конфігурації (Linux):**
```
~/.config/Claude/claude_desktop_config.json
```

**Конфігурація:**

```json
{
  "mcpServers": {
    "secondlayer-remote": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR-JWT-TOKEN-HERE"
      }
    }
  }
}
```

**Швидке налаштування:**

```bash
# Використайте готовий шаблон
cp mcp_backend/config-examples/remote-claude-desktop-config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Відредагуйте файл та замініть YOUR-JWT-TOKEN-HERE на ваш токен
```

---

### Cursor IDE

**Файл конфігурації:**
```
.cursor/mcp.json (в корені вашого проекту)
```

**Конфігурація:**

```json
{
  "mcpServers": {
    "secondlayer-remote": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR-JWT-TOKEN-HERE"
      }
    }
  }
}
```

**Швидке налаштування:**

```bash
# Створити директорію .cursor (якщо немає)
mkdir -p .cursor

# Використайте готовий шаблон
cp mcp_backend/config-examples/remote-cursor-config.json .cursor/mcp.json

# Відредагуйте файл та замініть YOUR-JWT-TOKEN-HERE на ваш токен
```

---

### VSCode / Continue

**Файл конфігурації:**
```
.vscode/mcp.json (в корені вашого workspace)
```

**Конфігурація:**

```json
{
  "mcpServers": {
    "secondlayer-remote": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR-JWT-TOKEN-HERE"
      }
    }
  }
}
```

**Швидке налаштування:**

```bash
# Створити директорію .vscode (якщо немає)
mkdir -p .vscode

# Використайте готовий шаблон
cp mcp_backend/config-examples/remote-vscode-config.json .vscode/mcp.json

# Відредагуйте файл та замініть YOUR-JWT-TOKEN-HERE на ваш токен
```

---

## 🧪 Тестування підключення

### Перевірка доступності сервера

```bash
# Health check (без токена)
curl https://mcp.legal.org.ua/health

# Очікуваний результат:
# {
#   "status": "ok",
#   "service": "secondlayer-mcp-sse",
#   "version": "1.0.0",
#   "transport": "sse",
#   "tools": 10
# }
```

### Тестування з JWT токеном

```bash
# Заміність YOUR-JWT-TOKEN на ваш реальний токен
curl -X POST https://mcp.legal.org.ua/v1/sse \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

---

## Доступні інструменти

Віддалений MCP сервер надає 80+ інструментів. Основні:

- **Court Decisions** -- `get_court_decision`, `search_edrsr_decisions`, `search_edrsr_fulltext`, `analyze_case_pattern`, `extract_document_sections`, `load_full_texts`
- **Legal Advice** -- `search_legal_precedents`, `get_similar_reasoning`, `get_citation_graph`, `format_answer_pack`
- **Core Query** -- `classify_intent`, `retrieve_legal_sources`, `validate_response`, `check_precedent_status`
- **Legislation** -- `get_legislation_section`, `search_legal_acts`, `search_procedural_norms`
- **Document Analysis** -- `parse_document`, `summarize_document`, `compare_documents`
- **Vault** -- `store_document`, `get_document`, `list_documents`, `semantic_search`
- **Due Diligence** -- `bulk_review_runner`, `risk_scoring`, `generate_dd_report`
- **OpenData** -- `search_sanctions`, `search_trademarks`, `search_lawyers`, `search_judges` та інші
- **Remote (RADA)** -- 4 tools, **Remote (OpenReyestr)** -- 27 tools

**Перевірити список інструментів:**

```bash
curl -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  https://mcp.legal.org.ua/health
```

---

## 🔐 Безпека JWT токенів

### ⚠️ ВАЖЛИВО:

1. **Не публікуйте токени** - ніколи не додавайте токени в git репозиторії
2. **Зберігайте безпечно** - використовуйте менеджери паролів або .env файли
3. **Обмежуйте термін дії** - створюйте токени з обмеженим терміном дії (30-90 днів)
4. **Один токен = один клієнт** - не діліться токенами між користувачами

### Якщо токен скомпрометовано:

1. Зв'яжіться з адміністратором для відкликання токена
2. Отримайте новий токен
3. Оновіть конфігурацію клієнта

---

## 🚀 Порівняння: Локальне vs Віддалене підключення

| Характеристика | Локальне (stdio) | Віддалене (SSE/HTTPS) |
|----------------|------------------|----------------------|
| **Встановлення** | Складне (PostgreSQL, Qdrant, Redis) | Просте (тільки токен) |
| **Продуктивність** | Максимальна (локальне виконання) | Залежить від Інтернету |
| **База даних** | Локальна копія | Централізована |
| **Оновлення** | Ручні | Автоматичні |
| **Доступ** | Тільки локальна машина | З будь-якого місця |
| **Масштабованість** | 1:1 (один процес на клієнт) | N:1 (багато клієнтів → 1 сервер) |
| **Вартість** | Безкоштовно | Залежить від тарифу |
| **Аутентифікація** | Не потрібна | JWT токен |

---

## 🛠️ Troubleshooting

### Помилка: "Unauthorized" або "401"

**Причина:** Невалідний або відсутній JWT токен

**Рішення:**
1. Перевірте що токен правильно вказаний в конфігурації
2. Переконайтеся що токен не прострочений
3. Згенеруйте новий токен якщо потрібно

```bash
# Перевірити токен
curl -X POST https://mcp.legal.org.ua/v1/sse \
  -H "Authorization: Bearer YOUR-TOKEN" \
  -v
```

### Помилка: "Connection refused" або "Network error"

**Причина:** Сервер недоступний або проблеми з мережею

**Рішення:**
1. Перевірте health endpoint:
   ```bash
   curl https://mcp.legal.org.ua/health
   ```
2. Перевірте з'єднання з Інтернетом
3. Перевірте чи не блокує файрвол підключення

### Помилка: "Token has expired"

**Причина:** JWT токен прострочений

**Рішення:**
1. Згенеруйте новий токен
2. Оновіть конфігурацію клієнта
3. Перезапустіть клієнт (Claude Desktop, Cursor, тощо)

### Клієнт не бачить MCP інструменти

**Рішення:**
1. Перезапустіть клієнт (повністю закрийте та відкрийте)
2. Перевірте що конфігураційний файл знаходиться в правильному місці
3. Перевірте синтаксис JSON (немає зайвих ком)
4. Подивіться логи клієнта (для Claude Desktop: `~/Library/Logs/Claude/mcp*.log`)

---

## 📚 Додаткова документація

- **Локальна установка:** `config-examples/SETUP_DESKTOP.md`
- **HTTP API:** `config-examples/SETUP_WEB.md`
- **Швидкий старт:** `docs/QUICK_START.md`
- **Список інструментів:** `docs/MCP_TOOLS_SUMMARY.md`
- **Client Integration:** `docs/CLIENT_INTEGRATION.md`

---

## 🆘 Підтримка

**Проблеми з підключенням:**
- Email: support@legal.org.ua
- GitHub Issues: https://github.com/your-repo/issues

**Запит JWT токена:**
- Для індивідуального використання: support@legal.org.ua
- Для корпоративних клієнтів: enterprise@legal.org.ua

---

## 🎯 Приклад використання

Після налаштування:

**У Claude Desktop:**
```
Знайди всі судові рішення про незаконну мобілізацію за 2023-2024 роки
```

**У Cursor IDE (Agent Mode):**
```
Проаналізуй практику по справах про ухилення від військової служби
```

**У VSCode з Continue:**
```
Які статті закону найчастіше застосовуються у справах про мобілізацію?
```

---

**Готово! Тепер ви можете користуватися SecondLayer MCP віддалено з будь-якого місця.** 🎉
