/**
 * Base Probability Estimator Interface
 */

import type { MarketWithPrices } from '../../polymarket/types.js';

export interface EstimationResult {
  estimatedProbability: number;
  confidence: number;
  keyFactors: string[];
  assumptions: string[];
  failureModes: string[];
  estimatorType: 'llm' | 'baseline';
  rationale?: string;
}

export interface Estimator {
  readonly name: string;
  readonly type: 'llm' | 'baseline';
  
  estimate(market: MarketWithPrices): Promise<EstimationResult>;
}

