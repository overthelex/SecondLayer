# AWS Startup Credits Application — SecondLayer

## Company Overview

**Company:** SecondLayer (legal.org.ua)
**Location:** Ukraine
**Stage:** Early revenue, B2B SaaS
**Website:** https://legal.org.ua

## Application Letter

Subject: AWS Credits Application — SecondLayer: AI-Powered Legal Intelligence for Ukraine

Dear AWS Startup Team,

We are SecondLayer, a legal technology startup building an AI-powered legal intelligence platform for the Ukrainian legal market. We are applying for $100,000 in AWS credits to scale our infrastructure and serve the growing demand from law firms, corporate legal departments, and government agencies across Ukraine.

### What We Do

SecondLayer provides real-time AI-powered analysis of Ukrainian legal data at unprecedented scale:

- **110M+ court decisions** indexed with full-text and semantic search across all Ukrainian courts
- **Complete legislative corpus** with amendment history tracking, article-level retrieval, and change analysis
- **State registry integration** — business entities, beneficial owners, debtors, enforcement proceedings
- **Parliament data** — bills, deputy voting records, legislation tracking
- **AI-assisted legal research** — using Claude (via Amazon Bedrock) and OpenAI for intelligent document analysis, practice comparison, and legal consultation

Our platform processes complex legal queries that previously required hours of manual research and delivers structured, citation-backed analysis in seconds.

### How We Use AWS

SecondLayer runs entirely on AWS infrastructure:

- **Amazon Bedrock** — Primary LLM inference layer using Claude Sonnet/Haiku for intent classification, legal analysis, and document generation. Bedrock is critical to our product — every user query triggers multiple LLM calls for classification, planning, and synthesis.
- **EC2** — Application servers running our Node.js backend, PostgreSQL, Redis, and Qdrant vector database
- **S3** — Document storage for user uploads and legal document cache
- **CloudFront** — CDN for our React frontend serving users across Ukraine

### Why We Need $100K in Credits

Our primary cost driver is **Amazon Bedrock inference**. Each legal analysis query requires 3-7 LLM calls (intent classification, execution planning, tool result synthesis), consuming 50,000-150,000 tokens per query. With growing user adoption, we are hitting daily token quotas and need to:

1. **Scale Bedrock usage** — Increase daily token limits and move to provisioned throughput for consistent performance during peak hours
2. **Expand vector search** — Our 110M document corpus requires significant compute for embedding generation and similarity search
3. **Add redundancy** — Multi-AZ deployment for PostgreSQL and application layer to meet enterprise SLA requirements
4. **Process legislative backlog** — Batch-embed millions of court decisions and legislative documents using Bedrock/Titan embeddings

### Current Monthly AWS Spend

Our current monthly AWS bill is approximately $800-1,200, primarily Bedrock inference and EC2. With user growth and the planned migration to provisioned throughput, we project $3,000-5,000/month within 6 months.

### Traction

- Live product serving paying users (law firms, solo practitioners)
- 110M+ court decisions indexed (largest legal database in Ukraine)
- Integration with 5+ government data sources (court registry, parliament, business registry, notary registry, enforcement proceedings)
- Monobank payment integration with dual UAH/USD billing
- Mobile app (Flutter) in beta for iOS and Android
- Diia (Ukrainian government digital ID) authentication integration — first legal tech platform in Ukraine to support this

### Market Opportunity

Ukraine has 60,000+ practicing lawyers and 10,000+ law firms. The legal tech market is nascent — most legal research is still done manually through government websites with poor search capabilities. SecondLayer is the first platform to provide AI-powered semantic search across the entire Ukrainian legal corpus.

The broader opportunity extends to compliance departments of Ukrainian and international companies operating in Ukraine, government agencies, and the academic legal research community.

### Team

Our team combines deep expertise in AI/ML engineering, full-stack development, and Ukrainian legal domain knowledge. We have built the entire platform — from data ingestion pipelines processing millions of documents to the AI orchestration layer — in-house.

### What $100K in Credits Would Enable

- **3x increase in Bedrock throughput** — provisioned model units for Claude Sonnet, eliminating daily token limits that currently throttle our users
- **GPU instances for embedding** — batch-process our 110M document corpus with Titan/Cohere embeddings for improved semantic search
- **Enterprise-ready infrastructure** — multi-AZ PostgreSQL (RDS), ElastiCache for Redis, proper CloudWatch monitoring
- **12-18 months of runway** on AWS infrastructure, allowing us to focus on product development and user acquisition

We are committed to building on AWS long-term. Bedrock is central to our architecture, and we plan to adopt additional AWS services (SageMaker for fine-tuning, Comprehend for entity extraction, Kendra for hybrid search) as we scale.

Thank you for considering our application. We would be happy to provide a demo of our platform or discuss our technical architecture in more detail.

Best regards,

Vladimir Sheperd
Founder & CTO, SecondLayer
vladimir@legal.org.ua
https://legal.org.ua
