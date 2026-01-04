/**
 * OpenAI Provider Implementation
 */

import OpenAI from 'openai';
import { LLMProvider, LLMCompletionOptions, LLMResponse, RateLimiter, withRetry } from './base.js';
import { getConfig } from '../config/loader.js';

export class OpenAIProvider extends LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private rateLimiter: RateLimiter;

  constructor() {
    super();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
    
    const config = getConfig();
    this.rateLimiter = new RateLimiter(config.rate_limits.llm_rpm / 60);
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    const config = getConfig();
    const providerConfig = config.provider.openai;
    
    await this.rateLimiter.acquire();

    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: providerConfig?.model || 'gpt-4-turbo-preview',
        messages: options.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? providerConfig?.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? providerConfig?.max_tokens ?? 2048,
        response_format: options.responseFormat === 'json' 
          ? { type: 'json_object' } 
          : { type: 'text' },
      });

      const content = response.choices[0]?.message?.content || '';
      
      return {
        content,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
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
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

