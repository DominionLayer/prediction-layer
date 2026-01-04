/**
 * Report Command - Regenerate reports for a run
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig } from '../core/config/loader.js';
import { getDatabase, runsRepo, analysesRepo, simulationsRepo } from '../core/db/database.js';
import { regenerateReport } from '../core/reporting/reporter.js';
import type { EdgeAnalysis } from '../analysis/edge.js';
import type { SimulationResult } from '../simulation/simulator.js';

export const reportCommand = new Command('report')
  .description('Regenerate reports for a run')
  .argument('[run_id]', 'Run ID (or "latest" for most recent run)')
  .action(async (runId) => {
    try {
      const config = getConfig();
      getDatabase(config.database.path);

      // Get run
      let run;
      if (!runId || runId === 'latest') {
        run = runsRepo.getLatest();
        if (!run) {
          console.log(chalk.red('No runs found'));
          process.exit(1);
        }
      } else {
        const allRuns = runsRepo.getRecent(100);
        run = allRuns.find(r => r.id === runId || r.id.startsWith(runId));
        if (!run) {
          console.log(chalk.red(`Run not found: ${runId}`));
          process.exit(1);
        }
      }

      console.log(`Regenerating report for run ${chalk.cyan(run.id)}...`);

      // Get analyses and simulations for this run
      const analysesRaw = analysesRepo.getByRun(run.id);
      const simulationsRaw = simulationsRepo.getByRun(run.id);

      // Convert to EdgeAnalysis format
      const analyses: EdgeAnalysis[] = analysesRaw.map(a => ({
        marketId: a.market_id,
        question: '', // Would need to join with markets table
        marketProbability: a.market_prob,
        modelProbability: a.model_prob!,
        confidence: a.model_confidence!,
        edge: a.edge!,
        absoluteEdge: Math.abs(a.edge!),
        edgeDirection: (a.edge! > 0 ? 'YES' : 'NO') as 'YES' | 'NO',
        evYes: a.ev_yes!,
        evNo: a.ev_no!,
        recommendation: a.recommendation!,
        estimatorType: a.estimator_type,
        keyFactors: a.key_factors,
        assumptions: a.assumptions,
        failureModes: a.failure_modes,
      }));

      // Convert to SimulationResult format
      const simulations: SimulationResult[] = simulationsRaw.map(s => ({
        marketId: s.market_id,
        question: '', // Would need to join with markets table
        position: s.position,
        entryPrice: s.entry_price,
        positionSize: s.position_size,
        modelProbability: s.model_prob,
        confidenceBand: s.confidence_band,
        expectedValue: s.expected_value,
        expectedReturn: s.expected_value / (s.entry_price * s.position_size),
        bestCase: s.best_case,
        worstCase: s.worst_case,
        breakEvenProbability: s.break_even_prob,
        feeBps: s.fee_bps,
        slippageBps: s.slippage_bps,
        totalCosts: (s.fee_bps + s.slippage_bps) / 10000 * s.entry_price * s.position_size,
        scenarios: s.scenarios as any[],
        kellyFraction: 0,
        maxDrawdown: s.entry_price * s.position_size,
        timestamp: s.created_at,
      }));

      const report = regenerateReport(run, analyses, simulations);

      console.log();
      console.log(chalk.green('[OK] Report regenerated'));
      console.log();
      console.log('Files created:');
      for (const p of report.paths) {
        console.log(`  ${chalk.cyan(p)}`);
      }

    } catch (error) {
      console.log(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

