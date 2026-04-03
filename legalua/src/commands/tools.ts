import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { apiClient } from '../lib/api-client.js';
import { printError } from '../lib/output.js';

export const toolsCommand = new Command('tools')
  .description('Список доступних інструментів')
  .option('-f, --filter <pattern>', 'фільтрувати за назвою')
  .action(async (opts) => {
    const spinner = ora('Завантаження списку...').start();

    try {
      const result = await apiClient.listTools();
      spinner.stop();

      if (!result.success || !result.data) {
        printError(result.error || 'Помилка');
        process.exit(1);
      }

      let tools = result.data;
      if (opts.filter) {
        const pattern = opts.filter.toLowerCase();
        tools = tools.filter(t =>
          t.name.toLowerCase().includes(pattern) ||
          t.description?.toLowerCase().includes(pattern)
        );
      }

      console.log(chalk.bold(`\nДоступні інструменти (${tools.length}):\n`));
      for (const tool of tools) {
        const desc = tool.description ? chalk.dim(` — ${tool.description.substring(0, 60)}`) : '';
        console.log(`  ${chalk.cyan(tool.name)}${desc}`);
      }
      console.log();
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
