# Всі таски SecondLayer (найскладніші зверху)

**Джерело:** [Linear Document](https://linear.app/legalorgua/document/vsi-taski-secondlayer-najskladnishi-zverhu-6b7179184aee)  
**Оновлено:** 2026-02-24

---

# Top 50 Most Complex Tasks — SecondLayer

Рейтинг задач за складністю (story points за шкалою Фібоначчі: 1, 2, 3, 5, 8, 13).
Оцінка враховує: кількість файлів, архітектурний вплив, кількість сервісів, складність алгоритмів, зовнішні інтеграції.

**Тарифна ставка**: $50/год
**Розрахунок**: 1 SP = 8 год → 3 SP = 24 год = $1,200 / 5 SP = 40 год = $2,000 / 8 SP = 64 год = $3,200 / 13 SP = 104 год = $5,200

---

## Складність 13 — Найскладніші (архітектурні)

| # | Задача | ID | Область | Чому складна | Час (год) | Вартість ($) |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | **LLM Agentic Chat Pipeline with SSE streaming** | [LEG-87](https://linear.app/legalorgua/issue/LEG-87/llm-agentic-chat-pipeline-with-sse-streaming) | AI/Chat | Agentic loop, SSE, tool calls, heartbeat, rate limiting, billing | 104 | $5,200 |
| 2 | **Chunked Upload System: multer + MinIO + BullMQ (5 фаз)** | [LEG-88](https://linear.app/legalorgua/issue/LEG-88/chunked-upload-system-multer-minio-bullmq-scaling) | Infrastructure | 5 фаз, nginx + redis + bullmq + frontend adaptive concurrency | 104 | $5,200 |
| 3 | **Client-Matter Segregation: migrations, 4 services, middleware** | [LEG-89](https://linear.app/legalorgua/issue/LEG-89/client-matter-segregation-migrations-services-middleware) | Backend | 3 міграції, 4 нових сервіси, GDPR SQL, зміна 5 існуючих сервісів | 104 | $5,200 |
| 4 | **Grafana + Prometheus monitoring stack across all services** | [LEG-90](https://linear.app/legalorgua/issue/LEG-90/grafana-prometheus-monitoring-stack-across-all-services) | Observability | 3 сервіси, 5 dashboards, 6 exporters, docker stack, alert rules | 104 | $5,200 |
| 5 | **Court Decision Scraping: Playwright + document-service offload** | [LEG-91](https://linear.app/legalorgua/issue/LEG-91/court-decision-scraping-playwright-scraper-document-service-offload) | Data Ingestion | Playwright browser automation + 4 bulk loaders + новий контейнер | 104 | $5,200 |
| 6 | **OpenReyestr: NAIS generic XML/CSV importers + SAX streaming** | [LEG-92](https://linear.app/legalorgua/issue/LEG-92/openreyestr-nais-generic-xmlcsv-importers-sax-streaming) | Data Ingestion | SAX streaming, 8 реєстрів, windows-1251, ZIP64, OOM prevention | 104 | $5,200 |
| 7 | **Billing System: tiers, subscriptions, MetaMask, Binance, Fondy** | [LEG-93](https://linear.app/legalorgua/issue/LEG-93/billing-system-tiers-subscriptions-crypto-payments-fondy) | Billing | Крипто + Fondy webhooks + DB tiers + BillingService USD pricing | 104 | $5,200 |
| 8 | **Admin Panel: overview, users, costs, monitoring (8+ pages)** | [LEG-94](https://linear.app/legalorgua/issue/LEG-94/admin-panel-overview-users-costs-monitoring-pricing-8-pages) | Frontend/Admin | 8+ сторінок, recharts, Prometheus metrics, 60 тестів | 104 | $5,200 |
| 9 | **Time Tracking & Billing Phase 1** | [LEG-95](https://linear.app/legalorgua/issue/LEG-95/time-tracking-and-billing-phase-1-time-entries-invoices-matter-billing) | Billing | Time entries + invoices + matter billing + seed data | 104 | $5,200 |
| 10 | **Chat Pipeline: parallel tools + multi-step plan + budget routing** | [LEG-96](https://linear.app/legalorgua/issue/LEG-96/chat-pipeline-parallel-tool-execution-multi-step-plan-budget-routing) | AI/Chat | Parallel execution, plan gen, GPT-5, RAG, history compression | 104 | $5,200 |
| 11 | **Chat Page P0+P1: conversations, multi-turn, markdown, tools** | [LEG-97](https://linear.app/legalorgua/issue/LEG-97/chat-page-p0p1-conversations-multi-turn-markdown-tools-uploads) | Frontend/Chat | Multi-turn persist, 45 tools, uploads, RightPanel, evidence base | 104 | $5,200 |

---

## Складність 8 — Великі фічі (мульти-файлові)

| # | Задача | ID | Область | Чому складна | Час (год) | Вартість ($) |
| -- | -- | -- | -- | -- | -- | -- |
| 12 | **MCP Tools Refactor: BaseToolHandler + ToolRegistry** | [LEG-98](https://linear.app/legalorgua/issue/LEG-98/mcp-tools-refactor-basetoolhandler-toolregistry-domain-extraction) | Architecture | Рефакторинг 45 tools, domain extraction, REST routes | 64 | $3,200 |
| 13 | **RADA Data Integration: deputies, bills, factions, voting** | [LEG-99](https://linear.app/legalorgua/issue/LEG-99/rada-data-integration-deputies-bills-factions-voting-cron-sync) | Data Ingestion | API sync, aliases, cron, LLM anti-hallucination rules | 64 | $3,200 |
| 14 | **VoyageAI Embeddings: migration + voyage-3.5 upgrade** | [LEG-100](https://linear.app/legalorgua/issue/LEG-100/voyageai-embeddings-migration-from-openai-voyage-35-upgrade) | AI/Embeddings | Міграція embeddings, rebuild script, cost tracking | 64 | $3,200 |
| 15 | **Admin Bash Terminal Console (AWS CloudShell style)** | [LEG-101](https://linear.app/legalorgua/issue/LEG-101/admin-bash-terminal-console-aws-cloudshell-style) | Admin/Infra | node-pty, WebSocket PTY, окремий Debian контейнер | 64 | $3,200 |
| 16 | **Real-time Shepardization for citation validity** | [LEG-102](https://linear.app/legalorgua/issue/LEG-102/real-time-shepardization-for-citation-validity-verification) | AI/Legal | CitationValidator в chat loop, SSE updates, norm extraction | 64 | $3,200 |
| 17 | **WebAuthn Passkeys: hardware keys + phone login** | [LEG-103](https://linear.app/legalorgua/issue/LEG-103/webauthn-passkeys-authentication-hardware-keys-phone-login) | Auth | FIDO2 protocol, credential management, RP ID config | 64 | $3,200 |
| 18 | **Deployment Infrastructure: nginx, CF Workers, cron** | [LEG-104](https://linear.app/legalorgua/issue/LEG-104/deployment-infrastructure-multi-domain-nginx-cloudflare-maintenance) | DevOps | Multi-domain nginx, CF maintenance page, cache busting | 64 | $3,200 |
| 19 | **OpenReyestr: 14 MCP tools + EDRPOU import pipeline** | [LEG-105](https://linear.app/legalorgua/issue/LEG-105/openreyestr-14-mcp-tools-edrpou-import-pipeline) | Backend | 14 tools, validation, resume, diff-based updates | 64 | $3,200 |
| 20 | **Legislation Library: loaders, aliases, real API** | [LEG-106](https://linear.app/legalorgua/issue/LEG-106/legislation-library-loaders-aliases-real-api-connection) | Legal Data | 12 кодексів, aliases, numerical sort, sectioning | 64 | $3,200 |
| 21 | **Fulltext Backfill System: real-time monitoring** | [LEG-107](https://linear.app/legalorgua/issue/LEG-107/fulltext-backfill-system-gentle-backfill-real-time-monitoring) | Data Ingestion | Gentle backfill, SSE live counters, config panel, 2-year mode | 64 | $3,200 |
| 22 | **Chat UI: structured blocks + resizable right panel** | [LEG-108](https://linear.app/legalorgua/issue/LEG-108/chat-ui-structured-blocks-redesign-copyedit-right-panel) | Frontend/Chat | Structured blocks, copy/edit, resizable panel, norm extraction | 64 | $3,200 |

---

## Складність 5 — Середні фічі

| # | Задача | ID | Область | Чому складна | Час (год) | Вартість ($) |
| -- | -- | -- | -- | -- | -- | -- |
| 23 | **Full-text Search: tsvector FTS + parallelization** | [LEG-109](https://linear.app/legalorgua/issue/LEG-109/full-text-search-performance-tsvector-fts-zo-pagination) | Backend/DB | tsvector indexes, ZO pagination, parallel section extraction | 40 | $2,000 |
| 24 | **Legal Document Template: rendering + PDF/DOCX export** | [LEG-110](https://linear.app/legalorgua/issue/LEG-110/legal-document-template-rendering-pdfdocx-export) | Legal/Frontend | jsPDF, DOCX, marker cleanup, LLM fill instructions | 40 | $2,000 |
| 25 | **Google OAuth + Organization Setup modal** | [LEG-111](https://linear.app/legalorgua/issue/LEG-111/google-oauth-organization-setup-dynamic-callback-org-modal) | Auth | Dynamic callback, org setup flow, seed scripts | 40 | $2,000 |
| 26 | **Public Data Sources Pages: UA, EU, US** | [LEG-112](https://linear.app/legalorgua/issue/LEG-112/public-data-sources-pages-ukraine-eu-us-open-data-catalogs) | Frontend/Public | 3 субдомени, 7 country pages, 1400+ datasets | 40 | $2,000 |
| 27 | **Documents Page: pagination, sort, preview, skeleton** | [LEG-113](https://linear.app/legalorgua/issue/LEG-113/documents-page-pagination-sortable-columns-preview-modal-skeleton) | Frontend | 5 UX покращень в одній сторінці | 40 | $2,000 |
| 28 | **E2E + Unit Tests: admin, chat, tool chain** | [LEG-114](https://linear.app/legalorgua/issue/LEG-114/e2e-unit-tests-admin-pages-chat-tool-chain-data-sources) | Testing | 60+ тестів, Jest ESM fix, E2E Playwright | 40 | $2,000 |
| 29 | **Stage Infrastructure: resource tuning, pgBouncer** | [LEG-115](https://linear.app/legalorgua/issue/LEG-115/stage-infrastructure-resource-tuning-pgbouncer-redis-docker-limits) | DevOps | Resource limits, pgBouncer investigation, Redis tuning | 40 | $2,000 |
| 30 | **Frontend: real APIs + Ukrainian localization** | [LEG-117](https://linear.app/legalorgua/issue/LEG-117/frontend-connect-pages-to-real-apis-ukrainian-localization) | Frontend | Видалення ~2200 lines mock, локалізація, redesign sidebar | 40 | $2,000 |
| 31 | **GDPR: account deletion, holds, retention** | [LEG-120](https://linear.app/legalorgua/issue/LEG-120/gdpr-account-deletion-document-holds-retention-policy) | Compliance | SQL function, повне видалення, upload idempotency | 40 | $2,000 |
| 32 | **LLM Intent Classification: LLM-based + JSON** | [LEG-121](https://linear.app/legalorgua/issue/LEG-121/llm-intent-classification-llm-based-json-response-format) | AI/Chat | LLM classifier, JSON format, loop prevention, 6 domains | 40 | $2,000 |

---

## Складність 3 — Менші але важливі задачі

| # | Задача | ID | Область | Чому важлива | Час (год) | Вартість ($) |
| -- | -- | -- | -- | -- | -- | -- |
| 33 | **Security: CVE patches (minimatch, fast-xml-parser, ajv, qs, hono)** | [LEG-116](https://linear.app/legalorgua/issue/LEG-116/security-cve-patches-minimatch-fast-xml-parser-ajv-qs-hono) | Security | 5 CVE виправлень через npm overrides | 24 | $1,200 |
| 34 | **Docker Build Optimizations: .dockerignore, parallel migrations** | [LEG-118](https://linear.app/legalorgua/issue/LEG-118/docker-build-optimizations-dockerignore-parallel-migrations-cache) | DevOps | Build time -40%, .dockerignore, Qdrant healthcheck | 24 | $1,200 |
| 35 | **Stage-to-local sync utility + incremental mode** | [LEG-119](https://linear.app/legalorgua/issue/LEG-119/stage-to-local-sync-utility-incremental-sync-mode) | DevOps | Схема ownership gotcha, incremental sync | 24 | $1,200 |
| 36 | **Data Population: seed scripts, legislation, dictionaries** | [LEG-122](https://linear.app/legalorgua/issue/LEG-122/data-population-seed-scripts-legislation-load-dictionaries-sync) | Data/DevOps | 5191 статей, 8 словників, seed pipeline | 24 | $1,200 |

---

## Загальна статистика

| Метрика | Значення |
| -- | -- |
| **Всього задач** | 36 груп (з ~1000 коммітів) |
| **Загальний story points** | **309 pts** |
| **Задач складності 13** | 11 (30%) |
| **Задач складності 8** | 11 (30%) |
| **Задач складності 5** | 10 (28%) |
| **Задач складності 3** | 4 (11%) |
| **Середня складність** | **8.6 pts** |
| **Загальний час** | **2,288 год** |
| **Тарифна ставка** | **$50/год** |
| **Загальна вартість** | **$114,400** |
| **Найскладніша область** | AI/Chat (LEG-87, 96, 97, 108) |
| **Найбільше коммітів** | Data Ingestion (court scraping, NAIS, RADA, backfill) |

---

## Топ-10 за архітектурним впливом на систему

1. [LEG-87](https://linear.app/legalorgua/issue/LEG-87/llm-agentic-chat-pipeline-with-sse-streaming) — Chat Pipeline: торкається всього стеку (backend + frontend + billing + SSE)
2. [LEG-88](https://linear.app/legalorgua/issue/LEG-88/chunked-upload-system-multer-minio-bullmq-scaling) — Upload System: 5 фаз, cross-cutting через nginx + redis + DB + frontend
3. [LEG-89](https://linear.app/legalorgua/issue/LEG-89/client-matter-segregation-migrations-services-middleware) — Client-Matter: змінює data model, 5 існуючих сервісів + 4 нових
4. [LEG-91](https://linear.app/legalorgua/issue/LEG-91/court-decision-scraping-playwright-scraper-document-service-offload) — Court Scraping: новий document-service контейнер + Playwright
5. [LEG-92](https://linear.app/legalorgua/issue/LEG-92/openreyestr-nais-generic-xmlcsv-importers-sax-streaming) — NAIS Importers: 8 реєстрів, SAX streaming, ZIP handling, OOM
6. [LEG-90](https://linear.app/legalorgua/issue/LEG-90/grafana-prometheus-monitoring-stack-across-all-services) — Grafana/Prometheus: observability для всіх 3 сервісів + 5 dashboards
7. [LEG-93](https://linear.app/legalorgua/issue/LEG-93/billing-system-tiers-subscriptions-crypto-payments-fondy) — Billing: крипто + webhook + DB tiers — критичний бізнес-шлях
8. [LEG-94](https://linear.app/legalorgua/issue/LEG-94/admin-panel-overview-users-costs-monitoring-pricing-8-pages) — Admin Panel: найбільший frontend блок (8+ pages, 60 tests)
9. [LEG-96](https://linear.app/legalorgua/issue/LEG-96/chat-pipeline-parallel-tool-execution-multi-step-plan-budget-routing) — Chat Optimization: GPT-5, parallel tools, RAG — AI core performance
10. [LEG-98](https://linear.app/legalorgua/issue/LEG-98/mcp-tools-refactor-basetoolhandler-toolregistry-domain-extraction) — MCP Refactor: архітектурна основа для 45 tools
