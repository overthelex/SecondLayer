# OpenReyestr -- Швидкий старт

## Передумови

- Node.js 20+
- PostgreSQL 15+

## Налаштування (4 кроки)

### 1. Встановити залежності

```bash
cd mcp_openreyestr
npm install
```

### 2. Налаштувати оточення

```bash
cp .env.example .env
nano .env  # Задати POSTGRES_PASSWORD та SECONDARY_LAYER_KEYS
```

Мінімально необхідні змінні:
```env
POSTGRES_PASSWORD=your-password
SECONDARY_LAYER_KEYS=your-api-key
```

### 3. Створити базу даних

```bash
npm run db:setup
```

Ця команда створить БД `openreyestr` та виконає всі 14 міграцій.

### 4. Імпортувати дані

```bash
# Завантажити та імпортувати всі реєстри НАІС автоматично
npm run import:nais

# Або синхронізувати всі реєстри (завантаження + імпорт)
npm run sync:registries

# Або синхронізувати конкретний реєстр
npm run sync:registry -- --only=notaries
```

Доступні окремі імпорти:
```bash
npm run import:entities           # Юридичні особи / ФОП з XML
npm run import:debtors            # Боржники з CSV
npm run sync:edrpou               # ЄДРПОУ
npm run import:street-renamings   # Перейменування вулиць (OpenStreetMap)
```

## Запуск сервера

**MCP stdio (для Claude Desktop):**
```bash
npm run build
npm start
```

**HTTP API:**
```bash
npm run dev:http
```

Сервер стартує на http://localhost:3004

## Перевірка

### HTTP API

```bash
# Список інструментів (27 штук)
curl http://localhost:3004/api/tools \
  -H "Authorization: Bearer your-api-key"

# Пошук юридичних осіб
curl -X POST http://localhost:3004/api/tools/search_entities \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "Приватбанк", "limit": 5}}'

# Статистика реєстру
curl -X POST http://localhost:3004/api/tools/get_statistics \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"arguments": {}}'

# Перевірка здоров'я
curl http://localhost:3004/health

# Статистика по таблицях (без автентифікації)
curl http://localhost:3004/api/stats
```

### Claude Desktop

Налаштувати `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openreyestr": {
      "command": "node",
      "args": ["/path/to/SecondLayer/mcp_openreyestr/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://openreyestr:password@localhost:5435/openreyestr"
      }
    }
  }
}
```

## Вирішення проблем

### Помилка підключення до БД

```bash
# Перевірити, що PostgreSQL працює
sudo systemctl status postgresql
# Перевірити параметри в .env
```

### HTTP-сервер не стартує

```bash
# Перевірити, чи порт 3004 вільний
lsof -i :3004
# Змінити порт в .env: HTTP_PORT=3005
```

### Імпорт не працює

- Перевірити наявність місця на диску (імпорт потребує ~10-20 ГБ)
- Перевірити мережеве з'єднання (для download-nais)
- Переглянути логи: `npm run import:nais 2>&1 | tee import.log`

## Детальна документація

Див. [README.md](README.md) -- повний список 27 інструментів, схема БД, API-ендпоінти.
