import type { TranslationMap } from './articles';

export const ruTranslations: TranslationMap = {
  'edrsr-vectorization-voyage': {
    title: 'Как мы векторизуем 33.7M судебных решений ЕГРСР через Voyage AI',
    punchline: 'ЕГРСР — Единый государственный реестр судебных решений Украины — это по сути вся судебная практика в открытом доступе. Сейчас в проде крутится векторизация последней большой когорты — 33.7M гражданских дел через Voyage AI voyage-3.5. Разбираем пайплайн: чанкинг, параллелизм, checkpoint/resume, прод-инцидент с postgres OOM, и сколько это стоит.',
    readTime: '7 мин',
    content: `# Как мы векторизуем 33.7M судебных решений ЕГРСР через Voyage AI

*ЕГРСР — Единый государственный реестр судебных решений — это фактически вся судебная практика Украины в открытом доступе. Мы уже векторизовали уголовные, административные, хозяйственные и КоАП-решения. Сейчас в проде крутится векторизация последней большой когорты — гражданских дел (ГПК, justice_kind=1), 33.7 миллиона документов. Разбираем, как это устроено под капотом: какие модели, какой пайплайн, сколько стоит, какие грабли.*

---

## Зачем векторизовать суды

Когда юрист ищет "есть ли практика по взысканию с банка комиссии за досрочное погашение" — он не хочет открывать 40 решений и читать их целиком. Он хочет, чтобы система нашла 5 самых релевантных, вытащила ключевые абзацы, показала аргументацию судов. Полнотекстовый поиск (FTS) по ключевым словам этого не даёт — он найдёт все документы, где встречается слово "комиссия", и их будут тысячи.

Для такой семантической задачи нужны векторные представления текста. Модель превращает абзац из решения в точку в 1024-мерном пространстве; семантически близкие абзацы — рядом. Далее kNN-поиск в Qdrant возвращает топ-K ближайших, и LLM формирует ответ на базе именно этих релевантных фрагментов.

Проблема одна: реестр большой. Очень.

---

## Масштаб

В нашей прод-базе лежат полные тексты решений начиная с 2006 года. Разбивка по типу судопроизводства:

- **Гражданское (ГПК)** — 33.7M документов. Самая большая категория. ЖКХ, потребительские споры, трудовые, семейные.
- **Уголовное (УПК)** — 12M+
- **Административное (КАС)** — 14M+
- **Хозяйственное (ХПК)** — 6M+
- **КоАП** — 6M+

В Qdrant-коллекции \`edrsr_decisions\` сейчас **76.3M векторов** — уже проиндексированные уголовные, админ, хозяйственные, КоАП и первые 3.37M ГПК. После завершения ГПК будет около **195M векторов** в одной коллекции.

Для сравнения: типичный RAG-проект содержит 100K — 1M векторов. Наш — на два порядка больше.

---

## Стек

**Embedding-модель.** \`voyage-3.5\` от Voyage AI. 1024-мерный выход, 6 центов за миллион токенов. Мы тестировали Voyage 3 Large и OpenAI text-embedding-3-large, но выигрыш в качестве для юридических текстов не перекрывал разницы в цене (Voyage 3 Large в 3 раза дороже). На 3.5 у нас уже был индекс предыдущих юрисдикций, поэтому остаёмся на ней для совместимости.

**Vector DB.** Qdrant, self-hosted в Docker. Одна коллекция \`edrsr_decisions\` с HNSW-индексом. Payload содержит doc_id, court_code, judge, cause_num, justice_kind, adjudication_date, judgment_code, category_code, а также chunk_index/total_chunks и текст чанка.

**Source-of-truth.** PostgreSQL 15, partitioned tables: RANGE по adjudication_date, LIST по adj_year. Полные тексты лежат в \`edrsr_fulltext\`, метаданные — в \`edrsr_documents\`. JOIN по всем партициям — это 30M+ строк, поэтому пайплайн ходит по году отдельно.

**Runtime.** Python 3.11, asyncio, aiohttp. Никаких фреймворков — прямой HTTP к Voyage и к Qdrant. 440 строк кода, один файл.

---

## Как нарезаем текст

Судебные решения — длинные. Среднее ГПК-решение — 8-12K символов, самые длинные — до 200K. Voyage принимает до 32K токенов на вход, но качество падает на длинных контекстах, да и один длинный вектор — это плохой retrieval: LLM не поймёт, какой именно абзац релевантен.

Поэтому чанкуем: максимум 2048 символов на чанк, overlap 50 слов между соседями. Разбиваем по абзацам, сохраняя семантическую связность. В среднем одно решение даёт 2.7 чанка.

Каждый чанк в Qdrant получает composite ID (doc_id × 1000 + chunk_index) — без коллизий, и одним payload-filter запросом вытаскиваются все чанки конкретного решения.

---

## Параллелизм и throttling

У Voyage есть rate limit — 2000 RPM на ключ для voyage-3.5. У нас два ключа и round-robin между ними — теоретический потолок 4000 RPM. На практике держим concurrency 50 и получаем стабильно **63 документа в секунду**. Это ~170 запросов в минуту на ключ — с большим запасом под rate limit.

Пробовали concurrency 70 — на первых двух миллионах всё ок, дальше процесс зависал на GIL (13% CPU, без прогресса, без ошибок — просто stuck на thread lock). Снизили до 50 — всё пошло ровно, без deadlock и без 429.

Каждая сотня документов триггерит пачку на Voyage (batch_size=500 чанков/запрос), получает эмбеддинги, формирует точки для Qdrant и делает один upsert. При ошибке от Voyage (429, сеть) — exponential backoff с джиттером, максимум 5 ретраев. При ошибке от Qdrant — retry той же пачки.

---

## Checkpoint и resume

На 33.7M документов любой сбой — сеть, OOM, падение контейнера — означает потерю часов работы. Поэтому:

- После каждых 1000 обработанных документов пайплайн пишет checkpoint в JSON: \`{last_doc_id, processed_docs, total_chunks, total_tokens, timestamp}\`
- При старте — читает checkpoint и начинает с \`WHERE doc_id > last_doc_id\`
- Все метрики (документы, чанки, токены, стоимость) аккумулируются через checkpoint

Это уже спасло нас дважды. Первый раз — когда кончилась память у postgres-прод (об этом ниже). Второй — когда Qdrant рестартанулся и потерял API-ключ из env. В обоих случаях мы просто перезапустили с того же checkpoint без дублирования работы.

---

## Прод-инцидент: postgres OOM

На 2.86M документов postgres-прод упал в recovery mode. Причина — несоответствие конфига: \`shared_buffers=16GB\`, но контейнерный лимит памяти — 12G. PG пытался аллоцировать больше, чем ему дано, OOM killer убивал процесс.

Фикс в PR #1453: \`mem_limit: 24G\`, \`shm_size: 16g\`. После перезапуска контейнера с новыми лимитами PG поднялся за 4 секунды и больше не падал. Этот эпизод подсветил важный инфра-паттерн: параметры postgresql.conf (shared_buffers, work_mem, maintenance_work_mem) должны быть согласованы с лимитами контейнера. Иначе система работает до первого всплеска нагрузки, а потом ложится в recovery.

Заодно увеличили swap на локальной dev-машине с 8GB до 24GB — мощная нагрузка на Voyage API генерирует много временных объектов в памяти Python-процесса, особенно когда ещё и Qdrant в фоне перестраивает индекс.

---

## Сколько стоит

Один гражданский документ в среднем даёт 2.7 чанка × 850 токенов = 2300 токенов. При цене voyage-3.5 в 6 центов за миллион токенов один документ стоит **0.014 цента** — около 138 микродолларов.

На 10% (3.37M документов) мы потратили **467 долларов** за 14.8 часа. Осталось 30.33M документов — это ещё примерно **3,100 долларов** и **130 часов** (около 5.4 суток непрерывного прогона). Суммарная стоимость полной векторизации ГПК-когорты — около **3,600 долларов**.

Для масштаба: за те же деньги на OpenAI text-embedding-3-large мы бы получили только четверть объёма. Voyage выигрывает именно на таких масштабах.

---

## Что это даёт пользователю

Когда гражданская когорта полностью проиндексируется, семантический поиск в LEX AI будет видеть все 195M чанков единой коллекции. Юрист задаёт запрос естественным языком — "судебная практика по признанию недействительным договора купли-продажи из-за недееспособности продавца" — и система возвращает самые релевантные решения из правильной юрисдикции, с извлечением ключевых абзацев, со ссылками на ЕГРСР.

Это другой класс продукта по сравнению с FTS. FTS находит документы, где встречается фраза. Семантический поиск находит документы, где обсуждается ваш сюжет — даже если суд использовал совсем другие слова.

---

## TL;DR

- 33.7M гражданских дел ЕГРСР → Voyage voyage-3.5 → Qdrant
- 63 документа/сек, concurrency 50, два API-ключа round-robin
- ~3,600 долларов суммарная стоимость полной векторизации ГПК
- Checkpoint/resume JSON, уже пережили два инцидента
- После завершения — 195M векторов в одной коллекции, единый семантический поиск по всей судебной практике Украины

Прод крутится в tmux, checkpoint триггерится каждые 1000 документов, мониторинг — \`tail -1 /tmp/vectorize-cpk.log\`. Скучная надёжная инженерия вместо героики.`,
  },
  'sneakypiper-due-diligence-platform': {
    title: 'SneakyPiper: 16.7M сущностей, 31K тем с darknet-форумов, 30+ OSINT-источников в проде',
    punchline: 'Наш OSINT-продукт SneakyPiper.com делает due diligence для американского бизнеса. Под капотом — 16.7M сущностей OpenSanctions, 31K AI-классифицированных тем с darknet-форумов, живой поток ransomware-жертв и GitHub credential leaks. Разбираем что лежит в проде, с цифрами.',
    readTime: '10 мин',
    content: `# SneakyPiper: 16.7M сущностей, 31K тем с darknet-форумов, 30+ OSINT-источников в проде

*SneakyPiper.com — наш второй продукт после LEX AI. Это AI-powered due diligence и OSINT-платформа для американского бизнеса: санкции, corporate intelligence, мониторинг darknet, корпоративные реестры, threat intel. Разбираем, что конкретно лежит в production-базе и как это работает.*

---

## Что такое SneakyPiper

Когда американский бизнес вступает в новую сделку — партнёрство, инвестицию, contractor hire, acquisition — возникает стандартный чек-лист: нет ли компании в санкционных списках, не банкрот ли её владелец, не появлялись ли её домены/IP в breach databases, нет ли её руководителей в Red Notices INTERPOL. В крупных корпорациях этим занимаются специализированные compliance-команды, платя LexisNexis, Dun & Bradstreet, Thomson Reuters десятки тысяч долларов в год.

SneakyPiper делает то же самое для малого и среднего бизнеса за копейки — автоматизированно через агрегацию открытых данных и AI-анализ. Платформа построена на четырёх слоях:

1. **Live OSINT-запросы к 30+ внешним сервисам** — OpenSanctions, INTERPOL, HIBP, Dehashed, IntelX, AbuseIPDB, VirusTotal, Companies House, LeakCheck, и дальше
2. **Собственная агрегированная база sanctions/PEP/crime** — yente (локальный OpenSanctions instance) с полным catalog
3. **Собственный dark-web collector** — живой мониторинг tor-форумов, ransomware-сайтов, paste-сервисов, github leak detection
4. **Orchestration layer** — классификация запросов, кэширование, AI-brief через интеграцию с LEX AI

Всё это обёрнуто в FastAPI-бэкенд (Python 3.11) + React/Vite фронтенд. Деплой на AWS EC2 во Франкфурте.

---

## Что конкретно лежит в production-базе (снимок на сегодня)

### Слой 1: OpenSanctions через yente (локальный instance)

Yente — официальный self-hostable API OpenSanctions. Мы крутим его локально и синхронизируем ежедневно. На сегодня:

- **344 отдельных датасета** (санкционные списки, PEP-реестры, crime, debarment, securities)
- **16,708,788 сущностей суммарно** по всем датасетам

Топ-20 датасетов по объёму:

| # | Dataset | Entities |
|---|---------|----------|
| 1 | default (all merged) | 4,146,759 |
| 2 | peps (Politically Exposed Persons) | 1,791,470 |
| 3 | enrichers | 1,341,668 |
| 4 | wd_categories (Wikidata) | 656,644 |
| 5 | ext_ru_egrul (Russian Unified State Register) | 593,892 |
| 6 | debarment (World Bank, US SAM etc.) | 579,305 |
| 7 | wd_peps (Wikidata PEPs) | 574,984 |
| 8 | crime (criminal records, wanted) | 510,744 |
| 9 | ann_pep_positions | 502,929 |
| 10 | securities | 501,862 |
| 11 | regulatory | 385,412 |
| 12 | wikidata | 360,730 |
| 13 | ext_gleif (LEI Reference Data) | 330,791 |
| 14 | sanctions (consolidated) | 278,647 |
| 15 | us_sam_exclusions | 267,806 |
| 16 | maritime | 264,941 |
| 17 | br_pep (Brazilian PEPs) | 253,827 |
| 18 | ext_gb_fca_firds (UK Financial Instruments) | 215,197 |
| 19 | ext_eu_esma_firds (EU Financial Instruments) | 214,946 |
| 20 | special_interest | 174,829 |

Другие заметные источники: US OFAC SDN (69,526), US Sanctions (86,910), Ukrainian NSDC Sanctions (60,741), Singapore gov directors (55,144), Polish wanted (53,631), EU Sanctions (38,089), Iranian UANI entities, Israeli MOD terrorists list, Monaco fund freezes, French treasury asset freezes.

**Зачем локальный instance:** публичный OpenSanctions API — 100 req/sec rate limit и 200–400ms латентности. Свой instance — sub-50ms без лимитов. Плюс полнотекстовый поиск с fuzzy-matching.

### Слой 2: Dark-web Intelligence Collector

Отдельный микросервис, тянущий данные с tor-форумов, ransomware-сайтов, github repositories, paste-сервисов. Весь traffic — через Tor SOCKS proxy (для deep-web) и residential proxy pool (для INTERPOL и некоторых sanctions-сайтов, блокирующих datacenter IPs).

**На сегодня:**

- **31,035 forum subjects** — посты с tor-форумов, каждый классифицирован AI-моделью по категории/риску
- **16,391 ransomware victims** — жертвы публичных ransomware-групп (LockBit, Cl0p, BlackCat, Rhysida и др.)
- **594 GitHub leaks** — публичные коммиты с credentials (API keys, DB passwords, private keys), найденные нашим сканером

**Классификация forum subjects:**

- **По риску:** critical — 5,825, high — 10,200, medium — 5,304, low — 9,706
- **По категории:** ransomware — 4,271, data_leak — 3,763, carding — 3,534, fraud — 2,571, credentials — 2,329, malware — 2,143, services — 1,835, exploit — 1,352, access_sale — 108, drugs/weapons — 13

**Darknet-источники, которые мы мониторим:**

BFD Forum (5,445 постов), Darknet Army (4,662), LockBit 3.0 mirror (3,478), Breach Forums dark (2,193), Orion (1,858), Dark Forums (1,384), Rehub (289), Spear (166), Dragon Force (47), Nitrogen (43), Insomnia (26), Krybit (25+), Genesis (18), RansomEXX (11), DaiXin (21), Rhysida (5), Brain Cipher (9), Scattered Spider, SafePay, FunkSec, Medusa, Anubis — и дальше. Большинство — через offline mirrors, потому что сами onion-сайты часто падают.

**Активные crawlers (обновляются в реальном времени):**

- \`forum_monitor\` — скрапинг tor-форумов (каждые 3–5 мин)
- \`forum_classifier\` — AI-классификация новых тем по категории/риску
- \`forum_body_fetcher\` — подтягивание полного текста топиков
- \`ransomlook\` — агрегация публичных ransomware leak-сайтов
- \`github_leaks\` — сканирование публичных github repositories на утекшие secrets
- \`paste_monitor\` — pastebin/privatebin/justpaste.it мониторинг
- \`darksearch\` — Tor search engine
- \`ahmia\` — Tor search engine (clearnet mirror)

Пример последнего запуска (17 апреля 2026, 14:44 UTC):

\`\`\`
forum_classifier   → ok, 7 records added
forum_body_fetcher → ok, 4 records added
forum_monitor      → ok, 1,229 records added
github_leaks       → ok, 240 records added
ransomlook         → ok, 141 records added
\`\`\`

Это только за последние 30 минут.

### Слой 3: Live-адаптеры к внешним сервисам

15 адаптеров в \`backend/app/adapters/\`:

- **opensanctions.py** — запросы к локальному yente
- **hibp.py** — Have I Been Pwned (breach-проверки по email/домену)
- **dehashed.py** — Dehashed API (commercial breach DB)
- **leakcheck.py** — LeakCheck API (credential checks)
- **pwndb.py** — pwndb (legacy breach DB)
- **intelx.py** — IntelX (deep-web search engine)
- **companies_house.py** — UK Companies House (corporate registry, 600 req/5min free tier)
- **interpol_worldbank.py** — INTERPOL Red Notices + World Bank Debarment List (через residential relay)
- **ip_reputation.py** — AbuseIPDB + VirusTotal + GreyNoise (IP threat score)
- **domain_reputation.py** — domain reputation и GSB-проверки
- **threat_intel.py** — NVD (CVE database) + CISA KEV + EPSS (exploit prediction)
- **socmint.py** — social media intelligence (GDELT, crt.sh и прочее)
- **corporate.py** — агрегированный corporate lookup (US EDGAR, OpenCorporates mirrors)
- **local_index.py** — вызовы к нашему dark-web collector
- **secondlayer.py** — интеграция с LEX AI для legal context

### Слой 4: Orchestration и кэш

- **Request cache** — локальная SQLite (\`/var/lib/sneakypiper/cache.db\`), TTL 72 часа. 304 KB на момент снимка (стартовый volume после 24 часов live-трафика)
- **Orchestrator** — принимает запрос "проверь company X", определяет какие адаптеры вызвать (по типу данных: email → breach DBs, IP → reputation stack, company name → sanctions + corporate), выполняет параллельно, агрегирует и проводит через AI-summarizer (Claude через LEX AI proxy)
- **Severity scoring** — собственный алгоритм, выставляющий overall risk score (low/medium/high/critical) на базе взвешенных сигналов из всех источников

---

## Как это всё живёт в проде

### Инфраструктура

- **EC2 instance:** \`i-05da283e047167978\`, t3.small, eu-central-1b (Франкфурт, Германия)
- **IP:** 18.185.127.10
- **OS:** Ubuntu, Docker Compose с host networking
- **Frontend:** статические файлы из \`/var/www/sneakypiper/\`, обслуживаются nginx
- **Backend:** один FastAPI-контейнер (\`sneakypiper-backend-1\`), порт 8001
- **SSL:** Let\'s Encrypt через certbot
- **Network:** WireGuard tunnel до collector host (10.77.0.0/24) — там крутятся yente и dark-web collector, на отдельном сервере с residential proxy chain

### Deploy pipeline

Self-hosted GitHub Actions runner, CI/CD из 4 шагов:

1. **Lint frontend** — \`tsc -b\`
2. **Build & push backend** — Docker image → GHCR (\`ghcr.io/overthelex/sneakypiper-backend\`)
3. **Build frontend** — Vite production bundle
4. **Deploy** — \`scp\` фронт + pull latest image на EC2, \`docker compose up -d\`

Плюс health check после деплоя: frontend response + \`/api/v1/health\` на backend. Если что-то падает — CI fail.

Тег релиза — автоматический по дате: \`2026.04.17\`, \`2026.04.17-1\`, и дальше.

### Что НЕ живёт на этом EC2

- **Yente (OpenSanctions):** отдельный host через WireGuard — там 100+ GB данных
- **Dark-web collector:** отдельный host — ему нужен Tor и residential proxy chain
- **LEX AI:** отдельный monorepo и инфраструктура (legal.org.ua)

Это правильный trade-off: compute-heavy вещи там, где им удобно, а presentation-layer — близко к пользователям во Франкфурте.

---

## Лицензирование и авторское право

Все данные, которые мы собираем и показываем — **открытые публичные источники**. Ни один из адаптеров не скрейпит платный контент, не обходит paywall, не врёт user-agent\'ом о том, что мы не бот. Мы делаем то, что делает любой compliance-офицер в банке вручную — просто быстрее и с лучшей агрегацией.

OpenSanctions — CC-BY 4.0. INTERPOL Red Notices — публичная база. World Bank Debarment — публичная. NVD/CISA — public domain. Forum posts — публичные в tor-сети, мы не логинимся и не обходим reg-walls.

Наша ценность не в "секретных данных", а в **агрегации, скорости, классификации и evidence-based scoring**.

---

## Почему это интересно open-source контрибьютору

SneakyPiper — часть нашей открытой экосистемы. Хотя у него свой отдельный репозиторий (не в \`overthelex/secondlayer\`), паттерны там те же:

- Adapter pattern для десятков внешних API
- Aggregation layer с severity scoring
- Dark-web data engineering (rate limiting, proxy rotation, resume logic)
- Real-time intelligence pipelines

Если вам интересно писать новые адаптеры (regulatory registries, национальные sanctions lists, sector-specific intel), добавлять поддержку новых dark-web источников, или строить scoring-алгоритмы — пишите. Обсудим, как подключаться напрямую к SneakyPiper или через смежные задачи в LEX AI (некоторые адаптеры переиспользуются).

---

**Сайт:** https://sneakypiper.com
**Сам продукт:** AI-powered due diligence для американского бизнеса
**Контакт для partnership/contribution:** vladimir@legal.org.ua

---

*Следующее: разговор с основателями — зачем компании из Киева делать OSINT-продукт для американского рынка, и как мы пришли к архитектуре "30+ adapters + yente + dark-web collector".*`,
  },
  'ml-engineer-competencies': {
    title: 'Какие компетенции нам нужны от ML инженера: 9 пунктов, которые мы ждём в резюме',
    punchline: 'Google Cloud перед выделением GPU задаёт 5 вопросов. Мы разобрали их в 9 ML-компетенций — от LoRA на 70B и continued pre-training DeepSeek-V3 685B до RLHF с конституционным alignment и capacity planning для $200K+ training run. Конкретные примеры из нашего стека.',
    readTime: '12 мин',
    content: `# Какие компетенции нам нужны от ML инженера

*Google Cloud перед выделением GPU задаёт пять вопросов. AWS — свои. Nebius — свои. Любой ML-инженер, которому мы доверим тренировку модели, должен знать ответы на все и понимать trade-offs за каждым. Вот детальный разбор компетенций — с конкретными примерами из нашего реального стека.*

---

## Контекст: пять вопросов от Google Cloud

На созвоне Dawid Szymula, Startup Territory Lead Google Cloud (Польша и Украина), попросил конкретику:

1. **Training / Fine-tuning / Inference** — что именно, и как распределено во времени?
2. **Model specs** — какая модель, сколько параметров, сколько тренировочных токенов?
3. **Concurrent users** на пиковые моменты?
4. **Input/Output volume** — средний промпт, длина ответа?
5. **TTFT** (Time to First Token) — целевой показатель?

За этими пятью вопросами — вся дисциплина ML-инфраструктуры: от расчёта эффективного training plan до sizing GPU под inference. От кандидата на ML-роль у нас мы ждём свободного владения этими вопросами без подсказок — с конкретной разбивкой ниже.

---

## 1. Fine-tuning LLM 70B+ параметров

### Что должно быть в резюме

- **LoRA / QLoRA** на моделях 7B, 13B, 32B, 70B — понимание rank, alpha, target modules, quantization
- **Full fine-tuning** vs PEFT — когда что выбирать, как измерить trade-off
- **Multi-node training** — DDP, FSDP, DeepSpeed ZeRO stages, tensor/pipeline parallelism
- **Continued pre-training** на домене — практика с 10B+ токенов специфического корпуса

### Наш стек

- Главная цель Phase 2: **continued pre-training DeepSeek-V3 685B (MoE, 37B active)** на 50–80B токенов корпуса EDRSR
- Proxy-цель для feasibility в Phase 1: LoRA fine-tune **DeepSeek-R1-Distill 70B** и **Qwen-32B** на 5–10K аннотированных пар Q&A

### Что проверим на pair-programming

- Вы тренировали 70B модель сами (не API wrap)?
- Сколько времени занял один training run, на каком hardware?
- Eval-методология: perplexity, downstream tasks, human preference?
- Как справились с memory fragmentation на multi-node?

---

## 2. Custom Embeddings Fine-tuning

### Что должно быть в резюме

- Bi-encoder архитектуры: BERT, MPNet, BGE, E5, jina-embeddings
- **Contrastive learning** — InfoNCE, triplet loss, MultipleNegativesRankingLoss
- **Hard negative mining** — BM25-based, vector-based, LLM-generated
- Domain adaptation: generative pseudo-labeling (GPL), MSMARCO transfer

### Наш стек

- **BGE-M3** как базовая модель (multi-vector: dense + sparse + ColBERT-style)
- Цель: fine-tune на \`(юридический тезис → релевантные решения)\` парах из нашего retrieval-лога
- Baseline: текущий Voyage AI — в 10 раз дороже в runtime за эквивалентное качество

### Что проверим

- Ваш последний embedding fine-tune — что тренировали, на каком датасете, каким loss?
- Как формируете hard negatives для юридического корпуса?
- Как измеряли улучшение — nDCG@10, MRR, Recall@k?

---

## 3. RLHF и Constitutional Alignment

### Что должно быть в резюме

- **Reward modeling** — Bradley-Terry, preference datasets, DPO/IPO/KTO
- **PPO variants** — TRL, RLHFlow, Nemotron-RL pipelines
- **Constitutional AI** — Anthropic-style self-critique, critique-revision loops
- **Adversarial RLHF** — multi-agent setups, red-teaming

### Наш стек

- **Constitutional RLHF с юридической жёсткой логикой** — правила из конкретных статей Конституции Украины (презумпция невиновности, право на судебную защиту, пропорциональность privacy) как формальные reward constraints, а не абстрактные этические принципы
- **Adversarial training**: три отдельные role-specific модели (advocate, prosecutor, judge), тренирующиеся друг против друга на симулированных делах
- 6 специализированных reward-моделей: General, Civil, Criminal, Administrative, Rare categories, Temporal

### Что проверим

- Вы делали RLHF с нуля — reward model train + PPO loop?
- Как боролись с reward hacking?
- Опыт с DPO как альтернативой PPO?

---

## 4. Cloud ML Infrastructure

### Что должно быть в резюме

- **Vertex AI** — Training, Pipelines, Model Registry, Endpoints
- **SageMaker HyperPod** — recipes для DeepSeek, Llama, Mistral
- **Kubernetes для ML** — Ray, Kubeflow, NVIDIA GPU Operator
- **TPU v5p / v5e** vs **H100/H200** vs **Trainium2** — практическое понимание, когда что

### Наш стек

- Phase 2 рассматриваем на **Vertex AI** (Google предлагает TPU v5p pods) или **SageMaker HyperPod + Trainium2** на AWS
- Inference: **L4** (Vertex) или **Inferentia2** (AWS) + **vLLM** для шардинга
- Запрос к обоим cloud: подсказать оптимальную конфигурацию для continued pre-training на 685B параметров

### Что проверим

- Вы запускали multi-node training на TPU v5p или H100 8-GPU cluster?
- Что делали, когда training job падал на 60% из-за OOM в одном воркере?
- Какие checkpointing стратегии использовали для fault tolerance?

---

## 5. Inference Optimization

### Что должно быть в резюме

- **vLLM, TGI, SGLang** — PagedAttention, continuous batching, speculative decoding
- **Quantization** — AWQ, GPTQ, FP8, INT8, INT4 для inference
- **Distillation** — TinyLlama-class модели для high-volume роутинга
- **KV-cache optimization** — prefix caching, chunked prefill

### Наш стек

- Цель TTFT: **<500ms** на production inference
- Peak concurrent users: **500–1,000**
- Input: 8–16K tokens, Output: 2–8K tokens (средний legal query с контекстом)
- Stack: **vLLM** + **FP8 quant** + **prefix cache**, fallback — Bedrock Claude для reasoning-overflow

### Что проверим

- Как бы вы снизили TTFT с 1.2s до 400ms на 70B модели?
- Когда distillation лучше quantization?
- Prefix caching — реальная экономия на нашем workload?

---

## 6. Retrieval, RAG и Citation Verification

### Что должно быть в резюме

- **pgvector** vs **Qdrant** vs **Milvus** — практический выбор под масштаб
- **HNSW tuning** — M, ef_construction, ef_search, quantization
- **Hybrid search** — BM25 + dense, reranking с cross-encoders
- **Citation grounding** — проверка цитат в базе вместо галлюцинации

### Наш стек

- **Qdrant** + **pgvector** (дублирование для консистентности)
- **65M векторизованных** решений из 100M полнотекстовых (1.17 TB PostgreSQL)
- Цель Phase 3: **citation verification model** — отдельная модель, которая cross-references каждый выход основной модели против нашей БД, чтобы не пропустить сфабрикованную цитату статьи кодекса

### Что проверим

- Вы строили retrieval на масштабе 10M+ документов?
- Как боретесь с false positives в recall?
- Цитатная верификация — ваш подход?

---

## 7. Capacity Planning и Cost Modeling

### Что должно быть в резюме

- Расчёт **TFLOPS-часов** для training run заданного размера
- GPU-hours vs TPU-hours — когда что экономичнее для workload
- **Cost-per-token** для inference с учётом utilization, batching, quantization
- Облачный арбитраж: Vertex AI vs SageMaker vs Nebius vs on-prem

### Наш стек

- Total estimated cloud spend: **$195K–$265K** за 12 месяцев
- Phase 1 ~$15K (fine-tune), Phase 2 ~$80–120K (continued pre-training), Phase 3 ~$100–130K (train + inference)
- Параллельные переговоры с Google Cloud, AWS, Nebius о sponsor-credits

### Что проверим

- Вы делали capacity plan для реального проекта?
- Как бы вы убедили CFO поднять бюджет на 30%?
- Где ваша точка пересечения между commercial LLM (Claude Bedrock) и self-hosted?

---

## 8. Evaluation Methodology

### Что должно быть в резюме

- **LLM-as-a-judge** с калибровкой по человеческим оценкам
- **Domain benchmarks** — LegalBench, CaseHOLD, не только MMLU
- **Hallucination measurement** — для моделей с factcheck (как наш)
- **Preference rate** vs baselines — Harvey-style метрика: "% времени, когда юрист выбирает наш ответ над GPT-4"

### Наш стек

- Целевые метрики Phase 3:
  - **>95% preference rate** vs GPT-4o на юридических задачах
  - **<0.2% hallucination rate** (через citation verification)
  - **>85% citation accuracy** — правильно ли модель сослалась на конкретные статьи
- Evaluation panel: 20+ практикующих украинских адвокатов

### Что проверим

- Какие eval-пайплайны вы строили?
- Как боролись с judge-bias в LLM-as-a-judge?
- Делали human eval на scale, как организовывали?

---

## 9. Data Engineering для больших корпусов

### Что должно быть в резюме

- **Deduplication at scale** — MinHash, SimHash, fuzzy dedup на 100M+ документов
- **Filtering pipelines** — quality scoring, PII detection, toxic content
- **Tokenization** — BPE, tiktoken, domain-specific vocabularies
- **Chunking** — семантический, sliding window, document-aware (например, по статьям юридических документов)

### Наш стек

- **EDRSR**: 100.5M решений, 1.17 TB — нужен dedupe (много бойлерплейта)
- **Dutch courts**: 488K полных текстов с rechtspraak.nl для cross-jurisdiction transfer
- **Legislation**: 76K секций с Верховной Рады, связаны с case law
- Собственный \`SemanticSectionizer\` для разбивки документов на логические секции (статьи, части, пункты)

### Что проверим

- Вы делали dedup на 10M+ docs?
- Как подходили к filtering, чтобы не выкинуть полезные edge cases?
- Чанкинг юридических документов — ваши подходы?

---

## Bonus: что мы НЕ ищем

- Kaggle medals без production ML опыта
- "Prompt engineer" без fine-tuning рук
- Чисто академический research без ship-it-to-prod истории
- Сертификаты Coursera как единственное доказательство навыков

---

## Как начать

Если вы чувствуете уверенность хотя бы в 4 из 9 пунктов выше — напишите на \`vladimir@legal.org.ua\`. Покажите:

1. **Один training run**, которым гордитесь — что тренировали, на каком datascale, какие метрики
2. **Один inference-optimization win** — что уменьшили, на сколько, как
3. Почему вам интересен юридический домен — честно, без пафоса

Мы отвечаем в течение 48 часов. Первый шаг — pair-programming на реальной ML-задаче из нашего backlog (Бакет 2 в предыдущей статье).

---

**Открытое репо:** https://github.com/overthelex/secondlayer
**Issues для контрибьюторов:** https://github.com/overthelex/secondlayer/labels/good-first-issue
**Контакт:** vladimir@legal.org.ua

---

*Claude Code welcome. Но ответы на технические вопросы — ваши, не агента.*`,
  },
  'tasks-for-independent-contributors': {
    title: 'Что мы делегируем независимым разработчикам: PR вместо собеседования, Claude Code приветствуется',
    punchline: 'Конкретные бакеты задач, ждущие контрибьюторов: OpenData-адаптеры, ML-эксперименты, frontend, performance, тесты. Наше единственное "собеседование" — ваш первый pull request. AI-assisted код приветствуется — мы сами ежедневно пишем с Claude Code.',
    readTime: '8 мин',
    content: `# Что мы делегируем независимым разработчикам: PR вместо собеседования, Claude Code приветствуется

*В предыдущей статье мы объявили, что открываем LEX AI как open source. Теперь конкретика: какие задачи в бэклоге, как они оформлены, почему единственное "собеседование" у нас — первый pull request, и почему мы любим Claude Code.*

---

## PR вместо собеседования

Мы не верим в LeetCode, HackerRank и трёхчасовые собесы с whiteboard-алгоритмами. Это тестирует способность решать задачи под стрессом — а не способность доставлять рабочий код в реальную кодовую базу.

Наш фильтр проще: возьмите issue с меткой \`good-first-issue\` или \`help-wanted\`, сделайте PR, пройдите review. Это и есть наше "собеседование". Только с реальным результатом, который остаётся в проде — и с оплатой, если задача в прайс-листе.

Если PR прошёл — мы уже знаем, что:

- Вы читаете чужой код и попадаете в стиль проекта
- Вы пишете TypeScript без костылей и \`any\`-кастов
- Вы локально тестируете изменения до push
- Вы ревьюите себя до того, как отправить
- Вы спокойно обсуждаете в PR-комментариях

Больше нам ничего не нужно. Дальше — контракт, ставка, объём.

---

## Мы сами пишем с Claude Code. AI-assisted PR'ы приветствуются

Мы не против AI-написанного кода. Наоборот — сами ежедневно отправляем в прод десятки PR'ов, написанных вместе с **Claude Code**. Наш CI/CD включает Claude-агентов, которые автоматически чинят падающие билды на каждом push в main. Так что ваш workflow с Cursor, Claude Code, Copilot или Codex — не проблема, а скорее плюс.

Что мы проверяем:

- Вы понимаете **каждую строку**, которую отправляете — даже если её сгенерировал агент
- Вы локально протестировали изменения (\`docker compose up\`, не "агент сказал что норм")
- Вы не вставляете generic React-код, не вписывающийся в архитектуру
- Вы удаляете мёртвый код и placeholder-комментарии перед commit

LLM-помощник — такой же инструмент, как IDE. Он не делает вас худшим инженером и не делает лучшим — он только ускоряет того, кем вы уже являетесь.

---

## Бакет 1 — OpenData-адаптеры и ETL

У нас интегрированы 15+ государственных источников: EDRSR, Верховная Рада, НАПК, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL, World Bank. Нужны следующие:

- **Европейские суды:** rechtspraak.nl (Нидерланды, частично), justice.cz (Чехия), domstol.se (Швеция), curia.europa.eu (Суд ЕС)
- **Регуляторные реестры:** FINMA (Швейцария), BaFin (Германия), AFM (Нидерланды), CSSF (Люксембург)
- **LATAM:** DNRPA (Аргентина), JusBrasil (Бразилия), InfoTec (Мексика)
- **Sanctions delta-sync:** инкрементальная синхронизация OFAC с диффами вместо полного download

Типичная задача — 3–5 дней:

1. Написать адаптер в \`services/opendata-importers/importers/\`
2. Добавить checkpoint + resume logic (base class уже есть)
3. Написать тест с fixture
4. Добавить в scheduler конфиг

**Стек:** Python 3.11 async или Node.js, PostgreSQL COPY, shared base/checkpoint/http_client/ip_pool уже готовы.

---

## Бакет 2 — ML эксперименты

Самое интересное и дорогое. Ищем контрибьюторов на:

- **LoRA fine-tuning** jurisdiction-specific моделей (гражданская, уголовная, административная) на 1–10M аннотированных пар Q&A
- **Custom embeddings** — fine-tune BGE-M3 на парах \`(юридический тезис, релевантное решение)\` из нашего retrieval-лога
- **Citation verification** — отдельная модель, проверяющая действительно ли цитируемая статья кодекса содержит заявленный текст
- **Router model** — классификатор "какой tool вызвать" на основе запроса, заменяющий текущий rule-based gateway

**Стек:** HuggingFace, PyTorch, vLLM, optional Vertex AI / SageMaker. GPU выделяем из credit-пула Google Cloud / AWS.

Оплата: фикс + бонус за достижение метрики (например, >X% preference rate vs baseline).

---

## Бакет 3 — Frontend и UX

lexwebapp — React 19 + Vite + TailwindCSS + Zustand + TanStack Query. Ждут:

- **Evidence panel refactor** — результаты поиска должны рендериться в правой панели, не в чате (несколько issues открыто)
- **Дифф-вьюер для судебных решений** — side-by-side сравнение двух решений с подсветкой схожих частей
- **Timeline view** — хронология дел по одной стороне (ФОП / ООО)
- **Dashboard для юрфирм** — многопользовательский view на дела команды
- **Accessibility audit** — WCAG AA для всех ключевых страниц

Сложность — от **3-дневной задачи** (timeline view) до **2-недельного проекта** (dashboard).

---

## Бакет 4 — Performance и infra

- **PostgreSQL оптимизация** — база 1.17 TB, некоторые запросы 5–10 с; нужно партиционирование по годам для таблицы \`cases\`
- **pgvector HNSW tuning** — 65M векторизованных решений, оптимизация ef_search vs recall
- **Redis cache layer** — фронт-кэш для тяжёлых агрегаций статистики дел по юрисдикциям
- **Docker image slimming** — некоторые образы 2 GB, нужен multi-stage + distroless
- **CI/CD ускорение** — local runner собирает монорепо 12 мин, цель — 4 мин

---

## Бакет 5 — Тесты и документация

- **Playwright E2E** для критических flows: регистрация → Diia-auth → поиск → экспорт → платёж
- **Jest coverage** для \`services/\` в mcp_backend (сейчас ~45%, цель — 75%)
- **OpenAPI spec** для HTTP API всех трёх MCP-серверов
- **Architecture diagrams** в Mermaid в \`docs/\`
- **API examples** на Python / cURL / JS для разработчиков

Это идеальные задачи для первого PR. Низкий риск, быстрый review, мы всегда на связи.

---

## Что мы НЕ делегируем

Чтобы не было непониманий:

- **Продуктовые промпты** — живут в закрытом \`secondlayer-core\`
- **Бизнес-логику биллинга** — Monobank callback handlers, credit deduction, subscription tier resolution
- **Anti-abuse эвристики** — rate-limiting стратегии, поведенческий анализ
- **Прямой контакт с клиентами** — enterprise-юрфирмы, гос-партнёры
- **Юридические решения в контенте** — что модель отвечает по чувствительным темам (это вместе с юристами)

Всё остальное — честная игра.

---

## Как начать

1. **Клонируйте** \`github.com/overthelex/secondlayer\`, запустите \`docker compose -f docker-compose.local.yml --env-file .env.local up -d\`
2. **Посмотрите issues** с метками \`good-first-issue\`, \`help-wanted\`, \`bounty\`
3. **Напишите комментарий** в issue, что берёте задачу (чтобы не дублироваться)
4. **Сделайте PR** — ревью в течение 48 часов
5. **Получите оплату** — UAH банком или USDT, если задача с прайсом

Для ML-, OSINT- или performance-задач — рекомендуем сначала открыть Discussion, чтобы синхронизироваться по подходу. Иначе риск сделать PR, который мы попросим переделать.

---

## FAQ

**Q: А если я новичок и никогда не делал PR в open source?**
A: Есть Бакет 5 (тесты и документация). Первый PR на дополнение README или новый Playwright-тест — отличная точка входа. Поможем с ревью и советом.

**Q: Как с оплатой?**
A: Перед тем как брать задачу, проверьте есть ли у неё метка \`bounty\` или \`paid\`. Если да — сумма в описании. Иначе это community-contribution без оплаты, но с упоминанием в CHANGELOG и credit в README.

**Q: Можно взять большую ML-задачу как первый вклад?**
A: Лучше нет. Начните с задачи на 1–3 дня, чтобы мы оба посмотрели как вам работается с нашим кодом. Дальше — всё ваше.

**Q: Подпишете NDA?**
A: Если задача из \`secondlayer-core\` — да, простой mutual NDA. Для open-source задач NDA не нужен.

---

**Открытое репо:** https://github.com/overthelex/secondlayer
**Issues для контрибьюторов:** https://github.com/overthelex/secondlayer/labels/good-first-issue
**Discussions:** https://github.com/overthelex/secondlayer/discussions
**Контакт:** vladimir@legal.org.ua

---

*Пишите PR, а не cover letter.*`,
  },
  'open-source-welcome-engineers': {
    title: 'Открываем двери: ищем независимых AI/ML инженеров и open-source контрибьюторов',
    punchline: 'LEX AI открывает платформу как open source. Приглашаем сильных инженеров — AI/ML, backend, data, frontend — подключаться контрибьюторами или присоединяться к команде. Что уже открыто, кого ищем, и как подключиться.',
    readTime: '6 мин',
    content: `# Открываем двери: ищем независимых AI/ML инженеров и open-source контрибьюторов

*LEX AI строится с 2024 года небольшой командой. Сейчас мы открываем часть платформы как open source и приглашаем независимых инженеров — как контрибьюторов и будущих членов команды.*

---

## Что такое LEX AI

LEX — украинская юридическая AI-платформа. Семантический поиск по 100+ млн судебных решений (EDRSR — крупнейший открытый реестр судебных решений в Европе), законодательство от Верховной Рады, OSINT и due diligence, консультации, биллинг. Весь стек собран как MCP (Model Context Protocol) серверы за унифицированным gateway.

Наш второй продукт — **Panoptic** (panoptic.com.ua) — OSINT-платформа, агрегирующая 18+ источников intelligence-данных: санкции, корпоративное владение, credential breaches, IP/domain reputation, GDELT, INTERPOL, World Bank Debarment.

Строим уровень качества Harvey.ai для украинской юриспруденции на открытых моделях — DeepSeek-V3, Llama, Qwen — потому что данные уникальны (такого корпуса в ЕС нет), а open-weight модели после continued pre-training дают 90%+ от flagship LLM на доменных задачах за долю стоимости.

---

## Структура наших репозиториев

Мы поддерживаем два репозитория — и это важно понимать с самого начала.

### 1. \`overthelex/secondlayer\` — публичный, open source

Основное монорепо, теперь публичное:

**https://github.com/overthelex/secondlayer**

Почти вся платформа там:

- Три MCP-сервера (\`mcp_backend\`, \`mcp_rada\`, \`mcp_openreyestr\`) — судебная практика, парламент, бизнес-реестры
- Веб-фронтенд (\`lexwebapp\`) — React 19, Vite, TailwindCSS, Zustand, TanStack Query
- Shared TypeScript-пакет (\`packages/shared\`) — LLM manager, logger, cost tracker, SSE handler, database base class
- Developer Console (\`platform\`) — **platform.legal.org.ua**, портал для разработчиков: API ключи, документация, примеры интеграций
- Data importers для 340M+ записей из 15 государственных API — EDRSR, Верховная Рада, НАПК, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL, World Bank
- Полный CI/CD — self-hosted GitHub Actions runner, blue-green deploy через SSH, Claude Code auto-fix агенты для падающих билдов
- Вся deployment-конфигурация — Docker Compose локально, blue-green compose на проде, nginx, manage-gateway script
- Playwright E2E + Jest/Vitest unit tests
- Миграции для трёх PostgreSQL-инстансов
- Внутренняя документация, архитектурные заметки

Клонируйте, читайте, запускайте локально. Всё необходимое для рабочего инстанса — там.

### 2. \`overthelex/secondlayer-core\` — приватный, closed source

Отдельный репозиторий, который мы сознательно оставляем приватным. Содержит:

- **Логику чата и оркестрации** — как запросы пользователя классифицируются, маршрутизируются между tools и компонуются в многошаговые ответы
- **Продуктовые промпты** — конкретные шаблоны, few-shot примеры, system messages для классификации, суммаризации, проверки цитат, выбора tool
- **Биллинг и бизнес-логику платежей** — правила списания кредитов, разрешение тарифов подписок, Monobank callback handlers
- **Anti-abuse и rate-limiting эвристики**, которые мы не хотим раскрывать адверсариям

Это минимальная закрытая поверхность, которая защищает наше продуктовое позиционирование без торможения открытых частей. **Вся "chat logic" — prompt engineering, tool orchestration, каскадирование моделей, композиция ответов — живёт здесь, и она не публичная.** Открытый репозиторий ожидает этот слой как зависимость, но поставляет полнофункциональные stub-реализации для контрибьюторов.

Если вы присоединяетесь к команде — получаете доступ к \`secondlayer-core\` с первого дня. Если контрибьютите извне — работаете с открытым репо и стабами, что уже покрывает всё кроме продуктового prompt engineering.

---

## Кого ищем

Мы не нанимаем по названию должности. Мы ищем людей, которые уже делают сильные вещи — и хотят делать их на осмысленном домене, с реальными данными и реальными пользователями.

**AI/ML engineers:**

- LoRA fine-tuning больших моделей (70B+), continued pre-training
- Embeddings fine-tuning (BGE-M3, custom encoders) для ретривала
- RLHF, constitutional alignment, adversarial training setups
- Практика с Vertex AI / SageMaker HyperPod / Trainium / TPU v5p на multi-node clusters
- Retrieval-augmented generation, citation verification, hallucination guards

**Backend / distributed systems:**

- PostgreSQL на миллиарды строк (pgvector, partitioning, TOAST-оптимизации)
- Event-driven архитектуры, очереди, репликация, PgBouncer
- MCP servers, tool orchestration, LLM gateways, cost tracking

**Data engineering / OSINT:**

- Scraping на scale (rate-limiting, прокси-ротация, resume logic, checkpointing)
- ETL для государственных открытых реестров
- Sanctions screening, KYC/AML, due diligence pipelines

**Frontend:**

- React 19 + TypeScript на продакшн-уровне
- Сложный UI для юридической аналитики (data-heavy dashboards, evidence panels)
- Ukrainian i18n, accessibility, performance optimization

---

## Философия

- **Открыто всё, что не ломает бизнес.** Мы не скрываем архитектуру — она не является конкурентным преимуществом. Преимущество — данные, доменное качество моделей и скорость итераций.
- **Прагматизм важнее хайпа.** Distributed monolith сегодня может быть правильным ответом. Микросервисы ≠ добродетель. Фреймворк ≠ ответ на задачу.
- **Юридическая сфера заслуживает серьёзной AI-разработки.** Не "чатбот с законами", а настоящее моделирование юриспруденции: конституционное alignment, проверка цитат, юрисдикционная специализация.
- **Open source по умолчанию.** Если код не содержит проприетарных промптов, API-ключей или клиентских данных — он публичный.

---

## Как подключиться

**Как contributor:**

1. Посмотрите открытые issues на GitHub (\`github.com/overthelex/secondlayer\`)
2. Предложите PR — ревью в течение 48 часов
3. Для крупных изменений — откройте discussion первым

**Как кандидат на роль:**

Напишите на \`vladimir@legal.org.ua\` с кратким резюме. Cover letter на страницу не нужен — покажите три вещи:

1. Что делали раньше (GitHub, ссылка на конкретный проект с деталями)
2. Почему интересен именно этот домен — юридическая AI, open data, OSINT
3. Что хотите построить в ближайшие 6 месяцев

Мы отвечаем быстро. Interview — техническая дискуссия (без LeetCode), pair-programming сессия на реальной задаче из бэклога, coffee chat с командой.

---

## Наше обещание

- **Полностью remote.** Команда распределена по Европе.
- **Без micromanagement.** Доверие по умолчанию. Результат важнее присутствия в Slack.
- **Prod-доступ с первого дня.** Никаких "испытательных месяцев" в read-only.
- **Бюджет на вычисления.** Если для идеи нужен GPU-кластер — мы говорим с Google Cloud, AWS, Nebius и находим ресурс.
- **Публикации под вашим именем.** Ваша работа — ваша заслуга. Мы не скрываем контрибьюторов.

---

## О контексте

Сейчас мы в активных переговорах с Google Cloud и AWS о sponsorship на 12-месячный ML training план ($195K–$265K, DeepSeek-V3 685B continued pre-training на 50–80B токенов корпуса EDRSR). Есть платящие пользователи и B2B-клиенты. Не startup-в-гараже и не очередной enterprise-клон. Что-то посередине — и это делает работу интересной.

Если вас зажигает идея построить реальную AI-инфраструктуру для юриспруденции на крупнейшем открытом корпусе судебных решений в Европе — давайте поговорим.

---

**Открытое репо:** https://github.com/overthelex/secondlayer
**Закрытый core (chat logic):** \`overthelex/secondlayer-core\` — приватный, предоставляется при найме
**Контакт:** vladimir@legal.org.ua
**Сайт:** https://legal.org.ua`,
  },
  'security-audit-gdpr-owasp': {
    title: 'Безопасность LEX AI: GDPR-аудит, 10 исправлений и 7 уровней защиты',
    punchline: '5 параллельных white-hat агентов проверили платформу на соответствие GDPR и OWASP Top 10. Нашли 23 уязвимости — от SQL-инъекций до Google Ads без consent. Исправили 10 критичных за одну сессию. Полная архитектура безопасности: Cloudflare, TLS 1.3, CSP, rate limiting, WebAuthn, E2EE.',
    readTime: '15 мин',
    content: `# Безопасность LEX AI: GDPR-аудит, 10 исправлений и 7 уровней защиты

Юридическая платформа обрабатывает самые чувствительные данные: судебные дела, контракты, персональную информацию клиентов. Безопасность — не фича, а фундамент. Мы провели полный security audit силами 5 параллельных AI-агентов и исправили все критические находки за одну сессию.

Эта статья — прозрачный разбор: что нашли, что исправили, и как устроена полная архитектура защиты LEX AI.

---

## Как проводили аудит

Вместо классического ручного пентеста мы запустили **5 специализированных white-hat агентов параллельно**, каждый со своей зоной ответственности:

| Агент | Фокус | Файлов проверено |
|-------|-------|------------------|
| 🔍 Data Collection | Cookie consent, трекинг, OAuth scopes | 42 |
| 💾 Data Storage | БД-схемы, retention, Redis, Qdrant, MinIO | 53 |
| 👤 User Rights | GDPR Art. 15-22 (доступ, удаление, портабельность) | 25 |
| 🛡️ OWASP Top 10 | Injection, XSS, Auth, CORS, CSRF, rate limiting | 45 |
| 🌐 Data Transfers | Third-party API, sub-processors, cross-border | 48 |

---

## Что нашли: 23 уязвимости

### Критические (исправлены)

**1. Google Ads загружался ДО cookie consent** — скрипт выполнялся при каждой загрузке страницы до показа баннера. Исправлено: динамическая загрузка только после согласия + Google Consent Mode v2.

**2. JWT Secret с fallback на известную строку** — несколько файлов содержали предсказуемый fallback-секрет. Исправлено: приложение крашится при старте без переменной окружения. Fallback удалён.

**3. SQL Injection через интерполяцию параметров** — параметры вставлялись напрямую в SQL строку. Исправлено: все запросы переведены на параметризованные плейсхолдеры.

### Высокие (исправлены)

**4–10:** Конверсионный трекинг без consent, Nginx CORS отражал любой Origin (заменён на строгий whitelist), XSS через dangerouslySetInnerHTML (добавлен DOMPurify), динамические SQL таблицы без whitelist (добавлен allowlist), cleanup-функции никогда не запускались (добавлены cron-задачи), email в логах в plaintext (добавлена маскировка), OAuth регистрация без rate limiting (добавлен лимит по IP).

---

## 7 уровней защиты LEX AI

### Уровень 1: Cloudflare — DDoS Protection, WAF, Bot Management, Origin CA
### Уровень 2: TLS 1.3 — ECDHE Forward Secrecy, HSTS 1 год
### Уровень 3: Nginx — Security Headers (HSTS, X-Frame-Options, CSP, Referrer-Policy)
### Уровень 4: Express.js — Multi-layer rate limiting по IP и User ID
### Уровень 5: Аутентификация — 6 методов (Password, Google OAuth, WebAuthn, Diia, OIDC, API Keys)
### Уровень 6: База данных — PgBouncer + SCRAM-SHA-256, Docker network isolation
### Уровень 7: GDPR — Export/Delete/Portability, Cookie Consent, E2EE (AES-256-GCM + X25519)

---

## Выводы

1. **AI-агенты для security audit** — 5 параллельных агентов покрыли больше поверхности атаки за 3 минуты, чем ручной review за день
2. **Defense in depth работает** — ни одна уязвимость не давала полный доступ
3. **GDPR — это код, не документ** — права пользователей должны быть реализованы в коде
4. **Прозрачность строит доверие** — мы публикуем результаты аудита открыто

Все исправления: PR [#1224](https://github.com/overthelex/secondlayer/pull/1224).

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'attorney-marketplace': {
    title: 'Маркетплейс юридических консультаций: от реестра ЕРАУ до оплаты через Monobank',
    punchline: 'Верификация адвоката через реестр ЕРАУ за 2 секунды. Онбординг в 3 шага. Запрос консультации с документами из хранилища. Real-time чат между клиентом и адвокатом. Escrow-платёж через Monobank. 10% комиссия платформы. Полный цикл — от «мне нужен адвокат» до оплаченной консультации.',
    readTime: '9 мин',
    content: `# Маркетплейс юридических консультаций: от реестра ЕРАУ до оплаты через Monobank

*Как мы построили полный цикл заказа юридической консультации — от верификации адвоката до escrow-платежа.*

---

## Проблема: найти адвоката сложнее, чем кажется

Клиент ищет адвоката. Что он делает? Гуглит. Спрашивает знакомых. Заходит на сайты юридических фирм. Нет единого места, где можно увидеть верифицированных адвокатов, сравнить специализации, прочитать отзывы и сразу заказать консультацию.

Со стороны адвоката тоже боль: нужен сайт, SEO, обработка запросов вручную, согласование времени, выставление счетов. Вместо юридической работы — администрирование.

## Архитектура: 6 компонентов

| Компонент | Что делает |
|-----------|----------|
| **Интеграция с ЕРАУ** | Верификация через реестр адвокатов |
| **Онбординг** | 3-шаговый модал создания профиля |
| **Поиск адвокатов** | Фильтры по специализации, региону, цене |
| **Запрос консультации** | 4-шаговый флоу с документами |
| **Real-time чат** | SSE-based сообщения |
| **Escrow-платёж** | Monobank с удержанием до завершения |

## Шаг 1: Верификация через ЕРАУ

ЕРАУ — Единый реестр адвокатов Украины. Наша интеграция работает так:

1. Адвокат вводит фамилию
2. Запрос летит к \`erau.unba.org.ua/search\`
3. Результат кешируется: Redis (24 часа) → PostgreSQL (бессрочно)
4. При ошибке внешнего API — fallback на PostgreSQL кеш

Что получаем: фамилию, имя, отчество, номер свидетельства, дату выдачи, региональную палату. Этого достаточно для верификации — адвокат точно есть в реестре Национальной ассоциации.

Кеширование критично. API ЕРАУ нестабилен и медленный (timeout 15 секунд). После первого поиска — ответ за миллисекунды из кеша.

## Шаг 2: Онбординг в 3 шага

**Шаг 1** — Приветствие. Что даёт профиль на платформе, как работает верификация.

**Шаг 2** — Поиск в ЕРАУ. Адвокат ищет себя по фамилии, выбирает из списка. Данные подтягиваются автоматически: номер свидетельства, дата, региональная палата.

**Шаг 3** — Заполнение профиля. Специализации (до 5), типы судов, регион, языки, тарифы (консультация, почасовая ставка, представительство), био.

Профиль сохраняется в таблице \`attorney_profiles\` с привязкой к \`users\` и \`organizations\`.

### Pricing Tier с маркапом 30%

Для адвокатов — отдельный тарифный план:

| | Базовый | Адвокатский |
|---|---|---|
| Цена | $9/мес | $49/мес |
| Маркап MCP инструментов | 0% | 30% |
| Лимиты | ₴415/₴4150 | ₴2075/₴20750 |
| Поддержка | 48 часов | 12 часов |
| Trial | 7 дней | 14 дней |

30% маркап покрывает дополнительные затраты на глубокий юридический анализ, который адвокаты используют для клиентских дел.

## Шаг 3: Поиск адвокатов

Клиент видит каталог с фильтрами:

- **Специализация** — гражданское, уголовное, хозяйственное, семейное...
- **Регион и город** — с возможностью дистанционной работы
- **Тип суда** — местный, апелляционный, кассационный
- **Ценовой диапазон** — мин/макс за консультацию
- **Рейтинг** — от минимальной оценки
- **Бесплатная первая консультация** — да/нет
- **Языки** — украинский, английский и т.д.

Сортировка: по рейтингу, цене, опыту, количеству консультаций.

Карточка адвоката: фото, имя, специализации (теги), рейтинг (звёзды + количество отзывов), цена консультации, кнопка «Заказать консультацию».

## Шаг 4: Запрос консультации

4-шаговый модал:

**Детали** — тип (консультация / представительство / анализ документов), заголовок, описание, срочность (low / normal / high / urgent).

**Документы** — DocumentPicker позволяет выбрать документы из хранилища (vault). Адвокат увидит их после принятия запроса.

**Подтверждение** — обзор всего перед отправкой.

**Оплата** — mock Monobank (пока что 2-секундная задержка → успех).

### Статусы консультации

\`\`\`
pending → accepted → paid → in_progress → completed
           ↘ declined    ↘ cancelled      ↘ disputed
\`\`\`

Адвокат видит pending-запросы с бейджем "unseen". Может принять (с опциональным изменением цены) или отклонить (с указанием причины).

## Шаг 5: Real-time чат

После оплаты открывается чат между клиентом и адвокатом. Реализация:

- **MessageBus** — EventEmitter с подпиской на \`msg:{consultationId}\`
- **SSE стрим** — \`GET /api/consultations/:id/messages/stream\`
- Heartbeat каждые 30 секунд
- Автоматическая маркировка прочитанных
- Счётчик непрочитанных

Тип сообщений: \`text\`, \`system\` (статусные изменения), \`file\`.

## Шаг 6: Escrow-платёж

Модель платежа защищает обе стороны:

1. Клиент платит → деньги \`held\` (удержаны)
2. Адвокат проводит консультацию
3. Консультация завершена → деньги \`released\` адвокату
4. Если отменено → \`refunded\` клиенту

**Распределение:**
- 90% — адвокату
- 10% — комиссия платформы

## Matter Access

Когда консультация оплачена, адвокат автоматически получает роль \`consultant\` по делу клиента — read-only доступ к документам. После завершения — доступ отзывается.

Это работает через существующую систему matter segregation: адвокат видит только документы того дела, по которому заказана консультация.

## Отзывы

После завершения клиент может оставить отзыв:
- Общая оценка (1-5 звёзд)
- Breakdown: коммуникация, знания, профессионализм, ценность
- Обновляет \`average_rating\` и \`rating_count\` в профиле адвоката

Полный цикл — от «мне нужен адвокат» до оплаченной консультации с отзывом. Без звонков, без email, без согласования вручную.`,
  },
  'mcp-tokens-claude-desktop': {
    title: 'MCP-токены и интеграция с Claude Desktop: юридический AI на вашем рабочем столе',
    punchline: 'Один токен. Одна команда. 56 юридических AI-инструментов прямо в Claude Desktop. Поиск судебной практики, анализ законодательства, проверка контрагентов — без открытия браузера. Создайте токен в профиле, вставьте команду в терминал, и LEX AI становится расширением вашего рабочего стола.',
    readTime: '5 мин',
    content: `# MCP-токены и интеграция с Claude Desktop: юридический AI на вашем рабочем столе

*Один токен. Одна команда. 56 юридических инструментов на вашем рабочем столе.*

---

## Что такое MCP и почему это важно

MCP (Model Context Protocol) — открытый стандарт, который позволяет AI-ассистентам использовать внешние инструменты. Claude Desktop, Claude Code, Jan AI и другие клиенты поддерживают MCP «из коробки».

Это значит: вы можете подключить LEX AI как расширение к Claude Desktop и получить доступ к 56 юридическим инструментам прямо в чате с Claude.

## Что вы получаете

56 инструментов через один токен:

| Категория | Инструменты | Пример |
|-----------|-------------|---------|
| **Судебная практика** | Поиск, анализ, сравнение | «Найди практику ВС по ст. 625 ГК за 2025 год» |
| **Законодательство** | 12 кодексов, 5 191 статья | «Покажи статью 203 ГК с комментарием» |
| **Due Diligence** | 16 реестров | «Проверь ООО по ЕГРПОУ 12345678» |
| **Парламент** | Законопроекты, депутаты | «Статус законопроекта 6489» |
| **Документы** | Хранилище, анализ | «Проанализируй загруженный договор» |

## Как подключить: 3 минуты

### Шаг 1: Создайте токен

Откройте профиль на legal.org.ua → раздел «MCP Access Tokens» → «Создать токен».

Введите название (например, «Claude Desktop — рабочий ноут»). Токен покажется один раз — скопируйте и сохраните.

Формат токена: \`sl_xB9kL2mN4pQ7rS1tU5vW3xY8zA0bC_d4e5f6g7\` — 44 символа с контрольной суммой.

### Шаг 2: Добавьте в Claude Code

Откройте терминал и выполните:

\`\`\`bash
claude mcp add secondlayer \\
  --transport sse \\
  --url https://mcp.legal.org.ua/v1/sse \\
  --header "Authorization: Bearer ВАШ_ТОКЕН"
\`\`\`

Для Claude Desktop — добавьте в конфиг \`claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "secondlayer": {
      "url": "https://mcp.legal.org.ua/v1/sse",
      "headers": {
        "Authorization": "Bearer ВАШ_ТОКЕН"
      }
    }
  }
}
\`\`\`

### Шаг 3: Пользуйтесь

Откройте Claude Desktop. Напишите: «Найди практику Верховного Суда по признанию сделки недействительной по ст. 203 ГК».

Claude увидит 56 доступных инструментов, выберет нужные, выполнит поиск и выдаст структурированный ответ — с номерами дел, датами, судами, статусами прецедентов.

## Безопасность токенов

- **Один токен — один пользователь.** Все действия привязаны к вашему аккаунту.
- **Rate limits:** 60 запросов/минуту, 10 000/день. Достаточно для интенсивной работы.
- **Отзыв мгновенный.** Если токен скомпрометирован — удалите его в профиле, создайте новый.
- **Срок действия.** Опциональный — можно создать бессрочный или с датой окончания.
- **Аудит.** Каждое использование токена записывается: время, инструмент, стоимость.

Токен не хранится в открытом виде после создания — вы видите его только один раз.

## Что это даёт юристу

**Контекст рабочего стола.** Вы работаете с документом в VS Code или текстовом редакторе. Не переключаясь, спрашиваете Claude: «Есть ли судебная практика по этому пункту договора?» Claude использует инструменты LEX AI, находит практику, показывает результат — прямо рядом с вашим документом.

**Голосовые запросы.** Claude Desktop поддерживает голосовой ввод. Вы диктуете вопрос — получаете анализ со ссылками на реальные дела и статьи.

**Интеграция с файлами.** Перетащите договор в Claude Desktop. Попросите проанализировать риски с учётом актуальной судебной практики. Claude прочитает документ, найдёт релевантные дела через LEX AI и выдаст анализ.

## Сценарии использования

**Быстрая справка во время совещания.** Клиент спрашивает о сроках исковой давности для конкретного типа спора. Вы спрашиваете Claude — ответ со ссылками на статьи и практику ВС за 10 секунд.

**Подготовка искового.** «Найди 5 самых сильных прецедентов для взыскания упущенной выгоды по договору подряда». Claude выполняет серию поисков, фильтрует по инстанциям, возвращает решения со статусами.

**Due diligence на ходу.** «Проверь компанию ЕГРПОУ 31316518 — кто бенефициары, есть ли долги». Полная карточка за 2 секунды, не открывая браузер.

Один токен. 56 инструментов. Юридический AI — там, где вы работаете.`,
  },
  'round-robin-llm': {
    title: 'Почему мы отказались от Round-Robin между OpenAI и Anthropic',
    punchline: 'Мы интегрировали OpenAI и Anthropic с round-robin маршрутизацией. На архитектурной диаграмме это выглядело идеально. В продакшене это едва не убило наш продукт. Один и тот же промпт давал разные результаты в зависимости от провайдера. Дебаггинг 5-шагового агентного цикла? Это не инженерия — это археология. Мы всё вырезали. Захардкодили одного провайдера. Лучшая строка кода за год.',
    readTime: '8 мин',
    content: `# Почему мы отказались от Round-Robin между OpenAI и Anthropic — и что используем вместо

*Разработка юридической AI-платформы научила нас: мультипровайдерная LLM-маршрутизация отлично выглядит на архитектурных диаграммах, но ломается в продакшене.*

---

## Идея, которая имела идеальный смысл

Когда мы начали строить LEX AI — платформу для анализа миллионов украинских судебных решений — мы сделали то, что делает каждая AI-first команда: интегрировали несколько LLM-провайдеров.

OpenAI для структурированного вывода. Anthropic для глубокого юридического анализа. Round-robin между ними для устойчивости и оптимизации затрат.

На бумаге это выглядело элегантно. В продакшене это был кошмар.

## Что пошло не так

### 1. Фрагментация форматов ответов

Наш агентный пайплайн выполняет до 5 итераций tool-calling на каждый запрос пользователя. Каждая итерация ожидает нормализованный ответ: \`tool_calls\`, \`finish_reason\`, структурированный JSON.

OpenAI и Anthropic возвращают это по-разному. Мы построили слой нормализации. Он обрабатывал 90% случаев. Остальные 10% — пустые ответы, неполный JSON, неожиданные stop reasons — вызывали тихие сбои глубоко в цикле.

Один баг мы искали 3 дня: Anthropic иногда возвращал валидный ответ с \`stop_reason: "end_turn"\` вместо \`"tool_use"\`, который наш нормализатор пропускал дальше, но следующая итерация воспринимала как финальный ответ. Пользователь получал полуготовый анализ без какой-либо индикации, что что-то пошло не так.

### 2. Один промпт — два разных поведения

Юридический AI живёт и умирает от точности промптов. Наш системный промпт инструктирует модель действовать как украинский юридический ассистент, классифицировать намерения, выбирать инструменты и отвечать в структурированном формате.

Claude точнее выполнял инструкции на украинском языке. GPT генерировал более чистые JSON tool calls. Когда модель менялась на каждой итерации агентного цикла, качество результата становилось подбрасыванием монеты.

### 3. Дебаггинг превратился в археологию

Когда пользователь сообщал о плохом результате, мы смотрели на трейс:

- Шаг 1: OpenAI (классифицировал намерение)
- Шаг 2: Anthropic (сгенерировал план поиска)
- Шаг 3: OpenAI (выполнил инструменты)
- Шаг 4: Anthropic (синтезировал ответ)

Какой шаг сломался? Модель или нормализация? Можем ли воспроизвести? Нет — следующий запуск маршрутизирует иначе.

### 4. «Оптимизация» затрат, которой не было

Round-robin должен был балансировать затраты. Вместо этого:

- Цены Anthropic на глубокие аналитические запросы были в 2-3 раза выше эквивалента OpenAI
- Но Anthropic был дешевле на коротких запросах классификации
- Round-robin полностью это игнорировал — он просто чередовал

### 5. Два набора всего

Каждый провайдер имеет своё: rate limits, retry-стратегии, форматы ошибок, обновления SDK. Наш «унифицированный» retry-слой на самом деле был двумя retry-слоями в одном тренчкоте.

## Что мы делаем сейчас

Мы перешли на **strategy-based выбор провайдера** с OpenAI как основным и AWS Bedrock как альтернативой — и инвестировали сэкономленную сложность в **budget-aware выбор модели**:

| Бюджет | OpenAI | AWS Bedrock | Применение |
|--------|--------|-------------|-------------|
| quick | gpt-5-nano | Amazon Nova Micro | классификация, маршрутизация |
| standard | gpt-5-mini | Amazon Nova Lite | выполнение инструментов, суммаризация |
| deep | gpt-5.1 | Amazon Nova Pro | юридический анализ, извлечение паттернов |

Переменная \`LLM_PROVIDER_STRATEGY\` контролирует выбор: \`openai-first\` (дефолт) или \`bedrock-first\` (если есть AWS credentials). Один формат API. Одна обработка ошибок. Одна retry-логика. Предсказуемые затраты. Воспроизводимые результаты.

## Как правильно использовать несколько провайдеров

**Task routing, а не round-robin** — назначьте каждому провайдеру конкретные типы задач навсегда.

**Fallback, а не чередование** — Провайдер Б активируется только когда Провайдер А возвращает 429 или 500.

**Мультиключ одного провайдера** — несколько API-ключей от одного провайдера с ротацией для обхода rate limits.

## Почему AWS Bedrock меняет правила игры

| | Прямой API ключ | AWS Bedrock |
|---|---|---|
| Модели | Один провайдер | Claude + Llama + Mistral через один SDK |
| Безопасность | API key в .env | IAM roles, нет ключей в коде |
| Данные | Летят в облако провайдера | Остаются в вашем AWS регионе |
| Биллинг | Отдельные инвойсы | Единый счёт AWS |
| Rate limits | Жёсткие, per-key | Provisioned Throughput |

Тег \`@deprecated\` на нашем методе \`getNextProvider()\` — лучшая строка кода, которую мы написали за год.

---

## Эпилог: март 2026

Когда мы писали эту статью, fallback на Anthropic API был временным решением. В марте 2026 мы наконец закрыли эту главу: PR #722 заменил прямой Anthropic API на AWS Bedrock.

Что это дало на практике? Один SDK (\`@aws-sdk/client-bedrock-runtime\`) вместо двух клиентских библиотек. IAM-аутентификация вместо ротации API-ключей. Данные остаются в \`eu-central-1\` — наш DPO наконец перестал нервничать. Единый биллинг через AWS Cost Explorer вместо отдельных инвойсов от OpenAI и Anthropic.

Бюджетные тиры, о которых мы мечтали, теперь работают через Bedrock: \`quick\` идёт на Nova Micro, \`standard\` — на Nova Lite, \`deep\` — на Nova Pro. OpenAI остаётся primary для основного пайплайна, но весь fallback-цепочка теперь на AWS.

Получается, решение отказаться от round-robin было правильным не только тактически, но и стратегически. Мы не просто выбрали одного провайдера — мы выбрали инфраструктурную платформу, которая масштабируется вместе с продуктом. Тот \`@deprecated\` тег до сих пор в коде. Как напоминание.`,
  },
  'mcp-server-architecture': {
    title: 'Как мы построили MCP-сервер на 56 инструментов для юридического AI',
    punchline: 'Один endpoint. Три сервиса. 58 MCP-инструментов. Тройной транспорт: stdio для Claude Desktop, HTTP REST для веб-приложений, SSE для стриминга. Каждый tool call проходит 11-шаговый пайплайн с трекингом затрат на каждом этапе. Количество инструментов будет расти. Архитектуре всё равно.',
    readTime: '10 мин',
    content: `# Как мы построили MCP-сервер на 56 инструментов для юридического AI

*Один endpoint. Три сервиса. Тройной транспорт. Вот что нужно, чтобы построить продакшн MCP-сервер, который действительно масштабируется.*

---

## Проблема: юридический AI требует больше, чем один API-вызов

Когда юрист спрашивает «Негаторный или виндикационный иск при самовольном захвате земельного участка?» — ответ требует: поиска 200+ судебных решений, получения текстов статей ГК и ЗК, сравнения практики «за» и «против», проверки прецедентов, синтеза стратегической рекомендации.

Это не один вызов LLM. Это оркестрированный пайплайн из 5-7 tool calls.

## Архитектура: 56 инструментов, три сервиса, один шлюз

| Сервис | Инструменты | Домен |
|--------|-------------|-------|
| **mcp_backend** | 36 | Судебные решения, законодательство, семантический поиск, документы, due diligence |
| **mcp_rada** | 4 | Парламент — законопроекты, депутаты, голосования |
| **mcp_openreyestr** | 16 | Государственный реестр — юридические лица, бенефициары, должники |

Одна переменная окружения — \`ENABLE_UNIFIED_GATEWAY=true\` — превращает бэкенд в точку агрегации.

## Тройной транспорт

### stdio (MCP Native)
Чистый JSON-RPC через stdin/stdout. Claude Desktop, MCP CLI. Нулевой оверхед.

### HTTP REST API
\`POST /api/tools/:toolName\` с Bearer token. Batch endpoint для параллельного выполнения. Заголовок \`Accept: text/event-stream\` переключает на SSE.

### SSE (MCP-over-SSE)
Два варианта: ChatGPT/OpenAI протокол (\`/sse\`) и стандартный MCP SSE (\`/v1/sse\`).

## Поток вызова: 11 шагов

1. **dualAuth** — JWT или API key
2. **Проверка баланса** → 402 если недостаточно
3. **Расчёт кредитов** для инструмента
4. **Cost tracking** — pending запись
5. **Оценка стоимости** перед выполнением
6. **Маршрутизация шлюза** — локальный или удалённый?
7. **Выполнение** в AsyncLocalStorage контексте
8. **Диспатч обработчика** → доменная логика
9. **Завершение трекинга** — фактические токены
10. **Списание кредитов** после успеха
11. **Ответ** с разбивкой затрат

## Паттерны, которые спасли

**Cost hints в описаниях** — каждый инструмент имеет расчётную стоимость в description. LLM видит это при планировании.

**Budget-aware модели** — параметр \`reasoning_budget\` маппит на разные модели: quick → nano, deep → gpt-5.1.

**Vault изоляция** — userId инжектится на уровне транспорта, tool schema не знает об аутентификации.

**Route normalization** — без него 56 инструментов + UUID создают тысячи time series в Prometheus.

## Цифры

- **56 инструментов** через 3 сервиса
- **12 классов-обработчиков** в бэкенде
- **3 транспорта** на сервис
- **5 191 статья** законодательства
- **16 государственных реестров**
- Латентность: **200мс** (кеш) до **8с** (глубокий анализ)

Количество инструментов будет расти. Архитектуре всё равно.

---

## Обновление: новые инструменты (март 2026)

Общее количество MCP-инструментов выросло с 56 до 58 благодаря двум новым инструментам в сервисе \`mcp_openreyestr\`.

**Новые инструменты:**

- **openreyestr_search_erb_debtors** — поиск в Едином реестре должников (ЕРД). Позволяет находить физических и юридических лиц, в отношении которых открыты исполнительные производства, с фильтрацией по типу взыскания и категории долга.
- **openreyestr_search_nbu_banks** — поиск в реестре банков НБУ. Предоставляет доступ к информации о банковских учреждениях, их статусе (действующий, ликвидация), лицензиях и контактных данных.

**Улучшения существующих инструментов:**

Инструмент \`get_legislation_section\` теперь поддерживает векторный поиск как fallback-стратегию. Если пользователь указывает \`rada_id\` и текстовый запрос без конкретного номера статьи, система автоматически выполняет семантический поиск по векторной базе соответствующего закона, возвращая наиболее релевантные секции.`,
  },
  'semantic-search-legislation': {
    title: 'Семантический поиск по 5 000+ статьям законодательства: embeddings, chunking и Qdrant',
    punchline: 'Ключевые слова находят то, что вы уже знаете. Семантический поиск находит то, что вам нужно. Мы разбили 12 украинских кодексов на 5 191 статью, векторизировали каждую через VoyageAI embeddings, и теперь запрос «ответственность за некачественный ремонт» находит статьи, которые не содержат ни одного из этих слов.',
    readTime: '7 мин',
    content: `# Семантический поиск по 5 000+ статьям законодательства

*Ключевые слова находят то, что вы уже знаете. Семантический поиск находит то, что вам нужно.*

---

## Проблема с ключевыми словами

Юрист ищет «ответственность за некачественный ремонт квартиры». Классический поиск ищет эти слова. Но статья 858 ГК говорит о «недостатках работы» и «требованиях заказчика к подрядчику». Ни одного совпадения ключевых слов — но это именно та статья.

Семантический поиск понимает *значение*, а не *слова*.

## Как мы это построили

### Шаг 1: Секционирование законодательства

12 украинских кодексов — это не 12 документов. Это 5 191 статья, каждая из которых является самостоятельной единицей знания. Наш SemanticSectionizer разбивает кодексы на логические секции:

- **Статья** — основная единица (90% случаев)
- **Часть статьи** — когда статья слишком велика (>2000 токенов)
- **Глава/Раздел** — для контекста при поиске

Каждая секция сохраняется с метаданными: кодекс, номер статьи, название, иерархический путь (Книга → Раздел → Глава → Статья).

### Шаг 2: Векторизация

Каждая секция проходит через VoyageAI \`voyage-3.5\`:
- Вход: текст статьи + название + контекстный путь
- Выход: вектор размером 1024
- Хранение: Qdrant с метаданными для фильтрации

### Шаг 3: Поиск

Запрос пользователя → embedding → cosine similarity в Qdrant → топ-N результатов с порогом релевантности > 0.75.

**Фильтрация по метаданным** — юрист может сузить до конкретного кодекса, главы или типа нормы.

## Реальные примеры

| Запрос | Ключевой поиск найдёт | Семантический поиск найдёт |
|-------|----------------------|--------------------------|
| «ответственность за некачественный ремонт» | Ничего | Ст. 858 ГК (недостатки работы подрядчика) |
| «когда можно не платить алименты» | Ничего | Ст. 188, 190, 196 СК (освобождение от уплаты) |
| «защита от незаконного увольнения» | Ст. со словом «увольнение» | + Ст. 235 КЗоТ (восстановление на работе), Ст. 237-1 (возмещение) |

## Кеш и актуальность

- Тексты загружаются с официального API Верховной Рады
- TTL кеша: 30 дней
- При изменении статьи — автоматическое переиндексирование
- 5 191 статья × 1024 dimensions = ~21MB в Qdrant

Семантический поиск не заменяет точный — он дополняет. Вместе они дают полную картину.`,
  },
  'hallucination-guard': {
    title: 'RAG для юридических документов: HallucinationGuard и CitationValidator в продакшене',
    punchline: 'AI уверенно цитирует несуществующие статьи и выдумывает номера дел. В юридической сфере это не просто ошибка — это мальпрактис. Мы построили два уровня защиты: HallucinationGuard проверяет каждое утверждение, CitationValidator валидирует каждую ссылку. Нулевая толерантность к выдумкам.',
    readTime: '7 мин',
    content: `# RAG для юридических документов: HallucinationGuard и CitationValidator

*AI уверенно цитирует несуществующие статьи. В юридической сфере это не ошибка — это мальпрактис.*

---

## Проблема: AI врёт уверенно

Попросите ChatGPT назвать судебные решения по защите авторских прав в Украине. Он выдаст 5 номеров дел. Проверьте их — 4 из 5 не существуют. Пятый существует, но касается совсем другой темы.

Для юридической платформы это недопустимо. Каждый номер дела, каждая статья закона, каждая цитата — должны быть реальными.

## Архитектура защиты

### Уровень 1: HallucinationGuard

Работает *до* ответа пользователю. Проверяет каждое фактическое утверждение в AI-ответе:

1. **Извлечение утверждений** — парсит ответ на отдельные factual claims
2. **Поиск источников** — для каждого утверждения ищет подтверждение в результатах tool calls
3. **Классификация**: supported (есть в источниках), unsupported (нет в источниках), contradicted (противоречит источникам)
4. **Решение**: unsupported claims маркируются или удаляются, contradicted — всегда удаляются

### Уровень 2: CitationValidator

Работает с конкретными ссылками:

- **Номера дел** — проверяет существование через ZakonOnline API
- **Статьи законов** — верифицирует через API Верховной Рады
- **Цитаты из решений** — сравнивает с фактическим текстом решения

### Уровень 3: Precedent Status

Каждое решение возвращается со статусом:
- **valid** — действующее, не отменённое
- **limited** — сужено вышестоящей инстанцией
- **overruled** — отменено
- **questioned** — под сомнением

## Правило #1 системного промпта

> «Никогда не генерировать номера дел, статьи законов или судебные решения из памяти. Всегда использовать инструменты для получения фактических данных.»

Это не рекомендация — это жёсткая инструкция. AI не может назвать ни одну статью ГК, не вызвав \`get_legislation_article\`. Не может сослаться на дело, не найдя его через \`search_legal_precedents\`.

## Результат

Каждая ссылка в ответе — кликабельная. Нажал на номер дела — открылся полный текст. Нажал на статью закона — увидел действующую редакцию. Юрист не доверяет AI на слово — он проверяет в один клик.

Нулевая толерантность к галлюцинациям — это не фича. Это фундамент.`,
  },
  'monolith-to-mcp': {
    title: 'От монолита до MCP: как Model Context Protocol изменил нашу архитектуру',
    punchline: 'Мы начинали как REST API с 10 эндпоинтами. Сейчас у нас 70 MCP-инструментов через 3 сервиса с тройным транспортом. MCP дал нам то, чего REST не мог: стандартный способ для AI самостоятельно находить и использовать инструменты. AI становится клиентом, а не вами.',
    readTime: '6 мин',
    content: `# От монолита до MCP: как Model Context Protocol изменил нашу архитектуру

*REST API отлично работает, когда клиент — человек. Когда клиент — AI, нужен другой протокол.*

---

## Почему REST недостаточно для AI

REST API работает так: разработчик читает документацию, пишет код интеграции, хардкодит эндпоинты. Работает идеально для веб-приложений.

Но когда ваш «клиент» — это LLM, который должен *сам* решить, какой инструмент вызвать:

- REST не имеет стандартного tool discovery
- Нет встроенного описания параметров для AI
- Каждая интеграция — это кастомный код
- Batch, streaming, cost estimation — всё отдельно

## Что даёт MCP

**Model Context Protocol** — это стандарт от Anthropic для взаимодействия AI с внешними инструментами.

### Tool Discovery

\`\`\`
GET /api/tools → полный каталог с JSON Schema для каждого параметра
\`\`\`

AI получает список всех 70 инструментов с описаниями, типами параметров, ограничениями — и сам выбирает, что вызвать.

### Стандартизированная схема

Каждый инструмент описан одинаково:
- **name** — уникальный идентификатор
- **description** — что делает (с подсказками стоимости)
- **inputSchema** — JSON Schema параметров
- **outputSchema** — формат результата

### Три транспорта

stdio для локальных клиентов, HTTP для веба, SSE для стриминга — один и тот же набор инструментов через любой протокол.

## Наша миграция

### До: REST Monolith
- 10 эндпоинтов с захардкоженной логикой
- Каждый фронтенд-компонент знает конкретный URL
- Добавить инструмент = добавить роут + контроллер + документацию

### После: MCP Architecture
- 70 инструментов через BaseToolHandler
- AI сам выбирает инструменты по описанию
- Добавить инструмент = добавить handler класс + регистрация одной строкой

## Ключевое изменение мышления

REST: вы проектируете API для *разработчика*, который напишет код.

MCP: вы проектируете API для *AI*, который сам решит, когда и что вызвать.

Это меняет всё — от именования до описаний, от структуры параметров до формата ошибок. AI нужны чёткие описания, cost hints, примеры — вещи, которые в REST документации, а в MCP — прямо в схеме.

MCP — не серебряная пуля. Но для AI-first продуктов это лучший стандарт, который сейчас существует.`,
  },
  'diia-digital-identity': {
    title: 'Авторизация через Дiю: как мы интегрировали национальную цифровую идентификацию в юридическую платформу',
    punchline: 'Паспорт в смартфоне — теперь ключ к юридическому AI. Мы интегрировали Дiя.Подпись для авторизации: deep link на мобильном, QR-код на десктопе, ECDSA + SHA256 для хеширования, и юрист подтверждает личность тем же приложением, которым показывает документы на блокпосте. Без паролей. Без регистрации. Один тап — и вы в системе.',
    readTime: '7 мин',
    content: `# Авторизация через Дiю: как мы интегрировали национальную цифровую идентификацию

*Паспорт в смартфоне — теперь ключ к юридическому AI.*

---

## Почему Дiя, а не ещё один OAuth

Юридическая платформа работает с конфиденциальными данными. Google OAuth подтверждает, что у вас есть Gmail. Дiя подтверждает, что вы — это вы. Разница принципиальная: Дiя привязана к реальному документу — паспорту, ID-карте или квалифицированной электронной подписи.

Для юридической платформы, где адвокатская тайна и идентификация сторон — не опция, а требование закона, это единственно правильный уровень верификации.

## Архитектура: два потока

### Мобильный (deep link)

1. Пользователь нажимает «Войти через Дiю»
2. Бэкенд генерирует \`requestId\` (ECDSA + SHA256, base64)
3. Открывается deep link \`diia://\` с параметрами сессии
4. Приложение Дiя показывает запрос на авторизацию
5. Пользователь подтверждает → Дiя отправляет callback с данными
6. Бэкенд верифицирует подпись, создаёт JWT-сессию

### Десктоп (QR-код)

1. Бэкенд запрашивает сессию у Дiя API (\`api2s.diia.gov.ua\`)
2. Получает deep link → конвертирует в QR-код
3. Пользователь сканирует QR приложением Дiя на телефоне
4. Далее — тот же поток: подтверждение → callback → JWT

## Криптография: почему ECDSA

API Дiя требует хеширования \`requestId\` через ECDSA с SHA256. Не HMAC, не RSA — именно ECDSA. Это стандарт электронной подписи в Украине (ДСТУ 4145), и Дiя следует ему.

\`\`\`
requestId = base64(ECDSA_SHA256(branchId + offerId + requestId))
\`\`\`

Каждый запрос уникален. Каждая подпись верифицирована. Replay-атаки невозможны.

## Что получаем от Дiя

После успешной авторизации:

| Поле | Описание |
|------|------|
| ФИО | Фамилия, имя, отчество |
| Дата рождения | Из документа |
| ИНН | Индивидуальный налоговый номер |
| Серия/номер документа | Паспорт или ID-карта |
| Фото | Из документа (опционально) |

Этого достаточно для полной идентификации на юридической платформе — и для будущей интеграции с ЕРАУ (верификация адвоката по ИНН).

## Безопасность

- **Данные не хранятся на стороне Дiя** — после передачи callback сессия уничтожается
- **Токен сессии одноразовый** — повторное использование невозможно
- **JWT с коротким TTL** — 24 часа, refresh через повторную авторизацию
- **Basic Auth для API** — коммуникация бэкенд ↔ Дiя защищена отдельными credentials

## UX: один тап вместо формы

На мобильном:
- Нажал «Войти через Дiю» → открылось приложение → подтвердил → вернулся в LEX AI авторизованным

На десктопе:
- Увидел QR-код → навёл камеру → подтвердил в приложении → страница автоматически обновилась

Никаких паролей. Никаких форм регистрации. Никаких «подтвердите email». То же приложение, которым вы показываете права на блокпосте — теперь ваш ключ к юридическому AI.

## Три метода авторизации

LEX AI теперь поддерживает три независимых метода входа:

| Метод | Уровень доверия | Лучше всего для |
|-------|--------------|-------------|
| **Google OAuth** | Базовый | Быстрый старт, ознакомление |
| **Authentik SSO** | Корпоративный | Юридические фирмы, организации |
| **Дiя** | Государственный | Полная идентификация, адвокаты |

Юрист выбирает свой уровень. Платформа адаптируется.

---

## Production post-mortem: Redis + nginx

После деплоя на продакшн за AWS Application Load Balancer авторизация через Дiю перестала работать. Полностью. Пользователи нажимали «Войти через Дiю» — и получали ошибку.

Причин оказалось две, и обе — инфраструктурные.

**Первая: расхождение ключей в Redis.** При инициации сессии Дiя мы записывали стейт с одним префиксом, а при обратном вызове читали с другим. Redis молча возвращал \`null\`, бэкенд считал сессию невалидной и отклонял callback. Фикс — унификация префиксов ключей в одном месте.

**Вторая: nginx перезаписывал X-Forwarded-Proto.** ALB корректно передавал \`https\`, но nginx в своей конфигурации принудительно ставил \`http\`. Callback URL формировался с HTTP-схемой, Дiя отклоняла его как несоответствующий зарегистрированному redirect URI. Решение — nginx теперь пропускает оригинальный заголовок от балансера, а не подставляет свой.

Обе проблемы не воспроизводились локально, потому что в dev-среде нет ALB и Redis-префиксы совпадали случайно. Это напоминание: staging должен максимально повторять продакшн.`,
  },
  'mcp-connect-open-data': {
    title: 'MCP Connect: как мы подключили Nextcloud, Google Drive и 1400+ открытых датасетов к юридическому AI',
    punchline: 'Юрист хранит договоры в Nextcloud, переписку в Google Drive, а судебную практику ищет в ЕГРСР. Три разные системы, три разных окна, ноль связи между ними. MCP Connect объединяет всё в один интерфейс: AI анализирует ваш договор из Nextcloud, находит релевантную практику из ЕГРСР и проверяет контрагента в реестрах — за один запрос.',
    readTime: '6 мин',
    content: `# MCP Connect: Nextcloud, Google Drive и 1400+ открытых датасетов в одном интерфейсе

*Ваши документы. Ваши облака. Один AI, который видит всё.*

---

## Проблема: документы везде, связи нигде

Типичный рабочий день юриста:

- Договор — в Nextcloud (или на корпоративном сервере)
- Переписка с клиентом — в Google Drive
- Судебная практика — в ЕГРСР
- Реестры — на 4 разных сайтах
- Законодательство — на сайте Рады

5 систем. 5 окон. Копировать-вставить между ними. И ни одна из них не знает о существовании другой.

## MCP Connect: одна страница — все источники

Новая страница MCP Connect позволяет подключить внешние хранилища к LEX AI:

### Nextcloud

Ваш self-hosted Nextcloud становится частью платформы:

- **Авторизация** через OAuth или app password
- **Навигация** по папкам прямо в интерфейсе LEX AI
- **Анализ документов** — AI читает файлы из Nextcloud без загрузки на наш сервер
- **Поиск** по содержимому документов через MCP-инструменты

Юридическая фирма хранит все документы на своём сервере. LEX AI подключается к нему, анализирует договор, находит риски, и тут же ищет релевантную практику — всё в одном окне.

### Google Drive

Для тех, кто использует Google Workspace:

- Подключение через стандартный Google OAuth
- Доступ к документам, таблицам, PDF
- Тот же AI-анализ, что и для локальных файлов

## 1400+ открытых датасетов

Параллельно с MCP Connect мы добавили каталог открытых данных — страницы с описанием всех доступных источников:

### Украина (ua.legal.org.ua/ua/data-sources)

| Категория | Датасеты | Примеры |
|-----------|---------|---------|
| **Судебная система** | 814 | Реестр судебных решений, расписания заседаний, статистика |
| **Верховная Рада** | 633 | Законопроекты, голосования, стенограммы |
| **Здравоохранение** | 12 | Реестры НСЗУ, лицензии |
| **Транспорт** | Каталог | Реестр транспортных средств |
| **data.gov.ua** | 4 категории | Полный каталог открытых данных |

### ЕС и мир

- **5 стран ЕС** — Великобритания, Германия, Франция, Нидерланды, Эстония
- **Сравнительная таблица** — eu.legal.org.ua/eu/comparison
- **США** — usa.legal.org.ua/us/data-sources

## Что это даёт юристу

### Сценарий 1: Анализ договора с контекстом

1. AI читает договор из вашего Nextcloud
2. Находит проблемные пункты
3. Ищет судебную практику по каждому риску
4. Проверяет контрагента в реестрах
5. Выдаёт отчёт со ссылками на реальные дела

Раньше это 4 разные системы и 2 часа работы. Теперь — один запрос.

### Сценарий 2: Сравнительный анализ

Клиент планирует выход на рынок ЕС. Вам нужно сравнить регуляторную среду. Страницы открытых данных дают прямой доступ к официальным источникам 5 стран ЕС — с описанием, что именно доступно и где искать.

### Сценарий 3: АРМА и арестованное имущество

Новый датасет — реестр АРМА (Агентство по розыску и менеджменту активов). Арестованные активы, конфискованное имущество, переданное в управление. Для адвокатов в уголовных делах и делах о санкциях — критический источник.

## Архитектура: ваши данные остаются вашими

Ключевой принцип: LEX AI не копирует ваши файлы. Интеграция с Nextcloud работает через API — файл читается на лету, анализируется, результат показывается. Оригинал остаётся на вашем сервере.

Для юридических фирм это принципиально: конфиденциальные документы клиентов никогда не покидают корпоративную инфраструктуру.

## PWA: LEX AI как приложение

Бонус: LEX AI теперь можно установить как приложение на телефон или компьютер. Chrome покажет кнопку «Установить» — и платформа будет работать как нативное приложение с иконкой на рабочем столе. Офлайн-доступ к загруженным документам и мгновенный запуск без браузера.

Ваши документы. Ваши облака. Ваши реестры. Один AI, который объединяет всё.`,
  },
  'ai-wont-replace-lawyers': {
    title: 'AI не заменит юриста — но юрист с AI заменит юриста без него',
    punchline: 'AI не заменит юриста. Но юрист в фирме напротив, который использует AI? Вот ваша настоящая конкуренция. Его анализ практики покрывает 300 дел вместо 30. Его due diligence проверяет 16 реестров за 2 секунды. Он не биллит меньше часов — он биллит те же часы за драматически лучший результат.',
    readTime: '9 мин',
    content: `# AI не заменит юриста — но юрист с AI заменит юриста без него

*Как на самом деле выглядит, когда юридическая AI-платформа обрабатывает реальный анализ дела.*

---

## Заголовок, который все понимают неправильно

Каждую неделю появляется новая статья: «AI заменит 40% юристов.» «ChatGPT сдал адвокатский экзамен.» Вот что ни одна из этих статей не упоминает: ChatGPT не знает вашу юрисдикцию, не имеет доступа к практике вашего суда и уверенно выдумывает номера дел, которых не существует.

AI не заменяет юридическое мышление. Он заменяет 6 часов ручного исследования, которые предшествуют юридическому мышлению.

## Без AI vs. С AI

### Без AI: 4-8 часов

Открыть ЕГРСР, попробовать 10-15 комбинаций ключевых слов, просмотреть 30-40 решений, вручную проверить инстанции, отдельно искать Верховный Суд, прочитать законы, перекрёстно проверить прецеденты.

### С AI: 2-3 минуты

Один вопрос → система классифицирует → генерирует план из 6 шагов → выполняет каждый (юрист видит в реальном времени) → синтезирует ответ со сравнительными таблицами, анализом отменённых решений, стратегической рекомендацией. Правая панель заполняется 150+ карточками дел и текстами статей.

## Три панели доказательств

**«Решения»** — каждое судебное решение с номером (кликабельным), судом, датой, статусом прецедента.

**«Нормы»** — полный текст каждой статьи закона. Не интерпретация AI — сам текст с официальной базы Верховной Рады.

**«Документы»** — карточки компаний из реестра, законопроекты, документы из хранилища.

## Что AI делает хорошо

### 1. Исчерпывающий поиск
5-10 отдельных поисков с разными формулировками, 200-300 дел. Юрист ищет, пока не найдёт достаточно. AI ищет, пока не найдёт всё.

### 2. Валидация прецедентов
Каждое дело — со статусом: valid, limited, overruled, questioned. Система отслеживает цепочки через все инстанции.

### 3. Due diligence за секунды
«Проверь ООО Нова Пошта, ЕГРПОУ 31316518» → 2 секунды → полная карточка, бенефициары, исполнительные производства, реестр должников.

### 4. Актуальное законодательство
12 кодексов, 5 191 статья с API Рады. Если статья изменена на прошлой неделе — система имеет новую редакцию.

## Что AI НЕ делает

- **Не принимает стратегических решений** — не знает обстоятельств клиента, риск-профиль, бизнес-цели
- **Не составляет финальные документы** — шаблон да, финальную подачу нет
- **Не заменяет опыт** — не почувствует смену позиции ВС раньше, чем она станет явной

## Настоящая конкурентная угроза

Угроза — не AI. Это юрист напротив, который использует AI. Его анализ — 300 дел вместо 30. Его due diligence — 16 реестров вместо 3. Его ссылки актуальны на сегодняшний день.

Разрыв между юристами, которые это принимают, и теми, кто нет — только растёт.`,
  },
  'semantic-vs-keyword-search': {
    title: 'Поиск судебных решений по смыслу, а не по ключевым словам',
    punchline: 'Вы ищете «возмещение ущерба за затопление квартиры» и не находите дело, где суд пишет о «деликтной ответственности за повреждение имущества вследствие аварии инженерных сетей». Ключевые слова находят слова. Семантический поиск находит значение.',
    readTime: '5 мин',
    content: `# Поиск судебных решений по смыслу, а не по ключевым словам

*Ключевые слова находят слова. Семантический поиск находит значение.*

---

## Почему ЕГРСР недостаточно

Единый государственный реестр судебных решений — бесценный ресурс. Но его поиск работает по ключевым словам. Это значит:

- Вы должны *заранее знать*, как суд формулирует то, что вы ищете
- Разные суды описывают одну ситуацию разными словами
- Синонимы, перефразирование, юридические термины — всё мимо

**Пример:** Ищете «затопление квартиры». Дело 753/12847/21, где суд пишет «деликтная ответственность за повреждение имущества вследствие аварии инженерных сетей» — не найдётся. Ни одного общего слова.

## Как работает семантический поиск

Вместо сравнения символов, система сравнивает *значение*:

1. Ваш запрос превращается в математический вектор (embedding)
2. Каждое решение в базе уже имеет свой вектор
3. Система находит решения, *близкие по значению*, даже если слова полностью разные

## Практические примеры

| Ваш запрос | Ключевой поиск | Семантический поиск |
|-----------|---------------|-------------------|
| «затопление квартиры» | Решения со словом «затопление» | + «деликтная ответственность за повреждение имущества» |
| «выселение из ипотечной квартиры» | Решения со словами «выселение» + «ипотека» | + «обращение взыскания на предмет залога» |
| «долг за аренду» | Решения со словом «аренда» + «долг» | + «взыскание арендной платы», «задолженность нанимателя» |

## Что это значит для практики

**Полнота исследования.** Вы находите релевантную практику, которую бы никогда не нашли ключевыми словами. Не 30 решений — а 200-300, включая те, где суд использовал другую терминологию.

**Скорость.** Вместо 10-15 комбинаций ключевых слов — один естественный запрос. Система сама находит все вариации формулировок.

**Неочевидные связи.** Семантический поиск может найти решение из смежной отрасли, где суд применил аналогичный правовой подход. Вы бы его никогда не искали — но оно именно то, что нужно.

Ключевой поиск — это ответ на вопрос «где есть эти слова?». Семантический — на вопрос «где решали такую проблему?».`,
  },
  'ai-analyzes-millions': {
    title: 'Как AI анализирует миллионы судебных решений — и что это значит для вашей практики',
    punchline: 'Человек просматривает 30-40 решений за сессию. AI обрабатывает 200-300 в минуту. Но дело не в скорости — дело в полноте. Когда вы видите всю картину, а не фрагмент, стратегические решения становятся качественно другими.',
    readTime: '6 мин',
    content: `# Как AI анализирует миллионы судебных решений за секунды

*Дело не в скорости. Дело в полноте.*

---

## Масштаб, который невозможен вручную

ЕГРСР содержит миллионы судебных решений. Человек физически может просмотреть 30-40 за рабочую сессию. Даже опытный юрист, который ежедневно работает с практикой, охватывает лишь микроскопическую долю.

AI не просто быстрее — он работает иначе. Один запрос запускает 5-10 параллельных поисков с разными формулировками, собирает 200-300 дел, классифицирует их, проверяет статусы прецедентов, строит хронологию.

## Что даёт полнота

### Выявление трендов

Когда вы видите 30 решений — это выборка. Когда 300 — это статистика.

- «73% негаторных исков удовлетворяются в хозяйственных судах, но лишь 58% — в гражданских»
- «Большая Палата ВС изменила позицию по земельным спорам в 2024 — нижестоящие суды перешли в течение 4 месяцев»
- «КХС удовлетворяет иски о взыскании убытков с подрядчика в 2.3 раза чаще, когда есть акт экспертизы»

### Обнаружение сдвигов практики

Верховный Суд редко объявляет: «мы изменили позицию». Вместо этого появляется решение с другой формулировкой. Потом ещё одно. Через 6 месяцев нижестоящие суды начинают следовать.

AI видит этот сдвиг в момент, когда он происходит — потому что анализирует всю хронологию, а не выборку.

### Сравнение инстанций

Инструмент \`compare_practice_pro_contra\` — две линии практики параллельно:
- Дела, где суд удовлетворил аналогичный иск
- Дела, где отказал

С конкретными причинами каждого решения. Вы видите, что именно отличает успешные дела от неуспешных.

## Практический пример

**Запрос:** «Практика взыскания 3% годовых и инфляционных по статье 625 ГК»

**AI за 2 минуты:**
- 247 релевантных решений
- Статистика удовлетворения: 89% полностью, 8% частично, 3% отказ
- Основные причины частичного удовлетворения: неправильный расчёт периода, пропуск сроков исковой давности
- Хронология изменения подхода ВС к расчёту инфляционных
- 5 ключевых постановлений Большой Палаты с анализом

**Юрист вручную:** те же результаты — 2-3 рабочих дня.

## Это не замена — это усиление

AI не решает, какую стратегию выбрать. Он даёт юристу полную картину, на основе которой юрист принимает решение. Разница между решением на основе 30 дел и 300 — это разница между интуицией и обоснованной стратегией.`,
  },
  'due-diligence-ai': {
    title: 'Due Diligence с AI: от реестров до бенефициаров за один запрос',
    punchline: 'Проверка контрагента: 4 сайта реестров, 30 минут ручной работы, и всё равно можете пропустить исполнительное производство. Или: один запрос, 2 секунды, 18 реестров, полная картина — ЕГРПОУ, учредители, бенефициары, должники, исполнительные производства, банкротство, банки НБУ.',
    readTime: '5 мин',
    content: `# Due Diligence с AI: от реестров до бенефициаров за один запрос

*Один запрос. 2 секунды. 16 реестров. Полная картина.*

---

## Как выглядит проверка контрагента сегодня

Клиент просит проверить потенциального партнёра перед подписанием договора. Вы:

1. Открываете opendatabot.ua — ищете по ЕГРПОУ
2. Переходите на court.gov.ua — проверяете судебные дела
3. Заходите на asvp.minjust.gov.ua — реестр исполнительных производств
4. Открываете bankrut.minjust.gov.ua — проверяете банкротство
5. Возвращаетесь в opendatabot — смотрите бенефициаров
6. Формируете записку для клиента

**Время: 30-60 минут.** И это если всё нашли с первой попытки.

## Как это работает с AI

**Запрос:** «Проверь ООО Нова Пошта, ЕГРПОУ 31316518 — есть ли производства и кто бенефициары»

**Через 2 секунды:**

- **Полная карточка компании:** название, статус, дата регистрации, уставный капитал
- **Учредители** с долями собственности в процентах
- **Конечные бенефициарные владельцы (КБВ)** с типом влияния — прямой или косвенный
- **Руководитель** и органы управления
- **Исполнительные производства** — активные, завершённые
- **Реестр должников** — есть или нет
- **Дела о банкротстве** — статус
- **Общее количество судебных дел** — как истец и ответчик

## 16 реестров в одном интерфейсе

| Реестр | Что проверяется |
|--------|-----------------|
| ЕГР юридических лиц | Регистрация, статус, уставный капитал |
| Реестр бенефициаров | КБВ с типом влияния |
| Реестр должников | Наличие в реестре |
| Исполнительные производства | Активные взыскания |
| Дела о банкротстве | Процедуры неплатёжеспособности |
| Реестр нотариусов | Проверка нотариуса |
| Реестр судебных экспертов | Проверка эксперта |
| Реестр арбитражных управляющих | Проверка управляющего |
| Судебные дела | Общее количество и детали |

## Для каких ситуаций

- **Перед подписанием договора** — базовая проверка контрагента
- **M&A due diligence** — полный анализ целевой компании
- **Перед судебным иском** — оценка платёжеспособности ответчика
- **Комплаенс** — регулярная проверка контрагентов
- **Антикоррупционная проверка** — отслеживание бенефициарных цепочек

## Обновление: новые реестры (март 2026)

В марте 2026 года мы подключили ещё два критически важных источника для проверки контрагентов.

**Единый реестр должников (ЕРД)** — государственный реестр, содержащий информацию о лицах и компаниях с непогашенными долгами по исполнительным производствам. Теперь система автоматически проверяет, нет ли у вашего потенциального партнёра задолженностей, арестованного имущества или открытых исполнительных производств. Это один из первых сигналов финансовой ненадёжности, который раньше приходилось искать вручную на сайте Минюста.

**Реестр банков НБУ** — официальный перечень банковских учреждений Национального банка Украины. Система проверяет статус лицензии банка, его платёжеспособность и наличие процедуры ликвидации. Если контрагент обслуживается в банке, находящемся на стадии вывода с рынка, вы узнаете об этом сразу, а не после того, как средства уже перечислены.

18 реестров. 30 минут ручной работы → 2 секунды. И гарантия, что ничего не пропущено.`,
  },
  'data-privacy-ai': {
    title: 'Конфиденциальность и AI: как мы защищаем данные клиентов в юридической платформе',
    punchline: 'Юристы не могут использовать ChatGPT для клиентских дел — данные попадают на серверы OpenAI. Мы построили платформу, где каждое дело изолировано, каждое действие в аудит-трейле, legal holds блокируют удаление, а GDPR — не галочка, а архитектура.',
    readTime: '6 мин',
    content: `# Конфиденциальность и AI: как мы защищаем данные клиентов в юридической платформе

*Юристы не могут использовать ChatGPT для клиентских дел. Мы построили платформу, где могут.*

---

## Проблема: AI и адвокатская тайна

Юрист хочет использовать AI для анализа дела. Но:

- Загрузка документов в ChatGPT = передача данных третьей стороне
- OpenAI может использовать данные для тренировки моделей
- Нет контроля, где физически хранятся данные
- Невозможно отозвать или удалить переданные данные
- Нарушение адвокатской тайны (ст. 22 Закона «Об адвокатуре»)

Результат: юристы или не используют AI, или используют с риском.

## Наша архитектура защиты

### 1. Изоляция по делам (Matter Segregation)

Каждое дело — отдельный контейнер:
- Документы дела А недоступны при работе с делом Б
- Поиск ограничен документами текущего дела
- Даже AI-ассистент видит только документы активного дела

### 2. Аудит-трейл с хеш-цепочкой

Каждое действие записывается:
- Кто просмотрел документ
- Кто загрузил / удалил / изменил
- Кто искал и что нашёл
- Каждая запись защищена хешем предыдущей — подделать цепочку невозможно

### 3. Legal Holds

Когда дело под legal hold:
- Ни один документ не может быть удалён
- Даже админ не может обойти ограничение
- SQL-функция \`can_delete_document()\` проверяет holds перед каждым удалением
- Hold снимается только явным действием уполномоченного лица

### 4. GDPR как архитектура

- **Право на удаление** — полное удаление персональных данных из всех систем
- **Право на перенос** — экспорт данных в структурированном формате
- **Privacy by design** — защита встроена в архитектуру, а не добавлена позже
- **Минимизация данных** — храним только необходимое

### 5. Инфраструктурная защита

- AWS EU (Frankfurt) — данные в ЕС
- Шифрование at rest и in transit
- IAM roles вместо API ключей где возможно
- Vault для секретов
- Regular security audits

## Что это значит для юриста

Вы можете загрузить договор клиента, попросить AI проанализировать риски, найти релевантную практику — и быть уверенным, что:

1. Данные клиента не покидают вашу инфраструктуру
2. Другие пользователи не видят ваших документов
3. Каждое действие записано для аудита
4. Документы под legal hold защищены от удаления
5. Клиент может запросить удаление своих данных в любой момент

Конфиденциальность — не фича. Это предпосылка существования юридической AI-платформы.`,
  },
  'gcp-cloud-scaling': {
    title: 'От одного сервера до облака: как мы масштабируем legal.org.ua на Google Cloud',
    punchline: 'Cloud Run с автоскейлингом до нуля. Cloud SQL с автобекапами. Qdrant на выделенной VM. Вся инфраструктура за $280-430/мес с возможностью масштабирования от 10 до 10 000 пользователей без изменений архитектуры.',
    readTime: '11 мин',
    content: `# От одного сервера до облака: как мы масштабируем legal.org.ua на Google Cloud

*Как мы перенесли юридическую AI-платформу с Docker Compose на одном сервере до полноценной облачной инфраструктуры с автоматическим масштабированием.*

---

## Почему миграция стала необходимой

legal.org.ua — платформа для юристов с AI-анализом судебных решений, семантическим поиском по законодательству и реестрам. Под капотом — 3 микросервиса, PostgreSQL, Redis, Qdrant (векторная БД), MinIO и фронтенд на React.

Начальная инфраструктура — один VPS-сервер с Docker Compose. Это работало для MVP, но создавало риски:

| Проблема | Последствие |
|----------|----------|
| Один сервер | Падение сервера = полный downtime |
| Фиксированные ресурсы | Не масштабируется под нагрузку |
| Ручные деплои | SSH → git pull → docker compose up |
| Бекапы вручную | Риск потери данных |

Нам нужна инфраструктура, которая масштабируется автоматически, имеет автобекапы и стоит разумных денег для стартапа.

## Выбор облака: почему Google Cloud

Мы рассматривали AWS, GCP и Hetzner Cloud. Выбрали GCP по нескольким причинам:

**Cloud Run** — главный аргумент. Это serverless контейнеры с оплатой за фактическое использование и возможностью масштабирования до нуля. Для юридической платформы с дневным трафиком (юристы работают с 9 до 18) это значит, что ночью и на выходных мы платим почти ничего.

**Cloud SQL** — managed PostgreSQL с автоматическими бекапами, point-in-time recovery и возможностью вертикального масштабирования в один клик.

**Регион \`europe-west1\` (Бельгия)** — ближайший к Украине с лучшими ценами среди европейских регионов GCP.

## Архитектура: гибридный подход

Ключевое решение — **не всё в serverless**. Мы разделили сервисы по природе:

\`\`\`
              Cloudflare (DNS + CDN + WAF)
                        │
              Cloud Load Balancer (HTTPS)
             ┌──────────┼──────────┐
        Cloud Run    Cloud Run    Cloud Run
      (mcp_backend) (mcp_rada) (openreyestr)
             └──────────┼──────────┘
        ┌───────┬───────┼───────┬────────┐
     Cloud SQL  Memorystore   GCE VM    GCS
     (PG 15)    (Redis 7)   (Qdrant) (файлы)
\`\`\`

### Stateless сервисы → Cloud Run

Наши 4 бэкенд-сервиса не хранят состояние между запросами — идеальные кандидаты для Cloud Run:

| Сервис | Что делает | CPU | RAM | Авто-масштабирование |
|--------|-----------|-----|-----|--------------------|
| \`mcp-backend\` | Судебные решения, AI-чат, 36 инструментов | 2 vCPU | 4 GiB | 1 → 4 инстанса |
| \`mcp-rada\` | Депутаты, законопроекты, голосования | 1 vCPU | 1 GiB | 0 → 2 инстанса |
| \`mcp-openreyestr\` | Госреестр, бенефициары | 1 vCPU | 1 GiB | 0 → 2 инстанса |
| \`document-service\` | Обработка документов | 2 vCPU | 4 GiB | 0 → 3 инстанса |

Обратите внимание на **min instances**: главный бэкенд всегда имеет хотя бы 1 инстанс (cold start недопустим для AI-чата с SSE стримингом), а вспомогательные сервисы масштабируются до нуля когда никто не использует.

### Stateful сервисы → Managed или VM

- **PostgreSQL** → Cloud SQL (managed, автобекапы, point-in-time recovery)
- **Redis** → Memorystore (managed, sub-millisecond latency)
- **Qdrant** → GCE VM (нет managed варианта, требуется persistent storage)
- **MinIO** → GCS (Google Cloud Storage с S3-совместимым API)

## Сеть: безопасность по умолчанию

Вся инфраструктура живёт в приватной VPC-сети. Ни один сервис не имеет публичного IP, кроме Load Balancer.

\`\`\`
VPC: secondlayer-vpc
├── services-subnet   10.0.0.0/20    (Cloud Run VPC Connector)
├── data-subnet       10.0.16.0/20   (Cloud SQL, Qdrant VM)
└── VPC Connector     10.8.0.0/28    (Cloud Run → приватная сеть)
\`\`\`

**Cloud NAT** обеспечивает исходящий интернет для VM без публичного IP. **IAP (Identity-Aware Proxy)** — SSH доступ к VM через Google аутентификацию вместо открытого 22 порта.

Firewall правила простые: разрешён только внутренний трафик между подсетями, SSH через IAP и health checks от Google Load Balancer.

## Cloud SQL: два инстанса

Мы сознательно разделили PostgreSQL на два инстанса:

**\`secondlayer-main\`** (db-custom-2-8192) — основной бэкенд и парламентские данные:
- База \`secondlayer_prod\`: судебные решения, документы, AI-аналитика, пользователи
- База \`rada_prod\`: депутаты, законопроекты, голосования

**\`openreyestr-db\`** (db-custom-1-4096) — Госреестр юридических лиц:
- Преимпортированная база с миллионами записей
- Read-heavy нагрузка, редко записывается
- Отдельный инстанс предотвращает lock contention с основной базой

Оба инстанса имеют:
- Private IP only (не доступны из интернета)
- Автоматические бекапы каждую ночь в 3:00
- Point-in-time recovery
- \`max_connections=500\` (достаточно для Cloud Run с connection pooling)

## Qdrant на выделенной VM

Qdrant — векторная база для семантического поиска. Managed варианта от GCP нет, поэтому мы развернули её на отдельной VM:

- **e2-standard-4** (4 vCPU, 16 GiB RAM) — достаточно для миллионов векторов
- **100 GB persistent disk** (pd-balanced) — данные переживают удаление VM
- **Docker container** с \`--restart=always\`

Persistent disk — ключевая деталь. Даже если VM упадёт или потребует upgrade, данные останутся на диске. Мы можем сменить тип VM за 5 минут без потери индексов.

## GCS вместо MinIO: ноль изменений в коде

Одно из самых элегантных решений: **Google Cloud Storage имеет S3-совместимый API**. Наш код использует AWS S3 SDK для работы с MinIO. Для миграции достаточно изменить endpoint:

\`\`\`
# Было (MinIO)
MINIO_ENDPOINT=minio-stage
MINIO_PORT=9000

# Стало (GCS)
MINIO_ENDPOINT=storage.googleapis.com
MINIO_PORT=443
MINIO_USE_SSL=true
\`\`\`

Ни одной строки кода не изменено. Тот же upload pipeline, те же presigned URLs, та же логика.

## Секреты: Secret Manager вместо .env файлов

На VPS секреты жили в \`.env\` файлах. Это работает, но:
- Файл может попасть в git
- Нет аудита кто когда получал доступ
- Ротация ключей = ручное обновление на сервере

GCP Secret Manager решает все три проблемы. Каждый секрет имеет версии, аудит доступа и интегрируется напрямую с Cloud Run через \`--set-secrets\`.

Мы создали 12 секретов: API ключи OpenAI, токены ZakonOnline, JWT secret, пароли баз данных и другие.

## Стоимость: от $280 до $430/мес

Полная разбивка:

| Компонент | Спецификация | $/мес |
|-----------|-------------|-------|
| Cloud Run (4 сервиса) | Автоскейлинг | $76 |
| Cloud SQL (2 инстанса) | PG 15, SSD, автобекапы | $150 |
| Memorystore Redis | 2 GiB, Basic | $50 |
| GCE VM (Qdrant) | e2-standard-4, 100 GB disk | $105 |
| GCS + CDN | ~50 GB файлов | $8 |
| Сеть (LB, NAT, VPC) | | $33 |
| Artifact Registry | Docker images | $3 |
| **Итого** | | **~$430** |

### Оптимизация до $280/мес

1. **Объединить Cloud SQL** — openreyestr как отдельная база в main инстансе: **-$55**
2. **1-year commitment** на Cloud SQL: **-$37**
3. **Spot VM** для Qdrant (если допустим restart): **-$60**

## Стратегия масштабирования

### Горизонтальное (автоматическое)

Cloud Run масштабируется автоматически по concurrency. Когда нагрузка растёт — добавляются инстансы. Когда падает — лишние выключаются.

\`\`\`
08:00  mcp-backend: 1 инстанс  (тихое утро)
10:00  mcp-backend: 2 инстанса (рабочий день)
14:00  mcp-backend: 4 инстанса (пик активности)
22:00  mcp-backend: 1 инстанс  (вечер)
02:00  mcp-rada: 0 инстансов   (никто не ищет депутатов ночью)
\`\`\`

### Вертикальное (ручное, по необходимости)

| Триггер | Действие |
|--------|-----|
| Cloud SQL CPU > 80% | Upgrade до db-custom-4-16384 |
| Redis > 85% RAM | Resize до 4 GiB |
| Qdrant VM > 80% RAM | Upgrade до e2-standard-8 |

### Что меняется при росте

**10 → 100 пользователей**: текущая архитектура справляется без изменений.

**100 → 1000 пользователей**: добавляем Cloud SQL read replica ($95/мес), увеличиваем max instances Cloud Run до 8.

**1000+ пользователей**: миграция на GKE Autopilot для более гранулярного контроля, Qdrant cluster (3 ноды), Cloud SQL HA.

## Фронтенд: GCS + Cloud CDN

React SPA (Vite build) — это статические файлы. Вместо Cloud Run контейнера мы хостим их на GCS с Cloud CDN:

- Стоимость: ~$1/мес (вместо ~$15 за Cloud Run контейнер)
- Latency: файлы раздаются с ближайшего edge к пользователю
- Cache hit ratio: >95% для JS/CSS бандлов

## Cloudflare остаётся

Мы не заменили Cloudflare на GCP Cloud Armor. Cloudflare остаётся первым слоем защиты:

- **Бесплатный WAF** — защита от SQL injection, XSS
- **DDoS protection** — автоматическое поглощение атак
- **Edge caching** — статика раздаётся с Kyiv PoP
- **Origin CA** — SSL сертификат уже настроен

Cloudflare DNS A-запись указывает на IP Google Cloud Load Balancer. Трафик: пользователь → Cloudflare edge → GCP LB → Cloud Run.

## CI/CD: автоматический деплой

GitHub Actions workflow при merge в main:

1. Build \`packages/shared\` (общие типы)
2. Параллельно: build 4 Docker images → push в Artifact Registry
3. Deploy каждого сервиса в Cloud Run
4. \`gsutil rsync\` фронтенда в GCS

Rollback — одна команда: Cloud Run позволяет переключить трафик на предыдущую ревизию за секунды.

## Что дальше

Эта архитектура — фундамент, на котором мы строим. Ближайшие шаги:

1. **Cloud Scheduler** — автоматическое уменьшение min-instances ночью
2. **Cloud SQL Insights** — мониторинг медленных запросов
3. **Prometheus + Grafana** на Qdrant VM — кастомные метрики
4. **Workload Identity Federation** — GitHub Actions без service account keys

Цель — инфраструктура, которая масштабируется вместе с продуктом, а не становится его ограничением.

---

*Если вы строите юридический или любой другой SaaS на микросервисах — Cloud Run + Cloud SQL это отличный старт. Платите за то, что реально используете, а не за простаивающие серверы.*`,
  },
  'edrsr-fulltext-pipeline': {
    title: 'ЕГРСР: data pipeline для 60 миллионов судебных решений',
    punchline: '60 миллионов полных текстов. 283 ГБ на 4 шардах. Кастомный RTF-парсер с depth-tracking для Windows-1251 кириллицы. Двухфазный ETL с idempotent upsert через temp-таблицы. Application-level sharding по doc_id с независимыми backup domains. PostgreSQL shared memory exhaustion и три уровня защиты. Всё на открытых данных ЕГРСР.',
    readTime: '15 мин',
    content: `# ЕГРСР: data pipeline для 60 миллионов судебных решений

*Архитектура ETL-системы, которая переносит весь Единый государственный реестр судебных решений в 4-шардовую PostgreSQL-инфраструктуру -- от модели данных и RTF-парсинга до capacity planning и операционных trade-offs.*

---

## Контекст задачи

LEX AI -- платформа семантического поиска по судебной практике. Ядро поиска -- векторные эмбеддинги (text-embedding-ada-002, 1536 dim), которые генерируются из полных текстов решений. Без текста нет эмбеддингов, без эмбеддингов нет семантического поиска.

ЕГРСР (Единый государственный реестр судебных решений) -- это ~60M документов от 685 судов всех инстанций, с 2006 года по сегодня. Полные тексты хранятся в формате RTF с кодировкой Windows-1251.

**Масштаб задачи:**

| Параметр | Значение |
|----------|----------|
| Документов в реестре | ~60,000,000 |
| Средний размер RTF | ~4.5 КБ |
| Средний размер plaintext | ~2.3 КБ |
| Суммарный объём текста | 283 ГБ (PostgreSQL) |
| Судов-источников | 685 |
| Временной диапазон | 2006--2026 |

## Принципиальное решение: только открытые данные

Мы сознательно выбрали работать исключительно с открытыми источниками. Портал reyestr.court.gov.ua публикует судебные решения в открытом доступе -- это публичная информация по Закону Украины «О доступе к публичной информации».

Причина не только этическая. Коммерческие API несут операционные риски: rate limits, блокировка токенов при bulk-загрузке, зависимость от третьей стороны. Конкретный инцидент: bulk-загрузка court_sessions (~35K запросов за 2.7 часа) привела к блокировке обоих API-токенов ZakonOnline, что вывело из строя продакшн-чат.

| Источник | Что получаем | Модель доступа |
|---------|-------------|----------------|
| **reyestr.court.gov.ua** | Полные тексты в RTF | HTTP GET, rate-limited, бесплатно |
| **data.gov.ua** | Метаданные (CSV dumps) | Bulk download, обновление ежедневно |
| **Коммерческие API** | То же + JSON | REST API, платно, токены блокируются |

## Модель данных

Прежде чем говорить о pipeline, стоит понять целевую схему. Мы разделили метаданные и полные тексты в две отдельные таблицы -- это ключевое архитектурное решение.

### Метаданные: edrsr_documents

\`\`\`sql
CREATE TABLE edrsr_documents (
  doc_id       BIGINT PRIMARY KEY,   -- PK из ЕГРСР, автоинкремент
  court_code   INTEGER,              -- FK на edrsr_courts (без constraint)
  judgment_code SMALLINT,            -- тип решения (приговор, определение, постановление)
  justice_kind SMALLINT,             -- вид судопроизводства
  category_code INTEGER,             -- категория дела (4106 категорий)
  cause_num    TEXT,                  -- номер дела
  adjudication_date TIMESTAMPTZ,     -- дата вынесения
  receipt_date TIMESTAMPTZ,          -- дата поступления в реестр
  judge        TEXT,                  -- судья/коллегия
  doc_url      TEXT,                  -- URL на RTF в реестре
  status       SMALLINT DEFAULT 0,
  date_publ    TIMESTAMPTZ
);
\`\`\`

**Намеренное отсутствие FK constraints.** Исходные данные с data.gov.ua содержат court_code, justice_kind, category_code, которые не всегда присутствуют в справочных таблицах. С FK constraints импорт ломается на каждой «грязной» строке. Без них -- мы импортируем всё, а валидацию делаем на уровне запросов.

**Почему \`doc_id BIGINT\`, а не \`UUID\`?** doc_id -- это натуральный ключ из ЕГРСР (автоинкремент). Он монотонно растёт, что даёт идеальный B-tree с минимальной фрагментацией при последовательном импорте. UUID дал бы случайные вставки по всему индексу -- на 60M строк это существенная разница в I/O.

**8 индексов** на типичные паттерны запросов: court_code, justice_kind, judgment_code, category_code, cause_num, judge, adjudication_date, receipt_date. Каждый обоснован реальным use case (фильтрация по суду, по виду судопроизводства, поиск по номеру дела).

### Полные тексты: edrsr_fulltext

\`\`\`sql
CREATE TABLE edrsr_fulltext (
  doc_id      BIGINT PRIMARY KEY,  -- join key к edrsr_documents
  full_text   TEXT,                -- plaintext после RTF-конвертации
  text_length INTEGER,             -- pre-computed для фильтрации
  created_at  TIMESTAMP DEFAULT NOW()
);
\`\`\`

**Почему отдельная таблица, а не колонка в edrsr_documents?** Три причины:

1. **TOAST-сегментация.** PostgreSQL хранит TEXT > 2 КБ в отдельных TOAST-страницах. Если full_text лежит в той же таблице, что и метаданные, то \`SELECT court_code, cause_num FROM edrsr_documents\` всё равно будет затрагивать TOAST-страницы при sequential scan. Отдельная таблица = чистый sequential scan по метаданным без overhead.

2. **Разные lifecycle.** Метаданные импортируются из CSV-дампов data.gov.ua (ежедневное обновление). Полные тексты загружаются с reyestr.court.gov.ua (одноразовый bulk + incremental). Разные источники, разные скрипты, разная частота.

3. **Независимый шардинг.** Полные тексты занимают 283 ГБ против ~12 ГБ метаданных. Шардить нужно только тексты, метаданные остаются в одной базе.

### Справочники

5 справочных таблиц: courts (685), instances (3), regions (27), justice_kinds (5), judgment_forms (10+), cause_categories (4106). Импортируются один раз, обновляются редко.

## Архитектура pipeline

Pipeline реализован как 4 независимых Python-скрипта. Каждый idempotent -- можно перезапускать без потери данных и дубликатов.

\`\`\`
┌─────────────────────┐    ┌──────────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│  1. Download RTF    │    │  2. Import from HDD  │    │  3. Monitor      │    │  4. Copy to Prod     │
│                     │    │                      │    │                  │    │                      │
│  asyncio + aiohttp  │───▶│  multiprocessing     │───▶│  PG aggregate    │───▶│  2-phase ETL         │
│  100 workers        │    │  12 CPU workers      │    │  + in-mem cache  │    │  200 psql workers    │
│  3 retries + backoff│    │  COPY FROM STDIN     │    │  cross-env stats │    │  TSV chunks on NVMe  │
│                     │    │  ON CONFLICT NOTHING  │    │                  │    │  ON CONFLICT NOTHING  │
│  reyestr.court.gov  │    │  HDD → PG local      │    │  local/stage/prod│    │  PG local → PG prod  │
│  → /tmp/edrsr-rtf/  │    │  18 TB /dev/sda1     │    │                  │    │  per-shard routing   │
└─────────────────────┘    └──────────────────────┘    └──────────────────┘    └──────────────────────┘
\`\`\`

### Этап 1: Загрузка RTF

**I/O-модель:** async HTTP GET → disk write. Network-bound задача, поэтому \`asyncio\` + \`aiohttp\` с \`TCPConnector(limit=100, limit_per_host=100)\`.

\`\`\`python
semaphore = asyncio.Semaphore(100)  # 100 concurrent downloads
# Retry: 3 attempts, exponential backoff (2s, 4s, 6s)
# 429 handling: sleep 5 * (attempt + 1) seconds
\`\`\`

**Resumability.** Перед загрузкой проверяем \`outpath.exists() and outpath.stat().st_size > 0\`. Если файл уже есть и не пустой -- пропускаем. Это позволяет перезапускать скрипт без повторной загрузки.

**Файловая конвенция:** \`{doc_id}.rtf\` -- doc_id является именем файла. Это даёт O(1) lookup без базы метаданных: \`int(filename[:-4])\` → doc_id.

### RTF-парсер: почему кастомный

RTF из ЕГРСР -- не обычный RTF. Это Windows-1251 кириллица, закодированная как \`\\\\'XX\` escape-последовательности внутри latin1-обёртки. Стандартные библиотеки (\`striprtf\`, \`pyrtf-ng\`) не различают Windows-1251 и latin1 байты и ломают кириллицу.

Наш парсер работает в 7 шагов:

\`\`\`
1. raw bytes → latin1 decode (RTF envelope)
2. Remove nested groups: {\\fonttbl ...}, {\\colortbl ...},
   {\\stylesheet ...}, {\\info ...}, {\\*\\ ...}
   (depth-tracking brace parser, O(n))
3. Strip \\rtf1 header
4. \\par → \\n, \\line → \\n, \\tab → \\t
5. \\\\'XX → Windows-1251 byte decode
6. \\uNNNNN → chr(code), range check 0..0x10FFFF
7. Strip remaining \\keyword sequences
8. Remove braces, null bytes, normalize newlines
9. UTF-8 surrogate cleanup: encode('utf-8', errors='surrogatepass')
                            .decode('utf-8', errors='replace')
\`\`\`

**Depth-tracking для вложенных групп.** RTF-группа \`{\\fonttbl {\\f0 Times;}}\` может иметь произвольную глубину вложенности. Парсер отслеживает баланс \`{}\` и удаляет всю группу от открывающей до закрывающей скобки на том же уровне. Сложность O(n) по длине документа.

**Точность:** 99.5% на корпусе ~1000 вручную проверенных документов. 0.5% ошибок -- документы с нестандартными RTF-расширениями (встроенные изображения, OLE-объекты), где текст всё равно извлекается, но с артефактами.

### Этап 2: Массовый импорт с HDD

Это главная рабочая лошадка pipeline. Все RTF-файлы лежат на 18 ТБ HDD (\`/dev/sda1\`), и скрипт должен конвертировать их в текст и загрузить в PostgreSQL.

**Почему multiprocessing, а не asyncio?** RTF-конвертация -- CPU-bound: 7 regex замен, итерация по символам для depth-tracking, encode/decode. Python GIL блокирует параллельное выполнение CPU-bound кода в тредах. \`multiprocessing.Pool\` с 12 воркерами (= количество ядер) обходит GIL через отдельные процессы.

\`\`\`python
Pool(processes=12, initializer=_init_worker, initargs=(rtf_lookup,))
pool.map(convert_one, batch_ids, chunksize=50)
\`\`\`

**\`chunksize=50\`:** баланс между overhead на IPC (передача задач между процессами) и granularity. При chunksize=1 IPC overhead доминирует. При chunksize=1000 один медленный файл блокирует весь чанк.

#### I/O-паттерн: scandir вместо stat

На HDD с 15M+ файлов \`os.stat()\` -- bottleneck. Каждый stat() -- отдельный I/O seek на шпиндельном диске. При 15M файлов это ~4 часа только на stat().

\`\`\`python
# Один проход scandir -- построение lookup O(n)
rtf_lookup: dict[int, Path] = {}
for entry in os.scandir(rtf_dir):   # readdir, без stat()
    if entry.name.endswith('.rtf'):
        doc_id = int(entry.name[:-4])
        rtf_lookup[doc_id] = rtf_dir / entry.name
\`\`\`

\`os.scandir()\` вызывает \`readdir()\` системного уровня, который возвращает имена файлов без stat(). Это один sequential read директории вместо 15M random seeks.

#### Idempotent upsert через temp-таблицу

Критический паттерн для любого data pipeline на больших объёмах:

\`\`\`sql
CREATE TEMP TABLE _ft_tmp (doc_id bigint, full_text text);
COPY _ft_tmp FROM stdin;            -- bulk load во временную
INSERT INTO edrsr_fulltext(doc_id, full_text)
SELECT doc_id, full_text FROM _ft_tmp
ON CONFLICT (doc_id) DO NOTHING;    -- idempotent: дубликаты игнорируются
DROP TABLE _ft_tmp;
\`\`\`

**Почему не прямой \`COPY INTO edrsr_fulltext\`?** COPY не поддерживает ON CONFLICT. Если в batch есть doc_id, который уже существует, весь COPY падает. Temp-таблица + INSERT ON CONFLICT -- это staging area с дедупликацией.

**Почему не \`INSERT ... ON CONFLICT DO UPDATE\`?** DO NOTHING дешевле: не генерирует WAL для неизменённых строк. Тексты не меняются после первого импорта, поэтому UPDATE не нужен.

#### Проверка уже импортированных

Перед конвертацией скрипт выгружает existing doc_id:

\`\`\`python
SELECT doc_id FROM edrsr_fulltext WHERE doc_id BETWEEN {min_id} AND {max_id};
to_import = sorted(set(rtf_lookup.keys()) - existing)
\`\`\`

Это set difference на уровне Python -- O(n). Для 30M doc_id это ~2 ГБ памяти (64 байта на int в set), что приемлемо.

### Этап 3: Мониторинг и PostgreSQL shared memory

Когда импортируешь миллионы записей, нужна observability. Мы построили админ-страницу с cross-environment агрегацией:

- KPI-карточки: total metadata, total fulltext, coverage %
- Таблица по годам с progress bars
- Данные из local, stage, prod (через \`/api/internal/edrsr-stats\`)
- Auto-refresh каждые 30 секунд

#### Инцидент: PG error 53100

\`\`\`
could not resize shared memory segment -- No space left on device
\`\`\`

**Root cause.** Запрос \`LEFT JOIN edrsr_documents (45M) x edrsr_fulltext\` с \`GROUP BY EXTRACT(YEAR FROM adjudication_date)\` требовал hash join. PostgreSQL аллоцирует hash table в shared memory. С \`work_mem=256MB\` одна такая операция съедала весь \`shm_size\` контейнера (Docker default: 64 МБ).

Auto-refresh frontend каждые 30с = ~120 таких запросов/час. Каждый -- потенциальный OOM на shared memory.

**Три уровня защиты:**

**1. Query decomposition.** Вместо одного JOIN -- два отдельных COUNT:

\`\`\`sql
-- Query 1: metadata counts
SELECT EXTRACT(YEAR FROM adjudication_date)::int AS year,
       COUNT(*)::int AS total FROM edrsr_documents GROUP BY year;

-- Query 2: fulltext counts
SELECT EXTRACT(YEAR FROM d.adjudication_date)::int AS year,
       COUNT(f.doc_id)::int AS with_fulltext
FROM edrsr_documents d
LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id GROUP BY year;
\`\`\`

Merge происходит в Node.js. Каждый запрос работает с меньшим hash table.

**2. work_mem throttling.** \`SET LOCAL work_mem='32MB'\` в транзакции. 32 МБ вместо 256 МБ -- 8x меньше давления на shared memory. \`SET LOCAL\` сбрасывается после транзакции, не влияет на другие соединения.

**3. In-memory cache (TTL 5 мин).** Node.js Map с timestamp. Идентичные ответы отдаются из кеша. 120 запросов/час → 12 запросов/час.

**Safety net:** \`shm_size: 2g\` в Docker Compose. Не фикс, а страховка.

## Архитектура шардинга: 4 базы на одном PostgreSQL

### Capacity planning

\`\`\`
60M строк × ~4.7 КБ средний размер (текст + overhead) = ~283 ГБ
EC2 t3.xlarge: 4 vCPU, 16 ГБ RAM, EBS gp3
shared_buffers = 4 ГБ (25% RAM)
effective_cache_size = 12 ГБ
\`\`\`

283 ГБ данных при 4 ГБ shared_buffers означает buffer hit ratio ~1.4%. Для sequential scan (VACUUM, ANALYZE) это приемлемо. Для point lookups по doc_id (PK) -- B-tree индекс ~2.8 ГБ помещается в shared_buffers.

**Проблема single-database:** \`pg_dump\` 283 ГБ -- это ~4 часа. Если упадёт на 90% -- начинаете сначала. \`VACUUM FULL\` на таблице 283 ГБ -- нужен двойной дисковый объём (566 ГБ). autovacuum на 60M строк с большим dead tuple ratio может работать часами.

### Стратегия шардинга

Application-level sharding по \`doc_id\` ranges. 4 отдельные базы в одном PostgreSQL-контейнере:

| Шард | База | Диапазон doc_id | Строк | Размер | Backup time |
|------|------|----------------|--------|--------|-------------|
| S1 | \`secondlayer_prod\` | < 112M | ~24M | 146 ГБ | ~90 мин |
| S2 | \`secondlayer_prod_ft2\` | 112M--150M | ~26M | 101 ГБ | ~60 мин |
| S3 | \`secondlayer_prod_ft3\` | 150M--175M | ~8M | 27 ГБ | ~15 мин |
| S4 | \`secondlayer_prod_ft4\` | > 175M | ~2M | 8 ГБ | ~2 мин |

**Почему не нативный partitioning?** Declarative range partitions решили бы проблему VACUUM (каждая partition -- отдельный heap), но НЕ \`pg_dump\`: все партиции живут в одной базе, и дамп/рестор работает на уровне базы целиком. С отдельными базами -- 4 независимых \`pg_dump | pg_restore\` параллельно.

**Почему не Citus?** Citus требует coordinator + workers (минимум 2 ноды) или managed-сервис. Наш access pattern -- point lookups по \`doc_id\` -- не требует distributed query planning. Также Citus не даёт независимых backup domains.

**Почему не FDW (Foreign Data Wrappers)?** Рассматривали \`postgres_fdw\` для прозрачного cross-shard query. Отвергли: fdw добавляет latency (~2ms overhead на запрос), не поддерживает pushdown для всех операций, и усложняет backup (fdw-таблицы не дампятся стандартным pg_dump).

### Маршрутизация запросов

Ключ шардинга -- \`doc_id\` (BIGINT). Монотонно растёт, поэтому range sharding естественен:

\`\`\`
doc_id < 112,000,000        → secondlayer_prod      (S1)
112M ≤ doc_id < 150,000,000 → secondlayer_prod_ft2  (S2)
150M ≤ doc_id < 175,000,000 → secondlayer_prod_ft3  (S3)
doc_id ≥ 175,000,000        → secondlayer_prod_ft4  (S4)
\`\`\`

Backend маршрутизирует на уровне connection pool: 4 пула PgBouncer, каждый на свою базу. Для нового шарда -- добавить базу, пул и обновить range map.

**Мониторинг:** endpoint \`/api/internal/edrsr-stats\` собирает count со всех шардов через \`pg_class.reltuples\` (approximate count, O(1)) вместо \`COUNT(*)\` (sequential scan, O(n)).

### Trade-offs

| Аспект | Плюс | Минус |
|--------|------|-------|
| Backup | Независимый per-shard (ft4 = 2 мин) | 4 отдельных cron jobs |
| VACUUM | Параллельный, меньшие таблицы | 4 autovacuum workers |
| Queries | Point lookup O(log n) | Cross-shard JOIN только в Node.js |
| Connections | Изолированные пулы | 4× connection overhead в PgBouncer |
| Ops | Можно дропнуть/перестроить один шард | Ручной range management |

## Копирование на продакшн: двухфазный ETL

Перенести 60M строк (283 ГБ) с локального PG на 4 шарда продакшна через сеть -- отдельная инженерная задача. Скрипт \`copy-fulltext-to-prod.py\` реализует двухфазный подход.

### Фаза 1: Export (sequential read → TSV chunks)

\`\`\`python
# Один streaming COPY из local PG → TSV-файлы на NVMe
export_sql = "\\\\COPY (SELECT doc_id, full_text FROM edrsr_fulltext "
             f"WHERE {where} ORDER BY doc_id) TO STDOUT WITH (FORMAT text)"

proc = subprocess.Popen(LOCAL_CMD + ["-c", export_sql], stdout=PIPE)
for line in proc.stdout:  # streaming, без накопления в памяти
    current_file.write(line)
    if line_count >= chunk_size:  # default 5000 строк
        rotate_to_next_chunk()
\`\`\`

**Почему TSV, а не CSV?** COPY text format (TSV) -- native PostgreSQL формат. Не нужен CSV parsing на стороне приёма. Escaping проще: tab-separated, backslash-escaping.

**Почему chunk files, а не pipe?** Resumability. Если сеть упадёт на 70% upload -- restart подберёт неотправленные чанки. Каждый чанк = atomic unit of work.

**I/O pattern:** Sequential read из local PG (NVMe) → sequential write в \`/tmp/edrsr-ft-chunks/\`. Один поток, без конкуренции за диск.

### Фаза 2: Upload (parallel workers → prod PG)

\`\`\`python
Pool(processes=200)  # 200 параллельных psql-процессов
pool.imap_unordered(upload_chunk, chunk_files, chunksize=1)
\`\`\`

Каждый воркер:

1. Читает TSV-чанк с диска (~5000 строк, ~25 МБ)
2. Формирует SQL: \`CREATE TEMP TABLE\` → \`COPY FROM STDIN\` → \`INSERT ON CONFLICT\` → \`DROP TABLE\`
3. Выполняет через \`subprocess.run(["psql", "-h", prod_host, ...])\`
4. Парсит stdout на \`INSERT 0 N\` для подсчёта скопированных
5. Удаляет чанк-файл после успеха

**Почему psql subprocess, а не psycopg2?** Python GIL. 200 тредов с psycopg2 сериализуются на GIL при обработке сетевых буферов. 200 subprocess -- это 200 отдельных процессов, каждый со своим TCP-соединением. Полная утилизация сетевой пропускной способности.

**\`SET lock_timeout = '5min'\`** на каждом чанке -- защита от deadlock при конкурентных INSERT в один шард.

**Resumability:** Чанки удаляются только после успешного INSERT. \`--skip-export\` позволяет перезапустить только фазу upload из имеющихся чанков. \`--resume-from-doc-id\` позволяет доэкспортировать новые данные к существующим чанкам.

**Прогресс:** каждые 200 чанков: copied, skipped (already exist), errors, rows/s, ETA.

### Размер воркер-пула: почему 200?

Продакшн PostgreSQL: \`max_connections=500\`, PgBouncer в transaction mode. 200 воркеров = 200 concurrent connections. Каждый воркер держит соединение ~2-5 секунд (COPY + INSERT). При 200 workers и chunk_size=5000: throughput ~100K-200K rows/s, в зависимости от сетевой латентности.

500 воркеров -- oversaturation: PG начинает тротлить на lock contention (concurrent INSERT в тот же индекс). 100 воркеров -- недогрузка сети. 200 -- эмпирический оптимум для нашего EC2 \`t3.xlarge\`.

## Data quality

| Метрика | Значение |
|---------|----------|
| RTF-конвертация: точность | 99.5% (manual validation, n=1000) |
| Покрытие по годам (2021-2026) | 94-97% |
| Gaps | 3-6% -- документы без RTF (только метаданные) |
| Дубликаты | 0 (ON CONFLICT DO NOTHING) |
| Encoding errors | <0.1% (surrogate replacement) |

**3-6% gap** -- это документы, для которых ЕГРСР не публикует полный текст (закрытые производства, решения с ограниченным доступом по ЗУ «О судоустройстве и статусе судей»).

## Результаты

| Метрика | Значение |
|---------|----------|
| Полных текстов на проде | ~60,000,000 |
| Шардов | 4 (одна PG инстанция, EC2 t3.xlarge) |
| Общий размер | 283 ГБ (EBS gp3) |
| Индексы (B-tree PK) | ~2.8 ГБ per shard |
| Backup S4 (8 ГБ) | ~2 мин |
| Backup S1 (146 ГБ) | ~90 мин |
| Воркеров загрузки | 100 (asyncio) |
| Воркеров конвертации | 12 (multiprocessing) |
| Воркеров продакшн-копии | 200 (subprocess) |
| Pipeline idempotent | Да (ON CONFLICT DO NOTHING + file-level resume) |

## Что дальше

Полные тексты -- это сырьё для двух следующих слоёв:

1. **Векторные эмбеддинги.** 60M × 1536 dim (text-embedding-ada-002) = ~350 ГБ в Qdrant. Это потребует batch-embedding pipeline с rate limiting (OpenAI TPM), chunking длинных текстов и incremental update strategy.

2. **Semantic sectioning.** Разбиение решений на логические секции (мотивировочная часть, резолютивная часть, особое мнение) для более точного поиска. SemanticSectionizer уже работает для отдельных документов, но batch-обработка 60M -- отдельный вызов.

---

*Открытые данные -- это не компромисс. Это архитектурное решение. 60 миллионов полных текстов, 283 ГБ на 4 шардах, idempotent pipeline с нулевой толерантностью к потере данных -- и всё построено на публичных источниках, без зависимости от коммерческих API.*`,
  },
  'chat-latency-optimization': {
    title: 'Как мы уменьшили латентность чата: 7 фаз оптимизации',
    punchline: 'От 12 секунд до 2.8 — история о том, как мы превратили медленный юридический чат в инструмент, которым приятно пользоваться',
    readTime: '9 мин',
    content: `# Как мы уменьшили латентность чата: 7 фаз оптимизации

*Когда юрист задаёт вопрос системе искусственного интеллекта, каждая секунда ожидания — это секунда, когда он начинает сомневаться в технологии. Вот как мы сократили время ответа с 12 секунд до 2.8.*

---

## Исходная точка: почему чат был медленным

LEX AI работает не как обычный чат-бот. Наш ChatService реализует агентный цикл: получив запрос пользователя, LLM самостоятельно решает, какие инструменты вызвать, анализирует результаты и может сделать до 5 итераций прежде чем сформировать финальный ответ. Типичный запрос вроде «Какая судебная практика по возмещению морального ущерба при ДТП?» проходит такой путь:

1. LLM анализирует запрос и выбирает инструменты
2. Вызов \`search_court_decisions\` (семантический поиск в Qdrant + PostgreSQL)
3. Вызов \`get_court_decision\` для 3-5 найденных решений
4. LLM анализирует тексты и формирует ответ
5. SSE стриминг результата клиенту

Каждый шаг — это сетевой запрос, и они выполнялись **последовательно**. Мы профилировали типичный запрос и получили такую картину:

| Этап | Время (мс) | Доля |
|------|----------|--------|
| Первый вызов LLM (выбор инструментов) | 2,400 | 20% |
| Поиск в Qdrant (эмбеддинг + query) | 1,800 | 15% |
| Загрузка 4 решений из ZakonOnline | 4,200 | 35% |
| Второй вызов LLM (анализ + ответ) | 3,100 | 26% |
| Сериализация, SSE, накладные расходы | 500 | 4% |
| **Итого** | **12,000** | **100%** |

Медиана ответа — 12 секунд. P95 — 18.4 секунды. Для интерактивного чата это неприемлемо.

---

## Фаза 1: Параллельное выполнение инструментов

**Проблема:** Когда LLM запрашивал вызов нескольких инструментов одновременно (например, \`search_court_decisions\` + \`get_legislation_section\`), мы выполняли их последовательно через простой \`for...of\` цикл.

**Решение:** Заменили последовательное выполнение на \`Promise.allSettled()\`:

\`\`\`typescript
// Было:
for (const toolCall of toolCalls) {
  const result = await this.executeTool(toolCall);
  results.push(result);
}

// Стало:
const promises = toolCalls.map(tc => this.executeTool(tc));
const settled = await Promise.allSettled(promises);
\`\`\`

Мы добавили семафор с ограничением в 6 параллельных вызовов, чтобы не перегрузить ни ZakonOnline API, ни базу. Каждый вызов получил индивидуальный таймаут в 8 секунд вместо общего.

**Результат:** -2,100 мс на запросах с 3+ инструментами. Наибольший выигрыш — когда LLM запрашивает сразу 4-5 судебных решений.

---

## Фаза 2: SSE стриминг с первого токена

**Проблема:** Мы ждали полный ответ от LLM и только тогда отправляли его клиенту одним SSE-сообщением. Пользователь видел пустой экран 3+ секунды во время генерации текста.

**Решение:** Переключили OpenAI API на режим \`stream: true\` и пробросили токены напрямую в SSE:

\`\`\`typescript
// SSE события теперь летят по мере генерации
for await (const chunk of openaiStream) {
  const token = chunk.choices[0]?.delta?.content;
  if (token) {
    res.write(\\\`data: \\\${JSON.stringify({ type: 'token', content: token })}\\\\n\\\\n\\\`);
  }
}
\`\`\`

На фронтенде \`useAIChat()\` хук теперь обновляет UI на каждый полученный токен. Первый текст появляется через 200-400 мс после начала генерации.

**Результат:** Воспринимаемая латентность (Time to First Token) упала с 3,100 мс до 380 мс. Общее время не изменилось, но UX улучшился кардинально.

---

## Фаза 3: Кеширование на уровне инструментов

**Проблема:** Один и тот же запрос \`get_court_decision\` для популярного решения Верховного Суда вызывался десятки раз в день, каждый раз обращаясь к ZakonOnline API.

**Решение:** Добавили трёхступенчатый кеш: Redis (TTL 4 часа) -> PostgreSQL (TTL 30 дней) -> API:

\`\`\`typescript
async getDocumentFullText(docId: string): Promise<string> {
  const cached = await this.redis.get(\\\`doc:fulltext:\\\${docId}\\\`);
  if (cached) return cached; // ~2ms

  const pgCached = await this.db.query(
    'SELECT full_text FROM document_cache WHERE zakononline_id = $1', [docId]
  );
  if (pgCached.rows[0]) {
    await this.redis.setex(\\\`doc:fulltext:\\\${docId}\\\`, 14400, pgCached.rows[0].full_text);
    return pgCached.rows[0].full_text; // ~15ms
  }

  const text = await this.zoAdapter.fetchFullText(docId); // ~800ms
  // ... сохранить в оба кеша
  return text;
}
\`\`\`

После недели работы cache hit rate стабилизировался на 73% для Redis и 91% для PostgreSQL.

**Результат:** -1,900 мс на повторных запросах (большинство). Экономия трафика к ZakonOnline: ~68%.

---

## Фаза 4: Пул соединений и keep-alive

**Проблема:** Каждый HTTP-запрос к ZakonOnline открывал новое TCP-соединение. TLS handshake добавлял 120-180 мс на каждый вызов.

**Решение:** Настроили HTTP Agent с keep-alive и пулом:

\`\`\`typescript
const zoAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 15,
  maxFreeSockets: 5,
  timeout: 10000,
});
\`\`\`

Также увеличили пул PostgreSQL-соединений с 10 до 25 (через PgBouncer в transaction mode) и включили pipelining в Redis.

**Результат:** -380 мс на каждый внешний вызов после первого. При 4 вызовах за запрос — это -1,100 мс суммарно.

---

## Фаза 5: Оптимизация промптов

**Проблема:** Системный промпт для ChatService содержал 2,800 токенов — детальное описание всех 36 инструментов, формат ответа, юридическая терминология. LLM тратил время на обработку этого контекста при каждой итерации.

**Решение:** Мы реструктурировали промпт:

- Сократили описание инструментов до ключевых параметров (с 2,800 до 1,400 токенов)
- Добавили \`DOMAIN_TOOL_MAP\` — короткую маршрутизацию по домену запроса вместо полного списка
- Перенесли примеры использования из системного промпта в few-shot секцию, которая добавляется только при первом вызове

**Результат:** -420 мс на каждом вызове LLM. При 2 вызовах за запрос — -840 мс.

---

## Фаза 6: Предварительный расчёт эмбеддингов

**Проблема:** Каждый поисковый запрос генерировал эмбеддинг через OpenAI text-embedding-ada-002 — это 300-600 мс на API-вызов.

**Решение:** Ввели кеш эмбеддингов в Redis с нормализацией запросов:

\`\`\`typescript
function normalizeQuery(q: string): string {
  return q.toLowerCase().trim()
    .replace(/[\\u00AB\\u00BB"']/g, '')
    .replace(/\\s+/g, ' ');
}

const cacheKey = \\\`emb:\\\${crypto.createHash('md5')
  .update(normalizeQuery(query)).digest('hex')}\\\`;
\`\`\`

Дополнительно реализовали фоновую задачу, которая каждую ночь пре-вычисляет эмбеддинги для топ-200 самых частых запросов из аналитики.

**Результат:** -450 мс для повторных запросов (cache hit ~41% в первую неделю, ~58% через месяц).

---

## Фаза 7: Материализация результатов поиска

**Проблема:** Семантический поиск в Qdrant возвращал ID документов, после чего мы делали N запросов к PostgreSQL для получения метаданных (название суда, дата, номер дела).

**Решение:** Создали материализованный view, который обновляется каждые 15 минут:

\`\`\`sql
CREATE MATERIALIZED VIEW mv_court_decision_search AS
SELECT d.zakononline_id, d.title, d.court_name, d.case_number,
       d.judgment_date, d.justice_kind, d.doc_type,
       LEFT(d.full_text, 500) AS snippet
FROM court_decisions d
WHERE d.full_text IS NOT NULL;

CREATE INDEX idx_mv_search_zoid ON mv_court_decision_search(zakononline_id);
\`\`\`

Теперь после получения ID из Qdrant мы делаем один batch-запрос к материализованному view вместо N отдельных.

**Результат:** -680 мс при поиске с 10+ результатами.

---

## Итог: до и после

| Метрика | До | После | Изменение |
|---------|-----|-------|-------|
| Медиана ответа (p50) | 12.0 с | 2.8 с | -77% |
| P95 | 18.4 с | 5.2 с | -72% |
| Time to First Token | 3,100 мс | 380 мс | -88% |
| Cache hit rate (Redis) | 0% | 73% | -- |
| Внешние API-вызовы/запрос | 6.2 | 2.1 | -66% |
| Стоимость OpenAI за запрос | $0.034 | $0.021 | -38% |

Наибольшее влияние оказали три вещи: параллельное выполнение инструментов (фаза 1), кеширование (фаза 3) и стриминг (фаза 2, для восприятия). Остальные фазы дали меньший, но стабильный выигрыш, который накапливается.

---

## Вывод

Оптимизация латентности в LLM-системах — это не одна серебряная пуля, а комбинация подходов на каждом уровне стека. Парадоксально, но наибольшее влияние на удовлетворённость пользователей оказало не сокращение общего времени, а стриминг первого токена. Юрист, который видит, что система «думает» и постепенно формирует ответ, готов ждать значительно дольше, чем тот, кто смотрит на пустой экран.`,
  },
  'bedrock-llm-fallback': {
    title: 'AWS Bedrock как LLM-провайдер: от OpenAI fallback до Claude + Nova Pro',
    punchline: 'Один SDK вместо двух библиотек. IAM вместо API-ключей. Данные в ЕС вместо США. Единый биллинг вместо двух инвойсов. Вот как мы перевели весь fallback-слой на AWS Bedrock — и почему это изменило больше, чем мы ожидали.',
    readTime: '7 мин',
    content: `# AWS Bedrock как LLM-провайдер: от OpenAI fallback до Claude + Nova Pro

*Как один PR изменил архитектуру fallback-слоя и почему API-ключи — это вчерашний день*

---

## Проблема: два API-ключа, два биллинга, ноль гарантий

LEX AI обрабатывает тысячи юридических запросов ежедневно. Каждый запрос — это вызов LLM: классификация намерения, поиск по базе, анализ решения суда, генерация ответа. Когда OpenAI ложится (а это случается чаще, чем хотелось бы), платформа должна продолжать работать.

Раньше мы использовали Anthropic API как fallback-провайдер. Это работало, но создавало ряд проблем:

| Проблема | Последствие |
|----------|----------|
| Два отдельных API-ключа | Ротация секретов x 2, риск утечки x 2 |
| Два биллинга | Ежемесячная сверка двух инвойсов, невозможность Reserved Capacity |
| Данные летят в США | Anthropic API не гарантирует EU-резидентность |
| Rate limits на уровне ключа | При всплеске нагрузки fallback тоже ограничен |
| Round-robin провалился | Мы уже [писали об этом](/blog?article=round-robin-llm) — разные форматы ответов ломали парсинг |

Нам нужен был единый fallback-провайдер, который даёт доступ к нескольким моделям через один SDK, с IAM-авторизацией и данными в пределах ЕС.

## Решение: AWS Bedrock

AWS Bedrock — это managed-сервис, который предоставляет доступ к моделям разных вендоров через единый API. Один SDK, одна авторизация (IAM), один биллинг, выбор региона.

Через Bedrock мы получили доступ сразу к двум семействам моделей:

- **Claude (Anthropic)** — через Bedrock, без отдельного API-ключа
- **Amazon Nova** — собственные модели AWS, оптимизированные под цену

### Budget-aware модельные тиры

Наш \`ModelSelector\` уже поддерживал три тира производительности. Мы просто заменили fallback-модели:

| Тир | Назначение | Primary (OpenAI) | Fallback (Bedrock) |
|-----|-------------|-------------------|---------------------|
| \`quick\` | Классификация, роутинг | gpt-5-nano | Amazon Nova Micro |
| \`standard\` | Выполнение тулов, суммаризация | gpt-5-mini | Amazon Nova Lite |
| \`deep\` | Юридический анализ, паттерны | gpt-5.1 | Amazon Nova Pro |

Nova Micro и Nova Lite закрывают дешёвые задачи, а Nova Pro — полноценная альтернатива для сложного анализа. Claude через Bedrock остаётся доступным для случаев, где нужно именно его качество reasoning.

## Миграция: что изменилось в коде

### До: два клиента, два формата

\`\`\`typescript
// Было: прямое подключение к Anthropic API
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // ещё один секрет
});
\`\`\`

### После: единый AWS SDK

\`\`\`typescript
// Стало: Bedrock через AWS SDK
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({
  region: 'eu-central-1', // данные остаются в ЕС
  // IAM авторизация — никаких API-ключей
});
\`\`\`

Ключевое изменение — **Converse API**. Это унифицированный интерфейс Bedrock, который принимает одинаковый формат сообщений независимо от модели. Тот же код работает и для Nova Pro, и для Claude через Bedrock. Никакого парсинга разных форматов — проблема, которая убила наш round-robin.

## Авторизация: IAM вместо API-ключей

Это, пожалуй, самый большой выигрыш. Вместо хранения \`ANTHROPIC_API_KEY\` в .env-файлах на каждом сервере, мы используем IAM-роль EC2-инстанса:

\`\`\`json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": "arn:aws:bedrock:eu-central-1::foundation-model/*"
}
\`\`\`

Никаких секретов в переменных окружения. Никакой ротации ключей. Credentials берутся автоматически из Instance Metadata Service. Одним вектором атаки меньше.

## Результаты

| Метрика | До (Anthropic API) | После (Bedrock) | Изменение |
|---------|---------------------|-----------------|-------|
| Fallback latency (p50) | 1.8s | 1.2s | -33% |
| Fallback latency (p99) | 8.4s | 4.1s | -51% |
| Стоимость fallback-запросов | $0.018/запрос | $0.011/запрос | -39% |
| Секретов в .env | 4 (2 OpenAI + 2 Anthropic) | 2 (только OpenAI) | -50% |
| Данные в EU | Не гарантировано | eu-central-1 | Гарантировано |

Снижение latency объясняется двумя факторами: EC2 -> Bedrock — это трафик внутри AWS-региона (без выхода в интернет), а Nova Pro просто быстрее Claude для типичных юридических задач.

## Provisioned Throughput: следующий шаг

Bedrock позволяет купить Provisioned Throughput — гарантированную пропускную способность для конкретной модели. Для нас это значит:

- **Предсказуемая стоимость**: фиксированная цена вместо pay-per-token
- **Гарантированный SLA**: никаких 429 (rate limit) при всплеске нагрузки
- **Планирование бюджета**: ежемесячная сумма известна заранее

Мы планируем активировать Provisioned Throughput для Nova Pro на \`deep\`-тире, где предсказуемость важнее всего — юридический анализ не может ждать в очереди.

## Выводы

Один PR, но архитектурное изменение ощутимо:

1. **IAM вместо API-ключей** — меньше секретов, меньше риска
2. **EU data residency** — данные не покидают eu-central-1
3. **Единый биллинг** — AWS Cost Explorer вместо двух инвойсов
4. **Converse API** — один формат для всех моделей
5. **Nova Pro** — более дешёвый и быстрый fallback для юридического анализа

Если ваша платформа использует несколько LLM-провайдеров и вы устали от зоопарка API-ключей — посмотрите на Bedrock. Это не серебряная пуля, но для fallback-сценария это самое элегантное решение, которое мы нашли.`,
  },
  'erb-nbu-due-diligence': {
    title: 'Реестр должников и банки НБУ: новые инструменты для due diligence',
    punchline: 'LEX AI теперь проверяет контрагентов в Едином реестре должников и верифицирует банки через реестр НБУ — автоматически, в один запрос. 18 реестров вместо 16.',
    readTime: '5 мин',
    content: `# Реестр должников и банки НБУ: новые инструменты для due diligence

*Два новых реестра в LEX AI — проверка должников и банковских лицензий теперь занимает секунды, а не часы.*

---

## Проблема: слепые зоны в проверке контрагентов

Каждый юрист, который сопровождает сделки или готовит заключения due diligence, знает ощущение неполноты. Вы проверили контрагента в ЕГР, посмотрели судебные дела, нашли сведения о бенефициарах — но остаются вопросы. Нет ли у компании принудительных взысканий? Платёжеспособен ли банк, через который проводится расчёт?

До сегодняшнего дня LEX AI покрывал 16 реестровых проверок. Теперь добавлено два критических источника: **Единый реестр должников (ЕРД)** Министерства юстиции и **реестр банков НБУ**.

## Что дают новые инструменты

### Единый реестр должников (ЕРД)

ЕРД содержит сведения о физических и юридических лицах, в отношении которых открыто исполнительное производство. Это фактически реестр тех, кто имеет непогашенные долги по решениям судов, налоговых органов или иных уполномоченных субъектов.

| Параметр | Что показывает |
|---|---|
| ФИО / название юрлица | Идентификация должника |
| Код ЕГРПОУ / ИНН | Точная привязка к субъекту |
| Номер исполнительного производства | Конкретное производство |
| Категория взыскания | Алименты, штрафы, долги по договорам и т.д. |
| Состояние производства | Открытое, завершённое, возвращённое |
| Орган исполнения | Государственная или частная исполнительная служба |

### Реестр банков НБУ

Реестр Национального банка Украины содержит официальные данные обо всех банковских учреждениях страны: действующих, в процессе ликвидации и тех, что утратили лицензию.

| Параметр | Что показывает |
|---|---|
| Название банка | Официальное и сокращённое название |
| Код ЕГРПОУ | Идентификация юрлица |
| Наличие лицензии | Действующая, отозванная, аннулированная |
| Статус банка | Платёжеспособный, неплатёжеспособный, в ликвидации |
| Дата регистрации | Когда банк внесён в реестр |
| Контактные данные | Адрес, телефон, вебсайт |

## Практические сценарии

### Сценарий 1: Проверка контрагента перед заключением договора

Юрист компании готовит заключение по потенциальному поставщику. Один запрос к LEX AI — и среди результатов появляется информация: у поставщика есть три открытых исполнительных производства на общую сумму более 2 млн грн. Категория — долги по договорам поставки. Это сигнал: контрагент систематически не рассчитывается с партнёрами.

Без ЕРД юрист должен был бы отдельно заходить на сайт Минюста, вручную вводить данные и анализировать результат. Теперь это часть единого отчёта.

### Сценарий 2: Размещение депозита или выбор банка для эскроу

Клиент планирует разместить значительную сумму на депозите или стороны выбирают банк для эскроу-счёта в рамках M&A сделки. Запрос через LEX AI подтверждает: банк имеет действующую лицензию, статус — платёжеспособный, работает с 2004 года. Или наоборот — выясняется, что банк находится в процессе ликвидации, и размещать средства категорически нельзя.

### Сценарий 3: Комплексный due diligence при M&A

При подготовке к приобретению компании юридическая команда проверяет целевую компанию и её руководителей. LEX AI одновременно:

- ищет компанию и её должностных лиц в ЕРД;
- проверяет банки, в которых компания обслуживается, через реестр НБУ;
- дополняет картину данными из ЕГР, судебного реестра и реестра бенефициаров.

Результат — целостный отчёт вместо разрозненных справок из десяти источников.

## Как это работает технически

Вам не нужно знать детали реализации. Достаточно сформулировать запрос естественным языком:

- *«Проверь ООО Строительный Альянс в реестре должников»*
- *«Платёжеспособен ли ПриватБанк?»*
- *«Сделай полную проверку контрагента — код ЕГРПОУ 12345678»*

LEX AI сам определит, какие реестры нужно опросить, и вернёт структурированный результат.

## Итог: 18 реестров в одном интерфейсе

С добавлением ЕРД и реестра банков НБУ платформа LEX AI покрывает **18 реестровых проверок** для due diligence. Это значит меньше ручной работы, меньше риска пропустить критическую информацию и более быстрый результат для клиента.

Новые инструменты уже доступны всем пользователям платформы.`,
  },
  'server-side-evidence': {
    title: 'Server-side evidence extraction: как мы вынесли анализ доказательств на бэкенд',
    punchline: 'Фронтенд парсил доказательства из текста ответа regex-ами — мобильный Safari зависал на секунду. Мы перенесли извлечение доказательств на бэкенд, добавили SSE-событие evidence, и теперь клиент просто рендерит готовые объекты. Время до первого доказательства: с 2.1с до 0.8с.',
    readTime: '6 мин',
    content: `# Server-side evidence extraction: как мы вынесли анализ доказательств на бэкенд

*Когда парсинг на клиенте перестал справляться — мы перенесли разбор доказательств туда, где ему место.*

---

## Проблема

LEX AI возвращает пользователю не просто текст. Каждый ответ содержит доказательства: фрагменты судебных решений, статьи законодательства, выдержки из документов. Раньше весь этот поток приходил как единый текстовый блок, и фронтенд должен был самостоятельно разбирать его на структурированные карточки.

На десктопе это работало приемлемо. На мобильных устройствах — нет.

**Симптомы, которые мы наблюдали:**

| Проблема | Причина |
|---|---|
| UI freezes на 300-800 мс | Парсинг больших ответов блокировал main thread |
| Неправильное выделение доказательств | Regex-эвристики не покрывали все форматы |
| Дублирование логики | Каждый клиент (веб, мобайл, MCP) писал свой парсер |
| Ухудшение при масштабировании | Чем больше доказательств — тем медленнее рендер |

Когда ответ содержал 15-20 доказательств (типичная ситуация для анализа судебной практики), мобильный Safari просто зависал на секунду. Пользователи это замечали.

## Архитектурное решение

Вместо того, чтобы оптимизировать клиентский парсер, мы поставили вопрос иначе: зачем вообще парсить на клиенте то, что бэкенд уже знает?

Когда ChatService вызывает инструменты (search_court_decisions, get_legislation_section, vault_search), он получает структурированные данные. Потом LLM генерирует текстовый ответ, а клиент пытается из текста извлечь обратно ту же структуру. Это лишний цикл.

**Решение: бэкенд извлекает доказательства во время генерации ответа и отправляет их отдельными SSE-событиями.**

### Поток данных: до и после

**Раньше:**

\`\`\`
Backend: LLM генерирует текст с доказательствами вперемешку
   -> SSE: answer (один большой блок)
   -> Frontend: regex-парсинг, построение карточек
   -> Рендер
\`\`\`

**Теперь:**

\`\`\`
Backend: LLM генерирует текст
   -> EvidenceExtractor классифицирует tool_result
   -> SSE: evidence { type, title, source, content, relevance_score }
   -> SSE: answer (чистый текст без встроенных доказательств)
   -> Frontend: рендер готовых объектов
\`\`\`

## SSE-протокол

Мы расширили существующий SSE-поток новым событием evidence. Полный набор событий теперь выглядит так:

| Событие | Назначение | Payload |
|---|---|---|
| thinking | Индикатор обработки | { stage: string } |
| tool_result | Результат вызова инструмента | { tool, result, cost } |
| evidence | Структурированное доказательство | { type, title, source, content, relevance_score } |
| answer | Текстовый фрагмент ответа | { delta: string } |
| complete | Завершение потока | { total_cost, evidence_count } |

Объект evidence имеет чёткую типизацию:

\`\`\`typescript
interface EvidenceBlock {
  type: 'court_decision' | 'legislation' | 'document' | 'legal_position';
  title: string;
  source: string;
  content: string;
  relevance_score: number;
}
\`\`\`

Поле relevance_score (0-1) позволяет фронтенду сортировать доказательства по релевантности и сворачивать менее важные по умолчанию.

## Извлечение доказательств на бэкенде

EvidenceExtractor работает на этапе обработки tool_result. Когда ChatService получает результат от инструмента, он передаёт его в экстрактор до того, как LLM начнёт генерировать финальный ответ.

Для классификации (court_decision vs legislation vs document) мы используем LLM на уровне quick-модели (gpt-4o-mini). Это добавляет 50-100 мс на доказательство, но экономит значительно больше на клиенте и гарантирует корректную классификацию.

Критический момент: экстракция происходит параллельно с генерацией ответа. Пока LLM пишет текст, доказательства уже летят к клиенту. Пользователь видит карточки в EvidencePanel ещё до завершения текстового ответа.

## Fallback-механизм

Мы не удалили клиентский парсер. Он остался как fallback:

\`\`\`typescript
if (receivedEvidenceEvents.length > 0) {
  // Используем серверные доказательства
  renderStructuredEvidence(receivedEvidenceEvents);
} else {
  // Fallback: парсим из текста ответа
  const extracted = parseEvidenceFromText(fullAnswer);
  renderStructuredEvidence(extracted);
}
\`\`\`

Это защищает от трёх сценариев: бэкенд ещё не обновлён (постепенный деплой), экстрактор упал с ошибкой, соединение разорвалось посреди потока и evidence-события потерялись.

## Результаты

| Метрика | До | После |
|---|---|---|
| Время до первого доказательства в UI | 2.1 сек | 0.8 сек |
| Main thread blocking (мобайл) | 300-800 мс | < 50 мс |
| Корректность классификации | ~82% | ~96% |
| Размер клиентского бандла | baseline | -4 KB (удалённые regex-паттерны) |

Наибольший выигрыш — на мобильных. UI jank практически исчез, потому что фронтенд больше не занимается тяжёлым парсингом. EvidencePanel просто рендерит готовые объекты.

## Выводы

Эта миграция подтвердила принцип, которого мы придерживаемся в LEX AI: данные должны структурироваться как можно ближе к источнику. Бэкенд знает, что он вернул из инструмента. Заставлять клиент догадываться об этом из текста — это архитектурный долг, который мы наконец закрыли.

Fallback-слой делает миграцию безопасной: даже если серверная экстракция временно недоступна, пользователь увидит доказательства. Просто немного медленнее.`,
  },
  'developer-platform-api': {
    title: 'Developer Platform: 56 юридических AI-инструментов через один API',
    punchline: 'Мы открыли platform.legal.org.ua — портал для разработчиков, которые хотят интегрировать юридический AI в свои продукты. API-ключи, аналитика использования, документация на 56 инструментов, примеры для Python и TypeScript. MCP SSE, REST, batch — три транспорта на выбор. От регистрации до первого запроса — 5 минут.',
    readTime: '7 мин',
    content: `# Developer Platform: 56 юридических AI-инструментов через один API

*Как мы построили портал для разработчиков, которые хотят интегрировать юридический AI в свои продукты.*

---

## Зачем отдельный портал

LEX AI начинался как инструмент для юристов. Но разработчики тоже хотят доступ к нашим данным: поиск судебной практики, проверка контрагентов, анализ законодательства — всё это нужно не только в нашем UI, но и в сторонних продуктах.

Раньше интеграция выглядела так: написать нам в Telegram, получить токен, прочитать README на GitHub, разобраться в форматах ответов методом проб и ошибок. Это не масштабируется.

Теперь есть [platform.legal.org.ua](https://platform.legal.org.ua) — полноценный developer portal со всем необходимым для интеграции.

## Что внутри

### Dashboard

После логина разработчик видит панель с ключевыми метриками:

| Метрика | Описание |
|---------|----------|
| **Активные API-ключи** | Количество созданных ключей |
| **Баланс** | Остаток в USD |
| **Запросы за 30 дней** | Общее количество вызовов |
| **Статус API** | Текущая доступность |

Тут же — Quick Start секция с готовой командой для подключения через Claude Code:

\`\`\`bash
claude mcp add secondlayer \\
  --transport sse \\
  --url https://mcp.legal.org.ua/v1/sse \\
  --header "Authorization: Bearer YOUR_API_KEY"
\`\`\`

### Управление API-ключами

Полный CRUD для ключей:

- **Создание** — ввели название, получили ключ. Формат: \`sl_<32 символа>_<8 контрольная сумма>\`.
- **Безопасность** — ключ показывается один раз после создания. Сохраняйте сразу.
- **Трекинг** — для каждого ключа видно количество вызовов, дату создания и последнего использования.
- **Отзыв** — мгновенный, с подтверждением.

### Аналитика использования

Страница Usage показывает детальную статистику:

- **График вызовов по дням** — бар-чарт за 7, 30 или 90 дней
- **Использование по инструментам** — таблица с количеством вызовов, стоимостью, токенами, средним временем ответа
- **Финансовый дашборд** — текущий баланс, история транзакций (пополнения / использование)

Каждый вызов API трекается с точностью до токена. Разработчик видит, сколько стоит каждый инструмент, и может оптимизировать расходы.

## 56 инструментов в 12 категориях

Полный каталог инструментов доступен в документации с поиском и фильтрацией по категориям:

| Категория | Количество | Примеры |
|-----------|------------|---------|
| **Pipeline** | 4 | Полный анализ запроса, классификация намерения |
| **Court** | 4 | Поиск судебных решений, детали дела |
| **Analysis** | 10 | Сравнение решений, извлечение паттернов |
| **Documents** | 8 | Загрузка, парсинг, анализ документов |
| **Legislation** | 7 | Поиск статей, полный текст закона |
| **Procedural** | 3 | Сроки, подсудность, процессуальные действия |
| **Parsing** | 5 | Разбор текста решения на компоненты |
| **Vault** | 3 | Хранилище документов пользователя |
| **RADA** | 4 | Депутаты, законопроекты, голосования |
| **Registry** | 5 | ЕГРПОУ, бенефициары, должники |
| **Statistics** | 2 | Статистика по судам и категориям |
| **Main** | 1 | Главный инструмент оркестрации |

Для каждого инструмента есть: описание, категория, диапазон стоимости.

## Три транспорта

Developer Platform поддерживает три способа интеграции:

### MCP SSE (рекомендуемый)

Server-Sent Events по протоколу MCP. Поддерживается Claude Desktop, Claude Code и другими MCP-клиентами "из коробки".

\`\`\`
Endpoint: https://mcp.legal.org.ua/v1/sse
\`\`\`

### REST API

Классический HTTP для любого языка программирования.

\`\`\`bash
curl -X POST https://mcp.legal.org.ua/api/tools/search_court_decisions \\
  -H "Authorization: Bearer sl_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "признание сделки недействительной"}'
\`\`\`

### Batch Processing

Несколько инструментов в одном запросе:

\`\`\`bash
POST /api/tools/batch
\`\`\`

## Quick Start: 5 минут до первого запроса

Документация содержит примеры для пяти сценариев интеграции:

1. **Claude Code** — одна команда в терминале
2. **Claude Desktop** — JSON-конфиг в файл
3. **cURL** — REST API напрямую
4. **Python** — клиентская обёртка с requests
5. **TypeScript/Node.js** — axios-клиент с типизацией

Пример на Python:

\`\`\`python
import requests

API_KEY = "sl_your_api_key"
BASE_URL = "https://mcp.legal.org.ua/api/tools"

response = requests.post(
    f"{BASE_URL}/search_court_decisions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"query": "взыскание долга по кредитному договору"}
)

decisions = response.json()
\`\`\`

## Rate Limits и безопасность

| Параметр | Значение |
|----------|----------|
| Запросы в минуту | 60 |
| Запросы в день | 10 000 |
| Макс. размер запроса | 10 MB |
| Timeout выполнения | 120 секунд |

Каждый ответ содержит заголовки \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`. При превышении — 429 с рекомендацией exponential backoff.

Аутентификация — Bearer-токен в заголовке \`Authorization\`. Ключи привязаны к аккаунту, каждое использование логируется. Если ключ скомпрометирован — отзыв мгновенный через панель.

## Биллинг

Модель pay-as-you-go. Каждый вызов инструмента имеет свою стоимость, которая зависит от сложности: простые запросы (поиск по реестру) стоят меньше, чем глубокий анализ с использованием LLM.

На странице Usage видно:

- Текущий баланс
- Общая сумма пополнений
- Общая сумма использования
- История транзакций с типом (purchase / usage) и описанием

## Архитектура портала

Developer Platform — это отдельный React SPA, независимый от основного legal.org.ua:

| Компонент | Технология |
|-----------|-----------|
| Frontend | React 19, Vite, TailwindCSS |
| Графики | Recharts |
| Auth | Google OAuth + email/password |
| API | mcp_backend (общий с основным приложением) |
| Deploy | Docker + Nginx, порт 8094 |

Бэкенд общий — те же эндпоинты, та же база, тот же cost tracking. Портал — это другой интерфейс к той же инфраструктуре.

## Кому это нужно

**LegalTech-стартапы** — интегрировать поиск судебной практики в свой продукт без построения собственного индекса.

**Юридические фирмы с IT-отделом** — автоматизировать due diligence, мониторинг законодательства, подготовку процессуальных документов.

**AI-разработчики** — подключить юридические инструменты к своим агентам через MCP-протокол.

**Исследователи** — массовый анализ судебной практики через batch API.

---

Один портал. Три транспорта. 56 инструментов. От регистрации до первого запроса — 5 минут. [platform.legal.org.ua](https://platform.legal.org.ua)`,
  },
  'nais-41m-open-data': {
    title: '41.8 миллионов записей из открытых реестров Украины — теперь доступны через AI',
    punchline: '11 государственных реестров с data.gov.ua импортированы на платформу: исполнительные производства, должники, нотариусы, банкротство, ЕГРНПА и другие — все доступно юристу через AI-чат.',
    readTime: '7 мин',
    content: `# 41.8 миллионов записей из открытых реестров Украины — теперь доступны через AI

Сегодня мы завершили полный импорт 11 государственных реестров с data.gov.ua в нашу платформу SecondLayer. 41.8 миллионов записей — от исполнительных производств до нотариусов — теперь доступны юристам через AI-чат.

## Что мы загрузили

| Реестр | Записей | Источник |
|--------|---------|----------|
| Исполнительные производства (АСВП) | 29,060,072 | data.gov.ua |
| Реестр должников | 10,363,352 | data.gov.ua |
| Спецбланки нотариальных документов | 1,224,003 | data.gov.ua |
| Административно-территориальное устройство | 500,704 | data.gov.ua |
| Словарь улиц | 497,464 | data.gov.ua |
| ЕГРНПА (нормативно-правовые акты) | 140,930 | data.gov.ua |
| Дела о банкротстве | 35,439 | data.gov.ua |
| Судебные эксперты | 14,730 | data.gov.ua |
| Нотариусы | 5,799 | data.gov.ua |
| Арбитражные управляющие | 3,420 | data.gov.ua |
| Методики судебных экспертиз | 1,546 | data.gov.ua |
| **Итого** | **41,847,459** | |

Это только NAIS-реестры. Вместе с другими источниками платформа уже содержит:

- 8.8M судебных решений (ЕГРСР)
- 1.26M записей международных санкций (OpenSanctions)
- Полную базу законодательства Верховной Рады
- Данные парламента: депутаты, фракции, голосования, законопроекты
- Реестр юридических лиц и ФЛП (ЕДР)

## Как это работает для юриста

Юрист пишет в чат обычным языком — AI-модель сама выбирает нужный реестр и возвращает структурированные данные. Не нужно знать API, SQL или название таблицы.

**"Найди нотариуса Иванова"** — система ищет в реестре нотариусов и возвращает:

\`\`\`
Иванов Валерий Александрович
Частный нотариус, Ивано-Франковская обл.
Коломыя, ул. Театральная, 2а
\`\`\`

**"Покажи нормативные акты о защите персональных данных"** — поиск по ЕГРНПА (140,930 актов):

\`\`\`
Постановление ВРУ №4729-IX от 17.12.2025
"Об особенностях подготовки ко второму чтению
 проекта Закона Украины о защите персональных данных"
Статус: Действующий
\`\`\`

**"Найди ПриватБанк по ЕДРПОУ"** — мгновенный поиск по коду 14360570:

\`\`\`
АО КБ "ПРИВАТБАНК"
ЕДРПОУ: 14360570
Состояние: зарегистрировано
Регистрация: 19.03.1992
\`\`\`

## 16 инструментов — один интерфейс

Каждый реестр — это отдельный MCP-инструмент (Model Context Protocol), который AI-модель вызывает автоматически:

1. \`search_entities\` — юридические лица, ФЛП, общественные организации
2. \`get_by_edrpou\` — поиск по коду ЕДРПОУ
3. \`get_entity_details\` — полная информация о компании
4. \`search_beneficiaries\` — конечные бенефициары
5. \`get_statistics\` — статистика по всем реестрам
6. \`search_notaries\` — реестр нотариусов
7. \`search_court_experts\` — аттестованные судебные эксперты
8. \`search_arbitration_managers\` — арбитражные управляющие
9. \`search_debtors\` — реестр должников (10.3M)
10. \`search_enforcement_proceedings\` — исполнительные производства (29M)
11. \`search_bankruptcy_cases\` — дела о банкротстве
12. \`search_special_forms\` — спецбланки нотариальных документов
13. \`search_forensic_methods\` — методики судебных экспертиз
14. \`search_legal_acts\` — ЕГРНПА (нормативно-правовые акты)
15. \`search_administrative_units\` — административно-территориальное устройство
16. \`search_streets\` — словарь улиц

## Зачем это юристам

Представьте типичный due diligence. Юристу нужно проверить контрагента. Раньше это означало:

1. Зайти на сайт ЕДР — проверить регистрацию
2. Зайти на data.gov.ua — проверить исполнительные производства
3. Проверить реестр должников
4. Проверить дела о банкротстве
5. Проверить судебные решения на ЕГРСР
6. Проверить санкционные списки

С SecondLayer — один вопрос в чат: **"Проверь компанию по ЕДРПОУ 12345678"**. Система автоматически проверяет все реестры и возвращает комплексный отчёт.

## Техническая сторона

Весь импорт автоматизирован:

- 11 реестров загружены параллельно за один прогон
- XML и CSV файлы стримингово парсятся и импортируются в PostgreSQL
- Конфликты решаются через ON CONFLICT DO UPDATE
- Поддержка кодировок Windows-1251 и UTF-8
- Автоматический retry с exponential backoff

Синхронизация запускается ежедневно или еженедельно в зависимости от реестра.

## Что дальше

- 18.5M записей судебных заседаний (court.gov.ua) — в процессе
- PROZORRO (госзакупки) — в планах
- Декларации НАПК — в планах
- Санкционные списки СНБО — в планах

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-changes-lawyer-work-2026': {
    title: 'Как AI меняет работу украинского адвоката в 2026 году',
    punchline: '56 инструментов вместо 12 вкладок в браузере. Семантический поиск по 45M решений. Полнотекстовый анализ за секунды. Due diligence одним запросом. Не замена юриста — а экзоскелет для его мозга.',
    readTime: '10 мин',
    content: `# Как AI меняет работу украинского адвоката в 2026 году

*56 инструментов, которые превращают часовую рутину в 30-секундный запрос.*

---

## Один день адвоката — до и после

### До: 12 вкладок, 4 часа

Утро среды. Адвокат готовит позицию по делу о взыскании долга по кредитному договору. ЕДРСР, сайт Верховной Рады, ЕДР, реестр должников, банкротство, санкции. 4 часа. 12 вкладок.

### После: 1 окно, 30 минут

**Запрос 1:** *"Найди практику ВС по взысканию долга по кредитному договору с 2023 года"* → 847 решений кассации.

**Запрос 2:** *"Покажи ст. 526, 530, 625 ГК"* → Тексты трёх статей за 2 секунды.

**Запрос 3:** *"Проверь компанию по ЕДРПОУ 12345678"* → Комплексный отчёт: регистрация, бенефициары, исполнительные производства, банкротство, санкции.

---

## 56 инструментов

LEX — это не чат-бот. Это 56 специализированных инструментов: судебная практика (14), законодательство (7), реестры и due diligence (16), парламент (4), документы (8), и другие.

## Защита от галлюцинаций

Каждый ответ проходит через HallucinationGuard — систему, которая проверяет существование цитируемых решений и актуальность законодательства.

---

56 инструментов. 45M+ решений. 41.8M записей из реестров. [legal.org.ua](https://legal.org.ua)`,
  },
  'spain-legal-expansion': {
    title: 'Выход на рынок Испании: как украинская LegalTech платформа адаптируется к европейскому праву',
    punchline: 'Импорт испанских правовых данных из BOE и CENDOJ. Гео-детекция локали. Автоматическая локализация на 4 языка. Новые MCP-инструменты для испанского законодательства.',
    readTime: '8 мин',
    content: `# Выход на рынок Испании: как украинская LegalTech платформа адаптируется к европейскому праву

*От моноринкового украинского продукта к мультиюрисдикционной платформе за 3 недели.*

---

## Почему Испания

Испания — первый шаг: 48M населения, 155K+ адвокатов, полностью оцифрованный BOE, кодифицированная система права (как и в Украине).

## Три слоя адаптации

### Слой 1: Данные
BOE (официальный вестник) и CENDOJ (судебные решения) — два основных источника.

### Слой 2: Инструменты
Новые MCP tools: \`search_spanish_legislation\`, \`get_spanish_article\`, \`search_spanish_court_decisions\`.

### Слой 3: Локализация
4 языка: украинский, английский, русский, испанский. Гео-детекция при первом визите.

---

Одна платформа. Много юрисдикций. От Киева до Мадрида. [legal.org.ua](https://legal.org.ua)`,
  },
  'developer-docs-api-guide': {
    title: 'API для разработчиков: как интегрировать 56+ юридических MCP инструментов в свой продукт',
    punchline: '6 вкладок документации: Overview, каталог 56 инструментов, аутентификация, примеры кода (curl/TS/Python/SSE), конфиги MCP-клиентов, прайсинг.',
    readTime: '9 мин',
    content: `# API для разработчиков: как интегрировать 56+ юридических MCP инструментов в свой продукт

*Полный гид по документации, транспортам и интеграции.*

---

## 3 транспорта

| Транспорт | Протокол | Для кого |
|-----------|----------|----------|
| **MCP SSE** | Server-Sent Events | Claude Desktop, Cursor, VS Code |
| **REST** | HTTP POST | Любой язык программирования |
| **Batch** | HTTP POST | Массовые запросы |

## 56 инструментов в 12 категориях
Полный интерактивный каталог с поиском и фильтрацией.

## Примеры кода
curl, TypeScript, Python, SSE streaming, batch — готовые сниппеты.

## MCP-клиенты
Claude Desktop, Claude Code, Cursor, VS Code, Continue.dev — настройка за 2 минуты.

## Прайсинг
Pay-as-you-go. Поиск по реестрам: $0.002–0.01. Судебная практика: $0.005–0.02. AI-анализ: $0.02–0.05.

---

6 вкладок. 56 инструментов. 3 транспорта. [legal.org.ua/developer/docs](https://legal.org.ua/developer/docs)`,
  },
  'diia-integration-challenges': {
    title: 'Дія.Підпис для бизнеса: технические вызовы интеграции с государственным сервисом',
    punchline: 'ECDSA + SHA256 для хеширования. Redis key mismatch между start и verify. QR-код и deep link. Обновление данных ФОП/ООО при каждом логине. 4 фикса за сутки.',
    readTime: '8 мин',
    content: `# Дія.Підпис для бизнеса: технические вызовы интеграции с государственным сервисом

*Реальная история: как мы интегрировали Дію и что пошло не так.*

---

## Зачем Дія.Підпис

Google OAuth — удобный, но не юридически значимый. Дія.Підпис даёт: верифицированную идентичность (ИНН/ЕДРПОУ), квалифицированную электронную подпись, удобство (QR-код или deep link).

## Проблема 1: ECDSA хеширование
Дія требует requestId, подписанный ECDSA SHA-256 в Base64. Первая попытка — простой SHA-256 хеш (неправильно). Фикс: полноценный ECDSA sign с PEM-ключом.

## Проблема 2: Redis key mismatch
Разные префиксы: \`diia:request:\` при создании, \`diia:auth:\` при верификации. Copy-paste баг. Фикс: единая константа.

## Проблема 3: Обновление данных бизнеса
Первый логин создавал запись, последующие — игнорировали обновления. Фикс: 4 PR за сутки — UPDATE при каждом логине.

## Проблема 4: Nginx proto override
Backend генерировал \`http://\` редиректы за Cloudflare. Фикс: \`X-Forwarded-Proto\` + trust proxy.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'opendata-sync-pipeline-engineering': {
    title: 'Как мы синхронизируем 380M+ записей из 40+ источников данных, которые постоянно падают',
    punchline: 'Multi-IP импорт, автоматический scheduler, freshness-мониторинг, международная экспансия — инженерия data pipeline для открытых данных. От первого 404 до стабильного обновления 110+ таблиц каждую ночь.',
    readTime: '15 мин',
    content: `# Как мы синхронизируем 380M+ записей из 40+ источников данных, которые постоянно падают

Когда строишь юридическую AI-платформу на открытых данных, главный вызов — не AI и не поиск. Это **надёжное получение данных** из десятков источников — украинских государственных реестров, международных баз, санкционных списков — каждый из которых имеет свои ограничения, форматы и проблемы со стабильностью.

Эта статья — инженерный разбор того, как мы построили полностью автоматизированный pipeline синхронизации для 380+ миллионов записей из 40+ источников. От архитектуры multi-IP импорта до cron-scheduler'а, системы мониторинга freshness и международной экспансии на 6 юрисдикций.

*Обновлено: май 2026 — актуальные цифры с production-серверов.*

---

## Проблема: государственные API — это не Stripe

Когда вы работаете с API data.gov.ua, НАИС, УИПВ или spending.gov.ua, вы сталкиваетесь с реальностью:

- **Rate limits без документации** — один сервис блокирует после 100 запросов/мин, другой — после 10
- **Форматы меняются** — JSON-поле вдруг становится null вместо строки, или ответ приходит как HTML-страница ошибки
- **Таймауты** — ZIP-архив реестра должников на 200MB может загружаться 20 минут или не загрузиться вообще
- **Отсутствие idempotency** — нет \`ETag\`, \`Last-Modified\`, diff endpoint'ов. Каждая синхронизация — полная перезапись
- **URL исчезают** — ресурсы на data.gov.ua переезжают без предупреждения, возвращая 404

Мы не можем позволить себе ручной импорт. Юристы рассчитывают на актуальность данных: реестр разыскиваемых лиц должен обновляться ежедневно, а не ежемесячно.

---

## Архитектура: три уровня надёжности

Наш pipeline состоит из трёх независимых компонентов:

\`\`\`
┌─────────────────────────────────────────┐
│  opendata-sync (Docker container)       │
│  ├─ node-cron scheduler                 │
│  ├─ 26 источников по расписанию          │
│  └─ Triggers → backend / openreyestr    │
└───────────┬─────────────────┬───────────┘
            │                 │
            ▼                 ▼
┌───────────────────┐ ┌──────────────────┐
│  ImportTaskService │ │  OpenReyestr     │
│  (mcp_backend)     │ │  sync-registry   │
│  ├─ 10 source IP   │ │  ├─ ZIP download │
│  ├─ round-robin    │ │  ├─ XML parsing  │
│  ├─ retry logic    │ │  └─ UPSERT       │
│  └─ progress track │ │                  │
└────────┬──────────┘ └────────┬─────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────┐
│  PostgreSQL: 110+ data таблиц (1.26 TB) │
│  Мониторинг: db-status.py + freshness   │
└─────────────────────────────────────────┘
\`\`\`

---

## Уровень 1: Scheduler — opendata-sync

Первый уровень — лёгкий Node.js микросервис, который **не загружает данные сам**. Он отвечает только за расписание и триггеры.

### Конфигурация источников

Каждый источник описан декларативно:

\`\`\`typescript
{
  name: 'mvs_wanted_persons',
  title: 'МВД — Лица в розыске',
  cron: '0 3 * * *',           // 03:00 ежедневно
  target: 'backend',           // куда отправить триггер
  sourceName: 'mvs_wanted_persons',
  enabled: true
}
\`\`\`

### Расписание синхронизации

| Время | Источники | Целевой сервис |
|-------|-----------|----------------|
| 03:00 ежедневно | МВД розыск, МВД пропавшие, МВД авто, МВД недействительные паспорта, НАЗК коррупционеры, НАЗК правонарушители | backend |
| 03:30 ежедневно | Статусы дел, расписание заседаний, адвокаты, люстрация, госпомощь, крупные налогоплательщики, должники по зарплате | backend |
| 04:00–05:00 ежедневно | Арбитражные управляющие, банкротство, исполнительные, должники | openreyestr |
| Воскресенье 02:00 | УИПВ патенты, марки, модели, образцы | backend |
| Понедельник 02:00–05:00 | Нотариусы, судебные эксперты, спецбланки, улицы, АТУ | openreyestr |

### Защита от дублирования

Перед каждым триггером scheduler проверяет, не запущен ли уже импорт этого источника. Если статус — \`running\`, новая задача не создаётся.

---

## Уровень 2: ImportTaskService — multi-IP импорт

Это сердце pipeline. Когда scheduler отправляет триггер, ImportTaskService берёт на себя всю работу по загрузке.

### Три режима импорта

Государственные источники используют разные форматы, поэтому мы поддерживаем три стратегии:

| Режим | Источники | Как работает |
|-------|-----------|-------------|
| \`api_paginated\` | УИПВ (патенты, марки) | Постраничный обход API, 1100ms между запросами |
| \`json_array\` | МВД, НАЗК | Один HTTP-запрос → массив JSON объектов |
| \`file_download\` | НАИС реестры | ZIP → XML → парсинг → UPSERT |

### Multi-IP: 10 адресов × 5 потоков = 50 параллельных загрузок

Для источников с rate limits по IP-адресу мы используем пул из **10 сетевых интерфейсов** (AWS ENI). Страницы распределяются round-robin:

\`\`\`
Страница 1  → IP 172.31.x.1
Страница 2  → IP 172.31.x.2
...
Страница 10 → IP 172.31.x.10
Страница 11 → IP 172.31.x.1  (снова первый)
\`\`\`

С 5 потоками на каждый IP получаем **50 параллельных соединений**. Для УИПВ с rate limit 1100ms/запрос это даёт ~45 страниц/секунду вместо 0.9.

### Retry с exponential backoff

Каждый запрос имеет до 5 попыток с нарастающей задержкой:

\`\`\`
Попытка 1: сразу
Попытка 2: через 2 секунды
Попытка 3: через 4 секунды
Попытка 4: через 8 секунд
Попытка 5: через 16 секунд
\`\`\`

Для ошибки 429 (Too Many Requests) — отдельная логика: ждём \`Retry-After\` из ответа сервера.

### Отслеживание прогресса без нагрузки на базу

Прогресс хранится **в памяти** и записывается в PostgreSQL каждые 100 страниц:

\`\`\`typescript
// В памяти — обновление каждую страницу (микросекунды)
taskProgress.set(taskId, {
  pagesDone: 4521,
  recordsImported: 45210,
  currentPage: 4522,
  lastError: null
});

// В базу — flush каждые 100 страниц
// UPDATE import_tasks SET pages_done=$2, records_imported=$3 WHERE id=$1
\`\`\`

Это даёт точный real-time прогресс через API без нагрузки на базу тысячами UPDATE-запросов.

### MCP-инструменты для управления

Весь процесс управляется через 4 MCP-инструмента:

| Инструмент | Назначение |
|-----------|------------|
| \`list_import_sources\` | Каталог всех источников: URL, тип, таблица, rate limit |
| \`start_import\` | Запуск фоновой задачи: source_name → task_id |
| \`get_import_status\` | Прогресс: %, ETA, скорость, ошибки |
| \`cancel_import\` | Остановка через AbortController с сохранением прогресса |

Это означает, что AI-ассистент может сам запустить импорт, следить за прогрессом и уведомить юриста, когда данные обновлены.

---

## Уровень 3: Мониторинг freshness

Данные без мониторинга — это тикающая бомба. Мы построили систему, показывающую **насколько свежие** данные в каждой таблице.

### Матрица ожидаемой частоты

| Частота | Таблиц | Примеры |
|---------|--------|---------|
| Ежедневно (1д) | 24 | Розыск МВД, недействительные паспорта, коррупционеры НАЗК, должники, исполнительные, статусы дел, адвокаты |
| Еженедельно (7д) | 48 | Патенты, марки, санкции OpenSanctions, депутаты, судьи, законопроекты |
| Ежемесячно (30д) | 8 | Графики заседаний, крупные налогоплательщики, судебные эксперты, спецбланки |

### Индикаторы freshness

\`\`\`
🟢 в пределах нормы (freq × 1.5)      — всё работает
🟡 немного просрочено (freq × 1.5–2.5) — стоит проверить
🟠 просрочено (freq × 2.5–4)           — что-то пошло не так
🔴 критично (> freq × 4)               — нужно вмешательство
⛔ импорт завершился с ошибкой
🔄 импорт работает сейчас
\`\`\`

### Dashboard: db-status.py

Скрипт подключается к production-базе через SSH и показывает полную картину:

\`\`\`
═══════════════════════════════════════════════════════════════
  📦 SecondLayer (основная) — 110+ таблиц, 1.26 TB всего
═══════════════════════════════════════════════════════════════
  #   Таблица                            Строк  Размер  Норма  Давность
  ──────────────────────────────────────────────────────────────────────
  1   opendata_vehicle_registrations   19.6M  5.9 GB    7д   3д назад   🟢
  2   spending_acts                     9.45M  8.3 GB    7д   5д назад   🟢
  3   opendata_invalid_passports        2.89M  1.0 GB    1д   2мин назад 🟢
  4   opendata_court_case_status        1.25M  846 MB    1д   12мин назад🟢
  5   opensanctions_entities            1.25M  522 MB   30д   8д назад   🟢
  6   opendata_trademarks                382K  4.3 GB    7д   3д назад   🟢
  7   opendata_patents                   345K  5.0 GB    7д   3д назад   🟢
  8   opendata_missing_persons           117K  119 MB    1д   12мин назад🟢
  9   opendata_wanted_persons             71K   49 MB    1д   2мин назад 🟢
  10  opendata_corruption                 58K  106 MB    1д   3ч назад   🟢
  ...
\`\`\`

---

## Реальные проблемы и как мы их решили

### Проблема 1: Docker не может bind к ENI IP

\`json_array\` источники (МВД, НАЗК) — это один HTTP-запрос, не пагинация. Когда мы передавали ENI IP для bind, Docker-контейнер получал \`EADDRNOTAVAIL\` — он не видит host-сеть.

**Решение:** multi-IP нужен только для пагинированных источников. Для \`json_array\` — обычный fetch без bind.

### Проблема 2: URL исчезают без предупреждения

data.gov.ua периодически обновляет resource ID для МВД и НАЗК. Старые URL возвращают 404.

**Решение:** URL хранятся в таблице \`import_source_catalog\`, а не захардкожены. Обновление URL — один UPDATE-запрос, без пересборки кода.

### Проблема 3: NULL bytes в PDF/XML

Некоторые реестры содержат \`\\x00\` символы, которые PostgreSQL отклоняет:

\`\`\`
ERROR: invalid byte sequence for encoding "UTF8": 0x00
\`\`\`

**Решение:** strip null bytes на этапе парсинга, до INSERT.

### Проблема 4: Ответ — не JSON

Когда сервер перегружен, некоторые API возвращают HTML-страницу ошибки или пустую строку вместо JSON.

**Решение:** парсинг обёрнут в try/catch с проверкой \`Content-Type\`. Если ответ не JSON — retry с следующего IP.

### Проблема 5: Утечка памяти на больших импортах

Импорт 9.45M записей spending_acts держал все записи в памяти.

**Решение:** streaming парсинг — обработка chunk'ами по 1000 записей, UPSERT, освобождение памяти.

---

## Цифры

| Метрика | Значение |
|---------|---------|
| Общий объём данных | 380M+ записей, 1.26 TB (2 базы) |
| Количество источников | 26 в import_source_catalog + 20 международных импортёров |
| Количество таблиц | 110+ data-таблиц (31 opendata + 20 spain + 43 openreyestr + 50+ ЕГРСР партиций) |
| MCP-инструментов для поиска | 30+ (opendata + spending + registries + international) |
| Ежедневная синхронизация | 12 источников (03:00–05:00 UTC) |
| Еженедельная синхронизация | 14 источников (выходные) |
| Параллельных соединений | до 50 (10 IP × 5 потоков) |
| Время полного импорта УИПВ | ~45 мин (345K записей) |
| Время импорта МВД розыск | ~30 сек (71K записей, один запрос) |
| Крупнейшая таблица | enforcement_proceedings: 29.4M записей, 19 GB |
| Международные юрисдикции | 6 (Испания, Ирландия, Нидерланды, Швейцария, Люксембург, ЕС) |

---

## Международная экспансия: от 15 украинских источников до 40+ глобальных

С марта 2026 pipeline вышел далеко за пределы украинских реестров. Вот что добавилось:

### ICIJ Offshore Leaks — 4.9M записей

Полная база Panama Papers, Paradise Papers, Pandora Papers. 814K entities, 771K officers, 2.9M relationships, 402K addresses. Импорт из CSV за ~2 минуты, данные обновляются при каждом новом leak.

### Испания — 20 таблиц, 780K записей

Самый сложный международный импорт. 14 источников: Tribunal Constitucional (27K решений), BOE (48K объявлений + 12K законов), BORME (276K компаний), EUR-Lex (8.6K актов), CENDOJ (2.3K уголовных решений). CENDOJ оказался geo-blocked для non-EU IP — пришлось использовать Playwright + auto IP rotation (81 ротация EIP, 3 параллельных EC2 workers).

### Нидерланды — 1.1M судебных решений

Rechtspraak Open Data API — 1,106,921 решение. Один из самых чистых API среди всех источников: XML с чёткой схемой, пагинация работает, rate limits документированы.

### Швейцария — 661K судебных решений

Entscheidsuche.ch — федеральные и кантональные суды. Zefix (1.7M компаний) и SHAB (2.18M HR записей) пока заблокированы из-за 403/timeout.

### Ирландия — 812K компаний

Companies Registration Office (CRO) — полный реестр ирландских компаний.

### Люксембург — 3.3M записей

GLEIF LEI — Global Legal Entity Identifier. 3,282,067 записей международных юридических лиц.

### OpenSanctions — 1.25M записей

Агрегированный санкционный список: 1,020K физических лиц, 108K компаний, 71K юридических лиц. 330 уникальных датасетов со всего мира.

---

## Что дальше

### ✅ Сделано из предыдущего плана

- **Больше источников** — с 15 до 26 автоматизированных + 20 международных импортёров
- **Incremental sync** — реализован для ЕГРСР (\`sync-edrsr-incremental.sh\`)
- **Data quality checks** — базовая проверка падения row count после импорта

### 🔜 Следующие шаги

1. **ЕГРСР fulltext gap 2022-2026** — 32.9M документов без полного текста, активный backfill через /Review/ endpoint (~4M уже восстановлено)
2. **Qdrant hybrid search** — векторы ЕГРСР (103M+ points) таймаутят на 60с, нужен tune HNSW или ожидание завершения индексации
3. **Испания Tier 2** — ещё 12 импортёров: Plataforma Contratación (~5-8M тендеров), Congreso votes (~25M), CENDOJ non-penal, Catastro INSPIRE
4. **Швейцария** — 12 импортёров на ~9.2M записей: kantonsblatt.ch, fedlex, parlament.ch, Zefix, opendata.swiss
5. **data.gov.ua OSINT** — обнаружено 150+ новых датасетов категорий P0-P2, постепенная интеграция
6. **Alerting** — Telegram-бот для уведомлений о failed imports

---

## Вывод

Построить pipeline для открытых данных — это не про \`fetch → insert\`. Это про инженерию надёжности: retry, rate limit, multi-IP, мониторинг freshness, graceful degradation. А когда pipeline выходит на международный уровень — это ещё и про Playwright для geo-blocked сайтов, EIP rotation для обхода бан-листов и парсинг XML-схем 6 разных юрисдикций.

Каждый из 40+ источников — это отдельная история с уникальными проблемами. Но когда pipeline работает стабильно, юрист задаёт вопрос в чат и получает актуальные данные из МВД, НАЗК, УИПВ, НАИС, spending.gov.ua, ICIJ, Rechtspraak и CENDOJ — даже не задумываясь, сколько инженерной работы стоит за каждым ответом.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'ci-cd-blue-green-self-healing-tests': {
    title: 'CI/CD с blue-green preview и самоисцеляющимися тестами',
    punchline: 'Как мы построили pipeline, который не падает в 3 ночи: blue-green с approval gate, prod safety guard и 8 PR за 3 часа чтобы укротить Vitest OOM.',
    readTime: '18 мин',
    content: `# CI/CD с blue-green preview и самоисцеляющимися тестами

Как мы сделали CI/CD, который не падает в 3 ночи — и почему Vitest жрёт память.

Эта статья — не теоретический гайд. Это хроника 4 дней (25–28 марта 2026), за которые мы превратили наш deploy pipeline из «push and pray» в систему с preview-средой, approval gate, prod safety guard и тестами, которые чинят себя сами. 17 PR, 422 теста, одна эпическая битва с OOM.

---

## Архитектура: что мы имели на старте

SecondLayer — монорепо с 3 MCP-серверами (backend, rada, openreyestr), React-фронтендом и PostgreSQL/Redis/Qdrant инфраструктурой. Деплой на прод — через self-hosted GitHub Actions runner, который физически стоит на той же машине, что и прод.

Да, вы правильно прочитали. CI runner и прод — одна машина. Это как жить с тигром в одной комнате: можно, но нужно очень аккуратно.

---

## День 1: Фундамент — 93 теста + blue-green preview

### 93 новых юнит-теста за один PR (#1204)

Первый шаг — покрытие. 58 backend-тестов (auth, JWT, dual-auth, balance check, rate limiting) + 35 frontend-тестов (uiStore, undoStore, localeStore). Но просто написать тесты — мало. Мы добавили:

- **Self-heal job**: если тесты падают в CI, Claude Code автоматически анализирует ошибку, фиксит тест и создаёт fix-PR
- **Pre-deploy gate**: прод-деплой блокируется, если тесты не прошли
- **Jest 30 совместимость**: убрали \`fail()\`, переписали async assertions

### Blue-green deployment с approval gate (#1213)

Главная фича. Разделили прод-деплой на две фазы:

**Фаза 1 — автоматическая (после CI)**:
1. Сборка новой версии
2. Запуск миграций
3. Старт неактивного цвета (blue или green)
4. Активация \`preview.legal.org.ua\`

**Фаза 2 — manual approval**:
1. Ревьюер проверяет preview
2. Нажимает Approve в GitHub Environment
3. Nginx переключает трафик на новый цвет
4. Drain connections со старого цвета
5. Остановка старого цвета
6. Создание GitHub Release

---

## День 3: Prod Safety Guard — уроки из инцидента

### Инцидент: CI сломал прод (#1290)

Поскольку CI runner и прод живут на одной машине, локальный деплой случайно зацепил прод-nginx. Результат: 502 на проде. В 3 ночи. Классика.

### Решение: Prod Safety Guard

Логика простая: записываем статус и время старта прод-nginx до деплоя, проверяем после. Если контейнер рестартнулся или упал — pipeline кричит CRITICAL.

---

## День 4: Vitest OOM Saga — 8 PR за 3 часа

Самая интересная часть. Хронология того, как один тест сломал CI.

### Проблема

\`ConsultationChatTab.test.tsx\` — тест для основного чат-компонента. Он импортирует \`articles.ts\` (4745 строк), рендерит тяжёлый React-компонент и стабильно убивает Vitest worker через OOM.

### Эволюция решения

| PR | Подход | Результат |
|----|--------|-----------|
| #1302 | maxForks: 2 | OOM в одном форке |
| #1303 | heap 4GB | OOM на teardown |
| #1304 | threads pool | Зависание SSE моков |
| #1305 | teardownTimeout | Exit code 1 |
| #1306 | cleanup() | OOM всё равно на teardown |
| #1309 | JSON reporter | Файл не записывается |
| #1311 | **stdout parsing** | **Работает** |
| #1315 | +8GB heap для prod | **Стабильно** |

### Финальное решение

Парсим stdout Vitest на "Tests.*failed" или "Test Files.*passed" вместо доверия exit code. Worker OOM происходит при teardown ПОСЛЕ того как все тесты прошли — поэтому exit code врёт.

### Почему Vitest жрёт память

1. **Большое дерево импортов**: ConsultationChatTab импортирует articles.ts на 4745 строк — каждый форк создаёт полную копию
2. **V8 error stack trace**: При закрытии worker V8 строит полный stack trace, съедая heap
3. **threads vs forks**: worker_threads делят heap с main process, но \`execArgv\` не передаёт \`--max-old-space-size\` в threads
4. **Reporter race condition**: JSON reporter пишет в \`process.exit\` hook, но OOM убивает до выполнения hooks

### Рекомендации

1. **Всегда \`cleanup()\`** в afterEach — React render без unmount = утечка интервалов
2. **Не доверяйте exit code** — Vitest worker OOM ≠ тесты упали
3. **stdout parsing** — самый надёжный способ определить результат в CI
4. **forks > threads** для больших test suites — execArgv работает только с forks

---

## Результат

| До | После |
|----|-------|
| Push → pray → проверить через 10 мин | Push → CI → preview → approve → prod |
| Тесты падают в CI → ручной фикс | Self-heal: Claude Code фиксит автоматически |
| CI сломал прод (502) | Prod Safety Guard: pre/post проверка |
| Vitest OOM = все тесты «упали» | stdout parsing: реальный результат |
| 0 тестов | 422 теста (93 новых) |
| Один деплой = всё-или-ничего | Blue-green с preview и rollback |

---

CI/CD — это не конфигурация. Это живой организм, который нужно кормить тестами и защищать от самого себя.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-safety-open-registries': {
    title: 'Безопасность AI-моделей на открытых реестрах: законы Азимова',
    punchline: 'Как обеспечить, чтобы модель с доступом к 50M+ записей не стала инструментом давления на невиновных? Три закона Азимова адаптированы для юридического AI, сценарии угроз и архитектурные решения.',
    readTime: '18 мин',
    content: `# Безопасность AI-моделей на открытых реестрах: законы Азимова

Эта статья доступна на украинском языке. Переключите язык на украинский для чтения полной версии.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'rlhf-longtail-problem': {
    title: 'Проблема Long Tail при RLHF-обучении юридической модели',
    punchline: '5 категорий покрывают 90% корпуса ЕРДРСР. Как Long Tail разрушает RLHF, почему модель становится «цивилистом» и какие стратегии преодоления мы внедряем на GCP за $240K/6 мес.',
    readTime: '16 мин',
    content: `# Проблема Long Tail при RLHF-обучении юридической модели

Эта статья доступна на украинском языке. Переключите язык на украинский для чтения полной версии.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'constitutional-rlhf': {
    title: 'Конституция Украины как reward signal: конституционное RLHF',
    punchline: 'Как статьи 3, 28, 32, 62 Конституции становятся reward-функциями при RLHF-обучении. Презумпция невиновности как hardcoded правило, конституционные коллизии и benchmark из 500+ сценариев.',
    readTime: '20 мин',
    content: `# Конституция Украины как reward signal: конституционное RLHF

Эта статья доступна на украинском языке. Переключите язык на украинский для чтения полной версии.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'ai-experimental-court': {
    title: 'Экспериментальный AI-суд: моделирование процессов через все инстанции',
    punchline: 'Три отдельные модели — судья, прокурор, адвокат — с информационной изоляцией воспроизводят состязательность. Инстанционная специализация, дерево результатов и adversarial training на GCP.',
    readTime: '22 мин',
    content: `# Экспериментальный AI-суд: моделирование процессов через все инстанции

Эта статья доступна на украинском языке. Переключите язык на украинский для чтения полной версии.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'legaltech-llm-constitution': {
    title: 'Конституция LegalTech LLM: свод правил для юридических AI-моделей',
    punchline: '30 статей, 9 разделов, открытая лицензия. ТОВ «Лекс ЕйАй» инициирует отраслевой стандарт для LegalTech моделей — от презумпции невиновности до защиты в военное время, с прямой имплементацией в reward model.',
    readTime: '24 мин',
    content: `# Конституция LegalTech LLM: свод правил для юридических AI-моделей

Эта статья доступна на украинском языке. Переключите язык на украинский для чтения полной версии.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'claude-code-building-startups': {
    title: 'Как я написал 1 200+ коммитов за 50 дней: Claude Code как полноценный инженерный напарник',
    punchline: '800+ сессий, 10 000+ сообщений, 1 200+ коммитов, 328 000 строк кода, 40 000+ bash-команд — и ни одного нанятого разработчика. Реальная статистика 50 дней непрерывной работы с Claude Code для построения legal tech платформы.',
    readTime: '15 мин',
    content: `# Как я написал 1 200+ коммитов за 50 дней: Claude Code как полноценный инженерный напарник

*Это не рекламная статья. Это — прозрачный разбор реальной статистики работы с Claude Code при построении legal tech платформы, data pipelines и инфраструктуры. С цифрами, ошибками и выводами.*

*Обновлено 7 мая 2026 — добавлены данные за второй месяц работы.*

---

## Контекст: что строю и почему один

SecondLayer (LEX AI) — украинская legal tech платформа: AI-анализ судебных решений, семантический поиск, законодательство, реестры, консультации. Monorepo с тремя MCP-серверами, React-фронтендом, Flutter-мобилкой и data pipelines на 340M+ записей из 15 государственных API.

Я — единственный разработчик. Вместо команды из 5-10 инженеров я работаю с Claude Code как с полноценным напарником: от написания кода до деплоя на прод.

---

## Цифры за 50 дней (18 марта — 7 мая 2026)

| Метрика | Первые 25 дней | Следующие 31 день | Всего |
|---------|----------------|-------------------|-------|
| Сессий | 486 | 315 | 800+ |
| Сообщений | 5 612 | 4 685 | 10 297 |
| Коммитов | 735 | 472 | 1 207 |
| Строк написано | +193 340 | +134 836 | +328 176 |
| Строк удалено | -14 259 | -8 294 | -22 553 |
| Файлов изменено | 1 811 | 1 663 | 3 474 |
| Bash-команд | 22 326 | 18 250 | 40 576 |
| Edit-операций | 3 782 | 2 724 | 6 506 |
| Sub-агентов | 864 | 597 | 1 461 |
| Параллельных сессий | 41% | 26% | ~34% |

Это не теоретическая продуктивность. Это реальный git log за два месяца непрерывной работы.

**1 875 часов** отработанного Claude Code времени. 151 сообщение в день. Это эквивалент небольшой инженерной команды, работающей без выходных.

---

## Что именно я строил

### 1. Legal Tech платформа (~78 сессий)

Основной продукт: баг-фиксы, новые фичи (Diia-аутентификация, контракты разработчиков, email-уведомления, испанская локализация с geo-detection, beta-access гейты, биллинг/auth аудиты, support-виджеты, Monobank донаты, locale routing), UI-редизайн, 93+ тестов.

Claude Code работает как full-stack разработчик: мультифайловые изменения, создание PR, мердж, деплой, обновление Plane-задач — всё в одной сессии.

### 2. Production Operations & DevOps (~61 сессия)

Наибольший рост за второй месяц. Claude стал SRE-напарником:
- Диагностика 502 ошибок, blue/green deploy инцидентов
- EBS volume expansion, DNS ошибки, CI/CD cron failures
- EC2 provisioning в разных регионах (Париж, Испания)
- Blue-green деплой с preview-средой
- Docker/nginx дебагинг, миграции серверов

Полный цикл incident response: от диагноза через PR merge до верификации на проде — без моего вмешательства.

### 3. Data pipelines для открытых данных (18 сессий)

Масштаб:
- 44K документов Верховной Рады
- 11.6M+ записей spending.gov.ua
- 190K+ торговых марок УКРПАТЕНТ
- 58K+ судебных решений

Claude Code оркестрировал multi-server, multi-IP параллельные скрипты загрузки. Дебажил rate limiting и WAF-блокировки. Управлял PostgreSQL bulk imports с repartitioning и GIN-индексами на 63M строк.

### 4. Безопасность (~8 сессий)

Новое направление второго месяца:
- Security-аудиты localhost/production на попытки взлома
- Threat analysis для document upload abuse
- 6 Tier 1 митигаций параллельно с тестами — за одну сессию
- Dependabot security alerts (vite, uuid, postcss)

### 5. MCP Server Ecosystem (14 сессий)

Построение и конфигурация MCP-серверов для Nextcloud Deck/Tables, Thunderbird email и ChatGPT. Миграция 180 задач из Linear в Nextcloud Deck (затем — в Plane).

### 6. Контент, бизнес-операции и side-проекты (~32 сессии)

Email (Google/бизнес переписка на украинском и английском), заявки в акселераторы, pitch deck, финансовое моделирование, LinkedIn-контакты из Sales Navigator, CFP submissions. Плюс side-проекты: симулятор Млечного Пути, EPUB-ридер (books.s0me.uk), Telegram-бот с цитатами Бендера.

---

## Как выглядит типичная рабочая сессия

Я не пишу детальные промпты. Мой стиль — **запускаю Claude на задачу, смотрю что делает, корректирую курс в реальном времени**. Промпты — короткие и целеориентированные: «check prod», «merge PR #1489 then revert it», «take LEXAI-865 into work».

Статистика за 50 дней: **190 случаев** wrong approach, **177 случаев** buggy code. Но 44 отклонённых действия за второй месяц — это хирургически точные коррекции, а не постоянный микроменеджмент.

**Результат: 84% сессий завершились successfully** (72 fully + 50 mostly achieved из 145 проанализированных за второй месяц).

---

## Что работает лучше всего

### End-to-end shipping с task tracking

Сильнейший паттерн за 50 дней: implementation → PR → merge → prod deploy → verify → update Plane task — всё в одной сессии.

### Incident response под давлением

Claude как first responder для prod-инцидентов: 502 от half-switched blue/green деплоев, полные EBS volumes, white-screen circular imports, misrouted Cloudflare A-records.

### Параллельная security работа

Threat modeling + 6 Tier 1 митигаций параллельно с тестами, CI fix, PR merge и task tracking — за один проход.

### Multi-file изменения — 56+ сессий

Когда нужно изменить тип в shared пакете, обновить backend handler, frontend компонент и тесты одновременно — Claude Code делает это за одну итерацию.

### MCP-интеграции как операционная инфраструктура

Plane для задач, AWS API для инфраструктуры, Thunderbird для email, Nextcloud для boards/tables/calendar — Claude Code становится полноценным операционным хабом.

---

## Где не работает (честно)

### Wrong Approach — 190 случаев за 50 дней

Claude часто начинает с неправильного подхода. Новый паттерн: коммитится к подходу до верификации цели. Яркий пример — PR замердженный в неправильный репозиторий, что потребовало revert и редеплой.

### Buggy Code — 177 случаев

Код с первого раза работает не всегда. На сложных багах (координатные системы, build tooling, import graphs) первая гипотеза часто неправильная.

### Scope Creep — новая проблема

Claude часто расширяет скоуп без запроса: после merge начинает проверять открытые PR, добавляет лишние аккаунты в outreach. Требует чётких границ «сделано».

---

## Экономика: AI-напарник vs команда

| | AI-напарник | Команда из 3 человек |
|--|-------------|----------------------|
| Стоимость/мес | ~$200 (Claude Pro) | $15 000-30 000 |
| Доступность | 24/7, параллельные сессии | Рабочие часы |
| Онбординг | 0 (CLAUDE.md) | 2-4 недели |
| Роли | Full-stack + DevOps + SRE + PM | Нужны отдельные специалисты |

**Один опытный инженер с AI-напарником может делать работу небольшой команды.**

---

## Что изменилось за второй месяц

Главная эволюция — от «кодера» к «оператору». В первый месяц Claude Code преимущественно писал код. Во второй — стал полноценным SRE-напарником:

- **Incident response**: диагностика 502, white-screen, полный EBS, misrouted DNS
- **Security**: threat modeling + 6 параллельных митигаций с тестами за одну сессию
- **Task management**: Plane интеграция — Claude сам обновляет статусы задач после деплоя
- **Бизнес-операции**: emails, pitch decks, LinkedIn — всё рядом с продакшн-дебагингом

---

## Выводы

1 200+ коммитов за 50 дней — это не фантастика. Это результат системной работы с AI-напарником, где:

- **CLAUDE.md** заменяет онбординг (и постоянно обновляется на основе ошибок)
- **MCP-интеграции** (Plane, AWS, Thunderbird, Nextcloud) заменяют переключение между инструментами
- **TypeScript + тесты** компенсируют 177 случаев buggy code
- **Sub-агенты** (1 461 за 50 дней) позволяют параллельное исследование сложных проблем

Заменит ли AI разработчиков? Нет. Но один разработчик с правильно настроенным AI-напарником — это уже не один разработчик. Это маленькая команда, которая не спит, не болеет, и может параллельно деплоить на прод, диагностировать 502 ошибки и строить симулятор Млечного Пути.

---

*P.S. Эта статья тоже написана с помощью Claude Code. А ещё Claude отфотошопил бейдж «Top Voice» с LinkedIn-фото коллеги — несколько итераций crop, blur и clone-stamp.*

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
  'fast-builds-aws': {
    title: 'Быстрая сборка в AWS: как перенести CI/CD runners в облако и забыть про OOM на ноутбуке',
    punchline: 'Ваш ноутбук — это не 32 CPU. npm install конкурирует за диск с Docker. TypeScript падает с OOM на большом монорепо, а Playwright не вытягивает параллелизм. Разбираем, как перенести GitHub Actions runners на AWS — от c7g Spot до actions-runner-controller на EKS — и получить 3-5× ускорение сборки без ада на локальной машине.',
    readTime: '12 мин',
    content: `# Быстрая сборка в AWS: как перенести CI/CD runners в облако и забыть про OOM на ноутбуке

*Ваш MacBook Pro нагревается до 98°C. Вентилятор на максимуме. Шестой раз за утро — "JavaScript heap out of memory". Docker съел все 16 GB, npm install ещё крутится, TS compile умер. А вам нужно задеплоиться до обеда.*

*Знакомо? Давайте перенесём сборки в AWS.*

---

## Почему локальная машина — это узкое место

Типичный ноутбук разработчика в 2026 году: 8-12 физических ядер, 16-32 GB RAM, 512 GB-1 TB NVMe. На бумаге — мощно. На практике во время сборки монорепо происходит следующее:

| Ресурс | Проблема |
|--------|----------|
| **CPU** | TypeScript compile (\`tsc\`), webpack/vite, Docker build, ESLint — всем нужны ядра одновременно |
| **RAM** | Node-процессы, Docker Desktop (4-8 GB), IDE, браузер, Slack — OOM неизбежен |
| **Диск** | \`node_modules\` на 2+ GB, Docker layer cache, test snapshots — конкуренция за IOPS |
| **Термальный троттлинг** | CPU снижает частоту на 30-50% через 5 минут под полной нагрузкой |
| **Сеть** | npm registry, Docker Hub, GitHub — всё тянется через домашний Wi-Fi |

А теперь добавьте self-hosted GitHub Actions runner на том же ноутбуке. Или, как в нашем случае, на выделенном сервере, который крутит одновременно сборку, тесты, Playwright, миграции БД и prod-сборку blue-green.

**Результат:** сборка, которая должна занимать 3 минуты, идёт 15. Раз в неделю runner умирает с OOM, и вы дебажите, почему \`vitest\` упал без стектрейса.

---

## Три источника боли в монорепо-сборках

### 1. OOM killer приходит в худший момент

Vitest с 400+ тестов, ts-jest с \`maxWorkers=1\`, webpack production build — каждый из них легко съедает 4-6 GB RAM. Когда параллельно крутится Docker build с \`multi-stage\` image на 2 GB — ядро OOM-kill-ит самый "жирный" процесс. Почти всегда это ваш тестовый раннер.

\`\`\`
# Классика жанра
FATAL ERROR: Reached heap limit Allocation failed -
  JavaScript heap out of memory
\`\`\`

Воркэраунд \`NODE_OPTIONS="--max-old-space-size=8192"\` лишь оттягивает момент. Настоящая проблема — физически недостаточно памяти.

### 2. Конкуренция за диск

SSD быстрый, но не бесконечный. Когда одновременно:
- \`npm ci\` распаковывает 200k файлов в \`node_modules\`
- \`tsc\` пишет 50k \`.d.ts\` и \`.js.map\`
- Docker buildx строит layer через COPY всего репо
- Vitest пишет coverage reports

… IOPS NVMe заканчиваются, и всё замедляется в 3-5 раз. Особенно больно на macOS с Docker Desktop (он виртуализирует ФС через virtiofs/9p).

### 3. Термальный троттлинг убивает длинные сборки

Первые 2 минуты сборки — 100% скорость. Дальше CPU нагревается, и контроллер снижает частоту. На MacBook Air это падение с 3.5 GHz до 2.0 GHz. Тест-сьют, который на холодной машине идёт 4 минуты, на горячей — 9.

---

## Опции: где крутить runners

| Опция | Плюсы | Минусы |
|-------|-------|--------|
| **Локальный ноутбук** | Ноль настроек | Всё выше |
| **Self-hosted на home-сервере** | Контроль, кэш | Одна точка отказа, апгрейд = купить железо |
| **GitHub-hosted (standard)** | Ноль обслуживания | 4 CPU / 16 GB — мало для больших сборок |
| **GitHub-hosted (large)** | 16-64 CPU | $0.008-0.032/мин — дорого при частых сборках |
| **AWS EC2 on-demand** | Любой размер, SSD | Нужно настроить runner, платить за простой |
| **AWS EC2 Spot** | -70% к цене | Прерывания, нужны ephemeral runners |
| **AWS Fargate/ECS** | Serverless, без управления VM | Медленный cold start, ограничения на disk |
| **EKS + actions-runner-controller (ARC)** | Auto-scale, warm pool, cost-efficient | Сложная настройка, нужен Kubernetes |

В этом гайде я фокусируюсь на AWS, потому что это то, на чём мы настроили CI для SecondLayer.

---

## Архитектура 1: EC2 Spot + ephemeral runners

Самый простой вариант для команды из 1-10 разработчиков.

### Идея

На каждый workflow job GitHub Actions поднимается свежая EC2 Spot instance, регистрируется как ephemeral runner, выполняет job, самоуничтожается. Стоимость — только во время сборки.

### Компоненты

\`\`\`
┌─────────────────┐
│  GitHub Action  │
│  workflow       │
└────────┬────────┘
         │ webhook
         ▼
┌─────────────────┐       ┌──────────────────┐
│  AWS Lambda     │──────▶│  EC2 Spot Fleet  │
│  (runner boot)  │       │  c7g.4xlarge     │
└─────────────────┘       │  (ARM, Graviton) │
                          └──────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  ephemeral       │
                          │  GHA runner      │
                          │  (1 job → self-  │
                          │   terminate)     │
                          └──────────────────┘
\`\`\`

### Ключевые настройки

**Instance type:** \`c7g.4xlarge\` (16 vCPU ARM Graviton3, 32 GB RAM, $0.0544/час Spot в eu-central-1 на момент написания). Для x86-сборок — \`c7i.4xlarge\`. Graviton даёт ~30% лучший price/performance, если ваш стек совместим (Node.js 20, Docker multi-arch — совместимы).

**Storage:** gp3 EBS с \`iops=6000, throughput=500 MB/s\`. Это критично: дефолтный gp3 даёт 3000 IOPS, что на сборке сразу становится bottleneck.

**AMI:** кастомный AMI с предустановленными Node 20, Docker, gh-runner, pnpm/npm кэшем с предыдущей сборки. Экономит 40-90 секунд на старте.

**IAM:** GitHub → AWS через OIDC (без long-lived ключей). \`sts:AssumeRoleWithWebIdentity\` на \`repo:overthelex/secondlayer:ref:refs/heads/main\`.

### Реальные цифры из наших экспериментов

| Метрика | Self-hosted на локальном сервере | AWS c7g.4xlarge Spot |
|---------|-----------------------------------|---------------------|
| \`npm ci\` (cold cache) | 94 с | 28 с |
| \`tsc --build\` (монорепо) | 142 с | 47 с |
| Vitest 422 теста | 78 с | 31 с |
| Docker build \`mono-backend\` | 186 с | 71 с |
| Полный pipeline (с деплоем) | 11 мин 40 с | 4 мин 10 с |
| Стоимость | $0 (но OOM 2×/неделю) | $0.004 за сборку (Spot) |

**3× ускорение за ~$0.10/день при средней активности.** Это дешевле, чем час работы junior'а в обед, пока сборка давит.

---

## Архитектура 2: actions-runner-controller на EKS

Для команды 10+ и большого количества параллельных сборок.

### Идея

Kubernetes-контроллер (ARC) слушает GitHub webhook, поднимает runner pods в вашем EKS кластере по требованию. Pods могут иметь warm pool (2-4 runners всегда готовы), тогда cold start почти нулевой.

### Преимущества перед вариантом 1

- **Warm pool** — 0 секунд на старт job'а (против 40-60 с для EC2 boot)
- **Ephemeral pods** — каждый job в чистом окружении, без shared state
- **Горизонтальное масштабирование** — 50 параллельных jobs = 50 pods на Spot nodes
- **Shared cache через EFS/S3** — \`node_modules\`, Docker layers, Playwright browsers

### Настройка в двух словах

\`\`\`yaml
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: legal-org-ua-runners
spec:
  replicas: 4
  template:
    spec:
      repository: overthelex/secondlayer
      labels:
        - aws-eks
        - graviton
      resources:
        limits:
          cpu: "8"
          memory: "16Gi"
      dockerdWithinRunnerContainer: true
      nodeSelector:
        karpenter.sh/capacity-type: spot
        kubernetes.io/arch: arm64
\`\`\`

Karpenter автоматически поднимает Spot nodes нужного типа, когда прилетает pending pod. Когда сборки заканчиваются — nodes засыпают через 30 секунд.

### Реальный кейс

Компания с ~80 разработчиков, 200-300 PR в день:
- Было: GitHub-hosted large runners, $4800/месяц
- Стало: ARC на EKS со Spot, ~$900/месяц
- Скорость: та же, потому что warm pool
- Overhead: один DevOps-инженер потратил 2 недели на настройку

---

## Типичные оптимизации, дающие наибольший эффект

### 1. Layer cache через ECR + BuildKit

\`\`\`yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache
    cache-to: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache,mode=max
\`\`\`

На нашем \`Dockerfile.mono-backend\`: первая сборка 186 с, последующие (с кэшем) — 24 с.

### 2. npm/pnpm кэш через S3 или actions/cache с AWS backend

Вместо того чтобы тянуть 2 GB \`node_modules\` с npm registry каждый раз — храним в S3, маппим в \`~/.npm\`. На 10 Gbit/s внутри AWS это ~5 секунд против 60+ с npm registry.

### 3. Матричный параллелизм тестов

\`\`\`yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx vitest run --shard=\${{ matrix.shard }}/4
\`\`\`

422 теста на 4 шардах — 31 с вместо 78 с. Шардинг работает только тогда, когда у вас есть ресурсы на параллелизм — на AWS это дёшево.

### 4. Warm image (custom AMI или prebaked container)

Предустанавливаем: Node 20, pnpm, Docker, gh, AWS CLI, Playwright browsers, Chrome deps. Экономия — 60-120 с на холодный старт.

### 5. Ephemeral runners для безопасности

Каждый job в свежем runner'е = ноль утёкших credentials, ноль state от прошлой сборки. Обязательно для публичных форков.

---

## Чего не делают, а зря

**1. Data transfer costs игнорируют.** Если ваш runner тянет 10 GB из Docker Hub на каждую сборку, и вы крутите 300 сборок/день — это 3 TB/день × $0.09/GB egress = $270/день. Решение: ECR pull-through cache с ограничением на AWS-регион.

**2. Secrets через GitHub Secrets вместо AWS Secrets Manager.** GitHub Secrets ограничены 64 KB, не ротируются автоматически, видны в audit log. Правильно — GitHub OIDC → IAM role → Secrets Manager.

**3. Один большой runner вместо многих маленьких.** \`c7g.16xlarge\` дороже, чем 4× \`c7g.4xlarge\`, и даёт меньше параллелизма. Горизонтальное масштабирование почти всегда лучше.

**4. Забывают про GitHub Actions runner version drift.** Ephemeral runners должны автообновляться на старте, иначе GitHub отключит job через год.

**5. Не ставят spot interruption handler.** Spot может забрать instance за 2 минуты предупреждения. Нужно: graceful runner shutdown, retry на другом runner'е.

---

## Экономика: когда есть смысл мигрировать

### Формула

\`\`\`
Выгода (USD/мес) = (старое_среднее_время - новое_среднее_время)
                 × сборок_в_день × 22 дня × стоимость_инженер-часа / 3600
\`\`\`

### Пример для SecondLayer

- Было: 11 мин 40 с средний pipeline на self-hosted
- Стало: 4 мин 10 с на AWS c7g Spot
- Экономия: 7 мин 30 с × 15 сборок/день × 22 дня = 41 час/месяц
- При $40/час инженера = **$1640/мес сэкономлено**
- Стоимость AWS (Spot + EBS + data): ~$80/мес

**ROI 20×. И это не считая того, что ноутбук инженера не нагревается до 98°C во время очередной итерации.**

---

## Когда AWS-runners — не лучшая идея

- **Проект с 2-3 сборками в неделю** — overhead настройки не окупится. Берите GitHub-hosted standard.
- **Секретные данные, которые нельзя вывозить в облако** — например, медицинские данные по HIPAA / военные данные. Self-hosted on-prem.
- **Нужно тестировать на физическом железе** — iOS-сборки требуют macOS runners (есть через MacStadium, но это отдельная боль).
- **Команда без Kubernetes-экспертизы** — ARC на EKS без опыта быстро станет "чёрным ящиком".

Для всего остального — AWS runners выигрывают.

---

## Как начать завтра

Минимальный путь (1-2 часа настройки):

1. **Создать IAM OIDC provider для GitHub** — без long-lived ключей.
2. **Создать IAM role** с доверием к \`token.actions.githubusercontent.com\` и правами на \`ec2:RunInstances\`, \`ec2:TerminateInstances\`.
3. **Поднять один EC2 self-hosted runner** через \`actions/runner\` в \`c7g.4xlarge\` Spot. Скачать runner binary, зарегистрировать с \`--ephemeral\`.
4. **В workflow заменить** \`runs-on: ubuntu-latest\` на \`runs-on: [self-hosted, aws, arm64]\`.
5. **Измерить** время сборки. Если экономия есть — автоматизировать через Terraform/Pulumi/CDK.

Следующие шаги (неделя):
- Layer cache через ECR
- S3 backend для \`actions/cache\`
- Шардинг тестов
- Custom AMI с prewarm

Дальше (месяц):
- ARC на EKS + Karpenter
- Warm pool
- Observability через CloudWatch + Prometheus

---

## Вывод

Локальные сборки на ноутбуке — это самый дорогой вариант по любому измерению: потраченного времени, нервов, износа техники. Self-hosted runner на выделенном сервере — лучше, но всё равно упирается в железо.

AWS runners — это не "переход в облако ради моды". Это простое инженерное решение: 16 ядер за $0.05/час работают быстрее, чем 8 ядер ноутбука под термальным троттлингом. А ephemeral runners решают кучу проблем безопасности, о которых на локальной машине не думаешь до первого инцидента.

Для SecondLayer мы начинали с self-hosted runner на \`local.legal.org.ua\`. Он до сих пор жив для blue-green preview-фазы, потому что там нужен доступ к prod-сети. Но тяжёлая сборка, тесты и Docker — всё теперь на AWS Spot. **Раз в неделю экономим 40+ минут жизни инженера.** И с каждым новым сервисом в монорепо этот разрыв только растёт.

Если ваш ноутбук шумит во время \`npm run build\` — вы уже платите. Вопрос только в том, кому.

---

Регистрация: [legal.org.ua](https://legal.org.ua)`,
  },
};
