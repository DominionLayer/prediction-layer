#!/usr/bin/env node

/**
 * Dominion-PM CLI - Polymarket Analysis and Decision Support
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  initCommand,
  scanCommand,
  showCommand,
  analyzeCommand,
  compareCommand,
  simulateCommand,
  reportCommand,
  doctorCommand,
  execCommand,
  disclaimerCommand,
} from '../commands/index.js';

const program = new Command();

program
  .name('dominion-pm')
  .description('Polymarket analysis and decision support CLI')
  .version('1.0.0')
  .hook('preAction', () => {
    // Display disclaimer reminder on every command except help-disclaimer
    const args = process.argv.slice(2);
    if (!args.includes('help-disclaimer') && !args.includes('--help') && !args.includes('-h')) {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.gray('Disclaimer: This is analysis only, NOT financial advice.'));
      console.log(chalk.gray('Run `dominion-pm help-disclaimer` for full legal notices.'));
      console.log(chalk.gray('─'.repeat(60)));
    }
  });

// Register all commands
program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(showCommand);
program.addCommand(analyzeCommand);
program.addCommand(compareCommand);
program.addCommand(simulateCommand);
program.addCommand(reportCommand);
program.addCommand(doctorCommand);
program.addCommand(execCommand);
program.addCommand(disclaimerCommand);

// Parse and execute
program.parse();

