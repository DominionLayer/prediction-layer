/**
 * Health Check Routes
 */

import { FastifyInstance } from 'fastify';
import { getAvailableProviders } from '../services/llm.js';
import { getDatabase } from '../db/index.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health
   * Basic health check
   */
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * GET /health/ready
   * Readiness check (includes DB and provider checks)
   */
  fastify.get('/health/ready', async (request, reply) => {
    const checks: Record<string, { status: string; message?: string }> = {};

    // Check database
    try {
      const db = await getDatabase();
      await db.query('SELECT 1');
      checks.database = { status: 'ok' };
    } catch (error) {
      checks.database = { 
        status: 'error', 
        message: (error as Error).message 
      };
    }

    // Check LLM providers
    const providers = getAvailableProviders();
    checks.llm_providers = {
      status: providers.length > 0 ? 'ok' : 'warning',
      message: providers.length > 0 
        ? `Available: ${providers.join(', ')}`
        : 'No LLM providers configured',
    };

    const allOk = Object.values(checks).every(c => c.status === 'ok');
    
    if (!allOk) {
      reply.code(503);
    }

    return {
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  });
}

