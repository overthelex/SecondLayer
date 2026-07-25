# Distributed Monolith: коли мікросервіси — це моноліт із мережевими затримками

*Ви розділили код на сервіси. Ви маєте окремі контейнери. Ви навіть маєте gateway. Але чому деплой одного сервісу все ще ламає інший?*

---

## Що таке distributed monolith

Distributed monolith — це архітектура, яка *виглядає* як мікросервіси, але *поводиться* як моноліт. Сервіси розділені на рівні коду, але залишаються зв'язаними на рівні інфраструктури, даних або деплою.

Класичні ознаки:

- **Спільна база даних** — різні сервіси читають/пишуть в один PostgreSQL інстанс
- **Shared library без версіонування** — зміна в спільному пакеті ламає всіх одночасно
- **Один docker-compose** — усі сервіси деплояться разом, навіть якщо змінився тільки один
- **Синхронні HTTP-виклики** — сервіс A не може працювати, якщо сервіс B не відповідає
- **Спільний кеш** — один Redis на всіх, LRU-евікшн одного сервісу вбиває кеш іншого

Звучить знайомо? Це наша архітектура. І ми вважаємо, що зараз це — *правильний вибір*.

---

## Анатомія нашого distributed monolith

SecondLayer складається з трьох MCP-серверів:

```
┌─────────────────────────────────────────────────────┐
│                    nginx (gateway)                  │
│               ┌───────┬───────┬──────┐              │
│               │       │       │      │              │
│               ▼       ▼       ▼      ▼              │
│          lexwebapp  backend  rada  openreyestr      │
│          (React)   (MCP)    (MCP)   (MCP)           │
│               │       │       │      │              │
│               │       ▼       ▼      ▼              │
│               │    ToolRegistry (gateway pattern)   │
│               │       │       │      │              │
│               └───┬───┘       │      │              │
│                   │           │      │              │
│                   ▼           ▼      ▼              │
│              PostgreSQL (1 інстанс, 3 схеми)        │
│              Redis (1 інстанс, 512 MB)              │
│              Qdrant (1 інстанс)                     │
└─────────────────────────────────────────────────────┘
```

### Що розділено

| Аспект | Статус |
|--------|--------|
| Кодова база | Окремі директорії: `mcp_backend/`, `mcp_rada/`, `mcp_openreyestr/` |
| HTTP-сервери | Окремі Express-додатки на портах 3000, 3001, 3005 |
| Деплой | Blue-green для кожного сервісу незалежно |
| Міграції | Окремі директорії міграцій, окремі DB-юзери |
| Схеми БД | Schema isolation: `public`, `rada`, `openreyestr` |
| CI/CD | Детекція змінених сервісів — білд тільки того, що змінилось |

### Що залишається зв'язаним

| Аспект | Проблема |
|--------|----------|
| PostgreSQL | Один процес — не можна масштабувати БД окремо для rada |
| Redis 512 MB | LRU-евікшн глобальний — rada витісняє кеш backend |
| `packages/shared` | Без semver — зміна ламає всіх одночасно |
| docker-compose | Один файл, одна мережа, один `docker compose up` |
| ToolRegistry | Hardcoded URL-и сервісів через env vars |
| RemoteServiceClient | 60s timeout, без circuit breaker — якщо rada впав, backend чекає |

---

## 7 ознак distributed monolith

Як відрізнити здорову сервісну архітектуру від distributed monolith? Ось чеклист:

### 1. Каскадні відмови

Якщо падіння одного сервісу каскадно ламає інші — у вас distributed monolith.

```
rada не відповідає
  → RemoteServiceClient timeout 60s
    → backend thread зайнятий очікуванням
      → інші запити до backend повільніші
        → nginx 504 Gateway Timeout
```

**Лікування:** circuit breaker pattern. Після N невдалих запитів — перестати викликати rada і повертати fallback відразу.

### 2. Координований деплой

Якщо ви не можете задеплоїти сервіс A без перевірки, що сервіс B оновлений — це coupling.

У нас: зміна tool signature в rada вимагає оновлення ToolRegistry в backend. Деплоїти треба разом.

**Лікування:** API contracts з версіонуванням. Нова версія tool-а не ламає старий контракт.

### 3. Shared database

Три "незалежні" сервіси → один PostgreSQL процес → одна точка відмови.

```sql
-- rada робить важкий запит
SELECT * FROM parliament_bills WHERE full_text @@ to_tsquery('конституц');

-- backend одночасно
SELECT * FROM edrsr_decisions WHERE ...;
-- ↑ сповільнюється, бо той самий CPU/RAM/IO
```

**Лікування:** окремі PostgreSQL інстанси. Schema isolation — це не process isolation.

### 4. Спільний кеш без namespace

```
Redis 512 MB, volatile-LRU policy

backend: SET legislation:254 → 200 KB
rada: SET bill:12345 → 50 KB
openreyestr: SET entity:98765 → 30 KB

→ Коли пам'ять закінчується, Redis видаляє найстаріший ключ
→ Може видалити legislation:254, який backend кешував 2 хвилини тому
→ Backend робить повторний запит до EDRSR API
```

**Лікування:** окремі Redis-інстанси (3 контейнери замість 1) або namespace з окремими maxmemory.

### 5. Shared library як single point of failure

`packages/shared` експортує:
- Logger, BaseDatabase, SSE handler
- OpenAI / Anthropic / Bedrock клієнти
- Model selector, Cost tracker
- HTTP server base class

Зміна будь-чого в shared → перезбірка всіх трьох сервісів. Без semver — немає гарантії сумісності.

```
Сценарій:
1. Розробник оновлює ModelSelector в shared
2. backend працює з новим API
3. rada використовує старий API
4. rada ламається після наступного npm install
```

**Лікування:** semver для shared package. Кожен сервіс фіксує версію: `"@secondlayer/shared": "^2.1.0"`.

### 6. Конфігурація через 50+ env vars

Один docker-compose з 50+ змінними середовища. Зміна одного `OPENAI_API_KEY` вимагає рестарту всіх сервісів.

**Лікування:** кожен сервіс отримує тільки свої змінні. Розділити compose на окремі файли.

### 7. Один health check для всього

Якщо `/health` одного сервісу перевіряє доступність іншого — це coupling.

**Лікування:** health check перевіряє тільки локальні залежності (своя БД, свій Redis).

---

## Коли distributed monolith — правильний вибір

Ось непопулярна думка: **distributed monolith — це не завжди проблема**. Для певного масштабу це оптимальна архітектура.

### Переваги, які ми отримуємо

**1. Простота операцій**

Один `docker compose up` піднімає все. Один `docker compose logs` показує все. Один сервер — повна система.

Порівняйте з Kubernetes: helm charts, service mesh, ingress controllers, pod autoscaling, persistent volumes. Для команди з 2–3 розробників це overhead, який не окупається.

**2. Швидкість розробки**

Shared package означає DRY. Один Logger, одна BaseDatabase, один ModelSelector. Зміна в одному місці — працює скрізь. Для мікросервісів — це 3 окремих PR, 3 окремих деплої, 3 рази перевірити сумісність.

**3. Транзакційна цілісність**

Один PostgreSQL = можливість JOIN між схемами, якщо колись знадобиться. Cross-service транзакції в мікросервісах — це saga pattern, eventually consistent, distributed locks. Складність × 10.

**4. Debuggability**

Один `docker compose logs -f` → бачиш весь request flow від nginx до backend до rada. В мікросервісах — це distributed tracing, correlation IDs, Jaeger/Zipkin.

**5. Вартість**

Один сервер замість трьох. Один PostgreSQL замість трьох. Один Redis замість трьох. Для стартапу різниця суттєва.

### Формула: коли distributed monolith достатньо

```
ЯКЩО:
  команда < 5 розробників
  ТА навантаження < 1000 RPS
  ТА деплой < 5 разів на день
  ТА один сервер справляється
  ТА немає вимог до незалежного масштабування
ТО:
  distributed monolith = оптимум
```

---

## Поетапний план еволюції

Коли distributed monolith перестає справлятись — не переходьте на мікросервіси одним стрибком. Еволюціонуйте поетапно.

### Фаза 1: Зміцнення (зусилля: низьке, ефект: 80%)

Мінімальні зміни, які дають більшість переваг мікросервісів без їхньої складності.

**1.1 Розділити Redis**

```yaml
# Було: один Redis на всіх
redis:
  image: redis:7
  command: redis-server --maxmemory 512mb

# Стало: окремий для кожного сервісу
redis-backend:
  image: redis:7
  command: redis-server --maxmemory 256mb
redis-rada:
  image: redis:7
  command: redis-server --maxmemory 128mb
redis-openreyestr:
  image: redis:7
  command: redis-server --maxmemory 128mb
```

Час: 1 година. Ефект: кеш кожного сервісу ізольований, евікшн не каскадує.

**1.2 Версіонувати shared package**

```json
// packages/shared/package.json
{ "version": "2.1.0" }

// mcp_backend/package.json
{ "@secondlayer/shared": "^2.1.0" }

// mcp_rada/package.json
{ "@secondlayer/shared": "^2.0.0" }  // може використовувати старішу версію
```

Час: 2 години. Ефект: зміна shared не ламає всіх одночасно.

**1.3 Circuit breaker в RemoteServiceClient**

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > 30_000) {
        this.state = 'half-open'; // спробувати один запит
      } else {
        throw new Error('Circuit open — rada unavailable');
      }
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= 3) this.state = 'open';
      throw err;
    }
  }
}
```

Час: 3 години. Ефект: падіння rada не каскадує на backend.

### Фаза 2: Інфраструктурна незалежність (коли навантаження росте)

**2.1 Окремі PostgreSQL інстанси**

```
Було:                          Стало:
postgres (1 процес)            postgres-backend (8 GB RAM)
├── public schema              postgres-rada (2 GB RAM)
├── rada schema                postgres-openreyestr (4 GB RAM)
└── openreyestr schema
```

Тепер можна масштабувати БД openreyestr (340M+ записів) незалежно від backend.

**2.2 Розділити docker-compose**

```
compose.infra.yml      # postgres, redis, qdrant, minio
compose.backend.yml    # app + migrations
compose.rada.yml       # rada app + rada migrations
compose.openreyestr.yml # openreyestr app + migrations
compose.frontend.yml   # lexwebapp + nginx
```

Кожен сервіс деплоїться окремо: `docker compose -f compose.rada.yml up -d`.

**2.3 API contracts між сервісами**

```typescript
// packages/shared/src/contracts/rada-tools.ts
export interface RadaToolContract {
  search_parliament_bills: {
    input: { query: string; limit?: number };
    output: { bills: Bill[]; total: number };
  };
}
```

Зміна контракту — compile-time помилка в обох сервісах.

### Фаза 3: Справжні мікросервіси (команда > 5, мультисервер)

**3.1 Service discovery замість env vars**

```
Було: RADA_MCP_URL=http://rada-mcp-app:3001
Стало: DNS-based discovery через Docker Swarm або Consul
```

**3.2 Message queue для async операцій**

```
Було: HTTP POST /api/tools/start_import → sync response
Стало: publish to queue → worker picks up → status via SSE
```

Redis Streams (вже є Redis) або RabbitMQ.

**3.3 Незалежні CI/CD pipelines**

Кожен сервіс — свій workflow, свої тести, свій деплой. Зміна в rada не тригерить білд backend.

---

## Антипатерни: чого НЕ робити

### Не переходьте на Kubernetes до 10+ сервісів

K8s overhead для 3 сервісів: helm charts, ingress controllers, persistent volume claims, pod disruption budgets, resource quotas, network policies, service accounts, RBAC...

Docker Compose + blue-green = 95% результату K8s при 5% складності.

### Не розбивайте моноліт на нано-сервіси

```
❌ auth-service, billing-service, user-service,
   document-service, search-service, embedding-service,
   legislation-service, vault-service, consultation-service...

✅ mcp_backend (модульний моноліт з 76 сервісами всередині)
```

76 внутрішніх сервісів тісно пов'язані (billing ↔ auth ↔ consultations). Розділити їх = distributed transactions, eventual consistency, saga pattern. Модульний моноліт — правильна відповідь.

### Не додавайте event sourcing заради event sourcing

CQRS і event sourcing вирішують конкретну проблему: rebuild стану з подій. Якщо у вас немає цієї проблеми — це зайва складність без користі.

### Не проєктуйте для гіпотетичного навантаження

```
"А що якщо у нас буде 100K юзерів?"
→ Спочатку отримайте 1K. Потім оптимізуйте.
```

Premature scaling — це premature optimization для інфраструктури. Реальне навантаження завжди відрізняється від уявного.

---

## Матриця рішень

| Сигнал | Дія | Фаза |
|--------|-----|------|
| Redis cache contention між сервісами | Розділити Redis на окремі інстанси | 1 |
| Зміна shared ламає сервіс | Додати semver до shared package | 1 |
| Падіння rada каскадує на backend | Додати circuit breaker | 1 |
| БД openreyestr (340M записів) гальмує | Окремий PostgreSQL інстанс | 2 |
| Деплой backend чіпає rada | Розділити docker-compose | 2 |
| Зміна tool signature ламає gateway | API contracts з типами | 2 |
| Команда > 5, незалежні стріми | Service discovery, окремі CI/CD | 3 |
| Потрібен async processing | Message queue (Redis Streams) | 3 |

---

## Висновок

Distributed monolith — це не діагноз. Це етап еволюції архітектури. Для команди з 2–3 розробників і одного сервера — це оптимум, який дає простоту моноліту з деякими перевагами сервісної архітектури.

Проблема не в тому, що у вас distributed monolith. Проблема — якщо ви не знаєте, що він у вас є, і намагаєтесь масштабувати його як мікросервіси.

Знайте свої точки coupling. Мійте план еволюції. І не переходьте на мікросервіси, доки конкретний bottleneck цього не вимагає.

**80% переваг мікросервісів можна отримати за 20% зусиль** — розділивши Redis, додавши circuit breaker і версіонувавши shared package. Решта 20% переваг коштуватиме 80% зусиль. Платіть цю ціну тільки коли дійсно потрібно.

---

Реєстрація: [legal.org.ua](https://legal.org.ua)
