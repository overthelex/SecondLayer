# Phase B Audit Report

## 1. Language Distribution

| Language | Count | % |
|----------|-------|---|
| en | 113 | 56.5% |
| ru | 57 | 28.5% |
| uk | 22 | 11.0% |
| et | 2 | 1.0% |
| bg | 2 | 1.0% |
| unknown | 1 | 0.5% |
| nl | 1 | 0.5% |
| no | 1 | 0.5% |
| fr | 1 | 0.5% |

**Summary:** 113 samples (56.5%) are pure English.
87 samples detected as non-English (may be code-heavy triggering false detection).

**Decision:** Translation triage required for non-English samples.

## 2. Token Length Distribution

| Metric | Value |
|--------|-------|
| P10 | 11 |
| P25 | 15 |
| P50 (median) | 29 |
| P75 | 60 |
| P90 | 133 |
| Max | 3170 |
| >1000 tokens | 1 samples |
| >2000 tokens | 1 samples |
| >4000 tokens | 0 samples |

No samples exceed 4000 tokens. All within acceptable range for crowd annotation.

## 3. Stratification Verification

| Class | Expected | Actual | Status |
|-------|----------|--------|--------|
| substantive_rewrite | 144 | 144 | OK |
| cosmetic | 15 | 15 | OK |
| reorganization | 11 | 11 | OK |
| rejection | 10 | 10 | OK |
| factual_correction | 10 | 10 | OK |
| tone_adjustment | 10 | 10 | OK |

**Result:** All strata match documented allocation.

## 4. Content Type Breakdown

| Type | Count | % |
|------|-------|---|
| prose | 160 | 80.0% |
| mixed_prose_code | 33 | 16.5% |
| structured | 5 | 2.5% |
| pure_code | 1 | 0.5% |
| code_with_comments | 1 | 0.5% |

## 5. Samples Flagged for Review

**Non-English detected (87 samples):**

- `7deda298...` [et] 120tok: Готово — всюди `mail.merged.com.ua` (TB prefs + user.js + mcptb .env), директорію перейменовано. Від
- `42569974...` [uk] 50tok: Сканує далі. Запрос по 2025 на великій таблиці потребує часу. Подивлюсь через хвилину.
- `de31d145...` [uk] 71tok: Знайшов причину: існуючий `user.js` (з попереднього додавання panoptic) примусово перезатирає `accou
- `86ba2002...` [ru] 39tok: **200 OK!** Redirect loop исправлен. Проверю что и вложенные страницы работают, и SEO краулеры получ
- `7c56cb07...` [uk] 17tok: Тепер скидаю state при старті стріму:
- `bc5c2f2c...` [ru] 17tok: CI/CD может ещё не задеплоить. Проверю:
- `a22ab90f...` [ru] 84tok: Жду 30 минут для проверки прогресса. Параллельный rsync работает — 6 сегментов качаются одновременно
- `cb40f016...` [uk] 26tok: Now update the "Як виглядає типова робоча сесія" section:
- `bdf4bd0a...` [ru] 42tok: 67/77 сегментов, 215GB. Почти готово — осталось 10 сегментов (~20GB). Ещё минут 10.
- `8ba8cd72...` [uk] 28tok: Plane API віддав HTML (502/timeout). Повторю по черзі з паузами:
- `04faa22d...` [ru] 79tok: 30.3 GB и всё ещё грузит edrsr_decisions — 8 минут прошло. С 1.6 TB данных даже mmap требует пройти 
- `9e5603ad...` [uk] 71tok: У diff є також зміни ресурсів qdrant (cpus/memory) які були до нашої сесії. Включу все в один коміт 
- `19fd85b1...` [ru] 27tok:   Предыдущий деплой прошёл. Мержим PR со streaming фиксом?
- `e1c15871...` [uk] 33tok: Qdrant працює, API key правильний. Перезапускаю векторизацію.
- `bc044077...` [ru] 50tok: Connection refused — DNAT на приватные IP не работает для внешнего трафика через публичный IP (AWS N
- `40da489b...` [ru] 26tok: Теперь привязываю задачи и потом ставлю правильные даты:
- `503ec5fe...` [ru] 25tok: Нужно увидеть, внутри какого layout/wrapper эта route вложена:
- `c7d7daa4...` [ru] 35tok: Сначала посмотрю текущий HR флоу в портале — где HR вводит URL и выбирает уровень.
- `48002f26...` [uk] 187tok: **Прогрес (16:06):** - У поточному run: 1,637,262 docs, 48 docs/s - Сумарно: ~5.01M / 33.7M = **14.8
- `994e7aa4...` [ru] 148tok: Вижу — после "russian" раскладка осталась на EN. Потом вы набрали ";t" (же) и switchamba переключила
- `9ae86426...` [ru] 30tok: Вижу AWS MCP серверы. Скопирую только их в `.mcp.json` этого проекта:
- `a37c68df...` [ru] 47tok: Build clean. Теперь восстанавливаю заглушки в main repo (я их временно перезаписал реальным контенто
- `891088f8...` [ru] 134tok: Есть индексы на партициях, но только `idx_ed_p_*_justice` (отдельно justice_kind) и `idx_ed_p_*_adj_
- `1141c8d9...` [ru] 73tok: Подождите — Ctrl+Shift+U слишком сложно. Проще: после переключения раскладки на RU, просто **повтори
- `f2c5e3a3...` [uk] 107tok: Стоп — важлива знахідка. Всі MinIO user-бакети займають разом **лише ~6 GB**, а не 2.5 TB. Це означа
- `a6d6b99c...` [ru] 45tok: Проблема в буферизации — nginx или Cloudflare буферизируют SSE ответ и отдают всё разом. Проверю ngi
- `f1b5dfc2...` [ru] 29tok: Тепер проверю количество документов ЦПК в базе и текущее состояние токенов Voyage.
- `8922f0e5...` [ru] 33tok: Snap-версия MarkText не имеет доступа к `/tmp`. Копирую в домашний каталог.
- `6cedcf0d...` [ru] 48tok: Rsync идёт на ~90 MB/s, 6-7% за 15 секунд. При ~1.6 TB это ~5 часов. Поставлю монитор.
- `351ac67a...` [uk] 34tok: Тепер запускаю міграцію на локальній БД і білдю контейнер:
- `fa76d947...` [uk] 126tok: Виправлено:  - **Овчаров Володимир Валентинович** (В. В.) — було помилково «Олегович». - **Кириченко
- `2b1bcfb4...` [uk] 62tok: ✅ Framework відмінно: 3 IPs знайдено auto-discovery (.129/.146/.162), 6 workers, 778 ECLIs за 2 дні 
- `4ee77372...` [unknown] 10tok: Чекаю наступну.
- `c6662016...` [uk] 55tok: Повна картина є. Будую адмін-панель: auth на бекенді (bcrypt + JWT) + React UI.  Спочатку — бекенд a
- `2bf78335...` [ru] 26tok: /tmp не shared с контейнером. Запишу скрипт прямо в volume.
- `92aa6cae...` [ru] 207tok: Все три места, где на сайте есть лого, обновлены на новую хекс-М:  - `apps/landing/src/components/he
- `f3ae7a8a...` [uk] 171tok: `5c61c3f` запушено. Тепер `forum_monitor` зберігає:  - **body** — snippet/preview тексту з listing p
- `b3ec5d78...` [ru] 564tok: Вот полная картина за последнюю неделю:  ## Сводка за 7 дней  | Метрика | Значение | |---------|----
- `fc6f215d...` [ru] 21tok: Collector отдаёт. Теперь проверю что новый VM может достучаться:
- `040744eb...` [ru] 126tok: Мониторю. Тем временем — у тебя на скриншоте всё зелёное (6 tools, все ✓), но нет "Processing result
- `0983e6de...` [nl] 358tok: **20/20 отправлено** (кампания `investor-nl`, Нидерланды):  | # | Имя | Chars | |---|-----|-------| 
- `02d3a266...` [no] 9tok: Тепер v1 event type test:
- `68a109c3...` [ru] 15tok: Нужно добавить `QDRANT_API_KEY` в runner.
- `1b4122aa...` [et] 35tok: Працює. Перевіряй коли треба: `ssh prod "tail -1 /tmp/vectorize-cpk.log"`
- `cd37d9a2...` [ru] 40tok:   Понял, домен `legal.org.ua`, не `sneakypiper.com`. Удалю неправильную запись и добавлю правильную:
- `7081d693...` [ru] 32tok: `66cb64d` — запушено. GitHub показывает 7 vulnerabilities в dependabot — хочешь проверить?
- `b51fc123...` [ru] 299tok: Нашёл проблему. BusyBox `nc` резолвит `localhost` в `::1` (IPv6), а Tor слушает только на `0.0.0.0` 
- `103078f3...` [ru] 44tok: Скорее всего sudo+ssh не работает — root не имеет ключа на compute. Другой подход: сделаю readable к
- `2ed18a69...` [uk] 40tok: Addresses **402,246** — готово! Relationships пішли (найбільша — 2.9M). Ще ~5 хв.
- `523bf1b2...` [bg] 22tok: 19 edrsr_fulltext партиций. Изменю MAX_PARALLEL на 4:
- `579a2f3c...` [ru] 46tok: Теперь проверю embedding-service.ts — он тоже ходит в Qdrant, но для других коллекций (legal_section
- `573c64ed...` [ru] 200tok: Готово. Вот что сделано:  **12 видеоклипов** извлечены из MKV-файлов Futurama: - Субтитры из каждого
- `f30bf52a...` [ru] 14tok: Теперь задеплоим на прод и проверим.
- `d24ce76c...` [uk] 38tok: Спершу знайду compose-файл і поточний healthcheck, потім зроблю бекап і фікс.
- `a65f333d...` [ru] 35tok: Теперь получу IP mail-сервера и добавлю все DNS записи (MX, SPF, DKIM, DMARC) в Cloudflare.
- `a7517059...` [ru] 29tok: 42.3 GB — продолжает. При старом лимите (40 GB) уже был бы OOM kill.
- `43afa42f...` [uk] 41tok: Upstream правильний. Nginx щойно пересоздано. Але 502... Перевірю з'єднання:
- `41836f92...` [ru] 742tok: Прежде чем писать код — feature затрагивает несколько слоёв (БД, email, роут). Хочу согласовать объё
- `bd4642a4...` [ru] 125tok: Скорее всего — гонка при восстановлении clipboard: `write_clipboard(old_clipboard)` в `finally` зати
- `b5004c20...` [ru] 57tok: Обновлю chat.py — `_exec_tool` уже обрабатывает `sl_` prefix через `secondlayer.call_tool()`, и `_to
- `d72a55cb...` [bg] 34tok: Я вижу просто `ORDER BY adjudication_date DESC`, а не ранжирование. Проверю rada-legislation-adapter
- `805e12f9...` [ru] 33tok: 41.9 GB — темп ~0.4 GB/мин стабильный. Ещё ~13 GB до лимита.
- `c14bdba1...` [ru] 34tok: Теперь подготовлю MCP-сервер как npm-пакет `calendary-mcp` для публикации.
- `006669d7...` [uk] 124tok: Проблема в `scale` — для деяких атракторів (thomas 1.5, halvorsen 1.8) масштаб замалий. Ці значення 
- `d7df8485...` [ru] 17tok:   3 из 4 готовы. Жду VirusTotal...
- `19b0e276...` [ru] 181tok: Kadelbach и Breidenbach из первого батча — видимо отправились как invitation но не обновились в очер
- `7fda9fd9...` [ru] 49tok: Это Reinforcement Fine-Tuning (RFT) формат для Nova. Но мы видели Nova Pro в списке обычного fine-tu
- `92433c58...` [uk] 82tok: Cloudflare заблокувало IP після перших спроб. HUDOC — справжній Playwright case (як казав stub). Пер
- `dbccfe0a...` [ru] 29tok: Все 10 клипов нарезаны. Теперь склею в одно видео.
- `5745490a...` [ru] 98tok:   Нет, всё готово. Сделал:  1. **Секция Claude Code (MCP)** на странице `/settings` — между Google C
- `85fe0dce...` [ru] 19tok: Чисто. Пересоберу и запущу контейнер:
- `d2027ad7...` [ru] 48tok:   Значит пересобранный Docker image не подхватился — MCP сервер запускается через `docker compose ru
- `7677024d...` [uk] 376tok: Активних сесій нема. Стан незмінний з завершення черги вчора о 19:08:  **DB:** - `edrsr_fulltext`: *
- `c1c2be11...` [ru] 50tok: 38 эпизодов. Запущу параллельные агенты — каждый обработает несколько эпизодов и извлечёт реплики Бе
- `3b468361...` [ru] 76tok: Вот проблема. `GET /api/documents/:id` принимает `req.params.id` без валидации UUID. Если фронт пере
- `c8682230...` [ru] 156tok: Напрямую работает. Проблема — Cloudflare по умолчанию проксирует на порт 443/80, а наш сервер на 808
- `970f486f...` [ru] 29tok: Preview upstreams тоже вказує на видалений контейнер. Виправлю обидва:
- `3a9b47c1...` [ru] 132tok:   Прогресс! Round 1 отработал (4 tools ✓), Round 2 запущен (5 tools крутятся — OFAC, INTERPOL, Corpo
- `3ac97ee8...` [uk] 90tok: Це seed discovery records, не реальні пости. Потрібно їх відобразити інакше — як каталог знайдених .
- `dcc96795...` [uk] 64tok: Спочатку швидко перевірю офіційну цитату ст. 1 через zakon.rada.gov.ua, щоб агент-виконавець мав кан
- `36fb5f96...` [ru] 54tok: Запущен. Раскладка EN. Наберите "ghbdtn" — после 3 символов должно стереть "ghb", переключить на RU,
- `d3ddc1f5...` [fr] 21tok: Now let me view section 5.1, 5.2, 5.7 content:
- `eb3dc7c8...` [ru] 53tok: В `before.rules` уже есть NAT для enp10s0, но нет фоллбэка на enp11s0. И нет правил DOCKER-USER.  До
- `b3484807...` [ru] 56tok: Panoptic работает, но юзера `vovkes` нет — всё через `ubuntu`. Давайте создам юзера и настрою SSH, а
- `e3764988...` [ru] 24tok: Monitor ещё работает (crawling 400 forums). Подожду завершения:
- `db4ac7a2...` [ru] 64tok: Відкочено. PR #1490 revert влито в main, CI/CD підхопить і видалить under-construction landing з ngi
- `1c81bbc1...` [ru] 81tok: Два rsync процесса бегут (первый не был убит). Оба всё ещё на фазе enumeration (rsync сначала сканир

## 6. Decision Log

- **Translation:** [pending Phase 1 review]
- **PII scan:** [pending Phase 2]
- **Long sample handling:** [pending review]
