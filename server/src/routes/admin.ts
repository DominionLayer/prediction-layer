/**
 * Admin Routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateAdmin } from '../middleware/auth.js';
import { usersRepo, apiKeysRepo, usageRepo } from '../db/repositories/index.js';
import { logger } from '../utils/logger.js';

const CreateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
});

const CreateKeySchema = z.object({
  user_id: z.string().min(1),
  name: z.string().max(100).optional(),
});

const UpdateQuotaSchema = z.object({
  user_id: z.string().min(1),
  daily_requests: z.number().int().positive().optional(),
  daily_tokens: z.number().int().positive().optional(),
  monthly_spend_cap_usd: z.number().positive().optional(),
  max_concurrent_requests: z.number().int().positive().max(100).optional(),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Require admin auth for all routes
  fastify.addHook('preHandler', authenticateAdmin);

  /**
   * POST /admin/users
   * Create a new user
   */
  fastify.post('/users', async (request, reply) => {
    const parseResult = CreateUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'validation_error',
        details: parseResult.error.errors,
      });
    }

    try {
      const user = await usersRepo.create(parseResult.data);
      
      logger.info('User created', { user_id: user.id });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        created_at: user.created_at,
      };
    } catch (error) {
      logger.error('Failed to create user', { error: (error as Error).message });
      return reply.code(500).send({
        error: 'create_failed',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /admin/users
   * List all users
   */
  fastify.get('/users', async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = parseInt(query.limit || '100');
    const offset = parseInt(query.offset || '0');

    const users = await usersRepo.list(limit, offset);
    
    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        created_at: u.created_at,
      })),
      count: users.length,
    };
  });

  /**
   * GET /admin/users/:id
   * Get user details
   */
  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const user = await usersRepo.getById(id);
    if (!user) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const quota = await usersRepo.getQuota(id);
    const stats = await usageRepo.getUsageStats(id);
    const keys = await apiKeysRepo.getByUser(id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        created_at: user.created_at,
      },
      quota,
      usage: stats,
      api_keys: keys.map(k => ({
        id: k.id,
        prefix: k.key_prefix,
        name: k.name,
        status: k.status,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
      })),
    };
  });

  /**
   * POST /admin/keys
   * Create a new API key for a user
   * Returns plaintext key ONCE
   */
  fastify.post('/keys', async (request, reply) => {
    const parseResult = CreateKeySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'validation_error',
        details: parseResult.error.errors,
      });
    }

    const { user_id, name } = parseResult.data;

    // Verify user exists
    const user = await usersRepo.getById(user_id);
    if (!user) {
      return reply.code(404).send({ error: 'user_not_found' });
    }

    try {
      const result = await apiKeysRepo.create(user_id, name);
      
      logger.info('API key created', { 
        user_id, 
        key_id: result.keyId,
        prefix: result.prefix,
      });

      return {
        key_id: result.keyId,
        api_key: result.apiKey, // Plaintext - shown only once!
        prefix: result.prefix,
        message: 'IMPORTANT: Save this API key now. It will not be shown again.',
      };
    } catch (error) {
      logger.error('Failed to create API key', { error: (error as Error).message });
      return reply.code(500).send({
        error: 'create_failed',
        message: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /admin/keys/:id
   * Revoke an API key
   */
  fastify.delete('/keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const key = await apiKeysRepo.getById(id);
    if (!key) {
      return reply.code(404).send({ error: 'not_found' });
    }

    await apiKeysRepo.revoke(id);
    
    logger.info('API key revoked', { key_id: id });

    return { success: true };
  });

  /**
   * POST /admin/limits
   * Update user quotas
   */
  fastify.post('/limits', async (request, reply) => {
    const parseResult = UpdateQuotaSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'validation_error',
        details: parseResult.error.errors,
      });
    }

    const { user_id, ...quotaUpdates } = parseResult.data;

    // Verify user exists
    const user = await usersRepo.getById(user_id);
    if (!user) {
      return reply.code(404).send({ error: 'user_not_found' });
    }

    await usersRepo.updateQuota(user_id, quotaUpdates);
    
    logger.info('User quota updated', { user_id, updates: quotaUpdates });

    const newQuota = await usersRepo.getQuota(user_id);
    return { user_id, quota: newQuota };
  });

  /**
   * GET /admin/usage
   * Get usage statistics
   */
  fastify.get('/usage', async (request) => {
    const query = request.query as { user_id?: string; days?: string };
    
    if (query.user_id) {
      const stats = await usageRepo.getUsageStats(query.user_id);
      const history = await usageRepo.getUsageHistory(query.user_id, { limit: 100 });
      
      return {
        user_id: query.user_id,
        stats,
        recent_requests: history.slice(0, 20),
      };
    }

    // TODO: Aggregate stats across all users
    return {
      message: 'Provide user_id for detailed usage',
    };
  });

  /**
   * POST /admin/users/:id/suspend
   * Suspend a user
   */
  fastify.post('/users/:id/suspend', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const user = await usersRepo.getById(id);
    if (!user) {
      return reply.code(404).send({ error: 'not_found' });
    }

    await usersRepo.updateStatus(id, 'suspended');
    await apiKeysRepo.revokeAllForUser(id);
    
    logger.info('User suspended', { user_id: id });

    return { success: true, status: 'suspended' };
  });

  /**
   * POST /admin/users/:id/activate
   * Reactivate a suspended user
   */
  fastify.post('/users/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const user = await usersRepo.getById(id);
    if (!user) {
      return reply.code(404).send({ error: 'not_found' });
    }

    await usersRepo.updateStatus(id, 'active');
    
    logger.info('User activated', { user_id: id });

    return { success: true, status: 'active' };
  });
}

