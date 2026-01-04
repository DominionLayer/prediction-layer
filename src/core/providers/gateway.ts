/**
 * Gateway Provider - Calls our backend LLM Gateway
 */

import { request } from 'undici';
import { LLMProvider, LLMCompletionOptions, LLMResponse, withRetry } from './base.js';
import { getConfig } from '../config/loader.js';
import { logger } from '../logging/logger.js';

// Default gateway URL - users don't need to set this
const DEFAULT_GATEWAY_URL = 'https://web-production-2fb66.up.railway.app';

export class GatewayProvider extends LLMProvider {
  readonly name = 'gateway';
  private apiUrl: string;
  private apiToken: string;

  constructor(apiUrl?: string, apiToken?: string) {
    super();
    const config = getConfig();
    
    this.apiUrl = apiUrl || process.env.DOMINION_API_URL || config.gateway?.url || DEFAULT_GATEWAY_URL;
    this.apiToken = apiToken || process.env.DOMINION_API_TOKEN || config.gateway?.token || '';
    
    if (!this.apiToken) {
      throw new Error(
        'DOMINION_API_TOKEN is required. Run `dominion-pm login` to authenticate or set the environment variable.'
      );
    }
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    const config = getConfig();
    
    return withRetry(async () => {
      const response = await request(`${this.apiUrl}/v1/llm/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({
          provider: 'auto',
          messages: options.messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          response_format: options.responseFormat,
        }),
        bodyTimeout: 120000, // 2 minute timeout for LLM calls
        headersTimeout: 30000,
      });

      if (response.statusCode === 401) {
        throw new Error('Invalid API token. Run `dominion-pm login` to re-authenticate.');
      }

      if (response.statusCode === 429) {
        const body = await response.body.json() as any;
        throw new Error(`Rate limit exceeded: ${body.message || 'Too many requests'}`);
      }

      if (response.statusCode !== 200) {
        const body = await response.body.json() as any;
        throw new Error(body.message || `Gateway error: ${response.statusCode}`);
      }

      const data = await response.body.json() as any;

      return {
        content: data.content,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    }, {
      maxRetries: config.rate_limits.max_retries,
      baseDelay: config.rate_limits.base_delay_ms,
      maxDelay: config.rate_limits.max_delay_ms,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await request(`${this.apiUrl}/health`, {
        method: 'GET',
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get remaining quota from the gateway
   */
  async getQuota(): Promise<{
    daily_requests: { limit: number; used: number; remaining: number };
    daily_tokens: { limit: number; used: number; remaining: number };
    monthly_spend: { cap_usd: number | null; used_usd: number; remaining_usd: number | null };
  }> {
    const response = await request(`${this.apiUrl}/v1/llm/quota`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (response.statusCode !== 200) {
      throw new Error('Failed to get quota');
    }

    return await response.body.json() as any;
  }

  /**
   * Verify token and get user info
   */
  async whoami(): Promise<{
    user_id: string;
    daily_requests: { limit: number; used: number; remaining: number };
    daily_tokens: { limit: number; used: number; remaining: number };
    monthly_spend?: { cap_usd: number | null; used_usd: number; remaining_usd: number | null };
  }> {
    const response = await request(`${this.apiUrl}/v1/llm/quota`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (response.statusCode === 401) {
      throw new Error('Invalid API token');
    }

    if (response.statusCode !== 200) {
      throw new Error('Failed to verify token');
    }

    return await response.body.json() as any;
  }
}

