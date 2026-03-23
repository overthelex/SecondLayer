export const gbp = {
  // Header
  back: 'Back',

  // Title section
  title: 'Investment Opportunity Memorandum',
  subtitle: 'LEX — AI-Powered Legal Analytics Platform | legal.org.ua',
  date: 'March 2026',
  classification: 'Confidential',

  // Section 1: Founders
  s1_title: '1. Founding Team',
  s1_vladimir_initials: 'VO',
  s1_vladimir_name: 'Volodymyr Ovcharov',
  s1_vladimir_role: 'Co-founder & CTO.',
  s1_vladimir_bio:
    'BSc Applied Mathematics, National Technical University "KPI". Researcher at the V.M. Glushkov Institute of Cybernetics, National Academy of Sciences of Ukraine. 15+ years building scalable data processing, NLP, and AI infrastructure platforms.',
  s1_vladimir_linkedin: 'LinkedIn Profile',
  s1_igor_linkedin: 'LinkedIn Profile',
  s1_igor_initials: 'IK',
  s1_igor_name: 'Igor Kyrychenko',
  s1_igor_role: 'Co-founder & CEO.',
  s1_igor_bio:
    'PhD in Law. Deep expertise in Ukrainian and international law, court practice, and legal analytics. Bridges academic legal rigour with the practical requirements of working lawyers.',
  s1_combo:
    'Complementary founding team: technical expertise (AI, infrastructure, scaling) + legal science (PhD) = a product architected by people who understand both technology and law.',

  // NEW: Section 2 — Why Now
  s2_why_now_title: '2. Why Now',
  s2_why_now_items: [
    {
      title: 'LLM inflection point',
      desc: 'GPT-4o, Claude, and open-source models have reached production-grade quality for legal reasoning. For the first time, AI can reliably parse 50-page court decisions, cross-reference precedents, and generate actionable strategies — at a fraction of the cost of human review.',
    },
    {
      title: 'Open data wave in Ukraine',
      desc: 'Since 2020, Ukraine has opened 11 NAIS state registries, the EDRSR court decision archive, Prozorro procurement data, and tax registries — totalling 119M+ records. This data was previously locked behind paywalls or accessible only to government insiders. We are the first to aggregate, index, and make it AI-queryable.',
    },
    {
      title: 'EU AI Act & compliance tailwinds',
      desc: 'The EU AI Act (effective 2026) creates new compliance obligations for legal services across Europe. Law firms need AI tools that are transparent, auditable, and citation-verified — exactly what LEX provides with its hash-chain audit log and citation verification pipeline.',
    },
    {
      title: 'Legal productivity crisis',
      desc: 'Ukrainian attorneys spend 60–70% of billable time on research, not counsel. The average lawyer makes 50–200 database queries per day using 2000s-era keyword search tools. There is massive latent demand for AI-powered research that reduces this to minutes.',
    },
  ],

  // Section 3: About the project (was section 2)
  s3_opp_title: '3. The Opportunity',
  s3_opp_intro:
    'LEX is an AI-powered platform for legal analytics that combines court decision search, legislation analysis, change monitoring, and MCP integration with LLM clients (Claude, GPT, and others).',
  s3_opp_no_competitors_title: 'No direct competitors in Ukraine',
  s3_opp_no_competitors_text:
    'We already have everything that ZakonOnline (the largest legal database in Ukraine) has, and more. For example, we have ',
  s3_opp_judges_link_text: 'judge performance analytics',
  s3_opp_no_competitors_suffix:
    ' — a unique feature that no competitor offers.',
  s3_opp_global_title: 'Comparable Companies (Market Scale)',
  s3_opp_th_company: 'Company',
  s3_opp_th_country: 'Country',
  s3_opp_th_valuation: 'Valuation / Revenue',
  s3_opp_th_focus: 'Focus',
  s3_opp_harvey_valuation: '£1.2B+ (valuation)',
  s3_opp_harvey_focus: 'AI for law firms',
  s3_opp_clio_valuation: '£2.4B+ (valuation)',
  s3_opp_clio_focus: 'Practice management + AI',
  s3_opp_lexis_valuation: '£11B+ (RELX revenue)',
  s3_opp_lexis_focus: 'Legal analytics, databases',
  s3_opp_lex_stage: 'Seed stage',
  s3_opp_lex_focus: 'AI legal analytics + MCP',
  s3_opp_advantages_title: 'Key Differentiators',
  s3_opp_advantages: [
    'MCP protocol for integration with any LLM',
    'Judge performance analytics (unique)',
    'Semantic vector search across court decisions',
    'Legislation change monitoring',
    'Full texts of decisions from USRCD',
    'Verkhovna Rada voting analysis',
    'Legal entities registry (OpenReyestr)',
    'AI citation verification',
  ],

  // Section 4: Production Data Assets — expanded from LEG-233
  s4_data_title: '4. Production Data Assets',
  s4_data_intro:
    'LEX has assembled one of the most comprehensive legal data repositories in Ukraine. All datasets below are live in production as of 23 March 2026.',

  s4_sub_court: 'Court Decisions (EDRSR)',
  s4_sub_nais: 'NAIS State Registries — 11/11 Complete',
  s4_sub_tax: 'Tax Registries (State Tax Service)',
  s4_sub_sanctions: 'Sanctions & Compliance',
  s4_sub_procurement: 'Procurement & Public Finance',
  s4_sub_business: 'Business Registry (OpenReyestr)',
  s4_sub_vector: 'Vector Search & AI Infrastructure',

  s4_th_database: 'Dataset',
  s4_th_records: 'Records',
  s4_th_details: 'Details',
  s4_th_status: 'Status',

  s4_court_db: [
    { name: 'EDRSR metadata', count: '8,800,000', detail: 'All court decisions since 2006, partitioned by year', status: 'Complete' },
    { name: 'EDRSR full-text RTF archive', count: '53M files', detail: '1.4 TB on storage', status: 'Complete' },
    { name: 'Court sessions (HUDOC)', count: '~18,500,000', detail: 'ZakonOnline archive, 2020–present', status: 'In progress' },
    { name: 'Supreme Court judges', count: '153', detail: 'Profiles with full metadata', status: 'Partial' },
  ],

  s4_nais_db: [
    { name: 'Enforcement proceedings', count: '29,060,072', detail: 'Active and completed proceedings' },
    { name: 'Debtors register', count: '10,363,352', detail: 'Individual and corporate debtors' },
    { name: 'Special forms of notarial documents', count: '1,224,003', detail: 'Notarial document tracking' },
    { name: 'Administrative-territorial units', count: '500,704', detail: 'Full territorial structure' },
    { name: 'Street directory', count: '497,464', detail: 'Address normalisation' },
    { name: 'EDRNPA (normative legal acts)', count: '140,930', detail: 'Regulatory framework' },
    { name: 'Bankruptcy cases', count: '35,439', detail: 'Active insolvency proceedings' },
    { name: 'Court experts', count: '14,730', detail: 'Certified expert registry' },
    { name: 'Notaries', count: '5,799', detail: 'Licensed notary registry' },
    { name: 'Arbitration managers', count: '3,420', detail: 'Insolvency practitioners' },
    { name: 'Forensic examination methods', count: '1,546', detail: 'Approved methodologies' },
  ],
  s4_nais_total: 'NAIS subtotal: ~41,800,000 records',

  s4_tax_db: [
    { name: 'Tax debt', count: '861,124', detail: 'Outstanding tax obligations' },
    { name: 'Unified social contribution (ESV) debt', count: '668,541', detail: 'Social insurance arrears' },
    { name: 'Simplified taxation payers', count: '167,007', detail: 'Small business tax regime' },
    { name: 'VAT payers', count: '131,165', detail: 'Registered VAT entities' },
  ],
  s4_tax_note: 'Data as of 23 February 2022 (last available dump prior to full-scale invasion).',
  s4_tax_total: 'Tax subtotal: ~1,830,000 records',

  s4_sanctions_db: [
    { name: 'OpenSanctions (global)', count: '1,257,977', detail: 'International sanctions & PEPs' },
    { name: 'RNBO sanctions (National Security Council)', count: '21,090', detail: 'Ukrainian national sanctions' },
    { name: 'DRS inspection plans 2026', count: '31,876', detail: 'Regulatory inspection schedule' },
    { name: 'DSSU financial reports', count: '8,434', detail: '2024 annual filings' },
  ],

  s4_procurement_db: [
    { name: 'Prozorro public tenders', count: '706,100+', detail: '2020–2027, 3 parallel workers', status: 'In progress' },
    { name: 'spending.gov.ua', count: 'On-demand', detail: 'WAF restrictions; MCP tool access', status: 'API-only' },
  ],

  s4_business_db: [
    { name: 'Legal entities', count: '~1,800,000', detail: 'Registered companies' },
    { name: 'Individual entrepreneurs (FOP)', count: '~2,300,000', detail: 'Sole proprietors' },
    { name: 'Public associations', count: '~150,000', detail: 'NGOs and civic organisations' },
    { name: 'Founders, beneficiaries, signers', count: 'Relational', detail: 'Linked ownership data' },
  ],
  s4_business_total: 'OpenReyestr subtotal: ~4,500,000+ entity records',

  s4_vector_db: [
    { name: 'Vector embeddings', count: '2,000,000+', detail: 'Qdrant, 1536-dim, text-embedding-3-small' },
    { name: 'Legislation corpus (Verkhovna Rada)', count: '200,000+', detail: 'Laws, resolutions, decrees' },
    { name: 'Judge analytics', count: '12,000+', detail: 'Profiles with performance metrics' },
    { name: 'Parliamentary data', count: '450 deputies, 10K+ bills', detail: 'Deputies, voting records, bills' },
  ],

  s4_consolidated_title: 'Consolidated Data Summary',
  s4_consolidated: [
    { category: 'EDRSR court decision metadata', count: '8,800,000' },
    { category: 'Court sessions (HUDOC)', count: '~18,500,000' },
    { category: 'NAIS state registries (11 datasets)', count: '~41,800,000' },
    { category: 'Enforcement + debtors', count: '~39,400,000' },
    { category: 'Tax registries', count: '~1,830,000' },
    { category: 'Business registry (OpenReyestr)', count: '~4,500,000' },
    { category: 'Sanctions & compliance', count: '~1,320,000' },
    { category: 'Procurement (Prozorro)', count: '706,000+' },
    { category: 'Legislation, judges, parliament', count: '~212,000+' },
    { category: 'Vector embeddings', count: '2,000,000+' },
    { category: 'Full-text RTF archive', count: '53,000,000 files' },
  ],
  s4_total_structured: 'Total structured records: ~119,000,000+',
  s4_total_files: 'Full-text file archive: 53M files / 1.4 TB',

  s4_pipeline_title: 'Data Pipeline Roadmap (Tier 1)',
  s4_pipeline: [
    { source: 'DRRP (real property register)', value: 'Ownership, encumbrances, arrests', access: 'NAIS contract required' },
    { source: 'DRORM (movable property)', value: 'Pledges, leasing', access: 'NAIS contract required' },
    { source: 'DZK (land cadastre)', value: 'Land plots', access: 'NAIS contract required' },
    { source: 'RADA data on prod', value: 'Political risk scoring', access: 'Code ready, sync pending' },
  ],

  // NEW: Section 5 — Business Model
  s5_biz_title: '5. Business Model',
  s5_biz_intro: 'LEX operates a hybrid SaaS + usage-based model, designed for predictable recurring revenue with upside from high-volume users.',

  s5_biz_tiers_title: 'Pricing Tiers',
  s5_biz_th_tier: 'Plan',
  s5_biz_th_price: 'Price',
  s5_biz_th_target: 'Target Segment',
  s5_biz_th_includes: 'Includes',
  s5_biz_tiers: [
    { tier: 'Individual', price: '£23/mo', target: 'Solo attorneys', includes: '100 queries/day, court search, legislation, judge analytics' },
    { tier: 'Professional', price: '£39/mo', target: 'Active practitioners', includes: '300 queries/day, semantic search, document analysis, change monitoring' },
    { tier: 'Firm', price: '£79–239/mo', target: 'Law firms (2–20 seats)', includes: 'Team seats, shared workspace, priority support, API access' },
    { tier: 'Enterprise', price: 'Custom', target: 'Corporate legal departments', includes: 'Unlimited queries, SSO, dedicated instance, SLA, custom integrations' },
    { tier: 'API / MCP', price: 'Pay-per-query', target: 'Developers & B2B integrators', includes: '45 MCP tools, RESTful API, SSE streaming, webhook events' },
  ],

  s5_biz_unit_title: 'Unit Economics Per Query',
  s5_biz_th_type: 'Query Type',
  s5_biz_th_cost: 'Cost to LEX',
  s5_biz_th_client_price: 'Client Price',
  s5_biz_th_margin: 'Gross Margin',
  s5_biz_queries: [
    { type: 'Quick search', cost: '£0.001–0.002', price: '£0.008', margin: '70–90%' },
    { type: 'Standard analysis', cost: '£0.008–0.024', price: '£0.040', margin: '40–80%' },
    { type: 'Deep analysis', cost: '£0.040–0.120', price: '£0.160', margin: '25–75%' },
    { type: 'Semantic search', cost: '£0.002–0.004', price: '£0.016', margin: '60–90%' },
    { type: 'Judge analytics', cost: '£0.001', price: '£0.008', margin: '90%' },
  ],
  s5_biz_avg_cost: 'Avg. query cost',
  s5_biz_avg_price: 'Avg. client price',
  s5_biz_avg_margin: 'Avg. gross margin',
  s5_biz_avg_cost_val: '£0.016',
  s5_biz_avg_price_val: '£0.040',
  s5_biz_avg_margin_val: '~60%',

  s5_biz_revenue_streams_title: 'Revenue Streams',
  s5_biz_revenue_streams: [
    { stream: 'Subscriptions (B2C)', desc: 'Individual attorneys and small firms on monthly/annual plans', pct: '60–70%' },
    { stream: 'API / MCP access (B2B)', desc: 'Third-party platforms integrating LEX data via 45 MCP tools', pct: '20–25%' },
    { stream: 'Enterprise contracts', desc: 'Custom deployments for corporate legal departments', pct: '10–15%' },
  ],

  // NEW: Section 6 — Traction
  s6_traction_title: '6. Traction & Validation',
  s6_traction_intro: 'LEX is live in production with real users. Key milestones achieved:',
  s6_traction_items: [
    { metric: 'Platform status', value: 'Live', detail: 'Production deployment at legal.org.ua since Q4 2025' },
    { metric: 'Registered users', value: '50+', detail: 'Attorneys, law firms, and legal researchers (organic, no paid acquisition)' },
    { metric: 'Data assets indexed', value: '119M+ records', detail: 'Largest AI-queryable legal corpus in Ukraine' },
    { metric: 'MCP tools deployed', value: '45 tools', detail: 'Production-grade, used via Claude Desktop and API' },
    { metric: 'Pilot partnerships', value: '3 LOIs', detail: 'Letters of intent from mid-size law firms for Professional/Firm plans' },
    { metric: 'Demo feedback', value: 'Positive', detail: '"15 minutes vs 3 days" resonates strongly with practising attorneys' },
  ],
  s6_traction_quote:
    '"This is the tool I\'ve been waiting for. I spend 4 hours a day on research — LEX does it in minutes." — Pilot user, Kyiv attorney',

  // Section 7: Competitive Landscape
  s7_comp_title: '7. Competitive Landscape',
  s7_comp_features: [
    'AI document analysis',
    'MCP protocol (LLM integration)',
    'Semantic search',
    'Judge analytics',
    'Full USRCD decision texts',
    'Court decision search',
    'Legislation',
    'Verkhovna Rada voting analysis',
    'Legal entities registry',
    'Change monitoring',
    'Developer API',
    'AI citation verification',
    'Practice management',
    'SSE streaming',
  ],
  s7_comp_th_feature: 'Feature',
  s7_comp_activelex_desc:
    'Startup focused on legal process automation. No AI analytics, no API, limited database.',
  s7_comp_zakon_desc:
    'Largest legal database in Ukraine. No AI, no semantic search, no analytics. Legacy keyword search.',
  s7_comp_liga_desc:
    'Largest incumbent. Legacy system, no AI, expensive subscription, closed ecosystem. No API.',
  s7_comp_conclusion:
    'LEX is the only player in Ukraine with AI analytics, semantic search, MCP integration, and automated citation verification. We are not another legal database — we are building a next-generation AI platform.',

  // Section 8: Demonstrated Capability (case studies)
  s8_cases_title: '8. Demonstrated Capability',
  s8_cases_intro:
    'Below are two real cases performed by the LEX platform, demonstrating the depth of analytics unavailable from any Ukrainian competitor.',
  s8_case1_title: 'Case Study 1: Judge Performance Analysis',
  s8_case1_subtitle:
    'Kyiv District Administrative Court | Full report based on 24,039 USRCD documents',
  s8_case1_intro:
    'The system automatically analysed 24,039 procedural documents and 1,504 appellate decisions across 4 production database shards, building a complete judge profile.',
  s8_case1_stat1: 'unique cases',
  s8_case1_stat2: 'appeal reversals',
  s8_case1_stat3: 'deadline violations (#1 in court)',
  s8_case1_stat4: 'cases — public service',
  s8_case1_conclusion:
    'AI Finding: Judge K. I.S. is a high-productivity judge with problematic decision quality. Every second appealed decision is overturned by higher courts. Absolute leader in deadline violations (3.8x above court average).',
  s8_case1_value:
    'Practical value: grounds for recusal motions, adjusted defence strategy, appellate outcome prediction.',
  s8_case1_link: 'Open judge analytics on the platform',
  s8_case2_title: 'Case Study 2: Borrower Defence Strategy (Credit Case)',
  s8_case2_subtitle:
    'Foreign currency loan from 2007 | Analysis based on 473 documents',
  s8_case2_intro:
    'A client approached with a problem: a EUR loan from 2007, debt obligations transferred between factoring companies. The current creditor is in liquidation. Outstanding amount — UAH 11.9 million. Enforcement proceedings lasted 11 years with no substantial progress.',
  s8_case2_strategies_title:
    'AI system identified 9 defence strategies — top 5:',
  s8_case2_strategies: [
    { priority: 'CRITICAL', text: 'The creditor has ceased to exist (in liquidation process) — enforcement on behalf of a non-existent legal entity is unlawful' },
    { priority: 'VERY HIGH', text: 'Absence of foreign currency licence for factoring company — verified in NBU registry, factoring agreement may be invalidated' },
    { priority: 'HIGH', text: '7-year error in enforcement writ (incorrect debtor data) — corrected only after 7 years' },
    { priority: 'HIGH', text: 'Possible expiration of limitation period for presenting enforcement document' },
    { priority: 'MEDIUM', text: 'Violation of legal certainty principle — 11 years of continuous enforcement proceedings' },
  ],
  s8_case2_what:
    'What the system did: automatically found and analysed all court decisions in the case (USRCD), verified the creditor company status (OpenReyestr), checked for foreign currency licence (NBU registry), found relevant Supreme Court precedents.',
  s8_case2_time:
    'Processing time: full analysis of 473 documents took ~15 minutes. A solicitor would spend 2–3 business days on this.',
  s8_cases_conclusion:
    'Value proposition: LEX reduces legal research time from days to minutes. Each report is the result of AI working with tens of thousands of documents, cross-referencing multiple registries, and automatically identifying legally significant patterns.',

  // Section 9: Market Sizing
  s9_market_title: '9. Market Sizing',
  s9_tam_label: 'TAM (Total Addressable)',
  s9_tam_desc: 'Global legal AI market (2026)',
  s9_tam_val: '£400M+',
  s9_sam_label: 'SAM (Serviceable)',
  s9_sam_desc: 'Legal IT services in Ukraine + CEE',
  s9_sam_val: '£40M',
  s9_som_label: 'SOM (Obtainable)',
  s9_som_desc: 'First 2 years, Ukraine',
  s9_som_val: '£1.6–4M',
  s9_th_segment: 'Segment',
  s9_th_count: 'Size',
  s9_th_arpu: 'Potential ARPU',
  s9_th_potential: 'Revenue at 1% Penetration',
  s9_segments: [
    { name: 'Attorneys (UNBA)', count: '60,000+', arpu: '£23–39/mo', potential: '£1.4–2.3M/yr' },
    { name: 'Law firms', count: '5,000+', arpu: '£79–239/mo', potential: '£0.5–1.4M/yr' },
    { name: 'Corporate legal departments', count: '10,000+', arpu: '£159–399/mo', potential: '£1.9–4.8M/yr' },
    { name: 'API/MCP integrations (B2B)', count: '100+', arpu: '£400–1,600/mo', potential: '£0.5–1.9M/yr' },
  ],

  // Section 10: Technology Moat — with expanded MCP explanation
  s10_moat_title: '10. Technology Moat',
  s10_moat_items: [
    {
      title: 'Data moat',
      desc: '119M+ structured records and 53M full-text files. Replicating this corpus would require months of crawling, parsing, and indexing. Data is updated daily from 11+ government registries.',
    },
    {
      title: 'MCP protocol (first in Ukraine)',
      desc: 'MCP (Model Context Protocol) is the emerging standard for connecting AI models to external tools and data. LEX exposes 45 MCP tools — meaning any LLM (Claude, GPT, Llama) can query Ukrainian legal data without building custom pipelines. This creates a network effect: as more LLM clients adopt MCP, LEX becomes the default legal data provider. No Ukrainian competitor supports MCP or has a developer API.',
    },
    {
      title: 'AI pipeline',
      desc: 'Semantic search, citation verification, pattern analysis, decision classification — all automated. Built on GPT-4o + text-embedding-3-small + Qdrant. The pipeline is production-hardened across 119M+ records.',
    },
    {
      title: 'Domain expertise in code',
      desc: 'A PhD lawyer as co-founder means legal logic is architected into the platform, not bolted on. Ukrainian legal taxonomy, court hierarchy, and procedural rules are encoded as first-class domain models. This cannot be replicated without equivalent legal expertise.',
    },
  ],

  // Section 11: Use of Proceeds — REBALANCED allocation
  s11_funds_title: '11. Use of Proceeds',
  s11_funds_intro:
    'Investment directed towards achieving product-market fit through targeted outreach, infrastructure scaling, and product iteration.',
  s11_funds_items: [
    {
      label: 'Infrastructure & AI costs',
      pct: 30,
      amount: '£4,800',
      detail: 'Server scaling, OpenAI API, Qdrant cluster, PostgreSQL replication, CDN, monitoring',
    },
    {
      label: 'Product development',
      pct: 25,
      amount: '£4,000',
      detail: 'Mobile app, enterprise features, API documentation, onboarding flows',
    },
    {
      label: 'Go-to-market & customer acquisition',
      pct: 25,
      amount: '£4,000',
      detail: 'Legal conference demos, content/thought leadership, LinkedIn outbound, referral programme, partnership development',
    },
    {
      label: 'Legal & operational',
      pct: 20,
      amount: '£3,200',
      detail: 'GDPR compliance, UK/EU legal entity registration, accounting, insurance',
    },
  ],
  // REALISTIC milestones
  s11_milestones_title: 'Key Milestones (6-Month Horizon)',
  s11_milestones: [
    { period: 'M1–2', text: 'Pilot programme with 5–10 law firms; convert LOIs to paid pilots; refine onboarding based on feedback' },
    { period: 'M3–4', text: 'First 20 paying customers; launch self-serve onboarding for individual attorneys; establish referral programme' },
    { period: 'M5–6', text: '50–80 paying customers; MRR £2,000–4,000; validated pricing tiers; preparation for seed round' },
  ],

  // Section 12: Revenue projections
  s12_rev_title: '12. Revenue Projections',
  s12_input_title: 'Input Assumptions',
  s12_input: [
    { label: 'Go-to-market budget:', value: '£4,000' },
    { label: 'CAC (blended):', value: '£50–80' },
    { label: 'Target customers (6 mo):', value: '50–80 paying' },
    { label: 'Average monthly spend:', value: '£23–79' },
  ],
  s12_scenarios_title: 'Revenue Scenarios (at 80 Customers)',
  s12_th_scenario: 'Scenario',
  s12_th_clients: 'Clients',
  s12_th_check: 'Avg. spend/mo',
  s12_th_mrr: 'MRR',
  s12_th_arr: 'ARR',
  s12_scenarios: [
    { name: 'Conservative', clients: '50', check: '£23', mrr: '£1,150', arr: '£13,800' },
    { name: 'Base', clients: '80', check: '£39', mrr: '£3,120', arr: '£37,440' },
    { name: 'Optimistic', clients: '80', check: '£55', mrr: '£4,400', arr: '£52,800' },
    { name: 'Blended (60 attorneys + 20 firms)', clients: '80', check: '£47', mrr: '£3,760', arr: '£45,120' },
  ],
  s12_ltv_title: 'LTV / CAC Metrics',
  s12_ltv: [
    { label: 'CAC (blended):', value: '£65' },
    { label: 'LTV (12 mo, base):', value: '£468' },
    { label: 'LTV / CAC:', value: '7.2x' },
    { label: 'Payback period:', value: '~1.7 months' },
  ],
  s12_conclusion:
    'At 80 paying customers with an average spend of £39/mo, MRR reaches £3,120 — covering infrastructure costs and demonstrating clear product-market fit. LTV/CAC of 7.2x significantly exceeds the 3x SaaS benchmark, indicating efficient customer acquisition.',

  s12_scaling_title: 'Scaling Potential',
  s12_scaling_intro: 'With validated PMF and unit economics at 80 customers:',
  s12_scaling_math: [
    { scenario: '600 customers (1% of UNBA)', arpu: '£40–80/mo', mrr: '£24,000–48,000', arr: '£288,000–576,000' },
    { scenario: '+ 50 B2B API clients', arpu: '£400–1,600/mo', mrr: '£20,000–80,000', arr: '£240,000–960,000' },
    { scenario: 'Combined (seed round target)', arpu: 'Blended', mrr: '£44,000–128,000', arr: '£528,000–1,536,000' },
  ],
  s12_scaling_note:
    'MCP protocol enables API monetisation without proportional cost growth — each new B2B integration multiplies revenue on existing infrastructure. CEE expansion (Poland, Czech Republic, Romania) shares similar legal system structures and represents a natural growth vector.',

  // Section 13: Risk Factors — expanded with PMF + sales cycle
  s13_risk_title: '13. Risk Factors',
  s13_th_risk: 'Risk',
  s13_th_mitigation: 'Mitigation',
  s13_risks: [
    {
      risk: 'Product-market fit uncertainty',
      mitigation: 'Pilot programme with law firms; iterative pricing validation; self-serve onboarding to test SME demand; feedback loops with early adopters before scaling spend',
    },
    {
      risk: 'Long enterprise sales cycles',
      mitigation: 'SME-first GTM strategy with self-serve onboarding; enterprise layer added only after PLG traction is proven; referral programme to reduce outbound dependency',
    },
    {
      risk: 'Geopolitical (ongoing conflict)',
      mitigation: 'Platform is cloud-native; team operates remotely across multiple locations; EU expansion on roadmap; data is backed up across regions',
    },
    {
      risk: 'Regulatory changes to open data access',
      mitigation: 'Diversified across 11+ government registries; NAIS contract pipeline for premium data; proprietary processing adds value beyond raw access',
    },
    {
      risk: 'LLM cost inflation',
      mitigation: 'Budget-aware model selection (quick/standard/deep tiers); multi-provider fallback (OpenAI + Anthropic); embedding costs declining ~40% annually',
    },
    {
      risk: 'Competitive entry',
      mitigation: '119M+ record data moat with 18-month head start; daily-updated pipeline; domain expertise embedded in architecture; MCP ecosystem lock-in',
    },
  ],

  // CTA
  cta_title: 'Ready to discuss?',
  cta_subtitle:
    'We are open to dialogue with investors who see the potential of AI in the legal technology sector.',
  cta_try: 'Try the platform',
  cta_email: 'hello@legal.org.ua',

  // Footer
  footer: '© 2024–2026 SecondLayer. All rights reserved. This document is confidential and intended solely for the use of prospective investors.',
};
