# Desktop Client Setup - Quick Start

Покрокова інструкція для підключення SecondLayer MCP до Claude Desktop.

## ✅ Передумови

1. **Claude Desktop встановлено**
   - Завантажити: https://claude.ai/download

2. **Проект зібрано:**
```bash
cd <project-root>/mcp_backend
npm run build
```

3. **Інфраструктура запущена:**
```bash
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d postgres qdrant redis
```

## 📝 Крок 1: Знайти конфігураційний файл

Залежно від ОС:

**macOS:**
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
nano ~/.config/Claude/claude_desktop_config.json
```

## 📋 Крок 2: Додати конфігурацію

Скопіюйте цей JSON у файл (або додайте до існуючого):

```json
{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": [
        "<project-root>/mcp_backend/dist/index.js"
      ],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "secondlayer",
        "POSTGRES_PASSWORD": "YOUR_POSTGRES_PASSWORD",
        "POSTGRES_DB": "secondlayer_db",
        "QDRANT_URL": "http://localhost:6333",
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY",
        "OPENAI_MODEL_QUICK": "gpt-4o-mini",
        "OPENAI_MODEL_STANDARD": "gpt-4o-mini",
        "OPENAI_MODEL_DEEP": "gpt-4o",
        "OPENAI_EMBEDDING_MODEL": "text-embedding-ada-002",
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Автоматичний спосіб (macOS/Linux):**
```bash
cp config-examples/claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

## 🔄 Крок 3: Перезапустити Claude Desktop

1. Повністю закрити Claude Desktop (Cmd+Q на macOS)
2. Відкрити знову

## ✅ Крок 4: Перевірити підключення

1. У Claude Desktop створити новий чат
2. Шукати іконку 🔌 або MCP tools у інтерфейсі
3. Спробувати команду:

```
Покажи доступні MCP інструменти
```

Або:

```
Знайди судові рішення про мобілізацію за 2023 рік
```

## 🔍 Перевірка логів

Якщо щось не працює:

**Claude Desktop логи (macOS):**
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**MCP Server логи:**
```bash
tail -f <project-root>/mcp_backend/logs/combined.log
```

## 🐛 Troubleshooting

### Помилка: "Server not found"

**Причина:** Неправильний шлях до dist/index.js

**Рішення:**
```bash
# Перевірити чи файл існує
ls -la <project-root>/mcp_backend/dist/index.js

# Якщо немає - зібрати
npm run build
```

### Помилка: "Connection timeout"

**Причина:** Сервіси не запущені

**Рішення:**
```bash
cd <project-root>/mcp_backend
cd deployment && docker compose -f docker-compose.local.yml --env-file .env.local up -d
docker compose ps  # Перевірити статус
```

### Помилка: "Authentication failed"

**Причина:** Неправильні API ключі

**Рішення:**
1. Перевірити що OPENAI_API_KEY валідний

### Сервер запускається але не відповідає

**Рішення:**
```bash
# Включити debug режим
# У claude_desktop_config.json додати:
"env": {
  ...
  "LOG_LEVEL": "debug"
}

# Перезапустити Claude Desktop
# Дивитись логи
tail -f ~/Library/Logs/Claude/mcp*.log
```

## 🎯 Доступні команди

Після підключення ви можете:

1. **Шукати прецеденти:**
   ```
   Знайди схожі справи на 756/655/23
   ```

2. **Аналізувати паттерни:**
   ```
   Проаналізуй практику по справах про мобілізацію
   ```

3. **Перевіряти статус:**
   ```
   Перевір статус прецеденту 756/655/23
   ```

4. **Знайти статті закону:**
   ```
   Які статті закону найчастіше цитуються у справах про ухилення?
   ```

5. **Отримати юридичну пораду:**
   ```
   Дай юридичну пораду щодо справи про незаконну мобілізацію
   ```

## 📚 Додатково

- [Повна документація](../docs/CLIENT_INTEGRATION.md)
- [Список всіх інструментів](../README.md)
- [Web client setup](./SETUP_WEB.md)

## 🆘 Підтримка

Якщо виникли проблеми:

1. Перевірити логи (див. вище)
2. Перевірити що всі сервіси запущені: `docker compose ps`
3. Перевірити що проект зібрано: `ls dist/index.js`
4. Створити issue на GitHub

---

**Готово!** 🎉

Тепер Claude Desktop може використовувати SecondLayer MCP для аналізу українських судових рішень.
