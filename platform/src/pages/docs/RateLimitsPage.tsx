export function RateLimitsPage() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1>Rate Limits</h1>
      <p>
        SecondLayer застосовує обмеження швидкості (rate limits) для кожного API ключа,
        щоб забезпечити стабільну роботу сервісу для всіх користувачів.
      </p>

      <h2>Ліміти за замовчуванням</h2>
      <table>
        <thead>
          <tr>
            <th>Параметр</th>
            <th>Ліміт</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Запитів на хвилину</td>
            <td>60</td>
          </tr>
          <tr>
            <td>Запитів на день</td>
            <td>10,000</td>
          </tr>
          <tr>
            <td>Максимальний розмір запиту</td>
            <td>10 MB</td>
          </tr>
          <tr>
            <td>Таймаут виконання</td>
            <td>120 секунд</td>
          </tr>
        </tbody>
      </table>

      <h2>Заголовки відповіді</h2>
      <p>Кожна відповідь містить заголовки з інформацією про ліміти:</p>
      <table>
        <thead>
          <tr>
            <th>Заголовок</th>
            <th>Опис</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>X-RateLimit-Limit</code></td>
            <td>Максимальна кількість запитів за хвилину</td>
          </tr>
          <tr>
            <td><code>X-RateLimit-Remaining</code></td>
            <td>Залишок запитів в поточному вікні</td>
          </tr>
          <tr>
            <td><code>X-RateLimit-Reset</code></td>
            <td>Час скидання ліміту (Unix timestamp)</td>
          </tr>
        </tbody>
      </table>

      <h2>Перевищення ліміту</h2>
      <p>
        При перевищенні ліміту сервер повертає <code>429 Too Many Requests</code>.
        Рекомендуємо реалізувати exponential backoff:
      </p>
      <ul>
        <li>Перша спроба: затримка 1 секунда</li>
        <li>Друга спроба: затримка 2 секунди</li>
        <li>Третя спроба: затримка 4 секунди</li>
        <li>Максимум: 5 спроб з максимальною затримкою 32 секунди</li>
      </ul>

      <h2>Збільшення лімітів</h2>
      <p>
        Якщо вам потрібні вищі ліміти, зверніться на{' '}
        <a href="mailto:support@legal.org.ua">support@legal.org.ua</a>.
      </p>
    </article>
  );
}
