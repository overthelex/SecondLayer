# Начните здесь - SecondLayer

## 🏗️ Структура проекта

```
SecondLayer/                          # Монорепозиторий юридической платформы
├── mcp_backend/                     # Основной MCP сервер (87 инструментов)
│   ├── src/api/                    # MCP инструменты и API
│   ├── src/services/                # Бизнес-логика и сервисы
│   ├── src/adapters/                # Адаптеры к внешним API (EDRSR, и др.)
│   └── docs/                       # Документация MCP сервера
├── mcp_rada/                        # MCP сервер данных Рады (4 инструмента)
├── mcp_openreyestr/                  # MCP сервер реестров (27 инструментов)
├── lexwebapp/                       # Веб-интерфейс (React 19 + Vite)
│   ├── src/                        # React компоненты
│   ├── src/pages/                  # Страницы приложения
│   └── src/stores/                 # Zustand state management
├── packages/shared/                   # Общие TypeScript типы и утилиты
├── deployment/                       # Docker конфигурации
├── scripts/                         # Утилиты для развертывания
├── tests/                           # E2E тесты (Playwright)
└── docs/                           # Документация проекта
```

## 🚀 Быстрый старт

### 1. Запуск всех сервисов (рекомендуется)

```bash
# Установка зависимостей во всех пакетах
npm run install:all

# Запуск backend MCP сервера
npm run backend

# Запуск веб-интерфейса в новом терминале
npm run frontend
```

### 2. Запуск через Docker (простой способ)

```bash
cd deployment
./manage-gateway.sh start local
```

Запустит все сервисы: PostgreSQL, Redis, Qdrant, mcp_backend, lexwebapp

### 3. Отдельный запуск MCP сервера

```bash
cd mcp_backend
npm install
npm run dev:http    # HTTP API (порт 3000)
# или
npm run dev          # MCP stdio режим
```

### 4. Отдельный запуск веб-интерфейса

```bash
cd lexwebapp
npm run dev
```

Откройте http://localhost:5173

### 3. Проверка

- Backend health: http://localhost:3000/health
- Frontend: http://localhost:5173
- API ключ уже настроен в `frontend/.env`

## Ключи авторизации

```
VITE_SECONDARY_LAYER_KEY=test-key-123
```

Ключ уже настроен в `frontend/.env` и работает с backend.

## Документация

- **README.md** - общее описание проекта
- **[MCP Client Integration Guide](../MCP_CLIENT_INTEGRATION_GUIDE.md)** ⭐ - Полный гид по подключению 10+ LLM клиентов (Claude Desktop, LibreChat, Jan AI и др.)
- **mcp_backend/README.md** - документация MCP сервера
- **frontend/README.md** - документация админки
- **MIGRATION_SUMMARY.md** - детали миграции
- **KEYS.md** - информация о ключах

## 🔄 Что изменилось в структуре

✅ **MCP сервер:** перенесен в `mcp_backend/` (87 инструментов)  
✅ **Rada сервис:** выделен в `mcp_rada/` (4 инструмента)  
✅ **Reyestr сервис:** выделен в `mcp_openreyestr/` (27 инструментов)
✅ **Frontend:** переименован в `lexwebapp/` (React 19 + Vite)
✅ **Shared пакет:** общие типы в `packages/shared/`
✅ **Unified Gateway:** все 118 инструментов в одной точке
✅ **Docker deployment:** полная контейнеризация всех сервисов
✅ **CI/CD:** деплой через merge PR в main, blue-green deploy  

## 🐳 Docker развертывание

Для полного развертывания всех сервисов:

```bash
# Локальная разработка
cd deployment
./manage-gateway.sh start local

# или продакшн
./manage-gateway.sh deploy stage
```

Запустит: PostgreSQL, Redis, Qdrant, mcp_backend, mcp_rada, mcp_openreyestr, lexwebapp, nginx

## 🆘 Нужна помощь?

1. Backend не запускается? Проверьте .env в `mcp_backend/`
2. Frontend показывает 401? Проверьте что backend запущен
3. Нет подключения к БД? Запустите `docker-compose up -d` в mcp_backend

---

**Готово! Можете начинать работу.**
