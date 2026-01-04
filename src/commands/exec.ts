/**
 * Exec Command - Generate signed intent (SKELETON ONLY)
 * 
 * NOTE: This is a skeleton implementation that does NOT execute trades.
 * It generates a signed intent JSON that the user can take elsewhere.
 * Live trading is OFF by default and requires explicit approval.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import crypto from 'node:crypto';
import inquirer from 'inquirer';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, analysesRepo } from '../core/db/database.js';

export const execCommand = new Command('exec')
  .description('Generate a signed trading intent (does NOT execute trades)')
  .argument('<market_id>', 'Market ID')
  .option('-p, --position <pos>', 'Position (YES or NO)', 'YES')
  .option('-s, --size <n>', 'Position size', '1')
  .option('--approve', 'Skip confirmation prompt')
  .action(async (marketId, options) => {
    try {
      const config = getConfig();
      getDatabase(config.database.path);

      // Find market
      const allMarkets = marketsRepo.getAll();
      const market = allMarkets.find(m => m.id === marketId || m.id.startsWith(marketId));

      if (!market) {
        console.log(chalk.red(`Market not found: ${marketId}`));
        process.exit(1);
      }

      const snapshot = snapshotsRepo.getLatest(market.id);
      if (!snapshot) {
        console.log(chalk.red('No price data available'));
        process.exit(1);
      }

      // Display warning
      console.log();
      console.log(chalk.yellow('='.repeat(70)));
      console.log(chalk.yellow.bold('WARNING: TRADING INTENT GENERATOR'));
      console.log(chalk.yellow('='.repeat(70)));
      console.log();
      console.log(chalk.yellow('This command generates a signed intent JSON.'));
      console.log(chalk.yellow('It does NOT execute any trades on Polymarket.'));
      console.log(chalk.yellow('You would need to use this intent with an external'));
      console.log(chalk.yellow('execution system (not provided) to place actual orders.'));
      console.log();
      console.log(chalk.red.bold('DISCLAIMER: This is NOT financial advice.'));
      console.log(chalk.red.bold('Trading prediction markets involves significant risk.'));
      console.log(chalk.red.bold('Never invest more than you can afford to lose.'));
      console.log();

      // Confirmation
      if (!options.approve) {
        const answer = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Do you understand this generates an intent only (no execution)?',
          default: false,
        }]);

        if (!answer.confirm) {
          console.log(chalk.gray('Cancelled'));
          return;
        }
      }

      // Generate intent
      const position = options.position.toUpperCase();
      const size = parseFloat(options.size);
      const price = position === 'YES' ? snapshot.yes_price : snapshot.no_price;

      const intent = {
        version: '1.0',
        type: 'trading_intent',
        status: 'unsigned',
        market: {
          id: market.id,
          condition_id: market.condition_id,
          question: market.question,
        },
        order: {
          side: position,
          size,
          limit_price: price,
          order_type: 'limit',
        },
        metadata: {
          generated_at: new Date().toISOString(),
          generator: 'dominion-pm',
          generator_version: '1.0.0',
        },
        signature: null as string | null,
        disclaimer: 'This is a trading intent only. It has NOT been executed. Use at your own risk. This is NOT financial advice.',
      };

      // Generate a hash (not a real cryptographic signature, just for identification)
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(intent))
        .digest('hex')
        .slice(0, 16);
      
      intent.signature = `INTENT-${hash}`;

      // Display intent
      console.log();
      console.log(chalk.bold('Generated Trading Intent:'));
      console.log('-'.repeat(60));
      console.log();
      console.log(JSON.stringify(intent, null, 2));
      console.log();
      console.log('-'.repeat(60));
      console.log();
      console.log(`Intent ID: ${chalk.cyan(intent.signature)}`);
      console.log();
      console.log(chalk.gray('This intent has NOT been executed.'));
      console.log(chalk.gray('To place an actual trade, you would need to:'));
      console.log(chalk.gray('  1. Have a Polymarket account with funds'));
      console.log(chalk.gray('  2. Use their official interface or API'));
      console.log(chalk.gray('  3. Sign the transaction with your wallet'));
      console.log();
      console.log(chalk.yellow('='.repeat(70)));
      console.log(chalk.yellow('REMINDER: This is NOT financial advice.'));
      console.log(chalk.yellow('='.repeat(70)));

    } catch (error) {
      console.log(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

