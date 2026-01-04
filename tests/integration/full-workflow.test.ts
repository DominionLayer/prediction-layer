/**
 * Integration Test - Full Workflow with Stub Provider and Mock API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clearConfigCache, loadConfig } from '../../src/core/config/loader.js';
import { getDatabase, closeDatabase, marketsRepo, snapshotsRepo, analysesRepo, simulationsRepo, runsRepo } from '../../src/core/db/database.js';
import { MockPolymarketClient } from '../../src/polymarket/client.js';
import { StubProvider } from '../../src/core/providers/stub.js';
import { BaselineEstimator, LLMEstimator } from '../../src/analysis/estimators/index.js';
import { calculateEdge } from '../../src/analysis/edge.js';
import { simulate } from '../../src/simulation/simulator.js';
import { generateReport } from '../../src/core/reporting/reporter.js';
import type { MarketWithPrices } from '../../src/polymarket/types.js';

describe('Full Workflow Integration', () => {
  const testDbPath = './test-data/integration-test.db';
  const testReportsDir = './test-reports';

  beforeAll(() => {
    // Clean up any existing test data
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testReportsDir)) {
      fs.rmSync(testReportsDir, { recursive: true });
    }

    // Create directories
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    fs.mkdirSync(testReportsDir, { recursive: true });

    // Load config
    loadConfig();
  });

  afterAll(() => {
    closeDatabase();
    clearConfigCache();
    
    // Clean up test data
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(path.dirname(testDbPath))) {
      fs.rmdirSync(path.dirname(testDbPath));
    }
    if (fs.existsSync(testReportsDir)) {
      fs.rmSync(testReportsDir, { recursive: true });
    }
  });

  it('should complete full workflow: scan -> analyze -> simulate -> report', async () => {
    // Initialize database
    const db = getDatabase(testDbPath);
    expect(db).toBeDefined();

    // Step 1: Scan markets using mock client
    const client = new MockPolymarketClient();
    const markets = await client.getActiveMarkets();
    
    expect(markets.length).toBeGreaterThan(0);
    
    // Store markets
    for (const market of markets) {
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

      snapshotsRepo.create({
        market_id: market.id,
        yes_price: market.prices.yesPrice,
        no_price: market.prices.noPrice,
        yes_bid: null,
        yes_ask: null,
        no_bid: null,
        no_ask: null,
        spread: market.prices.spread || null,
        volume_24h: market.prices.volume24h || null,
        liquidity: market.prices.liquidity || null,
        open_interest: null,
        raw_data: null,
      });
    }

    // Verify storage
    const storedMarkets = marketsRepo.getActive();
    expect(storedMarkets.length).toBe(markets.length);

    // Step 2: Analyze a market
    const runId = runsRepo.create('integration-test');
    const targetMarket = markets[0];
    
    // Run baseline estimation
    const baselineEstimator = new BaselineEstimator();
    const baselineResult = await baselineEstimator.estimate(targetMarket);
    
    expect(baselineResult.estimatedProbability).toBeGreaterThan(0);
    expect(baselineResult.estimatedProbability).toBeLessThan(1);
    expect(baselineResult.estimatorType).toBe('baseline');

    // Calculate edge
    const edgeAnalysis = calculateEdge(targetMarket, baselineResult);
    
    expect(edgeAnalysis.marketId).toBe(targetMarket.id);
    expect(typeof edgeAnalysis.edge).toBe('number');
    expect(['YES', 'NO', 'NEUTRAL']).toContain(edgeAnalysis.edgeDirection);

    // Store analysis
    analysesRepo.create({
      run_id: runId,
      market_id: targetMarket.id,
      market_prob: edgeAnalysis.marketProbability,
      model_prob: edgeAnalysis.modelProbability,
      model_confidence: edgeAnalysis.confidence,
      edge: edgeAnalysis.edge,
      estimator_type: baselineResult.estimatorType,
      key_factors: baselineResult.keyFactors,
      assumptions: baselineResult.assumptions,
      failure_modes: baselineResult.failureModes,
      rationale: null,
      ev_yes: edgeAnalysis.evYes,
      ev_no: edgeAnalysis.evNo,
      recommendation: edgeAnalysis.recommendation,
    });

    // Verify analysis storage
    const storedAnalyses = analysesRepo.getByMarket(targetMarket.id);
    expect(storedAnalyses.length).toBe(1);

    // Step 3: Simulate a position
    const simulation = simulate(targetMarket, edgeAnalysis, {
      position: 'YES',
      positionSize: 10,
    });

    expect(simulation.marketId).toBe(targetMarket.id);
    expect(simulation.position).toBe('YES');
    expect(typeof simulation.expectedValue).toBe('number');
    expect(simulation.scenarios.length).toBeGreaterThan(0);

    // Store simulation
    simulationsRepo.create({
      run_id: runId,
      market_id: targetMarket.id,
      position: simulation.position,
      entry_price: simulation.entryPrice,
      position_size: simulation.positionSize,
      model_prob: simulation.modelProbability,
      confidence_band: simulation.confidenceBand,
      expected_value: simulation.expectedValue,
      best_case: simulation.bestCase,
      worst_case: simulation.worstCase,
      break_even_prob: simulation.breakEvenProbability,
      fee_bps: simulation.feeBps,
      slippage_bps: simulation.slippageBps,
      scenarios: simulation.scenarios,
    });

    // Verify simulation storage
    const storedSimulations = simulationsRepo.getByMarket(targetMarket.id);
    expect(storedSimulations.length).toBe(1);

    // Complete run
    runsRepo.complete(runId);
    
    const completedRun = runsRepo.getById(runId);
    expect(completedRun?.status).toBe('completed');

    // Step 4: Generate report
    const report = generateReport({
      runId,
      command: 'integration-test',
      timestamp: Date.now(),
      analyses: [edgeAnalysis],
      simulations: [simulation],
      summary: {
        markets_scanned: markets.length,
        markets_analyzed: 1,
        simulations_run: 1,
      },
    });

    expect(report.json).toBeTruthy();
    expect(report.markdown).toBeTruthy();
    expect(report.paths.length).toBe(2);
    
    // Verify markdown contains disclaimer
    expect(report.markdown).toContain('DISCLAIMER');
    expect(report.markdown).toContain('NOT');

    console.log('Integration test completed successfully!');
    console.log(`  Markets scanned: ${markets.length}`);
    console.log(`  Analysis edge: ${(edgeAnalysis.edge * 100).toFixed(1)}%`);
    console.log(`  Simulation EV: $${simulation.expectedValue.toFixed(2)}`);
  });

  it('should work with LLM estimator using stub provider', async () => {
    const client = new MockPolymarketClient();
    const markets = await client.getActiveMarkets();
    const targetMarket = markets[0];

    // LLM estimator uses the default provider which should be stub
    const llmEstimator = new LLMEstimator();
    const result = await llmEstimator.estimate(targetMarket);

    expect(result.estimatedProbability).toBeGreaterThan(0);
    expect(result.estimatedProbability).toBeLessThan(1);
    expect(result.estimatorType).toBe('llm');
    expect(result.keyFactors.length).toBeGreaterThan(0);
  });
});

