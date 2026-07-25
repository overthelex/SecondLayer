# Collaboration Outreach Emails

## Email 1: Amanda Askell (Anthropic) — PRIMARY TARGET

**To:** amanda@askell.io
**Subject:** Collaboration: edit-trace oversight as alignment signal — 30K pairs from production Claude Code workflows

---

Dear Dr. Askell,

I'm writing because your "Values in the Wild" work — extracting implicit value signals from 308K real Claude conversations — is the closest published research to a complementary question I've been investigating empirically: what alignment signal is produced when a practitioner works recursively with Claude Code over consequential, multi-step workflows?

I'm a solo founder who built a production legal AI platform (legal.org.ua) using Claude Code as my primary engineering counterpart — 1,547 merged PRs across 7 projects in 105 days. During this process, I instrumented the workflow to capture every human edit on every LLM output: 30,510 edit-trace pairs across 2,892 sessions, with 1,579 outcome-attributed results.

The core finding is that these in-the-loop corrections produce a qualitatively different preference distribution than what we'd expect from detached annotation: 80.7% substantive rewrites (median edit distance 0.84), and rejection of agent output correlates with 78% positive downstream outcomes — suggesting the binary accept/halt decision is the single most informative oversight signal.

I've formalized this as "edit-trace oversight" with a domain constitution (five formal conditions under which edit-traces constitute valid oversight), run three preliminary experiments (distributional analysis, behavioral context via OS-level instrumentation, outcome correlation), and have DPO training infrastructure ready for the flagship experiment comparing edit-trace preferences against RLAIF self-correction and public RLHF baselines on matched 24K-pair volumes.

The draft paper is attached. I'm looking for an academic co-author who can strengthen the experimental methodology and help position the work for NeurIPS Datasets 2027 or an ICLR workshop. Your expertise in constitutional alignment methodology and empirical measurement of AI values in production would be particularly valuable for the domain constitution framework and the DPO experiment design.

Would you be open to a 30-minute conversation about potential collaboration?

Best regards,
Vladimir Ovcharov
CEO, LEX AI LLC (legal.org.ua)
Kyiv, Ukraine
volodymyr@legal.org.ua

---

## Email 2: Rafael Rafailov (Thinking Machines / ex-Stanford)

**To:** rafailov@cs.stanford.edu (may forward) + Twitter DM @rm_rafailov
**Subject:** New preference signal type for DPO — 30K edit-traces from production agentic workflows

---

Dear Rafael,

Your DPO work fundamentally changed how we think about preference optimization, and I've been investigating a question that directly extends it: what happens when the preference signal comes from in-the-loop corrections during production agentic workflows, rather than from detached annotation?

I built a production legal AI platform using Claude Code as primary engineering counterpart (1,547 PRs in 105 days, paying customers). By instrumenting the workflow, I captured 30,510 edit-trace pairs — every human correction on every LLM output, with outcome attribution.

The distributional signature is dramatically different from standard RLHF: 80.7% substantive rewrites (median edit distance 0.84), and the most informative signal is binary rejection (78% positive outcomes when the practitioner halts the agent). This is a fundamentally different preference distribution than crowd annotation produces, and the question is whether DPO training on this distribution outperforms DPO on RLAIF self-correction or general-purpose RLHF.

I have the DPO experiment ready to run:
- Condition A: 24,495 edit-trace preference pairs (practitioner oversight)
- Condition C: 24,495 RLAIF self-correction pairs (Claude Haiku on same inputs)
- Condition E: 24,495 UltraFeedback pairs (public baseline)
- Condition D: Stock Llama 3.1 8B (no preference training)

All data is on S3, SageMaker infrastructure is configured. The question I can't answer alone is whether the experimental design is rigorous enough for a top venue.

The draft paper is attached — I'm looking for an academic co-author with deep expertise in preference optimization methodology. Your recent work on RL scaling and inference-time compute suggests you're thinking about exactly the kind of signal quality questions this work addresses.

Would you have 20 minutes for a conversation?

Best regards,
Vladimir Ovcharov
CEO, LEX AI LLC (legal.org.ua)
volodymyr@legal.org.ua

---

## Email 3: Jacob Steinhardt (UC Berkeley) — MORE REALISTIC TARGET

**To:** jsteinhardt@berkeley.edu
**Subject:** Edit-trace oversight: empirical alignment signal from production human-LLM workflows (30K pairs)

---

Dear Prof. Steinhardt,

I'm reaching out because your work on AI safety and alignment methodology — particularly empirical approaches to understanding model behavior — connects directly to a dataset and methodology I've been developing.

I'm a solo founder who shipped a production legal AI platform using Claude Code (1,547 PRs, 105 days, paying customers). By instrumenting the entire workflow, I captured 30,510 human edit-traces: every correction the practitioner applied to LLM output, with semantic classification and outcome attribution.

Key empirical findings (3 experiments completed):
1. The practitioner's edit distribution is extreme: 80.7% substantive rewrites, median edit distance 0.84 — qualitatively different from expected crowd annotation patterns.
2. Behavioral context (OS-level keystroke/idle/app-switching data) is statistically significant (permutation p<0.001) but redundant with artifact features for prediction — suggesting the edit itself captures most of the signal.
3. Binary rejection (halting the agent) is the strongest predictor of positive outcomes (78%), more informative than edit depth.

I've formalized this as "edit-trace oversight" with a domain constitution — five conditions under which in-the-loop corrections constitute valid alignment signal. The DPO experiment (edit-trace vs RLAIF vs public RLHF, matched 24K volumes) is infrastructure-ready.

I'm looking for an academic collaborator to strengthen the experimental methodology and co-author for NeurIPS Datasets 2027 or ICLR. The dataset itself (30K pairs from a single production practitioner with outcome labels) is unusual enough to merit a datasets contribution independent of the DPO results.

Draft attached. Would you be open to discussing this?

Best regards,
Vladimir Ovcharov
CEO, LEX AI LLC (legal.org.ua)
volodymyr@legal.org.ua

---

## Sending Strategy

1. **Amanda Askell first** (highest thematic overlap via "Values in the Wild", verified email, philosopher who understands methodological nuance)
2. **Rafailov second** (DPO author, but now at industry startup — may be less available for academic collaboration)
3. **Steinhardt third** (assistant prof actively publishing in AI safety, more likely to take on collaboration)

Wait 5-7 days between sends. If no response in 10 days, follow up once. Do not mass-email — each is a targeted pitch.

## What to Attach

- The compiled PDF (main.pdf, 18 pages)
- NOT the raw data or code — those come after initial conversation
