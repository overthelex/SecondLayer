import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, setConfig, getConfigPath, getAllConfig, resetConfig, type LegalConfig } from '../lib/config.js';
import { printSuccess, printError, printInfo } from '../lib/output.js';

export const configCommand = new Command('config')
  .description('Керування налаштуваннями');

configCommand
  .command('set')
  .description('Встановити параметр')
  .argument('<key>', 'ключ: apiKey, endpoint, format, locale')
  .argument('<value>', 'значення')
  .action((key: string, value: string) => {
    const validKeys: (keyof LegalConfig)[] = ['apiKey', 'endpoint', 'format', 'locale'];
    if (!validKeys.includes(key as keyof LegalConfig)) {
      printError(`Невідомий ключ: ${key}. Доступні: ${validKeys.join(', ')}`);
      process.exit(1);
    }
    setConfig(key as keyof LegalConfig, value as never);
    const display = key === 'apiKey' ? value.substring(0, 8) + '...' : value;
    printSuccess(`${key} = ${display}`);
  });

configCommand
  .command('get')
  .description('Показати параметр')
  .argument('[key]', 'ключ (без ключа — всі параметри)')
  .action((key?: string) => {
    if (key) {
      const config = getConfig();
      const value = config[key as keyof LegalConfig];
      if (value === undefined) {
        printError(`Невідомий ключ: ${key}`);
        process.exit(1);
      }
      const display = key === 'apiKey' && value ? String(value).substring(0, 8) + '...' : value;
      console.log(`${key} = ${display}`);
    } else {
      const config = getAllConfig();
      console.log(chalk.bold('\nНалаштування:'));
      console.log(`  apiKey:    ${config.apiKey ? config.apiKey.substring(0, 8) + '...' : chalk.dim('(не встановлено)')}`);
      console.log(`  endpoint:  ${config.endpoint}`);
      console.log(`  format:    ${config.format}`);
      console.log(`  locale:    ${config.locale}`);
      console.log(`\n  файл: ${getConfigPath()}`);
    }
  });

configCommand
  .command('reset')
  .description('Скинути до значень за замовчуванням')
  .action(() => {
    resetConfig();
    printSuccess('Налаштування скинуто');
  });

configCommand
  .command('path')
  .description('Шлях до файлу конфігурації')
  .action(() => {
    console.log(getConfigPath());
  });
