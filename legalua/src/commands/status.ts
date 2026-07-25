import { Command } from 'commander';
import chalk from 'chalk';
import { apiClient } from '../lib/api-client.js';
import { getConfig, getConfigPath } from '../lib/config.js';
import { printError } from '../lib/output.js';

export const statusCommand = new Command('status')
  .description('Стан підключення до сервера')
  .action(async () => {
    const config = getConfig();

    console.log(chalk.bold('\nСтан:'));
    console.log(`  endpoint:  ${config.endpoint}`);
    console.log(`  apiKey:    ${config.apiKey ? config.apiKey.substring(0, 8) + '...' : chalk.red('не встановлено')}`);
    console.log(`  config:    ${getConfigPath()}`);

    if (!config.apiKey) {
      printError('API ключ не налаштовано. Виконайте: legal config set apiKey <ключ>');
      return;
    }

    console.log(`\n  Перевірка з'єднання...`);

    try {
      const health = await apiClient.healthCheck();
      if (health.success) {
        console.log(chalk.green('  Сервер доступний ✓'));
        if (health.data) {
          for (const [k, v] of Object.entries(health.data)) {
            console.log(`  ${k}: ${v}`);
          }
        }
      } else {
        console.log(chalk.red(`  Сервер недоступний: ${health.error}`));
      }
    } catch (err) {
      console.log(chalk.red(`  Помилка: ${err}`));
    }
    console.log();
  });
