import { motion } from 'framer-motion';
import {
  ArrowLeft, Users, Target, Database, BarChart3,
  TrendingUp, ExternalLink, FileText, Shield, PoundSterling,
  Globe, Zap, Briefcase, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { gbp as t } from './investor-letter-translations.gbp';

const COMPETITOR_FLAGS: [boolean, boolean, boolean, boolean][] = [
  [true, false, false, false],
  [true, false, false, false],
  [true, false, false, false],
  [true, false, false, false],
  [true, true, true, true],
  [true, true, true, true],
  [true, true, true, true],
  [true, false, false, false],
  [true, false, false, true],
  [true, false, false, true],
  [true, false, true, false],
  [true, false, false, false],
  [true, false, false, false],
  [true, false, false, false],
];

const Check = () => <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-xs font-bold">+</span>;
const Cross = () => <span className="inline-flex items-center justify-center w-6 h-6 bg-red-50 text-red-400 rounded-full text-xs">-</span>;

export function UKInvestorPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-claude-bg via-white to-claude-sidebar">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
          >
            <ArrowLeft size={16} />
            {t.back}
          </button>
          <div className="flex-1" />
          <div className="px-3 py-1.5 bg-claude-bg rounded-lg text-sm font-sans font-medium text-claude-subtext">
            {t.classification}
          </div>
          <img src="/Image.jpg" alt="LEX" className="h-10 w-auto" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-16">
          <img src="/Image.jpg" alt="LEX" className="h-24 w-auto mx-auto mb-6" />
          <h1 className="text-4xl font-serif text-claude-text font-medium mb-3">{t.title}</h1>
          <p className="text-lg text-claude-subtext font-sans">{t.subtitle}</p>
          <div className="mt-4 inline-block px-4 py-1.5 bg-claude-accent/10 text-claude-accent rounded-full text-sm font-sans font-medium">
            {t.date}
          </div>
        </motion.div>

        {/* Section 1: Founders */}
        <Section icon={<Users size={20} />} title={t.s1_title}>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <img src="/founder-vladimir.jpeg" alt={t.s1_vladimir_name} className="w-20 h-20 rounded-full object-cover shadow-md" />
              <h3 className="text-xl font-serif text-claude-text">{t.s1_vladimir_name}</h3>
              <p className="text-sm text-claude-subtext font-sans leading-relaxed">
                <span className="font-medium text-claude-text">{t.s1_vladimir_role}</span>{' '}
                {t.s1_vladimir_bio}
              </p>
              <a href="https://www.linkedin.com/in/vladimir-ovcharov/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans">
                <ExternalLink size={14} />
                {t.s1_vladimir_linkedin}
              </a>
            </div>
            <div className="space-y-3">
              <img src="/founder-igor.jpeg" alt={t.s1_igor_name} className="w-20 h-20 rounded-full object-cover shadow-md" />
              <h3 className="text-xl font-serif text-claude-text">{t.s1_igor_name}</h3>
              <p className="text-sm text-claude-subtext font-sans leading-relaxed">
                <span className="font-medium text-claude-text">{t.s1_igor_role}</span>{' '}
                {t.s1_igor_bio}
              </p>
              <a href="https://www.linkedin.com/in/ihor-kyrychenko-90503890/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans">
                <ExternalLink size={14} />
                {t.s1_igor_linkedin}
              </a>
            </div>
          </div>
          <div className="mt-8 p-4 bg-claude-bg rounded-xl">
            <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s1_combo}</p>
          </div>
        </Section>

        {/* Section 2: Why Now */}
        <Section icon={<Zap size={20} />} title={t.s2_why_now_title} delay={0.1}>
          <div className="grid sm:grid-cols-2 gap-4">
            {t.s2_why_now_items.map((item) => (
              <div key={item.title} className="p-5 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{item.title}</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 3: The Opportunity */}
        <Section icon={<Target size={20} />} title={t.s3_opp_title} delay={0.15}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">
              <span className="font-medium text-claude-text">LEX</span> — {t.s3_opp_intro.replace(/^LEX is an /, '')}
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-800 font-sans font-medium mb-2">{t.s3_opp_no_competitors_title}</p>
              <p className="text-sm text-green-700 font-sans leading-relaxed">
                {t.s3_opp_no_competitors_text}
                <a href="https://legal.org.ua/judges" target="_blank" rel="noopener noreferrer" className="text-green-800 underline font-medium">
                  {t.s3_opp_judges_link_text}
                </a>
                {t.s3_opp_no_competitors_suffix}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s3_opp_global_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-claude-border">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_opp_th_company}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_opp_th_country}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_opp_th_valuation}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_opp_th_focus}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">Harvey AI</td>
                      <td className="py-3 px-4">USA</td>
                      <td className="py-3 px-4">{t.s3_opp_harvey_valuation}</td>
                      <td className="py-3 px-4">{t.s3_opp_harvey_focus}</td>
                    </tr>
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">Clio</td>
                      <td className="py-3 px-4">Canada</td>
                      <td className="py-3 px-4">{t.s3_opp_clio_valuation}</td>
                      <td className="py-3 px-4">{t.s3_opp_clio_focus}</td>
                    </tr>
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">LexisNexis</td>
                      <td className="py-3 px-4">USA/UK</td>
                      <td className="py-3 px-4">{t.s3_opp_lexis_valuation}</td>
                      <td className="py-3 px-4">{t.s3_opp_lexis_focus}</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-claude-accent">LEX (legal.org.ua)</td>
                      <td className="py-3 px-4">Ukraine</td>
                      <td className="py-3 px-4">{t.s3_opp_lex_stage}</td>
                      <td className="py-3 px-4">{t.s3_opp_lex_focus}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-3">{t.s3_opp_advantages_title}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {t.s3_opp_advantages.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-claude-subtext font-sans">
                    <div className="w-1.5 h-1.5 bg-claude-accent rounded-full mt-1.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 4: Production Data Assets — expanded */}
        <Section icon={<Database size={20} />} title={t.s4_data_title} delay={0.2}>
          <p className="text-sm text-claude-subtext font-sans mb-6 leading-relaxed">{t.s4_data_intro}</p>

          {/* Court decisions */}
          <DataSubSection title={t.s4_sub_court}>
            <DataTable rows={t.s4_court_db} showStatus />
          </DataSubSection>

          {/* NAIS */}
          <DataSubSection title={t.s4_sub_nais}>
            <DataTable rows={t.s4_nais_db} />
            <p className="mt-2 text-xs font-sans font-medium text-claude-accent">{t.s4_nais_total}</p>
          </DataSubSection>

          {/* Tax */}
          <DataSubSection title={t.s4_sub_tax}>
            <p className="text-xs text-claude-subtext font-sans mb-3 italic">{t.s4_tax_note}</p>
            <DataTable rows={t.s4_tax_db} />
            <p className="mt-2 text-xs font-sans font-medium text-claude-accent">{t.s4_tax_total}</p>
          </DataSubSection>

          {/* Sanctions */}
          <DataSubSection title={t.s4_sub_sanctions}>
            <DataTable rows={t.s4_sanctions_db} />
          </DataSubSection>

          {/* Procurement */}
          <DataSubSection title={t.s4_sub_procurement}>
            <DataTable rows={t.s4_procurement_db} showStatus />
          </DataSubSection>

          {/* Business registry */}
          <DataSubSection title={t.s4_sub_business}>
            <DataTable rows={t.s4_business_db} />
            <p className="mt-2 text-xs font-sans font-medium text-claude-accent">{t.s4_business_total}</p>
          </DataSubSection>

          {/* Vector / AI */}
          <DataSubSection title={t.s4_sub_vector}>
            <DataTable rows={t.s4_vector_db} />
          </DataSubSection>

          {/* Consolidated summary */}
          <div className="mt-8 p-5 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
            <h4 className="text-sm font-medium text-claude-text font-sans mb-3">{t.s4_consolidated_title}</h4>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm font-sans">
              {t.s4_consolidated.map((row) => (
                <div key={row.category} className="flex justify-between border-b border-claude-border/30 py-1">
                  <span className="text-claude-subtext">{row.category}</span>
                  <span className="font-medium text-claude-text font-serif">{row.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="px-4 py-2 bg-claude-accent/10 rounded-lg text-center flex-1">
                <p className="text-lg font-serif text-claude-accent font-medium">119,000,000+</p>
                <p className="text-[10px] text-claude-subtext font-sans">{t.s4_total_structured.replace('Total structured records: ', '')}</p>
              </div>
              <div className="px-4 py-2 bg-claude-accent/10 rounded-lg text-center flex-1">
                <p className="text-lg font-serif text-claude-accent font-medium">53M / 1.4 TB</p>
                <p className="text-[10px] text-claude-subtext font-sans">{t.s4_total_files.replace('Full-text file archive: ', '')}</p>
              </div>
            </div>
          </div>

          {/* Pipeline */}
          <div className="mt-6 p-4 bg-claude-bg rounded-xl">
            <h4 className="text-sm font-medium text-claude-text font-sans mb-3">{t.s4_pipeline_title}</h4>
            <div className="space-y-2">
              {t.s4_pipeline.map((row) => (
                <div key={row.source} className="flex items-center gap-3 text-sm font-sans">
                  <span className="text-claude-text font-medium flex-shrink-0 w-48">{row.source}</span>
                  <span className="text-claude-subtext flex-1">{row.value}</span>
                  <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-0.5 rounded">{row.access}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Section 5: Business Model — NEW */}
        <Section icon={<Briefcase size={20} />} title={t.s5_biz_title} delay={0.25}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s5_biz_intro}</p>

            {/* Pricing tiers */}
            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s5_biz_tiers_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b-2 border-claude-accent/20">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_tier}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_price}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_target}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_includes}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    {t.s5_biz_tiers.map((row, i) => (
                      <tr key={i} className={i < t.s5_biz_tiers.length - 1 ? 'border-b border-claude-border/50' : ''}>
                        <td className="py-3 px-4 font-medium text-claude-text">{row.tier}</td>
                        <td className="py-3 px-4 text-right font-serif text-claude-accent font-medium">{row.price}</td>
                        <td className="py-3 px-4">{row.target}</td>
                        <td className="py-3 px-4 text-xs">{row.includes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unit economics */}
            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s5_biz_unit_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b-2 border-claude-accent/20">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_type}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_cost}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_client_price}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s5_biz_th_margin}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    {t.s5_biz_queries.map((row, i) => (
                      <tr key={i} className={i < t.s5_biz_queries.length - 1 ? 'border-b border-claude-border/50' : ''}>
                        <td className="py-3 px-4 font-medium text-claude-text">{row.type}</td>
                        <td className="py-3 px-4 text-right">{row.cost}</td>
                        <td className="py-3 px-4 text-right">{row.price}</td>
                        <td className="py-3 px-4 text-right text-green-600 font-medium">{row.margin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mt-4">
                <div className="p-4 bg-claude-bg rounded-xl text-center">
                  <p className="text-2xl font-serif text-claude-accent font-medium">{t.s5_biz_avg_cost_val}</p>
                  <p className="text-xs text-claude-subtext font-sans mt-1">{t.s5_biz_avg_cost}</p>
                </div>
                <div className="p-4 bg-claude-bg rounded-xl text-center">
                  <p className="text-2xl font-serif text-claude-accent font-medium">{t.s5_biz_avg_price_val}</p>
                  <p className="text-xs text-claude-subtext font-sans mt-1">{t.s5_biz_avg_price}</p>
                </div>
                <div className="p-4 bg-claude-bg rounded-xl text-center">
                  <p className="text-2xl font-serif text-claude-accent font-medium">{t.s5_biz_avg_margin_val}</p>
                  <p className="text-xs text-claude-subtext font-sans mt-1">{t.s5_biz_avg_margin}</p>
                </div>
              </div>
            </div>

            {/* Revenue streams */}
            <div>
              <h3 className="text-lg font-serif text-claude-text mb-3">{t.s5_biz_revenue_streams_title}</h3>
              <div className="space-y-3">
                {t.s5_biz_revenue_streams.map((s) => (
                  <div key={s.stream} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm font-sans">
                      <span className="text-claude-text font-medium">{s.stream}</span>
                      <span className="text-claude-accent font-medium">{s.pct}</span>
                    </div>
                    <div className="w-full bg-claude-bg rounded-full h-2">
                      <div className="bg-claude-accent rounded-full h-2 transition-all" style={{ width: s.pct.replace('–', '-').split('-')[0].replace('%', '') + '%' }} />
                    </div>
                    <p className="text-xs text-claude-subtext font-sans">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 6: Traction — NEW */}
        <Section icon={<CheckCircle2 size={20} />} title={t.s6_traction_title} delay={0.28}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s6_traction_intro}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {t.s6_traction_items.map((item) => (
                <div key={item.metric} className="p-4 bg-claude-bg rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-claude-subtext font-sans">{item.metric}</p>
                    <p className="text-lg font-serif text-claude-accent font-medium">{item.value}</p>
                  </div>
                  <p className="text-xs text-claude-subtext font-sans">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 font-sans leading-relaxed italic">{t.s6_traction_quote}</p>
            </div>
          </div>
        </Section>

        {/* Section 7: Competitors */}
        <Section icon={<BarChart3 size={20} />} title={t.s7_comp_title} delay={0.3}>
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b-2 border-claude-accent/20">
                    <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s7_comp_th_feature}</th>
                    <th className="text-center py-3 px-4 text-claude-accent font-medium">LEX</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">ActiveLex</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">ZakonOnline</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">LIGA:ZAKON</th>
                  </tr>
                </thead>
                <tbody className="text-claude-subtext">
                  {t.s7_comp_features.map((feature, i) => {
                    const [lex, active, zakon, liga] = COMPETITOR_FLAGS[i];
                    return (
                      <tr key={i} className="border-b border-claude-border/50">
                        <td className="py-2.5 px-4 text-claude-text">{feature}</td>
                        <td className="py-2.5 px-4 text-center">{lex ? <Check /> : <Cross />}</td>
                        <td className="py-2.5 px-4 text-center">{active ? <Check /> : <Cross />}</td>
                        <td className="py-2.5 px-4 text-center">{zakon ? <Check /> : <Cross />}</td>
                        <td className="py-2.5 px-4 text-center">{liga ? <Check /> : <Cross />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">ActiveLex</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s7_comp_activelex_desc}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">ZakonOnline</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s7_comp_zakon_desc}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">LIGA:ZAKON</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s7_comp_liga_desc}</p>
              </div>
            </div>
            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s7_comp_conclusion}</p>
            </div>
          </div>
        </Section>

        {/* Section 8: Demonstrated Capability */}
        <Section icon={<FileText size={20} />} title={t.s8_cases_title} delay={0.33}>
          <div className="space-y-8">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s8_cases_intro}</p>

            {/* Case 1 */}
            <div className="border border-claude-border rounded-xl overflow-hidden">
              <div className="bg-claude-accent/5 px-6 py-4 border-b border-claude-border">
                <h3 className="text-lg font-serif text-claude-text">{t.s8_case1_title}</h3>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s8_case1_subtitle}</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s8_case1_intro}</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-claude-bg rounded-lg text-center">
                    <p className="text-xl font-serif text-claude-accent font-medium">12 514</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s8_case1_stat1}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-xl font-serif text-red-600 font-medium">~50%</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s8_case1_stat2}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-xl font-serif text-red-600 font-medium">1 526</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s8_case1_stat3}</p>
                  </div>
                  <div className="p-3 bg-claude-bg rounded-lg text-center">
                    <p className="text-xl font-serif text-claude-accent font-medium">34.7%</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s8_case1_stat4}</p>
                  </div>
                </div>
                <div className="text-sm text-claude-subtext font-sans space-y-2">
                  <p>{t.s8_case1_conclusion}</p>
                  <p>{t.s8_case1_value}</p>
                </div>
                <a href="https://legal.org.ua/judges" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans">
                  <ExternalLink size={14} />
                  {t.s8_case1_link}
                </a>
              </div>
            </div>

            {/* Case 2 */}
            <div className="border border-claude-border rounded-xl overflow-hidden">
              <div className="bg-[#003399]/5 px-6 py-4 border-b border-claude-border">
                <h3 className="text-lg font-serif text-claude-text">{t.s8_case2_title}</h3>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s8_case2_subtitle}</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s8_case2_intro}</p>
                <div className="p-4 bg-claude-bg rounded-xl">
                  <h4 className="text-sm font-medium text-claude-text font-sans mb-3">{t.s8_case2_strategies_title}</h4>
                  <div className="space-y-2.5">
                    {t.s8_case2_strategies.map((s) => {
                      const colorMap: Record<string, string> = {
                        'CRITICAL': 'bg-red-100 text-red-700',
                        'VERY HIGH': 'bg-orange-100 text-orange-700',
                        'HIGH': 'bg-yellow-100 text-yellow-700',
                        'MEDIUM': 'bg-blue-100 text-blue-700',
                      };
                      return (
                        <div key={s.text} className="flex items-start gap-3">
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${colorMap[s.priority] || 'bg-gray-100 text-gray-700'}`}>
                            {s.priority}
                          </span>
                          <p className="text-sm text-claude-subtext font-sans leading-relaxed">{s.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="text-sm text-claude-subtext font-sans space-y-2">
                  <p>{t.s8_case2_what}</p>
                  <p>{t.s8_case2_time}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s8_cases_conclusion}</p>
            </div>
          </div>
        </Section>

        {/* Section 9: Market Sizing */}
        <Section icon={<Globe size={20} />} title={t.s9_market_title} delay={0.36}>
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s9_tam_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">{t.s9_tam_val}</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s9_tam_desc}</p>
              </div>
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s9_sam_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">{t.s9_sam_val}</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s9_sam_desc}</p>
              </div>
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s9_som_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">{t.s9_som_val}</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s9_som_desc}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b-2 border-claude-accent/20">
                    <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s9_th_segment}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s9_th_count}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s9_th_arpu}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s9_th_potential}</th>
                  </tr>
                </thead>
                <tbody className="text-claude-subtext">
                  {t.s9_segments.map((row, i) => (
                    <tr key={i} className={i < t.s9_segments.length - 1 ? 'border-b border-claude-border/50' : ''}>
                      <td className="py-3 px-4 font-medium text-claude-text">{row.name}</td>
                      <td className="py-3 px-4 text-right">{row.count}</td>
                      <td className="py-3 px-4 text-right">{row.arpu}</td>
                      <td className="py-3 px-4 text-right font-medium text-claude-text">{row.potential}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* Section 10: Technology Moat */}
        <Section icon={<Shield size={20} />} title={t.s10_moat_title} delay={0.39}>
          <div className="grid sm:grid-cols-2 gap-4">
            {t.s10_moat_items.map((item) => (
              <div key={item.title} className="p-5 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{item.title}</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 11: Use of Proceeds — rebalanced */}
        <Section icon={<PoundSterling size={20} />} title={t.s11_funds_title} delay={0.42}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s11_funds_intro}</p>
            <div className="space-y-3">
              {t.s11_funds_items.map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm font-sans">
                    <span className="text-claude-text font-medium">{item.label}</span>
                    <span className="text-claude-accent font-medium">{item.amount} ({item.pct}%)</span>
                  </div>
                  <div className="w-full bg-claude-bg rounded-full h-2">
                    <div className="bg-claude-accent rounded-full h-2 transition-all" style={{ width: `${item.pct}%` }} />
                  </div>
                  <p className="text-xs text-claude-subtext font-sans">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="p-4 bg-claude-bg rounded-xl">
              <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{t.s11_milestones_title}</h4>
              <div className="grid sm:grid-cols-3 gap-3 text-sm font-sans">
                {t.s11_milestones.map((m) => (
                  <div key={m.period} className="flex items-start gap-2">
                    <span className="text-claude-accent font-serif font-medium">{m.period}</span>
                    <span className="text-claude-subtext">{m.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 12: Revenue Projections */}
        <Section icon={<TrendingUp size={20} />} title={t.s12_rev_title} delay={0.45}>
          <div className="space-y-6">
            <div className="p-4 bg-claude-bg rounded-xl space-y-2">
              <h3 className="text-sm font-medium text-claude-text font-sans">{t.s12_input_title}</h3>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-claude-subtext font-sans">
                {t.s12_input.map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-medium text-claude-text">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s12_scenarios_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b-2 border-claude-accent/20">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s12_th_scenario}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s12_th_clients}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s12_th_check}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s12_th_mrr}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s12_th_arr}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    {t.s12_scenarios.map((s, i) => {
                      const colors = [
                        { mrr: 'text-claude-text', arr: 'text-claude-text' },
                        { mrr: 'text-claude-accent', arr: 'text-claude-accent' },
                        { mrr: 'text-green-600', arr: 'text-green-600' },
                        { mrr: 'text-claude-accent', arr: 'text-claude-accent' },
                      ];
                      const c = colors[i] || colors[0];
                      return (
                        <tr key={i} className={i < t.s12_scenarios.length - 1 ? 'border-b border-claude-border/50' : ''}>
                          <td className="py-3 px-4 font-medium text-claude-text">{s.name}</td>
                          <td className="py-3 px-4 text-right">{s.clients}</td>
                          <td className="py-3 px-4 text-right">{s.check}</td>
                          <td className={`py-3 px-4 text-right font-serif font-medium ${c.mrr}`}>{s.mrr}</td>
                          <td className={`py-3 px-4 text-right font-serif font-medium ${c.arr}`}>{s.arr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="text-sm font-medium text-blue-800 font-sans mb-3">{t.s12_ltv_title}</h4>
              <div className="space-y-2 text-sm text-blue-700 font-sans">
                {t.s12_ltv.map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-medium text-blue-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s12_conclusion}</p>
            </div>

            {/* Scaling math */}
            <div className="p-5 bg-purple-50 border border-purple-200 rounded-xl">
              <h4 className="text-sm font-medium text-purple-800 font-sans mb-3">{t.s12_scaling_title}</h4>
              <p className="text-sm text-purple-700 font-sans mb-3">{t.s12_scaling_intro}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-purple-200">
                      <th className="text-left py-2 px-3 text-purple-800 font-medium">Scenario</th>
                      <th className="text-right py-2 px-3 text-purple-800 font-medium">ARPU</th>
                      <th className="text-right py-2 px-3 text-purple-800 font-medium">MRR</th>
                      <th className="text-right py-2 px-3 text-purple-800 font-medium">ARR</th>
                    </tr>
                  </thead>
                  <tbody className="text-purple-700">
                    {t.s12_scaling_math.map((row, i) => (
                      <tr key={i} className={i < t.s12_scaling_math.length - 1 ? 'border-b border-purple-100' : 'font-medium text-purple-800'}>
                        <td className="py-2 px-3">{row.scenario}</td>
                        <td className="py-2 px-3 text-right">{row.arpu}</td>
                        <td className="py-2 px-3 text-right font-serif">{row.mrr}</td>
                        <td className="py-2 px-3 text-right font-serif">{row.arr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-purple-600 font-sans mt-3 leading-relaxed">{t.s12_scaling_note}</p>
            </div>
          </div>
        </Section>

        {/* Section 13: Risk Factors — expanded */}
        <Section icon={<AlertTriangle size={20} />} title={t.s13_risk_title} delay={0.48}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b-2 border-claude-accent/20">
                  <th className="text-left py-3 px-4 text-claude-text font-medium w-1/3">{t.s13_th_risk}</th>
                  <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s13_th_mitigation}</th>
                </tr>
              </thead>
              <tbody className="text-claude-subtext">
                {t.s13_risks.map((row, i) => (
                  <tr key={i} className={i < t.s13_risks.length - 1 ? 'border-b border-claude-border/50' : ''}>
                    <td className="py-3 px-4 font-medium text-claude-text align-top">{row.risk}</td>
                    <td className="py-3 px-4 leading-relaxed">{row.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* CTA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }} className="text-center py-12">
          <div className="bg-white rounded-2xl border border-claude-border p-8 shadow-sm">
            <img src="/Image.jpg" alt="LEX" className="h-16 w-auto mx-auto mb-4" />
            <h2 className="text-2xl font-serif text-claude-text mb-2">{t.cta_title}</h2>
            <p className="text-sm text-claude-subtext font-sans mb-6 max-w-md mx-auto">{t.cta_subtitle}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href={`mailto:${t.cta_email}`} className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors font-sans">
                {t.cta_email}
              </a>
              <a href="https://legal.org.ua" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-claude-border text-claude-text rounded-xl font-medium hover:border-claude-accent transition-colors font-sans">
                <ExternalLink size={16} />
                {t.cta_try}
              </a>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center py-6 text-xs text-claude-subtext font-sans">
          <p>{t.footer}</p>
        </div>
      </div>
    </div>
  );
}

/* Reusable section wrapper */
function Section({ icon, title, delay = 0.1, children }: { icon: React.ReactNode; title: string; delay?: number; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-claude-accent/10 rounded-xl flex items-center justify-center text-claude-accent">
          {icon}
        </div>
        <h2 className="text-2xl font-serif text-claude-text">{title}</h2>
      </div>
      <div className="bg-white rounded-2xl border border-claude-border p-8 shadow-sm">
        {children}
      </div>
    </motion.section>
  );
}

/* Data sub-section heading inside the data assets section */
function DataSubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-serif text-claude-text mb-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-claude-accent rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

/* Compact data table for production data assets */
function DataTable({ rows, showStatus = false }: { rows: Array<{ name: string; count: string; detail: string; status?: string }>; showStatus?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-sans">
        <thead>
          <tr className="border-b border-claude-border/50">
            <th className="text-left py-2 px-3 text-claude-text font-medium text-xs">Dataset</th>
            <th className="text-right py-2 px-3 text-claude-text font-medium text-xs">Records</th>
            <th className="text-left py-2 px-3 text-claude-text font-medium text-xs">Details</th>
            {showStatus && <th className="text-left py-2 px-3 text-claude-text font-medium text-xs">Status</th>}
          </tr>
        </thead>
        <tbody className="text-claude-subtext">
          {rows.map((row, i) => (
            <tr key={i} className={i < rows.length - 1 ? 'border-b border-claude-border/30' : ''}>
              <td className="py-2 px-3 font-medium text-claude-text text-xs">{row.name}</td>
              <td className="py-2 px-3 text-right font-serif text-claude-accent font-medium text-sm">{row.count}</td>
              <td className="py-2 px-3 text-xs">{row.detail}</td>
              {showStatus && (
                <td className="py-2 px-3 text-xs">
                  {row.status && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      row.status === 'Complete' ? 'bg-green-100 text-green-700' :
                      row.status === 'In progress' ? 'bg-yellow-100 text-yellow-700' :
                      row.status === 'Partial' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {row.status}
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
