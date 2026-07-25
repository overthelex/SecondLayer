import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Code2,
  Target,
  Shield,
  ExternalLink,
  Check,
  Zap,
  Globe,
  Brain,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

type JobKey = 'osint' | 'frontend' | 'gtm' | 'ciso';

interface Job {
  key: JobKey;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  whatYouDo: string[];
  stack: string[];
  nice: string[];
  comp: string;
}

const JOBS: Job[] = [
  {
    key: 'osint',
    icon: <Search size={22} />,
    title: 'OSINT-інженер',
    tagline:
      'Робота зі всіма юрисдикціями — наповнюєш бази legal.org.ua та sneakypiper.com.',
    whatYouDo: [
      'Знаходиш відкриті реєстри, API, dumps, бази судових рішень, державні open data джерела в різних країнах.',
      'Пишеш імпортери (Python/TS): розбираєш rate-limits, anti-bot, checkpointing, multi-IP, резюмовані довантаження.',
      'Валідуєш якість даних, пишеш міграції, тримаєш продовий Postgres в актуальному стані.',
      'Працюєш з ЄДРСР, HUDOC (ЄСПЛ), BOE, CURIA, Swiss Fedlex, UIPV, Prozorro, ARMA, NAZK, OFAC, offshore leaks, Pandora/Paradise та іншим.',
    ],
    stack: [
      'Python (asyncio, httpx, Playwright)',
      'PostgreSQL + PgBouncer + партиціонування',
      'Docker Compose, self-hosted runners',
      'Elasticsearch / Qdrant для semantic search',
    ],
    nice: [
      'Досвід роботи з державними API різних країн',
      'Знання мов (EN + ES/DE/FR/IT/PT — будь-яка EU)',
      'Уміння читати схеми XML/JSON без документації',
      'Робота з великими datasets (50M+ рядків, TB-рівень)',
    ],
    comp: 'Ставка + бонус за кожне успішно інтегроване джерело.',
  },
  {
    key: 'frontend',
    icon: <Code2 size={22} />,
    title: 'Frontend-інженер',
    tagline:
      'React 19, Vite, Tailwind, Zustand, TanStack Query — розширюєш lexwebapp і platform.',
    whatYouDo: [
      'Пишеш UI для чату, правої панелі з evidence, білінгу, адмін-панелей, консультацій.',
      'Працюєш з SSE streaming, складними state-машинами, real-time оновленнями.',
      'Налаштовуєш performance: code splitting, bundle size, rendering budgets.',
      'Рендериш результати правового аналізу в зручних візуальних форматах (таблиці, графи, timeline).',
    ],
    stack: [
      'React 19 + TypeScript 5.3',
      'Vite, Tailwind 3, Zustand, TanStack React Query',
      'Vitest + Playwright',
      'Framer Motion для анімацій',
    ],
    nice: [
      'Досвід з LLM-інтерфейсами (chat, streaming, tool use UI)',
      'Robust SSE-клієнти + reconnect логіка',
      'Чуття до typography та легал-tech UX (Harvey/Lex-style)',
      'Власні open source контрибуції',
    ],
    comp: 'Ставка + equity optional.',
  },
  {
    key: 'gtm',
    icon: <Target size={22} />,
    title: 'GTM Manager',
    tagline:
      'Виводиш продукт на ринок: юристи, адвокати, in-house, B2B. Україна + EU.',
    whatYouDo: [
      'Вибудовуєш канали: direct sales (юрфірми), партнерства (адвокатські об\'єднання), content-driven inbound, demo-led growth.',
      'Сегментуєш ринок, верифікуєш ICP, тримаєш воронку від MQL до closed-won.',
      'Працюєш з pricing experiments (prepaid credits, subscription tiers, enterprise contracts).',
      'Координуєш спільно з продуктом launches нових юрисдикцій (ми вже в UA + готуємо ES, CH, NL, EE).',
    ],
    stack: [
      'CRM (Plane/Nextcloud поки що, готові до Attio/HubSpot)',
      'Looker Studio для dashboards',
      'Mixpanel/PostHog для product analytics',
      'LinkedIn Sales Navigator + Apollo',
    ],
    nice: [
      'Досвід у B2B SaaS або legaltech',
      'Свій network серед юристів/адвокатів',
      'Досвід expansion до EU (GDPR, compliance, локалізація)',
      'Вмієш писати: кейси, case studies, LinkedIn-контент',
    ],
    comp: 'База + комісія від revenue.',
  },
  {
    key: 'ciso',
    icon: <Shield size={22} />,
    title: 'CISO (Chief Information Security Officer)',
    tagline:
      'Відповідаєш за безпеку платформи, яку використовують адвокати в активних кримінальних справах.',
    whatYouDo: [
      'Будуєш security program: threat modeling, incident response, vuln management, access control.',
      'Відповідаєш за compliance: GDPR, ISO 27001, SOC2 (плануємо), українське законодавство про адвокатську таємницю.',
      'Контролюєш infra security: AWS, self-hosted runners, blue-green prod, WAF, ALB, nginx security headers.',
      'Керуєш E2EE для консультацій: ключове управління, audit trails, key rotation.',
      'Виступаєш точкою контакту для security research / bug bounty / responsible disclosure.',
    ],
    stack: [
      'AWS: EC2, S3, IAM, CloudTrail, Security Hub',
      'nginx, WAF rules, ALB',
      'PostgreSQL security (RLS, SCRAM, audit extensions)',
      'OWASP Top 10, MITRE ATT&CK',
    ],
    nice: [
      'CISSP / CISM / OSCP сертифікації',
      'Досвід роботи з legal або healthcare (sensitive data workloads)',
      'Власні CVE або security research',
      'Досвід побудови bug bounty програм',
    ],
    comp: 'Ставка + equity.',
  },
];

export function CareerPage() {
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<JobKey>('osint');

  useDocumentMeta({
    title: 'Кар\'єра в LEX AI | legal.org.ua',
    description:
      'Приєднуйся до команди LEX: OSINT-інженер, Frontend-інженер, GTM Manager, CISO. Без співбесід — рівень оцінюється Claude Opus на merged.com.ua.',
    ogTitle: 'Кар\'єра в LEX AI',
    ogDescription:
      'Вакансії: OSINT, Frontend, GTM, CISO. Без співбесід — оцінка через merged.com.ua.',
    canonical: 'https://legal.org.ua/career',
  });

  const job = JOBS.find((j) => j.key === activeJob)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-claude-bg via-white to-claude-sidebar">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
          >
            <ArrowLeft size={16} />
            На головну
          </button>
          <div className="flex-1" />
          <img src="/Image.jpg" alt="LEX" className="h-10 w-auto" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-serif text-claude-text font-medium mb-4">
            Кар'єра в LEX
          </h1>
          <p className="text-lg text-claude-subtext font-sans max-w-2xl mx-auto">
            Ми будуємо AI-платформу для юристів, яка охоплює відкриті дані всіх
            юрисдикцій світу. Шукаємо чотирьох людей, які зроблять це швидше.
          </p>
        </motion.div>

        {/* No-interview banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-12 rounded-2xl border border-claude-accent/20 bg-claude-accent/5 p-6 md:p-8"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-claude-accent text-white flex items-center justify-center">
              <Brain size={22} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-serif text-claude-text font-medium mb-2">
                Співбесід немає
              </h2>
              <p className="text-claude-subtext font-sans leading-relaxed mb-4">
                Рівень кандидата оцінює Claude Opus на{' '}
                <a
                  href="https://merged.com.ua"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-claude-accent underline underline-offset-4 hover:no-underline inline-flex items-center gap-1"
                >
                  merged.com.ua
                  <ExternalLink size={12} />
                </a>
                {' '}— наш сайдбет-проєкт для об'єктивної оцінки професійного
                рівня через діалог з LLM. Замість 5 раундів інтерв'ю — одна
                сесія, результат одразу.
              </p>
              <div className="flex flex-wrap gap-2 text-sm font-sans">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-claude-border text-claude-subtext">
                  <Zap size={12} /> Без live-coding
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-claude-border text-claude-subtext">
                  <Zap size={12} /> Без whiteboard
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-claude-border text-claude-subtext">
                  <Zap size={12} /> Без HR-скринінгу
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-claude-border text-claude-subtext">
                  <Globe size={12} /> Віддалена робота
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Job tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {JOBS.map((j) => (
            <button
              key={j.key}
              onClick={() => setActiveJob(j.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-sans text-sm font-medium transition-all ${
                activeJob === j.key
                  ? 'bg-claude-accent text-white shadow-elevation-2'
                  : 'bg-white text-claude-text border border-claude-border hover:border-claude-accent/40'
              }`}
            >
              {j.icon}
              {j.title}
            </button>
          ))}
        </div>

        {/* Active job */}
        <motion.div
          key={job.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-white border border-claude-border shadow-elevation-1 overflow-hidden"
        >
          <div className="p-8 md:p-10">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-claude-accent/10 text-claude-accent flex items-center justify-center">
                {job.icon}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-serif text-claude-text font-medium">
                  {job.title}
                </h2>
                <p className="text-claude-subtext font-sans mt-1">
                  {job.tagline}
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mt-8">
              <div>
                <h3 className="text-sm font-sans font-semibold text-claude-text uppercase tracking-wide mb-3">
                  Що робиш
                </h3>
                <ul className="space-y-2.5">
                  {job.whatYouDo.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-sm font-sans text-claude-text leading-relaxed"
                    >
                      <Check
                        size={16}
                        className="flex-shrink-0 text-claude-accent mt-0.5"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-sans font-semibold text-claude-text uppercase tracking-wide mb-3">
                  Стек
                </h3>
                <ul className="space-y-2 mb-6">
                  {job.stack.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm font-sans text-claude-subtext"
                    >
                      {item}
                    </li>
                  ))}
                </ul>

                <h3 className="text-sm font-sans font-semibold text-claude-text uppercase tracking-wide mb-3">
                  Буде плюсом
                </h3>
                <ul className="space-y-2">
                  {job.nice.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm font-sans text-claude-subtext leading-relaxed"
                    >
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-claude-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-1">
                  Компенсація
                </p>
                <p className="text-sm font-sans text-claude-subtext">
                  {job.comp}
                </p>
              </div>
              <a
                href="https://merged.com.ua"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-claude-accent text-white font-sans text-sm font-medium hover:bg-claude-accent/90 transition-colors"
              >
                Пройти оцінку на merged.com.ua
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            {
              n: '1',
              title: 'Проходиш оцінку',
              body: 'На merged.com.ua відкриваєш сесію з Claude Opus. Діалог адаптивний — рівень визначається за глибиною відповідей, не за кількістю.',
            },
            {
              n: '2',
              title: 'Отримуєш звіт',
              body: 'Автоматичний звіт з оцінкою по компетенціях, сильними сторонами та точками росту. Відправляєш його нам разом з резюме.',
            },
            {
              n: '3',
              title: 'Стартуєш',
              body: 'Якщо підходимо одне одному — підписуємо contract, надаємо доступи, перший день у роботі впродовж тижня.',
            },
          ].map((step) => (
            <div
              key={step.n}
              className="rounded-xl bg-white border border-claude-border p-6"
            >
              <div className="w-8 h-8 rounded-full bg-claude-accent text-white font-sans font-semibold text-sm flex items-center justify-center mb-4">
                {step.n}
              </div>
              <h3 className="text-base font-serif text-claude-text font-medium mb-2">
                {step.title}
              </h3>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-12 rounded-2xl bg-white border border-claude-border p-8 text-center">
          <p className="text-sm font-sans text-claude-subtext mb-2">
            Питання — на
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
