/**
 * Dominion Gateway - LLM Gateway Service
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { getDatabase } from './db/index.js';
import { healthRoutes } from './routes/health.js';
import { llmRoutes } from './routes/llm.js';
import { adminRoutes } from './routes/admin.js';

async function main() {
  console.log('Starting Dominion Gateway...');
  console.log(`PORT: ${process.env.PORT || config.port}`);
  console.log(`NODE_ENV: ${config.nodeEnv}`);
  console.log(`DATABASE_URL: ${config.databaseUrl ? 'set' : 'not set'}`);
  console.log(`OPENAI_API_KEY: ${config.openaiApiKey ? 'set' : 'not set'}`);
  console.log(`ANTHROPIC_API_KEY: ${config.anthropicApiKey ? 'set' : 'not set'}`);
  
  // Warn about default admin token
  if (config.adminToken === 'change-me-in-production-16') {
    console.warn('WARNING: Using default ADMIN_TOKEN. Set a secure token in production!');
  }

  // Initialize database first
  logger.info('Initializing database...');
  try {
    await getDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Failed to initialize database', { error: (error as Error).message });
    console.error('Database initialization failed:', (error as Error).message);
    // Continue anyway - maybe we can work without DB for health checks
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // We use our own logger
    requestIdHeader: 'x-request-id',
    genReqId: () => Math.random().toString(36).slice(2, 10),
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => {
      // Rate limit by API key if present, otherwise by IP
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer dom_')) {
        return authHeader.slice(7, 19); // Use key prefix
      }
      return request.ip;
    },
    errorResponseBuilder: () => ({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please slow down.',
    }),
  });

  // Request logging
  fastify.addHook('onRequest', async (request) => {
    logger.debug('Incoming request', {
      request_id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    logger.info('Request completed', {
      request_id: request.id,
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      latency_ms: Math.round(reply.elapsedTime),
    });
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(llmRoutes, { prefix: '/v1/llm' });
  await fastify.register(adminRoutes, { prefix: '/admin' });

  // Root route
  fastify.get('/', async () => ({
    name: 'Dominion Gateway',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      llm: '/v1/llm/complete',
      models: '/v1/llm/models',
      quota: '/v1/llm/quota',
      admin: '/admin/*',
    },
  }));

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error('Unhandled error', {
      request_id: request.id,
      error: error.message,
      stack: error.stack,
    });

    reply.code(error.statusCode || 500).send({
      error: 'internal_error',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred',
      request_id: request.id,
    });
  });

  // Start server - Railway sets PORT env var
  const port = parseInt(process.env.PORT || String(config.port));
  const host = config.host;
  
  try {
    await fastify.listen({
      port,
      host,
    });

    logger.info(`Dominion Gateway started`, {
      port,
      host,
      environment: config.nodeEnv,
    });

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    DOMINION GATEWAY                          ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at http://${host}:${port}
║  Environment: ${config.nodeEnv}
║                                                              ║
║  Endpoints:                                                  ║
║    GET  /health           - Health check                    ║
║    POST /v1/llm/complete  - LLM completions                 ║
║    GET  /v1/llm/models    - Available models                ║
║    POST /admin/users      - Create user (admin)             ║
║    POST /admin/keys       - Create API key (admin)          ║
╚══════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      await fastify.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

