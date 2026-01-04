/**
 * Simulate Command - Run EV simulation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, marketsRepo, snapshotsRepo, analysesRepo, simulationsRepo, runsRepo } from '../core/db/database.js';
import { BaselineEstimator } from '../analysis/estimators/index.js';
import { calculateEdge } from '../analysis/edge.js';
import { simulate, formatSimulationText } from '../simulation/simulator.js';
import { generateReport } from '../core/reporting/reporter.js';
import { logger, configureLogger } from '../core/logging/logger.js';
import type { MarketWithPrices } from '../polymarket/types.js';

export const simulateCommand = new Command('simulate')
  .description('Simulate a position and calculate expected value')
  .argument('<market_id>', 'Market ID')
  .option('-p, --position <pos>', 'Position (YES or NO)')
  .option('-s, --size <n>', 'Position size in contracts')
  .option('-e, --entry <price>', 'Entry price (default: current market price)')
  .option('--fee <bps>', 'Trading fee in basis points')
  .option('--slippage <bps>', 'Expected slippage in basis points')
  .option('--no-report', 'Skip report generation')
  .action(async (marketId, options) => {
    const spinner = ora('Running simulation...').start();

    try {
      const config = getConfig();
      configureLogger({ 
        level: config.logging.level, 
        format: config.logging.format 
      });
      
      getDatabase(config.database.path);
      const runId = runsRepo.create('simulate');
      
      logger.setContext({ run_id: runId, command: 'simulate', market_id: marketId });

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
          spread: snapshot.spread || undefined,
          volume24h: snapshot.volume_24h || undefined,
          liquidity: snapshot.liquidity || undefined,
          timestamp: snapshot.timestamp,
        },
      };

      // Get or create analysis
      spinner.text = 'Getting probability estimate...';
      
      let analysis = analysesRepo.getByMarket(market.id)[0];
      
      if (!analysis) {
        // Run baseline estimation
        const estimator = new BaselineEstimator();
        const estimation = await estimator.estimate(marketWithPrices);
        const edgeAnalysis = calculateEdge(marketWithPrices, estimation);
        
        // Store analysis
        analysesRepo.create({
          run_id: runId,
          market_id: market.id,
          market_prob: edgeAnalysis.marketProbability,
          model_prob: edgeAnalysis.modelProbability,
          model_confidence: edgeAnalysis.confidence,
          edge: edgeAnalysis.edge,
          estimator_type: estimation.estimatorType,
          key_factors: estimation.keyFactors,
          assumptions: estimation.assumptions,
          failure_modes: estimation.failureModes,
          rationale: null,
          ev_yes: edgeAnalysis.evYes,
          ev_no: edgeAnalysis.evNo,
          recommendation: edgeAnalysis.recommendation,
        });
        
        analysis = analysesRepo.getByMarket(market.id)[0];
      }

      // Run simulation
      spinner.text = 'Running simulation...';
      
      const edgeAnalysis = {
        marketId: market.id,
        question: market.question,
        marketProbability: analysis.market_prob,
        modelProbability: analysis.model_prob!,
        confidence: analysis.model_confidence!,
        edge: analysis.edge!,
        absoluteEdge: Math.abs(analysis.edge!),
        edgeDirection: (analysis.edge! > 0 ? 'YES' : 'NO') as 'YES' | 'NO',
        evYes: analysis.ev_yes!,
        evNo: analysis.ev_no!,
        recommendation: analysis.recommendation!,
        estimatorType: analysis.estimator_type,
        keyFactors: analysis.key_factors,
        assumptions: analysis.assumptions,
        failureModes: analysis.failure_modes,
      };

      const simResult = simulate(marketWithPrices, edgeAnalysis, {
        position: options.position?.toUpperCase() as 'YES' | 'NO' | undefined,
        positionSize: options.size ? parseFloat(options.size) : undefined,
        entryPrice: options.entry ? parseFloat(options.entry) : undefined,
        feeBps: options.fee ? parseInt(options.fee) : undefined,
        slippageBps: options.slippage ? parseInt(options.slippage) : undefined,
      });

      // Store simulation
      simulationsRepo.create({
        run_id: runId,
        market_id: market.id,
        position: simResult.position,
        entry_price: simResult.entryPrice,
        position_size: simResult.positionSize,
        model_prob: simResult.modelProbability,
        confidence_band: simResult.confidenceBand,
        expected_value: simResult.expectedValue,
        best_case: simResult.bestCase,
        worst_case: simResult.worstCase,
        break_even_prob: simResult.breakEvenProbability,
        fee_bps: simResult.feeBps,
        slippage_bps: simResult.slippageBps,
        scenarios: simResult.scenarios,
      });

      runsRepo.complete(runId);
      spinner.succeed('Simulation complete');

      // Display results
      console.log();
      console.log(formatSimulationText(simResult));

      // Generate report
      if (options.report !== false) {
        const report = generateReport({
          runId,
          command: 'simulate',
          timestamp: Date.now(),
          simulations: [simResult],
          analyses: [edgeAnalysis],
        });
        console.log();
        console.log(`Reports: ${chalk.cyan(report.paths.join(', '))}`);
      }

      console.log();
      console.log(`Run ID: ${chalk.gray(runId)}`);

    } catch (error) {
      spinner.fail(`Simulation failed: ${(error as Error).message}`);
      logger.error('Simulation failed', { error: (error as Error).message });
      process.exit(1);
    }
  });

