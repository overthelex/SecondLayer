import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const searchCommand = new Command('search')
  .description('Пошук судових рішень')
  .argument('<query...>', 'пошуковий запит')
  .option('-t, --type <type>', 'тип пошуку: semantic, fulltext, edrsr', 'fulltext')
  .option('-l, --limit <n>', 'кількість результатів', '10')
  .option('-c, --court <court>', 'фільтр за судом')
  .option('-f, --form <form>', 'форма судочинства')
  .option('--from <date>', 'дата від (YYYY-MM-DD)')
  .option('--to <date>', 'дата до (YYYY-MM-DD)')
  .action(async (queryParts: string[], opts) => {
    const query = queryParts.join(' ');
    const spinner = ora('Пошук...').start();

    try {
      let toolName: string;
      let args: Record<string, unknown>;

      switch (opts.type) {
        case 'semantic':
          toolName = 'search_edrsr_semantic';
          args = { query, limit: parseInt(opts.limit) };
          break;
        case 'edrsr':
          toolName = 'search_edrsr_decisions';
          args = { query, page_size: parseInt(opts.limit) };
          break;
        case 'fulltext':
        default:
          toolName = 'search_edrsr_fulltext';
          args = {
            query,
            limit: parseInt(opts.limit),
            ...(opts.court && { court_name: opts.court }),
            ...(opts.form && { form: opts.form }),
            ...(opts.from && { date_from: opts.from }),
            ...(opts.to && { date_to: opts.to }),
          };
      }

      const result = await apiClient.callTool(toolName, args);
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Помилка пошуку');
        process.exit(1);
      }

      printHeader(`Результати пошуку: "${query}"`);
      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
