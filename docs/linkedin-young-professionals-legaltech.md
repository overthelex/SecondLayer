# How We're Building an AI Platform for Lawyers: The Engineering Behind legal.org.ua

*An article for the "Young LegalTech Professionals" LinkedIn group*

---

Hello, colleagues! We're the team behind [legal.org.ua](https://legal.org.ua), and over the past few months we've published a series of technical and product articles about how we're building an AI platform for Ukrainian lawyers. We'd like to share some of the key decisions and lessons learnt — hopefully they'll be useful to those of you working at the intersection of law and technology.

## What Is LEX AI

LEX AI is a platform that gives lawyers access to 58 AI-powered tools: semantic search across court practice, legislation analysis, counterparty verification across 18 state registries, document management — all through a single interface. A lawyer asks a question in natural language, and the system autonomously selects the right tools, performs the search, and produces an answer with references to primary sources.

## Architecture: Model Context Protocol (MCP)

At the heart of the platform is [MCP — the Model Context Protocol](https://legal.org.ua/blog?article=monolith-to-mcp). We started as a REST API with 10 endpoints; now we have 3 microservices with triple transport (stdio, HTTP, SSE). MCP allows the AI to discover and use tools on its own — a fundamentally different approach from classical REST, where the client is a human.

For a deeper look at the architecture behind 58 tools, see ["How We Built an MCP Server With 56 Tools for Legal AI"](https://legal.org.ua/blog?article=mcp-server-architecture).

## Semantic Search Instead of Keywords

A classic problem: a lawyer searches for "compensation for damages from a flooded flat" and misses a case where the court writes about "tortious liability for property damage resulting from engineering network failures". We [split 12 Ukrainian legal codes into 5,191 articles](https://legal.org.ua/blog?article=semantic-search-legislation), vectorised each one using embeddings, and now search works by meaning rather than word matching.

On the difference between the two approaches, see ["Searching Court Decisions by Meaning, Not by Keywords"](https://legal.org.ua/blog?article=semantic-vs-keyword-search).

## 30.4 Million Court Decisions from Open Data

One of the biggest engineering challenges was [importing full texts of court decisions from the EDRSR (Unified State Register of Court Decisions)](https://legal.org.ua/blog?article=edrsr-fulltext-pipeline). 30.4 million documents, 137 GB of data, 685 courts. We've made a principled decision to work exclusively with open data sources — it gives us independence from commercial APIs and predictability.

## Zero Tolerance for Hallucinations

AI confidently cites non-existent articles and fabricates case numbers. In the legal domain, this isn't just an error — it's potential malpractice. We built [two layers of protection: HallucinationGuard and CitationValidator](https://legal.org.ua/blog?article=hallucination-guard). Every reference in a response is verified against real databases. Every case number is clickable and links to the primary source.

## Due Diligence in 2 Seconds

Checking a counterparty used to take 30–60 minutes and 4–5 different websites. Now it's [one query, 18 registries, full picture](https://legal.org.ua/blog?article=due-diligence-ai): company registration number, founders, beneficial owners, enforcement proceedings, bankruptcy. We've recently added the [debtors' register and the NBU (National Bank of Ukraine) bank register](https://legal.org.ua/blog?article=erb-nbu-due-diligence).

## Confidentiality as Architecture

Lawyers simply cannot upload client documents to ChatGPT — it breaches legal professional privilege. We [built a system](https://legal.org.ua/blog?article=data-privacy-ai) where every matter is isolated, every action is recorded in an audit trail, legal holds block deletion, and GDPR is not a tick-box exercise but an architectural decision.

## Authentication via Diia

Instead of yet another OAuth provider, we [integrated Diia.Signature](https://legal.org.ua/blog?article=diia-digital-identity) — Ukraine's national digital identity system. A passport on your smartphone becomes the key to legal AI. For a platform where identity verification is a legal requirement, this is the only appropriate level of assurance.

## Legal Consultation Marketplace

Our latest major addition is a [marketplace with attorney verification via the ERAU (Unified Registry of Attorneys of Ukraine) and escrow payments via Monobank](https://legal.org.ua/blog?article=attorney-marketplace). The full cycle: client finds a lawyer → requests a consultation → attaches documents from the vault → pays via escrow → communicates in a real-time chat → leaves a review. No phone calls, no emails, no manual coordination.

## Infrastructure and Optimisation

A separate series of articles covers the engineering challenges:

- [**Chat latency: from 12 to 2.8 seconds**](https://legal.org.ua/blog?article=chat-latency-optimization) — 7 phases of agentic pipeline optimisation
- [**AWS Bedrock as an LLM provider**](https://legal.org.ua/blog?article=bedrock-llm-fallback) — one SDK instead of two libraries, IAM instead of API keys, data within the EU
- [**Migrating to Google Cloud**](https://legal.org.ua/blog?article=gcp-cloud-scaling) — Cloud Run with autoscaling, full infrastructure for $280–430/month
- [**MCP Connect**](https://legal.org.ua/blog?article=mcp-connect-open-data) — connecting Nextcloud, Google Drive, and 1,400+ open datasets
- [**Server-side evidence extraction**](https://legal.org.ua/blog?article=server-side-evidence) — time to first evidence from 2.1s down to 0.8s
- [**Why we abandoned Round-Robin between OpenAI and Anthropic**](https://legal.org.ua/blog?article=round-robin-llm) — lessons from multi-provider failures

## The Key Takeaway

[AI won't replace a lawyer — but a lawyer with AI will replace a lawyer without it](https://legal.org.ua/blog?article=ai-wont-replace-lawyers). AI doesn't make strategic decisions and doesn't replace experience. But it does replace the 6 hours of manual research that precede legal reasoning. The lawyer across the street who analyses 300 cases instead of 30 and checks 18 registries instead of 3 — that's the real competitive threat.

---

All articles are available on [our blog](https://legal.org.ua/blog). We build in the open and share our experience — join the conversation.

🔗 [legal.org.ua](https://legal.org.ua) | [Blog](https://legal.org.ua/blog)

#LegalTech #AI #Ukraine #MCP #LegalInnovation #BuildInPublic
