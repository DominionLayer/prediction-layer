/**
 * Anthropic Provider Implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMCompletionOptions, LLMResponse, RateLimiter, withRetry } from './base.js';
import { getConfig } from '../config/loader.js';

export class AnthropicProvider extends LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private rateLimiter: RateLimiter;

  constructor() {
    super();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
    
    const config = getConfig();
    this.rateLimiter = new RateLimiter(config.rate_limits.llm_rpm / 60);
  }

  async complete(options: LLMCompletionOptions): Promise<LLMResponse> {
    const config = getConfig();
    const providerConfig = config.provider.anthropic;
    
    await this.rateLimiter.acquire();

    // Extract system message
    const systemMessage = options.messages.find(m => m.role === 'system');
    const otherMessages = options.messages.filter(m => m.role !== 'system');

    return withRetry(async () => {
      const response = await this.client.messages.create({
        model: providerConfig?.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens ?? providerConfig?.max_tokens ?? 2048,
        system: systemMessage?.content,
        messages: otherMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const textBlock = response.content.find(block => block.type === 'text');
      const content = textBlock?.type === 'text' ? textBlock.text : '';
      
      return {
        content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    }, {
      maxRetries: config.rate_limits.max_retries,
      baseDelay: config.rate_limits.base_delay_ms,
      maxDelay: config.rate_limits.max_delay_ms,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple availability check
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}

