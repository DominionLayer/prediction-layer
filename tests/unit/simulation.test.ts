/**
 * Simulation Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulate } from '../../src/simulation/simulator.js';
import type { MarketWithPrices } from '../../src/polymarket/types.js';
import type { EdgeAnalysis } from '../../src/analysis/edge.js';
import { clearConfigCache, loadConfig } from '../../src/core/config/loader.js';

describe('Simulation', () => {
  beforeAll(() => {
    loadConfig();
  });

  afterAll(() => {
    clearConfigCache();
  });

  const createMockMarket = (yesPrice: number): MarketWithPrices => ({
    id: 'test-market',
    conditionId: 'test-condition',
    question: 'Test market?',
    description: null,
    outcomes: ['Yes', 'No'],
    endDate: null,
    resolutionSource: null,
    category: null,
    tags: [],
    active: true,
    prices: {
      marketId: 'test-market',
      yesPrice,
      noPrice: 1 - yesPrice,
      timestamp: Date.now(),
    },
  });

  const createAnalysis = (marketProb: number, modelProb: number): EdgeAnalysis => ({
    marketId: 'test-market',
    question: 'Test market?',
    marketProbability: marketProb,
    modelProbability: modelProb,
    confidence: 0.7,
    edge: modelProb - marketProb,
    absoluteEdge: Math.abs(modelProb - marketProb),
    edgeDirection: modelProb > marketProb ? 'YES' : 'NO',
    evYes: 0,
    evNo: 0,
    recommendation: 'Test',
    estimatorType: 'baseline',
    keyFactors: [],
    assumptions: [],
    failureModes: [],
  });

  it('should calculate positive EV for favorable position', () => {
    const market = createMockMarket(0.4);
    const analysis = createAnalysis(0.4, 0.6); // Model thinks 60%, market says 40%

    const result = simulate(market, analysis, {
      position: 'YES',
      positionSize: 10,
    });

    expect(result.expectedValue).toBeGreaterThan(0);
    expect(result.position).toBe('YES');
  });

  it('should calculate break-even probability correctly', () => {
    const market = createMockMarket(0.5);
    const analysis = createAnalysis(0.5, 0.5);

    const result = simulate(market, analysis, {
      position: 'YES',
      positionSize: 10,
      feeBps: 0,
      slippageBps: 0,
    });

    // With no fees and 50% price, break-even should be at 50%
    expect(result.breakEvenProbability).toBeCloseTo(0.5, 1);
  });

  it('should include scenarios', () => {
    const market = createMockMarket(0.5);
    const analysis = createAnalysis(0.5, 0.6);

    const result = simulate(market, analysis);

    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.scenarios.some(s => s.name === 'Win')).toBe(true);
    expect(result.scenarios.some(s => s.name === 'Loss')).toBe(true);
  });

  it('should calculate max drawdown as full position', () => {
    const market = createMockMarket(0.6);
    const analysis = createAnalysis(0.6, 0.7);

    const result = simulate(market, analysis, {
      positionSize: 10,
    });

    // Max drawdown = entry_price * position_size
    expect(result.maxDrawdown).toBeCloseTo(0.6 * 10, 2);
  });

  it('should respect position option', () => {
    const market = createMockMarket(0.6);
    const analysis = createAnalysis(0.6, 0.7); // Edge is YES

    const resultNo = simulate(market, analysis, {
      position: 'NO',
    });

    expect(resultNo.position).toBe('NO');
    expect(resultNo.entryPrice).toBeCloseTo(0.4, 2); // NO price
  });

  it('should apply fees correctly', () => {
    const market = createMockMarket(0.5);
    const analysis = createAnalysis(0.5, 0.6);

    const withFees = simulate(market, analysis, {
      feeBps: 100,
      slippageBps: 50,
    });

    const withoutFees = simulate(market, analysis, {
      feeBps: 0,
      slippageBps: 0,
    });

    // EV should be lower with fees
    expect(withFees.expectedValue).toBeLessThan(withoutFees.expectedValue);
  });
});

