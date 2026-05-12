import type { AppLanguage } from '../../stores/localeStore';

interface Resource {
  name: string;
  url: string;
}

interface Month {
  title: string;
  subtitle: string;
  theory: string;
  practice: string;
  resources: Resource[];
}

interface Phase {
  label: string;
  title: string;
  months: string;
  description: string;
  data: Month[];
}

interface EssentialRead {
  name: string;
  url: string;
  desc: string;
}

export interface CISOAcademyCopy {
  metaTitle: string;
  metaDescription: string;
  back: string;
  kicker: string;
  subKicker: string;
  headline: string;
  headlineFaded: string;
  lead: string;
  prereqTitle: string;
  prereqBody: string;
  duration: string;
  theoryLabel: string;
  practiceLabel: string;
  labTitle: string;
  labItems: string[];
  readingTitle: string;
  readingSub: string;
  noteProgTitle: string;
  noteProgBody: string;
  noteLabTitle: string;
  noteLabBody: string;
  noteCveTitle: string;
  noteCveBody: string;
  contactPre: string;
  phases: Phase[];
  essentialReads: EssentialRead[];
}

const RESOURCES = {
  wireshark: { name: 'Wireshark', url: 'https://www.wireshark.org/' },
  burpCommunity: { name: 'Burp Suite Community', url: 'https://portswigger.net/burp/communitydownload' },
  curl: { name: 'curl', url: 'https://curl.se/' },
  mitmproxy: { name: 'mitmproxy', url: 'https://mitmproxy.org/' },
  kali: { name: 'Kali Linux', url: 'https://www.kali.org/' },
  metasploitable: { name: 'Metasploitable', url: 'https://docs.rapid7.com/metasploit/metasploitable-2/' },
  htb: { name: 'HackTheBox', url: 'https://www.hackthebox.com/' },
  thm: { name: 'TryHackMe', url: 'https://tryhackme.com/' },
  cryptopals: { name: 'cryptopals.com', url: 'https://cryptopals.com/' },
  cyberchef: { name: 'CyberChef', url: 'https://gchq.github.io/CyberChef/' },
  jwtio: { name: 'jwt.io', url: 'https://jwt.io/' },
  portswiggerAcademy: { name: 'PortSwigger Academy', url: 'https://portswigger.net/web-security' },
  dvwa: { name: 'DVWA', url: 'https://github.com/digininja/DVWA' },
  juiceShop: { name: 'OWASP Juice Shop', url: 'https://owasp.org/www-project-juice-shop/' },
  burp: { name: 'Burp Suite', url: 'https://portswigger.net/burp' },
  kettleResearch: { name: 'James Kettle research', url: 'https://portswigger.net/research/james-kettle' },
  orangeTsai: { name: 'Orange Tsai blog', url: 'https://blog.orange.tw/' },
  crapi: { name: 'OWASP crAPI', url: 'https://github.com/OWASP/crAPI' },
  vampi: { name: 'VAmPI', url: 'https://github.com/erev0s/VAmPI' },
  postman: { name: 'Postman', url: 'https://www.postman.com/' },
  graphqlVoyager: { name: 'GraphQL Voyager', url: 'https://graphql-kit.com/graphql-voyager/' },
  keycloak: { name: 'Keycloak', url: 'https://www.keycloak.org/' },
  authentik: { name: 'Authentik', url: 'https://goauthentik.io/' },
  auth0: { name: 'Auth0 Playground', url: 'https://auth0.com/docs/get-started' },
  threatDragon: { name: 'OWASP Threat Dragon', url: 'https://owasp.org/www-project-threat-dragon/' },
  msThreatModeling: { name: 'MS Threat Modeling', url: 'https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool' },
  stridePasta: { name: 'STRIDE/PASTA', url: 'https://owasp.org/www-community/Threat_Modeling' },
  semgrep: { name: 'Semgrep', url: 'https://semgrep.dev/' },
  codeql: { name: 'CodeQL', url: 'https://codeql.github.com/' },
  snyk: { name: 'Snyk', url: 'https://snyk.io/' },
  trivy: { name: 'Trivy', url: 'https://trivy.dev/' },
  zap: { name: 'OWASP ZAP', url: 'https://www.zaproxy.org/' },
  gitleaks: { name: 'gitleaks', url: 'https://github.com/gitleaks/gitleaks' },
  projectZero: { name: 'Project Zero blog', url: 'https://googleprojectzero.blogspot.com/' },
  ghAdvisories: { name: 'GitHub Advisories', url: 'https://github.com/advisories' },
  semgrepPlayground: { name: 'Semgrep Playground', url: 'https://semgrep.dev/playground' },
  flaws: { name: 'flaws.cloud', url: 'http://flaws.cloud/' },
  flaws2: { name: 'flaws2.cloud', url: 'http://flaws2.cloud/' },
  awsSecurity: { name: 'AWS Security Pillar', url: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html' },
  hackerone: { name: 'HackerOne', url: 'https://www.hackerone.com/' },
  bugcrowd: { name: 'Bugcrowd', url: 'https://www.bugcrowd.com/' },
  bscp: { name: 'BSCP Certification', url: 'https://portswigger.net/web-security/certification' },
  pnpt: { name: 'TCM PNPT', url: 'https://certifications.tcm-sec.com/pnpt/' },
  oscp: { name: 'OffSec OSCP', url: 'https://www.offsec.com/courses/pen-200/' },
};

const en: CISOAcademyCopy = {
  metaTitle: 'CISO Academy — QA to AppSec in 12 months | legal.org.ua',
  metaDescription: 'A 12-month practical training plan for transitioning from QA Automation to Application Security. From networking and cryptography to OWASP, cloud security, and your first AppSec role.',
  back: 'Career',
  kicker: 'LEX ACADEMY',
  subKicker: 'Powered by legal.org.ua',
  headline: 'QA Automation → AppSec',
  headlineFaded: 'in 12 months',
  lead: 'A month-by-month plan built around practice. Each topic is not just reading — it\'s a concrete artifact: a dissected CVE, a written exploit, a vulnerability found in a training application.',
  prereqTitle: 'Starting position',
  prereqBody: 'Automation QA with API tests is already halfway to AppSec: HTTP, JSON, fixtures, mocks, CI pipelines transfer almost one-to-one.',
  duration: 'months · 5–8 hrs/week',
  theoryLabel: 'Theory',
  practiceLabel: 'Practice',
  labTitle: 'Lab environment',
  labItems: ['Kali Linux VM', 'Metasploitable / DVWA / Juice Shop', 'Burp Suite Community — from day one', 'HTB / TryHackMe / PortSwigger'],
  readingTitle: 'Essential reading',
  readingSub: '30 minutes a day gives more than an hour of video courses. Subscriptions that shape your thinking:',
  noteProgTitle: 'Programming',
  noteProgBody: 'Not a goal, but a tool. Python at the level of "I can write a 200-line utility" — mandatory. Bash — mandatory. Reading Go and Java — desirable. Writing production code is not required.',
  noteLabTitle: 'Lab environment',
  noteLabBody: 'Needed from month one. Kali VM, a vulnerable VM (Metasploitable, DVWA, Juice Shop, HackTheBox). Burp Suite Community from day one. All experiments — only on your own infrastructure or on legal platforms.',
  noteCveTitle: 'CVEs & blogs',
  noteCveBody: 'Reading CVEs and blogs is not a supplement, it\'s the foundation. 30 minutes a day of reading gives more than an hour of video courses. Project Zero, Orange Tsai, James Kettle — the best in the world for web security.',
  contactPre: 'Questions about the program — at',
  phases: [
    {
      label: 'PHASE 01',
      title: 'Foundation',
      months: 'Months 1–3',
      description: 'Network literacy, Linux internals, cryptography — everything a QA engineer never touched, but without which AppSec is impossible.',
      data: [
        {
          title: 'Network literacy and protocols',
          subtitle: 'OSI, TCP/IP, HTTP, TLS, DNS — as attack surface',
          theory: 'OSI model and TCP/IP not as abstraction but as attack surface. TCP handshake, connection states, what\'s visible in Wireshark. HTTP/1.1 and HTTP/2 at the raw byte level: methods, headers, statuses, cookies, CORS, caching. TLS — handshake, certificates, trust chains, differences between TLS 1.2 and 1.3. DNS and its role in attacks (rebinding, cache poisoning, exfiltration via DNS).',
          practice: 'Analyze real traffic in Wireshark, manual requests via curl and Burp Suite, write a simple MITM proxy in Python.',
          resources: [RESOURCES.wireshark, RESOURCES.burpCommunity, RESOURCES.curl, RESOURCES.mitmproxy],
        },
        {
          title: 'Operating systems and Linux internals',
          subtitle: 'Processes, permissions, networking, systemd — the hacker\'s view',
          theory: 'Processes, users, access rights (UID/GID, sticky bit, SUID/SGID). File system, inodes, symlinks. Real bash skills as a working tool. Systemd, logs, journalctl. Linux network stack: iptables/nftables, netstat/ss, tcpdump. Windows basics: AD, NTLM, Kerberos at the conceptual level.',
          practice: 'Set up a vulnerable VM, find privilege escalation via a SUID binary, read /etc/shadow.',
          resources: [RESOURCES.kali, RESOURCES.metasploitable, RESOURCES.htb, RESOURCES.thm],
        },
        {
          title: 'Cryptography without the math',
          subtitle: 'AES, RSA, JWT, hashing — when to use what and where it breaks',
          theory: 'Symmetric and asymmetric encryption. AES, RSA, ECC — when to apply each. Hash functions (SHA-2, SHA-3, BLAKE), HMAC, key derivation (PBKDF2, Argon2, bcrypt). Digital signatures and PKI. JWT — in detail, this is the pain point in AppSec. Common mistakes: ECB mode, nonce reuse, hardcoded secrets, weak randomness.',
          practice: 'cryptopals.com — first set (8 challenges). You\'ll remember forever why you shouldn\'t invent cryptography.',
          resources: [RESOURCES.cryptopals, RESOURCES.cyberchef, RESOURCES.jwtio],
        },
      ],
    },
    {
      label: 'PHASE 02',
      title: 'Web vulnerabilities as craft',
      months: 'Months 4–7',
      description: 'OWASP Top 10 at the level of causes, not symptoms. Advanced exploitation. API security — your QA comfort zone, turned into a weapon.',
      data: [
        {
          title: 'OWASP Top 10 — the mechanics of each category',
          subtitle: 'Injection, XSS, CSRF, SSRF, IDOR — understanding, not memorization',
          theory: 'Injection (SQL, NoSQL, command, LDAP). Broken authentication and session management. XSS — three types (reflected, stored, DOM-based), why CSP helps and where it\'s bypassed. CSRF and SameSite cookies. SSRF — one of the most dangerous categories in the cloud era (EC2/GCE metadata). XXE, insecure deserialization, IDOR.',
          practice: 'PortSwigger Web Security Academy — all free labs on injection and authentication. The gold standard of training.',
          resources: [RESOURCES.portswiggerAcademy, RESOURCES.dvwa, RESOURCES.juiceShop, RESOURCES.burp],
        },
        {
          title: 'Advanced web exploitation',
          subtitle: 'Race conditions, request smuggling, prototype pollution, OAuth',
          theory: 'Race conditions in web apps (double spending). HTTP request smuggling (CL.TE, TE.CL, TE.TE) — how protocol details break systems. Prototype pollution in JS. Web cache poisoning. OAuth 2.0 and OIDC: common mistakes, open redirect in redirect_uri, PKCE.',
          practice: 'PortSwigger Academy — reach Practitioner level.',
          resources: [RESOURCES.portswiggerAcademy, RESOURCES.kettleResearch, RESOURCES.orangeTsai],
        },
        {
          title: 'API security',
          subtitle: 'Your QA comfort zone — use it as a weapon',
          theory: 'OWASP API Security Top 10 (separate from the regular Top 10, and more important for AppSec). BOLA/IDOR in APIs, broken authentication, excessive data exposure, mass assignment. GraphQL security: introspection, batching attacks, depth limiting. gRPC specifics. Rate limiting and why it\'s usually done wrong.',
          practice: 'Take an open-source API (OWASP crAPI or VAmPI), find 5 vulnerabilities of different classes, write a PoC for each.',
          resources: [RESOURCES.crapi, RESOURCES.vampi, RESOURCES.postman, RESOURCES.graphqlVoyager],
        },
        {
          title: 'Authentication and authorization — the serious level',
          subtitle: 'SAML, OAuth, OIDC, MFA bypass, WebAuthn, RBAC vs ABAC',
          theory: 'SAML, OAuth, OIDC — attack analysis: golden SAML, confused deputy, scope creep. Session fixation, session hijacking. MFA and its bypasses (SIM swap, push fatigue, MFA prompt bombing). Password storage done right. WebAuthn/passkeys as the modern answer. RBAC vs ABAC vs ReBAC.',
          practice: 'Set up Keycloak locally, try to break your own configuration.',
          resources: [RESOURCES.keycloak, RESOURCES.authentik, RESOURCES.auth0],
        },
      ],
    },
    {
      label: 'PHASE 03',
      title: 'Defensive AppSec',
      months: 'Months 8–11',
      description: 'Secure SDLC, tooling, code review, cloud — transitioning from "I can break" to "I can protect and embed security into the development process".',
      data: [
        {
          title: 'Secure SDLC and threat modeling',
          subtitle: 'STRIDE, PASTA, data flow — where AppSec fits into development',
          theory: 'Where AppSec fits into the development process: design review, code review, testing, release, runtime. Threat modeling with STRIDE and PASTA on concrete architectures. Data flow diagrams. How to talk to developers so they don\'t hate security (this is genuinely part of the job).',
          practice: 'Take the architecture of any SaaS product and build a complete threat model.',
          resources: [RESOURCES.threatDragon, RESOURCES.msThreatModeling, RESOURCES.stridePasta],
        },
        {
          title: 'SAST, DAST, SCA and the AppSec toolkit',
          subtitle: 'Semgrep, CodeQL, Snyk, Trivy, ZAP — security pipeline in CI',
          theory: 'Static analysis: Semgrep as the modern standard, writing custom rules. CodeQL for deep analysis. Dependency scanning: Snyk, Dependabot, OSV. Secrets scanning: gitleaks, trufflehog. Container scanning: Trivy, Grype. DAST: ZAP in CI, Burp Enterprise. QA background is a direct advantage — embedding security checks into CI/CD is the same automation.',
          practice: 'Set up a full security pipeline in GitHub Actions for a test project.',
          resources: [RESOURCES.semgrep, RESOURCES.codeql, RESOURCES.snyk, RESOURCES.trivy, RESOURCES.zap, RESOURCES.gitleaks],
        },
        {
          title: 'Secure code review',
          subtitle: 'The key AppSec skill — reading other people\'s code in 4 languages',
          theory: 'Reading other people\'s code in Python, JavaScript/TypeScript, Go, Java — not to write it yourself, but to find vulnerabilities. Typical patterns: where developers make mistakes with input, cryptography, concurrency, permissions. Studying real CVEs through the commits that fixed them — Project Zero blog, GitHub Security Advisories.',
          practice: 'Dissect 10 public CVEs to the level of "I understand the line they changed and why it broke everything."',
          resources: [RESOURCES.projectZero, RESOURCES.ghAdvisories, RESOURCES.semgrepPlayground],
        },
        {
          title: 'Cloud security fundamentals',
          subtitle: 'IAM, VPC, k8s, secrets management — no modern career without cloud',
          theory: 'IAM as the most complex and most broken part of AWS/GCP/Azure. Least privilege in practice. Network security: VPC, security groups, private endpoints. Secrets management (Vault, AWS Secrets Manager). Container and Kubernetes security: pod security, network policies, RBAC in k8s. Logging and detection: CloudTrail, GuardDuty.',
          practice: 'Complete flaws.cloud and flaws2.cloud — free AWS vulnerability CTFs.',
          resources: [RESOURCES.flaws, RESOURCES.flaws2, RESOURCES.awsSecurity],
        },
      ],
    },
    {
      label: 'PHASE 04',
      title: 'Professional development',
      months: 'Month 12+',
      description: 'Portfolio, certifications, positioning — turning knowledge into a career transition.',
      data: [
        {
          title: 'Portfolio and positioning',
          subtitle: 'GitHub, PortSwigger cert, bug bounty, LinkedIn — visible proof',
          theory: 'GitHub with dissected vulnerabilities and your own security tools. PortSwigger Academy completed with Practitioner certificate. Profile on HackerOne or Bugcrowd with at least a couple of accepted reports. LinkedIn repositioned: not "QA learning security" but "AppSec engineer with QA automation background."',
          practice: 'Build a portfolio: 3+ CVE analyses, 1 security tool, Practitioner cert, 1+ bug bounty report.',
          resources: [RESOURCES.hackerone, RESOURCES.bugcrowd, RESOURCES.bscp],
        },
        {
          title: 'Certifications',
          subtitle: 'BSCP, PNPT, OSCP, CSSLP — what actually tests skill',
          theory: 'Burp Suite Certified Practitioner ($90, genuinely tests skill). PNPT from TCM (more accessible than OSCP, practical). OSCP long-term. CISSP — later, when you have 5 years of experience. Target positions where QA background is a plus: Security Automation Engineer, AppSec Engineer with tooling focus, Security in DevSecOps teams.',
          practice: 'Pass at least one practical certification. Start applying for Security Automation / AppSec positions.',
          resources: [RESOURCES.bscp, RESOURCES.pnpt, RESOURCES.oscp],
        },
      ],
    },
  ],
  essentialReads: [
    { name: 'PortSwigger Daily Swig', url: 'https://portswigger.net/daily-swig', desc: 'Daily security news from the makers of Burp Suite' },
    { name: 'tl;dr sec (Clint Gibler)', url: 'https://tldrsec.com/', desc: 'The best weekly AppSec newsletter' },
    { name: 'Project Zero blog', url: 'https://googleprojectzero.blogspot.com/', desc: 'Deep technical analyses from Google' },
    { name: 'Orange Tsai', url: 'https://blog.orange.tw/', desc: 'The world\'s best web security researcher' },
    { name: 'James Kettle', url: 'https://portswigger.net/research/james-kettle', desc: 'The author of HTTP request smuggling research' },
  ],
};

const uk: CISOAcademyCopy = {
  metaTitle: 'CISO Academy — з QA в AppSec за 12 місяців | legal.org.ua',
  metaDescription: '12-місячний план переходу з QA Automation в Application Security. Від мереж і криптографії до OWASP, cloud security та першої роботи в AppSec.',
  back: 'Кар\'єра',
  kicker: 'LEX ACADEMY',
  subKicker: 'Powered by legal.org.ua',
  headline: 'QA Automation → AppSec',
  headlineFaded: 'за 12 місяців',
  lead: 'Помісячний план з акцентом на практику. Кожна тема — не тільки читання, а конкретний артефакт: розібраний CVE, написаний експлойт, знайдена вразливість у тренувальному застосунку.',
  prereqTitle: 'Вхідна позиція',
  prereqBody: 'Automation QA з API-тестами — це вже половина шляху до AppSec: HTTP, JSON, fixtures, моки, CI-пайплайни переносяться майже один в один.',
  duration: 'місяців · 5–8 год/тиждень',
  theoryLabel: 'Теорія',
  practiceLabel: 'Практика',
  labTitle: 'Лабораторне середовище',
  labItems: ['Kali Linux VM', 'Metasploitable / DVWA / Juice Shop', 'Burp Suite Community — з першого дня', 'HTB / TryHackMe / PortSwigger'],
  readingTitle: 'Обов\'язкове читання',
  readingSub: '30 хвилин на день дають більше, ніж година відеокурсів. Підписки, які формують мислення:',
  noteProgTitle: 'Програмування',
  noteProgBody: 'Не ціль, а інструмент. Python на рівні «можу написати утиліту в 200 рядків» — обов\'язково. Bash — обов\'язково. Читання Go і Java — бажано. Писати продакшен-код не потрібно.',
  noteLabTitle: 'Лабораторне середовище',
  noteLabBody: 'Потрібне з першого місяця. Kali VM, уразлива VM (Metasploitable, DVWA, Juice Shop, HackTheBox). Burp Suite Community з першого дня. Всі експерименти — тільки на своїй інфраструктурі або на легальних платформах.',
  noteCveTitle: 'CVE та блоги',
  noteCveBody: 'Читання CVE і блогів — не доповнення, а основа. 30 хвилин на день на читання дає більше, ніж година відеокурсів. Project Zero, Orange Tsai, James Kettle — для веба найкращі у світі.',
  contactPre: 'Питання про програму — на',
  phases: [
    {
      label: 'ФАЗА 01',
      title: 'Фундамент',
      months: 'Місяці 1–3',
      description: 'Мережева грамотність, Linux зсередини, криптографія — все, що QA-інженер не чіпав, але без чого AppSec неможливий.',
      data: [
        {
          title: 'Мережева грамотність і протоколи',
          subtitle: 'OSI, TCP/IP, HTTP, TLS, DNS — як поверхня атаки',
          theory: 'Модель OSI і TCP/IP не як абстракція, а як поверхня атаки. TCP handshake, стани з\'єднань, що видно в Wireshark. HTTP/1.1 і HTTP/2 на рівні сирих байтів: методи, заголовки, статуси, cookies, CORS, кешування. TLS — handshake, сертифікати, ланцюжки довіри, чим відрізняється TLS 1.2 від 1.3. DNS та його роль в атаках (rebinding, cache poisoning, exfiltration через DNS).',
          practice: 'Розбір реального трафіку в Wireshark, ручні запити через curl і Burp Suite, написання простого MITM-проксі на Python.',
          resources: [RESOURCES.wireshark, RESOURCES.burpCommunity, RESOURCES.curl, RESOURCES.mitmproxy],
        },
        {
          title: 'Операційні системи і Linux зсередини',
          subtitle: 'Процеси, права, мережа, systemd — погляд хакера',
          theory: 'Процеси, користувачі, права доступу (UID/GID, sticky bit, SUID/SGID). Файлова система, inodes, симлінки. Базова робота в bash на рівні реального інструменту. Systemd, логи, journalctl. Мережевий стек в Linux: iptables/nftables, netstat/ss, tcpdump. Мінімум про Windows: AD, NTLM, Kerberos на концептуальному рівні.',
          practice: 'Налаштувати вразливу VM, знайти privilege escalation через SUID-бінарь, прочитати /etc/shadow.',
          resources: [RESOURCES.kali, RESOURCES.metasploitable, RESOURCES.htb, RESOURCES.thm],
        },
        {
          title: 'Криптографія без математики',
          subtitle: 'AES, RSA, JWT, хешування — коли що застосовувати і де ламається',
          theory: 'Симетричне і асиметричне шифрування. AES, RSA, ECC — коли що застосовувати. Хеш-функції (SHA-2, SHA-3, BLAKE), HMAC, key derivation (PBKDF2, Argon2, bcrypt). Цифрові підписи і PKI. JWT — детально, це больова точка в AppSec. Типові помилки: ECB mode, повторне використання nonce, hardcoded secrets, weak randomness.',
          practice: 'cryptopals.com — перший сет (8 завдань). Назавжди запам\'ятаєш, чому не треба вигадувати криптографію.',
          resources: [RESOURCES.cryptopals, RESOURCES.cyberchef, RESOURCES.jwtio],
        },
      ],
    },
    {
      label: 'ФАЗА 02',
      title: 'Веб-вразливості як ремесло',
      months: 'Місяці 4–7',
      description: 'OWASP Top 10 на рівні причин, а не симптомів. Поглиблена експлуатація. API security — зона комфорту QA, яку робимо зброєю.',
      data: [
        {
          title: 'OWASP Top 10 — механіка кожної категорії',
          subtitle: 'Injection, XSS, CSRF, SSRF, IDOR — не список, а розуміння',
          theory: 'Injection (SQL, NoSQL, command, LDAP). Broken authentication і session management. XSS — три типи (reflected, stored, DOM-based), чому CSP допомагає і де її обходять. CSRF і SameSite cookies. SSRF — одна з найнебезпечніших категорій у хмарну епоху (метадані EC2/GCE). XXE, insecure deserialization, IDOR.',
          practice: 'PortSwigger Web Security Academy — всі безкоштовні лаби по injection і authentication. Золотий стандарт навчання.',
          resources: [RESOURCES.portswiggerAcademy, RESOURCES.dvwa, RESOURCES.juiceShop, RESOURCES.burp],
        },
        {
          title: 'Поглиблена веб-експлуатація',
          subtitle: 'Race conditions, request smuggling, prototype pollution, OAuth',
          theory: 'Race conditions у веб-застосунках (подвійне списання). HTTP request smuggling (CL.TE, TE.CL, TE.TE) — як протокольні деталі ламають системи. Prototype pollution в JS. Web cache poisoning. OAuth 2.0 і OIDC: типові помилки, open redirect в redirect_uri, PKCE.',
          practice: 'PortSwigger Academy — дійти до рівня Practitioner.',
          resources: [RESOURCES.portswiggerAcademy, RESOURCES.kettleResearch, RESOURCES.orangeTsai],
        },
        {
          title: 'API security',
          subtitle: 'Твоя зона комфорту як QA — використай її як зброю',
          theory: 'OWASP API Security Top 10 (окремий від звичайного Top 10, і для AppSec важливіший). BOLA/IDOR в API, broken authentication, excessive data exposure, mass assignment. GraphQL security: introspection, batching attacks, depth limiting. gRPC і його специфіка. Rate limiting і чому його зазвичай роблять неправильно.',
          practice: 'Взяти open-source API (OWASP crAPI або VAmPI), знайти 5 вразливостей різних класів, написати PoC для кожної.',
          resources: [RESOURCES.crapi, RESOURCES.vampi, RESOURCES.postman, RESOURCES.graphqlVoyager],
        },
        {
          title: 'Автентифікація і авторизація на серйозному рівні',
          subtitle: 'SAML, OAuth, OIDC, MFA bypass, WebAuthn, RBAC vs ABAC',
          theory: 'SAML, OAuth, OIDC — розбір атак: golden SAML, confused deputy, scope creep. Session fixation, session hijacking. MFA та його обходи (SIM swap, push fatigue, MFA prompt bombing). Password storage done right. WebAuthn/passkeys як сучасна відповідь. RBAC vs ABAC vs ReBAC.',
          practice: 'Налаштувати Keycloak локально, спробувати зламати власну конфігурацію.',
          resources: [RESOURCES.keycloak, RESOURCES.authentik, RESOURCES.auth0],
        },
      ],
    },
    {
      label: 'ФАЗА 03',
      title: 'Defensive AppSec',
      months: 'Місяці 8–11',
      description: 'Secure SDLC, тулінг, code review, cloud — перехід від «вмію ламати» до «вмію захищати і вбудовувати security в процес розробки».',
      data: [
        {
          title: 'Secure SDLC і threat modeling',
          subtitle: 'STRIDE, PASTA, data flow — де AppSec вбудовується в розробку',
          theory: 'Де AppSec вбудовується в процес розробки: design review, code review, тестування, реліз, runtime. Threat modeling по STRIDE і PASTA на конкретних архітектурах. Data flow diagrams. Як розмовляти з розробниками, щоб вони не ненавиділи security (це реально частина роботи).',
          practice: 'Взяти архітектуру будь-якого SaaS-продукту і скласти повну threat model.',
          resources: [RESOURCES.threatDragon, RESOURCES.msThreatModeling, RESOURCES.stridePasta],
        },
        {
          title: 'SAST, DAST, SCA та інструментарій',
          subtitle: 'Semgrep, CodeQL, Snyk, Trivy, ZAP — security pipeline в CI',
          theory: 'Static analysis: Semgrep як сучасний стандарт, написання власних правил. CodeQL для глибокого аналізу. Dependency scanning: Snyk, Dependabot, OSV. Secrets scanning: gitleaks, trufflehog. Container scanning: Trivy, Grype. DAST: ZAP в CI, Burp Enterprise. QA-бекграунд — пряма перевага: вбудовування security-чеків у CI/CD це та сама автоматизація.',
          practice: 'Налаштувати повноцінний security-пайплайн в GitHub Actions для тестового проєкту.',
          resources: [RESOURCES.semgrep, RESOURCES.codeql, RESOURCES.snyk, RESOURCES.trivy, RESOURCES.zap, RESOURCES.gitleaks],
        },
        {
          title: 'Secure code review',
          subtitle: 'Ключовий навик AppSec — читання чужого коду на 4 мовах',
          theory: 'Читання чужого коду на Python, JavaScript/TypeScript, Go, Java — не для того щоб писати, а щоб знаходити вразливості. Типові паттерни: де розробники помиляються з інпутом, криптографією, конкурентністю, правами. Вивчення реальних CVE через коміти, які їх пофіксили — Project Zero блог, GitHub Security Advisories.',
          practice: 'Розібрати 10 публічних CVE до рівня «розумію рядок, який змінили, і чому він ламав все».',
          resources: [RESOURCES.projectZero, RESOURCES.ghAdvisories, RESOURCES.semgrepPlayground],
        },
        {
          title: 'Cloud security основи',
          subtitle: 'IAM, VPC, k8s, secrets management — без хмари нікуди',
          theory: 'IAM як найскладніша і найчастіше зламувана частина AWS/GCP/Azure. Принцип least privilege на практиці. Network security: VPC, security groups, private endpoints. Secrets management (Vault, AWS Secrets Manager). Container і Kubernetes security: pod security, network policies, RBAC в k8s. Логування і детекція: CloudTrail, GuardDuty.',
          practice: 'Пройти flaws.cloud і flaws2.cloud — безкоштовні CTF по AWS-вразливостях.',
          resources: [RESOURCES.flaws, RESOURCES.flaws2, RESOURCES.awsSecurity],
        },
      ],
    },
    {
      label: 'ФАЗА 04',
      title: 'Професійне оформлення',
      months: 'Місяць 12+',
      description: 'Портфоліо, сертифікації, позиціонування — перетворюємо знання на кар\'єрний перехід.',
      data: [
        {
          title: 'Портфоліо та позиціонування',
          subtitle: 'GitHub, PortSwigger cert, bug bounty, LinkedIn — видимі докази',
          theory: 'GitHub з розібраними вразливостями та власними security-інструментами. Пройдений PortSwigger Academy з сертифікатом Practitioner. Профіль на HackerOne або Bugcrowd з хоча б парою прийнятих звітів. LinkedIn з переписаним позиціонуванням: не «QA, який вчить security», а «AppSec engineer with QA automation background».',
          practice: 'Зібрати портфоліо: 3+ CVE розборів, 1 security tool, Practitioner cert, 1+ bug bounty report.',
          resources: [RESOURCES.hackerone, RESOURCES.bugcrowd, RESOURCES.bscp],
        },
        {
          title: 'Сертифікації',
          subtitle: 'BSCP, PNPT, OSCP, CSSLP — що реально перевіряє навик',
          theory: 'Burp Suite Certified Practitioner (90 USD, реально перевіряє навик). PNPT від TCM (доступніший за OSCP, практичний). OSCP у довгостроковій перспективі. CISSP — пізніше, коли буде 5 років досвіду. Цілитися не одразу в Security Engineer, а в позиції, де QA-бекграунд є плюсом: Security Automation Engineer, AppSec Engineer з фокусом на тулінг, Security в DevSecOps-команді.',
          practice: 'Пройти мінімум одну практичну сертифікацію. Почати подаватися на позиції Security Automation / AppSec.',
          resources: [RESOURCES.bscp, RESOURCES.pnpt, RESOURCES.oscp],
        },
      ],
    },
  ],
  essentialReads: [
    { name: 'PortSwigger Daily Swig', url: 'https://portswigger.net/daily-swig', desc: 'Щоденні security-новини від створювачів Burp Suite' },
    { name: 'tl;dr sec (Clint Gibler)', url: 'https://tldrsec.com/', desc: 'Найкраща щотижнева розсилка по AppSec' },
    { name: 'Project Zero blog', url: 'https://googleprojectzero.blogspot.com/', desc: 'Глибокі технічні розбори від Google' },
    { name: 'Orange Tsai', url: 'https://blog.orange.tw/', desc: 'Найкращий дослідник веб-безпеки у світі' },
    { name: 'James Kettle', url: 'https://portswigger.net/research/james-kettle', desc: 'Автор досліджень HTTP request smuggling' },
  ],
};

export function getCISOAcademyCopy(lang: AppLanguage): CISOAcademyCopy {
  if (lang === 'uk' || lang === 'ru') return uk;
  return en;
}
