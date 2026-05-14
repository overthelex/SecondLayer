# Овчаров Володимир Валентинович

**AI/ML & Full-Stack Engineer | CTO & Co-Founder, SecondLayer**

volodymyr@legal.org.ua | linkedin.com/in/volodymir-ovcharov | Київ, Україна

---

## Мотивація

Маю 15+ років досвіду побудови масштабних data-платформ, AI/ML-систем та OSINT-інфраструктури. Як CTO SecondLayer створив з нуля платформу, що обробляє 120M+ записів судових рішень через 118 AI-інструментів з використанням LLM-оркестрації, векторного пошуку та автономних агентів. Мій досвід у побудові систем аналізу даних, прогнозування та автономних рішень напряму відповідає завданням Defense AI Center «A1» — від аналізу бойових даних до розвитку автономних систем та інструментів управління.

---

## Ключові компетенції

**AI/ML & Data Science:**
- Проектування та продакшн RAG-пайплайнів (retrieval-augmented generation) з векторним пошуком (Qdrant, VoyageAI, OpenAI embeddings)
- LLM-оркестрація з multi-provider fallback (OpenAI GPT-4o, Anthropic Claude Opus/Sonnet, AWS Bedrock)
- Автономні агентні системи: intent classification, query planning, multi-step workflow execution
- Побудова OSINT-платформи з паралельним аналізом 20+ реєстрів та баз даних
- NLP для українськомовних текстів: семантична секціонізація, citation extraction, транслітерація
- OCR (Google Cloud Vision), STT (Deepgram nova-2, українська)
- Класифікація документів, risk scoring, pattern detection
- Hallucination guard — верифікація AI-відповідей проти першоджерел

**Full-Stack Engineering:**
- TypeScript/Node.js (15+ років), React 19, Express.js 5, Vite
- PostgreSQL (82M+ записів, FTS, партиціювання), Redis, Qdrant
- Docker, blue-green CI/CD, Nginx, Prometheus, MinIO (S3)
- MCP (Model Context Protocol) — native MCP-сервери для інтеграції з Claude, ChatGPT
- WebSocket real-time streaming, SSE, BullMQ job queues
- AWS SDK (S3, SQS, Bedrock)

**Security & Cryptography:**
- E2EE (X25519 + AES-256-GCM) для захисту документів та комунікацій
- WebAuthn/FIDO2, multi-factor authentication, OIDC, OAuth 2.0
- Інтеграція Дія.Підпис (державна цифрова ідентифікація)
- GDPR compliance pipeline (export, deletion, legal hold)

**Infrastructure & DevOps:**
- Blue-green deployment на production (GitHub Actions, self-hosted runner)
- Containerized architecture (Docker Compose, multi-service orchestration)
- CPU-adaptive worker concurrency (auto-scaling від 5 до 100 workers)
- Моніторинг та observability (Prometheus, Winston structured logging)

---

## Професійний досвід

### CTO & Co-Founder — SecondLayer (2023 – теперішній час)

Архітектура та розробка комплексу AI-платформ:

**LEX (legal.org.ua) — AI Legal Analytics Platform**
- Побудував платформу з **118 MCP AI-інструментами** для аналізу правових даних
- Semantic search та RAG-пайплайн по **120M+ судових рішень** (з 2006 року)
- Автономний агент з **QueryPlanner** — класифікація інтентів, вибір стратегії пошуку, мультикрокове виконання
- **WorkflowGenerator/Executor** — LLM генерує 3-7 паралельних аналітичних workflows з одного запиту, виконує та синтезує результати
- Аналітика суддів: відсоток скасувань, обсяги рішень, рейтинг серед колег
- Citation graph та Shepardization (відстеження прецедентного статусу)
- Моніторинг законодавства з word-level diff tracking та нотифікаціями

**Panoptic (panoptic.com.ua) — Due Diligence & Threat Intelligence**
- **4M+ санкційних записів** (OFAC, EU, UN, UK, РНБО — 346 datasets)
- **15B+ записів витоків даних** з Dark Web (6 джерел, 100+ Tor-інстансів)
- **810K+ offshore entities** (ICIJ/Panama/Paradise Papers)
- Intelligence pipeline: FastAPI async з паралельними запитами до 12+ джерел за <200ms
- Beneficial ownership chain analysis, media sentiment, cyber vulnerability scanning

**Інтегровані бази відкритих даних (OSINT):**
- 19.5M реєстрацій транспортних засобів
- 12.6M+ записів публічних витрат (spending.gov.ua)
- 3.1M записів недійсних паспортів
- 1.08M громадських організацій
- 504K фінансових звітів, 417K записів суддів, 264K платників ПДВ
- Реєстри корупції, санкцій, розшуку, люстрації, терористичних списків

**selected.highfunk.uk — Curated Content Platform**
- AI-driven content curation та рекомендаційна система

**aishield.highfunk.uk — AI Security Platform**
- Платформа захисту AI-систем від adversarial attacks

---

## Освіта

**Бакалавр прикладної математики**
Національний технічний університет України «Київський політехнічний інститут» (КПІ)

**Дослідник**
Інститут кібернетики ім. В.М. Глушкова, Національна академія наук України

---

## Релевантність для Defense AI Center «A1»

| Завдання центру | Мій досвід |
|---|---|
| **Аналіз бойових даних** | Побудова систем аналізу 120M+ записів з semantic search, pattern detection та автоматичною класифікацією. OSINT-пайплайни з 20+ джерел даних |
| **Прогнозування дій ворога** | LLM-orchestrated query planning, intent classification, multi-step analytical workflows з синтезом результатів |
| **Розвиток автономних систем** | Автономні AI-агенти з tool-calling, workflow generation/execution, hallucination guard, budget-aware model selection |
| **Інструменти управління** | Real-time dashboards, SSE streaming, WebSocket communication, session management, role-based access control |
| **Швидкий цикл інновацій** | Blue-green CI/CD, automated deployment, self-healing pipelines, comprehensive testing (unit/integration/E2E) |
| **Обробка великих масивів даних** | CPU-adaptive concurrency, batch processing, background workers з circuit breakers, PostgreSQL partitioning на 82M+ записах |
| **Безпека та шифрування** | E2EE (X25519 + AES-256-GCM), FIDO2/WebAuthn, інтеграція з державними системами (Дія) |

---

## Технічний стек

**AI/ML:** OpenAI GPT-4o, Anthropic Claude, AWS Bedrock, VoyageAI embeddings, Qdrant vector DB, RAG, LLM orchestration, autonomous agents, NLP, OCR, STT

**Backend:** TypeScript, Node.js, Express.js, Python (FastAPI), MCP Protocol, BullMQ, WebSocket, SSE

**Frontend:** React 19, Vite, TailwindCSS, Zustand, TanStack Query

**Data:** PostgreSQL (82M+ rows), Redis, Qdrant, MinIO (S3), Full-Text Search

**Infrastructure:** Docker, Nginx, GitHub Actions CI/CD, blue-green deployment, Prometheus, AWS (S3, SQS, Bedrock)

**Security:** E2EE, WebAuthn/FIDO2, OAuth 2.0, OIDC, JWT, Дія.Підпис

---

*Готовий долучитися до команди Defense AI Center «A1» та застосувати досвід побудови масштабних AI-систем для зміцнення обороноздатності України.*
