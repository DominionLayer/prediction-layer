/**
 * Show Command - Display market details
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, analysesRepo } from '../core/db/database.js';

export const showCommand = new Command('show')
  .description('Show market details')
  .argument('<market_id>', 'Market ID')
  .option('--history <n>', 'Show price history entries', '5')
  .action(async (marketId, options) => {
    try {
      const config = getConfig();
      getDatabase(config.database.path);

      // Find market (support partial ID)
      const allMarkets = marketsRepo.getAll();
      const market = allMarkets.find(m => m.id === marketId || m.id.startsWith(marketId));

      if (!market) {
        console.log(chalk.red(`Market not found: ${marketId}`));
        console.log('Run `dominion-pm scan` to fetch markets first.');
        process.exit(1);
      }

      const snapshot = snapshotsRepo.getLatest(market.id);
      const analyses = analysesRepo.getByMarket(market.id);

      // Display header
      console.log();
      console.log(chalk.bold('='.repeat(70)));
      console.log(chalk.bold(market.question));
      console.log(chalk.bold('='.repeat(70)));
      console.log();

      // Basic info
      console.log(chalk.bold('Market Information'));
      console.log('-'.repeat(40));
      console.log(`ID:          ${chalk.cyan(market.id)}`);
      console.log(`Condition:   ${market.condition_id.slice(0, 20)}...`);
      console.log(`Status:      ${market.active ? chalk.green('Active') : chalk.gray('Inactive')}`);
      console.log(`Outcomes:    ${market.outcomes.join(' / ')}`);
      if (market.end_date) {
        const endDate = new Date(market.end_date);
        const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        console.log(`Expires:     ${endDate.toISOString().split('T')[0]} (${daysLeft} days)`);
      }
      if (market.resolution_source) {
        console.log(`Resolution:  ${market.resolution_source}`);
      }
      if (market.category) {
        console.log(`Category:    ${market.category}`);
      }
      console.log();

      if (market.description) {
        console.log(chalk.bold('Description'));
        console.log('-'.repeat(40));
        console.log(market.description);
        console.log();
      }

      // Current prices
      if (snapshot) {
        console.log(chalk.bold('Current Prices'));
        console.log('-'.repeat(40));
        console.log(`YES Price:   ${chalk.green('$' + snapshot.yes_price.toFixed(3))} (${(snapshot.yes_price * 100).toFixed(1)}%)`);
        console.log(`NO Price:    ${chalk.red('$' + snapshot.no_price.toFixed(3))} (${(snapshot.no_price * 100).toFixed(1)}%)`);
        if (snapshot.spread) {
          console.log(`Spread:      ${(snapshot.spread * 100).toFixed(2)}%`);
        }
        if (snapshot.volume_24h) {
          console.log(`24h Volume:  $${snapshot.volume_24h.toLocaleString()}`);
        }
        if (snapshot.liquidity) {
          console.log(`Liquidity:   $${snapshot.liquidity.toLocaleString()}`);
        }
        console.log(`Updated:     ${new Date(snapshot.timestamp).toISOString()}`);
        console.log();
      }

      // Price history
      const history = snapshotsRepo.getHistory(market.id, parseInt(options.history));
      if (history.length > 1) {
        console.log(chalk.bold('Price History'));
        console.log('-'.repeat(40));
        console.log('Time                  | YES    | NO     | Volume');
        console.log('-'.repeat(55));
        for (const h of history) {
          const time = new Date(h.timestamp).toISOString().slice(0, 16);
          const vol = h.volume_24h ? `$${(h.volume_24h / 1000).toFixed(0)}k` : 'N/A';
          console.log(`${time} | ${(h.yes_price * 100).toFixed(1).padStart(5)}% | ${(h.no_price * 100).toFixed(1).padStart(5)}% | ${vol}`);
        }
        console.log();
      }

      // Recent analyses
      if (analyses.length > 0) {
        console.log(chalk.bold('Recent Analyses'));
        console.log('-'.repeat(40));
        for (const a of analyses.slice(0, 3)) {
          const date = new Date(a.created_at).toISOString().split('T')[0];
          const edge = a.edge !== null ? `${(a.edge * 100).toFixed(1)}%` : 'N/A';
          console.log(`${date} | Model: ${(a.model_prob! * 100).toFixed(1)}% | Edge: ${edge} | ${a.estimator_type}`);
        }
        console.log();
      }

      // Footer
      console.log(chalk.gray('─'.repeat(70)));
      console.log(chalk.gray('Run `dominion-pm analyze ' + market.id.slice(0, 8) + '` for detailed analysis'));
      console.log(chalk.gray('Run `dominion-pm simulate ' + market.id.slice(0, 8) + '` for EV simulation'));

    } catch (error) {
      console.log(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

