/**
 * LLM Service - Routes to OpenAI/Anthropic
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config, ALLOWED_MODELS } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  provider?: 'openai' | 'anthropic' | 'auto';
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | 'json';
}

export interface LLMResponse {
  provider: string;
  model: string;
  content: string;
  input_tokens: number;
  output_tokens: number;
  finish_reason: string;
}

// Initialize clients lazily
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

/**
 * Select provider and model
 */
function selectProviderAndModel(request: LLMRequest): { provider: 'openai' | 'anthropic'; model: string } {
  let provider = request.provider;
  let model = request.model;

  // Auto-select provider
  if (!provider || provider === 'auto') {
    if (config.openaiApiKey) {
      provider = 'openai';
    } else if (config.anthropicApiKey) {
      provider = 'anthropic';
    } else {
      throw new Error('No LLM provider configured');
    }
  }

  // Validate model
  const allowedModels = ALLOWED_MODELS[provider];
  if (model && !allowedModels.includes(model)) {
    throw new Error(`Model '${model}' is not allowed for provider '${provider}'`);
  }

  // Default model
  if (!model) {
    model = provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307';
  }

  return { provider, model };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  model: string,
  messages: LLMMessage[],
  options: { temperature?: number; max_tokens?: number; response_format?: 'text' | 'json' }
): Promise<LLMResponse> {
  const client = getOpenAI();

  const response = await client.chat.completions.create({
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 2048,
    response_format: options.response_format === 'json' 
      ? { type: 'json_object' } 
      : { type: 'text' },
  });

  const choice = response.choices[0];
  
  return {
    provider: 'openai',
    model,
    content: choice?.message?.content || '',
    input_tokens: response.usage?.prompt_tokens || 0,
    output_tokens: response.usage?.completion_tokens || 0,
    finish_reason: choice?.finish_reason || 'unknown',
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  model: string,
  messages: LLMMessage[],
  options: { temperature?: number; max_tokens?: number }
): Promise<LLMResponse> {
  const client = getAnthropic();

  // Extract system message
  const systemMessage = messages.find(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');

  const response = await client.messages.create({
    model,
    max_tokens: options.max_tokens ?? 2048,
    system: systemMessage?.content,
    messages: otherMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });

  const textBlock = response.content.find(block => block.type === 'text');
  
  return {
    provider: 'anthropic',
    model,
    content: textBlock?.type === 'text' ? textBlock.text : '',
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    finish_reason: response.stop_reason || 'unknown',
  };
}

/**
 * Complete an LLM request
 */
export async function complete(request: LLMRequest): Promise<LLMResponse> {
  const { provider, model } = selectProviderAndModel(request);

  logger.debug('LLM request', {
    provider,
    model,
    message_count: request.messages.length,
  });

  const startTime = Date.now();

  try {
    let response: LLMResponse;

    if (provider === 'openai') {
      response = await callOpenAI(model, request.messages, {
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        response_format: request.response_format,
      });
    } else {
      response = await callAnthropic(model, request.messages, {
        temperature: request.temperature,
        max_tokens: request.max_tokens,
      });
    }

    const latency = Date.now() - startTime;
    logger.info('LLM response', {
      provider,
      model,
      input_tokens: response.input_tokens,
      output_tokens: response.output_tokens,
      latency_ms: latency,
    });

    return response;
  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error('LLM error', {
      provider,
      model,
      error: (error as Error).message,
      latency_ms: latency,
    });
    throw error;
  }
}

/**
 * Check if providers are available
 */
export function getAvailableProviders(): string[] {
  const available: string[] = [];
  if (config.openaiApiKey) available.push('openai');
  if (config.anthropicApiKey) available.push('anthropic');
  return available;
}

