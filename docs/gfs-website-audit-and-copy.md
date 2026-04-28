# GFS Website Audit + Ready-to-Ship Copy

**Date:** 2026-04-28
**Audience:** GFS qualification reviewers
**Site:** https://legal.org.ua

---

## 1. Audit — what's already on the site

### 1.1 Login / landing page (`/`)

The login page is currently the de-facto landing. It serves marketing copy in 4 languages (uk / en / de / es) — sourced from `lexwebapp/src/i18n/locales.ts` (`loginTranslations`).

What's there:

- **Tagline:** *For Law Firms* / *Для юридичних фірм*
- **Headline:** *Legal Analysis. Partner Level.* / *Правовий аналіз. На рівні партнера.*
- **Description (1 sentence):** *AI platform for law firms and corporate counsel: case analysis, court decision search, legislation monitoring across 12 jurisdictions.*
- **4-bullet feature list:** semantic search across millions of court decisions, case law and legal-position analysis, legislative change monitoring, legal positions with cited sources.
- **Trust signal:** "Backed by AWS Activate" badge linking to AWS Startup Showcase.
- **Footer links:** Blog, News, Investors (general), UK Investors, Pitch Deck.

### 1.2 Blog (`/blog`)

49 articles total (`lexwebapp/src/pages/BlogPage/articles.ts`), filterable by `tech` / `legal`, in 3 languages. Recent highlights (2026 Q1–Q2):

- *RAG підсвічує, тренінг орієнтує* (RAG vs domain-model fine-tuning on Ukrainian case-law)
- *2 ТБ українського права + DeepSeek V3 860B на GCP*
- *Як ми векторизуємо 33.7M судових рішень ЄДРСР через Voyage AI*
- *SneakyPiper: 16.7M entities, 31K dark-web subjects, 30+ OSINT джерел*
- *340 мільйонів записів і 64 інструменти: повна карта даних LEX AI*
- *Безпека LEX AI: GDPR-аудит, 10 виправлень і 7 рівнів захисту*
- *Distributed Monolith: коли мікросервіси — це моноліт із мережевими затримками*
- *CI/CD з blue-green preview та самозцілюваними тестами*
- *Маркетплейс юридичних консультацій*
- *MCP-токени та інтеграція з Claude Desktop*
- *Авторизація через Дію (національна цифрова ідентифікація)*

The blog is engineering-heavy. It demonstrates technical depth and a real production system, but it does not function as marketing/qualification material for an investor or compliance reviewer who only has 30 seconds.

### 1.3 Other public surfaces

- `/career` — careers page exists (good for showing "real company")
- `/investor`, `/uk_investor`, `/pitch-deck.html` — investor decks (gated, dense)
- `/lex-news` — operational news
- `/{country}/data-sources` — per-jurisdiction data-source pages (UA, UK, US, DE, ES, NL, FR, EE)
- `/team` — **internal team-management dashboard**, not a public "about us" page (this is a frequent point of confusion)
- Legal docs: `/ua/terms`, `/ua/privacy`, `/ua/dpa`, `/ua/offer`, AI Transparency, AI Usage Policy

### 1.4 What's missing for GFS

GFS asks for three things. Here is the gap analysis:

| GFS requirement | Current status | Gap |
|---|---|---|
| **1. Clear Business Description** — concise summary, problems solved, target audience, industry context | Partial: 1-sentence description on login, blog articles, scattered across pitch decks | No dedicated public "About / Company" page that bundles all three. |
| **2. Team Information** — names, roles, experience, LinkedIn | **Missing on public site.** `/team` is internal UI. Founder bios exist only in resume/pitch-deck PDFs. | Need a public `/about/team` (or `/founders`) page with co-founder bios + LinkedIn. |
| **3. Product Details** — products/services, screenshots/demos, current stage | Partial: feature bullets on login, blog articles, pitch deck PDF | No public "Product" page with feature breakdown, screenshots, and stated dev stage (live, paying users, mobile app in beta, etc.). |

**Verdict:** The technical proof exists in abundance — blog, pitch decks, AWS application, deep engineering content. The gap is that **none of it is packaged into three public marketing pages a GFS reviewer can land on in 30 seconds.**

---

## 2. Recommended additions

Three public pages, linked from the login footer (under "About" or as direct links):

1. `/about` (or `/company`) — **Business description**
2. `/about/team` — **Founders & team**
3. `/product` — **Product / service details**

All three should be available in **Ukrainian and English** to match the rest of the site (de/es can be added later — GFS likely reviews in EN).

The login page should also gain a small **"About"** link in its footer navigation alongside Blog / News / Investors.

---

## 3. Ready-to-ship copy

### 3.1 `/about` — Business Description

#### English

**LEX — AI-powered legal intelligence for Ukraine and beyond.**

LEX is the AI platform built and operated by **SecondLayer**, a Ukrainian legal-tech company. We turn the entire Ukrainian legal corpus — 120 million court decisions, the full legislative code with amendment history, parliament voting records, and 41 million open-data registry records — into structured, citation-backed answers that arrive in seconds instead of days.

**The problem we solve.** Ukrainian legal practice runs on tools designed in the 2000s. The two largest incumbents (LIGA:ZAKON and ZakonOnline) are keyword databases with no semantic search, no AI, no analytics, no API. A practising lawyer who needs to research case law for a single matter spends 2–3 full business days digging through court records by hand. Generic LLM chatbots fill some of that gap but hallucinate, do not understand Ukrainian legal specifics, and cannot cite sources reliably.

**Who we serve.**
- **Law firms and solo practitioners** — semantic search, judge analytics, case-strategy generation, document drafting.
- **In-house and corporate counsel** — compliance research, contract analysis, regulatory monitoring.
- **Compliance and legal-ops teams** — reproducible, auditable AI-assisted analysis with source citations.
- **Legal-tech and fintech platforms** — embedded AI legal layer via API and MCP (Model Context Protocol).
- **Government and public-sector** — court analytics, beneficial-ownership investigation, sanctions screening.
- **Academic and research institutions** — bulk access to Ukrainian case law and legislation for empirical legal research.

**Market context.** Ukraine has 60,000+ practising lawyers, ~6,000 licensed attorneys, ~5,000 law firms, and 10,000+ corporate legal departments. The global legal-AI market is $500M+ and growing 28% YoY (CAGR). Our serviceable market in Ukraine and CEE is conservatively $50M. We are the first and only platform in Ukraine to combine AI-native semantic search with the full national legal corpus and live state-registry integration.

**How we are different.** We are not a generic chatbot wrapper. Every recommendation drills down to the underlying court decision or legislative article. A built-in *HallucinationGuard* validates every citation against the source before it reaches the user. Authority weighting (instance, citation graph, motivation density, overrule status) ranks results so the lawyer immediately sees which positions are load-bearing and which are noise.

**Where we operate.** Headquartered in Kyiv, Ukraine. Live production deployment on AWS (eu-central-1), with active expansion into European jurisdictions (UK, Spain, Germany, Netherlands, France, Estonia — country-specific data-source pages already shipped).

#### Ukrainian

**LEX — AI-платформа для юридичної аналітики України та інших юрисдикцій.**

LEX — це AI-платформа, яку розробляє і підтримує **SecondLayer**, українська legal-tech компанія. Ми перетворюємо весь український правовий корпус — 120 мільйонів судових рішень, повне законодавство з історією змін, голосування парламенту та 41 мільйон записів відкритих реєстрів — на структуровані, підкріплені цитатами відповіді, які приходять за секунди замість днів.

**Яку проблему ми вирішуємо.** Українська юридична практика працює на інструментах із 2000-х. Два найбільших гравці (LIGA:ZAKON та ZakonOnline) — це keyword-бази без семантичного пошуку, без AI, без аналітики, без API. Юрист, який досліджує судову практику для однієї справи, витрачає 2–3 повних робочих дні на ручний пошук. Універсальні LLM-чатботи частково закривають цей gap, але галюцинують, не розуміють української специфіки та не дають надійних посилань на джерела.

**Кого ми обслуговуємо.**
- **Юридичні фірми та адвокати** — семантичний пошук, аналітика суддів, генерація стратегій захисту, підготовка документів.
- **In-house юристи та корпоративні департаменти** — комплаєнс-дослідження, аналіз контрактів, моніторинг регулювання.
- **Compliance та legal-ops команди** — відтворювана, перевірювана AI-аналітика з посиланнями на першоджерела.
- **Legal-tech та fintech платформи** — вбудований AI-шар через API та MCP (Model Context Protocol).
- **Державний сектор** — судова аналітика, перевірка кінцевих бенефіціарів, скринінг санкцій.
- **Освіта та дослідження** — bulk-доступ до української практики й законодавства для емпіричних правових досліджень.

**Контекст ринку.** В Україні 60 000+ практикуючих юристів, ~6 000 ліцензованих адвокатів, ~5 000 юридичних фірм та 10 000+ корпоративних юридичних департаментів. Світовий ринок legal-AI — $500М+ і росте 28% на рік. Наш доступний ринок (Україна + Центральна та Східна Європа) консервативно оцінюється в $50М. Ми — перша і єдина платформа в Україні, яка поєднує AI-нативний семантичний пошук з повним національним правовим корпусом і живою інтеграцією державних реєстрів.

**Чим ми відрізняємось.** Ми не обгортка над чатботом. Кожна рекомендація прив'язана до конкретного судового рішення або статті закону. Вбудований *HallucinationGuard* валідує кожну цитату проти першоджерела до того, як вона потрапить до користувача. Зважування за авторитетністю (інстанція, citation graph, щільність мотивації, статус скасування) ранжує результати так, щоб юрист одразу бачив, які позиції — несучі, а які — шум.

**Де ми працюємо.** Штаб-квартира — Київ. Продакшн — на AWS (eu-central-1). Активне розширення в європейські юрисдикції (Велика Британія, Іспанія, Німеччина, Нідерланди, Франція, Естонія — country-specific сторінки джерел даних уже опубліковано).

---

### 3.2 `/about/team` — Founders & Key Team

> **Note for site implementation:** add headshots in `lexwebapp/public/team/`. LinkedIn URLs marked **[TBD]** below need to be confirmed before publishing. Igor Kyrychenko's LinkedIn is not in the source repo — please provide.

#### English

**The team behind LEX**

We are a Ukrainian-founded company combining 15+ years of large-scale data-platform engineering with deep Ukrainian legal-domain expertise. The platform was built end-to-end in-house: data-ingestion pipelines, AI orchestration layer, frontend, mobile, and infrastructure.

---

**Volodymyr Ovcharov — Co-founder & CTO**

15+ years building scalable data platforms, AI/ML systems, and OSINT infrastructure. As CTO of SecondLayer, designed and shipped the platform that processes 120M+ court records via 118 AI tools using LLM orchestration, vector search, and autonomous agents.

Selected expertise: production RAG pipelines (Qdrant, Voyage AI, OpenAI embeddings); multi-provider LLM orchestration (OpenAI GPT-4o, Anthropic Claude Opus/Sonnet, AWS Bedrock); autonomous agentic systems with intent classification and query planning; OSINT platform engineering across 20+ registries; Ukrainian-language NLP (semantic sectionizing, citation extraction); E2EE (X25519 + AES-256-GCM); WebAuthn / FIDO2; Diia digital-identity integration; blue-green CI/CD on self-hosted runners.

Education: BSc Applied Mathematics, **Igor Sikorsky Kyiv Polytechnic Institute (KPI)**. Researcher, **V.M. Glushkov Institute of Cybernetics**, National Academy of Sciences of Ukraine.

LinkedIn: [linkedin.com/in/volodymir-ovcharov](https://linkedin.com/in/volodymir-ovcharov)
Email: volodymyr@legal.org.ua

---

**Igor Kyrychenko — Co-founder & CEO**

PhD in Law, with deep expertise in Ukrainian and international legal practice. Director of the operating Ukrainian entity (ТОВ) and COO of SecondLayer. Responsible for product direction, legal-domain modelling (the taxonomy of 118 MCP tools, the workflow templates for litigation, and the doctrinal weighting used in retrieval), business development, and partnerships with law firms, bar associations, and the government sector.

Selected expertise: Ukrainian civil, commercial, and criminal procedure; Supreme Court doctrinal analysis; legal-domain ontology design; legal-tech go-to-market in Ukraine; partnerships with the Ukrainian Bar Association and Diia (Ministry of Digital Transformation).

LinkedIn: [linkedin.com/in/ihor-kyrychenko-90503890](https://www.linkedin.com/in/ihor-kyrychenko-90503890/)
Email: igor@legal.org.ua
Phone: +380 67 720 63 53

---

**The wider team**

In-house engineers and contributors across backend (TypeScript / Node.js), frontend (React 19), mobile (Flutter), data engineering (PostgreSQL, Qdrant, Redis), DevOps (AWS, Docker, blue-green CI/CD), and content/legal review (practising Ukrainian lawyers reviewing edge-case outputs).

We actively work with independent open-source contributors. Our public engineering call-for-contributors and ML-engineer competency framework are published on the blog: [Open-source welcome](/blog/open-source-welcome-engineers), [ML engineer competencies](/blog/ml-engineer-competencies).

#### Ukrainian

**Команда LEX**

Ми — компанія з українським корінням, що поєднує 15+ років інженерного досвіду з масштабованими data-платформами та глибоку експертизу в українському праві. Платформу побудовано end-to-end власною командою: пайплайни обробки даних, AI-оркестраційний шар, фронтенд, мобільний застосунок та інфраструктура.

---

**Володимир Овчаров — кофаундер та CTO**

15+ років побудови масштабних data-платформ, AI/ML-систем та OSINT-інфраструктури. Як CTO SecondLayer спроектував і запустив платформу, що обробляє 120M+ судових записів через 118 AI-інструментів з використанням LLM-оркестрації, векторного пошуку та автономних агентів.

Ключові компетенції: продакшн RAG-пайплайни (Qdrant, Voyage AI, OpenAI embeddings); multi-provider LLM-оркестрація (OpenAI GPT-4o, Anthropic Claude Opus/Sonnet, AWS Bedrock); автономні агентні системи з intent classification та query planning; OSINT-платформи з 20+ реєстрами; NLP для українських текстів (семантична секціонізація, citation extraction); E2EE (X25519 + AES-256-GCM); WebAuthn/FIDO2; інтеграція Дія.Підпис; blue-green CI/CD.

Освіта: бакалавр прикладної математики, **КПІ ім. Ігоря Сікорського**. Дослідник, **Інститут кібернетики ім. В.М. Глушкова НАН України**.

LinkedIn: [linkedin.com/in/volodymir-ovcharov](https://linkedin.com/in/volodymir-ovcharov)
Email: volodymyr@legal.org.ua

---

**Ігор Кириченко — кофаундер та CEO**

PhD в праві, з глибокою експертизою в українській та міжнародній юридичній практиці. Директор операційного ТОВ та COO SecondLayer. Відповідає за продуктовий напрямок, моделювання предметної області (таксономія 118 MCP-інструментів, шаблони workflow для litigation, доктринальне зважування в retrieval), бізнес-розвиток та партнерства з юридичними фірмами, асоціаціями адвокатів та державним сектором.

Ключові компетенції: цивільне, господарське та кримінальне процесуальне право України; доктринальний аналіз позицій Верховного Суду; проектування правових онтологій; legal-tech go-to-market в Україні; партнерства з НААУ та Мінцифри (Дія).

LinkedIn: [linkedin.com/in/ihor-kyrychenko-90503890](https://www.linkedin.com/in/ihor-kyrychenko-90503890/)
Email: igor@legal.org.ua
Телефон: +380 67 720 63 53

---

**Розширена команда**

In-house інженери та контриб'ютори: бекенд (TypeScript/Node.js), фронтенд (React 19), мобільний застосунок (Flutter), data engineering (PostgreSQL, Qdrant, Redis), DevOps (AWS, Docker, blue-green CI/CD) та контент/юридичне ревʼю (практикуючі юристи, що перевіряють edge-case вихідні дані).

Активно співпрацюємо з незалежними open-source контриб'юторами: [Open-source welcome](/blog/open-source-welcome-engineers), [ML engineer competencies](/blog/ml-engineer-competencies).

---

### 3.3 `/product` — Product / Service Details

> **Screenshots:** 24 candidate shots reviewed in `/home/vovkes/Pictures/Screenshots/` (2026-04-28 12:48–12:55). Final mapping is in §6 below — 12 shots selected, 12 alternates/skipped. Headshots for the team page need saving separately from the chat (Image #2 = Volodymyr, Image #3 = Igor).

#### English

**LEX is a single AI-powered platform that bundles five products around the Ukrainian legal corpus.**

#### 1. AI Legal Research & Drafting (`legal.org.ua`)

The flagship product. A web app where the lawyer asks a natural-language question and receives a structured, citation-backed answer in seconds.

- **Semantic search** across 120M+ court decisions (entire ЄДРСР, the State Register of Court Decisions, since 2006).
- **Article-level legislation retrieval.** Ask for "Constitution Article 124" — get just that article, not the whole document. Full amendment history with word-level diff.
- **AI-generated litigation strategies.** A real client case: an 11-year-old debt-enforcement matter (UAH 11.9M). Our system analysed 473 documents across multiple registries and produced 9 defence strategies in 15 minutes. A human lawyer would have needed a week.
- **Judge analytics.** 12 000+ judge profiles with overturn rate, decision volume, peer ranking. **No other Ukrainian platform offers this.**
- **Citation graph & Shepardization.** Track whether a precedent is still good law.
- **Legislative monitoring** with word-level diff tracking and customer notifications.

Stage: **Live in production.** Paying customers (law firms and solo practitioners). Free tier with 50 credits on signup.

#### 2. State Registry & OSINT (built in to LEX, also exposed via API)

- **Business entities** — full ЄДРПОУ corporate registry with beneficial-ownership chains.
- **Debtors and enforcement proceedings** — official Ministry-of-Justice data.
- **Notaries, judges, attorneys** — official registries indexed and searchable.
- **Open-data lookups** — invalidated passports (3.1M), public-procurement spending (12.6M+), vehicle registrations (19.5M), NGOs (1.08M), financial reports (504K), VAT payers (264K), corruption / sanctions / wanted-persons / lustration / terrorist-list registries.

Stage: **Live in production.** 41M+ open-data records indexed and searchable.

#### 3. Parliament & Voting Analytics (RADA server)

- **Bills, deputies, voting records** of the Verkhovna Rada (Ukrainian parliament).
- **Deputy profiles** with voting history and party loyalty metrics.
- **Bill tracking** with notification when a watched bill changes status.

Stage: **Live in production.**

#### 4. Marketplace for Legal Consultations (`/attorneys`)

A two-sided marketplace connecting clients with verified Ukrainian attorneys, with E2EE messaging (X25519 + AES-256-GCM), Monobank payment integration (UAH and USD), escrow, and audit trails.

Stage: **Beta.** Pre-launch with selected attorneys onboarded.

#### 5. MCP Connect — AI tools for any LLM client (`/mcp-connect`)

LEX is the **first and only Ukrainian legal platform with native MCP (Model Context Protocol) support.** All 118 of our legal tools plug directly into Claude Desktop, ChatGPT, Cursor, and any MCP-compatible client.

Stage: **Live in production.** Free for individual developers; metered for enterprise.

---

#### Mobile

Native mobile app (Flutter for iOS and Android) currently in **beta**. Public TestFlight / Play Console rollout planned Q3 2026.

#### Compliance and security

- **GDPR-compliant.** Full export, deletion, and legal-hold pipelines.
- **DPA available** for enterprise customers.
- **E2EE** for documents and consultations (X25519 + AES-256-GCM).
- **WebAuthn / FIDO2 / multi-factor.**
- **Diia digital-ID auth** — first legal-tech platform in Ukraine to support the national digital identity.
- **Independent security audit completed** in March 2026 (10 OWASP findings remediated, 7-layer defence-in-depth architecture).

#### Infrastructure (transparency)

- **Cloud:** AWS (eu-central-1, Frankfurt) — backed by AWS Activate.
- **Stack:** TypeScript / Node.js 20, React 19, PostgreSQL 15 (with PgBouncer), Redis 7, Qdrant vector DB, Docker, Nginx.
- **AI providers:** OpenAI GPT-4o, Anthropic Claude (via Amazon Bedrock), Voyage AI embeddings.
- **CI/CD:** Blue-green deployment with self-healing test agents on a self-hosted GitHub Actions runner.

#### Pricing

- **Individual lawyer** — $29/month
- **Law firm** — from $99/month
- **Pay-per-query API** — $0.05 / query (typical)
- **Enterprise / on-prem / VPC** — custom

#### Try it

- **Live product:** [legal.org.ua](https://legal.org.ua)
- **Free tier:** 50 credits on signup, no credit card required
- **Demo:** book at info@legal.org.ua

#### Ukrainian

**LEX — єдина AI-платформа, що об'єднує пʼять продуктів навколо українського правового корпусу.**

#### 1. AI-дослідження та підготовка документів (`legal.org.ua`)

Флагманський продукт. Юрист задає питання природною мовою — отримує структуровану відповідь з посиланнями на джерела за секунди.

- **Семантичний пошук** по 120M+ судових рішень (весь ЄДРСР з 2006 року).
- **Ретрів законодавства на рівні статті.** Запит "Стаття 124 Конституції" — повертає саме цю статтю, не весь документ. Повна історія змін з word-level diff.
- **AI-генерація стратегій захисту.** Реальний кейс: справа про стягнення боргу 11-річної давнини (11.9 млн грн). Система проаналізувала 473 документи з кількох реєстрів і згенерувала 9 стратегій захисту за 15 хвилин. Юрист-людина потребував би тижня.
- **Аналітика суддів.** 12 000+ профілів суддів з відсотком скасувань, обсягом рішень, рейтингом. **Жодна інша українська платформа цього не має.**
- **Citation graph та Shepardization.** Відстеження, чи прецедент усе ще "good law".
- **Моніторинг законодавства** з word-level diff та нотифікаціями.

Стадія: **продакшн.** Платні клієнти (юридичні фірми, адвокати). Free tier — 50 кредитів при реєстрації.

#### 2. Державні реєстри та OSINT (вбудовано в LEX, доступно через API)

- **Юридичні особи** — повний ЄДРПОУ з ланцюгами кінцевих бенефіціарів.
- **Боржники та виконавчі провадження** — офіційні дані Мінʼюсту.
- **Нотаріуси, судді, адвокати** — офіційні реєстри.
- **Відкриті дані** — недійсні паспорти (3.1M), публічні витрати (12.6M+), транспортні засоби (19.5M), громадські організації (1.08M), фінансові звіти (504K), платники ПДВ (264K), реєстри корупції / санкцій / розшуку / люстрації / терористичних списків.

Стадія: **продакшн.** 41M+ записів відкритих даних проіндексовано.

#### 3. Парламент та аналітика голосувань (сервер RADA)

- **Законопроєкти, депутати, голосування** Верховної Ради.
- **Профілі депутатів** з історією голосувань та партійною лояльністю.
- **Трекінг законопроєктів** з нотифікаціями про зміну статусу.

Стадія: **продакшн.**

#### 4. Маркетплейс юридичних консультацій (`/attorneys`)

Двосторонній маркетплейс, що звʼязує клієнтів з верифікованими українськими адвокатами. E2EE-повідомлення (X25519 + AES-256-GCM), оплата через Monobank (UAH та USD), escrow, audit trail.

Стадія: **бета.** Pre-launch з відібраними адвокатами.

#### 5. MCP Connect — AI-інструменти для будь-якого LLM-клієнта (`/mcp-connect`)

LEX — **перша і єдина українська юридична платформа з нативною підтримкою MCP (Model Context Protocol).** Усі 118 наших інструментів підключаються напряму до Claude Desktop, ChatGPT, Cursor та будь-якого MCP-клієнта.

Стадія: **продакшн.** Безкоштовно для індивідуальних розробників, metered для enterprise.

---

#### Мобільний застосунок

Нативний мобільний застосунок (Flutter для iOS та Android) — наразі **в беті**. Публічний TestFlight / Play Console — Q3 2026.

#### Безпека та комплаєнс

- **GDPR.** Повні пайплайни експорту, видалення та legal hold.
- **DPA** для enterprise-клієнтів.
- **E2EE** для документів та консультацій.
- **WebAuthn/FIDO2/MFA.**
- **Авторизація через Дію** — перша legal-tech платформа в Україні з нативною підтримкою.
- **Зовнішній security-аудит** завершено в березні 2026 (10 OWASP-знахідок виправлено, 7-рівнева defence-in-depth архітектура).

#### Інфраструктура (для прозорості)

- **Хмара:** AWS (eu-central-1, Франкфурт) — підтримка AWS Activate.
- **Стек:** TypeScript/Node.js 20, React 19, PostgreSQL 15 (PgBouncer), Redis 7, Qdrant, Docker, Nginx.
- **AI-провайдери:** OpenAI GPT-4o, Anthropic Claude (через Amazon Bedrock), Voyage AI embeddings.
- **CI/CD:** Blue-green deployment з self-healing test-агентами на self-hosted GitHub Actions runner.

#### Тарифи

- **Окремий юрист** — $29/міс
- **Юридична фірма** — від $99/міс
- **Pay-per-query API** — $0.05/запит
- **Enterprise / on-prem / VPC** — за домовленістю

#### Спробувати

- **Продукт:** [legal.org.ua](https://legal.org.ua)
- **Безкоштовно:** 50 кредитів при реєстрації, без картки
- **Demo:** info@legal.org.ua

---

## 4. USF authorisation note (per GFS feedback)

Per the GFS reply, USF participation is "definitely a big plus" and a **formal letter of authorisation** is sufficient confirmation. Once the three pages above are live, I'll request the formal USF letter on company letterhead and forward it to GFS together with the qualification re-review request.

---

## 5. Implementation checklist

To go from this doc to a GFS-qualifiable site:

- [ ] Add `/about` route + page using copy from §3.1
- [ ] Add `/about/team` route + page using copy from §3.2 (LinkedIn URLs ✓ — need 2 headshots saved as files; Image #2 / Image #3 from chat)
- [ ] Add `/product` route + page using copy from §3.3 — final screenshot selection in §6 below
- [ ] Add "About" link to login footer (`LoginPage/index.tsx` ~line 796)
- [ ] Verify `useDocumentMeta` titles + OG tags on all three new pages (matches existing pattern in `BlogPage/index.tsx`)
- [ ] Wire i18n keys in `lexwebapp/src/i18n/locales.ts` for at least UA + EN
- [ ] Run `npm run build` in `lexwebapp` to confirm no type errors
- [ ] Deploy via CI/CD (merge PR → main)
- [ ] Re-submit qualification to GFS with USF authorisation letter attached

---

*Audit and copy prepared 2026-04-28. Sources: `lexwebapp/src/pages/LoginPage/`, `lexwebapp/src/pages/BlogPage/`, `lexwebapp/src/i18n/locales.ts`, `docs/aws-startup-application.md`, `docs/investor-pitch-en.md`, `docs/pitch_deck_secondlayer.md`, `docs/resume-ovcharov-defense-ai-a1.md`.*

---

## 6. Product screenshot mapping (final)

31 candidate shots were captured from the live product on 2026-04-28 between 12:48 and 13:02. Below is the final selection.

**Source folder:** `/home/vovkes/Pictures/Screenshots/`
**Target folder (recommended):** `lexwebapp/public/product-screenshots/` — copy each selected file under the proposed slug-name so it can be referenced as `/product-screenshots/<slug>.png` from React.

### 6.1 Selected — 15 shots to ship

Ordered top-to-bottom on the `/product` page.

| # | Slug (target filename) | Source file | Section on `/product` | What it shows | Why it's strong |
|---|---|---|---|---|---|
| 1 | `01-hero-workflow-plan.png` | `Screenshot from 2026-04-28 12-49-28.png` | **Hero** | Full 7-step workflow plan auto-generated for "Comprehensive analysis of Judge Tanasevich O.V." (disciplinary practice, ВККС data, civil-case stats, criminal/admin stats, appeals, case-distribution analysis, etc.) | One image conveys the entire LLM-orchestration thesis: the user typed one sentence, the system planned 7 parallel sub-investigations with cost estimates. Strongest top-of-page shot. |
| 2 | `02-workflow-execution.png` | `Screenshot from 2026-04-28 12-48-52.png` | Product 1 — AI Research | Step #1 (Нормативна база) executing in real time with progress bar; queued steps below | Proves it's a working system, not a static demo. |
| 3 | `03-structured-legal-analysis.png` | `Screenshot from 2026-04-28 12-49-16.png` | Product 1 — AI Research | Structured output: "Судовий контроль за актами ВККС/ВРП", Кримінально-правовий захист — clean legal-position breakdown with article references | Demonstrates the **citation-backed** output, not a generic chatbot stream. |
| 4 | `04-institutional-analysis-risks.png` | `Screenshot from 2026-04-28 12-50-29.png` | Product 1 — AI Research | Completed step with "Якщо мета — подання дисциплінарної скарги" + **Ризики та застереження** table (incomplete data, text-search limits, confidentiality, identification, time bounds) | Killer shot for compliance reviewers — shows the system flags its own epistemic limits. |
| 5 | `05-legislation-viewer.png` | `Screenshot from 2026-04-28 12-51-36.png` | Product 1 — AI Research (Legislation) | КМУ Розпорядження №285-р viewer with right-side **Доказова база** panel listing related norms | Shows article-level legislation retrieval + evidence sidebar (the design language reviewers care about). |
| 6 | `06-osint-fop-search.png` | `Screenshot from 2026-04-28 12-52-10.png` | Product 2 — Registry / OSINT | Chat: *"знайди ФОП Кириченко Ігор Вікторович, спробуй різні варіанти написання"* → table with 7 ФОП records (active + closed) using 3 spellings (UA, RU, alt) | Shows fuzzy/multilingual lookup over ЄДРПОУ — critical OSINT proof. |
| 7 | `07-case-document-chain.png` | `Screenshot from 2026-04-28 12-52-59.png` | Product 2 — Registry / OSINT | "НАЙДИ 369/1855/15-ц" — system shows 7-step plan: search → strategy → build chain → download decision 43976303 → fetch decision 105993680 | Demonstrates the **document-chain** tool: link a case from registry to full text, end-to-end. |
| 8 | `08-case-info-card.png` | `Screenshot from 2026-04-28 12-53-12.png` | Product 2 — Registry / OSINT | Final answer for case 369/1855/15-ц: structured card (court, procedure type, category, plaintiff, defendants, subject of dispute) | The "answer" view that closes the loop with the user. |
| 9 | `09-judge-profile.png` | `Screenshot from 2026-04-28 12-53-55.png` | Product 1 — Judge Analytics | Judge profile **Щербаков Володимир Валерійович** — Рівненський окр. адмін. суд: appointment history, case statistics (28 944 documents, 11 703 unique cases), instance, specialization | **The killer differentiator** — no other UA platform has this. Use it as a sub-hero. |
| 10 | `10-attorney-registry.png` | `Screenshot from 2026-04-28 12-54-25.png` | Product 4 — Marketplace | Search "рябчук" in Реєстр адвокатів → 7 results with certificate numbers, regional bar, issue dates | Proves the marketplace is anchored in the official ЄРАУ registry, not a free-form list. |
| 11 | `11-vault-encrypted.png` | `Screenshot from 2026-04-28 12-54-46.png` | Security / Compliance | Vault file list with encrypted documents, cached/cloud labels, folder filters | Shows real client document storage. Pair with #12. |
| 12 | `12-vault-unlock-modal.png` | `Screenshot from 2026-04-28 12-54-53.png` | Security / Compliance | "Розблокувати сейф" modal — password prompt for E2EE-encrypted documents | Concrete proof of E2EE — exactly what GDPR / enterprise reviewers want to see. |
| 13 | `13-diia-auth.png` | `Screenshot from 2026-04-28 13-02-09.png` | Security / Compliance | Login screen with **Дія.Підпис** QR modal — Ukrainian state digital ID auth flow | Closes the "Auth via Diia" gap — concrete proof of integration with Ukraine's national digital identity (a sovereign-grade trust signal for EU/UK reviewers). |
| 14 | `14-chatgpt-mcp-connected.png` | `Screenshot from 2026-04-28 13-01-21.png` | Distribution — MCP Native | ChatGPT input bar with **SecondLayer MCP** connector active (Developer mode) | One-shot proof that LEX is reachable as an MCP server from third-party AI clients. Anchors the "first MCP-native legal platform" claim. |
| 15 | `15-platform-api-docs.png` | `Screenshot from 2026-04-28 13-00-20.png` | Distribution — MCP Native | Public dev-docs page **LEX AI Platform API** — "100+ tools / 3 microservices / REST, MCP, SSE" overview with `mcp_backend` (80+), `mcp_rada` (4+), `mcp_openreyestr` (27+) | Demonstrates the API surface is documented and externalized, not just an internal product. Critical for partner / API-economy positioning. |

### 6.2 Alternates (optional — add only if room)

| Slug | Source | Use as |
|---|---|---|
| `alt-workflow-completed.png` | `Screenshot from 2026-04-28 12-49-54.png` | Alternative for #4 if you prefer the "Аналітичний звіт" framing |
| `alt-legislation-table.png` | `Screenshot from 2026-04-28 12-51-47.png` | Alternative for #5 — KVED-codes table view |
| `alt-attorney-profile.png` | `Screenshot from 2026-04-28 12-54-32.png` | Detail page after #10 (Рябчук О.С.) |
| `alt-document-ocr.png` | `Screenshot from 2026-04-28 12-55-38.png` | OCR / scanned-document viewer with extracted highlights — good if you add an "OCR / Document analysis" sub-section |
| `alt-decision-fulltext.png` | `Screenshot from 2026-04-28 12-53-07.png` | Full-text court decision modal — alternative for #8 if you prefer raw text over the structured card |
| `alt-stats-table.png` | `Screenshot from 2026-04-28 12-49-05.png` | Statistical overview (Крок 1/2/3 columns) — alt for #3 |
| `alt-mcp-oauth-grant.png` | `Screenshot from 2026-04-28 13-00-55.png` | OAuth2 grant screen ("Welcome back — MCP legal.org.ua, Application requesting access: ChatGPT") — pair with #14 to show the auth handshake |
| `alt-mcp-connect-modal.png` | `Screenshot from 2026-04-28 13-00-50.png` | ChatGPT "Connect SecondLayer MCP" permissions modal — alt for #14 if you prefer the consent dialog |
| `alt-mcp-app-settings.png` | `Screenshot from 2026-04-28 13-00-46.png` | ChatGPT Apps panel showing the SecondLayer MCP entry with URL `https://mcp.legal.org.ua/sse` and `OAuth supported` — alt for #14 |
| `alt-mcp-clients-docs.png` | `Screenshot from 2026-04-28 13-00-25.png` | Dev-docs **MCP клієнти** with copy-paste configs for Claude Code, Claude Desktop, Cursor — alt for #15 (more developer-facing) |

### 6.3 Skipped (reasoning kept for the record)

| Source | Reason |
|---|---|
| `12-49-45.png` | Mid-execution duplicate of `12-48-52.png` |
| `12-51-30.png` | Same legislation document as `12-51-36.png`, less context |
| `12-52-55.png` | Earlier state of `12-52-59.png` |
| `12-53-02.png` / `12-53-05.png` / `12-53-10.png` | Intermediate states of the case-chain flow already covered by `12-52-59.png` and `12-53-12.png` |

### 6.4 Still missing (add when convenient)

- **Claude Desktop / Cursor with a live LEX tool-call rendered** — current MCP shots (#14, #15, alternates) cover the connection + docs side. A screenshot of an actual `lex_search_decisions` (or similar) tool result inside Claude Desktop / Cursor would close the loop and reinforce the "first MCP-native legal platform" claim.
- *Mobile app (Flutter)* — explicitly **not yet ready**; do not list as a public surface until the beta ships.
- *Diia auth flow* — covered by #13.
- *MCP Connect / OAuth* — covered by #14, #15, plus 4 alternates.

### 6.5 One-liner copy commands

```bash
mkdir -p /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots

# Selected 12
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-49-28.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/01-hero-workflow-plan.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-48-52.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/02-workflow-execution.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-49-16.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/03-structured-legal-analysis.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-50-29.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/04-institutional-analysis-risks.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-51-36.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/05-legislation-viewer.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-52-10.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/06-osint-fop-search.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-52-59.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/07-case-document-chain.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-53-12.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/08-case-info-card.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-53-55.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/09-judge-profile.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-54-25.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/10-attorney-registry.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-54-46.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/11-vault-encrypted.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 12-54-53.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/12-vault-unlock-modal.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-02-09.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/13-diia-auth.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-01-21.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/14-chatgpt-mcp-connected.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-00-20.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/15-platform-api-docs.png

# Alternates (MCP)
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-00-55.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/alt-mcp-oauth-grant.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-00-50.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/alt-mcp-connect-modal.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-00-46.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/alt-mcp-app-settings.png
cp "/home/vovkes/Pictures/Screenshots/Screenshot from 2026-04-28 13-00-25.png" /home/vovkes/SecondLayer/lexwebapp/public/product-screenshots/alt-mcp-clients-docs.png
```
