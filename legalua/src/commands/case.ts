import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

export const caseCommand = new Command('case')
  .description('Отримати судове рішення за номером справи')
  .argument('<caseNumber>', 'номер справи (напр. 344/356/22)')
  .option('--full', 'повний текст рішення')
  .option('--chain', 'весь ланцюжок документів у справі')
  .action(async (caseNumber: string, opts) => {
    const spinner = ora(`Завантаження справи ${caseNumber}...`).start();

    try {
      let result;

      if (opts.chain) {
        result = await apiClient.callTool('get_case_documents_chain', {
          case_number: caseNumber,
        });
      } else {
        result = await apiClient.callTool('get_court_decision', {
          case_number: caseNumber,
        });
      }

      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Рішення не знайдено');
        process.exit(1);
      }

      printHeader(`Справа ${caseNumber}`);

      if (opts.full && result.data) {
        const data = result.data as Record<string, unknown>;
        if (data.doc_id) {
          const fulltext = await apiClient.callTool('get_edrsr_decision_fulltext', {
            doc_id: data.doc_id,
          });
          if (fulltext.success) {
            printResult(fulltext.data, fulltext.cost_usd);
            return;
          }
        }
      }

      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
