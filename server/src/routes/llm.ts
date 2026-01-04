/**
 * LLM Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateApiKey } from '../middleware/auth.js';
import { checkQuota, releaseQuota, getRemainingQuota } from '../middleware/quota.js';
import { complete, getAvailableProviders } from '../services/llm.js';
import { usageRepo } from '../db/repositories/usage.js';
import { logger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

const CompletionRequestSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'auto']).optional(),
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(100000), // 100K char limit per message
  })).min(1).max(100), // Max 100 messages
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(16000).optional(),
  response_format: z.enum(['text', 'json']).optional(),
});

export async function llmRoutes(fastify: FastifyInstance): Promise<void> {
  // Pre-handler for all LLM routes
  fastify.addHook('preHandler', authenticateApiKey);
  fastify.addHook('preHandler', checkQuota);

  /**
   * POST /v1/llm/complete
   * Main completion endpoint
   */
  fastify.post('/complete', async (request, reply) => {
    const requestId = nanoid();
    const userId = request.userId!;
    const startTime = Date.now();

    try {
      // Validate request body
      const parseResult = CompletionRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        releaseQuota(userId);
        return reply.code(400).send({
          error: 'validation_error',
          message: 'Invalid request body',
          details: parseResult.error.errors,
        });
      }

      const body = parseResult.data;

      // Log request (redacted)
      logger.info('LLM completion request', {
        request_id: requestId,
        user_id: userId,
        provider: body.provider || 'auto',
        model: body.model || 'default',
        message_count: body.messages.length,
      });

      // Call LLM service
      const response = await complete({
        provider: body.provider,
        model: body.model,
        messages: body.messages,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        response_format: body.response_format,
      });

      const latencyMs = Date.now() - startTime;

      // Record usage
      await usageRepo.record({
        userId,
        requestId,
        provider: response.provider,
        model: response.model,
        inputTokens: response.input_tokens,
        outputTokens: response.output_tokens,
        latencyMs,
        status: 'success',
      });

      releaseQuota(userId);

      logger.info('LLM completion success', {
        request_id: requestId,
        user_id: userId,
        provider: response.provider,
        model: response.model,
        tokens: response.input_tokens + response.output_tokens,
        latency_ms: latencyMs,
      });

      return {
        id: requestId,
        provider: response.provider,
        model: response.model,
        content: response.content,
        usage: {
          input_tokens: response.input_tokens,
          output_tokens: response.output_tokens,
          total_tokens: response.input_tokens + response.output_tokens,
        },
        finish_reason: response.finish_reason,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Record failed usage
      await usageRepo.record({
        userId,
        requestId,
        provider: 'unknown',
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        status: 'error',
        errorMessage: (error as Error).message,
      });

      releaseQuota(userId);

      logger.error('LLM completion error', {
        request_id: requestId,
        user_id: userId,
        error: (error as Error).message,
        latency_ms: latencyMs,
      });

      return reply.code(500).send({
        error: 'llm_error',
        message: (error as Error).message,
        request_id: requestId,
      });
    }
  });

  /**
   * GET /v1/llm/models
   * List available models
   */
  fastify.get('/models', async () => {
    const providers = getAvailableProviders();
    
    return {
      providers,
      models: {
        openai: providers.includes('openai') ? [
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
          { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ] : [],
        anthropic: providers.includes('anthropic') ? [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
          { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
        ] : [],
      },
    };
  });

  /**
   * GET /v1/llm/quota
   * Get remaining quota
   */
  fastify.get('/quota', async (request) => {
    const userId = request.userId!;
    const quota = await getRemainingQuota(userId);
    
    return {
      user_id: userId,
      ...quota,
    };
  });
}

