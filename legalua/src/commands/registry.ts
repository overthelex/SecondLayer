import { Command } from 'commander';
import ora from 'ora';
import { apiClient } from '../lib/api-client.js';
import { printResult, printError, printHeader } from '../lib/output.js';

const REGISTRIES: Record<string, { tool: string; description: string }> = {
  sanctions:      { tool: 'search_sanctions', description: 'Санкційні списки' },
  rnbo:           { tool: 'search_rnbo_sanctions', description: 'Санкції РНБО' },
  corruption:     { tool: 'search_corruption_register', description: 'Реєстр корупціонерів' },
  wanted:         { tool: 'search_wanted_persons', description: 'Розшук осіб' },
  missing:        { tool: 'search_missing_persons', description: 'Зниклі безвісти' },
  passports:      { tool: 'search_invalid_passports', description: 'Недійсні паспорти' },
  lustration:     { tool: 'search_lustration', description: 'Реєстр люстрації' },
  terrorism:      { tool: 'search_terrorism_list', description: 'Список терористів' },
  lawyers:        { tool: 'search_lawyers', description: 'Реєстр адвокатів' },
  judges:         { tool: 'search_judges', description: 'Довідник суддів' },
  notaries:       { tool: 'openreyestr_search_notaries', description: 'Реєстр нотаріусів' },
  experts:        { tool: 'search_court_experts_registry', description: 'Судові експерти' },
  trademarks:     { tool: 'search_trademarks', description: 'Торгові марки' },
  patents:        { tool: 'search_patents', description: 'Патенти' },
  vat:            { tool: 'search_vat_payers_registry', description: 'Платники ПДВ' },
  taxpayers:      { tool: 'search_large_taxpayers', description: 'Великі платники податків' },
  'tax-debt':     { tool: 'openreyestr_search_tax_debt', description: 'Податковий борг' },
  'wage-debtors': { tool: 'search_wage_debtors', description: 'Боржники з зарплати' },
  procurement:    { tool: 'openreyestr_search_prozorro', description: 'ProZorro закупівлі' },
  declarations:   { tool: 'openreyestr_search_nazk_declarations', description: 'Декларації НАЗК' },
  vehicles:       { tool: 'search_wanted_vehicles', description: 'Розшук транспорту' },
  spending:       { tool: 'search_public_spending', description: 'Публічні витрати' },
  banks:          { tool: 'search_nbu_banks', description: 'Банки НБУ' },
};

export const registryCommand = new Command('registry')
  .description('Пошук у публічних реєстрах')
  .argument('<registry>', `реєстр: ${Object.keys(REGISTRIES).join(', ')}`)
  .argument('<query...>', 'пошуковий запит')
  .option('-l, --limit <n>', 'кількість результатів', '10')
  .action(async (registry: string, queryParts: string[], opts) => {
    const reg = REGISTRIES[registry];
    if (!reg) {
      printError(`Невідомий реєстр: ${registry}`);
      console.log('\nДоступні реєстри:');
      for (const [key, val] of Object.entries(REGISTRIES)) {
        console.log(`  ${key.padEnd(15)} ${val.description}`);
      }
      process.exit(1);
    }

    const query = queryParts.join(' ');
    const spinner = ora(`${reg.description}: "${query}"...`).start();

    try {
      const result = await apiClient.callTool(reg.tool, {
        query,
        name: query,
        limit: parseInt(opts.limit),
      });
      spinner.stop();

      if (!result.success) {
        printError(result.error || 'Нічого не знайдено');
        process.exit(1);
      }

      printHeader(`${reg.description}: "${query}"`);
      printResult(result.data, result.cost_usd);
    } catch (err) {
      spinner.stop();
      printError(String(err));
      process.exit(1);
    }
  });
