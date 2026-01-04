/**
 * Polymarket API Client
 */

import { request } from 'undici';
import { z } from 'zod';
import { getConfig } from '../core/config/loader.js';
import { logger } from '../core/logging/logger.js';
import { RateLimiter, withRetry } from '../core/providers/base.js';
import { 
  GammaMarketSchema, 
  type GammaMarket,
  type NormalizedMarket, 
  type MarketPrices,
  type MarketWithPrices,
} from './types.js';

export interface PolymarketClientOptions {
  baseUrl?: string;
  gammaUrl?: string;
  timeout?: number;
}

export class PolymarketClient {
  private baseUrl: string;
  private gammaUrl: string;
  private timeout: number;
  private rateLimiter: RateLimiter;

  constructor(options: PolymarketClientOptions = {}) {
    const config = getConfig();
    this.baseUrl = options.baseUrl || config.polymarket.base_url;
    this.gammaUrl = options.gammaUrl || config.polymarket.gamma_url;
    this.timeout = options.timeout || config.polymarket.timeout_ms;
    this.rateLimiter = new RateLimiter(config.rate_limits.polymarket_rps);
  }

  /**
   * Fetch active markets from Gamma API
   */
  async getActiveMarkets(limit: number = 100): Promise<MarketWithPrices[]> {
    const url = `${this.gammaUrl}/markets?limit=${limit}&active=true&closed=false`;
    
    logger.debug(`Fetching active markets from ${url}`);
    
    const response = await this.fetchWithRetry(url);
    
    const MarketsResponseSchema = z.array(GammaMarketSchema);
    const validated = MarketsResponseSchema.safeParse(response);
    
    if (!validated.success) {
      logger.warn('Failed to validate markets response', { 
        errors: validated.error.errors 
      });
      // Try to parse what we can
      const markets = Array.isArray(response) ? response : [];
      return markets.map(m => this.normalizeGammaMarket(m as GammaMarket)).filter(Boolean) as MarketWithPrices[];
    }

    return validated.data.map(m => this.normalizeGammaMarket(m)).filter(Boolean) as MarketWithPrices[];
  }

  /**
   * Get market details by ID
   */
  async getMarket(marketId: string): Promise<MarketWithPrices | null> {
    const url = `${this.gammaUrl}/markets/${marketId}`;
    
    logger.debug(`Fetching market ${marketId}`);
    
    try {
      const response = await this.fetchWithRetry(url);
      const validated = GammaMarketSchema.safeParse(response);
      
      if (!validated.success) {
        logger.warn('Failed to validate market response', { marketId });
        return null;
      }

      return this.normalizeGammaMarket(validated.data);
    } catch (error) {
      logger.error(`Failed to fetch market ${marketId}`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string, limit: number = 50): Promise<MarketWithPrices[]> {
    // URL encode the query
    const encodedQuery = encodeURIComponent(query);
    const url = `${this.gammaUrl}/markets?_q=${encodedQuery}&limit=${limit}&active=true`;
    
    logger.debug(`Searching markets: ${query}`);
    
    const response = await this.fetchWithRetry(url);
    
    const MarketsResponseSchema = z.array(GammaMarketSchema);
    const validated = MarketsResponseSchema.safeParse(response);
    
    if (!validated.success) {
      const markets = Array.isArray(response) ? response : [];
      return markets.map(m => this.normalizeGammaMarket(m as GammaMarket)).filter(Boolean) as MarketWithPrices[];
    }

    return validated.data.map(m => this.normalizeGammaMarket(m)).filter(Boolean) as MarketWithPrices[];
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(category: string, limit: number = 50): Promise<MarketWithPrices[]> {
    const url = `${this.gammaUrl}/markets?tag=${encodeURIComponent(category)}&limit=${limit}&active=true`;
    
    const response = await this.fetchWithRetry(url);
    
    const MarketsResponseSchema = z.array(GammaMarketSchema);
    const validated = MarketsResponseSchema.safeParse(response);
    
    if (!validated.success) {
      const markets = Array.isArray(response) ? response : [];
      return markets.map(m => this.normalizeGammaMarket(m as GammaMarket)).filter(Boolean) as MarketWithPrices[];
    }

    return validated.data.map(m => this.normalizeGammaMarket(m)).filter(Boolean) as MarketWithPrices[];
  }

  private normalizeGammaMarket(market: GammaMarket): MarketWithPrices | null {
    try {
      // Parse outcomes
      let outcomes: string[] = ['Yes', 'No'];
      if (market.outcomes) {
        try {
          outcomes = JSON.parse(market.outcomes);
        } catch {
          // Keep default
        }
      }

      // Parse prices
      let yesPrice = 0.5;
      let noPrice = 0.5;
      if (market.outcomePrices) {
        try {
          const prices = JSON.parse(market.outcomePrices);
          if (Array.isArray(prices) && prices.length >= 2) {
            yesPrice = parseFloat(prices[0]) || 0.5;
            noPrice = parseFloat(prices[1]) || 0.5;
          }
        } catch {
          // Keep defaults
        }
      }

      const normalized: NormalizedMarket = {
        id: market.id,
        conditionId: market.conditionId,
        question: market.question,
        description: market.description || null,
        outcomes,
        endDate: market.endDate ? new Date(market.endDate) : null,
        resolutionSource: market.resolutionSource || null,
        category: null, // Not available in Gamma API response
        tags: [],
        active: market.active !== false && market.closed !== true,
      };

      const prices: MarketPrices = {
        marketId: market.id,
        yesPrice,
        noPrice,
        spread: market.spread,
        volume24h: market.volume24hr || (market.volume ? parseFloat(market.volume) : undefined),
        liquidity: market.liquidity ? parseFloat(market.liquidity) : undefined,
        timestamp: Date.now(),
      };

      return {
        ...normalized,
        prices,
      };
    } catch (error) {
      logger.warn('Failed to normalize market', { 
        marketId: market.id, 
        error: (error as Error).message 
      });
      return null;
    }
  }

  private async fetchWithRetry(url: string): Promise<unknown> {
    const config = getConfig();
    
    return withRetry(async () => {
      await this.rateLimiter.acquire();
      
      const response = await request(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'dominion-pm/1.0',
        },
        headersTimeout: this.timeout,
        bodyTimeout: this.timeout,
      });

      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${await response.body.text()}`);
      }

      return response.body.json();
    }, {
      maxRetries: config.rate_limits.max_retries,
      baseDelay: config.rate_limits.base_delay_ms,
      maxDelay: config.rate_limits.max_delay_ms,
    });
  }
}

// Mock client for testing
export class MockPolymarketClient extends PolymarketClient {
  private mockMarkets: MarketWithPrices[] = [];

  constructor() {
    super();
    this.mockMarkets = this.generateMockMarkets();
  }

  async getActiveMarkets(): Promise<MarketWithPrices[]> {
    return this.mockMarkets;
  }

  async getMarket(marketId: string): Promise<MarketWithPrices | null> {
    return this.mockMarkets.find(m => m.id === marketId) || null;
  }

  async searchMarkets(query: string): Promise<MarketWithPrices[]> {
    const q = query.toLowerCase();
    return this.mockMarkets.filter(m => 
      m.question.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q)
    );
  }

  async getMarketsByCategory(): Promise<MarketWithPrices[]> {
    return this.mockMarkets.slice(0, 10);
  }

  private generateMockMarkets(): MarketWithPrices[] {
    return [
      {
        id: 'mock-market-1',
        conditionId: 'cond-1',
        question: 'Will BTC reach $100k by end of 2025?',
        description: 'This market resolves YES if Bitcoin price exceeds $100,000 USD.',
        outcomes: ['Yes', 'No'],
        endDate: new Date('2025-12-31'),
        resolutionSource: 'CoinGecko',
        category: 'Crypto',
        tags: ['bitcoin', 'crypto', 'price'],
        active: true,
        prices: {
          marketId: 'mock-market-1',
          yesPrice: 0.65,
          noPrice: 0.35,
          spread: 0.02,
          volume24h: 50000,
          liquidity: 100000,
          timestamp: Date.now(),
        },
      },
      {
        id: 'mock-market-2',
        conditionId: 'cond-2',
        question: 'Will there be a Fed rate cut in Q1 2025?',
        description: 'Resolves YES if Federal Reserve cuts rates in January, February, or March 2025.',
        outcomes: ['Yes', 'No'],
        endDate: new Date('2025-03-31'),
        resolutionSource: 'Federal Reserve',
        category: 'Economics',
        tags: ['fed', 'rates', 'economics'],
        active: true,
        prices: {
          marketId: 'mock-market-2',
          yesPrice: 0.45,
          noPrice: 0.55,
          spread: 0.03,
          volume24h: 25000,
          liquidity: 75000,
          timestamp: Date.now(),
        },
      },
      {
        id: 'mock-market-3',
        conditionId: 'cond-3',
        question: 'Will ETH flip BTC market cap in 2025?',
        description: 'Resolves YES if Ethereum market cap exceeds Bitcoin market cap at any point in 2025.',
        outcomes: ['Yes', 'No'],
        endDate: new Date('2025-12-31'),
        resolutionSource: 'CoinGecko',
        category: 'Crypto',
        tags: ['ethereum', 'bitcoin', 'flippening'],
        active: true,
        prices: {
          marketId: 'mock-market-3',
          yesPrice: 0.12,
          noPrice: 0.88,
          spread: 0.04,
          volume24h: 15000,
          liquidity: 50000,
          timestamp: Date.now(),
        },
      },
    ];
  }
}

// Factory function
export function createPolymarketClient(useMock: boolean = false): PolymarketClient {
  if (useMock) {
    return new MockPolymarketClient();
  }
  return new PolymarketClient();
}

