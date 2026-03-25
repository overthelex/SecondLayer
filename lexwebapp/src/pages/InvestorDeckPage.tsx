/**
 * Simplified Investor Deck — pitch-deck style single-page presentation
 * Full-viewport scroll-snap slides with framer-motion animations
 */
import { motion } from 'framer-motion';
import {
  ArrowLeft, Database, TrendingUp, Users, Target,
  Shield, Zap, Mail, ExternalLink, BarChart3,
  DollarSign, Briefcase, Globe, ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Slide wrapper                                                     */
/* ------------------------------------------------------------------ */
function Slide({
  children,
  className = '',
  dark = false,
}: {
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <section
      className={`min-h-screen snap-start flex flex-col items-center justify-center px-6 md:px-12 py-16 ${
        dark
          ? 'bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white'
          : 'bg-gradient-to-br from-claude-bg via-white to-claude-sidebar text-claude-text'
      } ${className}`}
    >
      <div className="max-w-5xl w-full">{children}</div>
    </section>
  );
}

/* Stat card */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <div className="text-4xl md:text-5xl font-serif font-bold tracking-tight">{value}</div>
      <div className="mt-2 text-sm md:text-base opacity-70 font-sans">{label}</div>
    </motion.div>
  );
}

/* Fade-in wrapper */
function FadeIn({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function InvestorDeckPage() {
  const navigate = useNavigate();

  return (
    <div className="snap-y snap-mandatory h-screen overflow-y-auto scroll-smooth">
      {/* Fixed nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="flex-1" />
          <img src="/Image.jpg" alt="LEX" className="h-8 w-auto" />
        </div>
      </nav>

      {/* ============================================================ */}
      {/* SLIDE 1 — Hero                                               */}
      {/* ============================================================ */}
      <Slide dark>
        <div className="text-center">
          <FadeIn>
            <img src="/logo-white.png" alt="LEX" className="h-20 md:h-28 w-auto mx-auto mb-8" />
          </FadeIn>
          <FadeIn delay={0.15}>
            <h1 className="text-5xl md:text-7xl font-serif font-bold tracking-tight mb-6">
              AI-Powered Legal Intelligence
            </h1>
          </FadeIn>
          <FadeIn delay={0.3}>
            <p className="text-xl md:text-2xl opacity-80 font-sans max-w-3xl mx-auto leading-relaxed">
              The first AI legal analytics platform in Ukraine with 120M+ court decisions
            </p>
          </FadeIn>
          <FadeIn delay={0.45}>
            <div className="mt-10 flex items-center justify-center gap-6">
              <span className="px-5 py-2 bg-white/10 backdrop-blur rounded-full text-sm font-sans font-medium border border-white/20">
                Seed Round: $150K - $500K
              </span>
              <span className="px-5 py-2 bg-claude-accent text-white rounded-full text-sm font-sans font-medium">
                Q1 2026
              </span>
            </div>
          </FadeIn>
          <FadeIn delay={0.6}>
            <ChevronDown size={28} className="mx-auto mt-12 opacity-40 animate-bounce" />
          </FadeIn>
        </div>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 2 — Problem                                            */}
      {/* ============================================================ */}
      <Slide>
        <FadeIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Target size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">The Problem</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              stat: '60,000+',
              title: 'Lawyers in Ukraine',
              desc: 'Still research case law manually, spending hours browsing outdated databases',
            },
            {
              stat: '2-3 days',
              title: 'Average Research Time',
              desc: 'A single legal research task takes 2-3 business days using current tools',
            },
            {
              stat: '0 AI tools',
              title: 'No Modern Solutions',
              desc: 'Existing platforms (Liga, ZakonOnline) have no AI, no semantic search, no API integration',
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={0.1 * (i + 1)}>
              <div className="p-6 bg-white rounded-2xl border border-claude-border shadow-sm h-full">
                <div className="text-3xl font-serif font-bold text-red-600 mb-3">{item.stat}</div>
                <h3 className="text-lg font-sans font-semibold text-claude-text mb-2">{item.title}</h3>
                <p className="text-sm text-claude-subtext font-sans leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 3 — Solution                                           */}
      {/* ============================================================ */}
      <Slide dark>
        <FadeIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Zap size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Our Solution</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Database size={28} />,
              title: 'AI Legal Analytics',
              desc: 'Semantic search, automated case analysis, and intelligent document drafting powered by GPT-4o and Claude',
            },
            {
              icon: <Globe size={28} />,
              title: '45 MCP Tools',
              desc: 'First MCP-native legal platform globally. Direct integration with Claude Desktop, GPT, and any LLM client',
            },
            {
              icon: <BarChart3 size={28} />,
              title: 'Judge Analytics',
              desc: 'Comprehensive judge profiling, legislation monitoring, business registry lookups, and citation validation',
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={0.1 * (i + 1)}>
              <div className="p-6 bg-white/5 backdrop-blur rounded-2xl border border-white/10 h-full">
                <div className="text-claude-accent mb-4">{item.icon}</div>
                <h3 className="text-lg font-sans font-semibold mb-2">{item.title}</h3>
                <p className="text-sm opacity-70 font-sans leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 4 — Traction                                           */}
      {/* ============================================================ */}
      <Slide>
        <FadeIn>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
              <TrendingUp size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Traction</h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <Stat value="120M+" label="Records indexed" />
          <Stat value="115M" label="Court decisions" />
          <Stat value="5M+" label="Full-text decisions" />
          <Stat value="2M+" label="Vector embeddings" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <Stat value="12,000+" label="Judge profiles" />
          <Stat value="45" label="MCP tools live" />
          <Stat value="Live" label="Paying users" />
          <Stat value="Diia" label="Gov ID authentication" />
        </div>

        <FadeIn delay={0.3}>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-sans font-medium border border-green-200">
              Monobank payments integrated
            </span>
            <span className="px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-sans font-medium border border-blue-200">
              Production product live
            </span>
            <span className="px-4 py-2 bg-purple-50 text-purple-700 rounded-full text-sm font-sans font-medium border border-purple-200">
              UAH + USD billing
            </span>
          </div>
        </FadeIn>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 5 — Market                                             */}
      {/* ============================================================ */}
      <Slide dark>
        <FadeIn>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Briefcase size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Market Opportunity</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {[
            { label: 'TAM', value: '$25B', desc: 'Global Legal AI' },
            { label: 'SAM', value: '$500M', desc: 'Ukraine + CEE' },
            { label: 'SOM', value: '$5M', desc: 'First 2 years' },
          ].map((item, i) => (
            <FadeIn key={i} delay={0.1 * (i + 1)}>
              <div className="text-center p-8 bg-white/5 backdrop-blur rounded-2xl border border-white/10">
                <div className="text-sm font-sans font-medium opacity-50 uppercase tracking-wider mb-2">{item.label}</div>
                <div className="text-5xl md:text-6xl font-serif font-bold mb-2">{item.value}</div>
                <div className="text-sm opacity-60 font-sans">{item.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.4}>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-serif font-bold">60,000+</div>
              <div className="text-xs opacity-60 font-sans mt-1">Attorneys</div>
            </div>
            <div>
              <div className="text-2xl font-serif font-bold">5,000+</div>
              <div className="text-xs opacity-60 font-sans mt-1">Law firms</div>
            </div>
            <div>
              <div className="text-2xl font-serif font-bold">10,000+</div>
              <div className="text-xs opacity-60 font-sans mt-1">Corporate legal depts</div>
            </div>
          </div>
        </FadeIn>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 6 — Business Model                                     */}
      {/* ============================================================ */}
      <Slide>
        <FadeIn>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-claude-accent/10 text-claude-accent flex items-center justify-center">
              <DollarSign size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Business Model</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {[
            { tier: 'Individual', price: '$29', period: '/mo', features: ['AI legal search', 'Judge analytics', 'Case analysis'] },
            { tier: 'Law Firm', price: '$99', period: '/mo', features: ['Team access', 'API integration', 'Priority support'] },
            { tier: 'Enterprise', price: '$499', period: '/mo', features: ['Custom MCP tools', 'Dedicated instance', 'SLA guarantee'] },
          ].map((plan, i) => (
            <FadeIn key={i} delay={0.1 * (i + 1)}>
              <div className={`p-6 rounded-2xl border h-full ${
                i === 1
                  ? 'bg-claude-accent/5 border-claude-accent/30 ring-2 ring-claude-accent/20'
                  : 'bg-white border-claude-border'
              }`}>
                <div className="text-sm font-sans font-medium text-claude-subtext uppercase tracking-wider mb-3">{plan.tier}</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-serif font-bold text-claude-text">{plan.price}</span>
                  <span className="text-sm text-claude-subtext font-sans">{plan.period}</span>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((f, j) => (
                    <li key={j} className="text-sm font-sans text-claude-subtext flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-claude-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.4}>
          <div className="grid grid-cols-3 gap-6 text-center p-6 bg-claude-bg rounded-2xl">
            <div>
              <div className="text-2xl font-serif font-bold text-claude-text">60-90%</div>
              <div className="text-xs text-claude-subtext font-sans mt-1">Avg margin</div>
            </div>
            <div>
              <div className="text-2xl font-serif font-bold text-claude-text">5.9x</div>
              <div className="text-xs text-claude-subtext font-sans mt-1">LTV / CAC</div>
            </div>
            <div>
              <div className="text-2xl font-serif font-bold text-claude-text">Pay-per-query</div>
              <div className="text-xs text-claude-subtext font-sans mt-1">API access model</div>
            </div>
          </div>
        </FadeIn>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 7 — Competitive Advantage                              */}
      {/* ============================================================ */}
      <Slide dark>
        <FadeIn>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Shield size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Competitive Moat</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              title: 'Only AI Legal Platform in Ukraine',
              desc: 'No competitor offers AI-powered semantic search or LLM integration for Ukrainian legal data',
            },
            {
              title: 'Data Moat: 120M+ Records',
              desc: 'Months to replicate our indexed dataset. Continuous ingestion widens the gap daily',
            },
            {
              title: 'First MCP-Native Legal Platform',
              desc: 'Globally first legal tech to ship 45 MCP tools — direct Claude Desktop and GPT integration',
            },
            {
              title: 'PhD Lawyer + 15yr Tech Founder',
              desc: 'Rare combination: deep legal domain expertise paired with production-grade engineering',
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={0.1 * (i + 1)}>
              <div className="p-6 bg-white/5 backdrop-blur rounded-2xl border border-white/10 h-full">
                <h3 className="text-lg font-sans font-semibold mb-2">{item.title}</h3>
                <p className="text-sm opacity-70 font-sans leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 8 — Team                                               */}
      {/* ============================================================ */}
      <Slide>
        <FadeIn>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">Founding Team</h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-10">
          <FadeIn delay={0.1}>
            <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl border border-claude-border shadow-sm">
              <img
                src="/founder-vladimir.jpeg"
                alt="Volodymyr Ovcharov"
                className="w-28 h-28 rounded-full object-cover shadow-lg mb-5"
              />
              <h3 className="text-xl font-serif font-bold text-claude-text">Volodymyr Ovcharov</h3>
              <div className="text-sm text-claude-accent font-sans font-medium mt-1 mb-4">CTO / Co-Founder</div>
              <p className="text-sm text-claude-subtext font-sans leading-relaxed">
                Applied Mathematics, KPI. 15+ years in software engineering.
                Former researcher at Glushkov Institute of Cybernetics.
                Built the entire platform architecture and all 45 MCP tools.
              </p>
              <a
                href="https://www.linkedin.com/in/vladimir-ovcharov/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans"
              >
                <ExternalLink size={14} />
                LinkedIn
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl border border-claude-border shadow-sm">
              <img
                src="/founder-igor.jpeg"
                alt="Igor Kyrychenko"
                className="w-28 h-28 rounded-full object-cover shadow-lg mb-5"
              />
              <h3 className="text-xl font-serif font-bold text-claude-text">Igor Kyrychenko</h3>
              <div className="text-sm text-claude-accent font-sans font-medium mt-1 mb-4">CEO / Co-Founder</div>
              <p className="text-sm text-claude-subtext font-sans leading-relaxed">
                PhD in Law. Legal analytics expert with deep domain knowledge
                of Ukrainian court systems, legislation, and regulatory frameworks.
                Former practicing attorney.
              </p>
              <a
                href="https://www.linkedin.com/in/ihor-kyrychenko-90503890/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans"
              >
                <ExternalLink size={14} />
                LinkedIn
              </a>
            </div>
          </FadeIn>
        </div>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 9 — The Ask                                            */}
      {/* ============================================================ */}
      <Slide dark>
        <FadeIn>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Target size={22} />
            </div>
            <h2 className="text-3xl md:text-4xl font-serif font-bold">The Ask</h2>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="text-center mb-10">
            <div className="text-5xl md:text-6xl font-serif font-bold mb-3">$150K - $500K</div>
            <div className="text-lg opacity-70 font-sans">Seed Round</div>
          </div>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="grid md:grid-cols-4 gap-6 mb-12">
            {[
              { pct: '50%', label: 'Marketing & Sales', desc: 'User acquisition, partnerships, conferences' },
              { pct: '25%', label: 'Infrastructure', desc: 'Servers, GPU, vector DB scaling' },
              { pct: '15%', label: 'Product Development', desc: 'New tools, EU expansion' },
              { pct: '10%', label: 'Legal & Operations', desc: 'Compliance, IP protection' },
            ].map((item, i) => (
              <div key={i} className="text-center p-4 bg-white/5 backdrop-blur rounded-xl border border-white/10">
                <div className="text-3xl font-serif font-bold mb-1">{item.pct}</div>
                <div className="text-sm font-sans font-semibold mb-1">{item.label}</div>
                <div className="text-xs opacity-50 font-sans">{item.desc}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="p-6 bg-white/5 backdrop-blur rounded-2xl border border-white/10">
            <h3 className="text-lg font-sans font-semibold mb-4">6-Month Milestones</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-sm font-sans opacity-80">200+ paying customers</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-sm font-sans opacity-80">MRR $10K+</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-sm font-sans opacity-80">CEE market entry</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </Slide>

      {/* ============================================================ */}
      {/* SLIDE 10 — Contact                                           */}
      {/* ============================================================ */}
      <Slide>
        <div className="text-center">
          <FadeIn>
            <img src="/Image.jpg" alt="LEX" className="h-16 w-auto mx-auto mb-8" />
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-claude-text mb-4">
              Let's Build the Future of Legal AI
            </h2>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-lg text-claude-subtext font-sans max-w-2xl mx-auto mb-10">
              We are building the infrastructure layer for legal intelligence in Ukraine and CEE.
              The data moat is deep, the product is live, and the market is ready.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <a
                href="mailto:vladimir@legal.org.ua"
                className="inline-flex items-center gap-2 px-8 py-3 bg-claude-accent text-white rounded-xl font-sans font-medium hover:bg-[#C66345] transition-colors"
              >
                <Mail size={18} />
                vladimir@legal.org.ua
              </a>
              <a
                href="https://legal.org.ua"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 bg-claude-bg text-claude-text rounded-xl font-sans font-medium border border-claude-border hover:border-claude-accent transition-colors"
              >
                <Globe size={18} />
                legal.org.ua
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={0.4}>
            <a
              href="https://legal.org.ua"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-[#1a1a2e] to-[#0f3460] text-white rounded-2xl font-sans font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg"
            >
              <ExternalLink size={20} />
              Try the Platform
            </a>
          </FadeIn>
          <FadeIn delay={0.5}>
            <p className="mt-10 text-xs text-claude-subtext/60 font-sans">
              Confidential. For intended recipients only.
            </p>
          </FadeIn>
        </div>
      </Slide>
    </div>
  );
}
