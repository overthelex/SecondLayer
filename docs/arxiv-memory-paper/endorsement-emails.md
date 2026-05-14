# arXiv cs.SE Endorsement Request Emails

Endorsement code: **VGAFCQ**
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ
Attach: arxiv-memory-paper-draft.pdf

---

## 1. Charles Packer (cpacker@berkeley.edu)

**Subject:** arXiv endorsement request: Workflow Memory for agentic coding agents (builds on MemGPT)

Dear Dr. Packer,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper directly extends the memory management paradigm you introduced in MemGPT. Where MemGPT manages memory pages for dialogue continuity, we address a gap in long-horizon agentic engineering: decision provenance across weeks of dormant tasks. The architecture introduces dual-mode retrieval -- pull at session start plus push-based refresh proportional to repository activity -- so that a coding agent resuming a 3-week-dormant task retrieves already-current context.

The system is deployed on a production legal-tech platform (70+ MCP tools, 380M+ records, 1,547 merged PRs in 105 days by a single practitioner working with Claude Code). Baseline measurements from 304 sessions show 30K bootstrap tokens and 60% context waste -- the reduction targets are <=10K tokens and <=20% waste.

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- MCP protocol tools: 70+ tools serving court decisions, legislation, business registry data

A draft is attached. I would particularly value your perspective on the memory layer design (Section 4) and its relationship to MemGPT's tiered memory.

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 2. Carlos E. Jimenez (carlosej@princeton.edu)

**Subject:** arXiv endorsement request: Workflow Memory for long-horizon coding agents (tested on SWE-agent trajectories)

Dear Carlos,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper addresses a problem visible in SWE-bench evaluations: coding agents lose architectural context across sessions. We present a three-layer workflow memory with dual-mode retrieval (pull at session start, push during dormancy) that maintains decision provenance across weeks of inactivity. Cross-domain validation uses SWE-agent trajectory data (6,636 trajectories) alongside our production dataset.

The architecture is deployed on a production legal-tech platform where a single practitioner shipped 1,547 merged PRs in 105 days using Claude Code. Baselines from 304 sessions show 30K bootstrap tokens and 60% context waste.

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- Cross-domain datasets: SWE-agent (6,636 trajectories), DevGPT (615 repos), RAGBench (95K examples)

A draft is attached. Section 7.2 covers the cross-domain validation where SWE-agent data is used.

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 3. John Yang (johnby@stanford.edu)

**Subject:** arXiv endorsement request: Workflow Memory for long-horizon coding agents (cross-validated on SWE-agent)

Dear John,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper tackles context loss in long-horizon agentic engineering -- the scenario where SWE-agent solves issues within a session but architectural decisions from prior sessions are unavailable. We introduce dual-mode retrieval: pull queries at session start plus push-based refresh for dormant tasks. The architecture maintains decision provenance (which alternative was chosen, which validator enforces it, which constitutional principle anchors it) across multi-week task horizons.

Cross-domain validation includes SWE-agent trajectories (6,636 samples) to demonstrate generalization beyond our primary production dataset (304 Claude Code sessions, 1,547 PRs, 70+ MCP tools).

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- SWE-agent validation: Section 7.2 of the attached draft

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 4. Graham Neubig (gneubig@cs.cmu.edu)

**Subject:** arXiv endorsement request: Workflow Memory extending code-RAG with decision provenance

Dear Prof. Neubig,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper extends the code-RAG paradigm evaluated in CodeRAG-Bench. While code-RAG retrieves relevant code snippets, it misses decision provenance -- the rationale, rejected alternatives, and cross-cutting constraints behind architectural choices. Our workflow memory architecture adds a three-layer decomposition (domain, workflow, practitioner) with dual-mode retrieval: pull at session start and push-based refresh proportional to repository activity.

The system is deployed on a production legal-tech platform (70+ MCP tools, 380M+ records) where a single practitioner shipped 1,547 PRs in 105 days. Cross-domain validation uses RAGBench (95K examples across 12 domains) alongside SWE-agent trajectories and DevGPT data.

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- RAGBench cross-domain validation: Section 7.2

A draft is attached. Section 2.2 discusses the code-RAG gap that motivates our approach, citing CodeRAG-Bench directly.

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 5. Daniel Fried (dfried@cs.cmu.edu)

**Subject:** arXiv endorsement request: Workflow Memory for coding agents (decision provenance beyond code-RAG)

Dear Prof. Fried,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper addresses a limitation in code-RAG systems: they retrieve code but not the decision provenance behind it. Our architecture adds a workflow memory layer that stores principle ledgers, ADR-style decisions, and practitioner correction patterns, retrieved via dual-mode retrieval (pull at session start, push during dormancy).

Deployed on a production legal-tech platform (70+ MCP tools, 1,547 PRs in 105 days), baseline measurements from 304 sessions show 30K bootstrap tokens and 60% context waste. Cross-domain validation includes RAGBench (95K examples), SWE-agent (6,636 trajectories), and DevGPT (615 repos).

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer

A draft is attached.

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 6. Joon Sung Park (joonspk@stanford.edu)

**Subject:** arXiv endorsement request: Workflow Memory extending Generative Agents memory to agentic engineering

Dear Joon Sung,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper extends the memory architecture paradigm you introduced in Generative Agents to long-horizon agentic engineering. Where Generative Agents uses observation-reflection-planning for simulated characters, we decompose memory into domain, workflow, and practitioner layers for coding agents operating over multi-week task horizons. The key new primitive is dual-mode retrieval: pull-based at session start (analogous to your reflection mechanism) and push-based refresh during dormancy (no analogue in episodic memory systems).

We also introduce retrieval-correction edits as a scalable oversight signal -- corrections that would have been unnecessary had memory surfaced the right context -- connecting the memory layer to alignment infrastructure.

The system is deployed on a production legal-tech platform (70+ MCP tools, 380M+ records, 1,547 PRs in 105 days).

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- Related work comparison: Section 2.1 of the attached draft

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua

---

## 7. Samuel R. Bowman (bowman@nyu.edu)

**Subject:** arXiv endorsement request: Workflow Memory as scalable oversight infrastructure for coding agents

Dear Prof. Bowman,

I am an independent researcher (LEX AI LLC, Kyiv) submitting my first arXiv preprint to cs.SE and would be grateful if you could endorse me.

The paper's third contribution directly addresses the scalable oversight problem you identified in "Measuring Progress on Scalable Oversight." We introduce retrieval-correction edits -- practitioner corrections that would have been unnecessary had memory surfaced the right context -- as a process-level oversight signal. This signal is denser than outcome-level supervision (one binary outcome per session vs. multiple retrieval-correction edits per session) and scales with agent autonomy rather than degrading.

The architecture is a three-layer workflow memory with dual-mode retrieval, deployed on a production legal-tech platform (70+ MCP tools, 1,547 PRs in 105 days). The companion paper analyzes 30,510 edit-traces from 2,892 sessions as alignment training data.

Key resources:
- Platform: https://legal.org.ua
- Repository: https://github.com/overthelex/SecondLayer
- Scalable oversight connection: Section 5.4 and Discussion (Section 8)

A draft is attached. I would particularly value your perspective on whether retrieval-correction edits constitute a viable oversight signal (Section 5.4).

The arXiv endorsement code is: VGAFCQ
Endorsement URL: https://arxiv.org/auth/endorse?x=VGAFCQ

Thank you for your time.

Best regards,
Volodymyr Ovcharov
LEX AI Platform, legal.org.ua
volodymyr@legal.org.ua
