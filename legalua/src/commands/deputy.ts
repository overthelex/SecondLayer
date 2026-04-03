import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const deputyCommand = new Command('deputy')
  .description('Інформація про народного депутата')
  .argument('<name...>', "ім'я депутата")
  .option('-v, --voting', 'аналіз голосувань')
  .action(async (nameParts: string[], opts) => {
    const name = nameParts.join(' ');
    const spinner = ora(`Пошук депутата: ${name}...`).start();

    try {
      const result = await apiClient.callTool('rada_get_deputy_info', {
        query: name,
      });
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Депутата не знайдено');
        process.exit(1);
      }

      printHeader(`Депутат: ${name}`);
      printResult(result.data, result.cost_usd);

      if (opts.voting) {
        const spinner2 = ora('Аналіз голосувань...').start();
        const vResult = await apiClient.callTool('rada_analyze_voting_record', {
          deputy_name: name,
        });
        spinner2.stop();
        if (vResult.success) {
          printHeader('Аналіз голосувань');
          printResult(vResult.data, vResult.cost_usd);
        }
      }
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
