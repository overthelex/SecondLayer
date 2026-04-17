import type { TranslationMap } from './articles';

export const enTranslations: TranslationMap = {
  'open-source-welcome-engineers': {
    title: 'Open Doors: Looking for Independent AI/ML Engineers and Open-Source Contributors',
    punchline: 'LEX AI is opening its platform as open source. We welcome strong engineers — AI/ML, backend, data, frontend — to contribute or join the team. What\'s already open, who we\'re looking for, and how to get involved.',
    readTime: '6 min',
    content: `# Open Doors: Looking for Independent AI/ML Engineers and Open-Source Contributors

*LEX AI has been built since 2024 by a small team. We\'re now opening part of the platform as open source and inviting independent engineers to join — as contributors and as future team members.*

---

## What LEX AI Is

LEX is a Ukrainian legal AI platform. Semantic search across 100M+ court decisions (EDRSR — the largest open court decisions corpus in Europe), legislation from the Ukrainian Parliament, OSINT and due diligence, consultations, billing. The stack is assembled as MCP (Model Context Protocol) servers behind a unified gateway.

Our second product — **Panoptic** (panoptic.com.ua) — is an OSINT platform aggregating 18+ intelligence data sources: sanctions, corporate ownership, credential breaches, IP/domain reputation, GDELT, INTERPOL, World Bank Debarment.

We\'re building Harvey.ai-level quality for Ukrainian jurisprudence on open-weight models — DeepSeek-V3, Llama, Qwen — because the data is unique (no such corpus exists in the EU), and open-weight models after continued pre-training deliver 90%+ of flagship LLM quality on domain tasks at a fraction of the cost.

---

## What\'s Already Open

The \`overthelex/secondlayer\` monorepo contains three MCP servers, the frontend, the shared package, and all deployment scripts. Publicly available:

- **Platform architecture** — MCP tools, triple transport (stdio / HTTP / SSE), unified gateway
- **Adapters to open sources** — EDRSR, Verkhovna Rada, NACP, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL
- **Data pipelines** — imports for 340M+ records from 15 government APIs, multi-IP scheduler, freshness monitoring
- **Blue-green CI/CD** — self-hosted runner, Claude Code auto-fix agents, blue-green deploy over SSH
- **Frontend** — React 19 + Vite + TailwindCSS + Zustand + TanStack Query

Everything related to legal data, OSINT pipelines, importers, MCP architecture — in the public repo. Only the ML layer with product prompts and orchestration remains proprietary (\`secondlayer-core\`).

---

## Who We\'re Looking For

We don\'t hire by job title. We\'re looking for people who already do strong work — and want to do it on a meaningful domain, with real data and real users.

**AI/ML engineers:**

- LoRA fine-tuning of large models (70B+), continued pre-training
- Embeddings fine-tuning (BGE-M3, custom encoders) for retrieval
- RLHF, constitutional alignment, adversarial training setups
- Hands-on with Vertex AI / SageMaker HyperPod / Trainium / TPU v5p on multi-node clusters
- Retrieval-augmented generation, citation verification, hallucination guards

**Backend / distributed systems:**

- PostgreSQL at billion-row scale (pgvector, partitioning, TOAST optimizations)
- Event-driven architectures, queues, replication, PgBouncer
- MCP servers, tool orchestration, LLM gateways, cost tracking

**Data engineering / OSINT:**

- Scraping at scale (rate-limiting, proxy rotation, resume logic, checkpointing)
- ETL for government open registries
- Sanctions screening, KYC/AML, due diligence pipelines

**Frontend:**

- React 19 + TypeScript at production level
- Complex UI for legal analytics (data-heavy dashboards, evidence panels)
- Ukrainian i18n, accessibility, performance optimization

---

## Philosophy

- **Open everything that doesn\'t break the business.** We don\'t hide the architecture — it isn\'t the competitive edge. The edge is data, domain quality, and iteration speed.
- **Pragmatism over hype.** A distributed monolith today can be the right answer. Microservices ≠ virtue. A framework ≠ a solution.
- **Legal deserves serious AI engineering.** Not "a chatbot with statutes" — real legal modeling: constitutional alignment, citation verification, jurisdictional specialization.
- **Open source by default.** If the code doesn\'t contain proprietary prompts, API keys, or client data — it\'s public.

---

## How to Join

**As a contributor:**

1. Check open issues on GitHub (\`github.com/overthelex/secondlayer\`)
2. Submit a PR — we review within 48 hours
3. For large changes, open a discussion first

**As a hiring candidate:**

Email \`vladimir@legal.org.ua\` with a short resume. No page-long cover letter needed — show three things:

1. What you\'ve done before (GitHub, a link to a specific project with detail)
2. Why this domain — legal AI, open data, OSINT — interests you
3. What you want to build in the next 6 months

We respond fast. Interview is a technical discussion (no LeetCode), a pair-programming session on a real task from the backlog, and a coffee chat with the team.

---

## Our Promise

- **Fully remote.** The team is distributed across Europe.
- **No micromanagement.** Trust by default. Output matters more than Slack presence.
- **Prod access from day one.** No "probation month" in read-only.
- **Compute budget.** If an idea needs a GPU cluster — we talk to Google Cloud, AWS, Nebius and find the resource.
- **Publication under your name.** Your work is your credit. We don\'t hide contributors.

---

## Context

We\'re currently in active conversations with Google Cloud and AWS about sponsorship for a 12-month ML training plan ($195K–$265K, DeepSeek-V3 685B continued pre-training on 50–80B tokens of the EDRSR corpus). We have paying users and B2B clients. Not a startup-in-a-garage, not another enterprise clone. Something in between — and that\'s what makes the work interesting.

If you\'re excited by building real AI infrastructure for jurisprudence on the largest open court decisions corpus in Europe — let\'s talk.

---

**Repo:** github.com/overthelex/secondlayer
**Contact:** vladimir@legal.org.ua
**Site:** legal.org.ua`,
  },
  'security-audit-gdpr-owasp': {
    title: 'LEX AI Security: GDPR Audit, 10 Fixes, and 7 Layers of Protection',
    punchline: '5 parallel white-hat agents audited the platform for GDPR and OWASP Top 10 compliance. Found 23 vulnerabilities — from SQL injection to Google Ads firing before consent. Fixed 10 critical issues in one session. Full security architecture breakdown: Cloudflare, TLS 1.3, CSP, rate limiting, WebAuthn, E2EE.',
    readTime: '15 min',
    content: `# LEX AI Security: GDPR Audit, 10 Fixes, and 7 Layers of Protection

A legal platform handles the most sensitive data: court cases, contracts, clients' personal information. Security isn't a feature — it's the foundation. We ran a full security audit using 5 parallel AI agents and fixed all critical findings in a single session.

This article is a transparent breakdown: what we found, what we fixed, and how LEX AI's complete security architecture works.

---

## How We Ran the Audit

Instead of a traditional manual pentest, we launched **5 specialized white-hat agents in parallel**, each with their own area of responsibility:

| Agent | Focus | Files Scanned |
|-------|-------|---------------|
| 🔍 Data Collection | Cookie consent, tracking, OAuth scopes | 42 |
| 💾 Data Storage | DB schemas, retention, Redis, Qdrant, MinIO | 53 |
| 👤 User Rights | GDPR Art. 15-22 (access, deletion, portability) | 25 |
| 🛡️ OWASP Top 10 | Injection, XSS, Auth, CORS, CSRF, rate limiting | 45 |
| 🌐 Data Transfers | Third-party APIs, sub-processors, cross-border | 48 |

Each agent autonomously scanned the codebase, checked compliance against standards, and produced a structured report with CVSS scores.

---

## What We Found: 23 Vulnerabilities

### Critical (Fixed)

**1. Google Ads loaded BEFORE cookie consent**

\`index.html\` contained a hardcoded \`<script>\` tag for Google Ads that executed on every page load — **before** the React app could render the cookie consent banner. Every visitor had their data sent to Google, even if they later rejected analytics.

**Fix:** Google Ads now loads dynamically only after \`consentStore.isAllowed('analytics')\`. Added Google Consent Mode v2 with \`denied\` defaults:

\`\`\`javascript
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
});
\`\`\`

**2. JWT Secret with fallback to a known string**

Several files contained a hardcoded fallback value for the JWT secret. If the environment variable wasn't set during deployment, the app would silently operate with a predictable secret, allowing anyone to forge valid JWTs.

**Fix:** The app now crashes on startup if the JWT secret is not set via environment variable. All fallback values have been removed.

**3. SQL Injection via parameter interpolation**

Several places in the code used direct string interpolation for SQL parameters instead of parameterized queries. Combined with #2, this created a direct SQL injection vector.

**Fix:** All SQL queries now use parameterized placeholders.

### High Priority (Fixed)

**4. Conversion tracking without consent check** — all \`gtag('event', 'conversion')\` calls (registration, payment, top-up) now check \`consentStore.isAllowed('analytics')\`.

**5. Nginx CORS reflected any Origin** — SSE endpoints used \`$http_origin\` directly, allowing any website to make credentialed requests. Replaced with a regex whitelist.

**6. XSS via dangerouslySetInnerHTML** — 3 components rendered HTML from the database without sanitization. Added DOMPurify.

**7. Dynamic SQL tables without whitelist** — some functions accepted table names as parameters without validation. Added a strict allowlist of permitted tables and columns.

**8. Cleanup functions never ran** — data cleanup functions (expired sessions, soft-deleted documents, expired tokens) existed but were never scheduled. Added automated cron jobs.

**9. Emails logged in plaintext** — 9+ locations in auth controllers. Added \`maskEmail()\`: \`user@example.com\` → \`us***@example.com\`.

**10. OAuth registration without rate limiting** — the OAuth client registration endpoint allowed unlimited requests. Added IP-based rate limiting.

---

## 7 Layers of Protection

LEX AI's security is built on the **defense in depth** principle — each layer compensates for potential weaknesses in others.

### Layer 1: Cloudflare (Edge Protection)

All traffic passes through Cloudflare before reaching our servers:

- **DDoS Protection** — automatic filtering of volumetric and application-layer attacks
- **WAF (Web Application Firewall)** — OWASP Top 10 protection at the edge
- **Bot Management** — blocking malicious bots
- **Origin CA** — TLS between Cloudflare and our origin server
- **Always HTTPS** — forced redirect from HTTP

### Layer 2: TLS 1.3 (Transport Encryption)

- TLS 1.0/1.1 disabled
- ECDHE-only cipher suites (Forward Secrecy)
- HSTS with 1-year max-age and includeSubDomains
- SSL session cache for performance without compromise

### Layer 3: Nginx (Reverse Proxy + Security Headers)

| Header | Value | Protects Against |
|--------|-------|-----------------|
| HSTS | max-age=31536000; includeSubDomains | Downgrade attacks |
| X-Frame-Options | SAMEORIGIN | Clickjacking |
| X-Content-Type-Options | nosniff | MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Information leakage |
| CSP | Full policy (12 directives) | XSS, injection |

### Layer 4: Application Security (Express.js)

**Multi-layer rate limiting** — each endpoint type (auth, chat, API, password reset) has separate limits by IP or User ID.

### Layer 5: Authentication (6 Methods)

1. **Email + Password** — bcrypt hashing, account lockout after failed attempts (15 min)
2. **Google OAuth 2.0** — minimal scopes (profile + email), idToken verification
3. **WebAuthn / Passkeys** — biometric auth via FIDO2, 5-min challenge TTL
4. **Diia** — Ukrainian government ID authentication
5. **OIDC / Authentik** — SSO via Authentik
6. **API Keys** — for MCP clients (Claude Desktop, Claude Code), database-backed with audit log

### Layer 6: Database Security

- **PgBouncer** with SCRAM-SHA-256 authentication
- Connection pooling with restricted client and pool sizes
- Statement timeout for protection against slow query DoS
- Docker bridge network isolates DB from external access
- Parameterized queries everywhere

### Layer 7: Data Protection (GDPR)

**Implemented rights:**
- **Art. 15 (Access)** — full JSON export of all user data
- **Art. 17 (Erasure)** — cascading deletion from all data stores, tracking anonymization
- **Art. 20 (Portability)** — machine-readable JSON format

**Cookie Consent:** 4 categories with privacy-by-default. **E2EE for documents:** AES-256-GCM with X25519 ECDH key exchange.

**Automated cleanup** — regular purging of expired sessions, soft-deleted documents, and OAuth tokens at configured intervals.

---

## What's Left to Do

| Task | Priority |
|------|----------|
| Persist registration consent server-side | High |
| Pass consent through OAuth redirect flow | High |
| Implement Art. 18 (restriction of processing) | Medium |
| Implement Art. 21 (right to object) | Medium |
| Update Privacy Policy regarding Google Ads | Medium |
| Add Google Cloud Vision to DPA as sub-processor | Medium |
| Column-level encryption for PII fields | Medium |
| Nonce-based CSP instead of unsafe-inline | Low |

---

## Conclusions

1. **AI agents for security audits** — 5 parallel agents covered more attack surface in 3 minutes than a manual review in a day
2. **Defense in depth works** — no single vulnerability gave full system access thanks to the multi-layer architecture
3. **GDPR is code, not a document** — user rights must be implemented in code (export, delete, consent), not just described in a Privacy Policy
4. **Transparency builds trust** — we publish audit results because we believe a legal platform should be open about its security

All fixes are available in PR [#1224](https://github.com/overthelex/secondlayer/pull/1224).

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'attorney-marketplace': {
    title: 'Legal Consultation Marketplace: From the Unified Attorney Registry to Monobank Payments',
    punchline: 'Attorney verification via the Unified Attorney Registry (ERAU) in 2 seconds. 3-step onboarding. Consultation request with documents from the vault. Real-time chat between client and attorney. Escrow payment via Monobank. 10% platform commission. Full cycle — from "I need a lawyer" to a paid consultation.',
    readTime: '9 min',
    content: `# Legal Consultation Marketplace: From the Unified Attorney Registry to Monobank Payments

*How we built a complete legal consultation ordering cycle — from attorney verification to escrow payments.*

---

## The Problem: Finding a Lawyer Is Harder Than It Seems

A client needs a lawyer. What do they do? Google it. Ask friends. Visit law firm websites. There is no single place to find verified attorneys, compare specializations, read reviews, and immediately book a consultation.

From the attorney's side, it's painful too: they need a website, SEO, manual request handling, scheduling, invoicing. Instead of legal work — administration.

## Architecture: 6 Components

| Component | What It Does |
|-----------|-------------|
| **ERAU Integration** | Verification via the Unified Attorney Registry (ERAU) |
| **Onboarding** | 3-step profile creation modal |
| **Attorney Search** | Filters by specialization, region, price |
| **Consultation Request** | 4-step flow with documents |
| **Real-time Chat** | SSE-based messaging |
| **Escrow Payment** | Monobank with hold until completion |

## Step 1: Verification via ERAU

ERAU (Unified Attorney Registry of Ukraine) is the official registry of licensed attorneys. Our integration works as follows:

1. The attorney enters their last name
2. A request goes to \`erau.unba.org.ua/search\`
3. The result is cached: Redis (24 hours) → PostgreSQL (indefinitely)
4. On external API failure — fallback to PostgreSQL cache

What we get: last name, first name, patronymic, certificate number, issue date, regional bar association. This is sufficient for verification — the attorney is confirmed to be in the National Bar Association registry.

Caching is critical. The ERAU API is unstable and slow (15-second timeout). After the first lookup — response in milliseconds from cache.

## Step 2: 3-Step Onboarding

**Step 1** — Welcome. What a platform profile provides, how verification works.

**Step 2** — ERAU Search. The attorney searches for themselves by last name, selects from the list. Data is pulled automatically: certificate number, date, regional bar association.

**Step 3** — Profile completion. Specializations (up to 5), court types, region, languages, rates (consultation, hourly rate, representation), bio.

The profile is saved in the \`attorney_profiles\` table linked to \`users\` and \`organizations\`.

### Pricing Tier with 30% Markup

For attorneys — a dedicated pricing plan:

| | Basic | Attorney |
|---|---|---|
| Price | $9/mo | $49/mo |
| MCP tools markup | 0% | 30% |
| Limits | ₴415/₴4150 | ₴2075/₴20750 |
| Support | 48 hours | 12 hours |
| Trial | 7 days | 14 days |

The 30% markup covers additional costs for deep legal analysis that attorneys use for client cases.

## Step 3: Attorney Search

Clients see a catalog with filters:

- **Specialization** — civil, criminal, commercial, family...
- **Region and city** — with remote work option
- **Court type** — first instance, appellate, cassation
- **Price range** — min/max per consultation
- **Rating** — minimum score
- **Free first consultation** — yes/no
- **Languages** — Ukrainian, English, etc.

Sorting: by rating, price, experience, number of consultations.

Attorney card: photo, name, specializations (tags), rating (stars + review count), consultation price, "Book Consultation" button.

## Step 4: Consultation Request

4-step modal:

**Details** — type (consultation / representation / document analysis), title, description, urgency (low / normal / high / urgent).

**Documents** — DocumentPicker allows selecting documents from the vault. The attorney sees them after accepting the request.

**Confirmation** — review everything before submitting.

**Payment** — mock Monobank (currently a 2-second delay → success).

### Consultation Statuses

\`\`\`
pending → accepted → paid → in_progress → completed
           ↘ declined    ↘ cancelled      ↘ disputed
\`\`\`

The attorney sees pending requests with an "unseen" badge. They can accept (with optional price adjustment) or decline (with a reason).

## Step 5: Real-time Chat

After payment, a chat opens between the client and attorney. Implementation:

- **MessageBus** — EventEmitter with subscription to \`msg:{consultationId}\`
- **SSE stream** — \`GET /api/consultations/:id/messages/stream\`
- Heartbeat every 30 seconds
- Automatic read receipts
- Unread counter

Message types: \`text\`, \`system\` (status changes), \`file\`.

## Step 6: Escrow Payment

The payment model protects both parties:

1. Client pays → funds are \`held\`
2. Attorney conducts the consultation
3. Consultation completed → funds \`released\` to the attorney
4. If cancelled → \`refunded\` to the client

**Split:**
- 90% — to the attorney
- 10% — platform commission

## Matter Access

When a consultation is paid, the attorney automatically receives the \`consultant\` role on the client's matter — read-only access to documents. After completion — access is revoked.

This works through the existing matter segregation system: the attorney only sees documents from the matter the consultation was ordered for.

## Reviews

After completion, the client can leave a review:
- Overall rating (1-5 stars)
- Breakdown: communication, knowledge, professionalism, value
- Updates \`average_rating\` and \`rating_count\` in the attorney's profile

Full cycle — from "I need a lawyer" to a paid consultation with a review. No calls, no emails, no manual coordination.`,
  },
  'mcp-tokens-claude-desktop': {
    title: 'MCP Tokens and Claude Desktop Integration: Legal AI on Your Desktop',
    punchline: 'One token. One command. 56 legal AI tools right in Claude Desktop. Court practice search, legislation analysis, counterparty verification — without opening a browser. Create a token in your profile, paste a command in the terminal, and LEX AI becomes an extension of your desktop.',
    readTime: '5 min',
    content: `# MCP Tokens and Claude Desktop Integration: Legal AI on Your Desktop

*One token. One command. 56 legal tools on your desktop.*

---

## What Is MCP and Why It Matters

MCP (Model Context Protocol) is an open standard that allows AI assistants to use external tools. Claude Desktop, Claude Code, Jan AI, and other clients support MCP out of the box.

This means: you can connect LEX AI as an extension to Claude Desktop and get access to 56 legal tools right in your chat with Claude.

## What You Get

56 tools through one token:

| Category | Tools | Example |
|----------|-------|---------|
| **Court Practice** | Search, analysis, comparison | "Find Supreme Court practice on Art. 625 of the Civil Code for 2025" |
| **Legislation** | 12 codes, 5,191 articles | "Show Article 203 of the Civil Code with commentary" |
| **Due Diligence** | 16 registries | "Check LLC by EDRPOU 12345678" |
| **Parliament** | Bills, deputies | "Status of bill 6489" |
| **Documents** | Vault, analysis | "Analyze the uploaded contract" |

## How to Connect: 3 Minutes

### Step 1: Create a Token

Open your profile on legal.org.ua → "MCP Access Tokens" section → "Create Token".

Enter a name (e.g., "Claude Desktop — work laptop"). The token is shown once — copy and save it.

Token format: \`sl_xB9kL2mN4pQ7rS1tU5vW3xY8zA0bC_d4e5f6g7\` — 44 characters with a checksum.

### Step 2: Add to Claude Code

Open the terminal and run:

\`\`\`bash
claude mcp add secondlayer \\
  --transport sse \\
  --url https://mcp.legal.org.ua/v1/sse \\
  --header "Authorization: Bearer YOUR_TOKEN"
\`\`\`

For Claude Desktop — add to \`claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "secondlayer": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
\`\`\`

### Step 3: Start Using

Open Claude Desktop. Type: "Find Supreme Court practice on invalidation of transactions under Art. 203 of the Civil Code".

Claude will see 56 available tools, choose the right ones, execute the search, and deliver a structured response — with case numbers, dates, courts, and precedent statuses.

## Token Security

- **One token — one user.** All actions are tied to your account.
- **Rate limits:** 60 requests/minute, 10,000/day. Enough for intensive work.
- **Instant revocation.** If a token is compromised — delete it in your profile, create a new one.
- **Expiration.** Optional — you can create a permanent token or one with an expiry date.
- **Audit.** Every token usage is logged: time, tool, cost.

The token is not stored in plaintext after creation — you see it only once.

## What This Gives a Lawyer

**Desktop context.** You're working on a document in VS Code or a text editor. Without switching, you ask Claude: "Is there court practice on this contract clause?" Claude uses LEX AI tools, finds the practice, shows the result — right next to your document.

**Voice queries.** Claude Desktop supports voice input. You dictate a question — get an analysis with references to real cases and articles.

**File integration.** Drag a contract into Claude Desktop. Ask it to analyze risks against current court practice. Claude reads the document, finds relevant cases through LEX AI, and delivers the analysis.

## Usage Scenarios

**Quick reference during a meeting.** A client asks about limitation periods for a specific type of dispute. You ask Claude — an answer with references to articles and Supreme Court practice in 10 seconds.

**Preparing a claim.** "Find the 5 strongest precedents for recovering lost profits under a construction contract." Claude runs a series of searches, filters by court instances, returns decisions with statuses.

**Due diligence on the go.** "Check company EDRPOU 31316518 — who are the beneficiaries, any debts?" A full profile in 2 seconds, without opening a browser.

One token. 56 tools. Legal AI — where you work.`,
  },
  'round-robin-llm': {
    title: 'Why We Ditched Round-Robin Between OpenAI and Anthropic',
    punchline: 'We integrated OpenAI and Anthropic with round-robin routing. On the architecture diagram it looked perfect. In production it nearly killed our product. The same prompt produced different results depending on the provider. Debugging a 5-step agentic cycle? That is not engineering — it is archaeology. We ripped it all out. Hardcoded a single provider. Best line of code all year.',
    readTime: '8 min',
    content: `# Why We Ditched Round-Robin Between OpenAI and Anthropic — and What We Use Instead

*Building a legal AI platform taught us: multi-provider LLM routing looks great on architecture diagrams but breaks in production.*

---

## The Idea That Made Perfect Sense

When we started building LEX AI — a platform for analyzing millions of Ukrainian court decisions — we did what every AI-first team does: integrated multiple LLM providers.

OpenAI for structured output. Anthropic for deep legal analysis. Round-robin between them for resilience and cost optimization.

On paper it looked elegant. In production it was a nightmare.

## What Went Wrong

### 1. Response Format Fragmentation

Our agentic pipeline runs up to 5 iterations of tool-calling per user request. Each iteration expects a normalized response: \`tool_calls\`, \`finish_reason\`, structured JSON.

OpenAI and Anthropic return these differently. We built a normalization layer. It handled 90% of cases. The remaining 10% — empty responses, incomplete JSON, unexpected stop reasons — caused silent failures deep in the loop.

One bug took us 3 days to find: Anthropic occasionally returned a valid response with \`stop_reason: "end_turn"\` instead of \`"tool_use"\`, which our normalizer passed through, but the next iteration treated as a final answer. The user got a half-baked analysis with zero indication that something went wrong.

### 2. One Prompt — Two Different Behaviors

Legal AI lives and dies by prompt precision. Our system prompt instructs the model to act as a Ukrainian legal assistant, classify intents, select tools, and respond in a structured format.

Claude followed Ukrainian-language instructions more accurately. GPT generated cleaner JSON tool calls. When the model changed on each iteration of the agentic cycle, the result quality became a coin flip.

### 3. Debugging Became Archaeology

When a user reported a bad result, we looked at the trace:

- Step 1: OpenAI (classified intent)
- Step 2: Anthropic (generated search plan)
- Step 3: OpenAI (executed tools)
- Step 4: Anthropic (synthesized response)

Which step broke? The model or the normalization? Can we reproduce? No — the next run routes differently.

### 4. The "Cost Optimization" That Wasn't

Round-robin was supposed to balance costs. Instead:

- Anthropic pricing for deep analytical queries was 2-3x higher than the OpenAI equivalent
- But Anthropic was cheaper for short classification queries
- Round-robin completely ignored this — it just alternated

### 5. Two Sets of Everything

Each provider has its own: rate limits, retry strategies, error formats, SDK updates. Our "unified" retry layer was actually two retry layers in a trench coat.

## What We Do Now

We switched to **strategy-based provider selection** with OpenAI as the primary and AWS Bedrock as the alternative — and invested the saved complexity into **budget-aware model selection**:

| Budget | OpenAI | AWS Bedrock | Use Case |
|--------|--------|-------------|----------|
| quick | gpt-5-nano | Amazon Nova Micro | classification, routing |
| standard | gpt-5-mini | Amazon Nova Lite | tool execution, summarization |
| deep | gpt-5.1 | Amazon Nova Pro | legal analysis, pattern extraction |

The \`LLM_PROVIDER_STRATEGY\` variable controls selection: \`openai-first\` (default) or \`bedrock-first\` (if AWS credentials are available). One API format. One error handler. One retry logic. Predictable costs. Reproducible results.

## How to Properly Use Multiple Providers

**Task routing, not round-robin** — assign each provider specific task types permanently.

**Fallback, not alternation** — Provider B activates only when Provider A returns 429 or 500.

**Multi-key single provider** — multiple API keys from a single provider with rotation to bypass rate limits.

## Why AWS Bedrock Is a Game Changer

| | Direct API Key | AWS Bedrock |
|---|---|---|
| Models | Single provider | Claude + Llama + Mistral via one SDK |
| Security | API key in .env | IAM roles, no keys in code |
| Data | Goes to provider's cloud | Stays in your AWS region |
| Billing | Separate invoices | Single AWS bill |
| Rate limits | Hard, per-key | Provisioned Throughput |

The \`@deprecated\` tag on our \`getNextProvider()\` method is the best line of code we wrote all year.

---

## Epilogue: March 2026

When we wrote this article, the Anthropic API fallback was a temporary solution. In March 2026 we finally closed this chapter: PR #722 replaced direct Anthropic API with AWS Bedrock.

What did this mean in practice? One SDK (\`@aws-sdk/client-bedrock-runtime\`) instead of two client libraries. IAM authentication instead of API key rotation. Data stays in \`eu-central-1\` — our DPO finally stopped worrying. Single billing through AWS Cost Explorer instead of separate invoices from OpenAI and Anthropic.

The budget tiers we dreamed about now work through Bedrock: \`quick\` goes to Nova Micro, \`standard\` to Nova Lite, \`deep\` to Nova Pro. OpenAI remains the primary for the main pipeline, but the entire fallback chain is now on AWS.

Turns out, the decision to ditch round-robin was right not just tactically, but strategically. We didn't just pick a single provider — we chose an infrastructure platform that scales with the product. That \`@deprecated\` tag is still in the code. As a reminder.`,
  },
  'mcp-server-architecture': {
    title: 'How We Built an MCP Server with 56 Tools for Legal AI',
    punchline: 'One endpoint. Three services. 58 MCP tools. Triple transport: stdio for Claude Desktop, HTTP REST for web apps, SSE for streaming. Every tool call goes through an 11-step pipeline with cost tracking at each stage. The number of tools will grow. The architecture does not care.',
    readTime: '10 min',
    content: `# How We Built an MCP Server with 56 Tools for Legal AI

*One endpoint. Three services. Triple transport. Here is what it takes to build a production MCP server that actually scales.*

---

## The Problem: Legal AI Needs More Than a Single API Call

When a lawyer asks "Negatory or vindication claim for unauthorized occupation of a land plot?" — the answer requires: searching 200+ court decisions, retrieving texts from the Civil Code and the Land Code, comparing "for" and "against" practice, checking precedents, synthesizing a strategic recommendation.

This is not a single LLM call. It is an orchestrated pipeline of 5-7 tool calls.

## Architecture: 56 Tools, Three Services, One Gateway

| Service | Tools | Domain |
|---------|-------|--------|
| **mcp_backend** | 36 | Court decisions, legislation, semantic search, documents, due diligence |
| **mcp_rada** | 4 | Parliament — bills, deputies, voting |
| **mcp_openreyestr** | 16 | State register — legal entities, beneficiaries, debtors |

A single environment variable — \`ENABLE_UNIFIED_GATEWAY=true\` — turns the backend into an aggregation point.

## Triple Transport

### stdio (MCP Native)
Pure JSON-RPC via stdin/stdout. Claude Desktop, MCP CLI. Zero overhead.

### HTTP REST API
\`POST /api/tools/:toolName\` with Bearer token. Batch endpoint for parallel execution. \`Accept: text/event-stream\` header switches to SSE.

### SSE (MCP-over-SSE)
Two variants: ChatGPT/OpenAI protocol (\`/sse\`) and standard MCP SSE (\`/v1/sse\`).

## Call Flow: 11 Steps

1. **dualAuth** — JWT or API key
2. **Balance check** → 402 if insufficient
3. **Credit calculation** for the tool
4. **Cost tracking** — pending record
5. **Cost estimation** before execution
6. **Gateway routing** — local or remote?
7. **Execution** in AsyncLocalStorage context
8. **Handler dispatch** → domain logic
9. **Tracking completion** — actual tokens
10. **Credit deduction** after success
11. **Response** with cost breakdown

## Patterns That Saved Us

**Cost hints in descriptions** — every tool has an estimated cost in its description. The LLM sees this during planning.

**Budget-aware models** — the \`reasoning_budget\` parameter maps to different models: quick → nano, deep → gpt-5.1.

**Vault isolation** — userId is injected at the transport level, tool schema knows nothing about authentication.

**Route normalization** — without it, 56 tools + UUIDs create thousands of time series in Prometheus.

## Numbers

- **56 tools** across 3 services
- **12 handler classes** in the backend
- **3 transports** per service
- **5,191 legislation articles**
- **16 state registries**
- Latency: **200ms** (cache) to **8s** (deep analysis)

The number of tools will grow. The architecture does not care.

---

## Update: New Tools (March 2026)

The total number of MCP tools has grown from 56 to 58 thanks to two new tools in the \`mcp_openreyestr\` service.

**New tools:**

- **openreyestr_search_erb_debtors** — search the Unified Debtors Registry (ERB). Allows finding individuals and legal entities with active enforcement proceedings, filtered by recovery type and debt category.
- **openreyestr_search_nbu_banks** — search the NBU bank registry. Provides access to information about banking institutions, their status (active, liquidation), licenses, and contact details.

**Improvements to existing tools:**

The \`get_legislation_section\` tool now supports vector search as a fallback strategy. If the user provides a \`rada_id\` and a text query without a specific article number, the system automatically performs semantic search across the vector index of the relevant law, returning the most relevant sections.`,
  },
  'semantic-search-legislation': {
    title: 'Semantic Search Across 5,000+ Legislation Articles: Embeddings, Chunking, and Qdrant',
    punchline: 'Keywords find what you already know. Semantic search finds what you need. We split 12 Ukrainian codes into 5,191 articles, vectorized each one using VoyageAI embeddings, and now the query "liability for poor-quality repairs" finds articles that contain none of those words.',
    readTime: '7 min',
    content: `# Semantic Search Across 5,000+ Legislation Articles

*Keywords find what you already know. Semantic search finds what you need.*

---

## The Problem with Keywords

A lawyer searches for "liability for poor-quality apartment repairs." Classic search looks for these words. But Article 858 of the Civil Code talks about "defects in work" and "client's claims against the contractor." Zero keyword match — but that is exactly the right article.

Semantic search understands *meaning*, not *words*.

## How We Built It

### Step 1: Legislation Sectioning

12 Ukrainian codes are not 12 documents. They are 5,191 articles, each a self-contained unit of knowledge. Our SemanticSectionizer breaks codes into logical sections:

- **Article** — the primary unit (90% of cases)
- **Part of article** — when an article is too long (>2,000 tokens)
- **Chapter/Section** — for search context

Each section is stored with metadata: code name, article number, title, hierarchical path (Book → Section → Chapter → Article).

### Step 2: Vectorization

Each section passes through VoyageAI \`voyage-3.5\`:
- Input: article text + title + contextual path
- Output: 1024-dimensional vector
- Storage: Qdrant with metadata for filtering

### Step 3: Search

User query → embedding → cosine similarity in Qdrant → top-N results with relevance threshold > 0.75.

**Metadata filtering** — a lawyer can narrow down to a specific code, chapter, or type of provision.

## Real Examples

| Query | Keyword search finds | Semantic search finds |
|-------|---------------------|----------------------|
| "liability for poor-quality repairs" | Nothing | Art. 858 CC (defects in contractor's work) |
| "when you can stop paying alimony" | Nothing | Art. 188, 190, 196 FC (exemption from payment) |
| "protection against wrongful dismissal" | Articles with the word "dismissal" | + Art. 235 LC (reinstatement), Art. 237-1 (compensation) |

## Cache and Freshness

- Texts are downloaded from the official Verkhovna Rada API
- Cache TTL: 30 days
- When an article changes — automatic re-indexing
- 5,191 articles x 1,024 dimensions = ~21MB in Qdrant

Semantic search does not replace exact search — it complements it. Together they provide the complete picture.`,
  },
  'hallucination-guard': {
    title: 'RAG for Legal Documents: HallucinationGuard and CitationValidator in Production',
    punchline: 'AI confidently cites non-existent articles and fabricates case numbers. In the legal domain, this is not just an error — it is malpractice. We built two layers of protection: HallucinationGuard verifies every claim, CitationValidator validates every citation. Zero tolerance for fabrication.',
    readTime: '7 min',
    content: `# RAG for Legal Documents: HallucinationGuard and CitationValidator

*AI confidently cites non-existent articles. In the legal domain, this is not an error — it is malpractice.*

---

## The Problem: AI Lies Confidently

Ask ChatGPT to name court decisions on copyright protection in Ukraine. It will produce 5 case numbers. Check them — 4 out of 5 do not exist. The fifth exists but is about an entirely different topic.

For a legal platform, this is unacceptable. Every case number, every legislation article, every citation — must be real.

## Protection Architecture

### Layer 1: HallucinationGuard

Works *before* the response reaches the user. Verifies every factual claim in the AI response:

1. **Claim extraction** — parses the response into individual factual claims
2. **Source lookup** — for each claim, searches for confirmation in tool call results
3. **Classification**: supported (found in sources), unsupported (not in sources), contradicted (conflicts with sources)
4. **Decision**: unsupported claims are flagged or removed, contradicted claims are always removed

### Layer 2: CitationValidator

Works with specific references:

- **Case numbers** — verifies existence through the ZakonOnline API
- **Legislation articles** — validates through the Verkhovna Rada API
- **Decision quotes** — compares against the actual decision text

### Layer 3: Precedent Status

Every decision is returned with a status:
- **valid** — in force, not overturned
- **limited** — narrowed by a higher court
- **overruled** — reversed
- **questioned** — under doubt

## System Prompt Rule #1

> "Never generate case numbers, legislation articles, or court decisions from memory. Always use tools to obtain factual data."

This is not a recommendation — it is a hard instruction. The AI cannot name any Civil Code article without calling \`get_legislation_article\`. It cannot reference a case without finding it via \`search_legal_precedents\`.

## Result

Every reference in the response is clickable. Click a case number — the full text opens. Click a legislation article — see the current version. The lawyer does not take AI at its word — they verify in one click.

Zero tolerance for hallucinations is not a feature. It is the foundation.`,
  },
  'monolith-to-mcp': {
    title: 'From Monolith to MCP: How Model Context Protocol Transformed Our Architecture',
    punchline: 'We started as a REST API with 10 endpoints. Now we have 70 MCP tools across 3 services with triple transport. MCP gave us what REST could not: a standard way for AI to discover and use tools on its own. AI becomes the client, not you.',
    readTime: '6 min',
    content: `# From Monolith to MCP: How Model Context Protocol Transformed Our Architecture

*REST API works great when the client is a human. When the client is AI, you need a different protocol.*

---

## Why REST Is Not Enough for AI

REST API works like this: a developer reads documentation, writes integration code, hardcodes endpoints. Works perfectly for web apps.

But when your "client" is an LLM that must *decide on its own* which tool to call:

- REST has no standard tool discovery
- No built-in parameter descriptions for AI
- Every integration is custom code
- Batch, streaming, cost estimation — all separate

## What MCP Provides

**Model Context Protocol** is a standard by Anthropic for AI interaction with external tools.

### Tool Discovery

\`\`\`
GET /api/tools → full catalog with JSON Schema for every parameter
\`\`\`

The AI receives a list of all 70 tools with descriptions, parameter types, constraints — and decides on its own what to call.

### Standardized Schema

Every tool is described the same way:
- **name** — unique identifier
- **description** — what it does (with cost hints)
- **inputSchema** — JSON Schema for parameters
- **outputSchema** — result format

### Three Transports

stdio for local clients, HTTP for web, SSE for streaming — the same set of tools via any protocol.

## Our Migration

### Before: REST Monolith
- 10 endpoints with hardcoded logic
- Every frontend component knows a specific URL
- Adding a tool = adding a route + controller + documentation

### After: MCP Architecture
- 70 tools via BaseToolHandler
- AI selects tools by description on its own
- Adding a tool = adding a handler class + one-line registration

## The Key Mindset Shift

REST: you design an API for a *developer* who will write code.

MCP: you design an API for *AI* that will decide on its own when and what to call.

This changes everything — from naming to descriptions, from parameter structure to error format. AI needs clear descriptions, cost hints, examples — things that in REST live in documentation, but in MCP live right in the schema.

MCP is not a silver bullet. But for AI-first products, it is the best standard that exists today.`,
  },
  'diia-digital-identity': {
    title: 'Authentication via Diia: How We Integrated National Digital Identity into a Legal Platform',
    punchline: 'A passport on your smartphone — now the key to legal AI. We integrated Diia.Signature for authentication: deep link on mobile, QR code on desktop, ECDSA + SHA256 for hashing, and lawyers verify their identity with the same app they use to show documents at checkpoints. No passwords. No registration. One tap — and you are in.',
    readTime: '7 min',
    content: `# Authentication via Diia: How We Integrated National Digital Identity

*A passport on your smartphone — now the key to legal AI.*

---

## Why Diia, Not Yet Another OAuth

A legal platform works with confidential data. Google OAuth confirms you have a Gmail account. Diia confirms that you are you. The difference is fundamental: Diia is tied to a real document — a passport, ID card, or qualified electronic signature.

For a legal platform where attorney-client privilege and party identification are not optional but required by law, this is the only appropriate level of verification.

## Architecture: Two Flows

### Mobile (Deep Link)

1. User taps "Sign in with Diia"
2. Backend generates \`requestId\` (ECDSA + SHA256, base64)
3. Deep link \`diia://\` opens with session parameters
4. Diia app shows an authorization request
5. User confirms → Diia sends a callback with data
6. Backend verifies the signature, creates a JWT session

### Desktop (QR Code)

1. Backend requests a session from Diia API (\`api2s.diia.gov.ua\`)
2. Receives a deep link → converts to QR code
3. User scans QR with the Diia app on their phone
4. From there — the same flow: confirmation → callback → JWT

## Cryptography: Why ECDSA

The Diia API requires hashing \`requestId\` via ECDSA with SHA256. Not HMAC, not RSA — specifically ECDSA. This is the electronic signature standard in Ukraine (DSTU 4145), and Diia follows it.

\`\`\`
requestId = base64(ECDSA_SHA256(branchId + offerId + requestId))
\`\`\`

Every request is unique. Every signature is verified. Replay attacks are impossible.

## What We Get from Diia

After successful authentication:

| Field | Description |
|-------|-------------|
| Full name | Last name, first name, patronymic |
| Date of birth | From the document |
| Tax ID (IPN) | Individual tax number |
| Document series/number | Passport or ID card |
| Photo | From the document (optional) |

This is sufficient for full identification on a legal platform — and for future ERAU integration (attorney verification by tax ID).

## Security

- **Data is not stored on Diia's side** — after the callback is delivered, the session is destroyed
- **Session token is single-use** — reuse is impossible
- **JWT with short TTL** — 24 hours, refresh via re-authentication
- **Basic Auth for API** — backend ↔ Diia communication is protected by separate credentials

## UX: One Tap Instead of a Form

On mobile:
- Tap "Sign in with Diia" → the app opens → confirm → return to LEX AI authenticated

On desktop:
- See a QR code → point your camera → confirm in the app → the page auto-refreshes

No passwords. No registration forms. No "confirm your email." The same app you use to show your ID at a checkpoint — is now your key to legal AI.

## Three Authentication Methods

LEX AI now supports three independent sign-in methods:

| Method | Trust Level | Best For |
|--------|------------|----------|
| **Google OAuth** | Basic | Quick start, exploration |
| **Authentik SSO** | Corporate | Law firms, organizations |
| **Diia** | Government | Full identification, attorneys |

The lawyer chooses their level. The platform adapts.

---

## Production Post-Mortem: Redis + Nginx

After deploying to production behind the AWS Application Load Balancer, authentication via Diia stopped working. Completely. Users tapped "Sign in with Diia" — and got an error.

The root causes turned out to be two, and both were infrastructure-related.

**First: Redis key mismatch.** During Diia session initiation we stored the state with one prefix, but during the callback we read with a different one. Redis silently returned \`null\`, the backend considered the session invalid and rejected the callback. The fix was unifying key prefixes in one place.

**Second: Nginx was overwriting X-Forwarded-Proto.** The ALB correctly passed \`https\`, but Nginx in its configuration forcefully set \`http\`. The callback URL was formed with the HTTP scheme, Diia rejected it as non-matching the registered redirect URI. The solution — Nginx now passes through the original header from the load balancer instead of substituting its own.

Both issues were not reproducible locally, because the dev environment has no ALB and Redis prefixes matched by accident. A reminder: staging should match production as closely as possible.`,
  },
  'mcp-connect-open-data': {
    title: 'MCP Connect: How We Connected Nextcloud, Google Drive, and 1,400+ Open Datasets to Legal AI',
    punchline: 'A lawyer stores contracts in Nextcloud, correspondence in Google Drive, and searches court practice in EDRSR. Three different systems, three different windows, zero connection between them. MCP Connect unifies everything in one interface: AI analyzes your contract from Nextcloud, finds relevant practice from EDRSR, and verifies the counterparty in registries — in a single request.',
    readTime: '6 min',
    content: `# MCP Connect: Nextcloud, Google Drive, and 1,400+ Open Datasets in One Interface

*Your documents. Your clouds. One AI that sees everything.*

---

## The Problem: Documents Everywhere, Connection Nowhere

A typical day for a lawyer:

- Contract — in Nextcloud (or a corporate server)
- Client correspondence — in Google Drive
- Court practice — in EDRSR
- Registries — on 4 different websites
- Legislation — on the Rada website

5 systems. 5 windows. Copy-paste between them. And none of them knows the others exist.

## MCP Connect: One Page — All Sources

The new MCP Connect page lets you connect external storage to LEX AI:

### Nextcloud

Your self-hosted Nextcloud becomes part of the platform:

- **Authorization** via OAuth or app password
- **Navigation** through folders right in the LEX AI interface
- **Document analysis** — AI reads files from Nextcloud without uploading to our server
- **Search** across document contents via MCP tools

A law firm keeps all documents on their own server. LEX AI connects to it, analyzes a contract, identifies risks, and immediately searches for relevant practice — all in one window.

### Google Drive

For those using Google Workspace:

- Connection via standard Google OAuth
- Access to documents, spreadsheets, PDFs
- The same AI analysis as for local files

## 1,400+ Open Datasets

Alongside MCP Connect, we added an open data catalog — pages describing all available sources:

### Ukraine (ua.legal.org.ua/ua/data-sources)

| Category | Datasets | Examples |
|----------|---------|---------|
| **Judiciary** | 814 | Court decisions registry, hearing schedules, statistics |
| **Verkhovna Rada** | 633 | Bills, voting records, transcripts |
| **Healthcare** | 12 | NHSU registries, licenses |
| **Transport** | Catalog | Vehicle registry |
| **data.gov.ua** | 4 categories | Full open data catalog |

### EU and World

- **5 EU countries** — United Kingdom, Germany, France, Netherlands, Estonia
- **Comparison table** — eu.legal.org.ua/eu/comparison
- **USA** — usa.legal.org.ua/us/data-sources

## What This Gives a Lawyer

### Scenario 1: Contract Analysis with Context

1. AI reads the contract from your Nextcloud
2. Identifies problematic clauses
3. Searches for court practice on each risk
4. Verifies the counterparty in registries
5. Delivers a report with references to real cases

Previously, this required 4 different systems and 2 hours of work. Now — one request.

### Scenario 2: Comparative Analysis

A client plans to enter the EU market. You need to compare the regulatory environment. The open data pages give direct access to official sources from 5 EU countries — with descriptions of what is available and where to look.

### Scenario 3: ARMA and Seized Assets

A new dataset — the ARMA registry (Asset Recovery and Management Agency). Seized assets, confiscated property, assets placed under management. For attorneys handling criminal cases and sanctions matters — a critical source.

## Architecture: Your Data Stays Yours

Key principle: LEX AI does not copy your files. The Nextcloud integration works via API — the file is read on the fly, analyzed, and the result is displayed. The original stays on your server.

For law firms, this is fundamental: clients' confidential documents never leave the corporate infrastructure.

## PWA: LEX AI as an App

Bonus: LEX AI can now be installed as an app on your phone or computer. Chrome will show an "Install" button — and the platform will work as a native app with a desktop icon. Offline access to downloaded documents and instant launch without a browser.

Your documents. Your clouds. Your registries. One AI that unifies everything.`,
  },
  'ai-wont-replace-lawyers': {
    title: 'AI Will Not Replace Lawyers — But a Lawyer with AI Will Replace One Without',
    punchline: 'AI will not replace lawyers. But the lawyer across the street who uses AI? That is your real competition. Their practice analysis covers 300 cases instead of 30. Their due diligence checks 16 registries in 2 seconds. They are not billing fewer hours — they are billing the same hours for a dramatically better outcome.',
    readTime: '9 min',
    content: `# AI Will Not Replace Lawyers — But a Lawyer with AI Will Replace One Without

*What it actually looks like when a legal AI platform processes a real case analysis.*

---

## The Headline Everyone Misunderstands

Every week a new article appears: "AI will replace 40% of lawyers." "ChatGPT passed the bar exam." Here is what none of these articles mention: ChatGPT does not know your jurisdiction, has no access to your court's practice, and confidently fabricates case numbers that do not exist.

AI does not replace legal reasoning. It replaces the 6 hours of manual research that precede legal reasoning.

## Without AI vs. With AI

### Without AI: 4-8 Hours

Open the court decisions registry, try 10-15 keyword combinations, review 30-40 decisions, manually check court instances, separately search the Supreme Court, read legislation, cross-check precedents.

### With AI: 2-3 Minutes

One question → system classifies → generates a 6-step plan → executes each step (lawyer watches in real time) → synthesizes a response with comparison tables, analysis of overturned decisions, strategic recommendation. The right panel fills with 150+ case cards and article texts.

## Three Evidence Panels

**"Decisions"** — each court decision with a number (clickable), court, date, precedent status.

**"Provisions"** — full text of every legislation article. Not AI interpretation — the actual text from the official Verkhovna Rada database.

**"Documents"** — company cards from registries, bills, vault documents.

## What AI Does Well

### 1. Exhaustive Search
5-10 separate searches with different formulations, 200-300 cases. A lawyer searches until they find enough. AI searches until it finds everything.

### 2. Precedent Validation
Every case — with a status: valid, limited, overruled, questioned. The system tracks chains through all court instances.

### 3. Due Diligence in Seconds
"Check LLC Nova Poshta, EDRPOU 31316518" → 2 seconds → full profile, beneficiaries, enforcement proceedings, debtors registry.

### 4. Up-to-Date Legislation
12 codes, 5,191 articles from the Rada API. If an article was amended last week — the system has the new version.

## What AI Does NOT Do

- **Does not make strategic decisions** — does not know the client's circumstances, risk profile, business goals
- **Does not draft final documents** — a template yes, a final filing no
- **Does not replace experience** — will not sense a shift in Supreme Court position before it becomes obvious

## The Real Competitive Threat

The threat is not AI. It is the lawyer across the street who uses AI. Their analysis — 300 cases instead of 30. Their due diligence — 16 registries instead of 3. Their references are current as of today.

The gap between lawyers who embrace this and those who don't — is only growing.`,
  },
  'semantic-vs-keyword-search': {
    title: 'Searching Court Decisions by Meaning, Not by Keywords',
    punchline: 'You search for "compensation for apartment flooding" and miss the case where the court writes about "tortious liability for property damage resulting from engineering infrastructure failure." Keywords find words. Semantic search finds meaning.',
    readTime: '5 min',
    content: `# Searching Court Decisions by Meaning, Not by Keywords

*Keywords find words. Semantic search finds meaning.*

---

## Why the Court Decisions Registry Is Not Enough

The Unified State Register of Court Decisions (EDRSR) is an invaluable resource. But its search works on keywords. This means:

- You must *already know* how the court phrases what you are looking for
- Different courts describe the same situation using different words
- Synonyms, paraphrases, legal terms — all missed

**Example:** You search for "apartment flooding." Case 753/12847/21, where the court writes about "tortious liability for property damage resulting from engineering infrastructure failure" — will not be found. Not a single word in common.

## How Semantic Search Works

Instead of comparing characters, the system compares *meaning*:

1. Your query is converted into a mathematical vector (embedding)
2. Every decision in the database already has its own vector
3. The system finds decisions that are *similar in meaning*, even when the words are completely different

## Practical Examples

| Your Query | Keyword Search | Semantic Search |
|-----------|---------------|-----------------|
| "apartment flooding" | Decisions with the word "flooding" | + "tortious liability for property damage" |
| "eviction from mortgaged apartment" | Decisions with "eviction" + "mortgage" | + "foreclosure on pledged property" |
| "rent debt" | Decisions with "rent" + "debt" | + "recovery of rental payments", "tenant arrears" |

## What This Means for Practice

**Research completeness.** You find relevant practice you would never have found with keywords. Not 30 decisions — but 200-300, including those where the court used different terminology.

**Speed.** Instead of 10-15 keyword combinations — one natural-language query. The system finds all phrasing variations itself.

**Non-obvious connections.** Semantic search can find decisions from adjacent practice areas where the court applied an analogous legal approach. You would never have searched for it — but it is exactly what you need.

Keyword search answers the question "where are these words?" Semantic search answers "where was this kind of problem resolved?"`,
  },
  'ai-analyzes-millions': {
    title: 'How AI Analyzes Millions of Court Decisions — and What It Means for Your Practice',
    punchline: 'A human reviews 30-40 decisions per session. AI processes 200-300 per minute. But it is not about speed — it is about completeness. When you see the full picture rather than a fragment, strategic decisions become qualitatively different.',
    readTime: '6 min',
    content: `# How AI Analyzes Millions of Court Decisions in Seconds

*It is not about speed. It is about completeness.*

---

## A Scale Impossible to Achieve Manually

The EDRSR contains millions of court decisions. A human can physically review 30-40 per work session. Even an experienced lawyer who works with case law daily covers only a microscopic fraction.

AI is not just faster — it works differently. A single query triggers 5-10 parallel searches with different formulations, collects 200-300 cases, classifies them, checks precedent statuses, builds a chronology.

## What Completeness Provides

### Trend Discovery

When you see 30 decisions — it is a sample. When you see 300 — it is statistics.

- "73% of negatory claims are granted in commercial courts, but only 58% in civil courts"
- "The Grand Chamber of the Supreme Court changed its position on land disputes in 2024 — lower courts followed within 4 months"
- "The Commercial Cassation Court grants claims for recovery of damages from a contractor 2.3x more often when an expert report is present"

### Detecting Practice Shifts

The Supreme Court rarely announces: "we have changed our position." Instead, a decision appears with different reasoning. Then another. Six months later, lower courts start following.

AI sees this shift the moment it happens — because it analyzes the entire chronology, not a sample.

### Comparing Court Instances

The \`compare_practice_pro_contra\` tool provides two lines of practice in parallel:
- Cases where the court granted an analogous claim
- Cases where it denied

With specific reasons for each decision. You see exactly what distinguishes successful cases from unsuccessful ones.

## Practical Example

**Query:** "Practice of recovering 3% annual interest and inflation adjustments under Article 625 of the Civil Code"

**AI in 2 minutes:**
- 247 relevant decisions
- Satisfaction rate: 89% fully, 8% partially, 3% denied
- Main reasons for partial satisfaction: incorrect calculation period, missed limitation periods
- Timeline of changes in the Supreme Court's approach to calculating inflation adjustments
- 5 key Grand Chamber rulings with analysis

**A lawyer manually:** the same results — 2-3 working days.

## This Is Not Replacement — It Is Augmentation

AI does not decide which strategy to choose. It gives the lawyer the full picture on which to base their decision. The difference between a decision based on 30 cases and 300 is the difference between intuition and an evidence-based strategy.`,
  },
  'due-diligence-ai': {
    title: 'Due Diligence with AI: From Registries to Beneficiaries in a Single Request',
    punchline: 'Counterparty verification: 4 registry websites, 30 minutes of manual work, and you can still miss enforcement proceedings. Or: one request, 2 seconds, 18 registries, full picture — EDRPOU, founders, beneficiaries, debtors, enforcement proceedings, bankruptcy, NBU banks.',
    readTime: '5 min',
    content: `# Due Diligence with AI: From Registries to Beneficiaries in a Single Request

*One request. 2 seconds. 16 registries. Full picture.*

---

## What Counterparty Verification Looks Like Today

A client asks you to verify a potential partner before signing a contract. You:

1. Open opendatabot.ua — search by EDRPOU
2. Go to court.gov.ua — check court cases
3. Visit asvp.minjust.gov.ua — enforcement proceedings registry
4. Open bankrut.minjust.gov.ua — check bankruptcy
5. Return to opendatabot — look at beneficiaries
6. Prepare a memo for the client

**Time: 30-60 minutes.** And that is if you found everything on the first try.

## How It Works with AI

**Query:** "Check LLC Nova Poshta, EDRPOU 31316518 — any proceedings and who are the beneficiaries"

**In 2 seconds:**

- **Full company profile:** name, status, registration date, charter capital
- **Founders** with ownership percentages
- **Ultimate beneficial owners (UBOs)** with influence type — direct or indirect
- **Director** and management bodies
- **Enforcement proceedings** — active, completed
- **Debtors registry** — listed or not
- **Bankruptcy cases** — status
- **Total court cases** — as plaintiff and defendant

## 16 Registries in One Interface

| Registry | What Is Checked |
|----------|----------------|
| Unified State Register (EDR) | Registration, status, charter capital |
| Beneficiary registry | UBOs with influence type |
| Debtors registry | Listed or not |
| Enforcement proceedings | Active recoveries |
| Bankruptcy cases | Insolvency proceedings |
| Notary registry | Notary verification |
| Forensic experts registry | Expert verification |
| Insolvency practitioners registry | Practitioner verification |
| Court cases | Total count and details |

## Use Cases

- **Before signing a contract** — basic counterparty verification
- **M&A due diligence** — full analysis of the target company
- **Before filing a lawsuit** — assessing the defendant's solvency
- **Compliance** — regular counterparty checks
- **Anti-corruption checks** — tracing beneficial ownership chains

## Update: New Registries (March 2026)

In March 2026, we connected two more critically important sources for counterparty verification.

**Unified Debtors Registry (ERB)** — a state registry containing information about individuals and companies with outstanding debts from enforcement proceedings. The system now automatically checks whether your potential partner has debts, seized assets, or active enforcement proceedings. This is one of the first signals of financial unreliability, which previously had to be searched manually on the Ministry of Justice website.

**NBU Bank Registry** — the official list of banking institutions from the National Bank of Ukraine. The system checks the bank's license status, solvency, and whether a liquidation process is underway. If a counterparty is serviced by a bank undergoing market withdrawal, you learn about it immediately — not after the funds have already been transferred.

18 registries. 30 minutes of manual work → 2 seconds. And a guarantee that nothing is missed.`,
  },
  'data-privacy-ai': {
    title: 'Confidentiality and AI: How We Protect Client Data on a Legal Platform',
    punchline: 'Lawyers cannot use ChatGPT for client matters — data ends up on OpenAI servers. We built a platform where every matter is isolated, every action is in an audit trail, legal holds block deletion, and GDPR is not a checkbox — it is architecture.',
    readTime: '6 min',
    content: `# Confidentiality and AI: How We Protect Client Data on a Legal Platform

*Lawyers cannot use ChatGPT for client matters. We built a platform where they can.*

---

## The Problem: AI and Attorney-Client Privilege

A lawyer wants to use AI for case analysis. But:

- Uploading documents to ChatGPT = transferring data to a third party
- OpenAI may use data for model training
- No control over where data is physically stored
- Impossible to recall or delete transmitted data
- Violation of attorney-client privilege (Art. 22 of the Law "On the Bar")

The result: lawyers either do not use AI, or use it at risk.

## Our Protection Architecture

### 1. Matter Segregation

Every matter is a separate container:
- Documents from matter A are inaccessible when working on matter B
- Search is limited to documents of the current matter
- Even the AI assistant sees only documents of the active matter

### 2. Audit Trail with Hash Chain

Every action is recorded:
- Who viewed a document
- Who uploaded / deleted / modified
- Who searched and what was found
- Each record is secured by the hash of the previous one — tampering with the chain is impossible

### 3. Legal Holds

When a matter is under legal hold:
- No document can be deleted
- Even an admin cannot bypass the restriction
- SQL function \`can_delete_document()\` checks holds before every deletion
- A hold is lifted only by an explicit action of an authorized person

### 4. GDPR as Architecture

- **Right to erasure** — complete deletion of personal data from all systems
- **Right to portability** — data export in a structured format
- **Privacy by design** — protection is built into the architecture, not bolted on
- **Data minimization** — we store only what is necessary

### 5. Infrastructure Protection

- AWS EU (Frankfurt) — data within the EU
- Encryption at rest and in transit
- IAM roles instead of API keys where possible
- Vault for secrets
- Regular security audits

## What This Means for a Lawyer

You can upload a client's contract, ask AI to analyze risks, find relevant practice — and be confident that:

1. Client data does not leave your infrastructure
2. Other users cannot see your documents
3. Every action is recorded for audit
4. Documents under legal hold are protected from deletion
5. The client can request deletion of their data at any time

Confidentiality is not a feature. It is a prerequisite for any legal AI platform to exist.`,
  },
  'gcp-cloud-scaling': {
    title: 'From a Single Server to the Cloud: How We Scale legal.org.ua on Google Cloud',
    punchline: 'Cloud Run with autoscaling to zero. Cloud SQL with automatic backups. Qdrant on a dedicated VM. All infrastructure at $280-430/mo with the ability to scale from 10 to 10,000 users without architecture changes.',
    readTime: '11 min',
    content: `# From a Single Server to the Cloud: How We Scale legal.org.ua on Google Cloud

*How we migrated a legal AI platform from Docker Compose on a single server to full-fledged cloud infrastructure with automatic scaling.*

---

## Why Migration Became Necessary

legal.org.ua is a platform for lawyers with AI analysis of court decisions, semantic search across legislation, and registries. Under the hood — 3 microservices, PostgreSQL, Redis, Qdrant (vector DB), MinIO, and a React frontend.

The initial infrastructure was a single VPS with Docker Compose. It worked for the MVP but created risks:

| Problem | Consequence |
|---------|------------|
| Single server | Server goes down = total downtime |
| Fixed resources | Cannot scale under load |
| Manual deploys | SSH → git pull → docker compose up |
| Manual backups | Risk of data loss |

We needed infrastructure that scales automatically, has automatic backups, and costs reasonable money for a startup.

## Choosing a Cloud: Why Google Cloud

We considered AWS, GCP, and Hetzner Cloud. We chose GCP for several reasons:

**Cloud Run** — the main argument. Serverless containers with pay-per-use pricing and the ability to scale to zero. For a legal platform with daytime traffic (lawyers work 9 to 6), this means we pay almost nothing at night and on weekends.

**Cloud SQL** — managed PostgreSQL with automatic backups, point-in-time recovery, and one-click vertical scaling.

**Region \`europe-west1\` (Belgium)** — closest to Ukraine with the best pricing among European GCP regions.

## Architecture: Hybrid Approach

The key decision — **not everything in serverless**. We split services by nature:

\`\`\`
              Cloudflare (DNS + CDN + WAF)
                        |
              Cloud Load Balancer (HTTPS)
             +----------+----------+
        Cloud Run    Cloud Run    Cloud Run
      (mcp_backend) (mcp_rada) (openreyestr)
             +----------+----------+
        +-------+-------+-------+--------+
     Cloud SQL  Memorystore   GCE VM    GCS
     (PG 15)    (Redis 7)   (Qdrant) (files)
\`\`\`

### Stateless Services → Cloud Run

Our 4 backend services do not maintain state between requests — ideal candidates for Cloud Run:

| Service | What It Does | CPU | RAM | Autoscaling |
|---------|-------------|-----|-----|-------------|
| \`mcp-backend\` | Court decisions, AI chat, 36 tools | 2 vCPU | 4 GiB | 1 → 4 instances |
| \`mcp-rada\` | Deputies, bills, voting | 1 vCPU | 1 GiB | 0 → 2 instances |
| \`mcp-openreyestr\` | State register, beneficiaries | 1 vCPU | 1 GiB | 0 → 2 instances |
| \`document-service\` | Document processing | 2 vCPU | 4 GiB | 0 → 3 instances |

Note the **min instances**: the main backend always has at least 1 instance (cold start is unacceptable for AI chat with SSE streaming), while auxiliary services scale to zero when nobody is using them.

### Stateful Services → Managed or VM

- **PostgreSQL** → Cloud SQL (managed, automatic backups, point-in-time recovery)
- **Redis** → Memorystore (managed, sub-millisecond latency)
- **Qdrant** → GCE VM (no managed option, needs persistent storage)
- **MinIO** → GCS (Google Cloud Storage with S3-compatible API)

## Networking: Security by Default

All infrastructure lives in a private VPC network. No service has a public IP except the Load Balancer.

\`\`\`
VPC: secondlayer-vpc
+-- services-subnet   10.0.0.0/20    (Cloud Run VPC Connector)
+-- data-subnet       10.0.16.0/20   (Cloud SQL, Qdrant VM)
+-- VPC Connector     10.8.0.0/28    (Cloud Run → private network)
\`\`\`

**Cloud NAT** provides outbound internet for VMs without public IPs. **IAP (Identity-Aware Proxy)** — SSH access to VMs via Google authentication instead of an open port 22.

Firewall rules are simple: only internal traffic between subnets, SSH via IAP, and health checks from Google Load Balancer are allowed.

## Cloud SQL: Two Instances

We deliberately split PostgreSQL into two instances:

**\`secondlayer-main\`** (db-custom-2-8192) — main backend and parliament data:
- Database \`secondlayer_prod\`: court decisions, documents, AI analytics, users
- Database \`rada_prod\`: deputies, bills, voting

**\`openreyestr-db\`** (db-custom-1-4096) — State Register of legal entities:
- Pre-imported database with millions of records
- Read-heavy workload, rarely written
- Separate instance prevents lock contention with the main database

Both instances have:
- Private IP only (not accessible from the internet)
- Automatic nightly backups at 3:00
- Point-in-time recovery
- \`max_connections=500\` (sufficient for Cloud Run with connection pooling)

## Qdrant on a Dedicated VM

Qdrant is the vector database for semantic search. GCP has no managed option, so we deployed it on a separate VM:

- **e2-standard-4** (4 vCPU, 16 GiB RAM) — sufficient for millions of vectors
- **100 GB persistent disk** (pd-balanced) — data survives VM deletion
- **Docker container** with \`--restart=always\`

Persistent disk is the key detail. Even if the VM crashes or needs an upgrade, data stays on the disk. We can change the VM type in 5 minutes without losing indexes.

## GCS Instead of MinIO: Zero Code Changes

One of the most elegant decisions: **Google Cloud Storage has an S3-compatible API**. Our code uses the AWS S3 SDK to work with MinIO. For migration, we only changed the endpoint:

\`\`\`
# Before (MinIO)
MINIO_ENDPOINT=minio-stage
MINIO_PORT=9000

# After (GCS)
MINIO_ENDPOINT=storage.googleapis.com
MINIO_PORT=443
MINIO_USE_SSL=true
\`\`\`

Not a single line of code was changed. The same upload pipeline, the same presigned URLs, the same logic.

## Secrets: Secret Manager Instead of .env Files

On the VPS, secrets lived in \`.env\` files. It works, but:
- The file could end up in git
- No audit of who accessed what when
- Key rotation = manual update on the server

GCP Secret Manager solves all three problems. Every secret has versions, access auditing, and integrates directly with Cloud Run via \`--set-secrets\`.

We created 12 secrets: OpenAI API keys, ZakonOnline tokens, JWT secret, database passwords, and others.

## Cost: $280 to $430/mo

Full breakdown:

| Component | Specification | $/mo |
|-----------|--------------|------|
| Cloud Run (4 services) | Autoscaling | $76 |
| Cloud SQL (2 instances) | PG 15, SSD, auto backups | $150 |
| Memorystore Redis | 2 GiB, Basic | $50 |
| GCE VM (Qdrant) | e2-standard-4, 100 GB disk | $105 |
| GCS + CDN | ~50 GB of files | $8 |
| Networking (LB, NAT, VPC) | | $33 |
| Artifact Registry | Docker images | $3 |
| **Total** | | **~$430** |

### Optimization to $280/mo

1. **Consolidate Cloud SQL** — openreyestr as a separate database in the main instance: **-$55**
2. **1-year commitment** on Cloud SQL: **-$37**
3. **Spot VM** for Qdrant (if restart is acceptable): **-$60**

## Scaling Strategy

### Horizontal (Automatic)

Cloud Run scales automatically by concurrency. When load increases — instances are added. When it drops — excess instances are shut down.

\`\`\`
08:00  mcp-backend: 1 instance  (quiet morning)
10:00  mcp-backend: 2 instances (workday)
14:00  mcp-backend: 4 instances (peak activity)
22:00  mcp-backend: 1 instance  (evening)
02:00  mcp-rada: 0 instances    (nobody searches for deputies at night)
\`\`\`

### Vertical (Manual, As Needed)

| Trigger | Action |
|---------|--------|
| Cloud SQL CPU > 80% | Upgrade to db-custom-4-16384 |
| Redis > 85% RAM | Resize to 4 GiB |
| Qdrant VM > 80% RAM | Upgrade to e2-standard-8 |

### What Changes as You Grow

**10 → 100 users**: current architecture handles it without changes.

**100 → 1,000 users**: add Cloud SQL read replica ($95/mo), increase Cloud Run max instances to 8.

**1,000+ users**: migrate to GKE Autopilot for more granular control, Qdrant cluster (3 nodes), Cloud SQL HA.

## Frontend: GCS + Cloud CDN

React SPA (Vite build) is just static files. Instead of a Cloud Run container, we host them on GCS with Cloud CDN:

- Cost: ~$1/mo (instead of ~$15 for a Cloud Run container)
- Latency: files served from the nearest edge to the user
- Cache hit ratio: >95% for JS/CSS bundles

## Cloudflare Stays

We did not replace Cloudflare with GCP Cloud Armor. Cloudflare remains the first layer of protection:

- **Free WAF** — protection from SQL injection, XSS
- **DDoS protection** — automatic attack absorption
- **Edge caching** — static assets served from the Kyiv PoP
- **Origin CA** — SSL certificate already configured

Cloudflare DNS A-record points to the Google Cloud Load Balancer IP. Traffic: user → Cloudflare edge → GCP LB → Cloud Run.

## CI/CD: Automated Deployment

GitHub Actions workflow on merge to main:

1. Build \`packages/shared\` (shared types)
2. In parallel: build 4 Docker images → push to Artifact Registry
3. Deploy each service to Cloud Run
4. \`gsutil rsync\` the frontend to GCS

Rollback is one command: Cloud Run lets you switch traffic to a previous revision in seconds.

## What Is Next

This architecture is the foundation we build on. Next steps:

1. **Cloud Scheduler** — automatically reduce min-instances at night
2. **Cloud SQL Insights** — slow query monitoring
3. **Prometheus + Grafana** on the Qdrant VM — custom metrics
4. **Workload Identity Federation** — GitHub Actions without service account keys

The goal — infrastructure that scales with the product, rather than becoming its limitation.

---

*If you are building a legal or any other SaaS on microservices — Cloud Run + Cloud SQL is an excellent start. You pay for what you actually use, not for idle servers.*`,
  },
  'edrsr-fulltext-pipeline': {
    title: 'EDRSR: Data Pipeline for 60 Million Court Decisions',
    punchline: '60 million full texts. 283 GB across 4 shards. Custom RTF parser with depth-tracking for Windows-1251 Cyrillic. Two-phase ETL with idempotent upsert via temp tables. Application-level sharding by doc_id with independent backup domains. PostgreSQL shared memory exhaustion and three layers of defense. All on open government data.',
    readTime: '15 min',
    content: `# EDRSR: Data Pipeline for 60 Million Court Decisions

*Architecture of an ETL system that transfers the entire Unified State Register of Court Decisions into a 4-shard PostgreSQL infrastructure -- from data modeling and RTF parsing to capacity planning and operational trade-offs.*

---

## Problem Context

LEX AI is a semantic search platform for court practice. The search core relies on vector embeddings (text-embedding-ada-002, 1536 dim) generated from full decision texts. No text means no embeddings; no embeddings means no semantic search.

EDRSR (Unified State Register of Court Decisions) contains ~60M documents from 685 courts across all instances, from 2006 to present. Full texts are stored in RTF format with Windows-1251 encoding.

**Scale:**

| Parameter | Value |
|-----------|-------|
| Documents in registry | ~60,000,000 |
| Average RTF size | ~4.5 KB |
| Average plaintext size | ~2.3 KB |
| Total text volume | 283 GB (PostgreSQL) |
| Source courts | 685 |
| Time range | 2006--2026 |

## A Principled Decision: Open Data Only

We deliberately chose to work exclusively with open sources. The portal reyestr.court.gov.ua publishes court decisions in open access -- this is public information under Ukrainian law on access to public information.

The reason is not just ethical. Commercial APIs carry operational risks: rate limits, token blocking during bulk downloads, third-party dependency. A specific incident: bulk downloading court_sessions (~35K requests in 2.7 hours) got both ZakonOnline API tokens blocked, taking down the production chat.

| Source | What We Get | Access Model |
|--------|------------|--------------|
| **reyestr.court.gov.ua** | Full texts in RTF | HTTP GET, rate-limited, free |
| **data.gov.ua** | Metadata (CSV dumps) | Bulk download, updated daily |
| **Commercial APIs** | Same + JSON | REST API, paid, tokens get blocked |

## Data Model

Before discussing the pipeline, it is worth understanding the target schema. We separated metadata and full texts into two distinct tables -- this is a key architectural decision.

### Metadata: edrsr_documents

\`\`\`sql
CREATE TABLE edrsr_documents (
  doc_id       BIGINT PRIMARY KEY,   -- PK from EDRSR, auto-increment
  court_code   INTEGER,              -- FK to edrsr_courts (no constraint)
  judgment_code SMALLINT,            -- decision type (verdict, ruling, resolution)
  justice_kind SMALLINT,             -- type of proceedings
  category_code INTEGER,             -- case category (4,106 categories)
  cause_num    TEXT,                  -- case number
  adjudication_date TIMESTAMPTZ,     -- date of decision
  receipt_date TIMESTAMPTZ,          -- date received by registry
  judge        TEXT,                  -- judge/panel
  doc_url      TEXT,                  -- RTF URL in registry
  status       SMALLINT DEFAULT 0,
  date_publ    TIMESTAMPTZ
);
\`\`\`

**Deliberate absence of FK constraints.** Source data from data.gov.ua contains court_code, justice_kind, category_code values not always present in reference tables. With FK constraints, import breaks on every "dirty" row. Without them -- we import everything and validate at the query level.

**Why \`doc_id BIGINT\`, not \`UUID\`?** doc_id is a natural key from EDRSR (auto-increment). It grows monotonically, yielding an ideal B-tree with minimal fragmentation during sequential import. UUID would cause random inserts across the entire index -- at 60M rows this is a significant I/O difference.

**8 indexes** on common query patterns: court_code, justice_kind, judgment_code, category_code, cause_num, judge, adjudication_date, receipt_date. Each justified by a real use case (filter by court, by proceedings type, search by case number).

### Full Texts: edrsr_fulltext

\`\`\`sql
CREATE TABLE edrsr_fulltext (
  doc_id      BIGINT PRIMARY KEY,  -- join key to edrsr_documents
  full_text   TEXT,                -- plaintext after RTF conversion
  text_length INTEGER,             -- pre-computed for filtering
  created_at  TIMESTAMP DEFAULT NOW()
);
\`\`\`

**Why a separate table, not a column in edrsr_documents?** Three reasons:

1. **TOAST segmentation.** PostgreSQL stores TEXT > 2 KB in separate TOAST pages. If full_text lives in the same table as metadata, then \`SELECT court_code, cause_num FROM edrsr_documents\` will still touch TOAST pages during sequential scan. Separate table = clean sequential scan on metadata without overhead.

2. **Different lifecycles.** Metadata is imported from data.gov.ua CSV dumps (daily updates). Full texts are downloaded from reyestr.court.gov.ua (one-time bulk + incremental). Different sources, different scripts, different frequencies.

3. **Independent sharding.** Full texts occupy 283 GB vs ~12 GB for metadata. Only texts need sharding; metadata stays in one database.

### Reference Tables

5 reference tables: courts (685), instances (3), regions (27), justice_kinds (5), judgment_forms (10+), cause_categories (4,106). Imported once, rarely updated.

## Pipeline Architecture

The pipeline is implemented as 4 independent Python scripts. Each is idempotent -- can be restarted without data loss or duplicates.

\`\`\`
┌─────────────────────┐    ┌──────────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│  1. Download RTF    │    │  2. Import from HDD  │    │  3. Monitor      │    │  4. Copy to Prod     │
│                     │    │                      │    │                  │    │                      │
│  asyncio + aiohttp  │───▶│  multiprocessing     │───▶│  PG aggregate    │───▶│  2-phase ETL         │
│  100 workers        │    │  12 CPU workers      │    │  + in-mem cache  │    │  200 psql workers    │
│  3 retries + backoff│    │  COPY FROM STDIN     │    │  cross-env stats │    │  TSV chunks on NVMe  │
│                     │    │  ON CONFLICT NOTHING  │    │                  │    │  ON CONFLICT NOTHING  │
│  reyestr.court.gov  │    │  HDD → PG local      │    │  local/stage/prod│    │  PG local → PG prod  │
│  → /tmp/edrsr-rtf/  │    │  18 TB /dev/sda1     │    │                  │    │  per-shard routing   │
└─────────────────────┘    └──────────────────────┘    └──────────────────┘    └──────────────────────┘
\`\`\`

### Stage 1: RTF Download

**I/O model:** async HTTP GET → disk write. Network-bound task, hence \`asyncio\` + \`aiohttp\` with \`TCPConnector(limit=100, limit_per_host=100)\`.

\`\`\`python
semaphore = asyncio.Semaphore(100)  # 100 concurrent downloads
# Retry: 3 attempts, exponential backoff (2s, 4s, 6s)
# 429 handling: sleep 5 * (attempt + 1) seconds
\`\`\`

**Resumability.** Before downloading, we check \`outpath.exists() and outpath.stat().st_size > 0\`. If the file already exists and is non-empty -- skip. This allows restarting the script without re-downloading.

**File convention:** \`{doc_id}.rtf\` -- doc_id is the filename. This gives O(1) lookup without a metadata database: \`int(filename[:-4])\` → doc_id.

### RTF Parser: Why Custom

RTF from EDRSR is not ordinary RTF. It is Windows-1251 Cyrillic encoded as \`\\\\'XX\` escape sequences inside a latin1 wrapper. Standard libraries (\`striprtf\`, \`pyrtf-ng\`) do not distinguish Windows-1251 from latin1 bytes and break Cyrillic.

Our parser works in 7 steps:

\`\`\`
1. raw bytes → latin1 decode (RTF envelope)
2. Remove nested groups: {\\fonttbl ...}, {\\colortbl ...},
   {\\stylesheet ...}, {\\info ...}, {\\*\\ ...}
   (depth-tracking brace parser, O(n))
3. Strip \\rtf1 header
4. \\par → \\n, \\line → \\n, \\tab → \\t
5. \\\\'XX → Windows-1251 byte decode
6. \\uNNNNN → chr(code), range check 0..0x10FFFF
7. Strip remaining \\keyword sequences
8. Remove braces, null bytes, normalize newlines
9. UTF-8 surrogate cleanup: encode('utf-8', errors='surrogatepass')
                            .decode('utf-8', errors='replace')
\`\`\`

**Depth-tracking for nested groups.** An RTF group \`{\\fonttbl {\\f0 Times;}}\` can have arbitrary nesting depth. The parser tracks \`{}\` balance and removes the entire group from opening to closing brace at the same level. Complexity O(n) by document length.

**Accuracy:** 99.5% on a corpus of ~1,000 manually verified documents. The 0.5% errors are documents with non-standard RTF extensions (embedded images, OLE objects) where text is still extracted but with artifacts.

### Stage 2: Bulk Import from HDD

This is the pipeline's main workhorse. All RTF files reside on an 18 TB HDD (\`/dev/sda1\`), and the script must convert them to text and load into PostgreSQL.

**Why multiprocessing, not asyncio?** RTF conversion is CPU-bound: 7 regex substitutions, character-by-character iteration for depth-tracking, encode/decode. Python's GIL blocks parallel execution of CPU-bound code in threads. \`multiprocessing.Pool\` with 12 workers (= core count) bypasses GIL via separate processes.

\`\`\`python
Pool(processes=12, initializer=_init_worker, initargs=(rtf_lookup,))
pool.map(convert_one, batch_ids, chunksize=50)
\`\`\`

**\`chunksize=50\`:** balances between IPC overhead (task transfer between processes) and granularity. At chunksize=1, IPC overhead dominates. At chunksize=1000, one slow file blocks the entire chunk.

#### I/O Pattern: scandir Instead of stat

On an HDD with 15M+ files, \`os.stat()\` is a bottleneck. Each stat() is a separate I/O seek on a spinning disk. At 15M files, that is ~4 hours just for stat().

\`\`\`python
# Single scandir pass -- build lookup O(n)
rtf_lookup: dict[int, Path] = {}
for entry in os.scandir(rtf_dir):   # readdir, no stat()
    if entry.name.endswith('.rtf'):
        doc_id = int(entry.name[:-4])
        rtf_lookup[doc_id] = rtf_dir / entry.name
\`\`\`

\`os.scandir()\` calls system-level \`readdir()\`, which returns filenames without stat(). This is one sequential directory read instead of 15M random seeks.

#### Idempotent Upsert via Temp Table

A critical pattern for any data pipeline at scale:

\`\`\`sql
CREATE TEMP TABLE _ft_tmp (doc_id bigint, full_text text);
COPY _ft_tmp FROM stdin;            -- bulk load into temp
INSERT INTO edrsr_fulltext(doc_id, full_text)
SELECT doc_id, full_text FROM _ft_tmp
ON CONFLICT (doc_id) DO NOTHING;    -- idempotent: duplicates ignored
DROP TABLE _ft_tmp;
\`\`\`

**Why not direct \`COPY INTO edrsr_fulltext\`?** COPY does not support ON CONFLICT. If a batch contains a doc_id that already exists, the entire COPY fails. Temp table + INSERT ON CONFLICT is a staging area with deduplication.

**Why not \`INSERT ... ON CONFLICT DO UPDATE\`?** DO NOTHING is cheaper: it does not generate WAL for unchanged rows. Texts do not change after initial import, so UPDATE is unnecessary.

#### Checking Already Imported

Before conversion, the script fetches existing doc_ids:

\`\`\`python
SELECT doc_id FROM edrsr_fulltext WHERE doc_id BETWEEN {min_id} AND {max_id};
to_import = sorted(set(rtf_lookup.keys()) - existing)
\`\`\`

This is a set difference in Python -- O(n). For 30M doc_ids this is ~2 GB memory (64 bytes per int in set), which is acceptable.

### Stage 3: Monitoring and PostgreSQL Shared Memory

When importing millions of records, you need observability. We built an admin page with cross-environment aggregation:

- KPI cards: total metadata, total fulltext, coverage %
- Per-year table with progress bars
- Data from local, stage, prod (via \`/api/internal/edrsr-stats\`)
- Auto-refresh every 30 seconds

#### Incident: PG Error 53100

\`\`\`
could not resize shared memory segment -- No space left on device
\`\`\`

**Root cause.** A query \`LEFT JOIN edrsr_documents (45M) x edrsr_fulltext\` with \`GROUP BY EXTRACT(YEAR FROM adjudication_date)\` required a hash join. PostgreSQL allocates the hash table in shared memory. With \`work_mem=256MB\`, a single such operation consumed the entire container's \`shm_size\` (Docker default: 64 MB).

Auto-refresh frontend every 30s = ~120 such queries/hr. Each one -- a potential OOM on shared memory.

**Three layers of defense:**

**1. Query decomposition.** Instead of one JOIN -- two separate COUNTs:

\`\`\`sql
-- Query 1: metadata counts
SELECT EXTRACT(YEAR FROM adjudication_date)::int AS year,
       COUNT(*)::int AS total FROM edrsr_documents GROUP BY year;

-- Query 2: fulltext counts
SELECT EXTRACT(YEAR FROM d.adjudication_date)::int AS year,
       COUNT(f.doc_id)::int AS with_fulltext
FROM edrsr_documents d
LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id GROUP BY year;
\`\`\`

Merge happens in Node.js. Each query works with a smaller hash table.

**2. work_mem throttling.** \`SET LOCAL work_mem='32MB'\` inside a transaction. 32 MB instead of 256 MB -- 8x less pressure on shared memory. \`SET LOCAL\` resets after the transaction, does not affect other connections.

**3. In-memory cache (TTL 5 min).** Node.js Map with timestamp. Identical responses served from cache. 120 queries/hr → 12 queries/hr.

**Safety net:** \`shm_size: 2g\` in Docker Compose. Not a fix, but insurance.

## Sharding Architecture: 4 Databases in One PostgreSQL

### Capacity Planning

\`\`\`
60M rows × ~4.7 KB average size (text + overhead) = ~283 GB
EC2 t3.xlarge: 4 vCPU, 16 GB RAM, EBS gp3
shared_buffers = 4 GB (25% RAM)
effective_cache_size = 12 GB
\`\`\`

283 GB of data with 4 GB shared_buffers means a buffer hit ratio of ~1.4%. For sequential scan (VACUUM, ANALYZE), this is acceptable. For point lookups by doc_id (PK) -- the B-tree index of ~2.8 GB fits in shared_buffers.

**Single-database problem:** \`pg_dump\` on 283 GB takes ~4 hours. If it fails at 90% -- start over. \`VACUUM FULL\` on a 283 GB table requires double the disk space (566 GB). autovacuum on 60M rows with a high dead tuple ratio can run for hours.

### Sharding Strategy

Application-level sharding by \`doc_id\` ranges. 4 separate databases in one PostgreSQL container:

| Shard | Database | doc_id Range | Rows | Size | Backup Time |
|-------|----------|-------------|------|------|-------------|
| S1 | \`secondlayer_prod\` | < 112M | ~24M | 146 GB | ~90 min |
| S2 | \`secondlayer_prod_ft2\` | 112M--150M | ~26M | 101 GB | ~60 min |
| S3 | \`secondlayer_prod_ft3\` | 150M--175M | ~8M | 27 GB | ~15 min |
| S4 | \`secondlayer_prod_ft4\` | > 175M | ~2M | 8 GB | ~2 min |

**Why not native partitioning?** Declarative range partitions would solve the VACUUM problem (each partition is a separate heap), but NOT \`pg_dump\`: all partitions live in one database, and dump/restore operates at the database level. With separate databases -- 4 independent \`pg_dump | pg_restore\` in parallel.

**Why not Citus?** Citus requires coordinator + workers (minimum 2 nodes) or a managed service. Our access pattern -- point lookups by \`doc_id\` -- does not need distributed query planning. Also, Citus does not provide independent backup domains.

**Why not FDW (Foreign Data Wrappers)?** We considered \`postgres_fdw\` for transparent cross-shard queries. Rejected: fdw adds latency (~2ms overhead per query), does not support pushdown for all operations, and complicates backup (fdw tables are not dumped by standard pg_dump).

### Query Routing

Sharding key is \`doc_id\` (BIGINT). Monotonically increasing, so range sharding is natural:

\`\`\`
doc_id < 112,000,000        → secondlayer_prod      (S1)
112M ≤ doc_id < 150,000,000 → secondlayer_prod_ft2  (S2)
150M ≤ doc_id < 175,000,000 → secondlayer_prod_ft3  (S3)
doc_id ≥ 175,000,000        → secondlayer_prod_ft4  (S4)
\`\`\`

The backend routes at the connection pool level: 4 PgBouncer pools, each targeting its own database. For a new shard -- add database, pool, and update the range map.

**Monitoring:** endpoint \`/api/internal/edrsr-stats\` collects counts from all shards via \`pg_class.reltuples\` (approximate count, O(1)) instead of \`COUNT(*)\` (sequential scan, O(n)).

### Trade-offs

| Aspect | Pro | Con |
|--------|-----|-----|
| Backup | Independent per-shard (ft4 = 2 min) | 4 separate cron jobs |
| VACUUM | Parallel, smaller tables | 4 autovacuum workers |
| Queries | Point lookup O(log n) | Cross-shard JOIN only in Node.js |
| Connections | Isolated pools | 4× connection overhead in PgBouncer |
| Ops | Can drop/rebuild one shard | Manual range management |

## Copying to Production: Two-Phase ETL

Transferring 60M rows (283 GB) from local PG to 4 production shards over the network is a separate engineering challenge. The script \`copy-fulltext-to-prod.py\` implements a two-phase approach.

### Phase 1: Export (sequential read → TSV chunks)

\`\`\`python
# Single streaming COPY from local PG → TSV files on NVMe
export_sql = "\\\\COPY (SELECT doc_id, full_text FROM edrsr_fulltext "
             f"WHERE {where} ORDER BY doc_id) TO STDOUT WITH (FORMAT text)"

proc = subprocess.Popen(LOCAL_CMD + ["-c", export_sql], stdout=PIPE)
for line in proc.stdout:  # streaming, no memory accumulation
    current_file.write(line)
    if line_count >= chunk_size:  # default 5000 rows
        rotate_to_next_chunk()
\`\`\`

**Why TSV, not CSV?** COPY text format (TSV) is PostgreSQL's native format. No CSV parsing needed on the receiving end. Simpler escaping: tab-separated, backslash-escaping.

**Why chunk files, not a pipe?** Resumability. If the network drops at 70% of upload -- restart picks up unsent chunks. Each chunk = atomic unit of work.

**I/O pattern:** Sequential read from local PG (NVMe) → sequential write to \`/tmp/edrsr-ft-chunks/\`. Single stream, no disk contention.

### Phase 2: Upload (parallel workers → prod PG)

\`\`\`python
Pool(processes=200)  # 200 parallel psql processes
pool.imap_unordered(upload_chunk, chunk_files, chunksize=1)
\`\`\`

Each worker:

1. Reads a TSV chunk from disk (~5,000 rows, ~25 MB)
2. Constructs SQL: \`CREATE TEMP TABLE\` → \`COPY FROM STDIN\` → \`INSERT ON CONFLICT\` → \`DROP TABLE\`
3. Executes via \`subprocess.run(["psql", "-h", prod_host, ...])\`
4. Parses stdout for \`INSERT 0 N\` to count copied rows
5. Deletes chunk file after success

**Why psql subprocess, not psycopg2?** Python GIL. 200 threads with psycopg2 would serialize on GIL when processing network buffers. 200 subprocesses are 200 separate processes, each with its own TCP connection. Full network throughput utilization.

**\`SET lock_timeout = '5min'\`** on each chunk -- protection against deadlock during concurrent INSERTs into the same shard.

**Resumability:** Chunks are deleted only after a successful INSERT. \`--skip-export\` allows restarting only the upload phase from existing chunks. \`--resume-from-doc-id\` allows exporting new data and appending to existing chunks.

**Progress:** every 200 chunks: copied, skipped (already exist), errors, rows/s, ETA.

### Worker Pool Sizing: Why 200?

Production PostgreSQL: \`max_connections=500\`, PgBouncer in transaction mode. 200 workers = 200 concurrent connections. Each worker holds a connection for ~2-5 seconds (COPY + INSERT). At 200 workers and chunk_size=5000: throughput ~100K-200K rows/s, depending on network latency.

500 workers -- oversaturation: PG starts throttling on lock contention (concurrent INSERT into the same index). 100 workers -- network underutilization. 200 -- empirical optimum for our EC2 \`t3.xlarge\`.

## Data Quality

| Metric | Value |
|--------|-------|
| RTF conversion accuracy | 99.5% (manual validation, n=1,000) |
| Coverage by year (2021-2026) | 94-97% |
| Gaps | 3-6% -- documents without RTF (metadata only) |
| Duplicates | 0 (ON CONFLICT DO NOTHING) |
| Encoding errors | <0.1% (surrogate replacement) |

**3-6% gap** -- documents for which EDRSR does not publish full text (closed proceedings, decisions with restricted access under the Law on the Judiciary and Status of Judges).

## Results

| Metric | Value |
|--------|-------|
| Full texts in production | ~60,000,000 |
| Shards | 4 (one PG instance, EC2 t3.xlarge) |
| Total size | 283 GB (EBS gp3) |
| Indexes (B-tree PK) | ~2.8 GB per shard |
| Backup S4 (8 GB) | ~2 min |
| Backup S1 (146 GB) | ~90 min |
| Download workers | 100 (asyncio) |
| Conversion workers | 12 (multiprocessing) |
| Production copy workers | 200 (subprocess) |
| Pipeline idempotent | Yes (ON CONFLICT DO NOTHING + file-level resume) |

## What Is Next

Full texts are raw material for two subsequent layers:

1. **Vector embeddings.** 60M × 1536 dim (text-embedding-ada-002) = ~350 GB in Qdrant. This requires a batch-embedding pipeline with rate limiting (OpenAI TPM), chunking of long texts, and an incremental update strategy.

2. **Semantic sectioning.** Splitting decisions into logical sections (reasoning, operative part, dissenting opinion) for more precise search. SemanticSectionizer already works for individual documents, but batch-processing 60M is a separate challenge.

---

*Open data is not a compromise. It is an architectural decision. 60 million full texts, 283 GB across 4 shards, an idempotent pipeline with zero tolerance for data loss -- all built on public sources, with no dependency on commercial APIs.*`,
  },
  'chat-latency-optimization': {
    title: 'How We Cut Chat Latency: 7 Phases of Optimization',
    punchline: 'From 12 seconds to 2.8 — a story of how we transformed a slow legal chat into a tool that is a pleasure to use',
    readTime: '9 min',
    content: `# How We Cut Chat Latency: 7 Phases of Optimization

*When a lawyer asks a question to an AI system, every second of waiting is a second when they start doubting the technology. Here is how we cut response time from 12 seconds to 2.8.*

---

## Starting Point: Why the Chat Was Slow

LEX AI does not work like a regular chatbot. Our ChatService implements an agentic loop: upon receiving a user request, the LLM decides on its own which tools to call, analyzes results, and may run up to 5 iterations before forming a final response. A typical query like "What is the court practice on compensation for moral damages from traffic accidents?" goes through this path:

1. LLM analyzes the query and selects tools
2. Calls \`search_court_decisions\` (semantic search in Qdrant + PostgreSQL)
3. Calls \`get_court_decision\` for 3-5 found decisions
4. LLM analyzes the texts and forms a response
5. SSE streaming of the result to the client

Each step is a network request, and they were executed **sequentially**. We profiled a typical query and got this breakdown:

| Stage | Time (ms) | Share |
|-------|-----------|-------|
| First LLM call (tool selection) | 2,400 | 20% |
| Qdrant search (embedding + query) | 1,800 | 15% |
| Loading 4 decisions from ZakonOnline | 4,200 | 35% |
| Second LLM call (analysis + response) | 3,100 | 26% |
| Serialization, SSE, overhead | 500 | 4% |
| **Total** | **12,000** | **100%** |

Median response time — 12 seconds. P95 — 18.4 seconds. For an interactive chat, this is unacceptable.

---

## Phase 1: Parallel Tool Execution

**Problem:** When the LLM requested multiple tool calls simultaneously (e.g., \`search_court_decisions\` + \`get_legislation_section\`), we executed them sequentially via a simple \`for...of\` loop.

**Solution:** Replaced sequential execution with \`Promise.allSettled()\`:

\`\`\`typescript
// Before:
for (const toolCall of toolCalls) {
  const result = await this.executeTool(toolCall);
  results.push(result);
}

// After:
const promises = toolCalls.map(tc => this.executeTool(tc));
const settled = await Promise.allSettled(promises);
\`\`\`

We added a semaphore with a limit of 6 parallel calls to avoid overloading either the ZakonOnline API or the database. Each call received an individual timeout of 8 seconds instead of a shared one.

**Result:** -2,100 ms on queries with 3+ tools. The biggest gain — when the LLM requests 4-5 court decisions at once.

---

## Phase 2: SSE Streaming from the First Token

**Problem:** We waited for the complete response from the LLM and only then sent it to the client as a single SSE message. The user saw a blank screen for 3+ seconds during text generation.

**Solution:** Switched the OpenAI API to \`stream: true\` mode and piped tokens directly into SSE:

\`\`\`typescript
// SSE events now fly as they are generated
for await (const chunk of openaiStream) {
  const token = chunk.choices[0]?.delta?.content;
  if (token) {
    res.write(\\\`data: \\\${JSON.stringify({ type: 'token', content: token })}\\\\n\\\\n\\\`);
  }
}
\`\`\`

On the frontend, the \`useAIChat()\` hook now updates the UI on every received token. First text appears within 200-400 ms after generation starts.

**Result:** Perceived latency (Time to First Token) dropped from 3,100 ms to 380 ms. Total time did not change, but UX improved dramatically.

---

## Phase 3: Tool-Level Caching

**Problem:** The same \`get_court_decision\` call for a popular Supreme Court decision was made dozens of times per day, each time hitting the ZakonOnline API.

**Solution:** Added three-tier caching: Redis (TTL 4 hours) -> PostgreSQL (TTL 30 days) -> API:

\`\`\`typescript
async getDocumentFullText(docId: string): Promise<string> {
  const cached = await this.redis.get(\\\`doc:fulltext:\\\${docId}\\\`);
  if (cached) return cached; // ~2ms

  const pgCached = await this.db.query(
    'SELECT full_text FROM document_cache WHERE zakononline_id = $1', [docId]
  );
  if (pgCached.rows[0]) {
    await this.redis.setex(\\\`doc:fulltext:\\\${docId}\\\`, 14400, pgCached.rows[0].full_text);
    return pgCached.rows[0].full_text; // ~15ms
  }

  const text = await this.zoAdapter.fetchFullText(docId); // ~800ms
  // ... save to both caches
  return text;
}
\`\`\`

After a week of operation, cache hit rate stabilized at 73% for Redis and 91% for PostgreSQL.

**Result:** -1,900 ms on repeated queries (most of them). Traffic savings to ZakonOnline: ~68%.

---

## Phase 4: Connection Pooling and Keep-Alive

**Problem:** Every HTTP request to ZakonOnline opened a new TCP connection. TLS handshake added 120-180 ms per call.

**Solution:** Configured an HTTP Agent with keep-alive and pooling:

\`\`\`typescript
const zoAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 15,
  maxFreeSockets: 5,
  timeout: 10000,
});
\`\`\`

We also increased the PostgreSQL connection pool from 10 to 25 (via PgBouncer in transaction mode) and enabled Redis pipelining.

**Result:** -380 ms per external call after the first. With 4 calls per query — that is -1,100 ms total.

---

## Phase 5: Prompt Optimization

**Problem:** The ChatService system prompt contained 2,800 tokens — a detailed description of all 36 tools, response format, legal terminology. The LLM spent time processing this context on every iteration.

**Solution:** We restructured the prompt:

- Shortened tool descriptions to key parameters (from 2,800 to 1,400 tokens)
- Added \`DOMAIN_TOOL_MAP\` — a compact domain-based routing map instead of the full list
- Moved usage examples from the system prompt to a few-shot section, added only on the first call

**Result:** -420 ms per LLM call. With 2 calls per query — -840 ms.

---

## Phase 6: Pre-computed Embeddings

**Problem:** Every search query generated an embedding via OpenAI text-embedding-ada-002 — that is 300-600 ms per API call.

**Solution:** Introduced an embedding cache in Redis with query normalization:

\`\`\`typescript
function normalizeQuery(q: string): string {
  return q.toLowerCase().trim()
    .replace(/[\\u00AB\\u00BB"']/g, '')
    .replace(/\\s+/g, ' ');
}

const cacheKey = \\\`emb:\\\${crypto.createHash('md5')
  .update(normalizeQuery(query)).digest('hex')}\\\`;
\`\`\`

Additionally, we implemented a nightly background job that pre-computes embeddings for the top 200 most frequent queries from analytics.

**Result:** -450 ms for repeated queries (cache hit ~41% in the first week, ~58% after a month).

---

## Phase 7: Materialized Search Results

**Problem:** Semantic search in Qdrant returned document IDs, after which we made N queries to PostgreSQL to fetch metadata (court name, date, case number).

**Solution:** Created a materialized view that refreshes every 15 minutes:

\`\`\`sql
CREATE MATERIALIZED VIEW mv_court_decision_search AS
SELECT d.zakononline_id, d.title, d.court_name, d.case_number,
       d.judgment_date, d.justice_kind, d.doc_type,
       LEFT(d.full_text, 500) AS snippet
FROM court_decisions d
WHERE d.full_text IS NOT NULL;

CREATE INDEX idx_mv_search_zoid ON mv_court_decision_search(zakononline_id);
\`\`\`

Now after receiving IDs from Qdrant, we make one batch query to the materialized view instead of N separate ones.

**Result:** -680 ms on searches with 10+ results.

---

## Summary: Before and After

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Median response (p50) | 12.0 s | 2.8 s | -77% |
| P95 | 18.4 s | 5.2 s | -72% |
| Time to First Token | 3,100 ms | 380 ms | -88% |
| Cache hit rate (Redis) | 0% | 73% | -- |
| External API calls/query | 6.2 | 2.1 | -66% |
| OpenAI cost per query | $0.034 | $0.021 | -38% |

The biggest impact came from three things: parallel tool execution (phase 1), caching (phase 3), and streaming (phase 2, for perception). The remaining phases gave smaller but consistent gains that accumulate.

---

## Conclusion

Latency optimization in LLM systems is not a single silver bullet, but a combination of approaches at every level of the stack. Paradoxically, the biggest impact on user satisfaction came not from reducing total time, but from streaming the first token. A lawyer who sees the system "thinking" and gradually forming a response is willing to wait significantly longer than one staring at a blank screen.`,
  },
  'bedrock-llm-fallback': {
    title: 'AWS Bedrock as LLM Provider: From OpenAI Fallback to Claude + Nova Pro',
    punchline: 'One SDK instead of two libraries. IAM instead of API keys. Data in the EU instead of the US. A single bill instead of two invoices. Here is how we moved the entire fallback layer to AWS Bedrock — and why it changed more than we expected.',
    readTime: '7 min',
    content: `# AWS Bedrock as LLM Provider: From OpenAI Fallback to Claude + Nova Pro

*How one PR changed the fallback layer architecture and why API keys are yesterday's news*

---

## The Problem: Two API Keys, Two Bills, Zero Guarantees

LEX AI processes thousands of legal queries daily. Every query is an LLM call: intent classification, database search, decision analysis, response generation. When OpenAI goes down (and it happens more often than we would like), the platform must keep working.

Previously, we used the Anthropic API as a fallback provider. It worked, but created a number of problems:

| Problem | Consequence |
|---------|------------|
| Two separate API keys | Secret rotation x 2, leak risk x 2 |
| Two billing accounts | Monthly reconciliation of two invoices, no Reserved Capacity |
| Data goes to the US | Anthropic API does not guarantee EU residency |
| Per-key rate limits | Under load spikes, fallback is also throttled |
| Round-robin failed | We already [wrote about this](/blog?article=round-robin-llm) — different response formats broke parsing |

We needed a single fallback provider that gives access to multiple models through one SDK, with IAM authorization, and data within the EU.

## The Solution: AWS Bedrock

AWS Bedrock is a managed service that provides access to models from different vendors through a unified API. One SDK, one authorization (IAM), one billing, choice of region.

Through Bedrock, we immediately gained access to two model families:

- **Claude (Anthropic)** — via Bedrock, without a separate API key
- **Amazon Nova** — AWS's own models, optimized for cost

### Budget-Aware Model Tiers

Our \`ModelSelector\` already supported three performance tiers. We simply replaced the fallback models:

| Tier | Purpose | Primary (OpenAI) | Fallback (Bedrock) |
|------|---------|-------------------|---------------------|
| \`quick\` | Classification, routing | gpt-5-nano | Amazon Nova Micro |
| \`standard\` | Tool execution, summarization | gpt-5-mini | Amazon Nova Lite |
| \`deep\` | Legal analysis, patterns | gpt-5.1 | Amazon Nova Pro |

Nova Micro and Nova Lite cover cheap tasks, while Nova Pro is a full-fledged alternative for complex analysis. Claude via Bedrock remains available for cases where its reasoning quality is specifically needed.

## Migration: What Changed in the Code

### Before: Two Clients, Two Formats

\`\`\`typescript
// Before: direct connection to Anthropic API
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // yet another secret
});
\`\`\`

### After: Unified AWS SDK

\`\`\`typescript
// After: Bedrock via AWS SDK
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({
  region: 'eu-central-1', // data stays in the EU
  // IAM authorization — no API keys
});
\`\`\`

The key change — **Converse API**. This is Bedrock's unified interface that accepts the same message format regardless of the model. The same code works for both Nova Pro and Claude via Bedrock. No parsing different formats — the problem that killed our round-robin.

## Authorization: IAM Instead of API Keys

This is probably the biggest win. Instead of storing \`ANTHROPIC_API_KEY\` in .env files on every server, we use the EC2 instance's IAM role:

\`\`\`json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": "arn:aws:bedrock:eu-central-1::foundation-model/*"
}
\`\`\`

No secrets in environment variables. No key rotation. Credentials are taken automatically from the Instance Metadata Service. One less attack vector.

## Results

| Metric | Before (Anthropic API) | After (Bedrock) | Change |
|--------|------------------------|-----------------|--------|
| Fallback latency (p50) | 1.8s | 1.2s | -33% |
| Fallback latency (p99) | 8.4s | 4.1s | -51% |
| Fallback query cost | $0.018/query | $0.011/query | -39% |
| Secrets in .env | 4 (2 OpenAI + 2 Anthropic) | 2 (OpenAI only) | -50% |
| Data in EU | Not guaranteed | eu-central-1 | Guaranteed |

The latency reduction is explained by two factors: EC2 → Bedrock is traffic within the AWS region (no internet egress), and Nova Pro is simply faster than Claude for typical legal tasks.

## Provisioned Throughput: The Next Step

Bedrock allows purchasing Provisioned Throughput — guaranteed capacity for a specific model. For us this means:

- **Predictable cost**: fixed price instead of pay-per-token
- **Guaranteed SLA**: no 429s (rate limit) during load spikes
- **Budget planning**: the monthly amount is known in advance

We plan to activate Provisioned Throughput for Nova Pro on the \`deep\` tier, where predictability matters most — legal analysis cannot wait in a queue.

## Conclusions

One PR, but the architectural impact is tangible:

1. **IAM instead of API keys** — fewer secrets, less risk
2. **EU data residency** — data does not leave eu-central-1
3. **Single billing** — AWS Cost Explorer instead of two invoices
4. **Converse API** — one format for all models
5. **Nova Pro** — cheaper and faster fallback for legal analysis

If your platform uses multiple LLM providers and you are tired of the API key zoo — take a look at Bedrock. It is not a silver bullet, but for fallback scenarios it is the most elegant solution we have found.`,
  },
  'erb-nbu-due-diligence': {
    title: 'Debtors Registry and NBU Banks: New Tools for Due Diligence',
    punchline: 'LEX AI now checks counterparties in the Unified Debtors Registry and verifies banks through the NBU registry — automatically, in a single request. 18 registries instead of 16.',
    readTime: '5 min',
    content: `# Debtors Registry and NBU Banks: New Tools for Due Diligence

*Two new registries in LEX AI — checking debtors and banking licenses now takes seconds, not hours.*

---

## The Problem: Blind Spots in Counterparty Verification

Every lawyer who handles transactions or prepares due diligence reports knows the feeling of incompleteness. You have checked the counterparty in the EDR, reviewed court cases, found beneficiary information — but questions remain. Does the company have any enforcement recoveries? Is the bank through which the payment is processed solvent?

Until today, LEX AI covered 16 registry checks. Now two critical sources have been added: the **Unified Debtors Registry (ERB)** of the Ministry of Justice and the **NBU bank registry**.

## What the New Tools Provide

### Unified Debtors Registry (ERB)

The ERB contains information about individuals and legal entities with active enforcement proceedings. It is essentially a registry of those who have outstanding debts by court orders, tax authority decisions, or other authorized entities.

| Parameter | What It Shows |
|---|---|
| Full name / entity name | Debtor identification |
| EDRPOU code / Tax ID | Precise entity linkage |
| Enforcement proceeding number | Specific proceeding |
| Recovery category | Alimony, fines, contractual debts, etc. |
| Proceeding status | Open, completed, returned |
| Enforcement body | State or private enforcement service |

### NBU Bank Registry

The National Bank of Ukraine registry contains official data about all banking institutions in the country: active, in liquidation, and those that have lost their license.

| Parameter | What It Shows |
|---|---|
| Bank name | Official and abbreviated name |
| EDRPOU code | Legal entity identification |
| License status | Valid, revoked, annulled |
| Bank status | Solvent, insolvent, in liquidation |
| Registration date | When the bank was added to the registry |
| Contact information | Address, phone, website |

## Practical Scenarios

### Scenario 1: Counterparty Verification Before Signing a Contract

A corporate lawyer prepares a report on a potential supplier. One query to LEX AI — and among the results appears information: the supplier has three active enforcement proceedings totaling over 2 million UAH. The category — debts from supply contracts. This is a signal: the counterparty systematically fails to pay its partners.

Without the ERB, the lawyer would have had to separately visit the Ministry of Justice website, manually enter the data, and analyze the results. Now it is part of a unified report.

### Scenario 2: Placing a Deposit or Choosing an Escrow Bank

A client plans to place a significant amount on deposit, or parties are selecting a bank for an escrow account as part of an M&A deal. A query through LEX AI confirms: the bank has a valid license, status — solvent, operating since 2004. Or conversely — it turns out the bank is in the process of liquidation, and placing funds is absolutely not recommended.

### Scenario 3: Comprehensive Due Diligence for M&A

When preparing to acquire a company, the legal team verifies the target company and its executives. LEX AI simultaneously:

- searches for the company and its officers in the ERB;
- verifies the banks where the company is serviced through the NBU registry;
- supplements the picture with data from the EDR, court registry, and beneficiary registry.

The result — a comprehensive report instead of fragmented references from ten sources.

## How It Works Technically

You do not need to know the implementation details. Just formulate your query in natural language:

- *"Check LLC Budivelnyi Alliance in the debtors registry"*
- *"Is PrivatBank solvent?"*
- *"Do a full counterparty check — EDRPOU code 12345678"*

LEX AI will determine on its own which registries need to be queried and return a structured result.

## Summary: 18 Registries in One Interface

With the addition of the ERB and the NBU bank registry, the LEX AI platform covers **18 registry checks** for due diligence. This means less manual work, less risk of missing critical information, and faster results for the client.

The new tools are already available to all platform users.`,
  },
  'server-side-evidence': {
    title: 'Server-Side Evidence Extraction: How We Moved Evidence Analysis to the Backend',
    punchline: 'The frontend parsed evidence from response text using regex — mobile Safari froze for a second. We moved evidence extraction to the backend, added an SSE evidence event, and now the client simply renders ready-made objects. Time to first evidence: from 2.1s to 0.8s.',
    readTime: '6 min',
    content: `# Server-Side Evidence Extraction: How We Moved Evidence Analysis to the Backend

*When client-side parsing could no longer keep up — we moved evidence processing where it belongs.*

---

## The Problem

LEX AI returns more than just text to the user. Every response contains evidence: fragments of court decisions, legislation articles, document excerpts. Previously, this entire stream arrived as a single text block, and the frontend had to parse it into structured cards on its own.

On desktop, this worked acceptably. On mobile devices — it did not.

**Symptoms we observed:**

| Problem | Cause |
|---|---|
| UI freezes for 300-800 ms | Parsing large responses blocked the main thread |
| Incorrect evidence highlighting | Regex heuristics did not cover all formats |
| Logic duplication | Each client (web, mobile, MCP) wrote its own parser |
| Degradation at scale | More evidence = slower rendering |

When a response contained 15-20 pieces of evidence (a typical situation for court practice analysis), mobile Safari simply froze for a second. Users noticed.

## The Architectural Decision

Instead of optimizing the client-side parser, we reframed the question: why parse on the client at all what the backend already knows?

When ChatService calls tools (search_court_decisions, get_legislation_section, vault_search), it receives structured data. Then the LLM generates a text response, and the client tries to extract the same structure back from the text. This is a redundant cycle.

**Solution: the backend extracts evidence during response generation and sends them as separate SSE events.**

### Data Flow: Before and After

**Before:**

\`\`\`
Backend: LLM generates text with evidence mixed in
   -> SSE: answer (one large block)
   -> Frontend: regex parsing, card construction
   -> Render
\`\`\`

**Now:**

\`\`\`
Backend: LLM generates text
   -> EvidenceExtractor classifies tool_result
   -> SSE: evidence { type, title, source, content, relevance_score }
   -> SSE: answer (clean text without embedded evidence)
   -> Frontend: render ready-made objects
\`\`\`

## SSE Protocol

We extended the existing SSE stream with a new evidence event. The full set of events now looks like this:

| Event | Purpose | Payload |
|---|---|---|
| thinking | Processing indicator | { stage: string } |
| tool_result | Tool call result | { tool, result, cost } |
| evidence | Structured evidence | { type, title, source, content, relevance_score } |
| answer | Text fragment of response | { delta: string } |
| complete | Stream completion | { total_cost, evidence_count } |

The evidence object has strict typing:

\`\`\`typescript
interface EvidenceBlock {
  type: 'court_decision' | 'legislation' | 'document' | 'legal_position';
  title: string;
  source: string;
  content: string;
  relevance_score: number;
}
\`\`\`

The relevance_score field (0-1) allows the frontend to sort evidence by relevance and collapse less important items by default.

## Backend Evidence Extraction

EvidenceExtractor operates at the tool_result processing stage. When ChatService receives a result from a tool, it passes it to the extractor before the LLM begins generating the final response.

For classification (court_decision vs legislation vs document), we use an LLM at the quick-model level (gpt-4o-mini). This adds 50-100 ms per piece of evidence but saves significantly more on the client and guarantees correct classification.

The critical point: extraction happens in parallel with response generation. While the LLM writes text, evidence is already flying to the client. The user sees cards in the EvidencePanel even before the text response is complete.

## Fallback Mechanism

We did not remove the client-side parser. It remains as a fallback:

\`\`\`typescript
if (receivedEvidenceEvents.length > 0) {
  // Use server-side evidence
  renderStructuredEvidence(receivedEvidenceEvents);
} else {
  // Fallback: parse from response text
  const extracted = parseEvidenceFromText(fullAnswer);
  renderStructuredEvidence(extracted);
}
\`\`\`

This protects against three scenarios: the backend is not yet updated (gradual deploy), the extractor crashed with an error, the connection broke mid-stream and evidence events were lost.

## Results

| Metric | Before | After |
|---|---|---|
| Time to first evidence in UI | 2.1 sec | 0.8 sec |
| Main thread blocking (mobile) | 300-800 ms | < 50 ms |
| Classification accuracy | ~82% | ~96% |
| Client bundle size | baseline | -4 KB (removed regex patterns) |

The biggest gain is on mobile. UI jank virtually disappeared because the frontend no longer does heavy parsing. EvidencePanel simply renders ready-made objects.

## Conclusions

This migration confirmed a principle we follow at LEX AI: data should be structured as close to the source as possible. The backend knows what it returned from the tool. Forcing the client to guess from text is architectural debt that we finally closed.

The fallback layer makes the migration safe: even if server-side extraction is temporarily unavailable, the user will see evidence. Just a bit slower.`,
  },
  'developer-platform-api': {
    title: 'Developer Platform: 56 Legal AI Tools via a Single API',
    punchline: 'We launched platform.legal.org.ua — a portal for developers who want to integrate legal AI into their products. API keys, usage analytics, documentation for 56 tools, examples for Python and TypeScript. MCP SSE, REST, batch — three transports to choose from. From signup to first request — 5 minutes.',
    readTime: '7 min',
    content: `# Developer Platform: 56 Legal AI Tools via a Single API

*How we built a portal for developers who want to integrate legal AI into their products.*

---

## Why a Separate Portal

LEX AI started as a tool for lawyers. But developers also want access to our data: court case search, counterparty verification, legislation analysis — all of this is needed not only in our UI, but in third-party products too.

Previously, integration looked like this: message us on Telegram, get a token, read the README on GitHub, figure out response formats through trial and error. That doesn't scale.

Now there's [platform.legal.org.ua](https://platform.legal.org.ua) — a full-featured developer portal with everything needed for integration.

## What's Inside

### Dashboard

After login, developers see a panel with key metrics:

| Metric | Description |
|--------|-------------|
| **Active API Keys** | Number of created keys |
| **Balance** | Remaining balance in USD |
| **Requests (30 days)** | Total number of calls |
| **API Status** | Current availability |

Right there — a Quick Start section with a ready-made command for connecting via Claude Code:

\`\`\`bash
claude mcp add secondlayer \\
  --transport sse \\
  --url https://mcp.legal.org.ua/v1/sse \\
  --header "Authorization: Bearer YOUR_API_KEY"
\`\`\`

### API Key Management

Full CRUD for keys:

- **Creation** — enter a name, get a key. Format: \`sl_<32 characters>_<8 checksum>\`.
- **Security** — the key is shown only once after creation. Save it immediately.
- **Tracking** — for each key you can see call count, creation date, and last used date.
- **Revocation** — instant, with confirmation.

### Usage Analytics

The Usage page shows detailed statistics:

- **Daily calls chart** — bar chart for 7, 30, or 90 days
- **Usage by tool** — table with call count, cost, tokens, average response time
- **Financial dashboard** — current balance, transaction history (top-ups / usage)

Every API call is tracked down to the token. Developers can see how much each tool costs and optimize spending.

## 56 Tools in 12 Categories

The full tool catalog is available in the documentation with search and category filtering:

| Category | Count | Examples |
|----------|-------|----------|
| **Pipeline** | 4 | Full query analysis, intent classification |
| **Court** | 4 | Court decision search, case details |
| **Analysis** | 10 | Decision comparison, pattern extraction |
| **Documents** | 8 | Upload, parsing, document analysis |
| **Legislation** | 7 | Article search, full law text |
| **Procedural** | 3 | Deadlines, jurisdiction, procedural actions |
| **Parsing** | 5 | Decision text decomposition |
| **Vault** | 3 | User document storage |
| **RADA** | 4 | Deputies, bills, voting |
| **Registry** | 5 | Business registry, beneficiaries, debtors |
| **Statistics** | 2 | Court and category statistics |
| **Main** | 1 | Main orchestration tool |

Each tool includes: description, category, cost range.

## Three Transports

Developer Platform supports three integration methods:

### MCP SSE (recommended)

Server-Sent Events via MCP protocol. Supported by Claude Desktop, Claude Code, and other MCP clients out of the box.

\`\`\`
Endpoint: https://mcp.legal.org.ua/v1/sse
\`\`\`

### REST API

Classic HTTP for any programming language.

\`\`\`bash
curl -X POST https://mcp.legal.org.ua/api/tools/search_court_decisions \\
  -H "Authorization: Bearer sl_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "invalidation of a legal transaction"}'
\`\`\`

### Batch Processing

Multiple tools in a single request:

\`\`\`bash
POST /api/tools/batch
\`\`\`

## Quick Start: 5 Minutes to Your First Request

Documentation includes examples for five integration scenarios:

1. **Claude Code** — one command in the terminal
2. **Claude Desktop** — JSON config in a file
3. **cURL** — REST API directly
4. **Python** — client wrapper with requests
5. **TypeScript/Node.js** — axios client with types

Python example:

\`\`\`python
import requests

API_KEY = "sl_your_api_key"
BASE_URL = "https://mcp.legal.org.ua/api/tools"

response = requests.post(
    f"{BASE_URL}/search_court_decisions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"query": "debt collection under credit agreement"}
)

decisions = response.json()
\`\`\`

## Rate Limits and Security

| Parameter | Value |
|-----------|-------|
| Requests per minute | 60 |
| Requests per day | 10,000 |
| Max request size | 10 MB |
| Execution timeout | 120 seconds |

Every response includes \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\` headers. On exceeding — 429 with exponential backoff recommendation.

Authentication — Bearer token in the \`Authorization\` header. Keys are tied to accounts, every usage is logged. If a key is compromised — instant revocation through the panel.

## Billing

Pay-as-you-go model. Each tool call has its own cost depending on complexity: simple queries (registry lookup) cost less than deep analysis using LLMs.

On the Usage page you can see:

- Current balance
- Total top-ups
- Total usage
- Transaction history with type (purchase / usage) and description

## Portal Architecture

Developer Platform is a separate React SPA, independent from the main legal.org.ua:

| Component | Technology |
|-----------|-----------|
| Frontend | React 19, Vite, TailwindCSS |
| Charts | Recharts |
| Auth | Google OAuth + email/password |
| API | mcp_backend (shared with the main app) |
| Deploy | Docker + Nginx, port 8094 |

The backend is shared — same endpoints, same database, same cost tracking. The portal is a different interface to the same infrastructure.

## Who Needs This

**LegalTech startups** — integrate court case search into your product without building your own index.

**Law firms with IT departments** — automate due diligence, legislation monitoring, procedural document preparation.

**AI developers** — connect legal tools to your agents via the MCP protocol.

**Researchers** — bulk court case analysis via batch API.

---

One portal. Three transports. 56 tools. From signup to first request — 5 minutes. [platform.legal.org.ua](https://platform.legal.org.ua)`,
  },
  'nais-41m-open-data': {
    title: '41.8 Million Records from Ukrainian State Registries — Now Available via AI',
    punchline: '11 state registries from data.gov.ua imported into the platform: enforcement proceedings, debtors, notaries, bankruptcy, legal acts and more — all accessible to lawyers through AI chat.',
    readTime: '7 min',
    content: `# 41.8 Million Records from Ukrainian State Registries — Now Available via AI

Today we completed the full import of 11 state registries from data.gov.ua into our SecondLayer platform. 41.8 million records — from enforcement proceedings to notaries — are now available to lawyers through AI chat.

## What We Imported

| Registry | Records | Source |
|----------|---------|--------|
| Enforcement Proceedings (ASVP) | 29,060,072 | data.gov.ua |
| Debtors Registry | 10,363,352 | data.gov.ua |
| Notarial Special Forms | 1,224,003 | data.gov.ua |
| Administrative-Territorial Units | 500,704 | data.gov.ua |
| Streets Dictionary | 497,464 | data.gov.ua |
| EDRNPA (Legal Acts Registry) | 140,930 | data.gov.ua |
| Bankruptcy Cases | 35,439 | data.gov.ua |
| Court Experts | 14,730 | data.gov.ua |
| Notaries | 5,799 | data.gov.ua |
| Arbitration Managers | 3,420 | data.gov.ua |
| Forensic Methods | 1,546 | data.gov.ua |
| **Total** | **41,847,459** | |

These are NAIS registries alone. Combined with other sources, the platform already contains:

- 8.8M court decisions (EDRSR)
- 1.26M international sanctions records (OpenSanctions)
- Complete Verkhovna Rada legislation database
- Parliament data: deputies, factions, voting records, bills
- Legal entities and entrepreneurs registry (EDR)

## How It Works for Lawyers

A lawyer types a question in natural language — the AI model automatically selects the right registry and returns structured data. No need to know APIs, SQL, or table names.

**"Find notary Ivanov"** — the system searches the notaries registry and returns:

\`\`\`
Ivanov Valeriy Oleksandrovych
Private Notary, Ivano-Frankivsk region
Kolomyia, Teatralna St., 2a
\`\`\`

**"Show legal acts about personal data protection"** — searches EDRNPA (140,930 acts):

\`\`\`
VRU Resolution №4729-IX dated 17.12.2025
"On the preparation for the second reading of the Draft Law
 of Ukraine on Personal Data Protection"
Status: Active
\`\`\`

**"Find PrivatBank by EDRPOU"** — instant lookup by code 14360570:

\`\`\`
JSC CB "PRIVATBANK"
EDRPOU: 14360570
Status: Registered
Registration: 19.03.1992
\`\`\`

## 16 Tools — One Interface

Each registry is a separate MCP tool (Model Context Protocol) that the AI model calls automatically:

1. \`search_entities\` — legal entities, entrepreneurs, public organizations
2. \`get_by_edrpou\` — lookup by EDRPOU code
3. \`get_entity_details\` — full company information
4. \`search_beneficiaries\` — ultimate beneficial owners
5. \`get_statistics\` — statistics across all registries
6. \`search_notaries\` — notaries registry
7. \`search_court_experts\` — certified court experts
8. \`search_arbitration_managers\` — arbitration managers
9. \`search_debtors\` — debtors registry (10.3M)
10. \`search_enforcement_proceedings\` — enforcement proceedings (29M)
11. \`search_bankruptcy_cases\` — bankruptcy cases
12. \`search_special_forms\` — notarial special forms
13. \`search_forensic_methods\` — forensic examination methods
14. \`search_legal_acts\` — EDRNPA (legal acts)
15. \`search_administrative_units\` — administrative-territorial units
16. \`search_streets\` — streets dictionary

## Why Lawyers Need This

Imagine a typical due diligence check. A lawyer needs to verify a counterparty. Previously, this meant:

1. Visit the EDR website — check registration
2. Visit data.gov.ua — check enforcement proceedings
3. Check the debtors registry
4. Check bankruptcy cases
5. Check court decisions on EDRSR
6. Check sanctions lists

With SecondLayer — one question in chat: **"Check company by EDRPOU 12345678"**. The system automatically checks all registries and returns a comprehensive report.

## Technical Details

The entire import is automated:

- 11 registries downloaded in parallel in a single run
- XML and CSV files streamed and imported into PostgreSQL
- Conflicts resolved via ON CONFLICT DO UPDATE
- Support for Windows-1251 and UTF-8 encodings
- Automatic retry with exponential backoff

Synchronization runs daily or weekly depending on the registry.

## What's Next

- 18.5M court session records (court.gov.ua) — in progress
- PROZORRO (public procurement) — planned
- NAPC declarations — planned
- NSDC sanctions lists — planned

---

Register: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-changes-lawyer-work-2026': {
    title: 'How AI Is Changing the Work of Ukrainian Lawyers in 2026',
    punchline: '56 tools instead of 12 browser tabs. Semantic search across 45M decisions. Full-text analysis in seconds. Due diligence in one query. Not a replacement for a lawyer — an exoskeleton for their mind.',
    readTime: '10 min',
    content: `# How AI Is Changing the Work of Ukrainian Lawyers in 2026

*56 tools that turn hours of routine into 30-second queries.*

---

## A Lawyer's Day — Before and After

### Before: 12 Tabs, 4 Hours

Wednesday morning. A lawyer is preparing a position on a debt recovery case under a credit agreement. Steps: search EDRSR (45M decisions), browse Verkhovna Rada for legislation, check EDR for company registration, check debtors registry, bankruptcy registry, sanctions lists, return to EDRSR for Supreme Court positions. 4 hours. 12 tabs.

### After: 1 Window, 30 Minutes

Same lawyer. Same case. But now — with LEX:

**Query 1:** *"Find Supreme Court practice on debt recovery under credit agreements since 2023"* → 847 cassation decisions.

**Query 2:** *"Show articles 526, 530, 625 of the Civil Code"* → Three article texts in 2 seconds.

**Query 3:** *"Check company by EDRPOU 12345678"* → Comprehensive report: registration, beneficiaries, enforcement proceedings, bankruptcy, sanctions — all in one response.

30 minutes instead of 4 hours.

---

## 56 Tools: What's Available

LEX is not a chatbot that "invents" answers. It's 56 specialized tools, each querying a specific data source.

### Court Practice (14 tools)
Search, full text, comparison, pattern extraction, appeal chains — across 45M+ decisions.

### Legislation (7 tools)
Article text, search, full law text — recognizes abbreviations: "CC", "Criminal Code", "CPC".

### Registries & Due Diligence (16 tools)
Legal entities, EDRPOU search, beneficiaries, debtors (10.3M), enforcement proceedings (29M), bankruptcy, notaries, court experts.

### Parliament (4 tools)
Deputies, factions, bills, voting — Verkhovna Rada data.

### Documents & Vault (8 tools)
Upload, text analysis, OCR, classification — PDF, DOCX, images.

---

## Hallucination Protection

Every response passes through HallucinationGuard — verifying that cited decisions exist, case numbers match, and legislation is current.

---

56 tools. 45M+ decisions. 41.8M registry records. All through one chat. [legal.org.ua](https://legal.org.ua)`,
  },
  'spain-legal-expansion': {
    title: 'Entering the Spanish Market: How a Ukrainian LegalTech Platform Adapts to European Law',
    punchline: 'Importing Spanish legal data from BOE and CENDOJ. Geo-detection of locale. Automatic localization in 4 languages. New MCP tools for Spanish legislation. From Kyiv to Madrid — one codebase.',
    readTime: '8 min',
    content: `# Entering the Spanish Market: How a Ukrainian LegalTech Platform Adapts to European Law

*From a single-market Ukrainian product to a multi-jurisdictional platform in 3 weeks.*

---

## Why Spain

We built LEX for Ukrainian lawyers. But the architecture proved flexible enough to scale to other jurisdictions. Spain is the first step: 48M population, 155K+ registered attorneys, fully digitized BOE, and codified legal system (like Ukraine's).

## Three Layers of Adaptation

### Layer 1: Data — Spanish Legal Sources
- **BOE** (Boletín Oficial del Estado) — official gazette, all legislation
- **CENDOJ** — judicial decisions database (equivalent of EDRSR)

### Layer 2: Tools — New MCP Tools
\`search_spanish_legislation\`, \`get_spanish_article\`, \`search_spanish_court_decisions\`, \`get_spanish_decision_details\`

### Layer 3: Localization — 4 Languages
Ukrainian (default), English, Russian, Spanish — full i18n with geo-detection.

## Geo-Detection
IP geolocation on first visit → country → language mapping. Spain/Mexico/Argentina/Colombia → Spanish. 80% of users never change language manually.

---

One platform. Multiple jurisdictions. From Kyiv to Madrid — one chat. [legal.org.ua](https://legal.org.ua)`,
  },
  'developer-docs-api-guide': {
    title: 'API for Developers: How to Integrate 56+ Legal MCP Tools into Your Product',
    punchline: '6 documentation tabs: Overview, 56-tool catalog, authentication, code examples (curl/TS/Python/SSE), MCP client configs (Claude Desktop/Cursor/VS Code), pricing. From registration to first request — 5 minutes.',
    readTime: '9 min',
    content: `# API for Developers: How to Integrate 56+ Legal MCP Tools into Your Product

*Complete guide to documentation, transports, and integration — from curl to Claude Desktop.*

---

## Why We Built /developer/docs

We opened the API in February. But documentation was scattered across GitHub READMEs, Telegram support chats, and various docs files. Now everything is in one place: legal.org.ua/developer/docs — 6 tabs, from overview to pricing.

## 3 Transports

| Transport | Protocol | For Whom |
|-----------|----------|----------|
| **MCP SSE** | Server-Sent Events | Claude Desktop, Cursor, VS Code |
| **REST** | HTTP POST | Any programming language |
| **Batch** | HTTP POST | Bulk requests (up to 10 tools at once) |

## 56 Tools in 12 Categories
Full interactive catalog with search and filtering. Each tool has: name, description, category, cost range, input schema.

## Code Examples
curl, TypeScript, Python, SSE streaming, batch — ready-to-copy snippets for each transport.

## MCP Client Configs
Claude Desktop, Claude Code, Cursor, VS Code, Continue.dev — 2-minute setup guides with JSON configs.

## Pricing
Pay-as-you-go. Registry lookups: $0.002–0.01. Court search: $0.005–0.02. AI analysis: $0.02–0.05. Free $1 trial credit.

---

6 tabs. 56 tools. 3 transports. 5 minutes to first request. [legal.org.ua/developer/docs](https://legal.org.ua/developer/docs)`,
  },
  'diia-integration-challenges': {
    title: 'Diia.Sign for Business: Technical Challenges of Government Service Integration',
    punchline: 'ECDSA + SHA256 for hashing. Redis key mismatch between start and verify. QR code and deep link. Business data updates on every login. 4 fixes in 24 hours. A real integration story — unfiltered.',
    readTime: '8 min',
    content: `# Diia.Sign for Business: Technical Challenges of Government Service Integration

*A real story: how we integrated Diia.Sign and what went wrong (and how we fixed it).*

---

## Why Diia.Sign

Google OAuth is convenient but not legally significant. For a LegalTech platform, we need verified identity tied to tax ID / EDRPOU. Diia.Sign provides: verified identity, qualified electronic signature, QR code convenience.

## Problem 1: ECDSA Hashing
Diia requires requestId signed with ECDSA SHA-256 in Base64. Minimal documentation. First attempt used simple SHA-256 hash (wrong). Fix: proper ECDSA sign with PEM private key.

## Problem 2: Redis Key Mismatch
Different prefixes: \`diia:request:\` on start, \`diia:auth:\` on callback. Classic copy-paste bug. Callback arrived but Redis returned null. Fix: unified prefix constant.

## Problem 3: Business Data Updates
First login created business records but subsequent logins skipped updates. Stale addresses and names. Fix: 4 PRs in 24 hours — UPDATE on every login with ON CONFLICT DO UPDATE.

## Problem 4: Nginx Proto Override
Backend generated \`http://\` redirect URLs behind Cloudflare/Nginx. Fix: \`X-Forwarded-Proto\` header + Express \`trust proxy\`.

## Lessons
1. Diia documentation is minimal — prepare for reverse engineering
2. Redis keys must be constants — one prefix, one file
3. Business data must sync on every login
4. Test the full e2e flow — unit tests won't catch cross-component mismatches
5. Configure Nginx headers before going to production

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'sample-queries-86-tools': {
    title: '86 Ready-Made Queries for LEX AI: One Per Tool',
    punchline: 'We compiled 66 queries, each activating a specific platform tool — from court decision search to trademark verification. Plus 20 complex queries using 2–3 tools simultaneously. All designed for minimal LLM usage — maximum precision, minimum cost.',
    readTime: '12 min',
    content: `# 86 Ready-Made Queries for LEX AI: One Per Tool

LEX AI is not a single AI chatbot — it's an orchestrator with **86+ specialized tools**. Each tool does something specific: searches a registry, retrieves a law article, calculates deadlines, checks sanctions. The AI only decides which tool to call and formats the response.

We compiled **66 queries** (one per tool) and **20 complex queries** (2–3 tools at once). All designed for **minimal LLM involvement** — maximum precision, minimum token cost.

---

## How It Works

When you write a query in LEX AI chat, the system:

1. **Classifies intent** — determines what you want (search, calculation, analysis)
2. **Selects tool(s)** — the most relevant from 86 available
3. **Executes** — direct query to database, registry, or API
4. **Formats** — AI minimally processes the result for readability

The more precise your query, the less the AI "thinks" and the faster the response.

---

## Court Practice (11 tools)

| Query | Tool |
|-------|------|
| Find court decisions where defendant is Nova Poshta LLC | search_legal_precedents |
| Show full text of court decision in case #910/12345/23 | get_court_decision |
| Show all instances and decisions in case #757/1234/24 | get_case_documents_chain |
| Find cases with similar circumstances: pedestrian accident at crosswalk | find_similar_fact_pattern_cases |
| Collect practice "for" and "against" moral damages for contract breach | compare_practice_pro_contra |
| How many cases does Ukrzaliznytsia LLC have as defendant? | count_cases_by_party |
| Search EDRSR decisions by case number 916/2345/24 | search_edrsr_decisions |
| Full-text search in EDRSR: "invalidation of sham transaction" | search_edrsr_fulltext |
| Semantic search in EDRSR: director liability for company debts | search_edrsr_semantic |
| Court session schedule for case #910/5678/24 | search_court_sessions |
| Status of case #757/12345/24 | search_court_case_status |

---

## Analysis (4 tools)

| Query | Tool |
|-------|------|
| Pattern analysis: how courts resolve surety disputes | analyze_case_pattern |
| Find decisions with similar reasoning on Art. 625 Civil Code | get_similar_reasoning |
| Build citation graph for Supreme Court decision in case 910/1111/22 | get_citation_graph |
| Check if the SC Commercial Court decision in case 916/2222/21 is still valid | check_precedent_status |

---

## Legislation (7 tools)

| Query | Tool |
|-------|------|
| What norms regulate limitation periods in civil cases? | search_legislation |
| Show articles 256–268 of the Civil Code | get_legislation_articles |
| Article 625 of the Civil Code of Ukraine | get_legislation_section |
| Structure of the Commercial Procedure Code | get_legislation_structure |
| History of changes to Article 80 of the Land Code | get_legislation_history |
| Find procedural norms on interim measures | search_procedural_norms |
| Search legal acts: Cabinet resolutions on minimum wage | search_legal_acts |

---

## Procedural (3 tools)

| Query | Tool |
|-------|------|
| Calculate appeal deadline for decision dated 01.03.2026 | calculate_procedural_deadlines |
| Checklist for filing cassation appeal in commercial proceedings | build_procedural_checklist |
| Calculate 3% annual interest and inflation for 01.01.2024–01.01.2026 on 500,000 UAH | calculate_monetary_claims |

---

## Parliament (4 tools)

| Query | Tool |
|-------|------|
| Bills on land reform in the Verkhovna Rada | rada_search_parliament_bills |
| Information about deputy Stefanchuk Ruslan | rada_get_deputy_info |
| Text of the Law "On Enforcement Proceedings" | rada_search_legislation_text |
| Voting on bill #3524 on mobilization | rada_analyze_voting_record |

---

## Business Registries (10 tools)

| Query | Tool |
|-------|------|
| Information about legal entity by EDRPOU 00032112 | openreyestr_get_by_edrpou |
| Find legal entities named "Naftogaz" | openreyestr_search_entities |
| Who are the beneficiaries of Prominvest LLC? | openreyestr_search_beneficiaries |
| Enforcement proceedings against Budinvest LLC | openreyestr_search_enforcement_proceedings |
| Bankruptcy cases in Kyiv region | openreyestr_search_bankruptcy_cases |
| Notaries in Lviv region | openreyestr_search_notaries |
| Court experts in valuation | openreyestr_search_court_experts |
| Arbitration managers in Kharkiv region | openreyestr_search_arbitration_managers |
| ProZorro tenders: road repairs Kyiv 2025 | openreyestr_search_prozorro |
| NAZK declarations: Tkachenko | openreyestr_search_nazk_declarations |

---

## State Registries (23 tools)

Direct access to 23 state registries with **340M+ records** total.

| Query | Tool | Records |
|-------|------|---------|
| Find judge Ivanov Oleksandr | search_judges | HQCJ |
| Lawyer Petrenko in lawyers registry | search_lawyers | 73K |
| Handwriting court experts | search_court_experts_registry | MoJ |
| Corruption offenses registry: Kyiv | search_corruption_register | 58K |
| Missing persons search: Kovalenko | search_missing_persons | 112K |
| Wanted persons: Sydorenko | search_wanted_persons | 71K |
| Vehicle search by plate AA1234BB | search_wanted_vehicles | 78K |
| Environmental NGOs Kyiv | search_public_organizations | 1.08M |
| Sanctions against Gazprom | search_sanctions | 1.25M |
| Banks with NBU license | search_nbu_banks | 60 |
| Large taxpayers Kharkiv region | search_large_taxpayers | 1.3K |
| Check VAT payer by code 12345678 | search_vat_payers_registry | 264K |
| Pharmaceutical patents | search_patents | 119K |
| Trademark "Roshen" | search_trademarks | 182K |
| Debtor Alpha LLC in enforcement proceedings | search_erb_debtors | 10M+ |
| Companies with wage arrears | search_wage_debtors | 1.3K |
| Securities owners of Ukrnafta | search_securities_owners | 128K |
| Case distribution protocols at Pechersk Court | search_case_distribution | 71K |
| NAZK declaration checks: Shevchenko | search_declaration_checks | 2K |
| HQCJ data on Dnipro court judges | search_vkks | HQCJ |
| HCJ decisions on judicial discipline | search_vrp_decisions | HCJ |
| Dismissed judges per HCJ data | search_vrp_judges_discipline | HCJ |
| ECHR practice on right to fair trial | search_echr_practice | ECHR |

---

## 20 Complex Queries (2–3 tools at once)

These queries activate multiple tools in parallel:

1. **Art. 625 Civil Code + court practice on it** — legislation + precedents
2. **Articles 256–268 CC (limitation) + SC practice** — articles + precedents
3. **Full-text search "unauthorized construction" + CC norms** — EDRSR + legislation
4. **Art. 16 CC + ECHR practice on effective remedy** — legislation + ECHR
5. **Decision in case 757/5678/24, all instances + validity check** — decision + chain + status
6. **SC practice on surety: pro/contra + pattern analysis** — comparison + analysis
7. **SC decision in case 910/1234/24 + session schedule** — EDRSR + sessions
8. **Check LLC by EDRPOU: beneficiaries + enforcement** — entity + beneficiaries + proceedings
9. **Check "Budinvest": registry, debts, bankruptcy** — entity + debtors + bankruptcy
10. **Sanctions + NSDC registry check** — sanctions + RNBO sanctions
11. **Pharma company patents + EDRPOU check** — patents + entity
12. **Judge Ivanov — HQCJ data + HCJ discipline** — judges + VKKS + discipline
13. **Lawyer Petrenko — registry + cases as representative** — lawyers + precedents
14. **Deputy Stefanchuk info + voting record** — deputy info + voting
15. **Interim measures norms in CPC + application checklist** — norms + checklist
16. **Appeal deadline + CPC procedural norms** — deadlines + norms
17. **3% annual interest for 2 years on 1M UAH + SC practice on Art. 625** — calculation + precedents
18. **Structure of Enforcement Proceedings Law + articles on asset seizure** — structure + articles
19. **Lviv notaries + real estate valuation experts** — notaries + experts
20. **Land lease bills + Land Code section X** — bills + legislation

---

## Summary

| Category | Tools | Queries |
|----------|-------|---------|
| Court Practice | 11 | 11 |
| Analysis | 4 | 4 |
| Legislation | 7 | 7 |
| Procedural | 3 | 3 |
| Parliament | 4 | 4 |
| Business Registries | 10 | 10 |
| State Registries | 23 | 23 |
| ECHR | 1 | 1 |
| **Single-tool** | **63** | **63** |
| **Complex** | — | **20** |
| **Total** | **63** | **86** |

All 86 queries now rotate on the chat start screen. Try it — every page load shows a different combination.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'opendata-sync-pipeline-engineering': {
    title: 'How We Sync 340M+ Records from 15 Government APIs That Keep Crashing',
    punchline: 'Multi-IP import, automated scheduler, freshness monitoring — data pipeline engineering for Ukraine\'s open data. From the first 404 to stable nightly updates of 64 tables.',
    readTime: '15 min',
    content: `# How We Sync 340M+ Records from 15 Government APIs That Keep Crashing

When building a legal AI platform on Ukraine's open data, the biggest challenge isn't AI or search. It's **reliably fetching data** from dozens of government sources, each with its own limitations, formats, and stability issues.

This article is an engineering deep-dive into how we built a fully automated sync pipeline for 340+ million records from 15 sources. From multi-IP import architecture to cron scheduler and freshness monitoring.

---

## The Problem: Government APIs Are Not Stripe

When working with data.gov.ua, NAIS, UIPV, or spending.gov.ua APIs, you face reality:

- **Undocumented rate limits** — one service blocks after 100 req/min, another after 10
- **Format changes** — a JSON field suddenly becomes null instead of a string, or the response comes as an HTML error page instead of JSON
- **Timeouts** — a 200MB ZIP archive of the debtors registry might download for 20 minutes, or not at all
- **No idempotency** — no \`ETag\`, \`Last-Modified\`, or diff endpoints. Every sync is a full rewrite
- **Disappearing URLs** — data.gov.ua resources move without notice, returning 404

We can't afford manual imports. Lawyers rely on data freshness: the wanted persons registry must update daily, not monthly.

---

## Architecture: Three Layers of Reliability

Our pipeline consists of three independent components:

\`\`\`
┌─────────────────────────────────────────┐
│  opendata-sync (Docker container)       │
│  ├─ node-cron scheduler                 │
│  ├─ 15 sources on schedule              │
│  └─ Triggers → backend / openreyestr    │
└───────────┬─────────────────┬───────────┘
            │                 │
            ▼                 ▼
┌───────────────────┐ ┌──────────────────┐
│  ImportTaskService │ │  OpenReyestr     │
│  (mcp_backend)     │ │  sync-registry   │
│  ├─ 10 source IPs  │ │  ├─ ZIP download │
│  ├─ round-robin    │ │  ├─ XML parsing  │
│  ├─ retry logic    │ │  └─ UPSERT       │
│  └─ progress track │ │                  │
└────────┬──────────┘ └────────┬─────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────┐
│  PostgreSQL: 64 opendata_* tables       │
│  Monitoring: db-status.py + freshness   │
└─────────────────────────────────────────┘
\`\`\`

---

## Layer 1: Scheduler — opendata-sync

The first layer is a lightweight Node.js microservice that **doesn't download data itself**. It's only responsible for scheduling and triggering.

### Source Configuration

Each source is declared declaratively:

\`\`\`typescript
{
  name: 'mvs_wanted_persons',
  title: 'MVS — Wanted Persons',
  cron: '0 3 * * *',           // 03:00 daily
  target: 'backend',           // where to send the trigger
  sourceName: 'mvs_wanted_persons',
  enabled: true
}
\`\`\`

### Sync Schedule

| Time | Sources | Target Service |
|------|---------|----------------|
| 03:00 daily | MVS wanted, MVS missing, MVS vehicles, NAZK corruption | backend |
| 04:00–05:00 daily | Arbitration managers, bankruptcy, enforcement, debtors | openreyestr |
| Sunday 02:00 | UIPV patents, trademarks, models, designs | backend |
| Monday 02:00–05:00 | Notaries, court experts, special forms, streets, ATU | openreyestr |

### Deduplication Protection

Before each trigger, the scheduler checks if an import is already running for that source. If status is \`running\`, no new task is created.

---

## Layer 2: ImportTaskService — Multi-IP Import

This is the heart of the pipeline. When the scheduler sends a trigger, ImportTaskService handles all the downloading.

### Three Import Modes

Government sources use different formats, so we support three strategies:

| Mode | Sources | How It Works |
|------|---------|-------------|
| \`api_paginated\` | UIPV (patents, trademarks) | Page-by-page API traversal, 1100ms between requests |
| \`json_array\` | MVS, NAZK | Single HTTP request → JSON array |
| \`file_download\` | NAIS registries | ZIP → XML → parsing → UPSERT |

### Multi-IP: 10 Addresses × 5 Threads = 50 Concurrent Downloads

For sources with per-IP rate limits, we use a pool of **10 network interfaces** (AWS ENI). Pages are distributed round-robin:

\`\`\`
Page 1  → IP 172.31.x.1
Page 2  → IP 172.31.x.2
...
Page 10 → IP 172.31.x.10
Page 11 → IP 172.31.x.1  (back to first)
\`\`\`

With 5 threads per IP, we get **50 concurrent connections**. For UIPV with a 1100ms/request rate limit, this gives ~45 pages/second instead of 0.9.

### Retry with Exponential Backoff

Each request has up to 5 attempts with increasing delays:

\`\`\`
Attempt 1: immediately
Attempt 2: after 2 seconds
Attempt 3: after 4 seconds
Attempt 4: after 8 seconds
Attempt 5: after 16 seconds
\`\`\`

For 429 (Too Many Requests) errors — separate logic: we respect \`Retry-After\` from the server response.

### Progress Tracking Without Database Load

Progress is stored **in memory** and flushed to PostgreSQL every 100 pages:

\`\`\`typescript
// In-memory — updated every page (microseconds)
taskProgress.set(taskId, {
  pagesDone: 4521,
  recordsImported: 45210,
  currentPage: 4522,
  lastError: null
});

// To DB — flush every 100 pages
// UPDATE import_tasks SET pages_done=$2, records_imported=$3 WHERE id=$1
\`\`\`

This provides real-time progress via API without overwhelming the database with thousands of UPDATE queries.

### MCP Tools for Control

The entire process is managed through 4 MCP tools:

| Tool | Purpose |
|------|---------|
| \`list_import_sources\` | Catalog of all sources: URL, type, table, rate limit |
| \`start_import\` | Launch background task: source_name → task_id |
| \`get_import_status\` | Progress: %, ETA, speed, errors |
| \`cancel_import\` | Stop via AbortController, preserving progress |

This means the AI assistant can launch an import, monitor progress, and notify the lawyer when data is updated.

---

## Layer 3: Freshness Monitoring

Data without monitoring is a ticking bomb. We built a system that shows **how fresh** the data is in each table.

### Expected Frequency Matrix

| Frequency | Tables | Examples |
|-----------|--------|----------|
| Daily (1d) | 18 | MVS wanted, NAZK corruption, debtors, enforcement |
| Weekly (7d) | 42 | Patents, trademarks, lawyers, deputies, judges, bills |
| Monthly (30d) | 4 | Session schedules, case statuses |

### Freshness Indicators

\`\`\`
🟢 within norm (freq × 1.5)           — all good
🟡 slightly overdue (freq × 1.5–2.5)  — worth checking
🟠 overdue (freq × 2.5–4)             — something went wrong
🔴 critical (> freq × 4)              — needs intervention
⛔ import completed with error
🔄 import currently running
\`\`\`

### Dashboard: db-status.py

The script connects to the production database via SSH and shows the full picture:

\`\`\`
═══════════════════════════════════════════════════════════════
  📦 SecondLayer (main) — 64 tables, 247.3 GB total
═══════════════════════════════════════════════════════════════
  #   Table                              Rows   Size   Norm  Age
  ──────────────────────────────────────────────────────────────
  1   opendata_wanted_persons             71K   85 MB    1d   2m ago   🟢
  2   opendata_missing_persons           112K  138 MB    1d   12m ago  🟢
  3   opendata_corruption                 58K   42 MB    1d   3h ago   🟢
  4   opendata_patents                   119K  180 MB    7d   2d ago   🟢
  5   spending_acts                     9.45M  8.2 GB    7d   5d ago   🟢
  ...
\`\`\`

---

## Real Problems and How We Solved Them

### Problem 1: Docker Can't Bind to ENI IP

\`json_array\` sources (MVS, NAZK) are a single HTTP request, not pagination. When we passed ENI IP for bind, the Docker container got \`EADDRNOTAVAIL\` — it can't see the host network.

**Solution:** multi-IP is only needed for paginated sources. For \`json_array\` — regular fetch without bind.

### Problem 2: URLs Disappear Without Warning

data.gov.ua periodically updates resource IDs for MVS and NAZK. Old URLs return 404.

**Solution:** URLs are stored in the \`import_source_catalog\` table, not hardcoded. Updating a URL is a single UPDATE query, no code rebuild needed.

### Problem 3: NULL Bytes in PDF/XML

Some registries contain \`\\x00\` characters that PostgreSQL rejects:

\`\`\`
ERROR: invalid byte sequence for encoding "UTF8": 0x00
\`\`\`

**Solution:** strip null bytes during parsing, before INSERT.

### Problem 4: Response Is Not JSON

When servers are overloaded, some APIs return an HTML error page or empty string instead of JSON.

**Solution:** parsing wrapped in try/catch with \`Content-Type\` checking. If response isn't JSON — retry from next IP.

### Problem 5: Memory Leak on Large Imports

Importing 9.45M spending_acts records kept all records in memory.

**Solution:** streaming parsing — processing in chunks of 1000 records, UPSERT, release memory.

---

## Numbers

| Metric | Value |
|--------|-------|
| Total data volume | 340M+ records, 247 GB |
| Number of sources | 15 automated |
| Number of tables | 64 opendata tables |
| MCP search tools | 26 (opendata + spending + registries) |
| Daily sync | 8 sources (03:00–05:00 UTC) |
| Weekly sync | 11 sources (weekends) |
| Concurrent connections | up to 50 (10 IPs × 5 threads) |
| Full UIPV import time | ~45 min (182K records) |
| MVS wanted import time | ~30 sec (71K records, single request) |

---

## What's Next

1. **Alerting** — Telegram bot for failed import notifications instead of manual db-status checks
2. **Incremental sync** — for sources supporting \`modified_since\`, download only changes
3. **Data quality checks** — automated verification: if record count drops >20% after import, something went wrong
4. **More sources** — DRRP (property registry), Ministry of Justice (encumbrances), DFS (tax debtors)

---

## Conclusion

Building a pipeline for Ukraine's open data isn't about \`fetch → insert\`. It's about reliability engineering: retry, rate limits, multi-IP, freshness monitoring, graceful degradation.

Each of the 15 sources is its own story with unique problems. But when the pipeline runs stable, a lawyer asks a question in chat and gets fresh data from MVS, NAZK, UIPV, NAIS, and spending.gov.ua — without ever thinking about how much engineering work stands behind each response.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'ci-cd-blue-green-self-healing-tests': {
    title: 'CI/CD with Blue-Green Preview and Self-Healing Tests',
    punchline: 'How we built a pipeline that doesn\'t crash at 3 AM: blue-green with approval gate, prod safety guard, and 8 PRs in 3 hours to tame Vitest OOM.',
    readTime: '18 min',
    content: `# CI/CD with Blue-Green Preview and Self-Healing Tests

How we built a CI/CD that doesn't crash at 3 AM — and why Vitest eats memory.

This article isn't a theoretical guide. It's a chronicle of 4 days (March 25–28, 2026) during which we transformed our deploy pipeline from "push and pray" into a system with a preview environment, approval gate, prod safety guard, and tests that fix themselves. 17 PRs, 422 tests, one epic battle with OOM.

---

## Architecture: What We Started With

SecondLayer is a monorepo with 3 MCP servers (backend, rada, openreyestr), a React frontend, and PostgreSQL/Redis/Qdrant infrastructure. Deployment to prod goes through a self-hosted GitHub Actions runner that physically sits on the same machine as prod.

Yes, you read that right. CI runner and prod — same machine. It's like living with a tiger in the same room: possible, but you need to be very careful.

---

## Day 1: Foundation — 93 Tests + Blue-Green Preview

### 93 New Unit Tests in One PR (#1204)

First step — coverage. 58 backend tests (auth, JWT, dual-auth, balance check, rate limiting) + 35 frontend tests (uiStore, undoStore, localeStore). But just writing tests isn't enough. We added:

- **Self-heal job**: when tests fail in CI, Claude Code automatically analyzes the error, fixes the test, and creates a fix PR
- **Pre-deploy gate**: prod deploy is blocked if tests don't pass
- **Jest 30 compatibility**: removed \`fail()\`, rewrote async assertions

### Blue-Green Deployment with Approval Gate (#1213)

The main feature. We split prod deploy into two phases:

**Phase 1 — automatic (after CI)**:
1. Build new version
2. Run migrations
3. Start inactive color (blue or green)
4. Activate \`preview.legal.org.ua\`

**Phase 2 — manual approval**:
1. Reviewer checks preview
2. Clicks Approve in GitHub Environment
3. Nginx switches traffic to new color
4. Drain connections from old color
5. Stop old color
6. Create GitHub Release

---

## Day 3: Prod Safety Guard — Lessons from an Incident

### The Incident: CI Broke Prod (#1290)

Since the CI runner and prod live on the same machine, a local deploy accidentally touched prod nginx. Result: 502 in prod. At 3 AM. Classic.

### The Solution: Prod Safety Guard

Logic is simple: record prod nginx status and start time before deploy, verify after. If the container restarted or crashed — pipeline screams CRITICAL.

---

## Day 4: Vitest OOM Saga — 8 PRs in 3 Hours

The most interesting part. A chronology of how one test broke CI and what it took to fix it.

### The Problem

\`ConsultationChatTab.test.tsx\` — a test for the main chat component. It imports \`articles.ts\` (4,745 lines), renders a heavy React component, and consistently kills the Vitest worker via OOM.

### The Journey (8 Iterations)

| PR | Approach | Result |
|----|----------|--------|
| #1302 | maxForks: 2 | OOM in single fork |
| #1303 | 4GB heap | OOM on teardown |
| #1304 | threads pool | SSE mock hang |
| #1305 | teardownTimeout | Exit code 1 |
| #1306 | cleanup() | OOM still on teardown |
| #1309 | JSON reporter | File never written |
| #1311 | **stdout parsing** | **Works** |
| #1315 | +8GB heap for prod | **Stable** |

### The Final Solution

Parse Vitest stdout for "Tests.*failed" or "Test Files.*passed" instead of trusting the exit code. The worker OOM happens during teardown AFTER all tests have passed — so the exit code lies.

### Why Vitest Eats Memory

1. **Large import tree**: ConsultationChatTab imports a 4,745-line articles.ts — each fork creates a full copy
2. **V8 error stack trace**: On worker shutdown, V8 builds full stack traces consuming the heap
3. **threads vs forks**: worker_threads share heap with main process but \`execArgv\` doesn't pass \`--max-old-space-size\` to threads
4. **Reporter race condition**: JSON reporter writes in \`process.exit\` hook, but OOM kills before hooks execute

### Recommendations

1. **Always \`cleanup()\`** in afterEach — React render without unmount = leaked intervals
2. **Don't trust exit code** — Vitest worker OOM ≠ test failure
3. **stdout parsing** — most reliable CI pass/fail detection
4. **forks > threads** for large test suites — execArgv only works with forks

---

## Results

| Before | After |
|--------|-------|
| Push → pray → check in 10 min | Push → CI → preview → approve → prod |
| Tests fail in CI → manual fix | Self-heal: Claude Code fixes automatically |
| CI broke prod (502) | Prod Safety Guard: pre/post verification |
| Vitest OOM = all tests "failed" | stdout parsing: real results |
| 0 tests | 422 tests (93 new) |
| Single deploy = all-or-nothing | Blue-green with preview and rollback |

---

CI/CD isn't configuration. It's a living organism that needs to be fed with tests and protected from itself.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-safety-open-registries': {
    title: 'AI Model Safety on Open Registries: Asimov\'s Laws as an Ethical Framework',
    punchline: 'How to ensure that a model with access to 50M+ records doesn\'t become a tool for pressuring the innocent? Asimov\'s Three Laws adapted for legal AI, threat scenarios, and architectural solutions for RLHF training on GCP.',
    readTime: '18 min',
    content: `# AI Model Safety on Open Registries: Asimov's Laws as an Ethical Framework

This article is available in Ukrainian. Please switch to Ukrainian language to read the full version.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'rlhf-longtail-problem': {
    title: 'The Long Tail Problem in RLHF Training of Legal AI Models',
    punchline: '5 categories cover 90% of the EDRSR corpus. How Long Tail destroys RLHF, why the model becomes a "civilist", and what strategies we implement on GCP for $240K over 6 months.',
    readTime: '16 min',
    content: `# The Long Tail Problem in RLHF Training of Legal AI Models

This article is available in Ukrainian. Please switch to Ukrainian language to read the full version.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'constitutional-rlhf': {
    title: 'Constitution of Ukraine as Reward Signal: Constitutional RLHF',
    punchline: 'How Articles 3, 28, 32, 62 of the Constitution become reward functions in RLHF training. Presumption of innocence as a hardcoded rule, constitutional collisions, and a benchmark of 500+ scenarios.',
    readTime: '20 min',
    content: `# Constitution of Ukraine as Reward Signal: Constitutional RLHF

This article is available in Ukrainian. Please switch to Ukrainian language to read the full version.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-experimental-court': {
    title: 'Experimental AI Court: Simulating Legal Proceedings Across All Instances',
    punchline: 'Three separate models — judge, prosecutor, advocate — with information isolation reproduce adversarial proceedings. Instance specialization, result trees, and adversarial training on GCP.',
    readTime: '22 min',
    content: `# Experimental AI Court: Simulating Legal Proceedings Across All Instances

This article is available in Ukrainian. Please switch to Ukrainian language to read the full version.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'legaltech-llm-constitution': {
    title: 'LegalTech LLM Constitution: A Rulebook for Legal AI Models',
    punchline: '30 articles, 9 sections, open license. Lex AI initiates an industry standard for LegalTech models — from presumption of innocence to wartime protections, with direct implementation in the reward model.',
    readTime: '24 min',
    content: `# LegalTech LLM Constitution: A Rulebook for Legal AI Models

This article is available in Ukrainian. Please switch to Ukrainian language to read the full version.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'claude-code-building-startups': {
    title: 'How I Made 735 Commits in 25 Days: Claude Code as a Full Engineering Partner',
    punchline: '486 sessions, 5,612 messages, 193,000 lines of code, 22,326 bash commands — and zero hired developers. Real usage statistics of Claude Code for building a legal tech platform, data pipelines processing 340M+ records, and MCP integrations.',
    readTime: '12 min',
    content: `# How I Made 735 Commits in 25 Days: Claude Code as a Full Engineering Partner

*This is not a promotional article. It's a transparent breakdown of real Claude Code usage statistics while building a legal tech platform, data pipelines, and infrastructure. With numbers, mistakes, and conclusions.*

---

## Context: What I'm Building and Why I'm Alone

SecondLayer (LEX AI) is a Ukrainian legal tech platform: AI-powered court decision analysis, semantic search, legislation, registries, consultations. A monorepo with three MCP servers, React frontend, Flutter mobile app, and data pipelines for 340M+ records from 15 government APIs.

I'm the sole developer. Instead of a team of 5-10 engineers, I work with Claude Code as a full-fledged partner: from writing code to deploying to production.

---

## Numbers Over 25 Days (March 18 — April 12, 2026)

| Metric | Value |
|--------|-------|
| Sessions | 486 (285 analyzed) |
| Messages | 5,612 |
| Commits | 735 |
| Lines written | +193,340 |
| Lines deleted | -14,259 |
| Files changed | 1,811 |
| Bash commands | 22,326 |
| Edit operations | 3,782 |
| Sub-agents | 864 |
| Parallel sessions | 41% of messages |

This isn't theoretical productivity. This is real git log.

---

## What Exactly I Built

### 1. Legal Tech Platform (28 sessions)

Core product: bug fixes, new features (Diia authentication, developer contracts, email notifications, Spanish localization with geo-detection), UI redesign, 93+ tests.

Claude Code worked as a full-stack developer: multi-file changes, PR creation, merge, deploy — all in one session.

### 2. Open Data Pipelines (18 sessions)

Scale:
- 44K documents from the Verkhovna Rada
- 11.6M+ records from spending.gov.ua
- 190K+ trademarks from UKRPATENT
- 58K+ court decisions

Claude Code orchestrated multi-server, multi-IP parallel download scripts. Debugged rate limiting and WAF blocks. Managed PostgreSQL bulk imports with repartitioning and GIN indexes on 63M rows.

### 3. Infrastructure & DevOps (16 sessions)

EC2 provisioning across regions (Paris, Spain), CI/CD pipeline fixes, blue-green deployments with preview environments, Docker/nginx debugging, server migrations.

### 4. MCP Server Ecosystem (14 sessions)

Building and configuring MCP servers for Nextcloud Deck/Tables, Thunderbird email, and ChatGPT integration. Migrating 180 tasks from Linear to Nextcloud Deck.

### 5. Content & Side Projects (8 sessions)

Investor memos, legal documents, blog articles, and a Telegram bot with Bender quotes from Futurama featuring a multilingual database.

---

## What a Typical Work Session Looks Like

I don't write detailed prompts. My style is **launch Claude at a task, watch what it does, course-correct in real time**.

Statistics confirm: 106 instances where Claude started with the wrong approach, which I quickly redirected. This isn't a bug — it's a feature of working with an AI partner.

**Result: 89% of sessions completed successfully.**

---

## What Works Best

### Multi-file Changes — 56 sessions

When you need to change a type in a shared package, update the backend handler, frontend component, and tests simultaneously — Claude Code does it in one iteration. For a human, that's 30-60 minutes of context switching.

### MCP Integrations as Operational Infrastructure

Nextcloud Deck for tasks, AWS API for infrastructure, Thunderbird for email — Claude Code becomes a full operational hub.

---

## Where It Doesn't Work (Honestly)

### Wrong Approach — 106 instances

Claude often starts with the wrong approach: searches in the wrong directory, uses SSH instead of MCP tools, picks slow strategies for DB operations.

### Buggy Code — 102 instances

Code doesn't always work on the first try. But with TypeScript and tests, issues get caught quickly.

---

## Economics: AI Partner vs Team

| | AI Partner | Team of 3 |
|--|-----------|-----------|
| Cost/month | ~$200 (Claude Pro) | $15,000-30,000 |
| Availability | 24/7, parallel sessions | Business hours |
| Onboarding | 0 (CLAUDE.md) | 2-4 weeks |

**One experienced engineer with an AI partner can do the work of a small team.**

---

## Conclusions

735 commits in 25 days isn't science fiction. It's the result of systematic work with an AI partner, where CLAUDE.md replaces onboarding, MCP integrations replace tool-switching, and TypeScript + tests compensate for errors.

Will AI replace developers? No. But one developer with a properly configured AI partner is no longer just one developer.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
  'fast-builds-aws': {
    title: 'Fast Builds in AWS: Moving CI/CD Runners to the Cloud and Saying Goodbye to Laptop OOM',
    punchline: 'Your laptop is not a 32-CPU machine. npm install competes with Docker for disk. TypeScript OOMs on a large monorepo, and Playwright cannot exploit parallelism. We break down how to move GitHub Actions runners to AWS — from c7g Spot to actions-runner-controller on EKS — and get a 3-5× build speedup without local hell.',
    readTime: '12 min',
    content: `# Fast Builds in AWS: Moving CI/CD Runners to the Cloud and Saying Goodbye to Laptop OOM

*Your MacBook Pro is running at 98°C. The fan is at maximum. It's the sixth time this morning you've seen "JavaScript heap out of memory." Docker ate all 16 GB, npm install is still chugging, TS compile died. And you need to deploy before lunch.*

*Sound familiar? Let's move the builds to AWS.*

---

## Why the Local Machine Is the Bottleneck

A typical developer laptop in 2026: 8-12 physical cores, 16-32 GB RAM, 512 GB-1 TB NVMe. On paper — plenty of power. In practice, during a monorepo build, here is what happens:

| Resource | Problem |
|----------|---------|
| **CPU** | TypeScript compile (\`tsc\`), webpack/vite, Docker build, ESLint — all want cores at once |
| **RAM** | Node processes, Docker Desktop (4-8 GB), IDE, browser, Slack — OOM is inevitable |
| **Disk** | 2+ GB \`node_modules\`, Docker layer cache, test snapshots — IOPS contention |
| **Thermal throttling** | CPU drops frequency 30-50% after 5 minutes of full load |
| **Network** | npm registry, Docker Hub, GitHub — all funneled through home Wi-Fi |

Now add a self-hosted GitHub Actions runner on the same laptop. Or, as in our case, on a dedicated server that simultaneously runs builds, tests, Playwright, DB migrations, and prod blue-green builds.

**Result:** a build that should take 3 minutes takes 15. Once a week the runner dies with OOM, and you're debugging why \`vitest\` crashed without a stack trace.

---

## Three Sources of Pain in Monorepo Builds

### 1. The OOM Killer Arrives at the Worst Moment

Vitest with 400+ tests, ts-jest with \`maxWorkers=1\`, webpack production build — each of them easily eats 4-6 GB of RAM. When a Docker build with a 2 GB multi-stage image is running in parallel, the kernel OOM-kills the "fattest" process. Almost always that's your test runner.

\`\`\`
# The classic
FATAL ERROR: Reached heap limit Allocation failed -
  JavaScript heap out of memory
\`\`\`

The \`NODE_OPTIONS="--max-old-space-size=8192"\` workaround only buys time. The real problem is that you physically don't have enough memory.

### 2. Disk Contention

SSDs are fast, but not infinite. When simultaneously:
- \`npm ci\` unpacks 200k files into \`node_modules\`
- \`tsc\` writes 50k \`.d.ts\` and \`.js.map\` files
- Docker buildx builds layers via COPY of the full repo
- Vitest writes coverage reports

… NVMe IOPS run out, and everything slows down 3-5×. Especially painful on macOS with Docker Desktop (which virtualizes FS via virtiofs/9p).

### 3. Thermal Throttling Kills Long Builds

The first 2 minutes of a build — full speed. After that, the CPU heats up and the controller drops frequency. On a MacBook Air, that's a fall from 3.5 GHz to 2.0 GHz. A test suite that takes 4 minutes on a cold machine takes 9 on a hot one.

---

## Options: Where to Run Runners

| Option | Pros | Cons |
|--------|------|------|
| **Local laptop** | Zero setup | Everything above |
| **Self-hosted on home server** | Control, cache | Single point of failure, upgrade = buy hardware |
| **GitHub-hosted (standard)** | Zero maintenance | 4 CPU / 16 GB — too small for large builds |
| **GitHub-hosted (large)** | 16-64 CPU | $0.008-0.032/min — pricey at scale |
| **AWS EC2 on-demand** | Any size, SSD | Must configure runner, pay for idle |
| **AWS EC2 Spot** | -70% on cost | Interruptions, need ephemeral runners |
| **AWS Fargate/ECS** | Serverless, no VM management | Slower cold start, disk limits |
| **EKS + actions-runner-controller (ARC)** | Auto-scale, warm pool, cost-efficient | Complex setup, need Kubernetes |

In this guide I focus on AWS, because that's what we configured CI on for SecondLayer.

---

## Architecture 1: EC2 Spot + Ephemeral Runners

The simplest option for a team of 1-10 engineers.

### The idea

For each workflow job, GitHub Actions spins up a fresh EC2 Spot instance, registers it as an ephemeral runner, runs the job, and self-terminates. You pay only during the build.

### Components

\`\`\`
┌─────────────────┐
│  GitHub Action  │
│  workflow       │
└────────┬────────┘
         │ webhook
         ▼
┌─────────────────┐       ┌──────────────────┐
│  AWS Lambda     │──────▶│  EC2 Spot Fleet  │
│  (runner boot)  │       │  c7g.4xlarge     │
└─────────────────┘       │  (ARM, Graviton) │
                          └──────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  ephemeral       │
                          │  GHA runner      │
                          │  (1 job → self-  │
                          │   terminate)     │
                          └──────────────────┘
\`\`\`

### Key settings

**Instance type:** \`c7g.4xlarge\` (16 vCPU ARM Graviton3, 32 GB RAM, $0.0544/hr Spot in eu-central-1 at the time of writing). For x86 builds — \`c7i.4xlarge\`. Graviton gives ~30% better price/performance if your stack is compatible (Node.js 20, Docker multi-arch — they are).

**Storage:** gp3 EBS with \`iops=6000, throughput=500 MB/s\`. Critical: default gp3 gives 3000 IOPS, which immediately becomes a bottleneck during builds.

**AMI:** a custom AMI with Node 20, Docker, gh-runner, and pnpm/npm cache from the previous build preinstalled. Saves 40-90 seconds on boot.

**IAM:** GitHub → AWS via OIDC (no long-lived keys). \`sts:AssumeRoleWithWebIdentity\` scoped to \`repo:overthelex/secondlayer:ref:refs/heads/main\`.

### Real numbers from our experiments

| Metric | Self-hosted on local server | AWS c7g.4xlarge Spot |
|--------|-----------------------------|---------------------|
| \`npm ci\` (cold cache) | 94 s | 28 s |
| \`tsc --build\` (monorepo) | 142 s | 47 s |
| Vitest 422 tests | 78 s | 31 s |
| Docker build \`mono-backend\` | 186 s | 71 s |
| Full pipeline (incl. deploy) | 11 min 40 s | 4 min 10 s |
| Cost | $0 (but OOM 2×/week) | $0.004 per build (Spot) |

**3× speedup for ~$0.10/day at medium activity.** That's cheaper than one junior hour spent waiting on a build.

---

## Architecture 2: actions-runner-controller on EKS

For a team of 10+ and high parallel build volume.

### The idea

A Kubernetes controller (ARC) listens to GitHub webhooks and spins up runner pods in your EKS cluster on demand. Pods can have a warm pool (2-4 runners always ready), so cold start is near zero.

### Advantages over option 1

- **Warm pool** — 0 seconds to start a job (vs 40-60 s for EC2 boot)
- **Ephemeral pods** — each job in a clean environment, no shared state
- **Horizontal scaling** — 50 parallel jobs = 50 pods on Spot nodes
- **Shared cache via EFS/S3** — \`node_modules\`, Docker layers, Playwright browsers

### Minimal config

\`\`\`yaml
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: legal-org-ua-runners
spec:
  replicas: 4
  template:
    spec:
      repository: overthelex/secondlayer
      labels:
        - aws-eks
        - graviton
      resources:
        limits:
          cpu: "8"
          memory: "16Gi"
      dockerdWithinRunnerContainer: true
      nodeSelector:
        karpenter.sh/capacity-type: spot
        kubernetes.io/arch: arm64
\`\`\`

Karpenter auto-provisions Spot nodes of the right type when a pending pod appears. When builds finish, nodes sleep after 30 seconds.

### Real case

A company with ~80 engineers, 200-300 PRs/day:
- Before: GitHub-hosted large runners, $4800/month
- After: ARC on EKS with Spot, ~$900/month
- Speed: identical, thanks to the warm pool
- Overhead: one DevOps engineer spent 2 weeks on setup

---

## Typical Optimizations That Pay Off the Most

### 1. Layer cache via ECR + BuildKit

\`\`\`yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache
    cache-to: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache,mode=max
\`\`\`

On our \`Dockerfile.mono-backend\`: first build 186 s, subsequent (with cache) — 24 s.

### 2. npm/pnpm cache via S3 or actions/cache with AWS backend

Instead of fetching 2 GB \`node_modules\` from npm registry every time — we store it in S3, mount it at \`~/.npm\`. At 10 Gbit/s inside AWS, that's ~5 seconds vs 60+ from npm registry.

### 3. Matrix test parallelism

\`\`\`yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx vitest run --shard=\${{ matrix.shard }}/4
\`\`\`

422 tests on 4 shards — 31 s instead of 78 s. Sharding only works when you have resources for parallelism — on AWS, that's cheap.

### 4. Warm image (custom AMI or prebaked container)

Pre-install: Node 20, pnpm, Docker, gh, AWS CLI, Playwright browsers, Chrome deps. Saves 60-120 s on cold start.

### 5. Ephemeral runners for security

Every job in a fresh runner = zero leaked credentials, zero state from a previous build. Mandatory for public forks.

---

## What People Skip but Shouldn't

**1. Ignoring data transfer costs.** If your runner pulls 10 GB from Docker Hub on every build, and you run 300 builds/day — that's 3 TB/day × $0.09/GB egress = $270/day. Fix: ECR pull-through cache scoped to your AWS region.

**2. Secrets via GitHub Secrets instead of AWS Secrets Manager.** GitHub Secrets are capped at 64 KB, don't auto-rotate, and are visible in the audit log. The right way: GitHub OIDC → IAM role → Secrets Manager.

**3. One large runner instead of many small ones.** \`c7g.16xlarge\` is more expensive than 4× \`c7g.4xlarge\` and offers less parallelism. Horizontal scaling almost always wins.

**4. Forgetting about GitHub Actions runner version drift.** Ephemeral runners must auto-update at boot, otherwise GitHub will disable jobs after a year.

**5. No Spot interruption handler.** Spot can reclaim an instance with a 2-minute warning. You need: graceful runner shutdown, retry on another runner.

---

## The Economics: When Does Migration Make Sense?

### Formula

\`\`\`
Savings (USD/mo) = (old_avg_time - new_avg_time)
                 × builds_per_day × 22 days × eng_hourly_cost / 3600
\`\`\`

### Example for SecondLayer

- Before: 11 min 40 s average pipeline on self-hosted
- After: 4 min 10 s on AWS c7g Spot
- Savings: 7 min 30 s × 15 builds/day × 22 days = 41 hours/month
- At $40/hr engineer = **$1640/month saved**
- AWS cost (Spot + EBS + data): ~$80/month

**20× ROI. And that's before counting the engineer's laptop not hitting 98°C during yet another iteration.**

---

## When AWS Runners Are *Not* the Right Idea

- **A project with 2-3 builds per week** — setup overhead won't pay back. Use GitHub-hosted standard.
- **Secret data that can't leave on-prem** — e.g., HIPAA / military data. Self-hosted on-prem.
- **Physical hardware testing** — iOS builds need macOS runners (available via MacStadium, but that's a separate pain).
- **Team without Kubernetes expertise** — ARC on EKS without experience quickly becomes a "black box."

For everything else — AWS runners win.

---

## How to Get Started Tomorrow

Minimum path (1-2 hours of setup):

1. **Create a GitHub OIDC provider in IAM** — no long-lived keys.
2. **Create an IAM role** trusting \`token.actions.githubusercontent.com\` with permissions for \`ec2:RunInstances\`, \`ec2:TerminateInstances\`.
3. **Spin up one EC2 self-hosted runner** using \`actions/runner\` on \`c7g.4xlarge\` Spot. Download runner binary, register with \`--ephemeral\`.
4. **In the workflow, replace** \`runs-on: ubuntu-latest\` with \`runs-on: [self-hosted, aws, arm64]\`.
5. **Measure** build time. If you see savings — automate via Terraform/Pulumi/CDK.

Next steps (a week):
- Layer cache via ECR
- S3 backend for \`actions/cache\`
- Test sharding
- Custom AMI with prewarm

Later (a month):
- ARC on EKS + Karpenter
- Warm pool
- Observability via CloudWatch + Prometheus

---

## Conclusion

Local builds on a laptop are the most expensive option by any measure: time spent, nerves, hardware wear. A self-hosted runner on a dedicated server is better, but still bottlenecks on hardware.

AWS runners are not "moving to the cloud for fashion." It's a simple engineering decision: 16 cores at $0.05/hr run faster than 8 cores of a thermal-throttled laptop. And ephemeral runners solve a heap of security problems you don't think about on a local machine until the first incident.

For SecondLayer we started with a self-hosted runner on \`local.legal.org.ua\`. It's still alive for the blue-green preview phase because it needs access to the prod network. But heavy builds, tests, and Docker — all of that is on AWS Spot now. **Every week we save 40+ minutes of an engineer's life.** And with every new service in the monorepo, that gap only grows.

If your laptop is noisy during \`npm run build\` — you're already paying. The only question is who gets your money.

---

Registration: [legal.org.ua](https://legal.org.ua)`,
  },
};
