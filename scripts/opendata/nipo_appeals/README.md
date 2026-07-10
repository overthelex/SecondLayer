# NIPO Appeals Chamber decisions dataset (Апеляційна палата НОІВ)

Скрейпер, що будує повний датасет рішень Апеляційної палати НОІВ у **окремій
базі `nipo_appeals`** (Postgres на GCP dev VM) з інструментом інкрементального
оновлення.

## Джерела

| Джерело | Роки | Розділи | Обсяг |
|---|---|---|---|
| nipo.gov.ua (3 сторінки, без пагінації) | 2024–2026 | ТМ / винаходи-КМ / добре відомі ТМ | ~170 рішень |
| ukrpatent.org легасі-архів (36 річних сторінок) | 2011–2022 | ті самі | ~1 086 рішень |
| XLSX-реєстр добре відомих ТМ (хаб nipo.gov.ua) | 1995–2025 | добре відомі ТМ | ~245 записів |

Кожне рішення = пара PDF (наказ + рішення), усі PDF текстові (OCR не потрібен).
2023 — діра в обох джерелах (палата перезапускалась під НОІВ).
Раніше 2011 онлайн-архіву нема (окремо — web.archive.org, джерело `ukrpatent` +
`raw.wayback`).

## Пайплайн

```
лістинги (HTML) → інкрементальний фільтр (skip відомих decision_pdf_url)
  → пул процесів (--workers): download наказ+рішення+зображення, pypdf-текст,
    поля (апелянт, заявник, № заявки, колегія, результат з резолютивки)
  → ВАЛІДАЦІЯ (errors → data/rejects.ndjson, у БД не потрапляють)
  → upsert у Postgres (ON CONFLICT decision_pdf_url)
  → XLSX-реєстр добре відомих ТМ → nipo_well_known_tms (+лінк до рішень)
```

Схема БД: `db.py` (`--create-schema`), таблиці `nipo_appeal_decisions`
(з tsvector-колонкою для FTS) і `nipo_well_known_tms`.

## Запуск (dev VM, контейнер)

```bash
# збірка (контекст = scripts/opendata)
cd ~/nipo_appeals_build && docker build -t nipo-appeals -f nipo_appeals/Dockerfile .

# перший повний прохід
source ~/nipo_appeals.env
docker run --rm --name nipo-appeals-full \
  --network deployment_secondlayer-local \
  -e DATABASE_URL="postgresql://nipo_appeals:${NIPO_APPEALS_PASSWORD}@secondlayer-postgres-local:5432/nipo_appeals" \
  -v nipo_appeals_data:/data \
  nipo-appeals --create-schema --full --workers 6

# інкрементальне оновлення (дефолтний режим) — тільки нові рішення
docker run --rm --name nipo-appeals-update \
  --network deployment_secondlayer-local \
  -e DATABASE_URL="postgresql://nipo_appeals:${NIPO_APPEALS_PASSWORD}@secondlayer-postgres-local:5432/nipo_appeals" \
  -v nipo_appeals_data:/data \
  nipo-appeals
```

Корисні прапорці: `--dry-run --limit 5` (смоук без БД), `--sources nipo`
(тільки новий сайт — для регулярних оновлень достатньо), `--sections tm`,
`--skip-wellknown`. Ненульовий exit code = були відхилені валідацією записи
(див. `/data/rejects.ndjson`).

PDF/зображення кешуються у volume `nipo_appeals_data` (шляхи — у
`raw.files` кожного запису); повторні запуски їх не перекачують.

## Оновлення за розкладом

Щотижневий cron на dev VM (нові рішення публікуються лише на nipo.gov.ua):

```cron
0 3 * * 1 . $HOME/nipo_appeals.env && docker run --rm --network deployment_secondlayer-local -e DATABASE_URL="postgresql://nipo_appeals:${NIPO_APPEALS_PASSWORD}@secondlayer-postgres-local:5432/nipo_appeals" -v nipo_appeals_data:/data nipo-appeals --sources nipo >> $HOME/nipo_appeals_cron.log 2>&1
```

## Доступ до БД (read-only)

Юзер `vladimir` (SELECT на всі таблиці). Підключення через SSH-тунель до dev VM:

```bash
ssh -N -L 5439:localhost:5432 <user>@34.116.251.221   # dev VM
psql "postgresql://vladimir:<password>@localhost:5439/nipo_appeals"
```

Пароль — у Ігоря (генерується при створенні юзера, див. `~/nipo_appeals.env`
на dev VM).

## Локальний смоук-тест

```bash
cd scripts/opendata
pip install -r nipo_appeals/requirements.txt
python -m nipo_appeals.main --dry-run --limit 4 --sources nipo --skip-wellknown
```
