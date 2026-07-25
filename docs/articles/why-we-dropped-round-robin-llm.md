# Why We Dropped Round-Robin Between OpenAI and Anthropic — And What We Use Instead

*Building a legal AI platform taught us that multi-provider LLM routing sounds great in architecture diagrams but breaks in production.*

---

## The Idea That Made Perfect Sense

When we started building LEX AI — a platform that analyzes millions of Ukrainian court decisions — we did what every AI-first team does: we integrated multiple LLM providers.

OpenAI for structured output. Anthropic for nuanced legal reasoning. Round-robin between them for resilience and cost optimization.

On paper, it was elegant. In production, it was a nightmare.

## What Actually Went Wrong

### 1. Response Format Fragmentation

Our agentic pipeline runs up to 5 tool-calling iterations per user query. Each iteration expects a normalized response: `tool_calls`, `finish_reason`, structured JSON.

OpenAI and Anthropic return these differently. We built a normalization layer. It handled 90% of cases. The other 10% — empty responses, partial JSON, unexpected stop reasons — caused silent failures deep in the loop.

One bug took us 3 days to find: Anthropic occasionally returned a valid response with `stop_reason: "end_turn"` instead of `"tool_use"`, which our normalizer passed through, but the next iteration treated as a final answer. The user got a half-finished analysis with no indication anything went wrong.

### 2. The Same Prompt, Two Different Behaviors

Legal AI lives and dies by prompt precision. Our system prompt instructs the model to act as a Ukrainian legal assistant, classify intent, select tools, and respond in structured format.

Claude followed Ukrainian-language instructions more faithfully. GPT produced cleaner JSON tool calls. When the model changed on every iteration of the agentic loop, the output quality became a coin flip.

A classification step on GPT would say "civil_property". The same query on Claude would say "civil_law_property_dispute". Our downstream tool router expected exact matches.

### 3. Debugging Became Archaeology

When a user reported a bad result, we'd look at the trace:

- Step 1: OpenAI (classified intent)
- Step 2: Anthropic (generated search plan)
- Step 3: OpenAI (executed tools)
- Step 4: Anthropic (synthesized answer)

Which step failed? Was it the model or the normalization? Could we reproduce it? Not really — the next run might route differently.

We spent more time debugging the routing layer than improving actual legal analysis.

### 4. Cost "Optimization" That Wasn't

Round-robin was supposed to balance costs. Instead:

- Anthropic's pricing for deep analysis queries was 2-3x higher than OpenAI's equivalent
- But Anthropic was cheaper for short classification calls
- Round-robin ignored this entirely — it just alternated

We were paying premium prices on tasks that didn't need premium models, and using budget models on tasks that did.

### 5. Two Sets of Everything

Each provider has its own:

- Rate limits (different thresholds, different headers)
- Retry strategies (different backoff recommendations)
- Error formats (different HTTP codes for the same problem)
- SDK updates (breaking changes on different schedules)

Our "unified" retry layer was actually two retry layers wearing a trench coat.

## What We Do Now

We hardcoded OpenAI as the sole provider and invested the saved complexity into **budget-aware model selection within a single provider**:

```
quick    → gpt-5-nano    (intent classification, routing)
standard → gpt-5-mini    (tool execution, summarization)
deep     → gpt-5.1       (legal analysis, pattern extraction)
```

Same API format. Same error handling. Same retry logic. Predictable costs. Reproducible results.

The `@deprecated` tag on our `getNextProvider()` method is the best line of code we wrote all year.

## How to Actually Use Multiple Providers (If You Must)

After learning the hard way, here's what we'd recommend:

**Task routing, not round-robin.** Assign each provider to specific task types permanently. Classification always goes to Provider A. Deep analysis always goes to Provider B. Never alternate within a single pipeline.

**Fallback, not alternation.** Provider B activates only when Provider A returns 429 or 500. This is resilience. Round-robin is chaos.

**Multi-key, single provider.** If rate limits are your bottleneck, use multiple API keys from the same provider with key rotation. Same format, same behavior, higher throughput.

**A/B test offline.** Compare providers in a separate evaluation pipeline with fixed test cases. Never A/B test in production user-facing flows.

## Why AWS Bedrock Changes the Equation

If we were starting today, we'd skip direct API keys entirely and go with AWS Bedrock. Here's why:

**One endpoint, all models.** Claude, Llama, Mistral, Titan — all accessible through the same AWS SDK. Switching models means changing a `modelId` string, not swapping SDKs.

**No API keys in your environment.** Bedrock uses IAM roles. Your EC2 instance gets permissions through its role — no `OPENAI_API_KEY` sitting in a `.env` file that someone will accidentally commit.

**Your data stays in your region.** For legal tech, this matters enormously. When you call OpenAI's API, your data travels to their infrastructure. With Bedrock in `eu-central-1`, the data never leaves your AWS account. For a platform handling sensitive court documents and client data, this isn't a nice-to-have — it's a compliance requirement.

**Unified billing and monitoring.** One AWS bill instead of separate invoices from OpenAI and Anthropic. CloudWatch metrics out of the box instead of building your own cost tracker.

**Provisioned throughput.** Instead of hitting rate limits and building retry logic, you reserve capacity. Predictable performance, predictable costs.

**Network latency.** If your infrastructure is already on AWS (ours runs on EC2 in Frankfurt), Bedrock calls stay within the AWS network. No public internet hop. Lower latency, higher reliability.

## The Takeaway

Multi-provider LLM architectures aren't wrong — they're premature for most teams. The complexity cost is real: normalization layers, dual retry logic, unpredictable outputs, impossible debugging.

Start with one provider. Invest in model selection within that provider. Build proper evaluation pipelines. And when you're ready for multi-provider, use an abstraction layer like Bedrock that handles the hard parts for you.

The best architecture isn't the one with the most providers. It's the one where you can reproduce a bug on the first try.

---

*We're building LEX AI — an AI-powered legal research platform analyzing Ukrainian court decisions, legislation, and public registries. If you're working on legal tech or AI infrastructure, let's connect.*

*#LegalTech #AI #LLM #OpenAI #AWS #Bedrock #Architecture #StartupLessons*
