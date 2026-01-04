/**
 * Baseline Deterministic Estimator
 * 
 * Uses simple heuristics based on:
 * - Price momentum (comparing to neutral 0.5)
 * - Liquidity (higher liquidity = more trust in market price)
 * - Time to expiry (closer expiry = more certainty)
 * - Spread (wider spread = more uncertainty)
 */

import type { Estimator, EstimationResult } from './base.js';
import type { MarketWithPrices } from '../../polymarket/types.js';

export class BaselineEstimator implements Estimator {
  readonly name = 'baseline';
  readonly type = 'baseline' as const;

  async estimate(market: MarketWithPrices): Promise<EstimationResult> {
    const { prices, endDate } = market;
    const marketProb = prices.yesPrice;
    
    // Start with market price as base estimate
    let estimatedProb = marketProb;
    let confidence = 0.5; // Base confidence
    
    const keyFactors: string[] = [];
    const assumptions: string[] = [];
    const failureModes: string[] = [];

    // Liquidity adjustment
    const liquidity = prices.liquidity || 0;
    if (liquidity > 100000) {
      // High liquidity - trust market more
      confidence += 0.15;
      keyFactors.push('High market liquidity suggests efficient pricing');
    } else if (liquidity < 10000) {
      // Low liquidity - revert toward 0.5
      estimatedProb = marketProb * 0.8 + 0.5 * 0.2;
      confidence -= 0.1;
      keyFactors.push('Low liquidity may indicate inefficient pricing');
    }

    // Volume adjustment
    const volume = prices.volume24h || 0;
    if (volume > 50000) {
      confidence += 0.1;
      keyFactors.push('High trading volume indicates active price discovery');
    } else if (volume < 1000) {
      confidence -= 0.1;
      keyFactors.push('Low volume may indicate stale pricing');
    }

    // Spread adjustment
    const spread = prices.spread || 0;
    if (spread > 0.05) {
      // Wide spread - less efficient market
      confidence -= 0.1;
      keyFactors.push('Wide spread indicates uncertainty');
    } else if (spread < 0.02) {
      confidence += 0.05;
      keyFactors.push('Tight spread suggests efficient market');
    }

    // Time to expiry adjustment
    if (endDate) {
      const now = new Date();
      const daysToExpiry = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysToExpiry < 7) {
        // Close to expiry - price likely more accurate
        confidence += 0.15;
        keyFactors.push('Near expiry - market has more information');
      } else if (daysToExpiry > 180) {
        // Far from expiry - more uncertainty
        confidence -= 0.1;
        keyFactors.push('Long time horizon increases uncertainty');
      }
    }

    // Extreme price adjustment (revert to mean slightly)
    if (marketProb > 0.9 || marketProb < 0.1) {
      const reversion = 0.05;
      if (marketProb > 0.9) {
        estimatedProb = marketProb - reversion;
        keyFactors.push('Extreme high probability - slight mean reversion applied');
      } else {
        estimatedProb = marketProb + reversion;
        keyFactors.push('Extreme low probability - slight mean reversion applied');
      }
    }

    // Clamp values
    estimatedProb = Math.max(0.01, Math.min(0.99, estimatedProb));
    confidence = Math.max(0.1, Math.min(0.9, confidence));

    // Standard assumptions for baseline
    assumptions.push(
      'Market price reflects aggregate participant beliefs',
      'Liquidity correlates with pricing efficiency',
      'No major news events pending'
    );

    failureModes.push(
      'Does not account for specific market context',
      'May miss information reflected in price',
      'Simple heuristics may not capture complex dynamics'
    );

    return {
      estimatedProbability: estimatedProb,
      confidence,
      keyFactors,
      assumptions,
      failureModes,
      estimatorType: 'baseline',
    };
  }
}

