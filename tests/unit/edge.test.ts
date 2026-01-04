/**
 * Edge Calculation Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateEdge, filterMarkets, rankByEdge } from '../../src/analysis/edge.js';
import type { MarketWithPrices } from '../../src/polymarket/types.js';
import type { EstimationResult } from '../../src/analysis/estimators/base.js';
import { clearConfigCache, loadConfig } from '../../src/core/config/loader.js';

describe('Edge Calculation', () => {
  beforeAll(() => {
    // Ensure config is loaded with defaults
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

  const createEstimation = (prob: number, confidence: number = 0.7): EstimationResult => ({
    estimatedProbability: prob,
    confidence,
    keyFactors: ['Factor 1'],
    assumptions: ['Assumption 1'],
    failureModes: ['Failure 1'],
    estimatorType: 'baseline',
  });

  it('should calculate positive edge when model > market', () => {
    const market = createMockMarket(0.5);
    const estimation = createEstimation(0.65);
    
    const result = calculateEdge(market, estimation);
    
    expect(result.edge).toBeCloseTo(0.15, 2);
    expect(result.edgeDirection).toBe('YES');
    expect(result.absoluteEdge).toBeCloseTo(0.15, 2);
  });

  it('should calculate negative edge when model < market', () => {
    const market = createMockMarket(0.7);
    const estimation = createEstimation(0.55);
    
    const result = calculateEdge(market, estimation);
    
    expect(result.edge).toBeCloseTo(-0.15, 2);
    expect(result.edgeDirection).toBe('NO');
  });

  it('should be neutral for small edge', () => {
    const market = createMockMarket(0.5);
    const estimation = createEstimation(0.51);
    
    const result = calculateEdge(market, estimation);
    
    expect(result.edgeDirection).toBe('NEUTRAL');
  });

  it('should calculate expected values', () => {
    const market = createMockMarket(0.5);
    const estimation = createEstimation(0.6);
    
    const result = calculateEdge(market, estimation);
    
    // With 60% model prob and 50% market price:
    // EV_YES = 0.6 * 0.5 - 0.4 * 0.5 = 0.3 - 0.2 = 0.1 (before fees)
    expect(result.evYes).toBeGreaterThan(0);
    expect(result.evNo).toBeLessThan(result.evYes);
  });

  it('should include disclaimer in recommendation', () => {
    const market = createMockMarket(0.5);
    const estimation = createEstimation(0.7);
    
    const result = calculateEdge(market, estimation);
    
    expect(result.recommendation.toLowerCase()).toContain('not financial advice');
  });
});

describe('Filter Markets', () => {
  const markets: MarketWithPrices[] = [
    {
      id: 'm1',
      conditionId: 'c1',
      question: 'Bitcoin price prediction',
      description: 'Crypto market',
      outcomes: ['Yes', 'No'],
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      resolutionSource: null,
      category: 'Crypto',
      tags: [],
      active: true,
      prices: {
        marketId: 'm1',
        yesPrice: 0.6,
        noPrice: 0.4,
        liquidity: 50000,
        volume24h: 5000,
        spread: 0.02,
        timestamp: Date.now(),
      },
    },
    {
      id: 'm2',
      conditionId: 'c2',
      question: 'Election outcome',
      description: 'Politics market',
      outcomes: ['Yes', 'No'],
      endDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      resolutionSource: null,
      category: 'Politics',
      tags: [],
      active: true,
      prices: {
        marketId: 'm2',
        yesPrice: 0.5,
        noPrice: 0.5,
        liquidity: 200000,
        volume24h: 20000,
        spread: 0.01,
        timestamp: Date.now(),
      },
    },
  ];

  it('should filter by minimum liquidity', () => {
    const filtered = filterMarkets(markets, { minLiquidity: 100000 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('m2');
  });

  it('should filter by minimum volume', () => {
    const filtered = filterMarkets(markets, { minVolume: 10000 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('m2');
  });

  it('should filter by category', () => {
    const filtered = filterMarkets(markets, { category: 'Crypto' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('m1');
  });

  it('should filter by keyword', () => {
    const filtered = filterMarkets(markets, { keyword: 'bitcoin' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('m1');
  });

  it('should filter by expiry', () => {
    const filtered = filterMarkets(markets, { expiresWithinDays: 30 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('m1');
  });
});

describe('Rank By Edge', () => {
  it('should rank by absolute edge weighted by confidence', () => {
    const analyses = [
      { absoluteEdge: 0.10, confidence: 0.5, edge: 0.10 } as any,
      { absoluteEdge: 0.05, confidence: 0.9, edge: 0.05 } as any,
      { absoluteEdge: 0.15, confidence: 0.3, edge: 0.15 } as any,
    ];

    const ranked = rankByEdge(analyses);
    
    // 0.10 * 0.5 = 0.05
    // 0.05 * 0.9 = 0.045
    // 0.15 * 0.3 = 0.045
    // So first should be the one with 0.10 edge and 0.5 confidence
    expect(ranked[0].absoluteEdge).toBe(0.10);
  });
});

