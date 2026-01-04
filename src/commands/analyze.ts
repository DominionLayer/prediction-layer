/**
 * Analyze Command - Run probability estimation on a market
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, analysesRepo, runsRepo } from '../core/db/database.js';
import { LLMEstimator, BaselineEstimator } from '../analysis/estimators/index.js';
import { calculateEdge, type EdgeAnalysis } from '../analysis/edge.js';
import { generateReport } from '../core/reporting/reporter.js';
import { logger, configureLogger } from '../core/logging/logger.js';
import type { MarketWithPrices } from '../polymarket/types.js';

export const analyzeCommand = new Command('analyze')
  .description('Analyze a market and estimate probabilities')
  .argument('<market_id>', 'Market ID')
  .option('--estimator <type>', 'Estimator type (llm, baseline)', 'llm')
  .option('--no-report', 'Skip report generation')
  .action(async (marketId, options) => {
    const spinner = ora('Analyzing market...').start();

    try {
      const config = getConfig();
      configureLogger({ 
        level: config.logging.level, 
        format: config.logging.format 
      });
      
      getDatabase(config.database.path);
      const runId = runsRepo.create('analyze');
      
      logger.setContext({ run_id: runId, command: 'analyze', market_id: marketId });

      // Find market
      const allMarkets = marketsRepo.getAll();
      const market = allMarkets.find(m => m.id === marketId || m.id.startsWith(marketId));

      if (!market) {
        spinner.fail(`Market not found: ${marketId}`);
        console.log('Run `dominion-pm scan` to fetch markets first.');
        process.exit(1);
      }

      const snapshot = snapshotsRepo.getLatest(market.id);
      if (!snapshot) {
        spinner.fail('No price data available for this market');
        process.exit(1);
      }

      // Build MarketWithPrices
      const marketWithPrices: MarketWithPrices = {
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
          yesBid: snapshot.yes_bid || undefined,
          yesAsk: snapshot.yes_ask || undefined,
          noBid: snapshot.no_bid || undefined,
          noAsk: snapshot.no_ask || undefined,
          spread: snapshot.spread || undefined,
          volume24h: snapshot.volume_24h || undefined,
          liquidity: snapshot.liquidity || undefined,
          timestamp: snapshot.timestamp,
        },
      };

      // Run estimation
      spinner.text = `Running ${options.estimator} estimator...`;
      
      const estimator = options.estimator === 'baseline' 
        ? new BaselineEstimator()
        : new LLMEstimator();

      const estimation = await estimator.estimate(marketWithPrices);
      const analysis = calculateEdge(marketWithPrices, estimation);

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
        rationale: estimation.rationale || null,
        ev_yes: analysis.evYes,
        ev_no: analysis.evNo,
        recommendation: analysis.recommendation,
      });

      runsRepo.complete(runId);
      spinner.succeed('Analysis complete');

      // Display results
      displayAnalysis(analysis);

      // Generate report
      if (options.report !== false) {
        const report = generateReport({
          runId,
          command: 'analyze',
          timestamp: Date.now(),
          analyses: [analysis],
        });
        console.log();
        console.log(`Reports: ${chalk.cyan(report.paths.join(', '))}`);
      }

      console.log();
      console.log(`Run ID: ${chalk.gray(runId)}`);

    } catch (error) {
      spinner.fail(`Analysis failed: ${(error as Error).message}`);
      logger.error('Analysis failed', { error: (error as Error).message });
      process.exit(1);
    }
  });

function displayAnalysis(analysis: EdgeAnalysis): void {
  console.log();
  console.log(chalk.bold('='.repeat(70)));
  console.log(chalk.bold('ANALYSIS RESULTS'));
  console.log(chalk.bold('='.repeat(70)));
  console.log();
  console.log(chalk.bold(analysis.question));
  console.log();
  
  console.log(chalk.bold('Probabilities'));
  console.log('-'.repeat(40));
  console.log(`Market Implied:   ${chalk.yellow((analysis.marketProbability * 100).toFixed(1) + '%')}`);
  console.log(`Model Estimate:   ${chalk.cyan((analysis.modelProbability * 100).toFixed(1) + '%')}`);
  console.log(`Confidence:       ${(analysis.confidence * 100).toFixed(0)}%`);
  console.log();

  console.log(chalk.bold('Edge Analysis'));
  console.log('-'.repeat(40));
  const edgeColor = analysis.edge > 0 ? chalk.green : analysis.edge < 0 ? chalk.red : chalk.gray;
  console.log(`Edge:             ${edgeColor((analysis.edge * 100).toFixed(1) + '%')}`);
  console.log(`Direction:        ${analysis.edgeDirection}`);
  console.log(`EV (YES):         ${(analysis.evYes * 100).toFixed(2)}%`);
  console.log(`EV (NO):          ${(analysis.evNo * 100).toFixed(2)}%`);
  console.log();

  console.log(chalk.bold('Key Factors'));
  console.log('-'.repeat(40));
  for (const factor of analysis.keyFactors) {
    console.log(`  - ${factor}`);
  }
  console.log();

  if (analysis.assumptions.length > 0) {
    console.log(chalk.bold('Assumptions'));
    console.log('-'.repeat(40));
    for (const assumption of analysis.assumptions) {
      console.log(`  - ${assumption}`);
    }
    console.log();
  }

  if (analysis.failureModes.length > 0) {
    console.log(chalk.bold('Failure Modes'));
    console.log('-'.repeat(40));
    for (const mode of analysis.failureModes) {
      console.log(`  - ${mode}`);
    }
    console.log();
  }

  console.log(chalk.bold('Recommendation'));
  console.log('-'.repeat(40));
  console.log(analysis.recommendation);
  console.log();
  console.log(chalk.yellow('='.repeat(70)));
  console.log(chalk.yellow('DISCLAIMER: This is analysis and simulation, NOT financial advice.'));
  console.log(chalk.yellow('Never invest more than you can afford to lose.'));
  console.log(chalk.yellow('='.repeat(70)));
}

