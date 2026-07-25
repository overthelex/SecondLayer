import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const runCommand = new Command('run')
  .description('Виконати будь-який інструмент API напряму')
  .argument('<tool>', 'назва інструмента')
  .argument('[argsJson]', 'аргументи у форматі JSON')
  .option('-a, --arg <pairs...>', 'аргументи як key=value пари')
  .action(async (tool: string, argsJson: string | undefined, opts) => {
    let args: Record<string, unknown> = {};

    if (argsJson) {
      try {
        args = JSON.parse(argsJson);
      } catch {
        printError(`Невалідний JSON: ${argsJson}`);
        process.exit(1);
      }
    }

    if (opts.arg) {
      for (const pair of opts.arg as string[]) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          printError(`Невалідна пара: ${pair}. Формат: key=value`);
          process.exit(1);
        }
        const key = pair.substring(0, eqIdx);
        const value = pair.substring(eqIdx + 1);
        // Try parsing as number or boolean
        if (value === 'true') args[key] = true;
        else if (value === 'false') args[key] = false;
        else if (/^\d+$/.test(value)) args[key] = parseInt(value);
        else if (/^\d+\.\d+$/.test(value)) args[key] = parseFloat(value);
        else args[key] = value;
      }
    }

    const spinner = ora(`${tool}...`).start();

    try {
      const result = await apiClient.callTool(tool, args);
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Помилка виконання');
        process.exit(1);
      }

      printHeader(tool);
      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
