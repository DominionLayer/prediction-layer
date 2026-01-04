/**
 * Edge Calculation Module
 * 
 * Edge = Model Probability - Market Probability
 * EV = Expected Value calculation for YES/NO positions
 */

import type { MarketWithPrices } from '../polymarket/types.js';
import type { EstimationResult } from './estimators/base.js';
import { getConfig } from '../core/config/loader.js';

export interface EdgeAnalysis {
  marketId: string;
  question: string;
  
  // Probabilities
  marketProbability: number;
  modelProbability: number;
  confidence: number;
  
  // Edge
  edge: number;  // model - market
  absoluteEdge: number;
  edgeDirection: 'YES' | 'NO' | 'NEUTRAL';
  
  // Expected Values (per $1 risked)
  evYes: number;
  evNo: number;
  
  // Recommendation
  recommendation: string;
  
  // Metadata
  estimatorType: 'llm' | 'baseline';
  keyFactors: string[];
  assumptions: string[];
  failureModes: string[];
}

export function calculateEdge(
  market: MarketWithPrices, 
  estimation: EstimationResult
): EdgeAnalysis {
  const config = getConfig();
  const feeBps = config.simulation.fee_bps;
  const feeMultiplier = 1 - (feeBps / 10000);
  
  const marketProb = market.prices.yesPrice;
  const modelProb = estimation.estimatedProbability;
  
  const edge = modelProb - marketProb;
  const absoluteEdge = Math.abs(edge);
  
  // Determine direction
  let edgeDirection: 'YES' | 'NO' | 'NEUTRAL' = 'NEUTRAL';
  if (edge > 0.02) {
    edgeDirection = 'YES';  // Market undervalues YES
  } else if (edge < -0.02) {
    edgeDirection = 'NO';   // Market undervalues NO
  }
  
  // Calculate Expected Values
  // For YES position: win (1/yesPrice - 1) * modelProb - lose (1) * (1 - modelProb)
  // Simplified: EV = modelProb * payout - cost
  // Where payout for YES = 1/yesPrice (you pay yesPrice, get 1 if win)
  
  // EV for YES = modelProb * (1 - yesPrice) - (1 - modelProb) * yesPrice
  // After fees
  const evYes = (modelProb * (1 - marketProb) - (1 - modelProb) * marketProb) * feeMultiplier;
  
  // EV for NO = modelProb_no * (1 - noPrice) - modelProb_yes * noPrice
  const noPrice = market.prices.noPrice;
  const evNo = ((1 - modelProb) * (1 - noPrice) - modelProb * noPrice) * feeMultiplier;
  
  // Generate recommendation
  const recommendation = generateRecommendation(edge, estimation.confidence, absoluteEdge);
  
  return {
    marketId: market.id,
    question: market.question,
    marketProbability: marketProb,
    modelProbability: modelProb,
    confidence: estimation.confidence,
    edge,
    absoluteEdge,
    edgeDirection,
    evYes,
    evNo,
    recommendation,
    estimatorType: estimation.estimatorType,
    keyFactors: estimation.keyFactors,
    assumptions: estimation.assumptions,
    failureModes: estimation.failureModes,
  };
}

function generateRecommendation(
  edge: number, 
  confidence: number, 
  absoluteEdge: number
): string {
  // Always include disclaimer
  const disclaimer = '\n\n[This is analysis only, not financial advice. Past performance does not guarantee future results.]';
  
  if (confidence < 0.3) {
    return `Low confidence in estimate (${(confidence * 100).toFixed(0)}%). No actionable insight.` + disclaimer;
  }
  
  if (absoluteEdge < 0.02) {
    return 'Edge is within noise range (<2%). Market appears efficiently priced.' + disclaimer;
  }
  
  if (absoluteEdge < 0.05) {
    const direction = edge > 0 ? 'YES' : 'NO';
    return `Small potential edge (${(absoluteEdge * 100).toFixed(1)}%) toward ${direction}. Consider transaction costs.` + disclaimer;
  }
  
  if (absoluteEdge < 0.10) {
    const direction = edge > 0 ? 'YES' : 'NO';
    return `Moderate edge (${(absoluteEdge * 100).toFixed(1)}%) detected toward ${direction}. Warrants further research.` + disclaimer;
  }
  
  // Large edge
  const direction = edge > 0 ? 'YES' : 'NO';
  return `Large edge (${(absoluteEdge * 100).toFixed(1)}%) toward ${direction}. High uncertainty - verify assumptions carefully.` + disclaimer;
}

/**
 * Rank markets by absolute edge
 */
export function rankByEdge(analyses: EdgeAnalysis[]): EdgeAnalysis[] {
  return [...analyses].sort((a, b) => {
    // Weight by confidence
    const aScore = a.absoluteEdge * a.confidence;
    const bScore = b.absoluteEdge * b.confidence;
    return bScore - aScore;
  });
}

/**
 * Filter markets by criteria
 */
export function filterMarkets(
  markets: MarketWithPrices[],
  options: {
    minLiquidity?: number;
    minVolume?: number;
    maxSpread?: number;
    expiresWithinDays?: number;
    category?: string;
    keyword?: string;
  }
): MarketWithPrices[] {
  return markets.filter(market => {
    const { prices, endDate, question, description, category } = market;
    
    if (options.minLiquidity && (prices.liquidity || 0) < options.minLiquidity) {
      return false;
    }
    
    if (options.minVolume && (prices.volume24h || 0) < options.minVolume) {
      return false;
    }
    
    if (options.maxSpread && (prices.spread || 0) > options.maxSpread) {
      return false;
    }
    
    if (options.expiresWithinDays && endDate) {
      const daysUntilExpiry = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry > options.expiresWithinDays) {
        return false;
      }
    }
    
    if (options.category && category?.toLowerCase() !== options.category.toLowerCase()) {
      return false;
    }
    
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      const searchText = `${question} ${description || ''} ${category || ''}`.toLowerCase();
      if (!searchText.includes(kw)) {
        return false;
      }
    }
    
    return true;
  });
}

