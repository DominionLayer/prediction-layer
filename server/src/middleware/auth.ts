/**
 * Authentication Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { apiKeysRepo } from '../db/repositories/index.js';
import { usersRepo } from '../db/repositories/users.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    keyId?: string;
    isAdmin?: boolean;
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;
  
  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) return null;
  
  return token;
}

/**
 * Authenticate API key
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);
  
  if (!token) {
    reply.code(401).send({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header. Use: Authorization: Bearer <API_KEY>',
    });
    return;
  }

  // Check if it's an API key (starts with dom_)
  if (!token.startsWith('dom_')) {
    reply.code(401).send({
      error: 'unauthorized',
      message: 'Invalid API key format',
    });
    return;
  }

  try {
    const result = await apiKeysRepo.verify(token);
    
    if (!result) {
      logger.warn('Invalid API key attempt', { 
        key_prefix: token.slice(0, 12),
        request_id: request.id,
      });
      
      reply.code(401).send({
        error: 'unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    // Check user status
    const user = await usersRepo.getById(result.userId);
    if (!user || user.status !== 'active') {
      reply.code(403).send({
        error: 'forbidden',
        message: 'User account is not active',
      });
      return;
    }

    request.userId = result.userId;
    request.keyId = result.keyId;
    
    logger.debug('Authenticated request', {
      user_id: result.userId,
      key_id: result.keyId,
      request_id: request.id,
    });
  } catch (error) {
    logger.error('Authentication error', {
      error: (error as Error).message,
      request_id: request.id,
    });
    
    reply.code(500).send({
      error: 'internal_error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Authenticate admin token
 */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);
  
  if (!token) {
    reply.code(401).send({
      error: 'unauthorized',
      message: 'Missing Authorization header',
    });
    return;
  }

  if (token !== config.adminToken) {
    logger.warn('Invalid admin token attempt', { request_id: request.id });
    
    reply.code(403).send({
      error: 'forbidden',
      message: 'Invalid admin token',
    });
    return;
  }

  request.isAdmin = true;
}

