import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Shield,
  Network,
  Terminal,
  Lock,
  Bug,
  Globe,
  Code2,
  KeyRound,
  FileSearch,
  Wrench,
  Eye,
  Cloud,
  Award,
  Briefcase,
  ChevronDown,
  BookOpen,
  Clock,
  Target,
  Flame,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useHreflang } from '../../hooks/useHreflang';
import { useLocaleStore } from '../../stores/localeStore';
import { LangToggle } from '../AboutPage/LangToggle';
import { getCISOAcademyCopy } from './copy';
import { getWeeksForMonth, type Week } from './weeks';

type PhaseKey = 0 | 1 | 2 | 3;

const PHASE_STYLES = [
  { color: 'text-emerald-700', borderColor: 'border-emerald-300', bgColor: 'bg-emerald-50', dotColor: 'bg-emerald-600' },
  { color: 'text-amber-700', borderColor: 'border-amber-300', bgColor: 'bg-amber-50', dotColor: 'bg-amber-600' },
  { color: 'text-blue-700', borderColor: 'border-blue-300', bgColor: 'bg-blue-50', dotColor: 'bg-blue-600' },
  { color: 'text-violet-700', borderColor: 'border-violet-300', bgColor: 'bg-violet-50', dotColor: 'bg-violet-600' },
];

const MONTH_ICONS = [
  <Network size={18} />, <Terminal size={18} />, <Lock size={18} />,
  <Bug size={18} />, <Flame size={18} />, <Globe size={18} />, <KeyRound size={18} />,
  <FileSearch size={18} />, <Wrench size={18} />, <Eye size={18} />, <Cloud size={18} />,
  <Award size={18} />, <Briefcase size={18} />,
];

export function CISOAcademyPage() {
  const navigate = useNavigate();
  const language = useLocaleStore((s) => s.language);
  const c = getCISOAcademyCopy(language);
  const [activePhase, setActivePhase] = useState<PhaseKey>(0);
  const [expandedMonth, setExpandedMonth] = useState<number>(0);

  useDocumentMeta({
    title: c.metaTitle,
    description: c.metaDescription,
    ogTitle: c.metaTitle,
    ogDescription: c.metaDescription,
    canonical: 'https://legal.org.ua/cisoacademy',
  });

  useHreflang([
    { lang: 'en', href: 'https://legal.org.ua/cisoacademy?lang=en' },
    { lang: 'uk', href: 'https://legal.org.ua/cisoacademy?lang=uk' },
  ], 'en');

  const phase = c.phases[activePhase];
  const style = PHASE_STYLES[activePhase];
  const totalMonths = c.phases.reduce((sum, p) => sum + p.data.length, 0);

  let globalMonthIdx = 0;
  for (let i = 0; i < activePhase; i++) globalMonthIdx += c.phases[i].data.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-claude-bg via-white to-claude-sidebar">
      {/* Header — matches About/Product pattern */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/career')}
            className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
          >
            <ArrowLeft size={16} />
            {c.back}
          </button>
          <div className="hidden md:flex items-center gap-1 ml-4">
            {c.phases.map((p, idx) => (
              <button
                key={idx}
                onClick={() => { setActivePhase(idx as PhaseKey); setExpandedMonth(0); }}
                className={`px-3 py-1.5 rounded-lg font-sans text-xs font-medium transition-all ${
                  activePhase === idx
                    ? `${PHASE_STYLES[idx].bgColor} ${PHASE_STYLES[idx].color}`
                    : 'text-claude-subtext hover:text-claude-text hover:bg-claude-sidebar'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-2 text-xs font-sans text-claude-subtext">
            <Clock size={14} />
            <span>{totalMonths} {c.duration}</span>
          </div>
          <LangToggle />
          <img src="/Image.jpg" alt="LEX" className="h-9 w-auto" />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-14"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-claude-accent flex items-center justify-center">
              <Shield size={22} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-sans font-semibold text-claude-accent uppercase tracking-[0.18em]">
                {c.kicker}
              </p>
              <p className="text-xs font-sans text-claude-subtext">
                {c.subKicker}
              </p>
            </div>
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif text-claude-text font-medium leading-tight mb-6 max-w-3xl">
            {c.headline}
            <br />
            <span className="text-claude-subtext">{c.headlineFaded}</span>
          </h1>
          <p className="text-base sm:text-lg text-claude-subtext font-sans leading-relaxed max-w-2xl mb-8">
            {c.lead}
          </p>

          <div className="inline-flex items-start gap-3 px-5 py-4 rounded-xl border border-claude-border bg-white">
            <Target size={18} className="text-claude-accent mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-sans font-medium text-claude-text mb-1">{c.prereqTitle}</p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                {c.prereqBody}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Progress bar */}
        <div className="rounded-xl border border-claude-border bg-white p-4 mb-10">
          <div className="flex items-center gap-1">
            {c.phases.map((p, pIdx) => (
              <div key={pIdx} className="flex-1 flex items-center gap-1">
                {p.data.map((_, mIdx) => {
                  let gIdx = 0;
                  for (let i = 0; i < pIdx; i++) gIdx += c.phases[i].data.length;
                  gIdx += mIdx;
                  const isActive = activePhase === pIdx && expandedMonth === mIdx;
                  const isPhase = activePhase === pIdx;
                  return (
                    <button
                      key={mIdx}
                      onClick={() => { setActivePhase(pIdx as PhaseKey); setExpandedMonth(mIdx); }}
                      className={`flex-1 h-2 rounded-full transition-all ${
                        isActive ? PHASE_STYLES[pIdx].dotColor
                          : isPhase ? `${PHASE_STYLES[pIdx].dotColor} opacity-30`
                          : 'bg-claude-border'
                      }`}
                      title={`${gIdx + 1}: ${p.data[mIdx].title}`}
                    />
                  );
                })}
                {pIdx < 3 && <div className="w-3" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {c.phases.map((p, idx) => (
              <p key={idx} className={`text-[10px] font-sans font-medium uppercase tracking-wider ${
                activePhase === idx ? PHASE_STYLES[idx].color : 'text-claude-subtext/50'
              }`}>
                {p.months}
              </p>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="grid lg:grid-cols-[260px_1fr] gap-8">
          {/* Phase sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start space-y-2">
            {c.phases.map((p, idx) => (
              <motion.button
                key={idx}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                onClick={() => { setActivePhase(idx as PhaseKey); setExpandedMonth(0); }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  activePhase === idx
                    ? `${PHASE_STYLES[idx].bgColor} ${PHASE_STYLES[idx].borderColor} border`
                    : 'hover:bg-claude-sidebar border border-transparent'
                }`}
              >
                <p className={`text-[10px] font-sans font-bold uppercase tracking-[0.15em] mb-1 ${
                  activePhase === idx ? PHASE_STYLES[idx].color : 'text-claude-subtext'
                }`}>
                  {p.label} · {p.months}
                </p>
                <p className={`text-sm font-serif font-medium ${
                  activePhase === idx ? 'text-claude-text' : 'text-claude-subtext'
                }`}>
                  {p.title}
                </p>
              </motion.button>
            ))}

            <div className="mt-6 p-4 rounded-xl border border-dashed border-claude-border">
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                {c.labTitle}
              </p>
              <ul className="space-y-1.5 text-xs font-sans text-claude-subtext leading-relaxed">
                {c.labItems.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Phase content */}
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={activePhase}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                {/* Phase header */}
                <div className={`rounded-xl ${style.bgColor} border ${style.borderColor} p-6 mb-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-xs font-sans font-bold uppercase tracking-[0.15em] ${style.color} mb-2`}>
                        {phase.label}
                      </p>
                      <h2 className="text-2xl font-serif text-claude-text font-medium mb-2">
                        {phase.title}
                      </h2>
                      <p className="text-sm font-sans text-claude-subtext leading-relaxed max-w-xl">
                        {phase.description}
                      </p>
                    </div>
                    <div className={`flex-shrink-0 w-14 h-14 rounded-2xl ${style.dotColor} flex items-center justify-center`}>
                      <span className="text-white font-sans font-bold text-lg">
                        {phase.data.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Months */}
                <div className="space-y-3">
                  {phase.data.map((month, mIdx) => {
                    const monthNum = globalMonthIdx + mIdx + 1;
                    const isExpanded = expandedMonth === mIdx;
                    const icon = MONTH_ICONS[monthNum - 1] || <Shield size={18} />;
                    return (
                      <div
                        key={mIdx}
                        className={`rounded-xl border transition-all ${
                          isExpanded
                            ? 'border-claude-accent/20 bg-white shadow-elevation-2'
                            : 'border-claude-border bg-white hover:border-claude-accent/10 hover:shadow-elevation-1'
                        }`}
                      >
                        <button
                          onClick={() => setExpandedMonth(isExpanded ? -1 : mIdx)}
                          className="w-full text-left px-6 py-5 flex items-center gap-4"
                        >
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-sans font-bold text-sm ${
                            isExpanded ? `${style.dotColor} text-white` : `${style.bgColor} ${style.color}`
                          }`}>
                            {String(monthNum).padStart(2, '0')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-serif text-claude-text font-medium truncate">
                              {month.title}
                            </h3>
                            <p className="text-sm font-sans text-claude-subtext truncate">
                              {month.subtitle}
                            </p>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="text-claude-subtext">{icon}</span>
                            <ChevronDown
                              size={18}
                              className={`text-claude-subtext transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 pb-6 pt-0">
                                <div className="border-t border-claude-border pt-5 space-y-4">
                                  {getWeeksForMonth(monthNum).map((week: Week) => {
                                    const isEn = language !== 'uk' && language !== 'ru';
                                    return (
                                      <div key={week.week} className="rounded-lg border border-claude-border/60 p-4">
                                        <div className="flex items-start gap-3 mb-3">
                                          <span className={`flex-shrink-0 w-7 h-7 rounded-lg ${style.bgColor} ${style.color} flex items-center justify-center text-xs font-sans font-bold`}>
                                            {week.week}
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-serif font-medium text-claude-text">
                                              {isEn ? week.titleEn : week.titleUk}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1">
                                              <Clock size={11} className="text-claude-subtext" />
                                              <span className="text-[11px] font-sans text-claude-subtext">{week.hours} {isEn ? 'hrs' : 'год'}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <p className="text-xs font-sans text-claude-subtext leading-relaxed mb-2">
                                          {isEn ? week.topicsEn : week.topicsUk}
                                        </p>
                                        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md bg-claude-bg">
                                          <Code2 size={12} className={`${style.color} mt-0.5 flex-shrink-0`} />
                                          <p className="text-xs font-sans text-claude-text leading-relaxed">
                                            {isEn ? week.artifactEn : week.artifactUk}
                                          </p>
                                        </div>
                                        {week.resources.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {week.resources.map((res) => (
                                              <a
                                                key={res.name}
                                                href={res.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans font-medium ${style.bgColor} ${style.color} hover:opacity-75 transition-opacity`}
                                              >
                                                {res.name}
                                                <ExternalLink size={9} />
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Essential reading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 rounded-2xl border border-claude-border bg-white p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <BookOpen size={20} className="text-claude-accent" />
            <h2 className="text-xl font-serif text-claude-text font-medium">
              {c.readingTitle}
            </h2>
          </div>
          <p className="text-sm font-sans text-claude-subtext mb-6 max-w-2xl">
            {c.readingSub}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {c.essentialReads.map((r) => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 rounded-lg bg-claude-bg hover:bg-claude-sidebar transition-colors group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-claude-accent mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-sans font-medium text-claude-text group-hover:text-claude-accent transition-colors inline-flex items-center gap-1.5">
                    {r.name}
                    <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-xs font-sans text-claude-subtext">{r.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </motion.div>

        {/* Notes */}
        <div className="mt-6 rounded-2xl border border-dashed border-claude-border bg-white p-8">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                {c.noteProgTitle}
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                {c.noteProgBody}
              </p>
            </div>
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                {c.noteLabTitle}
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                {c.noteLabBody}
              </p>
            </div>
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                {c.noteCveTitle}
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                {c.noteCveBody}
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm font-sans text-claude-subtext mb-3">
            {c.contactPre}
          </p>
          <a
            href="mailto:career@legal.org.ua"
            className="text-xl font-serif text-claude-text hover:text-claude-accent transition-colors"
          >
            career@legal.org.ua
          </a>
        </div>
      </div>
    </div>
  );
}
