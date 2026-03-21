import { CodeBlock } from '@/components/CodeBlock';

export function AuthenticationPage() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1>Authentication</h1>
      <p>
        SecondLayer використовує <strong>Bearer token</strong> автентифікацію.
        Кожен API-запит повинен містити ваш токен в заголовку <code>Authorization</code>.
      </p>

      <h2>Формат заголовка</h2>
      <CodeBlock
        code={`Authorization: Bearer sl_a1b2c3d4e5f6...`}
        title="HTTP Header"
      />

      <h2>Отримання API ключа</h2>
      <ol>
        <li>Увійдіть в <a href="/keys">Developer Console</a></li>
        <li>Натисніть &ldquo;Створити ключ&rdquo;</li>
        <li>Збережіть ключ — він показується лише один раз</li>
      </ol>

      <h2>Формат ключа</h2>
      <p>API ключі SecondLayer мають формат:</p>
      <CodeBlock code="sl_<32 символи>_<8 символів checksum>" title="Key format" />
      <p>Префікс <code>sl_</code> дозволяє легко ідентифікувати ключі SecondLayer в конфігурації.</p>

      <h2>Безпека</h2>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 not-prose">
        <p className="text-sm text-amber-800">
          <strong>Важливо:</strong> Ніколи не зберігайте API ключі в публічних репозиторіях,
          клієнтському коді або незахищених каналах зв&apos;язку. Використовуйте змінні оточення
          для зберігання ключів.
        </p>
      </div>

      <h2>Приклад запиту</h2>
      <CodeBlock
        code={`curl -X POST https://mcp.legal.org.ua/api/tools/search_court_decisions \\
  -H "Authorization: Bearer sl_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "відшкодування збитків"}'`}
        title="curl"
      />

      <h2>Відповіді помилок</h2>
      <table>
        <thead>
          <tr>
            <th>Код</th>
            <th>Опис</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>401</code></td>
            <td>Невалідний або відсутній токен</td>
          </tr>
          <tr>
            <td><code>403</code></td>
            <td>Токен відкликано або термін дії закінчився</td>
          </tr>
          <tr>
            <td><code>429</code></td>
            <td>Перевищено ліміт запитів</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
