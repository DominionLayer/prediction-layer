/**
 * Quota Enforcement Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { usersRepo } from '../db/repositories/users.js';
import { usageRepo } from '../db/repositories/usage.js';
import { logger } from '../utils/logger.js';

// Track concurrent requests per user
const concurrentRequests = new Map<string, number>();

/**
 * Check and enforce user quotas
 */
export async function checkQuota(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.userId;
  
  if (!userId) {
    // Should not happen if auth middleware runs first
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  try {
    // Get user quota
    const quota = await usersRepo.getQuota(userId);
    if (!quota) {
      reply.code(500).send({ error: 'quota_not_found' });
      return;
    }

    // Get today's usage
    const dailyUsage = await usageRepo.getDailyUsage(userId);
    const todayRequests = dailyUsage?.request_count || 0;
    const todayTokens = dailyUsage?.total_tokens || 0;

    // Check daily request limit
    if (todayRequests >= quota.daily_requests) {
      logger.warn('Daily request quota exceeded', {
        user_id: userId,
        limit: quota.daily_requests,
        used: todayRequests,
      });
      
      reply.code(429).send({
        error: 'quota_exceeded',
        message: 'Daily request limit exceeded',
        limit: quota.daily_requests,
        used: todayRequests,
        resets_at: getNextMidnight(),
      });
      return;
    }

    // Check daily token limit
    if (todayTokens >= quota.daily_tokens) {
      logger.warn('Daily token quota exceeded', {
        user_id: userId,
        limit: quota.daily_tokens,
        used: todayTokens,
      });
      
      reply.code(429).send({
        error: 'quota_exceeded',
        message: 'Daily token limit exceeded',
        limit: quota.daily_tokens,
        used: todayTokens,
        resets_at: getNextMidnight(),
      });
      return;
    }

    // Check monthly spend cap
    if (quota.monthly_spend_cap_usd) {
      const stats = await usageRepo.getUsageStats(userId);
      if (stats.thisMonth.cost >= quota.monthly_spend_cap_usd) {
        logger.warn('Monthly spend cap exceeded', {
          user_id: userId,
          cap: quota.monthly_spend_cap_usd,
          spent: stats.thisMonth.cost,
        });
        
        reply.code(429).send({
          error: 'quota_exceeded',
          message: 'Monthly spending cap exceeded',
          cap_usd: quota.monthly_spend_cap_usd,
          spent_usd: stats.thisMonth.cost,
          resets_at: getNextMonth(),
        });
        return;
      }
    }

    // Check concurrent requests
    const current = concurrentRequests.get(userId) || 0;
    if (current >= quota.max_concurrent_requests) {
      reply.code(429).send({
        error: 'too_many_concurrent',
        message: 'Too many concurrent requests',
        limit: quota.max_concurrent_requests,
      });
      return;
    }

    // Increment concurrent request counter
    concurrentRequests.set(userId, current + 1);
  } catch (error) {
    logger.error('Quota check error', {
      error: (error as Error).message,
      user_id: userId,
    });
    
    reply.code(500).send({
      error: 'internal_error',
      message: 'Failed to check quota',
    });
  }
}

/**
 * Decrement concurrent request counter
 */
export function releaseQuota(userId: string): void {
  const current = concurrentRequests.get(userId) || 0;
  if (current > 0) {
    concurrentRequests.set(userId, current - 1);
  }
}

/**
 * Get remaining quota for a user
 */
export async function getRemainingQuota(userId: string): Promise<{
  daily_requests: { limit: number; used: number; remaining: number };
  daily_tokens: { limit: number; used: number; remaining: number };
  monthly_spend: { cap_usd: number | null; used_usd: number; remaining_usd: number | null };
}> {
  const quota = await usersRepo.getQuota(userId);
  const dailyUsage = await usageRepo.getDailyUsage(userId);
  const stats = await usageRepo.getUsageStats(userId);

  const usedRequests = dailyUsage?.request_count || 0;
  const usedTokens = dailyUsage?.total_tokens || 0;
  const usedCost = stats.thisMonth.cost;

  return {
    daily_requests: {
      limit: quota?.daily_requests || 0,
      used: usedRequests,
      remaining: Math.max(0, (quota?.daily_requests || 0) - usedRequests),
    },
    daily_tokens: {
      limit: quota?.daily_tokens || 0,
      used: usedTokens,
      remaining: Math.max(0, (quota?.daily_tokens || 0) - usedTokens),
    },
    monthly_spend: {
      cap_usd: quota?.monthly_spend_cap_usd || null,
      used_usd: usedCost,
      remaining_usd: quota?.monthly_spend_cap_usd 
        ? Math.max(0, quota.monthly_spend_cap_usd - usedCost)
        : null,
    },
  };
}

function getNextMidnight(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

function getNextMonth(): string {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);
  return nextMonth.toISOString();
}

