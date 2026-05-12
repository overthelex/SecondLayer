import { useState, useRef } from 'react';
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
import { useDocumentMeta } from '../hooks/useDocumentMeta';

type PhaseKey = 'foundation' | 'exploitation' | 'defensive' | 'professional';

interface Resource {
  name: string;
  url: string;
}

interface Month {
  number: number;
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  theory: string;
  practice: string;
  resources: Resource[];
}

interface Phase {
  key: PhaseKey;
  label: string;
  title: string;
  months: string;
  color: string;
  borderColor: string;
  bgColor: string;
  dotColor: string;
  description: string;
  data: Month[];
}

const PHASES: Phase[] = [
  {
    key: 'foundation',
    label: 'ФАЗА 01',
    title: 'Фундамент',
    months: 'Місяці 1–3',
    color: 'text-emerald-700',
    borderColor: 'border-emerald-300',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-600',
    description: 'Сетевая грамотность, Linux изнутри, криптография — всё, что QA-инженер не трогал, но без чего AppSec невозможен.',
    data: [
      {
        number: 1,
        title: 'Сетевая грамотность и протоколы',
        icon: <Network size={18} />,
        subtitle: 'OSI, TCP/IP, HTTP, TLS, DNS — как поверхность атаки',
        theory: 'Модель OSI и TCP/IP не как абстракция, а как поверхность атаки. TCP handshake, состояния соединений, что видно в Wireshark. HTTP/1.1 и HTTP/2 на уровне сырых байтов: методы, заголовки, статусы, cookies, CORS, кэширование. TLS — handshake, сертификаты, цепочки доверия, чем отличается TLS 1.2 от 1.3. DNS и его роль в атаках (rebinding, cache poisoning, exfiltration через DNS).',
        practice: 'Разбор реального трафика в Wireshark, ручные запросы через curl и Burp Suite, написание простого MITM-прокси на Python.',
        resources: [
          { name: 'Wireshark', url: 'https://www.wireshark.org/' },
          { name: 'Burp Suite Community', url: 'https://portswigger.net/burp/communitydownload' },
          { name: 'curl', url: 'https://curl.se/' },
          { name: 'mitmproxy', url: 'https://mitmproxy.org/' },
        ],
      },
      {
        number: 2,
        title: 'Операционные системы и Linux изнутри',
        icon: <Terminal size={18} />,
        subtitle: 'Процессы, права, сеть, systemd — взгляд хакера',
        theory: 'Процессы, пользователи, права доступа (UID/GID, sticky bit, SUID/SGID). Файловая система, inodes, симлинки. Базовая работа в bash на уровне реального инструмента. Systemd, логи, journalctl. Сетевой стек в Linux: iptables/nftables, netstat/ss, tcpdump. Минимум про Windows: AD, NTLM, Kerberos на концептуальном уровне.',
        practice: 'Настроить уязвимую VM, найти privilege escalation через SUID-бинарь, прочитать /etc/shadow.',
        resources: [
          { name: 'Kali Linux', url: 'https://www.kali.org/' },
          { name: 'Metasploitable', url: 'https://docs.rapid7.com/metasploit/metasploitable-2/' },
          { name: 'HackTheBox', url: 'https://www.hackthebox.com/' },
          { name: 'TryHackMe', url: 'https://tryhackme.com/' },
        ],
      },
      {
        number: 3,
        title: 'Криптография без математики',
        icon: <Lock size={18} />,
        subtitle: 'AES, RSA, JWT, хэширование — когда что применяется и где ломается',
        theory: 'Симметричное и асимметричное шифрование. AES, RSA, ECC — когда что применяется. Хэш-функции (SHA-2, SHA-3, BLAKE), HMAC, key derivation (PBKDF2, Argon2, bcrypt). Цифровые подписи и PKI. JWT — детально, это болевая точка в AppSec. Типичные ошибки: ECB mode, повторное использование nonce, hardcoded secrets, weak randomness.',
        practice: 'cryptopals.com — первый сет (8 заданий). Навсегда запомнишь, почему не надо изобретать криптографию.',
        resources: [
          { name: 'cryptopals.com', url: 'https://cryptopals.com/' },
          { name: 'CyberChef', url: 'https://gchq.github.io/CyberChef/' },
          { name: 'jwt.io', url: 'https://jwt.io/' },
        ],
      },
    ],
  },
  {
    key: 'exploitation',
    label: 'ФАЗА 02',
    title: 'Веб-вразливості як ремесло',
    months: 'Місяці 4–7',
    color: 'text-amber-700',
    borderColor: 'border-amber-300',
    bgColor: 'bg-amber-50',
    dotColor: 'bg-amber-600',
    description: 'OWASP Top 10 на уровне причин, а не симптомов. Углублённая эксплуатация. API security — зона комфорта QA, которую мы делаем оружием.',
    data: [
      {
        number: 4,
        title: 'OWASP Top 10 — механика каждой категории',
        icon: <Bug size={18} />,
        subtitle: 'Injection, XSS, CSRF, SSRF, IDOR — не список, а понимание',
        theory: 'Injection (SQL, NoSQL, command, LDAP). Broken authentication и session management. XSS — три типа (reflected, stored, DOM-based), почему CSP помогает и где её обходят. CSRF и SameSite cookies. SSRF — одна из самых опасных категорий в облачную эпоху (метаданные EC2/GCE). XXE, insecure deserialization, IDOR.',
        practice: 'PortSwigger Web Security Academy — все бесплатные лабы по injection и authentication. Золотой стандарт обучения.',
        resources: [
          { name: 'PortSwigger Academy', url: 'https://portswigger.net/web-security' },
          { name: 'DVWA', url: 'https://github.com/digininja/DVWA' },
          { name: 'OWASP Juice Shop', url: 'https://owasp.org/www-project-juice-shop/' },
          { name: 'Burp Suite', url: 'https://portswigger.net/burp' },
        ],
      },
      {
        number: 5,
        title: 'Углублённая веб-эксплуатация',
        icon: <Flame size={18} />,
        subtitle: 'Race conditions, request smuggling, prototype pollution, OAuth',
        theory: 'Race conditions в веб-приложениях (двойное списание). HTTP request smuggling (CL.TE, TE.CL, TE.TE) — как протокольные детали ломают системы. Prototype pollution в JS. Web cache poisoning. OAuth 2.0 и OIDC: типичные ошибки, open redirect в redirect_uri, PKCE.',
        practice: 'PortSwigger Academy — дойти до уровня Practitioner.',
        resources: [
          { name: 'PortSwigger Academy', url: 'https://portswigger.net/web-security' },
          { name: 'James Kettle research', url: 'https://portswigger.net/research/james-kettle' },
          { name: 'Orange Tsai blog', url: 'https://blog.orange.tw/' },
        ],
      },
      {
        number: 6,
        title: 'API security',
        icon: <Globe size={18} />,
        subtitle: 'Твоя зона комфорта как QA — используй её как оружие',
        theory: 'OWASP API Security Top 10 (отдельный от обычного Top 10, и для AppSec важнее). BOLA/IDOR в API, broken authentication, excessive data exposure, mass assignment. GraphQL security: introspection, batching attacks, depth limiting. gRPC и его специфика. Rate limiting и почему его обычно делают неправильно.',
        practice: 'Взять open-source API (OWASP crAPI или VAmPI), найти 5 уязвимостей разных классов, написать PoC для каждой.',
        resources: [
          { name: 'OWASP crAPI', url: 'https://github.com/OWASP/crAPI' },
          { name: 'VAmPI', url: 'https://github.com/erev0s/VAmPI' },
          { name: 'Postman', url: 'https://www.postman.com/' },
          { name: 'GraphQL Voyager', url: 'https://graphql-kit.com/graphql-voyager/' },
        ],
      },
      {
        number: 7,
        title: 'Аутентификация и авторизация на серьёзном уровне',
        icon: <KeyRound size={18} />,
        subtitle: 'SAML, OAuth, OIDC, MFA bypass, WebAuthn, RBAC vs ABAC',
        theory: 'SAML, OAuth, OIDC — разбор атак: golden SAML, confused deputy, scope creep. Session fixation, session hijacking. MFA и его обходы (SIM swap, push fatigue, MFA prompt bombing). Password storage done right. WebAuthn/passkeys как современный ответ. RBAC vs ABAC vs ReBAC.',
        practice: 'Настроить Keycloak локально, попытаться сломать собственную конфигурацию.',
        resources: [
          { name: 'Keycloak', url: 'https://www.keycloak.org/' },
          { name: 'Authentik', url: 'https://goauthentik.io/' },
          { name: 'Auth0 Playground', url: 'https://auth0.com/docs/get-started' },
        ],
      },
    ],
  },
  {
    key: 'defensive',
    label: 'ФАЗА 03',
    title: 'Defensive AppSec',
    months: 'Місяці 8–11',
    color: 'text-blue-700',
    borderColor: 'border-blue-300',
    bgColor: 'bg-blue-50',
    dotColor: 'bg-blue-600',
    description: 'Secure SDLC, тулинг, code review, cloud — переход от "умею ломать" к "умею защищать и встраивать security в процесс разработки".',
    data: [
      {
        number: 8,
        title: 'Secure SDLC и threat modeling',
        icon: <FileSearch size={18} />,
        subtitle: 'STRIDE, PASTA, data flow — где AppSec встраивается в разработку',
        theory: 'Где AppSec встраивается в процесс разработки: design review, code review, тестирование, релиз, runtime. Threat modeling по STRIDE и PASTA на конкретных архитектурах. Data flow diagrams. Как разговаривать с разработчиками, чтобы они не ненавидели security (это реально часть работы).',
        practice: 'Взять архитектуру любого SaaS-продукта и составить полную threat model.',
        resources: [
          { name: 'OWASP Threat Dragon', url: 'https://owasp.org/www-project-threat-dragon/' },
          { name: 'MS Threat Modeling', url: 'https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool' },
          { name: 'STRIDE/PASTA', url: 'https://owasp.org/www-community/Threat_Modeling' },
        ],
      },
      {
        number: 9,
        title: 'SAST, DAST, SCA и инструментарий',
        icon: <Wrench size={18} />,
        subtitle: 'Semgrep, CodeQL, Snyk, Trivy, ZAP — security pipeline в CI',
        theory: 'Static analysis: Semgrep как современный стандарт, написание собственных правил. CodeQL для глубокого анализа. Dependency scanning: Snyk, Dependabot, OSV. Secrets scanning: gitleaks, trufflehog. Container scanning: Trivy, Grype. DAST: ZAP в CI, Burp Enterprise. QA-бэкграунд — прямое преимущество: встраивание security-чеков в CI/CD это та же автоматизация.',
        practice: 'Настроить полноценный security-пайплайн в GitHub Actions для тестового проекта.',
        resources: [
          { name: 'Semgrep', url: 'https://semgrep.dev/' },
          { name: 'CodeQL', url: 'https://codeql.github.com/' },
          { name: 'Snyk', url: 'https://snyk.io/' },
          { name: 'Trivy', url: 'https://trivy.dev/' },
          { name: 'OWASP ZAP', url: 'https://www.zaproxy.org/' },
          { name: 'gitleaks', url: 'https://github.com/gitleaks/gitleaks' },
        ],
      },
      {
        number: 10,
        title: 'Secure code review',
        icon: <Eye size={18} />,
        subtitle: 'Ключевой навык AppSec — чтение чужого кода на 4 языках',
        theory: 'Чтение чужого кода на Python, JavaScript/TypeScript, Go, Java — не для того чтобы писать, а чтобы находить уязвимости. Типовые паттерны: где разработчики ошибаются с инпутом, криптографией, конкурентностью, правами. Изучение реальных CVE через коммиты, которые их пофиксили — Project Zero блог, GitHub Security Advisories.',
        practice: 'Разобрать 10 публичных CVE до уровня «понимаю строчку, которую изменили, и почему она ломала всё».',
        resources: [
          { name: 'Project Zero blog', url: 'https://googleprojectzero.blogspot.com/' },
          { name: 'GitHub Advisories', url: 'https://github.com/advisories' },
          { name: 'Semgrep Playground', url: 'https://semgrep.dev/playground' },
        ],
      },
      {
        number: 11,
        title: 'Cloud security основы',
        icon: <Cloud size={18} />,
        subtitle: 'IAM, VPC, k8s, secrets management — без облака никуда',
        theory: 'IAM как самая сложная и самая ломаемая часть AWS/GCP/Azure. Принцип least privilege на практике. Network security: VPC, security groups, private endpoints. Secrets management (Vault, AWS Secrets Manager). Container и Kubernetes security: pod security, network policies, RBAC в k8s. Логирование и детекция: CloudTrail, GuardDuty.',
        practice: 'Пройти flaws.cloud и flaws2.cloud — бесплатные CTF по AWS-уязвимостям.',
        resources: [
          { name: 'flaws.cloud', url: 'http://flaws.cloud/' },
          { name: 'flaws2.cloud', url: 'http://flaws2.cloud/' },
          { name: 'AWS Security Pillar', url: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html' },
        ],
      },
    ],
  },
  {
    key: 'professional',
    label: 'ФАЗА 04',
    title: 'Професійне оформлення',
    months: 'Місяць 12+',
    color: 'text-violet-700',
    borderColor: 'border-violet-300',
    bgColor: 'bg-violet-50',
    dotColor: 'bg-violet-600',
    description: 'Портфолио, сертификации, позиционирование — превращаем знания в карьерный переход.',
    data: [
      {
        number: 12,
        title: 'Портфоліо та позиціонування',
        icon: <Award size={18} />,
        subtitle: 'GitHub, PortSwigger cert, bug bounty, LinkedIn — видимые доказательства',
        theory: 'GitHub с разобранными уязвимостями и собственными security-инструментами. Пройденный PortSwigger Academy с сертификатом Practitioner. Профиль на HackerOne или Bugcrowd с хотя бы парой принятых отчётов. LinkedIn с переписанным позиционированием: не «QA, который учит security», а «AppSec engineer with QA automation background».',
        practice: 'Собрать портфолио: 3+ CVE разбора, 1 security tool, Practitioner cert, 1+ bug bounty report.',
        resources: [
          { name: 'HackerOne', url: 'https://www.hackerone.com/' },
          { name: 'Bugcrowd', url: 'https://www.bugcrowd.com/' },
          { name: 'BSCP Certification', url: 'https://portswigger.net/web-security/certification' },
        ],
      },
      {
        number: 13,
        title: 'Сертифікації',
        icon: <Briefcase size={18} />,
        subtitle: 'BSCP, PNPT, OSCP, CSSLP — что реально проверяет навык',
        theory: 'Burp Suite Certified Practitioner (90 USD, реально проверяет навык). PNPT от TCM (доступнее OSCP, практический). OSCP в долгосрок. CISSP — позже, когда будет 5 лет опыта. Целиться не сразу в Security Engineer, а в позиции, где QA-бэкграунд — плюс: Security Automation Engineer, AppSec Engineer с фокусом на тулинг, Security в DevSecOps-команде.',
        practice: 'Пройти минимум одну практическую сертификацию. Начать подавать на позиции Security Automation / AppSec.',
        resources: [
          { name: 'BSCP exam', url: 'https://portswigger.net/web-security/certification' },
          { name: 'TCM PNPT', url: 'https://certifications.tcm-sec.com/pnpt/' },
          { name: 'OffSec OSCP', url: 'https://www.offsec.com/courses/pen-200/' },
        ],
      },
    ],
  },
];

const ESSENTIAL_READS = [
  { name: 'PortSwigger Daily Swig', url: 'https://portswigger.net/daily-swig', desc: 'Ежедневные security-новости от создателей Burp Suite' },
  { name: 'tl;dr sec (Clint Gibler)', url: 'https://tldrsec.com/', desc: 'Лучшая еженедельная рассылка по AppSec' },
  { name: 'Project Zero blog', url: 'https://googleprojectzero.blogspot.com/', desc: 'Глубокие технические разборы от Google' },
  { name: 'Orange Tsai', url: 'https://blog.orange.tw/', desc: 'Лучший исследователь веб-security в мире' },
  { name: 'James Kettle', url: 'https://portswigger.net/research/james-kettle', desc: 'Автор HTTP request smuggling research' },
];

export function CISOAcademyPage() {
  const navigate = useNavigate();
  const [activePhase, setActivePhase] = useState<PhaseKey>('foundation');
  const [expandedMonth, setExpandedMonth] = useState<number | null>(1);
  const contentRef = useRef<HTMLDivElement>(null);

  useDocumentMeta({
    title: 'CISO Academy — план навчання AppSec | legal.org.ua',
    description: '12-місячний план переходу з QA Automation в Application Security. Від мереж і криптографії до OWASP, cloud security та першої роботи в AppSec.',
    ogTitle: 'CISO Academy — QA → AppSec за 12 місяців',
    ogDescription: 'Помісячний план навчання з акцентом на практику: кожна тема — конкретний артефакт.',
    canonical: 'https://legal.org.ua/cisoacademy',
  });

  const phase = PHASES.find((p) => p.key === activePhase)!;
  const totalMonths = PHASES.reduce((sum, p) => sum + p.data.length, 0);

  return (
    <div className="min-h-screen bg-claude-bg">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate('/career')}
            className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
          >
            <ArrowLeft size={16} />
            Кар'єра
          </button>
          <div className="hidden md:flex items-center gap-1 ml-4">
            {PHASES.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setActivePhase(p.key);
                  setExpandedMonth(p.data[0].number);
                }}
                className={`px-3 py-1.5 rounded-lg font-sans text-xs font-medium transition-all ${
                  activePhase === p.key
                    ? `${p.bgColor} ${p.color}`
                    : 'text-claude-subtext hover:text-claude-text hover:bg-claude-sidebar'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs font-sans text-claude-subtext">
            <Clock size={14} />
            <span>{totalMonths} місяців · 5–8 год/тиждень</span>
          </div>
          <img src="/Image.jpg" alt="LEX" className="h-8 w-auto ml-3" />
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2318181B' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-12 relative">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-claude-accent flex items-center justify-center">
                <Shield size={24} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-sans font-semibold text-claude-subtext uppercase tracking-[0.2em]">
                  LEX ACADEMY
                </p>
                <p className="text-xs font-sans text-claude-subtext">
                  Powered by legal.org.ua
                </p>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-claude-text font-medium leading-[1.1] mb-6 max-w-3xl">
              QA Automation → AppSec
              <br />
              <span className="text-claude-subtext">за 12 місяців</span>
            </h1>
            <p className="text-base md:text-lg font-sans text-claude-subtext max-w-2xl leading-relaxed mb-8">
              Помісячний план з акцентом на практику. Кожна тема — не тільки читання,
              а конкретний артефакт: розібраний CVE, написаний експлойт, знайдена
              вразливість у тренувальному застосунку.
            </p>

            {/* Prereq badge */}
            <div className="inline-flex items-start gap-3 px-5 py-4 rounded-xl border border-claude-border bg-white">
              <Target size={18} className="text-claude-accent mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-sans font-medium text-claude-text mb-1">Вхідна позиція</p>
                <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                  Automation QA з API-тестами — це вже половина шляху до AppSec: HTTP, JSON, fixtures, моки, CI-пайплайни переносяться майже один в один.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="border-y border-claude-border bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-1">
            {PHASES.map((p) => (
              <div key={p.key} className="flex-1 flex items-center gap-1">
                {p.data.map((m) => (
                  <button
                    key={m.number}
                    onClick={() => {
                      setActivePhase(p.key);
                      setExpandedMonth(m.number);
                    }}
                    className={`flex-1 h-2 rounded-full transition-all ${
                      expandedMonth === m.number
                        ? p.dotColor
                        : activePhase === p.key
                        ? `${p.dotColor} opacity-30`
                        : 'bg-claude-border'
                    }`}
                    title={`Місяць ${m.number}: ${m.title}`}
                  />
                ))}
                {p.key !== 'professional' && <div className="w-3" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {PHASES.map((p) => (
              <p key={p.key} className={`text-[10px] font-sans font-medium uppercase tracking-wider ${
                activePhase === p.key ? p.color : 'text-claude-subtext/50'
              }`}>
                {p.months}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 py-12" ref={contentRef}>
        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Phase sidebar */}
          <div className="lg:sticky lg:top-20 lg:self-start space-y-2">
            {PHASES.map((p, idx) => (
              <motion.button
                key={p.key}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                onClick={() => {
                  setActivePhase(p.key);
                  setExpandedMonth(p.data[0].number);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  activePhase === p.key
                    ? `${p.bgColor} ${p.borderColor} border`
                    : 'hover:bg-claude-sidebar border border-transparent'
                }`}
              >
                <p className={`text-[10px] font-sans font-bold uppercase tracking-[0.15em] mb-1 ${
                  activePhase === p.key ? p.color : 'text-claude-subtext'
                }`}>
                  {p.label} · {p.months}
                </p>
                <p className={`text-sm font-serif font-medium ${
                  activePhase === p.key ? 'text-claude-text' : 'text-claude-subtext'
                }`}>
                  {p.title}
                </p>
              </motion.button>
            ))}

            {/* Lab environment note */}
            <div className="mt-6 p-4 rounded-xl border border-dashed border-claude-border">
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                Лабораторне середовище
              </p>
              <ul className="space-y-1.5 text-xs font-sans text-claude-subtext leading-relaxed">
                <li>· Kali Linux VM</li>
                <li>· Metasploitable / DVWA / Juice Shop</li>
                <li>· Burp Suite Community — з першого дня</li>
                <li>· HTB / TryHackMe / PortSwigger</li>
              </ul>
            </div>
          </div>

          {/* Phase content */}
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={phase.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                {/* Phase header */}
                <div className={`rounded-xl ${phase.bgColor} border ${phase.borderColor} p-6 mb-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-xs font-sans font-bold uppercase tracking-[0.15em] ${phase.color} mb-2`}>
                        {phase.label}
                      </p>
                      <h2 className="text-2xl font-serif text-claude-text font-medium mb-2">
                        {phase.title}
                      </h2>
                      <p className="text-sm font-sans text-claude-subtext leading-relaxed max-w-xl">
                        {phase.description}
                      </p>
                    </div>
                    <div className={`flex-shrink-0 w-14 h-14 rounded-2xl ${phase.dotColor} flex items-center justify-center`}>
                      <span className="text-white font-sans font-bold text-lg">
                        {phase.data.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Months */}
                <div className="space-y-3">
                  {phase.data.map((month) => {
                    const isExpanded = expandedMonth === month.number;
                    return (
                      <div
                        key={month.number}
                        className={`rounded-xl border transition-all ${
                          isExpanded
                            ? `border-claude-accent/20 bg-white shadow-elevation-2`
                            : 'border-claude-border bg-white hover:border-claude-accent/10 hover:shadow-elevation-1'
                        }`}
                      >
                        <button
                          onClick={() => setExpandedMonth(isExpanded ? null : month.number)}
                          className="w-full text-left px-6 py-5 flex items-center gap-4"
                        >
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-sans font-bold text-sm ${
                            isExpanded
                              ? `${phase.dotColor} text-white`
                              : `${phase.bgColor} ${phase.color}`
                          }`}>
                            {String(month.number).padStart(2, '0')}
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
                            <span className="text-claude-subtext">{month.icon}</span>
                            <ChevronDown
                              size={18}
                              className={`text-claude-subtext transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
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
                                <div className="border-t border-claude-border pt-5">
                                  <div className="grid md:grid-cols-2 gap-6">
                                    {/* Theory */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <BookOpen size={14} className={phase.color} />
                                        <h4 className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide">
                                          Теорія
                                        </h4>
                                      </div>
                                      <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                                        {month.theory}
                                      </p>
                                    </div>

                                    {/* Practice */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-3">
                                        <Code2 size={14} className={phase.color} />
                                        <h4 className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide">
                                          Практика
                                        </h4>
                                      </div>
                                      <p className="text-sm font-sans text-claude-subtext leading-relaxed mb-4">
                                        {month.practice}
                                      </p>

                                      {/* Resources */}
                                      <div className="flex flex-wrap gap-1.5">
                                        {month.resources.map((res) => (
                                          <a
                                            key={res.name}
                                            href={res.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-sans font-medium ${phase.bgColor} ${phase.color} hover:opacity-75 transition-opacity`}
                                          >
                                            {res.name}
                                            <ExternalLink size={10} />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
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
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mt-16 rounded-2xl border border-claude-border bg-white p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <BookOpen size={20} className="text-claude-accent" />
            <h2 className="text-xl font-serif text-claude-text font-medium">
              Обов'язкове читання
            </h2>
          </div>
          <p className="text-sm font-sans text-claude-subtext mb-6 max-w-2xl">
            30 хвилин на день дають більше, ніж година відеокурсів. Підписки, які формують мислення:
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ESSENTIAL_READS.map((r) => (
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

        {/* Programming note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mt-6 rounded-2xl border border-dashed border-claude-border bg-white p-8"
        >
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                Програмування
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                Не ціль, а інструмент. Python на рівні «можу написати утиліту в 200 рядків» — обов'язково. Bash — обов'язково. Читання Go і Java — бажано. Писати продакшен-код не потрібно.
              </p>
            </div>
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                Лабораторне середовище
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                Потрібне з першого місяця. Kali VM, уразлива VM (Metasploitable, DVWA, Juice Shop, HackTheBox). Burp Suite Community з першого дня. Всі експерименти — тільки на своїй інфраструктурі або на легальних платформах.
              </p>
            </div>
            <div>
              <p className="text-xs font-sans font-semibold text-claude-text uppercase tracking-wide mb-2">
                CVE та блоги
              </p>
              <p className="text-sm font-sans text-claude-subtext leading-relaxed">
                Читання CVE і блогів — не доповнення, а основа. 30 хвилин на день на читання дає більше, ніж година відеокурсів. Project Zero, Orange Tsai, James Kettle — для веба найкращі у світі.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm font-sans text-claude-subtext mb-3">
            Питання про програму — на
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
