**To:** vriccard@amazon.com
**Cc:** vriccard@amazon.es
**Subject:** RE: legal.org.ua — ML Training Roadmap on AWS (detailed plan, GPU needs)

---

Hi Riccardo,

Following up on our thread and the AWS Activate track — wanted to share the detailed version of our ML training roadmap so your team has everything needed to evaluate sponsorship / credit sizing.

Quick context: Google Cloud (Dawid Szymula, Startup Territory Lead PL/UA) has just confirmed they've received enough detail from us and will come back next week with a GPU consumption plan for the same workload. I'd really like AWS to stay our primary training partner — LEX already runs on AWS (EC2, Bedrock Claude, ALB, WAF, S3), and Trainium2 + SageMaker HyperPod is the more natural fit for what we're building. Sharing the same level of detail here so you can move in parallel.

If easier to discuss live, happy to jump on a call anytime — phone in signature.


1. THREE PHASES

Phase 1 — Foundation (Months 1–4, ~$15K)

Fine-tune BGE-M3 embeddings on SageMaker for Ukrainian legal retrieval (replacing our current Voyage AI dependency at 10x cost reduction). LoRA fine-tune a distilled model (DeepSeek-R1-Distill 70B or Qwen 32B) on 5–10K annotated legal Q&A pairs via SageMaker HyperPod, starting with a well-defined subset of 10.9M administrative offense (KUpAP) decisions. By month 4, we ship a domain-specific model that handles KUpAP queries in production alongside Bedrock Claude.

Phase 2 — Scale (Months 5–8, ~$80–120K)

Continued pre-training of DeepSeek-V3 685B (MoE, 37B active parameters, MIT-licensed) on the full 100M court decision corpus (~50–80B tokens) across 5 jurisdictions (civil, criminal, commercial, administrative, KUpAP). AWS already publishes SageMaker HyperPod recipes for DeepSeek-V3 customization, which is a big part of why we want to run this on AWS rather than elsewhere. This phase includes building jurisdiction-specific LoRA adapters and a citation verification system that cross-references every model output against our database. Open to AWS guidance on whether Trainium2 or P5/P5e (H200) is the better target for this shape of workload.

Phase 3 — Harvey-class (Months 9–12, ~$100–130K)

Multi-model orchestration: custom EDRSR model for case law, Bedrock Claude for complex reasoning, distilled models for high-volume processing — each query routed to the optimal model. RLHF with practicing Ukrainian lawyers using constitutional reward signals (specific articles of Ukraine's Constitution as formal alignment constraints — not abstract ethical principles). Self-hosted inference on Inferentia2/Trainium2 and an API for external law firms.


2. ML TRAINING WORKLOADS

Training data we own:

- Ukrainian court decisions (EDRSR): 100.5M in our DB (133.5M exist in the registry total). 65M already vectorized. 1.17 TB in PostgreSQL. Source: reyestr.court.gov.ua
- Dutch court decisions: 488K with full texts from rechtspraak.nl — for cross-jurisdiction transfer learning
- Legislation corpus: 76K sections vectorized from Verkhovna Rada API, linked to case law
- Sanctions & PEP entities: 4M+ (OFAC, EU, UN, NSDC) via OpenSanctions
- Corporate intelligence: GLEIF LEI + ICIJ Offshore Leaks
- Breach intelligence: 15B+ credential records via HIBP, LeakCheck, Dehashed
- Threat intelligence: NVD + CISA KEV + EPSS
- Law enforcement: INTERPOL Red Notices + World Bank Debarment lists

LEX (legal.org.ua) is already running on AWS. Our second product — Panoptic (panoptic.com.ua) — is an OSINT & due diligence platform that aggregates 18+ intelligence data sources (sanctions, corporate ownership, credential breaches, IP/domain reputation, GDELT, INTERPOL). Panoptic currently runs on GCP but we plan to migrate its inference and batch-enrichment workloads to AWS (Bedrock + Lambda + S3) as part of this training program. It feeds directly into our legal AI training pipeline for due diligence, sanctions compliance, and anti-corruption models.

Training approach:

- Embedding fine-tuning (BGE-M3) → LoRA fine-tuning (70B) → Continued pre-training (685B) → RLHF with 6 specialized reward models (General, Civil, Criminal, Administrative, Rare categories, Temporal)
- Constitutional RLHF: legal compliance baked into the reward function using specific articles of Ukraine's Constitution (presumption of innocence, right to judicial protection, privacy proportionality)
- Adversarial training: three separate role-specific models (advocate, prosecutor, judge) that train against each other on simulated cases


3. GPU / ACCELERATOR NEEDS

Phase 1:
- Use case: Fine-tuning
- Model: DeepSeek-R1-Distill 70B / Qwen 32B (LoRA)
- Preferred instance: p5.48xlarge (H100 x8) via SageMaker HyperPod, or trn1.32xlarge as a Trainium alternative
- Concurrent users: Internal only (5–10)
- Input: 2–4K tokens, Output: 1–2K tokens
- TTFT: N/A (batch training)
- Duration: 4 months, Budget: ~$15K

Phase 2:
- Use case: Training + Fine-tuning
- Model: DeepSeek-V3 685B (continued pre-training)
- Preferred instance: p5e.48xlarge (H200) or Trainium2 (trn2) HyperPod cluster
- Concurrent users: Internal (10–20)
- Input: 4–8K tokens, Output: 2–4K tokens
- TTFT: N/A (batch training)
- Duration: 4 months, Budget: ~$80–120K

Phase 3:
- Use case: Training + Inference
- Model: DeepSeek-V3 685B + distilled models
- Preferred instance: Trainium2 for training + Inferentia2 (inf2) for inference, Bedrock Claude for reasoning overflow
- Concurrent users: Production — 500–1,000 peak
- Input: 8–16K tokens, Output: 2–8K tokens
- TTFT target: under 500ms
- Duration: 4 months, Budget: ~$100–130K

Total estimated AWS spend: $195K–$265K over 12 months across SageMaker HyperPod, Bedrock, Trainium2/Inferentia2, EC2, and S3.

For context: Harvey.ai raised $1.2B and invested heavily in model training with OpenAI. We're building comparable capability at a fraction of the cost by leveraging open-weight models on AWS custom silicon — focused on a unique dataset (largest open court decisions corpus in Europe) that no competitor can replicate.

Two specific asks:

1. Activate credit sizing aligned to the 12-month plan above (or a staged commitment tied to phase milestones).
2. Technical guidance from the AWS ML specialist team on optimal Trainium2 vs P5e configurations for continued pre-training at DeepSeek-V3 scale (685B parameters, 50–80B token corpus).

I'd also be happy to share account billing IDs for our existing AWS projects so the Activate team has full visibility on current spend and trajectory.

Happy to schedule a follow-up call at your convenience.

Best,
Vladimir Ovcharov
CEO, LEX AI LLC
vladimir@legal.org.ua
+380 96 590 4460
