export const en = {
  // Header
  back: 'Back',

  // Title section
  title: 'Open Letter to Investor',
  subtitle: 'legal.org.ua — AI-powered legal analytics platform in Ukraine',
  date: 'March 2026',

  // Section 1: Founders
  s1_title: '1. About the Founders',
  s1_vladimir_initials: 'VO',
  s1_vladimir_name: 'Volodymyr Ovcharov',
  s1_vladimir_role: 'Co-founder & CTO.',
  s1_vladimir_bio:
    'Graduate of KPI, Faculty of Applied Mathematics. Worked at the V.M. Glushkov Institute of Cybernetics of the National Academy of Sciences of Ukraine. Has 15+ years of experience developing information systems. Specialization — building scalable platforms for data processing, NLP, and AI infrastructure.',
  s1_vladimir_linkedin: 'LinkedIn Profile',
  s1_igor_linkedin: 'LinkedIn Profile',
  s1_igor_initials: 'IK',
  s1_igor_name: 'Igor Kyrychenko',
  s1_igor_role: 'Co-founder & CEO.',
  s1_igor_bio:
    'PhD in Law. Deep expertise in Ukrainian and international law, court practice, and legal analytics. The combination of an academic legal background with an understanding of the needs of practicing lawyers provides a unique ability to build a product that truly solves the problems of the legal market.',
  s1_combo:
    'Unique combination: technical expertise (AI, infrastructure, scaling) + legal science (PhD) = a product built by people who understand both sides — technology and law.',

  // Section 2: About the project
  s2_title: '2. About legal.org.ua',
  s2_intro:
    'LEX is an AI-powered platform for legal analytics that combines court decision search, legislation analysis, change monitoring, and MCP integration with LLM clients (Claude, GPT, and others).',
  s2_no_competitors_title: 'No direct competitors in Ukraine',
  s2_no_competitors_text:
    'We already have everything that ZakonOnline (the largest legal database in Ukraine) has, and even more. For example, we have',
  s2_judges_link_text: 'judge performance analytics',
  s2_no_competitors_suffix:
    ' — a unique feature that no competitor offers.',
  s2_global_title: 'Global Competitors (market scale comparison)',
  // table headers
  s2_th_company: 'Company',
  s2_th_country: 'Country',
  s2_th_valuation: 'Valuation/Revenue',
  s2_th_focus: 'Focus',
  // table data
  s2_harvey_country: 'USA',
  s2_harvey_valuation: '$1.5B+ (valuation)',
  s2_harvey_focus: 'AI for law firms',
  s2_clio_country: 'Canada',
  s2_clio_valuation: '$3B+ (valuation)',
  s2_clio_focus: 'Practice management + AI',
  s2_lexis_country: 'USA/UK',
  s2_lexis_valuation: '$14B+ (RELX revenue)',
  s2_lexis_focus: 'Legal analytics, databases',
  s2_lex_country: 'Ukraine',
  s2_lex_stage: 'Seed stage',
  s2_lex_focus: 'AI legal analytics + MCP',
  s2_advantages_title: 'Key Advantages of LEX',
  s2_advantages: [
    'MCP protocol for integration with any LLM',
    'Judge performance analytics',
    'Semantic search across court decisions',
    'Legislation change monitoring',
    'Full texts of decisions from USRCD',
    'Verkhovna Rada voting analysis',
    'Legal entities registry (OpenReyestr)',
    'Legislation and citation verification',
  ],

  // Section 3: Databases
  s3_title: '3. Production Databases',
  s3_intro:
    'We have collected and indexed one of the largest court decision databases in Ukraine. Data is updated daily.',
  s3_th_database: 'Database',
  s3_th_records: 'Number of Records',
  s3_th_details: 'Details',
  s3_db: [
    {
      name: 'USRCD (court decisions)',
      count: '~115,000,000',
      detail: 'Metadata for all decisions since 2006',
    },
    {
      name: 'Full texts USRCD',
      count: '~5,000,000+',
      detail: 'Downloaded and indexed full decision texts',
    },
    {
      name: 'Vector embeddings',
      count: '~2,000,000+',
      detail: 'Semantic search via Qdrant',
    },
    {
      name: 'Legislation (RADA)',
      count: '~200,000+',
      detail: 'Laws, resolutions, decrees, regulations',
    },
    {
      name: 'Judges (analytics)',
      count: '~12,000+',
      detail: 'Profiles with performance metrics',
    },
    {
      name: 'Legal entities (OpenReyestr)',
      count: '~2,000,000+',
      detail: 'USR, beneficiaries, debtor registry',
    },
    {
      name: 'MPs of Verkhovna Rada',
      count: '~450',
      detail: 'Profiles, voting records, bills',
    },
  ],
  s3_total:
    'Total volume: over 120 million records in databases. This makes LEX one of the largest legal databases in Ukraine, continuously growing.',

  // Section 4: Cost calculations
  s4_title: '4. MCP Query Cost Structure',
  s4_intro_prefix: 'Detailed cost breakdown available on the ',
  s4_intro_link: 'Service Pricing page',
  s4_intro_suffix: '. Key metrics below.',
  s4_th_type: 'Query Type',
  s4_th_cost: 'Cost',
  s4_th_price: 'Client Price',
  s4_th_margin: 'Margin',
  s4_queries: [
    {
      type: 'Search (quick)',
      cost: '$0.001\u20130.003',
      price: '$0.01',
      margin: '70\u201390%',
    },
    {
      type: 'Document analysis (standard)',
      cost: '$0.01\u20130.03',
      price: '$0.05',
      margin: '40\u201380%',
    },
    {
      type: 'Deep analysis (deep)',
      cost: '$0.05\u20130.15',
      price: '$0.20',
      margin: '25\u201375%',
    },
    {
      type: 'Semantic search',
      cost: '$0.002\u20130.005',
      price: '$0.02',
      margin: '60\u201390%',
    },
    {
      type: 'Judge analytics',
      cost: '$0.001',
      price: '$0.01',
      margin: '90%',
    },
  ],
  s4_avg_cost: 'Average query cost',
  s4_avg_price: 'Average client price',
  s4_avg_margin: 'Average margin',
  s4_monetization:
    'Monetization model: subscription (from $29/mo for lawyers, from $99/mo for law firms) + pay-per-query for high volumes. A lawyer makes 50\u2013200 queries per day on average, generating $2.5\u201310 in revenue per day with minimal costs.',

  // Section 5: Competitors
  s5_title: '5. Comparison with Ukrainian Companies',
  s5_features: [
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
  s5_th_feature: 'Feature',
  s5_activelex_desc:
    'Startup focused on legal process automation. No AI analytics, no API, limited database.',
  s5_zakon_desc:
    'Largest legal database. But no AI, no semantic search, no analytics. Classic search engine.',
  s5_liga_desc:
    'Largest market player. But legacy system, no AI, expensive subscription, closed ecosystem. No API.',
  s5_conclusion:
    'LEX is the only player with AI: none of the Ukrainian competitors has AI analytics, semantic search, MCP integration, or citation verification. We are not just another legal database \u2014 we are building a next-generation AI platform.',

  // Section 6: Use Cases
  s6_title: '6. Real Analytics Examples',
  s6_intro:
    'Below are two real cases performed by the LEX platform. They demonstrate the depth of analytics unavailable from any Ukrainian competitor.',
  s6_case1_title:
    'Case 1: Performance Analysis of Judge K. I.S.',
  s6_case1_subtitle:
    'Kyiv District Administrative Court | Full report based on 24,039 USRCD documents',
  s6_case1_intro:
    'The system automatically analyzed 24,039 procedural documents and 1,504 appellate decisions from 4 production database shards, building a complete judge profile.',
  s6_case1_stat1: 'unique cases',
  s6_case1_stat2: 'appeal reversals',
  s6_case1_stat3: 'deadline violations (#1 in court)',
  s6_case1_stat4: 'cases \u2014 public service',
  s6_case1_conclusion:
    'AI Conclusion: Judge K. I.S. is a high-productivity judge with problematic decision quality. Every second appealed decision is overturned by higher courts. Absolute leader in deadline violations (3.8x above average).',
  s6_case1_value:
    'Practical value: A lawyer receiving such a report can substantiate a judge recusal, adjust defense strategy, or predict the likelihood of appellate review.',
  s6_case1_link: 'Open judge analytics on the platform',
  s6_case2_title:
    'Case 2: Borrower Defense Strategy in Credit Case',
  s6_case2_subtitle:
    'Foreign currency loan from 2007 | Analysis based on 473 documents',
  s6_case2_intro:
    'A client approached with a problem: a EUR loan from 2007, debt obligations transferred between factoring companies. The current creditor is in liquidation. Outstanding amount \u2014 UAH 11.9 million. Enforcement proceedings lasted 11 years with no substantial progress.',
  s6_case2_strategies_title:
    'AI system identified 9 defense strategies, top 5:',
  s6_case2_strategies: [
    {
      priority: 'CRITICAL',
      text: 'The creditor has ceased to exist (in liquidation process) \u2014 enforcement on behalf of a non-existent legal entity is illegal',
    },
    {
      priority: 'VERY HIGH',
      text: 'Absence of foreign currency license for factoring company \u2014 verified in NBU registry, factoring agreement may be invalidated',
    },
    {
      priority: 'HIGH',
      text: '7-year error in enforcement writ (incorrect debtor data) \u2014 corrected only after 7 years',
    },
    {
      priority: 'HIGH',
      text: 'Possible expiration of statute of limitations for presenting enforcement document',
    },
    {
      priority: 'MEDIUM',
      text: 'Violation of legal certainty principle \u2014 11 years of continuous enforcement proceedings',
    },
  ],
  s6_case2_what:
    'What the system did: automatically found and analyzed all court decisions in the case (USRCD), verified the creditor company status (OpenReyestr), checked for foreign currency license (NBU registry), found relevant Supreme Court precedents.',
  s6_case2_time:
    'Execution time: full analysis of 473 documents took ~15 minutes. A lawyer would spend 2\u20133 business days on this.',
  s6_conclusion:
    'Value for clients: LEX reduces legal research time from days to minutes. Each of these reports is the result of AI working with tens of thousands of documents, cross-referencing multiple registries, and automatically identifying legally significant patterns.',

  // Section 7: Market Size
  s7_title: '7. Market Size',
  s7_tam_label: 'TAM (Total Addressable)',
  s7_tam_desc: 'Global legal AI market (2026)',
  s7_sam_label: 'SAM (Serviceable)',
  s7_sam_desc: 'Legal IT services in Ukraine + CEE',
  s7_som_label: 'SOM (Obtainable)',
  s7_som_desc: 'First 2 years, Ukraine',
  s7_th_segment: 'Segment',
  s7_th_count: 'Count',
  s7_th_arpu: 'Potential ARPU',
  s7_th_potential: 'Potential',
  s7_segments: [
    {
      name: 'Attorneys (UNBA)',
      count: '60,000+',
      arpu: '$29\u201349/mo',
      potential: '$1.7\u20132.9M/yr (1%)',
    },
    {
      name: 'Law firms',
      count: '5,000+',
      arpu: '$99\u2013299/mo',
      potential: '$0.6\u20131.8M/yr (1%)',
    },
    {
      name: 'Corporate legal departments',
      count: '10,000+',
      arpu: '$199\u2013499/mo',
      potential: '$2.4\u20136M/yr (1%)',
    },
    {
      name: 'API/MCP integrations (B2B)',
      count: '100+',
      arpu: '$500\u20132,000/mo',
      potential: '$0.6\u20132.4M/yr',
    },
  ],

  // Section 8: Technology Moat
  s8_title: '8. Technology Moat',
  s8_items: [
    {
      title: 'Data moat',
      desc: '120M+ records, 5M+ full decision texts, 2M+ vector embeddings. Collecting and processing this data took months. A competitor would have to replicate this journey.',
    },
    {
      title: 'MCP protocol (first in Ukraine)',
      desc: 'The only platform with native MCP integration. 45 tools for Claude, GPT, and other LLMs. This is the standard of the future \u2014 and we already support it.',
    },
    {
      title: 'AI pipeline',
      desc: 'Semantic search, citation verification, pattern analysis, decision classification \u2014 all automated. Built on GPT-4o + text-embedding-ada-002 + Qdrant.',
    },
    {
      title: 'Legal expertise in code',
      desc: 'A PhD lawyer as co-founder means domain logic is built into the architecture, not bolted on. This cannot be copied without legal expertise.',
    },
  ],

  // Section 9: Use of Funds
  s9_title: '9. Use of Funds',
  s9_intro:
    'Investment is directed toward achieving product-market fit and the first 200+ paying customers.',
  s9_items: [
    {
      label: 'Marketing & customer acquisition',
      pct: 50,
      amount: '$10,000',
      detail:
        'Facebook Ads, Google Ads, LinkedIn, content marketing, conferences',
    },
    {
      label: 'Infrastructure & AI costs',
      pct: 25,
      amount: '$5,000',
      detail:
        'Servers, OpenAI API, Qdrant, PostgreSQL, CDN, monitoring',
    },
    {
      label: 'Product development',
      pct: 15,
      amount: '$3,000',
      detail: 'New features, mobile app, integrations',
    },
    {
      label: 'Legal & operational costs',
      pct: 10,
      amount: '$2,000',
      detail: 'GDPR compliance, legal registration, accounting',
    },
  ],
  s9_milestones_title: 'Key Milestones (6 months)',
  s9_milestones: [
    {
      period: 'M1-2',
      text: 'Launch marketing campaigns, first 50 paying customers',
    },
    {
      period: 'M3-4',
      text: '100+ customers, launch B2B plans, MCP marketplace',
    },
    {
      period: 'M5-6',
      text: '200+ customers, MRR $5-10K, preparation for seed round',
    },
  ],

  // Section 10: Revenue projections
  s10_title: '10. Revenue Forecast with $20,000 Marketing Investment',
  s10_input_title: 'Input Data',
  s10_input: [
    { label: 'Marketing budget:', value: '$20,000' },
    {
      label: 'CAC (customer acquisition cost):',
      value: 'up to $100',
    },
    { label: 'Number of customers:', value: '200 paying' },
    { label: 'Average check:', value: '$29\u201399/mo' },
  ],
  s10_scenarios_title: 'Monetization Scenarios (monthly)',
  s10_th_scenario: 'Scenario',
  s10_th_clients: 'Clients',
  s10_th_check: 'Avg. check/mo',
  s10_th_mrr: 'MRR',
  s10_th_arr: 'ARR',
  s10_scenarios: [
    {
      name: 'Conservative',
      clients: '200',
      check: '$29',
      mrr: '$5,800',
      arr: '$69,600',
    },
    {
      name: 'Base',
      clients: '200',
      check: '$49',
      mrr: '$9,800',
      arr: '$117,600',
    },
    {
      name: 'Optimistic',
      clients: '200',
      check: '$99',
      mrr: '$19,800',
      arr: '$237,600',
    },
    {
      name: 'Mix (lawyers + firms)',
      clients: '150 + 50',
      check: '$29 / $99',
      mrr: '$9,300',
      arr: '$111,600',
    },
  ],
  s10_roi_title: 'Investment ROI',
  s10_roi: [
    { label: 'Investment:', value: '$20,000' },
    { label: 'Payback (base):', value: '~2 months' },
    { label: 'ROI in 12 months:', value: '488% ($117,600)' },
  ],
  s10_ltv_title: 'LTV / CAC Metrics',
  s10_ltv: [
    { label: 'CAC:', value: '$100' },
    { label: 'LTV (12 mo, base):', value: '$588' },
    { label: 'LTV / CAC:', value: '5.9x' },
  ],
  s10_conclusion:
    'Key takeaway: with a $20,000 marketing investment (Facebook + Google Ads), at CAC up to $100, we acquire 200 paying customers. At an average check of $49/mo \u2014 MRR is $9,800, providing full payback of marketing costs in 2 months. LTV/CAC = 5.9x \u2014 an excellent metric for SaaS business (benchmark > 3x).',
  s10_scaling_title: 'Scaling Potential',
  s10_scaling:
    'There are over 60,000 registered attorneys and tens of thousands of lawyers in Ukraine. Converting even 1% of the market gives us 600+ customers. Additionally, the MCP model allows selling API access to companies, multiplying revenue potential without proportional cost growth.',

  // CTA
  cta_title: 'Ready to discuss?',
  cta_subtitle:
    'We are open to dialogue with investors who see the potential of AI in Ukraine\'s legal industry.',
  cta_try: 'Try the platform',

  // Footer
  footer: '\u00A9 2024\u20132026 SecondLayer. All rights reserved.',
};
