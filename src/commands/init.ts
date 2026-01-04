/**
 * Init Command - Initialize configuration and database
 */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { generateDefaultConfig } from '../core/config/loader.js';
import { getDatabase, closeDatabase } from '../core/db/database.js';

export const initCommand = new Command('init')
  .description('Initialize configuration and database')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (options) => {
    const spinner = ora('Initializing...').start();

    try {
      const basePath = process.cwd();

      // Generate config file
      const configPath = path.join(basePath, 'pm.config.yaml');
      if (fs.existsSync(configPath) && !options.force) {
        spinner.info('Config file already exists (use --force to overwrite)');
      } else {
        fs.writeFileSync(configPath, generateDefaultConfig());
        spinner.succeed(`Created ${chalk.cyan('pm.config.yaml')}`);
      }

      // Generate .env.example
      const envContent = `# LLM Provider API Keys
OPENAI_API_KEY=sk-your-openai-api-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here

# Provider Selection (openai, anthropic, stub)
LLM_PROVIDER=stub

# Database
DATABASE_PATH=./data/polymarket.db

# Logging
LOG_LEVEL=info
`;

      const envPath = path.join(basePath, '.env.example');
      if (fs.existsSync(envPath) && !options.force) {
        spinner.info('.env.example already exists');
      } else {
        fs.writeFileSync(envPath, envContent);
        spinner.succeed(`Created ${chalk.cyan('.env.example')}`);
      }

      // Create directories
      const dirs = ['data', 'reports', 'logs'];
      for (const dir of dirs) {
        const dirPath = path.join(basePath, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          spinner.succeed(`Created ${chalk.cyan(dir + '/')} directory`);
        }
      }

      // Initialize database
      spinner.text = 'Initializing database...';
      const dbPath = path.join(basePath, 'data', 'polymarket.db');
      getDatabase(dbPath);
      closeDatabase();
      spinner.succeed(`Initialized database at ${chalk.cyan(dbPath)}`);

      console.log();
      console.log(chalk.green('[OK] Initialization complete!'));
      console.log();
      console.log('Next steps:');
      console.log(`  1. Copy ${chalk.cyan('.env.example')} to ${chalk.cyan('.env')} and add your API keys`);
      console.log(`  2. Edit ${chalk.cyan('pm.config.yaml')} to configure your setup`);
      console.log(`  3. Run ${chalk.cyan('dominion-pm doctor')} to validate your configuration`);
      console.log(`  4. Run ${chalk.cyan('dominion-pm scan')} to fetch markets`);
    } catch (error) {
      spinner.fail(`Initialization failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

