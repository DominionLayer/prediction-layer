/**
 * LLM Prompts for Probability Estimation
 */

import type { MarketWithPrices } from '../polymarket/types.js';

export const SYSTEM_PROMPT = `You are an expert probability analyst specializing in prediction markets. Your task is to estimate the probability of events based on available information.

IMPORTANT GUIDELINES:
- Be calibrated: your probability estimates should match real-world frequencies
- Consider base rates and reference classes
- Account for uncertainty explicitly
- Never claim certainty (0% or 100%) unless logically guaranteed
- Identify key factors that could shift the probability
- State assumptions clearly
- Consider failure modes of your analysis

You must respond with valid JSON only.`;

export function createEstimationPrompt(market: MarketWithPrices): string {
  const endDateStr = market.endDate 
    ? `Resolution date: ${market.endDate.toISOString().split('T')[0]}`
    : 'Resolution date: Not specified';
  
  const currentPrice = market.prices.yesPrice;
  
  return `Analyze this prediction market and estimate the true probability of the YES outcome.

MARKET INFORMATION:
Question: ${market.question}
${market.description ? `Description: ${market.description}` : ''}
${endDateStr}
${market.resolutionSource ? `Resolution source: ${market.resolutionSource}` : ''}
Current market price (YES): ${(currentPrice * 100).toFixed(1)}%

CURRENT MARKET DATA:
- YES price: $${currentPrice.toFixed(3)} (implies ${(currentPrice * 100).toFixed(1)}% probability)
- NO price: $${market.prices.noPrice.toFixed(3)}
- 24h Volume: $${market.prices.volume24h?.toLocaleString() || 'N/A'}
- Liquidity: $${market.prices.liquidity?.toLocaleString() || 'N/A'}

Provide your analysis in the following JSON format:
{
  "estimated_probability": <number between 0 and 1>,
  "confidence": <number between 0 and 1, how confident you are in your estimate>,
  "key_factors": [<list of 3-5 key factors affecting the probability>],
  "assumptions": [<list of key assumptions in your analysis>],
  "failure_modes": [<list of ways your analysis could be wrong>]
}

Remember:
- This is analysis and simulation, NOT financial advice
- Express genuine uncertainty through the confidence score
- Consider what information you lack`;
}

export function createComparisonPrompt(market: MarketWithPrices, modelProb: number): string {
  const marketProb = market.prices.yesPrice;
  const edge = modelProb - marketProb;
  
  return `Compare the market probability with the model estimate for this prediction market.

MARKET: ${market.question}

PROBABILITIES:
- Market implied: ${(marketProb * 100).toFixed(1)}%
- Model estimate: ${(modelProb * 100).toFixed(1)}%
- Edge (model - market): ${(edge * 100).toFixed(1)}%

Provide a brief assessment in JSON format:
{
  "edge_significance": "<low|medium|high>",
  "potential_explanation": "<brief explanation of why market and model might differ>",
  "confidence_in_edge": <number between 0 and 1>,
  "recommendation": "<brief action recommendation, NOT financial advice>"
}`;
}

