import { Command } from 'commander';
import ora from 'ora';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printSuccess } from '../lib/output.js';

export const uploadCommand = new Command('upload')
  .description('Завантажити документ у сховище')
  .argument('<file>', 'шлях до файлу')
  .option('-n, --name <name>', 'назва документа')
  .option('-t, --tags <tags>', 'теги через кому')
  .action(async (file: string, opts) => {
    const filePath = resolve(file);

    if (!existsSync(filePath)) {
      printError(`Файл не знайдено: ${filePath}`);
      process.exit(1);
    }

    const spinner = ora('Завантаження...').start();

    try {
      const metadata: Record<string, string> = {};
      if (opts.name) metadata.name = opts.name;
      if (opts.tags) metadata.tags = opts.tags;

      const result = await apiClient.uploadFile(filePath, metadata);
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Помилка завантаження');
        process.exit(1);
      }

      printSuccess('Документ завантажено');
      printResult(result.data);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
