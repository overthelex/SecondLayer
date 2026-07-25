#!/usr/bin/env node

import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { caseCommand } from './commands/case.js';
import { lawCommand } from './commands/law.js';
import { entityCommand } from './commands/entity.js';
import { deputyCommand } from './commands/deputy.js';
import { billCommand } from './commands/bill.js';
import { registryCommand } from './commands/registry.js';
import { uploadCommand } from './commands/upload.js';
import { configCommand } from './commands/config-cmd.js';
import { runCommand } from './commands/run.js';
import { toolsCommand } from './commands/tools.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('legal')
  .version('0.1.0')
  .description('CLI для роботи з legal.org.ua — судові рішення, законодавство, реєстри України')
  .option('--json', 'вивід у форматі JSON');

// Core commands
program.addCommand(searchCommand);
program.addCommand(caseCommand);
program.addCommand(lawCommand);
program.addCommand(entityCommand);
program.addCommand(deputyCommand);
program.addCommand(billCommand);
program.addCommand(registryCommand);
program.addCommand(uploadCommand);

// Utility commands
program.addCommand(configCommand);
program.addCommand(runCommand);
program.addCommand(toolsCommand);
program.addCommand(statusCommand);

// Quick alias: "legal <text>" without subcommand → search
program.argument('[query...]', 'швидкий пошук (аліас для search)')
  .action(async (query: string[]) => {
    if (query.length > 0) {
      // Delegate to search command
      await searchCommand.parseAsync(['node', 'legal', 'search', ...query]);
    } else {
      program.help();
    }
  });

program.parse();
