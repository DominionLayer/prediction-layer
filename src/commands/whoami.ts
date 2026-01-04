/**
 * Whoami Command - Show current user and quota
 */

import { Command } from 'commander';
import { request } from 'undici';
import chalk from 'chalk';
import { getConfig } from '../core/config/loader.js';

export const whoamiCommand = new Command()
  .name('whoami')
  .description('Show current user and remaining quota')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const config = getConfig();
    const apiUrl = process.env.DOMINION_API_URL || config.gateway?.url || 'http://localhost:3100';
    const apiToken = process.env.DOMINION_API_TOKEN || config.gateway?.token;

    if (!apiToken) {
      console.log(chalk.red('\n[FAIL] Not authenticated'));
      console.log(chalk.gray('    Run `dominion-pm login` to authenticate'));
      console.log(chalk.gray('    Or set DOMINION_API_TOKEN environment variable'));
      process.exit(1);
    }

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
        console.log(chalk.gray('    Run `dominion-pm login` to re-authenticate'));
        process.exit(1);
      }

      if (response.statusCode !== 200) {
        console.log(chalk.red(`\n[FAIL] Gateway error: ${response.statusCode}`));
        process.exit(1);
      }

      const data = await response.body.json() as any;

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(chalk.cyan('\n=== Dominion Gateway ===\n'));
      console.log(chalk.white(`  User ID: ${chalk.bold(data.user_id)}`));
      console.log(chalk.white(`  Gateway: ${chalk.gray(apiUrl)}`));
      console.log();

      // Daily Requests
      const reqUsed = data.daily_requests?.used || 0;
      const reqLimit = data.daily_requests?.limit || 0;
      const reqRemaining = data.daily_requests?.remaining || 0;
      const reqPercent = reqLimit > 0 ? Math.round((reqUsed / reqLimit) * 100) : 0;
      
      console.log(chalk.white('  Daily Requests:'));
      console.log(chalk.gray(`    ${progressBar(reqPercent)} ${reqUsed}/${reqLimit} (${reqRemaining} remaining)`));

      // Daily Tokens
      const tokUsed = data.daily_tokens?.used || 0;
      const tokLimit = data.daily_tokens?.limit || 0;
      const tokRemaining = data.daily_tokens?.remaining || 0;
      const tokPercent = tokLimit > 0 ? Math.round((tokUsed / tokLimit) * 100) : 0;
      
      console.log(chalk.white('  Daily Tokens:'));
      console.log(chalk.gray(`    ${progressBar(tokPercent)} ${formatNumber(tokUsed)}/${formatNumber(tokLimit)} (${formatNumber(tokRemaining)} remaining)`));

      // Monthly Spend
      if (data.monthly_spend) {
        const spendUsed = data.monthly_spend.used_usd || 0;
        const spendCap = data.monthly_spend.cap_usd;
        
        console.log(chalk.white('  Monthly Spend:'));
        if (spendCap) {
          const spendPercent = Math.round((spendUsed / spendCap) * 100);
          console.log(chalk.gray(`    ${progressBar(spendPercent)} $${spendUsed.toFixed(2)}/$${spendCap.toFixed(2)}`));
        } else {
          console.log(chalk.gray(`    $${spendUsed.toFixed(2)} (no cap)`));
        }
      }

      console.log();
    } catch (error) {
      if ((error as any).code === 'ECONNREFUSED') {
        console.log(chalk.red(`\n[FAIL] Could not connect to gateway at ${apiUrl}`));
      } else {
        console.log(chalk.red(`\n[FAIL] ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  
  let color = chalk.green;
  if (percent >= 90) color = chalk.red;
  else if (percent >= 70) color = chalk.yellow;
  
  return color('[' + '='.repeat(filled) + ' '.repeat(empty) + ']');
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

