# Gate Server - Карта контейнеров по окружениям

## 🔴 PRODUCTION Окружение (legal.org.ua)

### Backend - SecondLayer MCP API
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **secondlayer-app-prod** | MCP API Server | 3001 (HTTP) | secondlayer-app:latest |
| **secondlayer-postgres-prod** | PostgreSQL DB | 5432 | postgres:15-alpine |
| **secondlayer-redis-prod** | Redis Cache | 6379 | redis:7-alpine |
| **secondlayer-qdrant-prod** | Vector DB | 6333-6334 | qdrant/qdrant:latest |

### Frontend
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **lexwebapp** | React Admin Panel | 8090 | lexwebapp-lexwebapp |

### Доступ
- Frontend: https://legal.org.ua/
- API: https://legal.org.ua/api/*
- Health: https://legal.org.ua/health

---

## 🟢 DEVELOPMENT Окружение (dev.legal.org.ua)

### Backend - SecondLayer MCP API
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **secondlayer-app-dev** | MCP API Server | 3003 (HTTP) | secondlayer-app:latest |
| **secondlayer-postgres-dev** | PostgreSQL DB | 5433 | postgres:15-alpine |
| **secondlayer-redis-dev** | Redis Cache | 6380 | redis:7-alpine |
| **secondlayer-qdrant-dev** | Vector DB | 6335-6336 | qdrant/qdrant:latest |

### Frontend
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **lexwebapp-dev** | React Admin Panel | 8091 | lexwebapp-lexwebapp:latest |

### Доступ
- Frontend: https://dev.legal.org.ua/
- API: https://dev.legal.org.ua/api/*
- Health: https://dev.legal.org.ua/health

---

## 🟡 STAGE Окружение (stage.legal.org.ua)

### Статус: ⚠️ Не развернут (используется DEV)

Stage поддомен временно проксируется на DEV окружение:
- Backend: использует **secondlayer-app-dev** (порт 3003)
- Frontend: использует **lexwebapp-dev** (порт 8091)

### Доступ
- Frontend: https://stage.legal.org.ua/ → DEV
- API: https://stage.legal.org.ua/api/* → DEV
- Health: https://stage.legal.org.ua/health → DEV

**Для полноценного Stage нужно развернуть:**
- secondlayer-app-stage (порт 3002)
- secondlayer-postgres-stage
- secondlayer-redis-stage
- secondlayer-qdrant-stage
- lexwebapp-stage (порт 8092)

---

## 🔵 ИНФРАСТРУКТУРНЫЕ Контейнеры

### Nginx Reverse Proxy
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **legal-nginx-proxy** | Роутинг между окружениями | 8085 | nginx:1.25-alpine |

**Конфигурация:** `<deployment-root>/nginx-proxy.conf`

Этот контейнер получает все запросы от nginx на хосте (порты 80/443) и распределяет по окружениям на основе server_name:
- `legal.org.ua` → PROD (3001, 8090)
- `dev.legal.org.ua` → DEV (3003, 8091)
- `stage.legal.org.ua` → DEV (3003, 8091)

---

## 💳 ПЛАТЕЖНАЯ СИСТЕМА (отдельное окружение)

### Backend & Frontend
| Контейнер | Роль | Порты | Образ |
|-----------|------|-------|-------|
| **secondlayer-payment-server** | Payment API | 3001 (внутренний) | secondlayer-console-payment-server |
| **secondlayer-payment-frontend** | Payment UI | 8081 | secondlayer-console-payment-frontend |
| **secondlayer-payments-db** | PostgreSQL DB | 5432 (внутренний) | postgres:16-alpine |

**Назначение:** Система обработки платежей (изолирована от основных окружений)

---

## 📊 Сводная таблица портов

| Сервис | PROD | DEV | STAGE (планируется) | Payments |
|--------|------|-----|---------------------|----------|
| **MCP API** | 3001 | 3003 | 3002 | - |
| **Frontend** | 8090 | 8091 | 8092 | 8081 |
| **PostgreSQL** | 5432 | 5433 | 5434 | внутр. |
| **Redis** | 6379 | 6380 | 6381 | - |
| **Qdrant** | 6333-6334 | 6335-6336 | 6337-6338 | - |
| **Payment API** | - | - | - | внутр. |

---

## 🔒 Хост Nginx (gate server)

**Процесс:** `/usr/sbin/nginx` (не в контейнере)

**Конфигурации:**
- `/etc/nginx/sites-enabled/legal.org.ua` → 443 → localhost:8085
- `/etc/nginx/sites-enabled/dev.legal.org.ua` → 443 → localhost:8085
- `/etc/nginx/sites-enabled/stage.legal.org.ua` → 443 → localhost:8085
- `/etc/nginx/sites-enabled/mcp.legal.org.ua` → 443 → ???

**SSL Сертификаты:**
- legal.org.ua: `/etc/letsencrypt/live/legal.org.ua/`
- dev.legal.org.ua: `/etc/letsencrypt/live/dev.legal.org.ua/`
- stage.legal.org.ua: `/etc/letsencrypt/live/stage.legal.org.ua/`
- mcp.legal.org.ua: `/etc/letsencrypt/live/mcp.legal.org.ua/`

---

## 🚀 Быстрые команды

### Перезапуск окружений
```bash
# Production
ssh gate "cd secondlayer-deployment && docker-compose -f docker-compose.prod.yml restart secondlayer-app-prod"

# Development
ssh gate "cd secondlayer-deployment && docker-compose -f docker-compose.dev.yml restart secondlayer-app-dev"

# Nginx proxy
ssh gate "docker restart legal-nginx-proxy"

# Хост nginx
ssh gate "sudo systemctl reload nginx"
```

### Логи
```bash
# Production backend
ssh gate "docker logs -f secondlayer-app-prod"

# Development backend
ssh gate "docker logs -f secondlayer-app-dev"

# Nginx proxy
ssh gate "docker logs -f legal-nginx-proxy"

# Хост nginx
ssh gate "sudo tail -f /var/log/nginx/legal.org.ua-access.log"
```

### Проверка работоспособности
```bash
# Все окружения одной командой
curl -s https://legal.org.ua/health | jq
curl -s https://dev.legal.org.ua/health | jq
curl -s https://stage.legal.org.ua/health | jq
```

---

## 📝 Примечания

1. **Разделение баз данных:** У каждого окружения отдельная БД PostgreSQL на разных портах
2. **Разделение кэша:** У каждого окружения свой Redis instance
3. **Разделение векторов:** У каждого окружения свой Qdrant instance
4. **Изоляция:** Контейнеры одного окружения не имеют доступа к данным другого
5. **Масштабирование:** Можно легко добавить stage окружение, скопировав docker-compose конфиг
