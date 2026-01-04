/**
 * Polymarket API Types
 */

import { z } from 'zod';

// API Response Schemas
export const OutcomeSchema = z.object({
  outcome: z.string(),
  price: z.number(),
});

export const MarketTokenSchema = z.object({
  token_id: z.string(),
  outcome: z.string(),
  price: z.number().optional(),
});

export const PolymarketEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  end_date_iso: z.string().optional(),
  end_date: z.string().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  archived: z.boolean().optional(),
  markets: z.array(z.any()).optional(),
});

export const PolymarketMarketSchema = z.object({
  id: z.string().optional(),
  condition_id: z.string(),
  question_id: z.string().optional(),
  question: z.string(),
  description: z.string().optional(),
  outcomes: z.array(z.string()).optional(),
  outcome_prices: z.string().optional(), // JSON string of prices
  tokens: z.array(MarketTokenSchema).optional(),
  end_date_iso: z.string().optional(),
  resolution_source: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  volume: z.number().optional(),
  volume_24hr: z.number().optional(),
  liquidity: z.number().optional(),
  spread: z.number().optional(),
});

export const GammaMarketSchema = z.object({
  id: z.string(),
  question: z.string(),
  conditionId: z.string(),
  slug: z.string().optional(),
  resolutionSource: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  outcomes: z.string().optional(), // JSON string
  outcomePrices: z.string().optional(), // JSON string
  volume: z.string().optional(),
  volume24hr: z.number().optional(),
  liquidity: z.string().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  new: z.boolean().optional(),
  featured: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  competitive: z.number().optional(),
  spread: z.number().optional(),
});

export type PolymarketEvent = z.infer<typeof PolymarketEventSchema>;
export type PolymarketMarket = z.infer<typeof PolymarketMarketSchema>;
export type GammaMarket = z.infer<typeof GammaMarketSchema>;

// Normalized types for internal use
export interface NormalizedMarket {
  id: string;
  conditionId: string;
  question: string;
  description: string | null;
  outcomes: string[];
  endDate: Date | null;
  resolutionSource: string | null;
  category: string | null;
  tags: string[];
  active: boolean;
}

export interface MarketPrices {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  spread?: number;
  volume24h?: number;
  liquidity?: number;
  timestamp: number;
}

export interface MarketWithPrices extends NormalizedMarket {
  prices: MarketPrices;
}

