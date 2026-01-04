/**
 * Compare Command - List top markets by edge
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, analysesRepo, runsRepo } from '../core/db/database.js';
import { BaselineEstimator } from '../analysis/estimators/index.js';
import { calculateEdge, filterMarkets, rankByEdge, type EdgeAnalysis } from '../analysis/edge.js';
import { generateReport } from '../core/reporting/reporter.js';
import { logger, configureLogger } from '../core/logging/logger.js';
import type { MarketWithPrices } from '../polymarket/types.js';

export const compareCommand = new Command('compare')
  .description('Compare markets and find top opportunities by edge')
  .option('-n, --top <n>', 'Number of top markets to show', '10')
  .option('--min-liquidity <usd>', 'Minimum liquidity in USD')
  .option('--min-volume <usd>', 'Minimum 24h volume in USD')
  .option('--max-spread <decimal>', 'Maximum spread (e.g., 0.05 for 5%)')
  .option('--expires-within <days>', 'Markets expiring within N days')
  .option('--category <cat>', 'Filter by category')
  .option('--keyword <kw>', 'Filter by keyword')
  .option('--no-report', 'Skip report generation')
  .action(async (options) => {
    const spinner = ora('Analyzing markets...').start();

    try {
      const config = getConfig();
      configureLogger({ 
        level: config.logging.level, 
        format: config.logging.format 
      });
      
      getDatabase(config.database.path);
      const runId = runsRepo.create('compare');
      
      logger.setContext({ run_id: runId, command: 'compare' });

      // Get all active markets
      const markets = marketsRepo.getActive();
      
      if (markets.length === 0) {
        spinner.fail('No markets in database. Run `dominion-pm scan` first.');
        process.exit(1);
      }

      spinner.text = `Processing ${markets.length} markets...`;

      // Build MarketWithPrices for each
      const marketsWithPrices: MarketWithPrices[] = [];
      
      for (const market of markets) {
        const snapshot = snapshotsRepo.getLatest(market.id);
        if (!snapshot) continue;

        marketsWithPrices.push({
          id: market.id,
          conditionId: market.condition_id,
          question: market.question,
          description: market.description,
          outcomes: market.outcomes,
          endDate: market.end_date ? new Date(market.end_date) : null,
          resolutionSource: market.resolution_source,
          category: market.category,
          tags: market.tags,
          active: market.active,
          prices: {
            marketId: market.id,
            yesPrice: snapshot.yes_price,
            noPrice: snapshot.no_price,
            spread: snapshot.spread || undefined,
            volume24h: snapshot.volume_24h || undefined,
            liquidity: snapshot.liquidity || undefined,
            timestamp: snapshot.timestamp,
          },
        });
      }

      // Apply filters
      const filtered = filterMarkets(marketsWithPrices, {
        minLiquidity: options.minLiquidity ? parseFloat(options.minLiquidity) : config.scoring.min_liquidity,
        minVolume: options.minVolume ? parseFloat(options.minVolume) : config.scoring.min_volume,
        maxSpread: options.maxSpread ? parseFloat(options.maxSpread) : config.scoring.max_spread,
        expiresWithinDays: options.expiresWithin ? parseInt(options.expiresWithin) : undefined,
        category: options.category,
        keyword: options.keyword,
      });

      spinner.text = `Analyzing ${filtered.length} filtered markets...`;

      // Run baseline estimation on all
      const estimator = new BaselineEstimator();
      const analyses: EdgeAnalysis[] = [];

      for (const market of filtered) {
        try {
          const estimation = await estimator.estimate(market);
          const analysis = calculateEdge(market, estimation);
          analyses.push(analysis);

          // Store analysis
          analysesRepo.create({
            run_id: runId,
            market_id: market.id,
            market_prob: analysis.marketProbability,
            model_prob: analysis.modelProbability,
            model_confidence: analysis.confidence,
            edge: analysis.edge,
            estimator_type: estimation.estimatorType,
            key_factors: estimation.keyFactors,
            assumptions: estimation.assumptions,
            failure_modes: estimation.failureModes,
            rationale: null,
            ev_yes: analysis.evYes,
            ev_no: analysis.evNo,
            recommendation: analysis.recommendation,
          });
        } catch (error) {
          logger.warn(`Failed to analyze market ${market.id}`, { error: (error as Error).message });
        }
      }

      runsRepo.complete(runId);
      spinner.succeed(`Analyzed ${analyses.length} markets`);

      // Rank by edge
      const ranked = rankByEdge(analyses);
      const topN = parseInt(options.top);
      const top = ranked.slice(0, topN);

      // Display results
      console.log();
      console.log(chalk.bold('='.repeat(80)));
      console.log(chalk.bold('TOP MARKETS BY EDGE'));
      console.log(chalk.bold('='.repeat(80)));
      console.log();

      console.log('Rank | Edge   | Dir | Conf | Market');
      console.log('-'.repeat(80));

      for (let i = 0; i < top.length; i++) {
        const a = top[i];
        const rank = String(i + 1).padStart(4);
        const edge = (a.edge * 100).toFixed(1).padStart(5) + '%';
        const dir = a.edgeDirection.padEnd(3);
        const conf = ((a.confidence * 100).toFixed(0) + '%').padStart(4);
        const question = a.question.slice(0, 40) + (a.question.length > 40 ? '...' : '');
        
        const edgeColor = a.edge > 0.05 ? chalk.green : a.edge < -0.05 ? chalk.red : chalk.yellow;
        
        console.log(`${rank} | ${edgeColor(edge)} | ${dir} | ${conf} | ${question}`);
      }

      console.log();
      console.log(`Showing top ${top.length} of ${analyses.length} analyzed markets`);
      console.log();
      console.log(chalk.yellow('='.repeat(80)));
      console.log(chalk.yellow('DISCLAIMER: This is analysis and simulation, NOT financial advice.'));
      console.log(chalk.yellow('Edge estimates are model-dependent and may be inaccurate.'));
      console.log(chalk.yellow('='.repeat(80)));

      // Generate report
      if (options.report !== false) {
        const report = generateReport({
          runId,
          command: 'compare',
          timestamp: Date.now(),
          analyses: top,
          summary: {
            total_markets: markets.length,
            filtered_markets: filtered.length,
            analyzed_markets: analyses.length,
            top_n: topN,
          },
        });
        console.log();
        console.log(`Reports: ${chalk.cyan(report.paths.join(', '))}`);
      }

      console.log();
      console.log(`Run ID: ${chalk.gray(runId)}`);

    } catch (error) {
      spinner.fail(`Compare failed: ${(error as Error).message}`);
      logger.error('Compare failed', { error: (error as Error).message });
      process.exit(1);
    }
  });

