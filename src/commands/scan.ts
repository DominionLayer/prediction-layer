/**
 * Scan Command - Fetch and store active markets
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, runsRepo } from '../core/db/database.js';
import { createPolymarketClient } from '../polymarket/client.js';
import { logger, configureLogger } from '../core/logging/logger.js';

export const scanCommand = new Command('scan')
  .description('Fetch active markets from Polymarket')
  .option('-l, --limit <n>', 'Maximum markets to fetch', '100')
  .option('-c, --category <category>', 'Filter by category')
  .option('-q, --query <query>', 'Search query')
  .option('--mock', 'Use mock data (for testing)')
  .action(async (options) => {
    const spinner = ora('Fetching markets...').start();

    try {
      const config = getConfig();
      configureLogger({ 
        level: config.logging.level, 
        format: config.logging.format 
      });
      
      getDatabase(config.database.path);
      const runId = runsRepo.create('scan');
      
      logger.setContext({ run_id: runId, command: 'scan' });

      const client = createPolymarketClient(options.mock);
      
      let markets;
      if (options.query) {
        spinner.text = `Searching markets: ${options.query}`;
        markets = await client.searchMarkets(options.query, parseInt(options.limit));
      } else if (options.category) {
        spinner.text = `Fetching ${options.category} markets...`;
        markets = await client.getMarketsByCategory(options.category, parseInt(options.limit));
      } else {
        markets = await client.getActiveMarkets(parseInt(options.limit));
      }

      spinner.text = `Processing ${markets.length} markets...`;

      let stored = 0;
      for (const market of markets) {
        // Store market
        marketsRepo.upsert({
          id: market.id,
          condition_id: market.conditionId,
          question: market.question,
          description: market.description,
          outcomes: market.outcomes,
          end_date: market.endDate?.getTime() || null,
          resolution_source: market.resolutionSource,
          category: market.category,
          tags: market.tags,
          active: market.active,
        });

        // Store snapshot
        snapshotsRepo.create({
          market_id: market.id,
          yes_price: market.prices.yesPrice,
          no_price: market.prices.noPrice,
          yes_bid: market.prices.yesBid || null,
          yes_ask: market.prices.yesAsk || null,
          no_bid: market.prices.noBid || null,
          no_ask: market.prices.noAsk || null,
          spread: market.prices.spread || null,
          volume_24h: market.prices.volume24h || null,
          liquidity: market.prices.liquidity || null,
          open_interest: null,
          raw_data: market.prices,
        });

        stored++;
      }

      runsRepo.complete(runId);
      spinner.succeed(`Stored ${chalk.cyan(stored)} markets`);

      // Display summary
      console.log();
      console.log(chalk.bold('Markets Summary:'));
      console.log('-'.repeat(60));
      
      const topMarkets = markets.slice(0, 5);
      for (const m of topMarkets) {
        const yesPrice = (m.prices.yesPrice * 100).toFixed(1);
        console.log(`  ${chalk.cyan(m.id.slice(0, 8))} ${m.question.slice(0, 45)}...`);
        console.log(`    YES: ${yesPrice}% | Vol: $${(m.prices.volume24h || 0).toLocaleString()}`);
      }
      
      if (markets.length > 5) {
        console.log(`  ... and ${markets.length - 5} more`);
      }

      console.log();
      console.log(`Run ID: ${chalk.gray(runId)}`);
    } catch (error) {
      spinner.fail(`Scan failed: ${(error as Error).message}`);
      logger.error('Scan failed', { error: (error as Error).message });
      process.exit(1);
    }
  });

