import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const entityCommand = new Command('entity')
  .description('Пошук юридичних осіб у реєстрі')
  .argument('<query...>', 'назва або ЄДРПОУ')
  .option('-b, --beneficiaries', 'показати бенефіціарів')
  .option('-d, --debtors', 'перевірити реєстр боржників')
  .option('--sanctions', 'перевірити санкційні списки')
  .option('-l, --limit <n>', 'кількість результатів', '10')
  .action(async (queryParts: string[], opts) => {
    const query = queryParts.join(' ');
    const spinner = ora(`Пошук: ${query}...`).start();

    try {
      const isEdrpou = /^\d{8,10}$/.test(query);

      if (isEdrpou) {
        const result = await apiClient.callTool('openreyestr_get_by_edrpou', {
          edrpou: query,
        });
        spinner.stop();

        if (!result.success) {
          printError(result.error || 'Компанію не знайдено');
          process.exit(1);
        }
        printHeader(`ЄДРПОУ: ${query}`);
        printResult(result.data, result.cost_usd);
      } else {
        const result = await apiClient.callTool('openreyestr_search_entities', {
          query,
          limit: parseInt(opts.limit),
        });
        spinner.stop();

        if (!result.success) {
          printError(result.error || 'Нічого не знайдено');
          process.exit(1);
        }
        printHeader(`Результати: "${query}"`);
        printResult(result.data, result.cost_usd);
      }

      if (opts.beneficiaries) {
        const spinner2 = ora('Пошук бенефіціарів...').start();
        const bResult = await apiClient.callTool('openreyestr_search_beneficiaries', {
          query,
        });
        spinner2.stop();
        if (bResult.success) {
          printHeader('Бенефіціари');
          printResult(bResult.data, bResult.cost_usd);
        }
      }

      if (opts.debtors) {
        const spinner3 = ora('Перевірка реєстру боржників...').start();
        const dResult = await apiClient.callTool('openreyestr_search_debtors', {
          query,
        });
        spinner3.stop();
        if (dResult.success) {
          printHeader('Реєстр боржників');
          printResult(dResult.data, dResult.cost_usd);
        }
      }

      if (opts.sanctions) {
        const spinner4 = ora('Перевірка санкцій...').start();
        const sResult = await apiClient.callTool('search_sanctions', {
          query,
        });
        spinner4.stop();
        if (sResult.success) {
          printHeader('Санкційні списки');
          printResult(sResult.data, sResult.cost_usd);
        }
      }
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
