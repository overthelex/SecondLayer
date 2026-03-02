const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'lexwebapp', 'public', 'blog-banners');

const banners = [
  {
    id: 'attorney-marketplace',
    badge: 'LegalTech',
    title: 'Attorney <span>Marketplace</span>:<br>From Bar Registry<br>to Escrow Payments',
    subtitle: 'ERAU verification, onboarding, consultation flow, real-time chat, Monobank escrow',
    steps: ['ERAU Verify', 'Onboard', 'Search', 'Request', 'Chat', 'Escrow'],
    accent: '#d66b46',
    accent2: '#3b82f6',
  },
  {
    id: 'mcp-tokens-claude-desktop',
    badge: 'MCP Integration',
    title: '<span>MCP Tokens</span> &<br>Claude Desktop:<br>Legal AI on Your Desktop',
    subtitle: 'One token. One command. 56 legal AI tools directly in Claude Desktop.',
    steps: ['Create Token', 'Configure', 'Connect', '56 Tools'],
    accent: '#8b5cf6',
    accent2: '#d66b46',
  },
  {
    id: 'round-robin-llm',
    badge: 'Architecture',
    title: 'Why We <span>Dropped</span><br>Round-Robin Between<br>OpenAI & Anthropic',
    subtitle: 'Multi-provider LLM routing looks great on diagrams. In production, it nearly killed our product.',
    steps: ['Round-Robin', 'Chaos', 'Budget-Aware', 'One Provider'],
    accent: '#ef4444',
    accent2: '#f59e0b',
  },
  {
    id: 'mcp-server-architecture',
    badge: 'MCP Architecture',
    title: 'How We Built an<br><span>MCP Server</span> with<br>56 Legal AI Tools',
    subtitle: 'One endpoint. Three services. Triple transport. 11-step execution pipeline.',
    steps: ['36 Backend', '4 RADA', '16 Registry', '3 Transports'],
    accent: '#3b82f6',
    accent2: '#10b981',
  },
  {
    id: 'semantic-search-legislation',
    badge: 'NLP / Embeddings',
    title: '<span>Semantic Search</span><br>Across 5,000+<br>Legislation Articles',
    subtitle: 'VoyageAI embeddings, intelligent chunking, and Qdrant vector search over 12 Ukrainian codes.',
    steps: ['Sectionize', 'Vectorize', 'Index', 'Search'],
    accent: '#10b981',
    accent2: '#3b82f6',
  },
  {
    id: 'hallucination-guard',
    badge: 'RAG / Validation',
    title: '<span>Hallucination</span>Guard<br>& CitationValidator<br>in Production',
    subtitle: 'Two-layer protection against AI fabrications in legal documents. Zero tolerance for fiction.',
    steps: ['Extract Claims', 'Find Sources', 'Classify', 'Validate'],
    accent: '#f59e0b',
    accent2: '#ef4444',
  },
  {
    id: 'monolith-to-mcp',
    badge: 'Migration',
    title: 'From <span>REST Monolith</span><br>to MCP Architecture:<br>Lessons Learned',
    subtitle: 'REST: you design APIs for developers. MCP: you design APIs for AI.',
    steps: ['REST API', 'Tool Handlers', 'MCP Schema', 'AI Routing'],
    accent: '#6366f1',
    accent2: '#d66b46',
  },
  {
    id: 'ai-wont-replace-lawyers',
    badge: 'Future of Law',
    title: 'AI Won\'t <span>Replace</span><br>Lawyers. But Lawyers<br>With AI Will.',
    subtitle: '300 cases instead of 30. 16 registries in 2 seconds. Same hours, dramatically better results.',
    steps: ['Research', 'Analysis', 'Validation', 'Strategy'],
    accent: '#d66b46',
    accent2: '#8b5cf6',
  },
  {
    id: 'semantic-vs-keyword-search',
    badge: 'Legal Research',
    title: 'Court Decisions by<br><span>Meaning</span>, Not<br>by Keywords',
    subtitle: 'Keywords find words. Semantic search finds meaning. The difference changes legal research.',
    steps: ['Query', 'Embed', 'Similarity', 'Results'],
    accent: '#0ea5e9',
    accent2: '#10b981',
  },
  {
    id: 'ai-analyzes-millions',
    badge: 'Big Data / AI',
    title: 'How AI Analyzes<br><span>Millions</span> of Court<br>Decisions in Seconds',
    subtitle: 'Not about speed. About completeness. 300 cases is statistics, not a sample.',
    steps: ['Collect', 'Classify', 'Trends', 'Insights'],
    accent: '#8b5cf6',
    accent2: '#3b82f6',
  },
  {
    id: 'due-diligence-ai',
    badge: 'Compliance',
    title: '<span>Due Diligence</span><br>With AI: 16 Registries<br>in One Query',
    subtitle: 'Company check: one request, 2 seconds, full picture. EDRPOU, beneficiaries, debtors, enforcement.',
    steps: ['Entity', 'Beneficiaries', 'Debtors', 'Enforcement'],
    accent: '#10b981',
    accent2: '#f59e0b',
  },
  {
    id: 'data-privacy-ai',
    badge: 'Security / GDPR',
    title: '<span>Data Privacy</span> & AI:<br>How We Protect Client<br>Data in Legal Platform',
    subtitle: 'Matter segregation, hash-chain audit trails, legal holds, GDPR by design.',
    steps: ['Segregation', 'Audit Trail', 'Legal Holds', 'GDPR'],
    accent: '#64748b',
    accent2: '#d66b46',
  },
];

function generateHTML(b) {
  const stepsHTML = b.steps.map((s, i) => {
    const arrow = i < b.steps.length - 1 ? `<span class="arrow">&rarr;</span>` : '';
    return `<div class="step">${s}</div>${arrow}`;
  }).join('\n      ');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display:flex; align-items:center; justify-content:center; min-height:100vh; background:#e2e8f0; font-family:'Inter',sans-serif; }
  .banner { width:1200px; height:627px; background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 50%,#e2e8f0 100%); position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; padding:60px 80px; }
  .banner::before { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(0,0,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.04) 1px,transparent 1px); background-size:40px 40px; }
  .glow-1 { position:absolute; width:500px; height:500px; background:radial-gradient(circle,${b.accent}20 0%,transparent 70%); top:-100px; right:-100px; }
  .glow-2 { position:absolute; width:400px; height:400px; background:radial-gradient(circle,${b.accent2}15 0%,transparent 70%); bottom:-100px; left:-50px; }
  .content { position:relative; z-index:2; }
  .badge { display:inline-flex; align-items:center; gap:8px; background:${b.accent}18; border:1px solid ${b.accent}40; color:${b.accent}; font-size:13px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; padding:6px 16px; border-radius:100px; margin-bottom:32px; }
  .badge-dot { width:6px; height:6px; background:${b.accent}; border-radius:50%; }
  .title { color:#0f172a; font-size:48px; font-weight:800; line-height:1.15; max-width:800px; margin-bottom:24px; letter-spacing:-0.02em; }
  .title span { color:${b.accent}; }
  .subtitle { color:#475569; font-size:18px; font-weight:400; line-height:1.5; max-width:700px; margin-bottom:40px; }
  .flow { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .step { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.7); border:1px solid rgba(0,0,0,0.08); padding:8px 16px; border-radius:10px; color:#334155; font-size:13px; font-weight:500; }
  .arrow { color:rgba(0,0,0,0.25); font-size:18px; }
  .logo-area { position:absolute; bottom:50px; right:80px; z-index:2; text-align:right; }
  .logo-text { color:#94a3b8; font-size:18px; font-weight:600; letter-spacing:0.05em; }
  .logo-text span { color:#d66b46; }
  .url { color:#94a3b8; font-size:13px; }
  .deco-lines { position:absolute; top:60px; right:80px; z-index:2; }
  .deco-line { height:3px; margin-bottom:6px; border-radius:2px; opacity:0.5; }
  .deco-line:nth-child(1) { background:${b.accent}; width:200px; }
  .deco-line:nth-child(2) { background:${b.accent2}; width:150px; }
  .deco-line:nth-child(3) { background:${b.accent}; width:100px; opacity:0.25; }
</style></head><body>
<div class="banner">
  <div class="glow-1"></div>
  <div class="glow-2"></div>
  <div class="deco-lines"><div class="deco-line"></div><div class="deco-line"></div><div class="deco-line"></div></div>
  <div class="content">
    <div class="badge"><div class="badge-dot"></div>${b.badge}</div>
    <h1 class="title">${b.title}</h1>
    <p class="subtitle">${b.subtitle}</p>
    <div class="flow">
      ${stepsHTML}
    </div>
  </div>
  <div class="logo-area"><div class="logo-text"><span>LEX</span> AI</div><div class="url">legal.org.ua</div></div>
</div>
</body></html>`;
}

// Generate all
for (const b of banners) {
  const htmlPath = path.join(OUT_DIR, `${b.id}.html`);
  const pngPath = path.join(OUT_DIR, `${b.id}.png`);

  fs.writeFileSync(htmlPath, generateHTML(b));
  console.log(`Generated HTML: ${b.id}`);

  try {
    execFileSync('npx', [
      'playwright', 'screenshot',
      '--viewport-size=1200,627',
      '--full-page',
      `file://${htmlPath}`,
      pngPath,
    ], { stdio: 'pipe' });
    console.log(`  Screenshot: ${b.id}.png`);
  } catch (e) {
    console.error(`  FAILED: ${b.id}`, e.message);
  }

  // Remove HTML temp file
  fs.unlinkSync(htmlPath);
}

console.log('\nDone! All banners in:', OUT_DIR);
