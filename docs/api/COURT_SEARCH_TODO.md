> **ARCHIVED:** Historical TODO list from early development. Court search is fully implemented and operational.

# Court Search Integration - TODO (Historical)

## Завдання для інтеграції пошуку судових рішень

**Статус:** Backend ✅ працює | Frontend ⚠️ потребує доопрацювання

---

## ✅ Виконано

1. **Database Schema**
   - Створено таблицю `monthly_api_usage`
   - Додано відсутні колонки в `cost_tracking`
   - Бекенд підключається до БД без помилок

2. **Backend API**
   - MCP tool `search_legal_precedents` працює
   - Zakononline API підключений
   - Cost tracking працює
   - Тестовий запит повертає результати

3. **Frontend Configuration**
   - API URL налаштований: `https://dev.legal.org.ua`
   - API Key налаштований
   - Компонент `DecisionsSearchPage` існує
   - Хук `useSearchPrecedents` підключений

---

## 🔧 Потрібно виправити у Frontend

### 1. Виправити маппінг даних (КРИТИЧНО)

**Файл:** `Lexwebapp/src/components/DecisionsSearchPage.tsx`
**Рядки:** 156-170

**Проблема:** API повертає:
- `cause_num` замість `case_number`
- `court_code` замість `court`
- `adjudication_date` замість `date`
- `snippet` замість `summary`

**Рішення:** Додати маппінг:

```typescript
const results: Decision[] = data?.results
  ? data.results.map((doc, idx) => ({
      id: doc.doc_id?.toString() || idx.toString(),
      caseNumber: doc.cause_num || 'Не вказано',
      court: mapCourtCode(doc.court_code),
      judge: doc.judge || 'Не вказано',
      date: doc.adjudication_date || '',
      category: doc.category_code?.toString() || 'Не визначено',
      parties: doc.parties || 'Не вказано',
      summary: cleanSnippet(doc.snippet) || doc.resolution || '',
      decisionType: mapJudgmentCode(doc.judgment_code),
      instance: mapInstanceCode(doc.instance_code),
      relevance: Math.round((doc.weight / 15500) * 100),
    }))
  : mockDecisions;
```

### 2. Додати функції маппінгу кодів

Додати в `DecisionsSearchPage.tsx`:

```typescript
const mapCourtCode = (code: string): string => {
  const courts: Record<string, string> = {
    '9931': 'Верховний Суд КЦС',
    '9911': 'Верховний Суд КГС',
    '9921': 'Верховний Суд КАС',
  };
  return courts[code] || `Суд ${code}`;
};

const mapJudgmentCode = (code: string | number): string => {
  const types: Record<string, string> = {
    '1': 'Рішення',
    '2': 'Постанова',
    '3': 'Ухвала',
  };
  return types[code?.toString()] || 'Рішення';
};

const mapInstanceCode = (code: string | number): string => {
  const instances: Record<string, string> = {
    '1': 'Касаційна',
    '2': 'Апеляційна',
    '3': 'Перша',
  };
  return instances[code?.toString()] || 'Не вказано';
};

const cleanSnippet = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<b class="snippet">/g, '')
    .replace(/<\/b>/g, '')
    .replace(/\.\.\./g, '...')
    .trim();
};
```

### 3. Парсинг відповіді API

**Проблема:** API повертає вкладену структуру:
```json
{
  "result": {
    "content": [{
      "text": "{\"results\": [...], \"total\": 10}"
    }]
  }
}
```

**Рішення:** Перевірити, чи `useApi.ts` правильно парсить відповідь.

**Файл:** `Lexwebapp/src/hooks/useApi.ts`
**Метод:** `useSearchPrecedents`

Переконатися, що повертається `response.data`, а не весь об'єкт.

---

## 📝 Тестування

### 1. Локальний тест API (виконано ✅)

```bash
curl -X POST https://dev.legal.org.ua/api/tools/search_legal_precedents \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer c3462787...' \
  -d '{"query": "позовна давність", "max_results": 5}'
```

**Результат:** Повертає 10 рішень ✅

### 2. Тест у браузері (потрібно зробити)

1. Відкрити https://dev.legal.org.ua/
2. Увійти через Google OAuth
3. Знайти "Судові рішення" в меню
4. Ввести запит: "позовна давність"
5. Натиснути "Знайти рішення"
6. Перевірити, що:
   - Показується завантаження
   - З'являються результати (10 штук)
   - Кожен результат має:
     - Номер справи
     - Назву суду (не код!)
     - Ім'я судді
     - Дату
     - Опис
     - Релевантність %

---

## 🐛 Відомі проблеми

1. **Snippet HTML** - в тексті є HTML теги `<b class="snippet">`, потрібно очистити
2. **Court codes** - потрібна повна таблиця кодів судів
3. **Empty parties** - API не завжди повертає сторони
4. **Relevance calculation** - потрібно калібрувати формулу

---

## 📦 Деплоймент

Після виправлення фронтенду:

```bash
cd <project-root>/lexwebapp
docker build --platform linux/amd64 -f Dockerfile.dev -t lexwebapp-lexwebapp:dev .
docker save lexwebapp-lexwebapp:dev | gzip > /tmp/lexwebapp-court-search.tar.gz
scp /tmp/lexwebapp-court-search.tar.gz gate:/tmp/
ssh gate "gunzip -c /tmp/lexwebapp-court-search.tar.gz | docker load && \
  cd <deployment-root> && \
  docker compose -f docker-compose.dev.yml up -d lexwebapp-dev"
```

---

## 📚 Документація

Повна документація: `<project-root>/docs/COURT_SEARCH_INTEGRATION.md`

---

**Наступний крок:** Виправити маппінг даних у `DecisionsSearchPage.tsx`
