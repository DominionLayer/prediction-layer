/**
 * Simulation Module
 * 
 * Simulates positions and calculates expected values
 */

import { getConfig } from '../core/config/loader.js';
import type { MarketWithPrices } from '../polymarket/types.js';
import type { EdgeAnalysis } from '../analysis/edge.js';

export interface SimulationScenario {
  name: string;
  probability: number;
  profit: number;
  description: string;
}

export interface SimulationResult {
  marketId: string;
  question: string;
  position: 'YES' | 'NO';
  entryPrice: number;
  positionSize: number;
  modelProbability: number;
  confidenceBand: number;
  
  // Core results
  expectedValue: number;
  expectedReturn: number;  // EV as percentage
  bestCase: number;
  worstCase: number;
  breakEvenProbability: number;
  
  // Costs
  feeBps: number;
  slippageBps: number;
  totalCosts: number;
  
  // Scenarios
  scenarios: SimulationScenario[];
  
  // Risk metrics
  kellyFraction: number;  // Optimal position sizing
  maxDrawdown: number;
  
  timestamp: number;
}

export interface SimulationOptions {
  position?: 'YES' | 'NO';
  entryPrice?: number;
  positionSize?: number;
  feeBps?: number;
  slippageBps?: number;
  confidenceBand?: number;
}

export function simulate(
  market: MarketWithPrices,
  analysis: EdgeAnalysis,
  options: SimulationOptions = {}
): SimulationResult {
  const config = getConfig();
  const simConfig = config.simulation;
  
  // Use provided options or defaults
  const position = options.position || (analysis.edge > 0 ? 'YES' : 'NO');
  const entryPrice = options.entryPrice || (position === 'YES' ? market.prices.yesPrice : market.prices.noPrice);
  const positionSize = options.positionSize || simConfig.default_position_size;
  const feeBps = options.feeBps ?? simConfig.fee_bps;
  const slippageBps = options.slippageBps ?? simConfig.slippage_bps;
  const confidenceBand = options.confidenceBand ?? simConfig.confidence_band;
  
  const modelProb = analysis.modelProbability;
  const totalCostBps = feeBps + slippageBps;
  const costMultiplier = 1 - (totalCostBps / 10000);
  
  // Calculate probabilities for the position
  const probWin = position === 'YES' ? modelProb : (1 - modelProb);
  const probLose = 1 - probWin;
  
  // Payout calculation
  // If you buy YES at 0.60 and win, you get 1.00, profit = 0.40
  // If you buy YES at 0.60 and lose, you get 0, loss = 0.60
  const winPayout = (1 - entryPrice) * costMultiplier;  // Profit per share if win
  const lossPayout = -entryPrice;  // Loss per share if lose (always full entry price)
  
  // Expected Value per share
  const evPerShare = probWin * winPayout + probLose * lossPayout;
  const expectedValue = evPerShare * positionSize;
  const expectedReturn = evPerShare / entryPrice;
  
  // Calculate costs
  const totalCosts = positionSize * entryPrice * (totalCostBps / 10000);
  
  // Break-even probability
  // At break-even: p * winPayout + (1-p) * lossPayout = 0
  // p * (1 - entryPrice) - (1-p) * entryPrice = 0
  // p - p*entryPrice - entryPrice + p*entryPrice = 0
  // p = entryPrice
  const breakEvenProbability = entryPrice / costMultiplier;
  
  // Best and worst case with confidence band
  const probHigh = Math.min(0.99, probWin + confidenceBand);
  const probLow = Math.max(0.01, probWin - confidenceBand);
  
  const bestCase = (probHigh * winPayout + (1 - probHigh) * lossPayout) * positionSize;
  const worstCase = (probLow * winPayout + (1 - probLow) * lossPayout) * positionSize;
  
  // Kelly Criterion for optimal sizing
  // Kelly = (p * b - q) / b where b = odds, p = prob win, q = prob lose
  // For binary markets: b = (1 - entryPrice) / entryPrice
  const odds = (1 - entryPrice) / entryPrice;
  const kellyFraction = Math.max(0, (probWin * odds - probLose) / odds);
  
  // Max drawdown is full position if we lose
  const maxDrawdown = positionSize * entryPrice;
  
  // Generate scenarios
  const scenarios: SimulationScenario[] = [
    {
      name: 'Base Case',
      probability: probWin,
      profit: expectedValue,
      description: `Model probability (${(probWin * 100).toFixed(1)}%) realized`,
    },
    {
      name: 'Optimistic',
      probability: probHigh,
      profit: bestCase,
      description: `Upper confidence bound (${(probHigh * 100).toFixed(1)}%)`,
    },
    {
      name: 'Pessimistic',
      probability: probLow,
      profit: worstCase,
      description: `Lower confidence bound (${(probLow * 100).toFixed(1)}%)`,
    },
    {
      name: 'Win',
      probability: 1,
      profit: winPayout * positionSize,
      description: 'Market resolves in your favor',
    },
    {
      name: 'Loss',
      probability: 0,
      profit: lossPayout * positionSize,
      description: 'Market resolves against you',
    },
  ];
  
  return {
    marketId: market.id,
    question: market.question,
    position,
    entryPrice,
    positionSize,
    modelProbability: modelProb,
    confidenceBand,
    expectedValue,
    expectedReturn,
    bestCase,
    worstCase,
    breakEvenProbability,
    feeBps,
    slippageBps,
    totalCosts,
    scenarios,
    kellyFraction,
    maxDrawdown,
    timestamp: Date.now(),
  };
}

/**
 * Format simulation result as text
 */
export function formatSimulationText(result: SimulationResult): string {
  const lines: string[] = [
    '='.repeat(60),
    'SIMULATION RESULTS',
    '='.repeat(60),
    '',
    `Market: ${result.question}`,
    `Position: ${result.position} @ $${result.entryPrice.toFixed(3)}`,
    `Size: ${result.positionSize} contracts`,
    '',
    '-'.repeat(40),
    'EXPECTED VALUES',
    '-'.repeat(40),
    `Expected Value: $${result.expectedValue.toFixed(2)}`,
    `Expected Return: ${(result.expectedReturn * 100).toFixed(1)}%`,
    `Best Case: $${result.bestCase.toFixed(2)}`,
    `Worst Case: $${result.worstCase.toFixed(2)}`,
    '',
    '-'.repeat(40),
    'RISK METRICS',
    '-'.repeat(40),
    `Break-even Probability: ${(result.breakEvenProbability * 100).toFixed(1)}%`,
    `Model Probability: ${(result.modelProbability * 100).toFixed(1)}%`,
    `Kelly Fraction: ${(result.kellyFraction * 100).toFixed(1)}%`,
    `Max Drawdown: $${result.maxDrawdown.toFixed(2)}`,
    '',
    '-'.repeat(40),
    'COSTS',
    '-'.repeat(40),
    `Trading Fee: ${result.feeBps} bps`,
    `Slippage: ${result.slippageBps} bps`,
    `Total Costs: $${result.totalCosts.toFixed(2)}`,
    '',
    '-'.repeat(40),
    'SCENARIOS',
    '-'.repeat(40),
  ];
  
  for (const scenario of result.scenarios) {
    lines.push(`${scenario.name}: $${scenario.profit.toFixed(2)} (${scenario.description})`);
  }
  
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('DISCLAIMER: This is a simulation for educational purposes only.');
  lines.push('It is NOT financial advice. Past performance does not guarantee');
  lines.push('future results. Never invest more than you can afford to lose.');
  lines.push('='.repeat(60));
  
  return lines.join('\n');
}

