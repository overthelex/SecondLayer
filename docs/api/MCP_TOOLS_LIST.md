> **OUTDATED:** This document was a snapshot from 2026-01-18 listing only 10 tools.
> The current system has **118 tools**. See [ALL_MCP_TOOLS.md](../ALL_MCP_TOOLS.md) for the full list.
> ZakonOnline API references are legacy -- primary court data source is now EDRSR.

# SecondLayer MCP Tools Reference (Historical Snapshot)

Список інструментів MCP сервера з контейнера **secondlayer-app** (зйомка 2026-01-18)

Оновлено: 2026-01-18 18:55:22

---

## 📊 Загальна інформація

- **Інструментів у зйомці:** 10 (з 118 поточних)
- **API версія:** 
- **Сервер:** 

---


## 🔧 search_legal_precedents

**Опис:** Поиск юридических прецедентов с семантическим анализом

💰 Примерная стоимость: $0.03-$0.10 USD
Стоимость зависит от сложности запроса и количества результатов. Включает OpenAI API (embeddings), ZakonOnline API (поиск), SecondLayer MCP (обработка документов).


**Параметри:**

```json
{"type":"object","properties":{"query":{"type":"string","description":"Поисковый запрос"},"domain":{"type":"string","enum":["court","npa","echr","all"],"default":"all"},"time_range":{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"}}},"limit":{"type":"number","default":10,"description":"Количество результатов для возврата"},"offset":{"type":"number","default":0,"description":"Смещение для пагинации (пропустить первые N результатов)"},"count_all":{"type":"boolean","default":false,"description":"Подсчитать ВСЕ результаты через пагинацию (может быть дорого и долго). Если true - вернет только общий счетчик без загрузки документов."},"sections":{"type":"array","items":{"type":"string","enum":["FACTS","CLAIMS","LAW_REFERENCES","COURT_REASONING","DECISION","AMOUNTS"]}}},"required":["query"]}
```

**Обов'язкові параметри:** query

---


## 🔧 analyze_case_pattern

**Опис:** Анализирует паттерны судебной практики: аргументы, риски, статистика исходов

💰 Примерная стоимость: $0.02-$0.08 USD
Анализ существующих дел в базе данных. Включает OpenAI API (анализ паттернов) и доступ к PostgreSQL.


**Параметри:**

```json
{"type":"object","properties":{"intent":{"type":"string"},"case_ids":{"type":"array","items":{"type":"string"}}},"required":["intent"]}
```

**Обов'язкові параметри:** intent

---


## 🔧 get_similar_reasoning

**Опис:** Находит похожие судебные обоснования по векторному сходству

💰 Примерная стоимость: $0.01-$0.03 USD
Векторный поиск по эмбеддингам. Включает OpenAI API (embeddings) и Qdrant (векторная БД).


**Параметри:**

```json
{"type":"object","properties":{"query":{"type":"string"},"section_type":{"type":"string","enum":["FACTS","CLAIMS","LAW_REFERENCES","COURT_REASONING","DECISION","AMOUNTS"]},"limit":{"type":"number","default":10}},"required":["query"]}
```

**Обов'язкові параметри:** query

---


## 🔧 extract_document_sections

**Опис:** Извлекает структурированные секции из полного текста документа (ФАКТЫ, ОБОСНУВАННЯ, РІШЕННЯ)

💰 Примерная стоимость: $0.005-$0.05 USD
При use_llm=false: минимальная стоимость (только парсинг HTML). При use_llm=true: включает OpenAI API для точной экстракции секций.


**Параметри:**

```json
{"type":"object","properties":{"doc_id":{"type":["string","number"],"description":"ID документа из Zakononline для загрузки полного текста"},"document_id":{"type":"string","description":"Альтернативное название для doc_id"},"text":{"type":"string","description":"Полный текст документа (если уже есть)"},"use_llm":{"type":"boolean","default":false}},"required":[]}
```

**Обов'язкові параметри:** 

---


## 🔧 count_cases_by_party

**Опис:** Подсчитывает точное количество судебных дел по названию стороны (истец/ответчик)

💰 Примерная стоимость: зависит от количества результатов
Использует пагинацию через API Zakononline для точного подсчёта всех дел. Стоимость ~$0.007 за каждую страницу (1000 дел).


**Параметри:**

```json
{"type":"object","properties":{"party_name":{"type":"string","description":"Название компании или ФИО (например, \"Фінансова компанія Фангарант груп\")"},"party_type":{"type":"string","enum":["plaintiff","defendant","any"],"default":"any","description":"Тип стороны: истец (plaintiff), ответчик (defendant), или любая (any)"},"date_from":{"type":"string","description":"Дата начала периода поиска (формат: YYYY-MM-DD)"},"date_to":{"type":"string","description":"Дата окончания периода поиска (формат: YYYY-MM-DD)"},"return_cases":{"type":"boolean","default":false,"description":"Вернуть список дел вместе с подсчётом"},"max_cases_to_return":{"type":"number","default":100,"description":"Максимальное количество дел для возврата в списке (по умолчанию 100)"}},"required":["party_name"]}
```

**Обов'язкові параметри:** party_name

---


## 🔧 find_relevant_law_articles

**Опис:** Находит статьи законов, которые часто применяются в делах по теме

💰 Примерная стоимость: $0.01-$0.02 USD
Запрос к базе данных legal patterns. Минимальная стоимость (только PostgreSQL запросы).


**Параметри:**

```json
{"type":"object","properties":{"intent":{"type":"string"},"limit":{"type":"number","default":10}},"required":["intent"]}
```

**Обов'язкові параметри:** intent

---


## 🔧 check_precedent_status

**Опис:** Проверяет актуальность и статус прецедента: действующий, отменённый, сомнительный

💰 Примерная стоимость: $0.005-$0.015 USD
Проверка статуса в базе данных. Минимальная стоимость (только PostgreSQL запросы).


**Параметри:**

```json
{"type":"object","properties":{"case_id":{"type":"string"}},"required":["case_id"]}
```

**Обов'язкові параметри:** case_id

---


## 🔧 load_full_texts

**Опис:** Загружает полные тексты судебных решений и сохраняет в базу данных

💰 Примерная стоимость: зависит от количества документов
~$0.007 за каждый документ (Zakononline web scraping). Проверяет наличие в PostgreSQL и Redis кэше перед загрузкой.


**Параметри:**

```json
{"type":"object","properties":{"doc_ids":{"type":"array","items":{"type":"number"},"description":"Массив ID документов для загрузки (например, [110679112, 110441965])"},"max_docs":{"type":"number","default":1000,"description":"Максимальное количество документов для загрузки (защита от перегрузки)"},"batch_size":{"type":"number","default":100,"description":"Размер батча для обработки (по умолчанию 100)"}},"required":["doc_ids"]}
```

**Обов'язкові параметри:** doc_ids

---


## 🔧 get_citation_graph

**Опис:** Строит граф цитирований между делами: прямые и обратные связи

💰 Примерная стоимость: $0.005-$0.02 USD
Построение графа из базы данных. Минимальная стоимость (только PostgreSQL запросы).


**Параметри:**

```json
{"type":"object","properties":{"case_id":{"type":"string"},"depth":{"type":"number","default":2}},"required":["case_id"]}
```

**Обов'язкові параметри:** case_id

---


## 🔧 get_legal_advice

**Опис:** Главный инструмент: комплексный юридический анализ ситуации с проверкой источников и детекцией галлюцинаций

💰 Примерная стоимость: $0.10-$0.30 USD (зависит от reasoning_budget)
• quick: ~$0.10 (базовый анализ)
• standard: ~$0.15-$0.20 (рекомендуется)
• deep: ~$0.25-$0.30 (глубокий анализ с проверкой всех источников)

Самый дорогой инструмент. Включает множественные вызовы OpenAI API, ZakonOnline API, SecondLayer MCP и проверку галлюцинаций.


**Параметри:**

```json
{"type":"object","properties":{"query":{"type":"string"},"reasoning_budget":{"type":"string","enum":["quick","standard","deep"],"default":"standard"}},"required":["query"]}
```

**Обов'язкові параметри:** query

---

