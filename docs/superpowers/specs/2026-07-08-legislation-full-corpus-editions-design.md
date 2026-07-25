# Повний корпус законодавства України з історичними редакціями → bge-m3 → Qdrant

**Дата:** 2026-07-08
**Гілка:** `feat/legislation-full-corpus-editions`
**Статус:** дизайн затверджено, реалізація почата

## Мета

Побудувати датасет **усього законодавства України** (нормативно-правові акти з
zakon.rada.gov.ua) з **усіма історичними редакціями**, векторизувати bge-m3 на
Brev GPU і додати до колекції векторів прод-пошуку.

Поточний стан до проєкту: на проді лише **654 курованих акти** (7 084 редакції,
1.29 млн статей), вже векторизовані в `legal_sections_bge` (759 336 точок, bigbox).
Це ~0.2% реального корпусу.

## Ключові факти розвідки (2026-07-08, перевірено на даних)

### Реальний розмір корпусу (спростовує оцінку «1.3 млн актів»)
«1.3 млн» = це 1.29 млн **рядків-статей** по 654 актах, а не акти. Реальний
універсум:

- **293 049 актів** усіх типів (bulk-файл `doc.txt` з Rada open-data).
- **39 335 актів мають історичні редакції** (події podid 0/6 у `doc-dates.txt`).
- **407 159 унікальних текстів** до завантаження = 285 235 базових (подія
  «Прийняття», podid 4) + 122 083 редакції (podid 0 «Редакція» / 6 «Нова редакція»),
  за вирахуванням збігів дат. Перевірено: КК (nreg `2341-14`) має 242 podid-0 +
  1 podid-4 = 243 = `edcnt` у card JSON.
- Типи: тип «Закон» (id 1) = 7 978; Постанова (id 2) = 75 963; та ін. (довідник `typ.txt`, 134 типи).
- Статуси (довідник `stan.txt`): Чинний (5) = 121 139; Втратив чинність (1) = 45 495; Не визначено (0) = 125 482.

### Санкціоноване bulk + API джерело (без Cloudflare-скрейпу)
Rada **open-data портал** `data.rada.gov.ua/ogd/zak/laws/` (CC-BY 4.0, hourly,
статичні файли, БЕЗ Cloudflare-throttle). Доступ до API вимагає заголовок
`User-Agent: OpenData` (або cookie `OpenData`).

Використовувані файли (win-1251, tab-separated):
- `data/csv/doc.zip` → `doc.txt` (293 049) — картки: `dokid, nreg, nazva, status, types, …`.
- `data/csv/ist.zip` → `ist.txt` (293 049) — упакована історія per-документ.
- `data/csv/doc-dates.zip` → `doc-dates.txt` (663 510 подій) — **плоска таблиця подій**
  `poddat, nreg, podid, pidstava` → джерело дат редакцій **у bulk, без мережі**.
- Довідники `data/csv/{podia,stan,typ}.txt`.

API (per-edition текст, потрібна мережа):
- Картка: `https://data.rada.gov.ua/laws/card/{nreg}.json` → `eds[]`
  (`{podid, datred, format, pages, pidstava, size}`), `edcnt`.
- Текст редакції: `https://data.rada.gov.ua/laws/show/{nreg}/ed{YYYYMMDD}` → HTML з
  шапкою (Стан, Ідентифікатор, «Текст документа від DD.MM.YYYY»).

### Rate (проба 15 послідовних запитів, 2026-07-08)
15/15 → HTTP 200, **жодного 429/challenge**. ~2.43 с/запит single-stream (латентність
рендера, домінує на великих кодексах ~0.7–1.5 МБ; середній акт ~13 КБ значно
швидший). 407K текстів: single-stream ~11 діб; **10–20 паралельних потоків ≈ ~1 добу**.
Bottleneck — Stage 2, але це санкціоноване API, не Cloudflare-скрейп.

## Архітектура: 5 розв'язаних стадій, кожна з checkpoint/resume

Робоча БД — на **Brev host Postgres 16** (нова БД `rada_npa`; диск `/data` 7.9 ТБ
вільно; там же GPU і вирішений транспорт prod→brev). Прод скрейпом НЕ навантажуємо.

### Stage 0 — master-перелік
Завантажити `doc.zip` + довідники → таблиця `rada_docs_master(dokid, nreg, nazva,
status, types_raw, imported_at)`. Ключ дедупу — `nreg`. ~293K рядків. Мережі майже
нема (один bulk-файл).

### Stage 1 — перелік редакцій (BULK, без мережі)
Завантажити `doc-dates.zip` → таблиця `rada_events(nreg, poddat, podid, pidstava)`.
Вивести `rada_editions(nreg, ed_date, podid, is_current)` фільтром `podid IN (0,4,6)`,
з валідацією формату дати YYYYMMDD. ~407K рядків. **Опційне збагачення** card JSON
(`size`, `format`) — можна пропустити або підтягнути лениво в Stage 2.

### Stage 2 — завантаження full-text редакцій (bottleneck)
Для кожного `(nreg, ed_date)` → GET `/laws/show/{nreg}/ed{date}` з `UA: OpenData` →
`rada_edition_texts(nreg, ed_date, http_status, raw_html, clean_text, char_len,
fetched_at)`. Багатопотоково (10–20), **multi-IP за потреби** (техніка prod-EIP +
WG-хости з `reference_rada_scrape_ips`), throttle + resume per `(nreg,ed_date)`,
експон. backoff на 429/5xx. Текст-дедуп: сусідні байт-ідентичні редакції
згортаються (як у bge-міграції). Парсинг HTML → чистий текст (зняти шапку/навігацію).

### Stage 3 — чанкінг (article-aware hybrid)
Де є структура «Стаття N» — різати по статтях (парсер з
`scripts/rada/import-historical-editions.ts`), чанки CHUNK_SIZE=500/overlap=100
(як у поточній колекції); де постанови/накази по пунктах — віконний чанкінг.
Payload: `{nreg, doc_type, article_number, chunk_index, text, valid_from_ts,
valid_to_ts, is_current, status, document_type:'legislation'}`. Експорт у JSONL-шарди.

### Stage 4 — bge-m3 embed → Qdrant
Ембеддинг на Brev 8×H100, перевірений рецепт: `onnxruntime-gpu==1.20.1` **CUDA EP**
(не TRT), batch, ~1400+ чанків/с. Upsert у **нову колекцію `legislation_full_bge`**
(1024 Cosine) на serving-Qdrant — поточну `legal_sections_bge` (підключену до проду)
НЕ чіпаємо до cutover. `vector_id = md5("leg_{nreg}_v_{valid_from}_chunk_{idx}")`
(ідемпотентно). Валідація self-search → перемикання прод-пошуку на нову колекцію
флагом `LEG_BGE_COLLECTION` після перевірки.

## Оцінки

| Метрика | Значення |
|---|---|
| Акти | 293 049 |
| Акти з редакціями | 39 335 |
| Унікальних текстів (Stage 2) | ~407 159 |
| Символи тексту | ~10–15 млрд (оцінка) |
| Чанки/вектори | ~20–40 млн (оцінка) |
| GPU-ембеддинг (Brev) | години |
| Скрейп Stage 2 (10–20 потоків) | ~1 доба |
| Raw HTML на диску (Brev) | ~0.3–1 ТБ |

## Рішення (дефолти)
1. Робоча БД — Brev PG (`rada_npa`), не прод.
2. Джерело дат редакцій — bulk `doc-dates.txt`, НЕ per-doc скрейп.
3. Текст — OpenData API `data.rada.gov.ua` (UA=OpenData), не Cloudflare-скрейп zakon.rada.
4. Нова колекція `legislation_full_bge`, cutover флагом після валідації.
5. Чанкінг article-aware hybrid — сумісність payload з існуючою колекцією.

## Скрипти (нові, `scripts/legislation/full-corpus/`)
- `00_fetch_bulk.sh` — завантажити doc/ist/doc-dates/dict з Rada open-data.
- `01_load_master.py` — parse doc.txt + dict → `rada_docs_master` (Brev PG).
- `02_load_editions.py` — parse doc-dates.txt → `rada_events` + `rada_editions`.
- `03_fetch_texts.py` — багатопотоковий завантажувач редакцій (resume, backoff, multi-IP).
- `04_chunk.py` — article-aware чанкінг → JSONL-шарди.
- `05_embed_upsert.py` — bge-m3 ORT CUDA → Qdrant `legislation_full_bge` (на Brev).

## Пов'язане
`project_legislation_editions_backfill`, `project_legislation_bge_migration`,
`reference_rada_scrape_ips`, `reference_brev_pg`, `reference_brev_wg`,
`project_edrsr_unified_brev` (рецепт bge-m3 на Brev).
