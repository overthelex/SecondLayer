import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Target, Database, Calculator, BarChart3, TrendingUp, ExternalLink, FileText, Shield, DollarSign, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { translations, type Lang } from './investor-letter-translations';

const LANGS: { key: Lang; label: string }[] = [
  { key: 'ua', label: 'UA' },
  { key: 'en', label: 'EN' },
  { key: 'ru', label: 'RU' },
];

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

export function InvestorLetterPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('ua');
  const t = translations[lang];

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

          {/* Language Switcher */}
          <div className="flex items-center bg-claude-bg rounded-lg p-0.5 gap-0.5">
            {LANGS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLang(l.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-sans font-medium transition-all ${
                  lang === l.key
                    ? 'bg-white text-claude-text shadow-sm'
                    : 'text-claude-subtext hover:text-claude-text'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <img src="/Image.jpg" alt="LEX" className="h-10 w-auto" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
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

        {/* Section 2: About the project */}
        <Section icon={<Target size={20} />} title={t.s2_title} delay={0.15}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">
              <span className="font-medium text-claude-text">LEX</span> — {t.s2_intro.replace(/^LEX — (це |is an |это )/, '')}
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-800 font-sans font-medium mb-2">{t.s2_no_competitors_title}</p>
              <p className="text-sm text-green-700 font-sans leading-relaxed">
                {t.s2_no_competitors_text}
                <a href="https://legal.org.ua/judges" target="_blank" rel="noopener noreferrer" className="text-green-800 underline font-medium">
                  {t.s2_judges_link_text}
                </a>
                {(t as any).s2_no_competitors_suffix || ''}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s2_global_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-claude-border">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s2_th_company}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s2_th_country}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s2_th_valuation}</th>
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s2_th_focus}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">Harvey AI</td>
                      <td className="py-3 px-4">{lang === 'en' ? 'USA' : 'США'}</td>
                      <td className="py-3 px-4">$1.5B+ ({lang === 'en' ? 'valuation' : 'оцінка'})</td>
                      <td className="py-3 px-4">{t.s2_harvey_focus}</td>
                    </tr>
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">Clio</td>
                      <td className="py-3 px-4">{lang === 'en' ? 'Canada' : 'Канада'}</td>
                      <td className="py-3 px-4">$3B+ ({lang === 'en' ? 'valuation' : 'оцінка'})</td>
                      <td className="py-3 px-4">{t.s2_clio_focus}</td>
                    </tr>
                    <tr className="border-b border-claude-border/50">
                      <td className="py-3 px-4 font-medium text-claude-text">LexisNexis</td>
                      <td className="py-3 px-4">{lang === 'en' ? 'USA/UK' : 'США/UK'}</td>
                      <td className="py-3 px-4">$14B+ ({lang === 'en' ? 'RELX revenue' : lang === 'ru' ? 'доход RELX' : 'дохід RELX'})</td>
                      <td className="py-3 px-4">{t.s2_lexis_focus}</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-claude-accent">LEX (legal.org.ua)</td>
                      <td className="py-3 px-4">{lang === 'en' ? 'Ukraine' : 'Україна'}</td>
                      <td className="py-3 px-4">{t.s2_lex_stage}</td>
                      <td className="py-3 px-4">{t.s2_lex_focus}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-3">{t.s2_advantages_title}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {t.s2_advantages.map((item: string) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-claude-subtext font-sans">
                    <div className="w-1.5 h-1.5 bg-claude-accent rounded-full mt-1.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 3: Databases */}
        <Section icon={<Database size={20} />} title={t.s3_title} delay={0.2}>
          <p className="text-sm text-claude-subtext font-sans mb-6 leading-relaxed">{t.s3_intro}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b-2 border-claude-accent/20">
                  <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_th_database}</th>
                  <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s3_th_records}</th>
                  <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s3_th_details}</th>
                </tr>
              </thead>
              <tbody className="text-claude-subtext">
                {t.s3_db.map((row: any, i: number) => (
                  <tr key={i} className={i < t.s3_db.length - 1 ? 'border-b border-claude-border/50' : ''}>
                    <td className="py-3 px-4 font-medium text-claude-text">{row.name}</td>
                    <td className="py-3 px-4 text-right font-serif text-lg text-claude-accent font-medium">{row.count}</td>
                    <td className="py-3 px-4">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 p-4 bg-claude-bg rounded-xl">
            <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s3_total}</p>
          </div>
        </Section>

        {/* Section 4: Cost calculations */}
        <Section icon={<Calculator size={20} />} title={t.s4_title} delay={0.25}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">
              {t.s4_intro_prefix}
              <a href="https://legal.org.ua/admin/service-pricing" target="_blank" rel="noopener noreferrer" className="text-claude-accent hover:text-[#C66345] underline">
                {t.s4_intro_link}
              </a>
              {t.s4_intro_suffix}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b-2 border-claude-accent/20">
                    <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s4_th_type}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s4_th_cost}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s4_th_price}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s4_th_margin}</th>
                  </tr>
                </thead>
                <tbody className="text-claude-subtext">
                  {t.s4_queries.map((row: any, i: number) => (
                    <tr key={i} className={i < t.s4_queries.length - 1 ? 'border-b border-claude-border/50' : ''}>
                      <td className="py-3 px-4 font-medium text-claude-text">{row.type}</td>
                      <td className="py-3 px-4 text-right">{row.cost}</td>
                      <td className="py-3 px-4 text-right">{row.price}</td>
                      <td className="py-3 px-4 text-right text-green-600 font-medium">{row.margin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 bg-claude-bg rounded-xl text-center">
                <p className="text-2xl font-serif text-claude-accent font-medium">$0.02</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s4_avg_cost}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl text-center">
                <p className="text-2xl font-serif text-claude-accent font-medium">$0.05</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s4_avg_price}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl text-center">
                <p className="text-2xl font-serif text-claude-accent font-medium">~60%</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s4_avg_margin}</p>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-800 font-sans leading-relaxed">{t.s4_monetization}</p>
            </div>
          </div>
        </Section>

        {/* Section 5: Competitors */}
        <Section icon={<BarChart3 size={20} />} title={t.s5_title} delay={0.3}>
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b-2 border-claude-accent/20">
                    <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s5_th_feature}</th>
                    <th className="text-center py-3 px-4 text-claude-accent font-medium">LEX</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">ActiveLex</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">ZakonOnline</th>
                    <th className="text-center py-3 px-4 text-claude-text font-medium">{lang === 'en' ? 'LIGA:ZAKON' : 'ЛІГА:ЗАКОН'}</th>
                  </tr>
                </thead>
                <tbody className="text-claude-subtext">
                  {t.s5_features.map((feature: string, i: number) => {
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
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s5_activelex_desc}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">ZakonOnline</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s5_zakon_desc}</p>
              </div>
              <div className="p-4 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{lang === 'en' ? 'LIGA:ZAKON' : 'ЛІГА:ЗАКОН'}</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{t.s5_liga_desc}</p>
              </div>
            </div>
            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s5_conclusion}</p>
            </div>
          </div>
        </Section>

        {/* Section 6: Use Cases */}
        <Section icon={<FileText size={20} />} title={t.s6_title} delay={0.33}>
          <div className="space-y-8">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s6_intro}</p>

            {/* Case 1 */}
            <div className="border border-claude-border rounded-xl overflow-hidden">
              <div className="bg-claude-accent/5 px-6 py-4 border-b border-claude-border">
                <h3 className="text-lg font-serif text-claude-text">{t.s6_case1_title}</h3>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s6_case1_subtitle}</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s6_case1_intro}</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-claude-bg rounded-lg text-center">
                    <p className="text-xl font-serif text-claude-accent font-medium">12 514</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s6_case1_stat1}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-xl font-serif text-red-600 font-medium">~50%</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s6_case1_stat2}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-xl font-serif text-red-600 font-medium">1 526</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s6_case1_stat3}</p>
                  </div>
                  <div className="p-3 bg-claude-bg rounded-lg text-center">
                    <p className="text-xl font-serif text-claude-accent font-medium">34.7%</p>
                    <p className="text-[10px] text-claude-subtext font-sans mt-0.5">{t.s6_case1_stat4}</p>
                  </div>
                </div>
                <div className="text-sm text-claude-subtext font-sans space-y-2">
                  <p>{t.s6_case1_conclusion}</p>
                  <p>{t.s6_case1_value}</p>
                </div>
                <a href="https://legal.org.ua/judges" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-claude-accent hover:text-[#C66345] font-sans">
                  <ExternalLink size={14} />
                  {t.s6_case1_link}
                </a>
              </div>
            </div>

            {/* Case 2 */}
            <div className="border border-claude-border rounded-xl overflow-hidden">
              <div className="bg-[#003399]/5 px-6 py-4 border-b border-claude-border">
                <h3 className="text-lg font-serif text-claude-text">{t.s6_case2_title}</h3>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s6_case2_subtitle}</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s6_case2_intro}</p>
                <div className="p-4 bg-claude-bg rounded-xl">
                  <h4 className="text-sm font-medium text-claude-text font-sans mb-3">{t.s6_case2_strategies_title}</h4>
                  <div className="space-y-2.5">
                    {t.s6_case2_strategies.map((s: any) => {
                      const colorMap: Record<string, string> = {
                        'КРИТИЧНИЙ': 'bg-red-100 text-red-700', 'CRITICAL': 'bg-red-100 text-red-700', 'КРИТИЧЕСКИЙ': 'bg-red-100 text-red-700',
                        'ДУЖЕ ВИСОКИЙ': 'bg-orange-100 text-orange-700', 'VERY HIGH': 'bg-orange-100 text-orange-700', 'ОЧЕНЬ ВЫСОКИЙ': 'bg-orange-100 text-orange-700',
                        'ВИСОКИЙ': 'bg-yellow-100 text-yellow-700', 'HIGH': 'bg-yellow-100 text-yellow-700', 'ВЫСОКИЙ': 'bg-yellow-100 text-yellow-700',
                        'СЕРЕДНІЙ': 'bg-blue-100 text-blue-700', 'MEDIUM': 'bg-blue-100 text-blue-700', 'СРЕДНИЙ': 'bg-blue-100 text-blue-700',
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
                  <p>{t.s6_case2_what}</p>
                  <p>{t.s6_case2_time}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s6_conclusion}</p>
            </div>
          </div>
        </Section>

        {/* Section 7: Market Size */}
        <Section icon={<Globe size={20} />} title={t.s7_title} delay={0.36}>
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s7_tam_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">$500M+</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s7_tam_desc}</p>
              </div>
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s7_sam_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">$50M</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s7_sam_desc}</p>
              </div>
              <div className="p-5 bg-claude-bg rounded-xl text-center">
                <p className="text-sm text-claude-subtext font-sans mb-1">{t.s7_som_label}</p>
                <p className="text-3xl font-serif text-claude-accent font-medium">$2-5M</p>
                <p className="text-xs text-claude-subtext font-sans mt-1">{t.s7_som_desc}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b-2 border-claude-accent/20">
                    <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s7_th_segment}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s7_th_count}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s7_th_arpu}</th>
                    <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s7_th_potential}</th>
                  </tr>
                </thead>
                <tbody className="text-claude-subtext">
                  {t.s7_segments.map((row: any, i: number) => (
                    <tr key={i} className={i < t.s7_segments.length - 1 ? 'border-b border-claude-border/50' : ''}>
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

        {/* Section 8: Technology Moat */}
        <Section icon={<Shield size={20} />} title={t.s8_title} delay={0.39}>
          <div className="grid sm:grid-cols-2 gap-4">
            {t.s8_items.map((item: any) => (
              <div key={item.title} className="p-5 bg-claude-bg rounded-xl">
                <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{item.title}</h4>
                <p className="text-xs text-claude-subtext font-sans leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 9: Use of Funds */}
        <Section icon={<DollarSign size={20} />} title={t.s9_title} delay={0.42}>
          <div className="space-y-6">
            <p className="text-sm text-claude-subtext font-sans leading-relaxed">{t.s9_intro}</p>
            <div className="space-y-3">
              {t.s9_items.map((item: any) => (
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
              <h4 className="text-sm font-medium text-claude-text font-sans mb-2">{t.s9_milestones_title}</h4>
              <div className="grid sm:grid-cols-3 gap-3 text-sm font-sans">
                {t.s9_milestones.map((m: any) => (
                  <div key={m.period} className="flex items-start gap-2">
                    <span className="text-claude-accent font-serif font-medium">{m.period}</span>
                    <span className="text-claude-subtext">{m.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 10: Revenue projections */}
        <Section icon={<TrendingUp size={20} />} title={t.s10_title} delay={0.45}>
          <div className="space-y-6">
            <div className="p-4 bg-claude-bg rounded-xl space-y-2">
              <h3 className="text-sm font-medium text-claude-text font-sans">{t.s10_input_title}</h3>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-claude-subtext font-sans">
                {t.s10_input.map((item: any) => (
                  <div key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-medium text-claude-text">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-serif text-claude-text mb-4">{t.s10_scenarios_title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b-2 border-claude-accent/20">
                      <th className="text-left py-3 px-4 text-claude-text font-medium">{t.s10_th_scenario}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s10_th_clients}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s10_th_check}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s10_th_mrr}</th>
                      <th className="text-right py-3 px-4 text-claude-text font-medium">{t.s10_th_arr}</th>
                    </tr>
                  </thead>
                  <tbody className="text-claude-subtext">
                    {t.s10_scenarios.map((s: any, i: number) => {
                      const colors = [
                        { mrr: 'text-claude-text', arr: 'text-claude-text' },
                        { mrr: 'text-claude-accent', arr: 'text-claude-accent' },
                        { mrr: 'text-green-600', arr: 'text-green-600' },
                        { mrr: 'text-claude-accent', arr: 'text-claude-accent' },
                      ];
                      const c = colors[i] || colors[0];
                      return (
                        <tr key={i} className={i < t.s10_scenarios.length - 1 ? 'border-b border-claude-border/50' : ''}>
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

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 bg-green-50 border border-green-200 rounded-xl">
                <h4 className="text-sm font-medium text-green-800 font-sans mb-3">{t.s10_roi_title}</h4>
                <div className="space-y-2 text-sm text-green-700 font-sans">
                  {t.s10_roi.map((item: any) => (
                    <div key={item.label} className="flex justify-between">
                      <span>{item.label}</span>
                      <span className="font-medium text-green-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="text-sm font-medium text-blue-800 font-sans mb-3">{t.s10_ltv_title}</h4>
                <div className="space-y-2 text-sm text-blue-700 font-sans">
                  {t.s10_ltv.map((item: any) => (
                    <div key={item.label} className="flex justify-between">
                      <span>{item.label}</span>
                      <span className="font-medium text-blue-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-claude-accent/5 border border-claude-accent/20 rounded-xl">
              <p className="text-sm text-claude-text font-sans leading-relaxed">{t.s10_conclusion}</p>
            </div>

            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <h4 className="text-sm font-medium text-purple-800 font-sans mb-2">{t.s10_scaling_title}</h4>
              <p className="text-sm text-purple-700 font-sans leading-relaxed">{t.s10_scaling}</p>
            </div>
          </div>
        </Section>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center py-12"
        >
          <div className="bg-white rounded-2xl border border-claude-border p-8 shadow-sm">
            <img src="/Image.jpg" alt="LEX" className="h-16 w-auto mx-auto mb-4" />
            <h2 className="text-2xl font-serif text-claude-text mb-2">{t.cta_title}</h2>
            <p className="text-sm text-claude-subtext font-sans mb-6 max-w-md mx-auto">{t.cta_subtitle}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:info@legal.org.ua" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors font-sans">
                info@legal.org.ua
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
