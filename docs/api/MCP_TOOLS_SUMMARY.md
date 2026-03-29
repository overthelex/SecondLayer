> **OUTDATED:** This document was generated from a container snapshot (2026-01-18) and only lists 10 of the original tools.
> The current system has **118 tools** (87 backend + 4 RADA + 27 OpenReyestr).
> See [ALL_MCP_TOOLS.md](../ALL_MCP_TOOLS.md) for the full current list.
> ZakonOnline API references below are legacy -- primary court data source is now EDRSR.

# SecondLayer MCP Tools - Звіт з контейнера (Historical Snapshot)

**Контейнер:** `secondlayer-app`
**Порт:** 3000 (HTTP API)
**Дата зйомки:** 2026-01-18

---

## 📊 Загальна статистика (на момент зйомки)

- **Інструментів у зйомці:** 10 (з 118 поточних)
- **Сервер:** secondlayer-mcp-http
- **API версія:** 1.0.0
- **Протокол:** MCP (Model Context Protocol)

---

## 🔧 Список інструментів

### 1. search_legal_precedents
**Пошук юридичних прецедентів з семантичним аналізом**

- **Вартість:** $0.03-$0.10 USD
- **Компоненти:** OpenAI API (embeddings) + ZakonOnline API + SecondLayer MCP
- **Параметри:**
  - `query` (string) - пошуковий запит
  - `domain` (string) - домен пошуку
  - `time_range` (object) - часовий діапазон
  - `limit` (number) - кількість результатів
  - `offset` (number) - зміщення для пагінації
  - `count_all` (boolean) - підрахунок всіх результатів
  - `sections` (array) - секції документів

**Використання:**
```javascript
{
  "query": "незаконна мобілізація 2023",
  "limit": 10,
  "sections": ["FACTS", "REASONING"]
}
```

---

### 2. analyze_case_pattern
**Аналіз паттернів судової практики**

- **Вартість:** $0.02-$0.08 USD
- **Компоненти:** OpenAI API + PostgreSQL
- **Параметри:**
  - `intent` (string) - тема або інтент
  - `case_ids` (array) - ID справ для аналізу

**Використання:**
```javascript
{
  "intent": "ухилення від військової служби",
  "case_ids": ["110679112", "110441965"]
}
```

---

### 3. get_similar_reasoning
**Пошук схожих судових обґрунтувань**

- **Вартість:** $0.01-$0.03 USD
- **Компоненти:** OpenAI Embeddings + Qdrant (векторна БД)
- **Параметри:**
  - `query` (string) - текст обґрунтування
  - `section_type` (string) - тип секції
  - `limit` (number) - кількість результатів

**Використання:**
```javascript
{
  "query": "судовий розгляд питання мобілізації",
  "section_type": "REASONING",
  "limit": 5
}
```

---

### 4. extract_document_sections
**Витягування структурованих секцій з документа**

- **Вартість:** $0.005-$0.05 USD
- **Компоненти:** HTML Parser + OpenAI (опціонально)
- **Параметри:**
  - `doc_id` (string) - ID документа з Zakononline
  - `document_id` (string) - альтернативне ім'я
  - `text` (string) - повний текст документа
  - `use_llm` (boolean) - використовувати LLM для екстракції

**Секції:** FACTS, REASONING, DECISION, LAW_REFERENCES, PROCEDURAL

**Використання:**
```javascript
{
  "doc_id": "110679112",
  "use_llm": true
}
```

---

### 5. count_cases_by_party
**Підрахунок справ за стороною**

- **Вартість:** ~$0.007 за кожну сторінку (1000 справ)
- **Компоненти:** ZakonOnline API (пагінація)
- **Параметри:**
  - `party_name` (string) - назва компанії або ПІБ
  - `party_type` (string) - plaintiff/defendant/any
  - `date_from` (string) - дата початку (YYYY-MM-DD)
  - `date_to` (string) - дата кінця (YYYY-MM-DD)
  - `return_cases` (boolean) - повернути список справ
  - `max_cases_to_return` (number) - макс. кількість справ

**Використання:**
```javascript
{
  "party_name": "Фінансова компанія Фангарант груп",
  "party_type": "defendant",
  "date_from": "2023-01-01",
  "date_to": "2023-12-31",
  "return_cases": true
}
```

---

### 6. find_relevant_law_articles
**Пошук релевантних статей законів**

- **Вартість:** $0.01-$0.02 USD
- **Компоненти:** PostgreSQL (legal patterns)
- **Параметри:**
  - `intent` (string) - тема
  - `limit` (number) - кількість результатів

**Використання:**
```javascript
{
  "intent": "мобілізація",
  "limit": 10
}
```

---

### 7. check_precedent_status
**Перевірка статусу прецеденту**

- **Вартість:** $0.005-$0.015 USD
- **Компоненти:** PostgreSQL
- **Параметри:**
  - `case_id` (string) - ID справи

**Статуси:** valid, overruled, questioned, pending

**Використання:**
```javascript
{
  "case_id": "756/655/23"
}
```

---

### 8. load_full_texts
**Завантаження повних текстів судових рішень**

- **Вартість:** ~$0.007 за документ
- **Компоненти:** ZakonOnline web scraping + PostgreSQL + Redis cache
- **Параметри:**
  - `doc_ids` (array) - масив ID документів
  - `max_docs` (number) - максимальна кількість
  - `batch_size` (number) - розмір батчу (default: 100)

**Використання:**
```javascript
{
  "doc_ids": [110679112, 110441965, 110234567],
  "max_docs": 100,
  "batch_size": 50
}
```

---

### 9. get_citation_graph
**Побудова графу цитувань**

- **Вартість:** $0.005-$0.02 USD
- **Компоненти:** PostgreSQL
- **Параметри:**
  - `case_id` (string) - ID справи
  - `depth` (number) - глибина графу

**Використання:**
```javascript
{
  "case_id": "756/655/23",
  "depth": 2
}
```

---

### 10. get_legal_advice ⭐ (Головний інструмент)
**Комплексний юридичний аналіз з перевіркою галюцинацій**

- **Вартість:** $0.10-$0.30 USD (залежить від reasoning_budget)
  - `quick`: ~$0.10 (базовий аналіз)
  - `standard`: ~$0.15-$0.20 ⭐ рекомендовано
  - `deep`: ~$0.25-$0.30 (глибокий аналіз)

- **Компоненти:** Множинні виклики OpenAI API + ZakonOnline API + SecondLayer MCP + Hallucination Guard
- **Параметри:**
  - `query` (string) - питання
  - `reasoning_budget` (string) - quick/standard/deep

**Використання:**
```javascript
{
  "query": "Чи можна оскаржити повістку ТЦК, якщо вона вручена з порушенням процедури?",
  "reasoning_budget": "standard"
}
```

---

## 💰 Порівняння вартості

| Інструмент | Мін. вартість | Макс. вартість | Рекомендація |
|-----------|---------------|----------------|--------------|
| **check_precedent_status** | $0.005 | $0.015 | Найдешевший |
| **extract_document_sections** | $0.005 | $0.05 | Залежить від use_llm |
| **find_relevant_law_articles** | $0.01 | $0.02 | Дешево |
| **get_similar_reasoning** | $0.01 | $0.03 | Дешево |
| **get_citation_graph** | $0.005 | $0.02 | Дешево |
| **analyze_case_pattern** | $0.02 | $0.08 | Середнє |
| **search_legal_precedents** | $0.03 | $0.10 | Середнє |
| **load_full_texts** | $0.007/doc | Залежить | За кількістю |
| **count_cases_by_party** | $0.007/page | Залежить | За кількістю |
| **get_legal_advice** | $0.10 | $0.30 | Найдорожчий ⭐ |

---

## 🎯 Рекомендовані комбінації

### Дослідження справи
1. `search_legal_precedents` - знайти схожі справи
2. `load_full_texts` - завантажити повні тексти
3. `extract_document_sections` - витягти секції
4. `analyze_case_pattern` - проаналізувати паттерни

**Загальна вартість:** ~$0.10-$0.25

### Повна юридична консультація
1. `get_legal_advice` (standard) - отримати аналіз
2. `get_citation_graph` - перевірити зв'язки
3. `check_precedent_status` - валідувати прецеденти

**Загальна вартість:** ~$0.15-$0.35

### Статистичний аналіз
1. `count_cases_by_party` - підрахувати справи
2. `find_relevant_law_articles` - знайти статті
3. `analyze_case_pattern` - аналіз паттернів

**Загальна вартість:** залежить від кількості справ

---

## 📁 Збережені файли

1. **JSON Schema:** `docs/MCP_TOOLS_SCHEMA.json`
2. **Markdown List:** `docs/MCP_TOOLS_LIST.md`
3. **Summary (цей файл):** `docs/MCP_TOOLS_SUMMARY.md`

---

## 🔗 API Endpoints

**Base URL:** `http://localhost:3000`

- `GET /health` - Health check (без auth)
- `GET /api/tools` - Список інструментів (потрібен Bearer token)
- `POST /api/tools/:toolName` - Виконати інструмент
- `POST /api/tools/:toolName/stream` - SSE streaming

**Приклад:**
```bash
curl -H "Authorization: Bearer test-key-123" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:3000/api/tools/search_legal_precedents \
     -d '{"query": "мобілізація", "limit": 5}'
```

---

## 📚 Додаткова документація

- **Інтеграційний гайд:** `docs/INTEGRATION_GUIDE_WEB.html`
- **Швидкий старт:** `docs/QUICK_START.md`
- **Client Integration:** `mcp_backend/docs/CLIENT_INTEGRATION.md`
- **SSE Streaming:** `mcp_backend/docs/SSE_STREAMING.md`

---

**Статус контейнера:** ✅ Healthy
**Сервіси:** PostgreSQL, Qdrant, Redis, App - всі працюють
**Оновлено:** 2026-01-18
