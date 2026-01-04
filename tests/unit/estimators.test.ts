/**
 * Estimator Tests
 */

import { describe, it, expect } from 'vitest';
import { BaselineEstimator } from '../../src/analysis/estimators/baseline-estimator.js';
import type { MarketWithPrices } from '../../src/polymarket/types.js';

describe('BaselineEstimator', () => {
  const estimator = new BaselineEstimator();

  const createMockMarket = (overrides: Partial<MarketWithPrices> = {}): MarketWithPrices => ({
    id: 'test-market',
    conditionId: 'test-condition',
    question: 'Will test pass?',
    description: 'A test market',
    outcomes: ['Yes', 'No'],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    resolutionSource: 'Test',
    category: 'Test',
    tags: [],
    active: true,
    prices: {
      marketId: 'test-market',
      yesPrice: 0.6,
      noPrice: 0.4,
      spread: 0.02,
      volume24h: 10000,
      liquidity: 50000,
      timestamp: Date.now(),
    },
    ...overrides,
  });

  it('should return estimate close to market price for liquid markets', async () => {
    const market = createMockMarket({
      prices: {
        marketId: 'test',
        yesPrice: 0.6,
        noPrice: 0.4,
        spread: 0.02,
        volume24h: 100000,
        liquidity: 200000,
        timestamp: Date.now(),
      },
    });

    const result = await estimator.estimate(market);
    
    expect(result.estimatedProbability).toBeGreaterThan(0);
    expect(result.estimatedProbability).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.estimatorType).toBe('baseline');
    expect(result.keyFactors.length).toBeGreaterThan(0);
  });

  it('should revert toward 0.5 for low liquidity markets', async () => {
    const market = createMockMarket({
      prices: {
        marketId: 'test',
        yesPrice: 0.8,
        noPrice: 0.2,
        liquidity: 1000, // Very low
        timestamp: Date.now(),
      },
    });

    const result = await estimator.estimate(market);
    
    // Should revert toward 0.5, so estimate should be less than 0.8
    expect(result.estimatedProbability).toBeLessThan(0.8);
  });

  it('should apply mean reversion to extreme prices', async () => {
    const market = createMockMarket({
      prices: {
        marketId: 'test',
        yesPrice: 0.95,
        noPrice: 0.05,
        liquidity: 100000,
        timestamp: Date.now(),
      },
    });

    const result = await estimator.estimate(market);
    
    // Should apply mean reversion
    expect(result.estimatedProbability).toBeLessThan(0.95);
    expect(result.keyFactors.some(f => f.includes('mean reversion'))).toBe(true);
  });

  it('should have higher confidence near expiry', async () => {
    const nearExpiry = createMockMarket({
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      prices: {
        marketId: 'test',
        yesPrice: 0.7,
        noPrice: 0.3,
        liquidity: 50000,
        timestamp: Date.now(),
      },
    });

    const farExpiry = createMockMarket({
      endDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000), // 200 days
      prices: {
        marketId: 'test',
        yesPrice: 0.7,
        noPrice: 0.3,
        liquidity: 50000,
        timestamp: Date.now(),
      },
    });

    const nearResult = await estimator.estimate(nearExpiry);
    const farResult = await estimator.estimate(farExpiry);
    
    expect(nearResult.confidence).toBeGreaterThan(farResult.confidence);
  });

  it('should include assumptions and failure modes', async () => {
    const market = createMockMarket();
    const result = await estimator.estimate(market);
    
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.failureModes.length).toBeGreaterThan(0);
  });
});

