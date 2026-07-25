# legal.org.ua — ML Training Roadmap for AWS

## Who We Are

legal.org.ua is a Ukrainian legal AI platform — think Harvey.ai for Ukrainian law. We operate on top of EDRSR (Unified State Register of Court Decisions), the largest open court decisions corpus in Europe: **100M+ full-text decisions** across all jurisdictions. We currently use AWS for infrastructure and are ready to scale our ML capabilities.

## What We Want to Build

Harvey.ai built a custom case law model on all U.S. case law in partnership with OpenAI — lawyers preferred it over GPT-4 97% of the time. We want to replicate this for Ukrainian law using open-source models on AWS infrastructure, in three phases over 12 months.

Our base model choice: **DeepSeek-V3 (685B MoE, 37B active)** — MIT-licensed, best cost-to-quality ratio among open models, with strong multilingual performance. DeepSeek's original training cost was $5.6M on 2,048 H800 GPUs; continued pre-training on our 50-80B token legal corpus is a fraction of that.

## Phase 1: Foundation (Months 1-4)

We start with **10.9M administrative offense (KUpAP) decisions** — a well-defined, high-volume subset ideal for a first training run. The plan: fine-tune BGE-M3 embeddings on SageMaker for Ukrainian legal retrieval (replacing our current Voyage AI dependency at 10x cost reduction), then LoRA fine-tune a DeepSeek-R1 distilled model (Llama 70B or Qwen 32B) via SageMaker HyperPod on 5-10K annotated legal Q&A pairs. By month 4, we ship a domain-specific model that handles KUpAP queries in production alongside Claude/GPT.

**Target**: >75% preference rate vs GPT-4o on KUpAP tasks. **AWS services**: SageMaker HyperPod, SageMaker Serverless Endpoints, Bedrock, S3. **Budget**: ~$15K total.

## Phase 2: Scale (Months 5-8)

We expand to all **100M decisions across 5 jurisdictions** (civil, criminal, commercial, administrative, KUpAP). The key step — analogous to what Harvey did with OpenAI — is continued pre-training of DeepSeek-V3 685B on the full EDRSR corpus (~50-80B tokens). This teaches the model Ukrainian legal language, decision structure, and argumentation patterns at a fundamental level. We then build jurisdiction-specific LoRA adapters and a citation verification system that cross-references every model claim against the database. AWS already provides HyperPod recipes for DeepSeek-R1 customization, which we would extend for continued pre-training.

**Target**: >85% preference rate, <0.5% hallucination rate, >95% citation accuracy. **AWS services**: SageMaker HyperPod + Trainium2 clusters (trn2.48xlarge), Bedrock RFT. **Budget**: ~$80-120K total.

## Phase 3: Harvey-class (Months 9-12)

Full multi-model orchestration: custom EDRSR model for case law research, Claude for complex reasoning, smaller distilled models for high-volume processing — each query routed to the optimal model. We integrate the legislative corpus (Parliament data, already built), connect statutes to case law, and run RLHF with practicing lawyers. The end state is a production platform with self-hosted inference on Trainium2/Inferentia2 and an API for external law firms.

**Target**: >95% preference rate, <0.2% hallucination rate (Harvey level). **AWS services**: Trainium2/Inferentia2 for inference, SageMaker Endpoints, Bedrock multi-model. **Budget**: ~$100-130K total.

## What We Need from AWS

Total estimated spend over 12 months: **$195,000-265,000** across SageMaker HyperPod, Bedrock, Trainium2/Inferentia2, and S3. We are looking for AWS Activate credits or startup program support for the initial phases, along with technical guidance on optimal Trainium2 configurations for continued pre-training of DeepSeek-scale (685B) models on our 50-80B token corpus.

For comparison: Harvey raised $1.2B and spent hundreds of millions on model training with OpenAI. We achieve comparable results at a fraction of the cost by leveraging open-weight models (DeepSeek-V3, MIT license) on AWS custom silicon — focused on a unique, underserved domain with a dataset no competitor can replicate.
