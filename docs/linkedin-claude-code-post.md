# 735 commits in 25 days: Claude Code as a full engineering partner

This isn't a promo post. It's a transparent breakdown of real stats from building a legal tech platform, data pipelines, and infrastructure — with one developer and an AI partner.

---

Context: I'm the sole developer of SecondLayer (LEX AI) — a Ukrainian legal tech platform: AI-powered court decision analysis, semantic search across 100M+ decisions, legislation, registries, consultations. Monorepo with three MCP servers, React frontend, Flutter mobile app, and data pipelines for 340M+ records from 15 government APIs.

Instead of a team of 5-10 engineers, I work with Claude Code as a full-time engineering partner: from writing code to deploying to prod.

---

The numbers (March 18 — April 12, 2026):

- 486 sessions (285 analyzed in detail)
- 5,612 messages
- 735 commits
- +193,340 lines written, -14,259 deleted
- 1,811 files changed
- 22,326 bash commands
- 3,782 edit operations
- 864 sub-agents spawned
- 41% of messages ran in parallel sessions

This isn't theoretical productivity. This is a real git log.

---

What I actually built:

1. Legal tech platform (28 sessions) — bug fixes, new features (Diia authentication, developer contracts, email notifications, Spanish localization with geo-detection), UI redesign, 93+ tests. Claude Code worked as a full-stack developer: multi-file changes, PR creation, merge, deploy — all in one session.

2. Data pipelines for open data (18 sessions) — 44K documents from Parliament, 11.6M+ spending.gov.ua records, 190K+ trademarks from Ukrainian patent office, 58K+ court decisions. Claude orchestrated multi-server, multi-IP parallel download scripts. Debugged rate limiting and WAF blocking. Managed PostgreSQL bulk imports with repartitioning and GIN indexes on 63M rows.

3. Infrastructure & DevOps (16 sessions) — EC2 provisioning across regions (Paris, Spain), CI/CD pipeline fixes, blue-green deploy with preview environment, Docker/nginx debugging, server migrations. Claude used AWS MCP tools for direct infrastructure provisioning.

4. MCP Server Ecosystem (14 sessions) — built and configured MCP servers for Nextcloud Deck/Tables, Thunderbird email, and ChatGPT. Migrated 180 tasks from Linear to Nextcloud Deck. Synced 402 issues.

5. Content & side projects (8 sessions) — investor memo, legal documents, blog articles, official letters, and... a Telegram bot with Bender (Futurama) quotes with a multilingual database.

---

What works best:

Multi-file changes (56 sessions) — when you need to change a type in a shared package, update the backend handler, frontend component, and tests simultaneously — Claude Code does it in one iteration. For a human, that's 30-60 minutes of context switching.

Debugging (25 sessions) — Claude reads logs, finds root cause, proposes a fix. Not always on the first try — but significantly faster than googling Stack Overflow.

MCP integrations as operational infrastructure — I connected Claude Code with Nextcloud Deck (task management from terminal), AWS API (EC2 provisioning without leaving the IDE), Thunderbird (email management via MCP), and custom MCP servers. This isn't a proof-of-concept. It's real operational infrastructure for daily work.

---

Where it doesn't work (honestly):

Wrong approach — 106 cases. Claude often starts with the wrong approach: searches in the wrong directory, tries SSH tunneling instead of using MCP tools, picks a slow strategy for DB operations. Example: for repartitioning a large PostgreSQL table, Claude tried batch DELETE+INSERT, screen sessions that died, deadlocks — until I suggested bulk INSERT + TRUNCATE.

Buggy code — 102 cases. Code doesn't always work on the first try. Type errors, missing imports, incorrect SQL queries. But with TypeScript and tests, these get caught quickly.

Marathon sessions = more errors. Sessions with 10+ different tasks accumulate more mistakes. Focused sessions on 2-3 tasks consistently achieve full results.

---

The economics:

AI partner: ~$200/month (Claude Pro), 24/7 availability, parallel sessions, zero onboarding (CLAUDE.md), instant scaling.

Team of 3: $15,000-30,000/month, working hours only, 2-4 weeks onboarding, months to hire.

This doesn't mean "AI will replace developers." It means: one experienced engineer with an AI partner can do the work of a small team.

---

Practical advice:

1. CLAUDE.md is your onboarding document. Instead of explaining every session "we use PostgreSQL, SSH as ubuntu, deploy via CI/CD" — write it once. We cut wrong-approach incidents in half after documenting infrastructure conventions.

2. Focused sessions > marathons. 2-3 related tasks per session. Not 10+. Context window isn't infinite, and quality degrades with context switches.

3. MCP is serious infrastructure. Connect Nextcloud/Linear for tasks, AWS MCP for infrastructure, email MCP for communications. Claude Code becomes not just a coder, but a full operational hub.

4. Don't write detailed prompts. Launch Claude on a task and course-correct. It's faster than spending 10 minutes crafting the perfect prompt. Claude adapts to your corrections.

5. Tests and TypeScript are your safety net. 102 cases of buggy code are fine if you have tests and type checking. We catch 90% of errors automatically.

---

735 commits in 25 days isn't science fiction. It's the result of systematic work with an AI partner where CLAUDE.md replaces onboarding, MCP integrations replace tool-switching, parallel sessions (41% of messages) replace waiting, TypeScript + tests compensate for buggy code, and real-time course correction compensates for wrong approaches.

Will AI replace developers? No. But one developer with a properly configured AI partner is no longer just one developer. It's a small team that never sleeps, never gets sick, and can simultaneously deploy to prod, scrape 11M records, and build a Telegram bot with Bender quotes.

---

Read the full version (in Ukrainian): legal.org.ua/blog
