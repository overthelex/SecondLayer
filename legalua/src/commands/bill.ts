import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const billCommand = new Command('bill')
  .description('Пошук законопроєктів Верховної Ради')
  .argument('<query...>', 'пошуковий запит')
  .option('-s, --status <status>', 'статус (розгляд, прийнято, відхилено)')
  .option('-l, --limit <n>', 'кількість результатів', '10')
  .action(async (queryParts: string[], opts) => {
    const query = queryParts.join(' ');
    const spinner = ora('Пошук законопроєктів...').start();

    try {
      const result = await apiClient.callTool('rada_search_parliament_bills', {
        query,
        ...(opts.status && { status: opts.status }),
        limit: parseInt(opts.limit),
      });
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Нічого не знайдено');
        process.exit(1);
      }

      printHeader(`Законопроєкти: "${query}"`);
      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
