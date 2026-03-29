# Полный список всех MCP инструментов SecondLayer

**Всего инструментов: 118**
- **mcp_backend**: 87 инструментов (порт 3000)
- **mcp_rada**: 4 инструмента (порт 3001)
- **mcp_openreyestr**: 27 инструментов (порт 3005)

> **Примечание:** Среды — только local и prod. Деплой на прод через CI/CD (merge PR в main, blue-green deploy).

## 📚 Related Documentation

- **[API Contract v1](API_CONTRACT.md)** - Canonical reference for all response formats, field types, and change policy (additive-only)
- **[MCP Client Integration Guide](MCP_CLIENT_INTEGRATION_GUIDE.md)** - Comprehensive guide for connecting 10+ LLM clients (Claude Desktop, Jan AI, LibreChat, AnythingLLM, Open WebUI, etc.) with complete configurations and examples
- **[API Explorer](../mcp_backend/docs/api-explorer.html)** - Interactive documentation for all MCP tools
- **[Client Integration Quick Start](../mcp_backend/docs/CLIENT_INTEGRATION.md)** - Quick start guide for client integration
- **[SSE Streaming](../mcp_backend/docs/SSE_STREAMING.md)** - Server-Sent Events protocol documentation

---

## 🏛️ MCP_BACKEND - Юридический анализ и судебная практика (87 инструментов)

> **Примечание:** Ниже перечислены основные инструменты. Полный актуальный список можно получить через `GET /api/tools` endpoint.
> Многие инструменты добавлены после первоначального описания (opendata, EDRSR, Spain legal, court sessions, и др.).

### Базовые инструменты конвейера

#### 1. **classify_intent**
Классификация запроса: service/task/depth (entry-point для роутинга pipeline)
- **Стоимость:** Минимальная

#### 2. **retrieve_legal_sources**
RAG retrieval: вернет сырые источники (cases/laws/guidance) без анализа
- **Стоимость:** Зависит от объема

#### 3. **analyze_legal_patterns**
Выделяет success_arguments/risk_factors по источникам/контексту
- **Стоимость:** $0.02-$0.08 USD

#### 4. **validate_response**
Trust layer: проверка, что ответ опирается на источники (anti-hallucination)
- **Стоимость:** $0.01-$0.03 USD

---

### Поиск судебных дел

#### 5. **search_legal_precedents**
Поиск юридических прецедентов с семантическим анализом
- **Параметры:** query, domain, time_range, limit, offset, count_all, sections
- **Стоимость:** $0.03-$0.10 USD
- Включает OpenAI embeddings, EDRSR (reyestr.court.gov.ua), обработку документов

#### 6. **search_supreme_court_practice**
Поиск практики Верховного Суду (ВП/КЦС/КГС/КАС/ККС)
- **Параметры:** procedure_code, query, time_range, court_level, section_focus, limit
- **Стоимость:** $0.05-$0.15 USD

#### 7. **find_similar_fact_pattern_cases**
Поиск дел по "похожим фактам" (извлечение ключевых терминов + поиск)
- **Параметры:** procedure_code, facts_text, time_range, limit
- **Стоимость:** $0.03-$0.10 USD

#### 8. **compare_practice_pro_contra**
Подборка практики "за/против" по тезе (две линии практики)
- **Параметры:** procedure_code, query, time_range, limit
- **Стоимость:** $0.05-$0.15 USD

---

### Анализ судебной практики

#### 9. **analyze_case_pattern**
Анализирует паттерны судебной практики: аргументы, риски, статистика исходов
- **Параметры:** intent, case_ids
- **Стоимость:** $0.02-$0.08 USD

#### 10. **get_similar_reasoning**
Находит похожие судебные обоснования по векторному сходству
- **Параметры:** query, section_type, date_from, date_to, court, chamber, dispute_category
- **Стоимость:** $0.01-$0.03 USD
- Использует OpenAI embeddings + Qdrant векторная БД

#### 11. **get_citation_graph**
Строит граф цитирований между делами: прямые и обратные связи
- **Параметры:** case_id, depth
- **Стоимость:** $0.005-$0.02 USD

#### 12. **check_precedent_status**
Проверяет актуальность и статус прецедента: действующий, отменённый, сомнительный
- **Параметры:** case_id
- **Стоимость:** $0.005-$0.015 USD

---

### Работа с документами

#### 13. **get_court_decision**
Загрузка полного текста решения/постановления и извлечение секций
- **Параметры:** doc_id, case_number, depth, reasoning_budget
- **Возвращает:** FACTS, COURT_REASONING, DECISION
- **Стоимость:** $0.01-$0.04 USD

#### 14. **get_case_text**
Получение полного текста судебного решения (alias для get_court_decision)
- **Параметры:** doc_id, case_number, depth, reasoning_budget
- **Стоимость:** $0.01-$0.04 USD

#### 15. **get_case_documents_chain** ⭐ НОВЫЙ
Получение всех связанных документов по номеру дела (все инстанции)
- **Параметры:**
  - `case_number` - номер дела (обязательный)
  - `include_full_text` - включить полные тексты (по умолчанию: true)
  - `max_docs` - максимум документов (по умолчанию: 50, макс: 100)
  - `group_by_instance` - группировать по инстанциям (по умолчанию: true)
- **Возвращает:**
  - Все решения/постановления/ухвалы по делу
  - Документы первой инстанции (господарські, цивільні, адміністративні, районні суди)
  - Апелляционные постановления (Харківський, Східний, інші апеляційні суди)
  - Кассационные постановления (КЦС/КГС/КАС/ККС ВС)
  - Постановления Великої Палати ВС (включая окремі думки)
  - Сводную статистику по инстанциям и типам документов
  - Хронологию дела от первой инстанции до ВП ВС
- **Классификация:**
  - По инстанциям: Перша інстанція → Апеляція → Касація → Велика Палата ВС
  - По типам: Рішення, Постанова, Ухвала, Окрема думка
- **Стоимость:** $0.005-$0.02 USD
- **Точность:** 100% (протестировано на деле 922/989/18 с 29 документами через все инстанции)
- **Примечание:** Используйте вместо get_court_decision когда нужна полная история дела через все инстанции

#### 16. **semantic_search**
Семантический поиск по векторным эмбеддингам в vault
- **Параметры:** query, limit, filters
- **Стоимость:** $0.01-$0.03 USD
- Использует Qdrant векторную базу данных

#### 17. **get_related_cases** ⚠️ В РАЗРАБОТКЕ
Поиск связанных судебных дел по номеру дела или эмбеддингам
- **Параметры:** case_number, doc_id, similarity_threshold
- **Статус:** Зарегистрирован в registry, но не реализован в handleToolCall

#### 18. **extract_document_sections**
Извлекает структурированные секции из полного текста документа
- **Параметры:** doc_id, document_id, text, use_llm
- **Секции:** ФАКТЫ, ОБОСНУВАННЯ, РІШЕННЯ
- **Стоимость:** $0.005-$0.05 USD (зависит от use_llm)

#### 17. **load_full_texts**
Загружает полные тексты судебных решений и сохраняет в базу данных
- **Параметры:** doc_ids[], max_docs, batch_size
- **Стоимость:** ~$0.007 за документ
- Проверяет PostgreSQL и Redis кеш перед загрузкой

#### 18. **bulk_ingest_court_decisions**
Массовая загрузка и индексация судебных решений
- **Параметры:** query, date_from, date_to, max_docs, max_pages, supreme_court_hint
- **Процесс:** Поиск → Web scraping → Извлечение секций → Embeddings → Qdrant
- **Стоимость:** Зависит от количества документов

---

### Подсчеты и статистика

#### 19. **count_cases_by_party**
Подсчитывает точное количество судебных дел по названию стороны
- **Параметры:** party_name, party_type (plaintiff/defendant/any), date_from, date_to
- **Стоимость:** ~$0.007 за страницу (1000 дел)
- Использует пагинацию API (EDRSR)

---

### Нормативная база

#### 20. **find_relevant_law_articles**
Находит статьи законов, которые часто применяются в делах по теме
- **Параметры:** intent, limit
- **Стоимость:** $0.01-$0.02 USD
- Запрос к БД legal patterns

#### 21. **search_procedural_norms**
Умный поиск процессуальных норм (ЦПК/ГПК) через RADA MCP
- **Параметры:** code (cpc/gpc), query, article, limit
- **Возвращает:** Релевантные статьи/фрагменты + структурированная выжимка
- **Стоимость:** $0.005-$0.03 USD

---

### Законодательство (интеграция с RADA)

#### 22. **get_legislation_article**
Получить полный текст конкретной статьи законодательного акта
- **Параметры:** rada_id, article_number, include_html, theme
- **Примеры:** "1618-15" для ЦПК, "435-15" для ГПК
- **Стоимость:** Минимальная

#### 23. **get_legislation_section**
Получить точный фрагмент/статью по ссылке
- **Параметры:** query ("ст. 625 ЦК"), rada_id, article_number, include_html
- **Стоимость:** Минимальная

#### 24. **get_legislation_articles**
Получить несколько статей законодательного акта одновременно
- **Параметры:** rada_id, article_numbers[], include_html, theme
- **Пример:** ["354", "355", "356"] - статьи о апелляционном обжаловании
- **Стоимость:** Минимальная

#### 25. **search_legislation**
Семантический поиск релевантных статей законодательства
- **Параметры:** query, rada_id, limit, include_html
- **Использует:** Векторный поиск
- **Стоимость:** $0.01-$0.03 USD

#### 26. **get_legislation_structure**
Получить структуру законодательного акта (содержание, разделы, главы)
- **Параметры:** rada_id
- **Стоимость:** Минимальная

---

### Процессуальные инструменты

#### 27. **calculate_procedural_deadlines**
Калькулятор процессуальных сроков
- **Параметры:** procedure_code, event_type, event_date, received_full_text_date, appeal_type
- **Стоимость:** $0.02-$0.08 USD

#### 28. **build_procedural_checklist**
Процессуальный чеклист (шаблон + ссылка на норму)
- **Параметры:** procedure_code, stage, case_category
- **Стоимость:** $0.01-$0.03 USD

#### 29. **calculate_monetary_claims**
Расчеты по денежным требованиям (минимально: 3% годовых)
- **Параметры:** amount, date_from, date_to, claim_type
- **Стоимость:** Минимальная

---

### Парсинг документов

#### 30. **parse_document**
Парсинг документа (PDF/DOCX/HTML) с извлечением текста и метаданных
- **Параметры:** fileBase64, mimeType, filename
- **Стратегия:** PDF (текст → OCR), DOCX (mammoth → OCR), HTML (screenshot → OCR)
- **OCR:** Playwright + Google Vision API
- **Языки:** украинский, русский, английский
- **Стоимость:** $0.01-$0.10 USD (зависит от OCR)

#### 31. **extract_key_clauses**
Извлечение ключевых положений из контракта/соглашения
- **Параметры:** documentText, documentId
- **Классифицирует клаузы:** стороны, права/обязательства, сроки, платежи, штрафы, форс-мажор
- **Анализ рисков:** через analyze_legal_patterns
- **Стоимость:** $0.03-$0.10 USD

#### 32. **summarize_document**
Создание краткого и детального резюме документа
- **Параметры:** documentText, detailLevel (quick/standard/deep)
- **Включает:** Executive summary, Detailed summary, Ключевые факты
- **Стоимость:** $0.02-$0.08 USD

#### 33. **compare_documents**
Семантическое сравнение двух версий документа
- **Параметры:** oldDocumentText, newDocumentText
- **Классифицирует изменения:** критические, значительные, незначительные
- **Использует:** Векторные эмбеддинги
- **Стоимость:** $0.03-$0.12 USD

---

### Комплексные инструменты

#### 34. **store_document**
Сохранение документа в vault (хранилище документов)
- **Параметры:** title, content, metadata, tags
- **Стоимость:** Минимальная

#### 35. **get_document**
Получение документа из vault по ID
- **Параметры:** document_id, include_content
- **Стоимость:** Минимальная

#### 36. **list_documents**
Просмотр списка документов в vault с фильтрацией
- **Параметры:** filters, limit, offset
- **Стоимость:** Минимальная

---

### Дополнительные инструменты поиска и анализа

#### 37. **get_document_text**
Получение полного текста документа по doc_id
- **Параметры:** doc_id, include_metadata
- **Стоимость:** Минимальная

#### 38. **get_case_metadata**
Получение метаданных судебного дела без полного текста
- **Параметры:** doc_id, case_number
- **Стоимость:** Минимальная

#### 39. **analyze_judicial_reasoning**
Глубокий анализ судебного обоснования (мотивировка)
- **Параметры:** doc_id, reasoning_depth
- **Стоимость:** $0.02-$0.05 USD

#### 40. **extract_legal_principles**
Извлечение правовых принципов из судебных решений
- **Параметры:** doc_ids[], principle_type
- **Стоимость:** $0.03-$0.08 USD

#### 41. **compare_decisions**
Сравнение двух или более судебных решений
- **Параметры:** doc_ids[], comparison_aspect
- **Стоимость:** $0.02-$0.06 USD

#### 42. **track_precedent_evolution**
Отслеживание эволюции прецедента во времени
- **Параметры:** case_number, time_range
- **Стоимость:** $0.03-$0.08 USD

#### 43. **get_citation_network**
Построение сети цитирований для набора дел
- **Параметры:** doc_ids[], depth, include_backward
- **Стоимость:** $0.05-$0.15 USD

#### 44. **batch_process_documents**
Пакетная обработка документов (парсинг, извлечение, резюме)
- **Параметры:** files[], operations, concurrency
- **Стоимость:** Зависит от количества и операций

#### 45. **get_judge_statistics**
Статистика по судье (количество дел, исходы, специальные)
- **Параметры:** judge_name, court, time_range
- **Стоимость:** $0.01-$0.03 USD

#### 46. **analyze_court_trends**
Анализ тенденций судебной практики
- **Параметры:** query, court, time_range, trend_type
- **Стоимость:** $0.05-$0.12 USD

---

### Главный инструмент

#### 47. **get_legal_advice** ⭐ ГЛАВНЫЙ ИНСТРУМЕНТ
Комплексный юридический анализ ситуации с проверкой источников и детекцией галлюцинаций
- **Параметры:** query, reasoning_budget (quick/standard/deep)
- **Включает:** Множественные вызовы OpenAI, EDRSR, SecondLayer, проверка галлюцинаций
- **Стоимость:**
  - quick: ~$0.10
  - standard: ~$0.15-$0.20 (рекомендуется)
  - deep: ~$0.25-$0.30
- **Самый дорогой инструмент**

---

**📊 Итого:** 118 инструментов

- **mcp_backend:** 87 инструментов (включая court decisions, EDRSR, opendata registries, Spain legal, procedural, vault, due diligence, legislation, ECHR, и др.)
- **mcp_rada:** 4 инструмента (deputies, bills, legislation text, voting)
- **mcp_openreyestr:** 27 инструментов (entities, beneficiaries, debtors, notaries, sanctions, ProZorro, enforcement, и др.)

---

## 🏛️ MCP_RADA - Данные Верховной Рады (4 инструмента)

### 48. **search_parliament_bills**
Поиск законопроектов Верховной Рады с семантическим анализом
- **Параметры:** query, status, initiator, committee, date_from, date_to, limit
- **Статусы:** registered, first_reading, second_reading, adopted, rejected, all
- **Стоимость:** $0.01-$0.05 USD

### 49. **get_deputy_info**
Получение детальной информации о народном депутате
- **Параметры:** name, rada_id, include_voting_record, include_assistants
- **Включает:** биографию, комитеты, фракцию, голосования
- **Кеш:** 7 дней TTL
- **Стоимость:** $0.005-$0.01 USD

### 50. **search_legislation_text**
Поиск в текстах законов Украины с ссылками на судебные решения
- **Параметры:** law_identifier, article, search_text, include_court_citations
- **Псевдонимы:** constitution, цивільний кодекс, кримінальний кодекс, кпк
- **Интеграция:** include_court_citations использует SecondLayer
- **Кеш:** 30 дней TTL
- **Стоимость:** $0.005-$0.02 USD

### 51. **analyze_voting_record**
Анализ истории голосований депутата с AI-инсайтами
- **Параметры:** deputy_name, date_from, date_to, bill_number, analyze_patterns
- **AI анализ:** выявление трендов через OpenAI
- **Стоимость:** $0.02-$0.10 USD

---

## 🏢 MCP_OPENREYESTR - Единый государственный реестр (27 инструментов)

> **Примечание:** OpenReyestr существенно расширен. Помимо базовых 5 инструментов (search_entities, get_entity_details, search_beneficiaries, get_by_edrpou, get_statistics) добавлены: search_debtors, search_notaries, search_beneficiaries, search_bankruptcy_cases, search_enforcement_proceedings, search_prozorro, search_rnbo_sanctions, search_nazk_declarations, search_court_experts, search_arbitration_managers, search_arma_seized_assets, search_esv_debt, search_exchange_data, search_forensic_methods, search_legal_acts, search_single_tax_payers, search_special_forms, search_street_renamings, search_streets, search_tax_debt, search_termination_started, search_vat_payers, search_administrative_units.

### 52. **search_entities**
Поиск субъектов хозяйствования в государственном реестре
- **Параметры:** query, edrpou, record, entityType (UO/FOP/FSU/ALL), stan, limit, offset
- **Типы:**
  - **UO** - Юридические лица
  - **FOP** - ФЛП (физические лица-предприниматели)
  - **FSU** - Общественные организации
- **Индексы:** Full-text search на названиях
- **Стоимость:** $0.001-$0.005 USD

### 53. **get_entity_details**
Получение полной информации о субъекте хозяйствования
- **Параметры:** record (обязательно), entityType
- **Возвращает:**
  - Основная информация (название, ЕДРПОУ, статус)
  - Учредители (засновники)
  - **Бенефициарные владельцы** (бенефіціари)
  - Руководители (керівники)
  - Члены органов управления
  - Филиалы (філії)
  - Правопредшественники/правопреемники
  - Данные о прекращении деятельности
  - Данные обмена с госорганами (ГНС, ПФУ)
- **Стоимость:** $0.001-$0.003 USD

### 54. **search_beneficiaries**
Поиск конечных бенефициарных владельцев (контролеров) компаний
- **Параметры:** query (имя бенефициара), limit
- **Поиск:** По всем субъектам хозяйствования
- **Пример:** "Коломойський" → все компании, где он бенефициар
- **Стоимость:** $0.002-$0.005 USD

### 55. **get_by_edrpou**
Быстрый поиск субъекта хозяйствования по коду ЕДРПОУ
- **Параметры:** edrpou (8 цифр)
- **Оптимизация:** Индекс на ЕДРПОУ для быстрого поиска
- **Стоимость:** $0.001 USD

### 56. **get_statistics**
Статистика по Единому государственному реестру
- **Возвращает:**
  - Общее количество зарегистрированных субъектов (по типам)
  - Количество активных субъектов (по типам)
  - Общие итоги
- **Стоимость:** $0.001 USD

---

## 📊 Сводная таблица по серверам

| Сервер | Порт (dev) | Инструментов | Основное назначение | Средняя стоимость |
|--------|-----------|--------------|---------------------|-------------------|
| **mcp_backend** | 3000 | 87 | Судебная практика, юридический анализ, парсинг документов, opendata, EDRSR, ECHR, Spain legal | $0.01-$0.30 |
| **mcp_rada** | 3001 | 4 | Парламентские данные, законопроекты, депутаты | $0.005-$0.10 |
| **mcp_openreyestr** | 3005 | 27 | Реєстри юридических лиц, ФЛП, бенефициары, боржники, нотаріуси, санкції, ProZorro та ін. | $0.001-$0.005 |

---

## 🔗 Интеграция между серверами

### mcp_backend ↔ mcp_rada
- `search_procedural_norms` использует RADA MCP для поиска норм ЦПК/ГПК
- Инструменты законодательства (`get_legislation_*`) интегрированы с RADA

### mcp_rada ↔ mcp_backend
- `search_legislation_text` с `include_court_citations=true` использует SecondLayer для поиска судебных решений

### mcp_openreyestr ↔ mcp_backend
- Возможна интеграция для проверки участников судебных дел
- Верификация бенефициаров в правовых исследованиях

---

## 🚀 Доступ к API

### HTTP REST API

**mcp_backend (dev):**
```bash
curl -X POST http://localhost:3003/api/tools/search_legal_precedents \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "затримка доставки", "limit": 10}}'
```

**mcp_rada (dev):**
```bash
curl -X POST http://localhost:3001/api/tools/get_deputy_info \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"name": "Зеленський"}}'
```

**mcp_openreyestr (dev):**
```bash
curl -X POST http://localhost:3005/api/search \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "Приватбанк", "entityType": "UO", "limit": 10}'
```

### MCP Protocol (stdio)

Для интеграции с Claude Desktop добавьте в `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": ["/path/to/mcp_backend/dist/index.js"]
    },
    "rada": {
      "command": "node",
      "args": ["/path/to/mcp_rada/dist/index.js"]
    },
    "openreyestr": {
      "command": "node",
      "args": ["/path/to/mcp_openreyestr/dist/index.js"]
    }
  }
}
```

---

## 💰 Стоимость по категориям

### Самые дешевые (<$0.01)
- get_statistics (openreyestr)
- get_by_edrpou (openreyestr)
- search_entities (openreyestr)
- get_legislation_* (backend/rada)
- check_precedent_status (backend)

### Средняя стоимость ($0.01-$0.05)
- search_legal_precedents (backend)
- get_court_decision (backend)
- search_legislation_text (rada)
- search_parliament_bills (rada)
- get_entity_details (openreyestr)

### Дорогие ($0.05-$0.15)
- search_supreme_court_practice (backend)
- compare_practice_pro_contra (backend)
- analyze_voting_record (rada)
- extract_key_clauses (backend)

### Самые дорогие (>$0.15)
- **get_legal_advice** - $0.10-$0.30 (комплексный анализ)

---

## 📝 Примечания

1. **Кеширование:**
   - RADA: Deputies 7d, Bills 1d, Laws 30d
   - Backend: Redis + PostgreSQL
   - OpenReyestr: PostgreSQL только

2. **Источники данных:**
   - Backend: EDRSR (reyestr.court.gov.ua) — основной источник судебных решений, OpenData реєстри (data.gov.ua)
   - RADA: data.rada.gov.ua (бесплатный)
   - OpenReyestr: data.gov.ua (бесплатный)
   - ZakonOnline API (устаревший, на этапе вывода из эксплуатации)

3. **AI модели:**
   - OpenAI: gpt-4o-mini (quick), gpt-4o (deep)
   - Embeddings: text-embedding-ada-002
   - Опционально: Anthropic Claude

4. **Векторный поиск:**
   - Qdrant для семантического поиска
   - Используется в: search_legislation, get_similar_reasoning, compare_documents
