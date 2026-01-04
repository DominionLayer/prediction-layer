/**
 * LLM-based Probability Estimator
 */

import { z } from 'zod';
import type { Estimator, EstimationResult } from './base.js';
import type { MarketWithPrices } from '../../polymarket/types.js';
import { getDefaultProvider } from '../../core/providers/index.js';
import { SYSTEM_PROMPT, createEstimationPrompt } from '../prompts.js';
import { logger } from '../../core/logging/logger.js';

const LLMResponseSchema = z.object({
  estimated_probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  key_factors: z.array(z.string()),
  assumptions: z.array(z.string()),
  failure_modes: z.array(z.string()),
});

export class LLMEstimator implements Estimator {
  readonly name = 'llm';
  readonly type = 'llm' as const;

  async estimate(market: MarketWithPrices): Promise<EstimationResult> {
    const provider = getDefaultProvider();
    
    logger.debug(`Running LLM estimation for market ${market.id}`);

    try {
      const result = await provider.completeStructured(
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: createEstimationPrompt(market) },
          ],
          temperature: 0.2,
          responseFormat: 'json',
        },
        LLMResponseSchema
      );

      return {
        estimatedProbability: result.data.estimated_probability,
        confidence: result.data.confidence,
        keyFactors: result.data.key_factors,
        assumptions: result.data.assumptions,
        failureModes: result.data.failure_modes,
        estimatorType: 'llm',
        rationale: result.raw,
      };
    } catch (error) {
      logger.error(`LLM estimation failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

