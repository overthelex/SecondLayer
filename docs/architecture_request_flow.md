# Схема работы SecondLayer: от запроса в UI до ответа

Общая архитектура потока запросов от клиента в веб-интерфейсе через SecondLayer (бэкенд, gateway, внешние API) и обратно.

---

## 1. Высокоуровневая схема

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  КЛИЕНТ (браузер)                                                                 │
│  lexwebapp (React 19, Vite) — VITE_API_URL → backend                             │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  NGINX (prod / local)                                                            │
│  /api, /auth → proxy_pass → mcp_backend                                          │
│  SSE: proxy_buffering off, proxy_read_timeout 86400s                              │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  mcp_backend (Express, port 3000)                                                 │
│  • Аутентификация: dualAuth (JWT или API key) / requireJWT для чата и биллинга   │
│  • Биллинг: balanceCheck перед вызовом инструментов                               │
│  • Маршруты: POST /api/chat, POST /api/tools/:toolName, GET /api/tools            │
└───────┬─────────────────────────────┬─────────────────────────────┬────────────┘
        │                             │                             │
        │ /api/chat                    │ /api/tools/:toolName         │ GET /api/tools
        ▼                             ▼                             ▼
┌───────────────┐           ┌──────────────────────┐           ┌─────────────────┐
│ ChatService   │           │ ToolRegistry         │           │ Список 118 tools│
│ (agentic loop)│           │ (маршрутизация)      │           │ (local + remote)│
└───────┬───────┘           └──────────┬───────────┘           └─────────────────┘
        │                             │
        │ LLM + tool_calls             │ route.local?
        │                             ├── true  → BaseToolHandler (local)
        │                             │          → ZOAdapter, Embedding, Qdrant, …
        │                             │
        │                             └── false → ServiceProxy (HTTP proxy)
        │                                          → mcp_rada (3001) / mcp_openreyestr (3005)
        │
        └────────────────────────────┴──→ Внешние API: ZakonOnline, RADA, data.gov.ua
```

---

## 2. Поток запроса из UI

### 2.1. Точки входа на фронтенде

| Действие пользователя | Сервис / хук | HTTP-запрос | Backend-обработчик |
|------------------------|--------------|-------------|---------------------|
| Отправить сообщение в чат | `useAIChat` → `MCPService.streamChat()` | `POST /api/chat` (fetch, stream) | `ChatService.chat()` → SSE |
| Вызвать инструмент вручную | `useMCPTool` → `MCPService.streamTool()` или `api.tools.execute()` | `POST /api/tools/:toolName` или `POST /api/tools/:toolName/stream` | `http-server` → ToolRegistry |
| Список инструментов | `api.tools` / MCPService | `GET /api/tools` | ToolRegistry.getToolDefinitions() |

- **Base URL**: `VITE_API_URL` (например `https://legal.org.ua` или `http://localhost:3000`).
- **Авторизация**: в запросах уходит `Authorization: Bearer <token>` — JWT из `localStorage.auth_token` (приоритет) или API key из `VITE_API_KEY`.

---

## 3. Аутентификация и биллинг (mcp_backend)

- **dualAuth**: принимает либо JWT (пользователь Lex), либо API key из `SECONDARY_LAYER_KEYS`. Для `/api/chat` и биллинга требуется **requireJWT** (только пользователь).
- **balanceCheckMiddleware**: перед `POST /api/tools/:toolName` и `/stream` оценивается стоимость вызова; при недостатке баланса возвращается 402.

После прохождения auth на `req` висят `req.user` (JWT) или `req.clientKey` (API key).

---

## 4. Поток AI-чата (POST /api/chat)

1. **Вход**: `query`, `history`, `budget` (quick/standard/deep), опционально `conversationId`.
2. **ChatService.chat()** (agentic loop):
   - Классификация намерения (LLM) → домены и слоты.
   - Фильтрация инструментов по доменам → подмножество из 118 tools.
   - Генерация плана выполнения (execution plan) → отправка клиенту как SSE `plan`.
   - Сборка контекста (история + план), лимиты по бюджету (tokens, tool calls).
   - Цикл:
     - Стриминг ответа LLM (`chatCompletionStream`) → события `answer_delta`.
     - Если LLM вернул `tool_calls`:
       - Отправка SSE `thinking` по каждому вызову.
       - Параллельное выполнение инструментов через **ToolRegistry.executeTool()** (тот же путь, что и для прямых вызовов инструментов).
       - Результаты в контекст как сообщения `role: 'tool'`, SSE `tool_result` клиенту.
       - Повтор цикла (до лимита `maxToolCalls`).
     - Если `finish_reason === 'stop'` — финальный ответ, SSE `answer`, затем `complete` (и при необходимости `cost_summary`).
3. **Выход**: поток SSE (plan, thinking, tool_result, answer_delta, answer, complete, error). Фронт обрабатывает его в `MCPService.streamChat()` и обновляет UI (сообщения, панель доказательств справа).

---

## 5. Поток вызова инструмента (POST /api/tools/:toolName)

1. **Вход**: имя инструмента (например `search_court_decisions`, `rada_search_deputies`, `openreyestr_search_entities`), тело запроса — аргументы.
2. **Роутинг в http-server** (при включённом Unified Gateway):
   - `ENABLE_UNIFIED_GATEWAY === 'true'` → запрос в **ToolRegistry.getRoute(toolName)**.
   - Если маршрут есть и **route.local === false**:
     - Проксирование через **ServiceProxy** на соответствующий сервис:
       - `rada_*` → mcp_rada (RADA_API_URL, порт 3001),
       - `openreyestr_*` → mcp_openreyestr (OPENREYESTR_API_URL, порт 3005).
     - Для SSE: `Accept: text/event-stream` → `handleStreamingProxyCall()`.
   - Иначе (local или gateway выключен):
     - **ToolRegistry.executeTool(name, args)**:
       - Сначала поиск локального **BaseToolHandler** по имени → `handler.executeTool()`.
       - Если локального нет — вызов **executeRemoteTool(route, args)** (тот же proxy).
3. **Локальное выполнение** (BaseToolHandler):
   - Используются сервисы бэкенда: ZOAdapter (ZakonOnline), EmbeddingService, Qdrant, DocumentService, LegislationService, VaultService и т.д.
   - Часть данных тянется из внешних API (ZakonOnline court/legal_acts, при необходимости RADA через адаптеры).
4. **Учёт стоимости**: создаётся/обновляется запись cost tracking, при Phase 2 биллинга списываются кредиты.
5. **Ответ**: JSON или SSE-поток (для `/api/tools/:toolName/stream`).

---

## 6. Внешние зависимости (упрощённо)

| Назначение | Где используется | Пример |
|------------|-------------------|--------|
| Судові рішення, засідання, практика, НПА | mcp_backend (EDRSR local adapter, ZOAdapter legacy) | EDRSR (reyestr.court.gov.ua) — основний джерело; ZakonOnline API (legacy, на етапі виведення) |
| Депутати, законопроекти, законодавство (РАДА) | mcp_rada | data.rada.gov.ua, zakon.rada.gov.ua |
| Юрлица, бенефіціари, реєстри | mcp_openreyestr | data.gov.ua (OpenReyestr) |
| Эмбеддинги, LLM | mcp_backend (и при необходимости другие) | OpenAI / Anthropic (через @secondlayer/shared) |

Чат и инструменты бэкенда вызывают эти источники опосредованно: через адаптеры и сервисы, а RADA/OpenReyestr — через gateway proxy.

---

## 7. Сводка по компонентам

| Компонент | Роль |
|-----------|------|
| **lexwebapp** | UI: чат, выбор инструмента, запросы через apiClient / MCPService (fetch + SSE). |
| **Nginx** | Проксирование на mcp_backend, настройки SSE. |
| **mcp_backend** | Единая точка входа: auth, биллинг, /api/chat, /api/tools; ChatService; ToolRegistry + ServiceProxy. |
| **ToolRegistry** | Реестр 118 инструментов, маршрутизация local vs rada_* / openreyestr_*. |
| **ChatService** | Agentic loop: классификация → план → цикл LLM + tool_calls через ToolRegistry. |
| **ServiceProxy** | HTTP-вызовы к mcp_rada и mcp_openreyestr при gateway. |
| **mcp_rada / mcp_openreyestr** | Отдельные MCP-серверы за gateway; вызываются только через бэкенд при ENABLE_UNIFIED_GATEWAY. |

Итог: запрос из UI идёт в один бэкенд (напрямую или через Nginx). Чат и вызовы инструментов обрабатываются там; инструменты с префиксами `rada_*` и `openreyestr_*` при включённом gateway проксируются на соответствующие сервисы, остальные выполняются локально с использованием EDRSR, OpenData реєстрів и других внутренних сервисов.

> **Среды:** Только local и prod. Деплой на прод через CI/CD (merge PR в main → blue-green deploy).
