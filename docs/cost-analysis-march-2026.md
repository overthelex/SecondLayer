# Оцінка собівартості MCP запитів — Березень 2026

*LEG-372 | Дата аналізу: 17 березня 2026*

---

## 1. Резюме

| Показник | Значення |
|----------|----------|
| **Загальні витрати/міс** | ~$1,088 |
| Фіксована інфраструктура (AWS) | ~$555/міс |
| Змінні API витрати (30 днів) | $532.62 |
| Загальна кількість запитів (30 днів) | 4,226 |
| Активних днів | 25 |
| Середня кількість запитів/день | ~169 |
| Середня собівартість 1 запиту (з інфра) | $0.258 |
| **Головний cost driver** | ai_chat — 98.5% API витрат |

---

## 2. AWS інфраструктура — фіксовані витрати

| Сервіс | Конфігурація | Вартість/міс |
|---------|-------------|-------------|
| EC2 | r6i.xlarge (4 vCPU, 32GB RAM) On-Demand | ~$217 |
| EBS | gp3 1500GB, 16K IOPS, 1000 MB/s | ~$263 |
| ALB | 1 Application Load Balancer (3 AZ) | ~$33-43 |
| WAF | 1 WebACL, 10 rules | ~$20-30 |
| Elastic IP | 4 EIP | ~$0-4 |
| ACM | SSL certificate | $0 |
| CloudWatch | WAF logs (30 days) | ~$5-10 |
| **Разом** | | **~$540-570/міс (~$555 середнє)** |

### Амортизація інфраструктури per-request

При поточних 4,226 запитів/міс:

```
$555 / 4,226 = $0.131 per request
```

При зростанні до 10,000 запитів/міс: **$0.056 per request**
При зростанні до 50,000 запитів/міс: **$0.011 per request**

---

## 3. Змінні API витрати (30 днів)

| Провайдер | Витрати | % від загальних |
|-----------|---------|----------------|
| OpenAI (GPT-4o/mini, embeddings) | $134.30 | 25.2% |
| Bedrock/Claude (через ai_chat) | ~$396.51 | 74.5% |
| ZakonOnline API | $1.81 | 0.3% |
| SecondLayer (RADA/OpenReyestr) | $0.05 | ~0% |
| Voyage AI (embeddings) | $0.00 | 0% |
| Anthropic (direct API) | $0.00 | 0% |
| **Разом** | **$532.62** | **100%** |

---

## 4. Собівартість per-tool (30 днів, реальні дані)

### Tier 1 — Важкі (> $1.00/запит)

| Інструмент | Запитів | Сер. вартість | Медіана | Мін | Макс | Сер. токенів | % бюджету |
|-----------|---------|-------------|---------|-----|------|------------|----------|
| **ai_chat** | 239 | **$2.196** | $0.524 | $0.009 | $34.642 | 89,867 | 98.5% |

> ai_chat — це multi-turn LLM чат з orchestration. Медіана $0.52 значно нижча за середнє ($2.20), що вказує на heavy tail: кілька дуже дорогих deep-analysis запитів ($10-35) тягнуть середнє вгору.

### Tier 2 — Середні ($0.01–$1.00/запит)

| Інструмент | Запитів | Сер. вартість | Медіана | Мін | Макс | Сер. токенів |
|-----------|---------|-------------|---------|-----|------|------------|
| search_legal_precedents | 16 | $0.266 | $0.121 | $0.007 | $1.453 | 1,778 |
| get_case_documents_chain | 1 | $0.180 | $0.180 | $0.180 | $0.180 | 0 |
| load_full_texts | 4 | $0.033 | $0.044 | $0.044 | $0.044 | 4,853 |
| get_court_decision | 63 | $0.026 | $0.045 | $0.007 | $0.090 | 0 |
| search_supreme_court_practice | 61 | $0.022 | $0.045 | $0.007 | $0.045 | 0 |
| classify_intent | 6 | $0.010 | $0.019 | $0.019 | $0.021 | 1,543 |

### Tier 3 — Легкі ($0.001–$0.01/запит)

| Інструмент | Запитів | Сер. вартість | Сер. токенів |
|-----------|---------|-------------|------------|
| search_legislation | 12 | $0.004 | 1,129 |

### Tier 4 — Безкоштовні/Мінімальні (< $0.001/запит)

| Інструмент | Запитів | Сер. вартість | Примітка |
|-----------|---------|-------------|---------|
| document_classify | 1,440 | $0.000116 | GPT-nano classification |
| semantic_search | 13 | $0.000008 | Vector search only |
| list_documents | 1,303 | $0.000 | DB query only |
| get_document | 999 | $0.000 | DB/storage retrieval |
| get_legislation_article | 43 | $0.000 | RADA API + cache |
| get_legislation_structure | 10 | $0.000 | Cached structure |
| find_relevant_law_articles | 2 | $0.000 | Cache hit |
| search_court_sessions | 2 | $0.000 | DB query |
| search_business_entities | 1 | $0.000 | OpenReyestr proxy |
| Всі openreyestr_* (7 tools) | 7 | $0.000 | Proxy to OpenReyestr |
| rada_search_parliament_bills | 1 | $0.000 | Proxy to RADA |
| search_echr_practice | 1 | $0.000 | DB search |

### Інструменти без запитів за 30 днів (0 usage)

Наступні 20+ інструментів не мали жодного запиту за останні 30 днів:
- analyze_case_pattern, analyze_legal_patterns, analyze_judicial_reasoning, analyze_court_trends
- get_similar_reasoning, get_related_cases, get_citation_graph, get_citation_network
- check_precedent_status, track_precedent_evolution
- compare_practice_pro_contra, compare_documents, compare_decisions
- search_procedural_norms, calculate_procedural_deadlines, build_procedural_checklist, calculate_monetary_claims
- parse_document, extract_key_clauses, summarize_document, batch_process_documents
- store_document, get_judge_statistics, count_cases_by_party
- get_legal_advice, bulk_ingest_court_decisions, extract_document_sections

---

## 5. Поточна база користувачів

| Тарифний план | Користувачів | Загальні витрати ($) | Сер. баланс ($) |
|--------------|-------------|-------------------|----------------|
| **free** | 7 | $128.68 | $81.62 |
| **startup** ($29/міс) | 17 | $147.30 | $146.45 |
| **attorney** ($49/міс) | 1 | $258.31 | $41.69 |
| **business** ($99/міс) | 0 | — | — |
| **enterprise** ($499/міс) | 0 | — | — |
| **Разом** | **25** | **$534.29** | — |

---

## 6. Break-even аналіз по тарифних планах

### Поточна фінансова модель

```
Щомісячний дохід (підписки):
  17 × startup ($29)   = $493
   1 × attorney ($49)  = $49
   7 × free ($0)       = $0
                        -------
  Дохід від підписок:    $542/міс

Щомісячний дохід (markup на usage):
  startup (30%):  $147.30 × 0.30/(1+0.30) = ~$34 markup
  attorney (30%): $258.31 × 0.30/(1+0.30) = ~$60 markup
  free (0%):      $0
                        -------
  Дохід від markup:      ~$94/міс

ЗАГАЛЬНИЙ ДОХІД:         ~$636/міс
ЗАГАЛЬНІ ВИТРАТИ:        ~$1,088/міс (infra $555 + API $533)
                        -------
ЗБИТОК:                  ~-$452/міс
```

### Break-even сценарії

| Сценарій | Потрібно підписок | Дохід | Покриває |
|----------|------------------|-------|---------|
| Поточний стан | 17 startup + 1 attorney | $636 | 58% витрат |
| Break-even (startup only) | ~38 startup | $1,102 | ~100% |
| Break-even (mix) | 25 startup + 5 attorney + 1 business | $1,119 | ~100% |
| Profitable (+30%) | 30 startup + 5 attorney + 2 business | $1,467 | 135% |

### Break-even per tier (за скільки запитів окупається підписка)

| Тарифний план | Підписка/міс | Markup | Запитів до break-even* |
|--------------|-------------|--------|----------------------|
| free ($0) | $0 | 0% | N/A (не окупається) |
| startup ($29) | $29 | 30% | Перші $29 покривають інфра |
| attorney ($49) | $49 | 30% | Перші $49 покривають інфра |
| business ($99) | $99 | 50% | Перші $99 покривають інфра |
| enterprise ($499) | $499 | 40% | Перші $499 покривають інфра |

*Підписка покриває частку інфраструктурних витрат. Markup покриває API costs + маржу.

---

## 7. Ключова проблема: ai_chat cost concentration

**98.5% всіх API витрат** — це один інструмент `ai_chat` ($524.83/міс з $532.62).

Розподіл витрат ai_chat:
- **Медіана**: $0.52/запит (типовий запит)
- **Середнє**: $2.20/запит (завищене через outliers)
- **P95 (оцінка)**: ~$10-15/запит (deep analysis)
- **Максимум**: $34.64/запит (edge case)

### Рекомендація: бюджетні ліміти для ai_chat

| Budget level | Макс. вартість/запит | Модель |
|-------------|---------------------|--------|
| quick | $0.50 | gpt-5-nano / nova-lite |
| standard | $2.00 | gpt-4.1-mini / claude-haiku |
| deep | $10.00 | gpt-4.1 / claude-sonnet |
| unlimited | без ліміту | claude-opus (only enterprise) |

---

## 8. Рекомендації з оптимізації

### 8.1. EC2 Reserved Instance (найбільша економія)

| Опція | Вартість/міс | Економія | ROI |
|-------|-------------|---------|-----|
| On-Demand (поточна) | $217 | — | — |
| 1-year RI (No Upfront) | ~$152 | $65/міс (30%) | Немає upfront |
| 1-year RI (All Upfront) | ~$130 | $87/міс (40%) | ~$1,560 upfront |
| 3-year RI (All Upfront) | ~$91 | $126/міс (58%) | ~$3,276 upfront |

**Рекомендація: 1-year RI No Upfront** → економія **$780/рік** без upfront commitment.

### 8.2. Bedrock Savings Plan

При $396/міс на Bedrock Claude:
- 1-year commitment: ~15-20% savings → **$60-80/міс економія**
- Потрібно підтвердити мінімальний commit через AWS Console

### 8.3. Оптимізація ai_chat моделей

| Зміна | Очікувана економія | Вплив на якість |
|-------|-------------------|----------------|
| Quick queries → nova-lite замість claude-haiku | ~$50-80/міс | Мінімальний для прості запити |
| Кешування повторних запитів (semantic dedup) | ~$30-50/міс | Без впливу |
| Token budget limits per request | ~$20-40/міс | Обмежує edge cases |
| Streaming abort при перевищенні бюджету | ~$10-20/міс | Краще UX |

### 8.4. Cloudflare Cache для static

Поточний data transfer OUT: ~$0.09/GB. Якщо static assets (JS, CSS, images) йдуть через ALB:
- Перенести на Cloudflare Cache → зменшити ALB LCU та data transfer
- Очікувана економія: ~$5-15/міс

### 8.5. EBS optimization

gp3 1500GB може бути oversized. Перевірити:
```bash
# Actual disk usage
df -h /data
# IOPS utilization
aws cloudwatch get-metric-statistics --metric-name VolumeReadOps ...
```
Якщо використовується < 500GB → зменшити до 750GB → **економія ~$88/міс**.

### 8.6. Зведена таблиця savings

| Оптимізація | Економія/міс | Складність | Пріоритет |
|------------|-------------|-----------|----------|
| EC2 Reserved Instance (1yr) | $65-87 | Низька | **P0** |
| Bedrock Savings Plan | $60-80 | Низька | **P0** |
| ai_chat model optimization | $50-80 | Середня | **P1** |
| EBS resize (якщо applicable) | $88 | Низька | **P1** |
| Semantic caching | $30-50 | Висока | **P2** |
| Cloudflare static cache | $5-15 | Низька | **P2** |
| **Разом потенційна економія** | **$298-400/міс** | | |

При повній оптимізації: витрати знижуються з **~$1,088 до ~$688-790/міс**.

---

## 9. Повна таблиця собівартості всіх інструментів

### Категорія A: Активні інструменти (мали запити за 30 днів)

| # | Інструмент | Тип | Запитів | Avg cost ($) | Медіана ($) | LLM tokens | Infra amort ($) | **Повна собівартість ($)** |
|---|-----------|-----|---------|-------------|------------|------------|----------------|--------------------------|
| 1 | ai_chat | LLM orchestration | 239 | 2.196 | 0.524 | 89,867 | 0.131 | **2.327** |
| 2 | document_classify | LLM nano | 1,440 | 0.000116 | 0.0001 | 591 | 0.131 | **0.131** |
| 3 | list_documents | DB query | 1,303 | 0.000 | 0.000 | 0 | 0.131 | **0.131** |
| 4 | get_document | Storage | 999 | 0.000 | 0.000 | 0 | 0.131 | **0.131** |
| 5 | search_legal_precedents | LLM + search | 16 | 0.266 | 0.121 | 1,778 | 0.131 | **0.397** |
| 6 | get_court_decision | External API | 63 | 0.026 | 0.045 | 0 | 0.131 | **0.157** |
| 7 | search_supreme_court_practice | External API | 61 | 0.022 | 0.045 | 0 | 0.131 | **0.153** |
| 8 | get_legislation_article | RADA API | 43 | 0.000 | — | 0 | 0.131 | **0.131** |
| 9 | semantic_search | Vector DB | 13 | 0.000008 | 0.0001 | 2 | 0.131 | **0.131** |
| 10 | search_legislation | LLM + DB | 12 | 0.004 | 0.009 | 1,129 | 0.131 | **0.135** |
| 11 | get_legislation_structure | Cache/DB | 10 | 0.000 | — | 0 | 0.131 | **0.131** |
| 12 | classify_intent | LLM mini | 6 | 0.010 | 0.019 | 1,543 | 0.131 | **0.141** |
| 13 | load_full_texts | External + LLM | 4 | 0.033 | 0.044 | 4,853 | 0.131 | **0.164** |
| 14 | find_relevant_law_articles | Cache | 2 | 0.000 | — | 0 | 0.131 | **0.131** |
| 15 | search_court_sessions | DB query | 2 | 0.000 | — | 0 | 0.131 | **0.131** |
| 16 | get_case_documents_chain | External chain | 1 | 0.180 | 0.180 | 0 | 0.131 | **0.311** |
| 17 | search_business_entities | OpenReyestr | 1 | 0.000 | — | 0 | 0.131 | **0.131** |
| 18 | search_entity_beneficiaries | OpenReyestr | 1 | 0.000 | — | 0 | 0.131 | **0.131** |
| 19-28 | openreyestr_* (7), rada_* (1), search_echr | Proxy/DB | 1 each | 0.000 | — | 0 | 0.131 | **0.131** |

### Категорія B: Неактивні інструменти (0 запитів за 30 днів) — оцінка

| Інструмент | Очікуваний тип | Оцінка собівартості ($) |
|-----------|---------------|----------------------|
| get_legal_advice | Multi-LLM deep | $0.50-$2.00 |
| analyze_case_pattern | LLM + DB | $0.10-$0.50 |
| compare_practice_pro_contra | Multi-LLM | $0.10-$0.50 |
| analyze_legal_patterns | LLM + Qdrant | $0.05-$0.20 |
| analyze_judicial_reasoning | LLM analysis | $0.05-$0.20 |
| batch_process_documents | Bulk LLM | $0.50-$5.00 (per batch) |
| bulk_ingest_court_decisions | Bulk import | $1.00-$10.00 (per batch) |
| compare_documents | LLM comparison | $0.05-$0.30 |
| summarize_document | LLM summary | $0.02-$0.10 |
| parse_document | LLM extraction | $0.02-$0.10 |
| extract_key_clauses | LLM extraction | $0.02-$0.10 |
| calculate_procedural_deadlines | Rule-based | ~$0.00 |
| build_procedural_checklist | Rule-based | ~$0.00 |
| calculate_monetary_claims | Rule-based | ~$0.00 |
| search_procedural_norms | DB search | ~$0.00 |
| store_document | Storage write | ~$0.00 |
| get_similar_reasoning | Vector search | ~$0.001 |
| get_related_cases | Vector search | ~$0.001 |
| check_precedent_status | DB query | ~$0.00 |
| track_precedent_evolution | DB query | ~$0.00 |
| get_citation_graph | DB query | ~$0.00 |
| get_citation_network | DB query | ~$0.00 |
| get_judge_statistics | DB aggregation | ~$0.00 |
| count_cases_by_party | DB count | ~$0.00 |
| analyze_court_trends | DB + minor LLM | $0.01-$0.05 |
| extract_document_sections | LLM section | $0.02-$0.10 |

---

## 10. Перевірка pricing tiers — чи покривають markup?

### Поточна ситуація (за останні 30 днів)

| Tier | Користувачів | Підписка/міс | Markup | API витрати | Markup дохід | Підписка дохід | Прибуток/користувач |
|------|-------------|-------------|--------|------------|-------------|---------------|-------------------|
| free | 7 | $0 | 0% | $128.68 | $0 | $0 | **-$18.38** |
| startup | 17 | $29 | 30% | $147.30 | ~$34 | $493 | **+$22.47** |
| attorney | 1 | $49 | 30% | $258.31 | ~$60 | $49 | **-$149.31** |

### Проблеми

1. **Free tier**: повна втрата — 7 користувачів генерують $128.68 витрат без доходу
2. **Attorney tier**: 1 heavy user з $258 витратами (переважно ai_chat deep queries) — підписка $49 + markup $60 = $109 доходу при $258 витратах. **Недостатній markup**.
3. **Startup tier**: прибутковий завдяки великій кількості та помірному usage

### Рекомендації по pricing

| Зміна | Обґрунтування |
|-------|-------------|
| Free tier: ліміт $5/міс API витрат | Запобігає зловживанню |
| Attorney tier: підвищити markup до 40% або підписку до $79 | Покриває heavy usage |
| Додати per-request cap для ai_chat ($5/запит для startup, $15 для attorney) | Контроль outliers |
| Enterprise tier: мінімальний commit $499/міс замість pay-as-you-go | Гарантований дохід |

---

## 11. Зведена картина

```
┌─────────────────────────────────────────────────────┐
│              MONTHLY COST STRUCTURE                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  AWS Infrastructure (fixed)         $555  (51%)     │
│  ├── EC2 r6i.xlarge                 $217            │
│  ├── EBS gp3 1500GB                 $263            │
│  ├── ALB + WAF                      $63             │
│  └── Other (EIP, CloudWatch)        $12             │
│                                                     │
│  LLM API costs (variable)           $531  (49%)     │
│  ├── Bedrock Claude (ai_chat)       $397  (75%)     │
│  ├── OpenAI (all tools)             $134  (25%)     │
│  └── ZakonOnline + Other            $2    (<1%)     │
│                                                     │
│  TOTAL                              $1,088          │
│                                                     │
│  Revenue (subs + markup)            $636            │
│  NET LOSS                           -$452/міс       │
│                                                     │
│  After optimization (-$340/міс)     $748            │
│  NET LOSS (optimized)               -$112/міс       │
│  Break-even: +4 startup users       $0              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 12. Action items

- [ ] **P0**: Купити EC2 Reserved Instance 1-year No Upfront (економія $65/міс)
- [ ] **P0**: Оцінити Bedrock Savings Plan через AWS Console
- [ ] **P0**: Встановити API budget cap для free tier ($5/міс)
- [ ] **P1**: Перевірити EBS utilization, зменшити якщо < 50% usage
- [ ] **P1**: Впровадити per-request cost cap для ai_chat
- [ ] **P1**: Переглянути attorney tier pricing ($49 → $79 або markup 30% → 40%)
- [ ] **P2**: Semantic caching для повторних ai_chat запитів
- [ ] **P2**: Оптимізація model selection для quick queries (nova-lite)
- [ ] **P2**: Cloudflare cache для static assets через ALB
- [ ] Оновити pricing-service.ts якщо приймаються зміни по markup/caps
