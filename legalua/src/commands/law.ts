import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const lawCommand = new Command('law')
  .description('Текст законодавства')
  .argument('<name...>', 'назва закону або аліас (конституція, цк, кк, гпк, ...)')
  .option('-a, --article <article>', 'номер статті')
  .option('-s, --search <query>', 'пошук у тексті закону')
  .option('--structure', 'показати структуру документа')
  .action(async (nameParts: string[], opts) => {
    const name = nameParts.join(' ');
    const spinner = ora(`Завантаження: ${name}...`).start();

    try {
      if (opts.search) {
        const result = await apiClient.callTool('search_legislation', {
          query: opts.search,
          law_name: name,
        });
        spinner.stop();
        if (!result.success) {
          printError(result.error || 'Помилка пошуку');
          process.exit(1);
        }
        printHeader(`Пошук "${opts.search}" у ${name}`);
        printResult(result.data, result.cost_usd);
        return;
      }

      if (opts.structure) {
        const result = await apiClient.callTool('get_legislation_structure', {
          law_name: name,
        });
        spinner.stop();
        if (!result.success) {
          printError(result.error || 'Структура не знайдена');
          process.exit(1);
        }
        printHeader(`Структура: ${name}`);
        printResult(result.data, result.cost_usd);
        return;
      }

      const args: Record<string, unknown> = { law_name: name };
      if (opts.article) {
        args.article = opts.article;
      }

      const result = await apiClient.callTool('get_legislation_section', args);
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Закон не знайдено');
        process.exit(1);
      }

      const title = opts.article ? `${name}, стаття ${opts.article}` : name;
      printHeader(title);
      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
