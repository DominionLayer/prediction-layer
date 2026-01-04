/**
 * Provider Factory
 */

import { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { StubProvider } from './stub.js';
import { getConfig } from '../config/loader.js';

export * from './base.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { StubProvider } from './stub.js';

export type ProviderType = 'openai' | 'anthropic' | 'stub';

let cachedProvider: LLMProvider | null = null;

export function createProvider(type: ProviderType): LLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'stub':
      return new StubProvider();
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

export function getDefaultProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;
  
  const config = getConfig();
  const providerType = config.provider.default;
  
  // Try to create the configured provider, fall back to stub
  try {
    cachedProvider = createProvider(providerType);
  } catch (error) {
    console.warn(`Failed to create ${providerType} provider: ${(error as Error).message}`);
    console.warn('Falling back to stub provider');
    cachedProvider = new StubProvider();
  }
  
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
}

