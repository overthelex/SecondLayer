import chalk from 'chalk';
import Table from 'cli-table3';
import { getConfig } from './config.js';

export function printError(msg: string): void {
  console.error(chalk.red('✗ ') + msg);
}

export function printSuccess(msg: string): void {
  console.log(chalk.green('✓ ') + msg);
}

export function printWarning(msg: string): void {
  console.log(chalk.yellow('⚠ ') + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue('ℹ ') + msg);
}

export function printCost(cost: number | undefined): void {
  if (cost !== undefined && cost > 0) {
    console.log(chalk.dim(`  вартість: $${cost.toFixed(4)}`));
  }
}

export function printResult(data: unknown, costUsd?: number): void {
  const { format } = getConfig();

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (typeof data === 'string') {
    console.log(data);
  } else if (Array.isArray(data)) {
    printArray(data);
  } else if (data && typeof data === 'object') {
    printObject(data as Record<string, unknown>);
  } else {
    console.log(String(data));
  }

  printCost(costUsd);
}

function printObject(obj: Record<string, unknown>, indent = 0): void {
  const pad = ' '.repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      console.log(`${pad}${chalk.bold(key)}:`);
      printObject(value as Record<string, unknown>, indent + 2);
    } else if (Array.isArray(value)) {
      console.log(`${pad}${chalk.bold(key)}: [${value.length} елементів]`);
      if (value.length > 0 && typeof value[0] === 'object') {
        printArray(value);
      } else {
        console.log(`${pad}  ${value.join(', ')}`);
      }
    } else {
      const strValue = String(value);
      if (strValue.length > 200) {
        console.log(`${pad}${chalk.bold(key)}: ${strValue.substring(0, 200)}...`);
      } else {
        console.log(`${pad}${chalk.bold(key)}: ${strValue}`);
      }
    }
  }
}

function printArray(arr: unknown[]): void {
  if (arr.length === 0) {
    console.log(chalk.dim('  (порожній список)'));
    return;
  }

  if (typeof arr[0] !== 'object' || arr[0] === null) {
    arr.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
    return;
  }

  const items = arr as Record<string, unknown>[];
  const keys = Object.keys(items[0]).filter(k => {
    const v = items[0][k];
    return v !== null && v !== undefined && typeof v !== 'object';
  }).slice(0, 6);

  if (keys.length === 0) {
    items.forEach((item, i) => {
      console.log(chalk.bold(`\n--- ${i + 1} ---`));
      printObject(item, 2);
    });
    return;
  }

  const table = new Table({
    head: keys.map(k => chalk.bold(k)),
    style: { head: [], border: [] },
    wordWrap: true,
    colWidths: keys.map(() => Math.floor(Math.min(40, (process.stdout.columns || 120) / keys.length))),
  });

  for (const item of items.slice(0, 25)) {
    table.push(keys.map(k => {
      const v = item[k];
      const s = String(v ?? '');
      return s.length > 80 ? s.substring(0, 77) + '...' : s;
    }));
  }

  console.log(table.toString());
  if (items.length > 25) {
    console.log(chalk.dim(`  ... ще ${items.length - 25} результатів`));
  }
}

export function printHeader(text: string): void {
  console.log();
  console.log(chalk.bold.blue(text));
  console.log(chalk.dim('─'.repeat(Math.min(text.length + 4, 60))));
}
