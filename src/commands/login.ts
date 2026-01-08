/**
 * Login Command - Authenticate with Dominion Gateway
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { request } from 'undici';
import chalk from 'chalk';
import inquirer from 'inquirer';

// Default gateway URL
const DEFAULT_GATEWAY_URL = 'https://api.dominionlayer.io';

export const loginCommand = new Command()
  .name('login')
  .description('Authenticate with Dominion Gateway')
  .option('--url <url>', 'Gateway URL', DEFAULT_GATEWAY_URL)
  .option('--token <token>', 'API token (or will be prompted)')
  .action(async (options) => {
    console.log(chalk.cyan('\n=== Dominion Gateway Login ===\n'));

    let apiUrl = options.url;
    let apiToken = options.token;

    // Prompt for token if not provided
    if (!apiToken) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'Gateway URL:',
          default: apiUrl,
        },
        {
          type: 'password',
          name: 'token',
          message: 'API Token (starts with dom_):',
          mask: '*',
          validate: (input: string) => {
            if (!input) return 'Token is required';
            if (!input.startsWith('dom_')) return 'Token must start with dom_';
            return true;
          },
        },
      ]);
      apiUrl = answers.url;
      apiToken = answers.token;
    }

    // Verify the token
    console.log(chalk.gray('Verifying token...'));
    
    try {
      const response = await request(`${apiUrl}/v1/llm/quota`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
        headersTimeout: 10000,
        bodyTimeout: 10000,
      });

      if (response.statusCode === 401) {
        console.log(chalk.red('\n[FAIL] Invalid API token'));
        process.exit(1);
      }

      if (response.statusCode !== 200) {
        console.log(chalk.red(`\n[FAIL] Gateway error: ${response.statusCode}`));
        process.exit(1);
      }

      const data = await response.body.json() as any;

      // Save to config file
      const configDir = process.cwd();
      const configPath = path.join(configDir, 'pm.config.yaml');
      
      // Read existing config or create new
      let configContent = '';
      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, 'utf-8');
      }

      // Update or add gateway section
      if (configContent.includes('gateway:')) {
        // Update existing gateway section
        configContent = configContent.replace(
          /gateway:[\s\S]*?(?=\n\w|$)/,
          `gateway:\n  url: "${apiUrl}"\n  token: "${apiToken}"\n`
        );
      } else {
        // Add gateway section
        configContent += `\ngateway:\n  url: "${apiUrl}"\n  token: "${apiToken}"\n`;
      }

      fs.writeFileSync(configPath, configContent);

      console.log(chalk.green('\n[OK] Authentication successful!'));
      console.log(chalk.gray(`    User ID: ${data.user_id}`));
      console.log(chalk.gray(`    Daily requests remaining: ${data.daily_requests?.remaining || 'N/A'}`));
      console.log(chalk.gray(`    Daily tokens remaining: ${data.daily_tokens?.remaining || 'N/A'}`));
      console.log(chalk.gray(`\n    Token saved to ${configPath}`));
      
      // Also suggest setting environment variable
      console.log(chalk.yellow('\n    Tip: You can also set DOMINION_API_TOKEN environment variable'));
    } catch (error) {
      if ((error as any).code === 'ECONNREFUSED') {
        console.log(chalk.red(`\n[FAIL] Could not connect to gateway at ${apiUrl}`));
        console.log(chalk.gray('    Make sure the gateway server is running'));
      } else {
        console.log(chalk.red(`\n[FAIL] ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

