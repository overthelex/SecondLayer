# Быстрая сборка в AWS: как перенести CI/CD runners в облако и забыть про OOM на ноутбуке

*Ваш MacBook Pro нагревается до 98°C. Вентилятор на максимуме. Шестой раз за утро — "JavaScript heap out of memory". Docker съел все 16 GB, npm install ещё крутится, TS compile умер. А вам нужно задеплоиться до обеда.*

*Знакомо? Давайте перенесём сборки в AWS.*

---

## Почему локальная машина — это узкое место

Типичный ноутбук разработчика в 2026 году: 8-12 физических ядер, 16-32 GB RAM, 512 GB-1 TB NVMe. На бумаге — мощно. На практике во время сборки монорепо происходит следующее:

— **CPU:** TypeScript compile (tsc), webpack/vite, Docker build, ESLint — всем нужны ядра одновременно.

— **RAM:** Node-процессы, Docker Desktop (4-8 GB), IDE, браузер, Slack — OOM неизбежен.

— **Диск:** node_modules на 2+ GB, Docker layer cache, test snapshots — конкуренция за IOPS.

— **Термальный троттлинг:** CPU снижает частоту на 30-50% через 5 минут под полной нагрузкой.

— **Сеть:** npm registry, Docker Hub, GitHub — всё тянется через домашний Wi-Fi.

А теперь добавьте self-hosted GitHub Actions runner на том же ноутбуке. Или, как в нашем случае, на выделенном сервере, который крутит одновременно сборку, тесты, Playwright, миграции БД и prod-сборку blue-green.

**Результат:** сборка, которая должна занимать 3 минуты, идёт 15. Раз в неделю runner умирает с OOM, и вы дебажите, почему vitest упал без стектрейса.

---

## Три источника боли в монорепо-сборках

### 1. OOM killer приходит в худший момент

Vitest с 400+ тестов, ts-jest с maxWorkers=1, webpack production build — каждый из них легко съедает 4-6 GB RAM. Когда параллельно крутится Docker build с multi-stage image на 2 GB — ядро OOM-kill-ит самый "жирный" процесс. Почти всегда это ваш тестовый раннер.

Классика жанра:

```
FATAL ERROR: Reached heap limit Allocation failed -
  JavaScript heap out of memory
```

Воркэраунд NODE_OPTIONS="--max-old-space-size=8192" лишь оттягивает момент. Настоящая проблема — физически недостаточно памяти.

### 2. Конкуренция за диск

SSD быстрый, но не бесконечный. Когда одновременно npm ci распаковывает 200k файлов в node_modules, tsc пишет 50k .d.ts и .js.map, Docker buildx строит layer через COPY всего репо, а Vitest пишет coverage reports — IOPS NVMe заканчиваются, и всё замедляется в 3-5 раз. Особенно больно на macOS с Docker Desktop (он виртуализирует ФС через virtiofs/9p).

### 3. Термальный троттлинг убивает длинные сборки

Первые 2 минуты сборки — 100% скорость. Дальше CPU нагревается, и контроллер снижает частоту. На MacBook Air это падение с 3.5 GHz до 2.0 GHz. Тест-сьют, который на холодной машине идёт 4 минуты, на горячей — 9.

---

## Опции: где крутить runners

— **Локальный ноутбук.** Ноль настроек, но всё, о чём шла речь выше.

— **Self-hosted на home-сервере.** Контроль и кэш, но одна точка отказа — апгрейд требует купить железо.

— **GitHub-hosted standard.** Ноль обслуживания, но 4 CPU / 16 GB — мало для больших сборок.

— **GitHub-hosted large.** 16-64 CPU, но $0.008-0.032/мин — дорого при частых сборках.

— **AWS EC2 on-demand.** Любой размер, SSD, но нужно настроить runner и платить за простой.

— **AWS EC2 Spot.** -70% к цене, но прерывания требуют ephemeral runners.

— **AWS Fargate/ECS.** Serverless, без управления VM, но медленный cold start и ограничения на disk.

— **EKS + actions-runner-controller (ARC).** Auto-scale, warm pool, cost-efficient — ценой сложности настройки и знаний Kubernetes.

В этом гайде я фокусируюсь на AWS, потому что это то, на чём мы настроили CI для SecondLayer.

---

## Архитектура 1: EC2 Spot + ephemeral runners

Самый простой вариант для команды из 1-10 разработчиков.

### Идея

На каждый workflow job GitHub Actions поднимается свежая EC2 Spot instance, регистрируется как ephemeral runner, выполняет job, самоуничтожается. Стоимость — только во время сборки.

### Компоненты

```
GitHub Action workflow
        │
        ▼ webhook
AWS Lambda (runner boot)
        │
        ▼
EC2 Spot Fleet: c7g.4xlarge (ARM Graviton)
        │
        ▼
ephemeral GHA runner (1 job → self-terminate)
```

### Ключевые настройки

**Instance type:** c7g.4xlarge (16 vCPU ARM Graviton3, 32 GB RAM, $0.0544/час Spot в eu-central-1 на момент написания). Для x86-сборок — c7i.4xlarge. Graviton даёт ~30% лучший price/performance, если ваш стек совместим (Node.js 20, Docker multi-arch — совместимы).

**Storage:** gp3 EBS с iops=6000, throughput=500 MB/s. Это критично: дефолтный gp3 даёт 3000 IOPS, что на сборке сразу становится bottleneck.

**AMI:** кастомный AMI с предустановленными Node 20, Docker, gh-runner, pnpm/npm кэшем с предыдущей сборки. Экономит 40-90 секунд на старте.

**IAM:** GitHub → AWS через OIDC (без long-lived ключей). sts:AssumeRoleWithWebIdentity на repo:overthelex/secondlayer:ref:refs/heads/main.

### Реальные цифры из наших экспериментов

Self-hosted на локальном сервере vs AWS c7g.4xlarge Spot:

— npm ci cold cache: 94 с → 28 с.

— tsc --build по монорепо: 142 с → 47 с.

— Vitest 422 теста: 78 с → 31 с.

— Docker build mono-backend: 186 с → 71 с.

— Полный pipeline (с деплоем): 11 мин 40 с → 4 мин 10 с.

— Стоимость: $0 (но OOM 2×/неделю) → $0.004 за сборку на Spot.

**3× ускорение за ~$0.10/день при средней активности.** Это дешевле, чем час работы junior'а в обед, пока сборка давит.

---

## Архитектура 2: actions-runner-controller на EKS

Для команды 10+ и большого количества параллельных сборок.

### Идея

Kubernetes-контроллер (ARC) слушает GitHub webhook, поднимает runner pods в вашем EKS кластере по требованию. Pods могут иметь warm pool (2-4 runners всегда готовы), тогда cold start почти нулевой.

### Преимущества перед вариантом 1

— **Warm pool** — 0 секунд на старт job'а (против 40-60 с для EC2 boot).

— **Ephemeral pods** — каждый job в чистом окружении, без shared state.

— **Горизонтальное масштабирование** — 50 параллельных jobs = 50 pods на Spot nodes.

— **Shared cache через EFS/S3** — node_modules, Docker layers, Playwright browsers.

### Настройка в двух словах

```yaml
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
```

Karpenter автоматически поднимает Spot nodes нужного типа, когда прилетает pending pod. Когда сборки заканчиваются — nodes засыпают через 30 секунд.

### Реальный кейс

Компания с ~80 разработчиков, 200-300 PR в день. Было: GitHub-hosted large runners, $4800/месяц. Стало: ARC на EKS со Spot, ~$900/месяц. Скорость та же, потому что warm pool. Overhead: один DevOps-инженер потратил 2 недели на настройку.

---

## Типичные оптимизации, дающие наибольший эффект

### 1. Layer cache через ECR + BuildKit

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache
    cache-to: type=registry,ref=ACCOUNT.dkr.ecr.REGION.amazonaws.com/backend:buildcache,mode=max
```

На нашем Dockerfile.mono-backend: первая сборка 186 с, последующие (с кэшем) — 24 с.

### 2. npm/pnpm кэш через S3 или actions/cache с AWS backend

Вместо того чтобы тянуть 2 GB node_modules с npm registry каждый раз — храним в S3, маппим в ~/.npm. На 10 Gbit/s внутри AWS это ~5 секунд против 60+ с npm registry.

### 3. Матричный параллелизм тестов

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx vitest run --shard=${{ matrix.shard }}/4
```

422 теста на 4 шардах — 31 с вместо 78 с. Шардинг работает только тогда, когда у вас есть ресурсы на параллелизм — на AWS это дёшево.

### 4. Warm image (custom AMI или prebaked container)

Предустанавливаем: Node 20, pnpm, Docker, gh, AWS CLI, Playwright browsers, Chrome deps. Экономия — 60-120 с на холодный старт.

### 5. Ephemeral runners для безопасности

Каждый job в свежем runner'е = ноль утёкших credentials, ноль state от прошлой сборки. Обязательно для публичных форков.

---

## Чего не делают, а зря

**1. Data transfer costs игнорируют.** Если ваш runner тянет 10 GB из Docker Hub на каждую сборку, и вы крутите 300 сборок/день — это 3 TB/день × $0.09/GB egress = $270/день. Решение: ECR pull-through cache с ограничением на AWS-регион.

**2. Secrets через GitHub Secrets вместо AWS Secrets Manager.** GitHub Secrets ограничены 64 KB, не ротируются автоматически, видны в audit log. Правильно — GitHub OIDC → IAM role → Secrets Manager.

**3. Один большой runner вместо многих маленьких.** c7g.16xlarge дороже, чем 4× c7g.4xlarge, и даёт меньше параллелизма. Горизонтальное масштабирование почти всегда лучше.

**4. Забывают про GitHub Actions runner version drift.** Ephemeral runners должны автообновляться на старте, иначе GitHub отключит job через год.

**5. Не ставят spot interruption handler.** Spot может забрать instance за 2 минуты предупреждения. Нужно: graceful runner shutdown, retry на другом runner'е.

---

## Экономика: когда есть смысл мигрировать

### Формула

```
Выгода (USD/мес) = (старое_среднее_время - новое_среднее_время)
                 × сборок_в_день × 22 дня × стоимость_инженер-часа / 3600
```

### Пример для SecondLayer

— Было: 11 мин 40 с средний pipeline на self-hosted.

— Стало: 4 мин 10 с на AWS c7g Spot.

— Экономия: 7 мин 30 с × 15 сборок/день × 22 дня = 41 час/месяц.

— При $40/час инженера = **$1640/мес сэкономлено**.

— Стоимость AWS (Spot + EBS + data): ~$80/мес.

**ROI 20×. И это не считая того, что ноутбук инженера не нагревается до 98°C во время очередной итерации.**

---

## Когда AWS-runners — не лучшая идея

— **Проект с 2-3 сборками в неделю** — overhead настройки не окупится. Берите GitHub-hosted standard.

— **Секретные данные, которые нельзя вывозить в облако** — например, медицинские данные по HIPAA / военные данные. Self-hosted on-prem.

— **Нужно тестировать на физическом железе** — iOS-сборки требуют macOS runners (есть через MacStadium, но это отдельная боль).

— **Команда без Kubernetes-экспертизы** — ARC на EKS без опыта быстро станет "чёрным ящиком".

Для всего остального — AWS runners выигрывают.

---

## Как начать завтра

Минимальный путь (1-2 часа настройки):

1. **Создать IAM OIDC provider для GitHub** — без long-lived ключей.

2. **Создать IAM role** с доверием к token.actions.githubusercontent.com и правами на ec2:RunInstances, ec2:TerminateInstances.

3. **Поднять один EC2 self-hosted runner** через actions/runner в c7g.4xlarge Spot. Скачать runner binary, зарегистрировать с --ephemeral.

4. **В workflow заменить** runs-on: ubuntu-latest на runs-on: [self-hosted, aws, arm64].

5. **Измерить** время сборки. Если экономия есть — автоматизировать через Terraform/Pulumi/CDK.

Следующие шаги (неделя): layer cache через ECR, S3 backend для actions/cache, шардинг тестов, custom AMI с prewarm.

Дальше (месяц): ARC на EKS + Karpenter, warm pool, observability через CloudWatch + Prometheus.

---

## Вывод

Локальные сборки на ноутбуке — это самый дорогой вариант по любому измерению: потраченного времени, нервов, износа техники. Self-hosted runner на выделенном сервере — лучше, но всё равно упирается в железо.

AWS runners — это не "переход в облако ради моды". Это простое инженерное решение: 16 ядер за $0.05/час работают быстрее, чем 8 ядер ноутбука под термальным троттлингом. А ephemeral runners решают кучу проблем безопасности, о которых на локальной машине не думаешь до первого инцидента.

Для SecondLayer мы начинали с self-hosted runner на local.legal.org.ua. Он до сих пор жив для blue-green preview-фазы, потому что там нужен доступ к prod-сети. Но тяжёлая сборка, тесты и Docker — всё теперь на AWS Spot. **Раз в неделю экономим 40+ минут жизни инженера.** И с каждым новым сервисом в монорепо этот разрыв только растёт.

Если ваш ноутбук шумит во время npm run build — вы уже платите. Вопрос только в том, кому.

---

Регистрация: legal.org.ua
