/**
 * Users Repository
 */

import { nanoid } from 'nanoid';
import { getDatabase } from '../index.js';
import { config } from '../../config/index.js';

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  status: 'active' | 'suspended' | 'deleted';
  created_at: number | string;
  updated_at: number | string;
}

export interface CreateUserInput {
  email?: string;
  name?: string;
}

export interface UserQuota {
  user_id: string;
  daily_requests: number;
  daily_tokens: number;
  monthly_spend_cap_usd: number;
  max_concurrent_requests: number;
}

export const usersRepo = {
  async create(input: CreateUserInput): Promise<User> {
    const db = await getDatabase();
    const id = nanoid();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [id, input.email || null, input.name || null, now, now]
    );

    // Create default quotas
    await db.execute(
      `INSERT INTO user_quotas (user_id, daily_requests, daily_tokens, monthly_spend_cap_usd, max_concurrent_requests)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        config.defaultDailyRequests,
        config.defaultDailyTokens,
        config.defaultMonthlySpendCapUsd,
        5,
      ]
    );

    return {
      id,
      email: input.email || null,
      name: input.name || null,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
  },

  async getById(id: string): Promise<User | null> {
    const db = await getDatabase();
    return db.queryOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  },

  async getByEmail(email: string): Promise<User | null> {
    const db = await getDatabase();
    return db.queryOne<User>('SELECT * FROM users WHERE email = ?', [email]);
  },

  async updateStatus(id: string, status: 'active' | 'suspended' | 'deleted'): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date().toISOString(), id]
    );
  },

  async getQuota(userId: string): Promise<UserQuota | null> {
    const db = await getDatabase();
    return db.queryOne<UserQuota>('SELECT * FROM user_quotas WHERE user_id = ?', [userId]);
  },

  async updateQuota(userId: string, quota: Partial<Omit<UserQuota, 'user_id'>>): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (quota.daily_requests !== undefined) {
      fields.push('daily_requests = ?');
      values.push(quota.daily_requests);
    }
    if (quota.daily_tokens !== undefined) {
      fields.push('daily_tokens = ?');
      values.push(quota.daily_tokens);
    }
    if (quota.monthly_spend_cap_usd !== undefined) {
      fields.push('monthly_spend_cap_usd = ?');
      values.push(quota.monthly_spend_cap_usd);
    }
    if (quota.max_concurrent_requests !== undefined) {
      fields.push('max_concurrent_requests = ?');
      values.push(quota.max_concurrent_requests);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(userId);
      
      await db.execute(
        `UPDATE user_quotas SET ${fields.join(', ')} WHERE user_id = ?`,
        values
      );
    }
  },

  async list(limit: number = 100, offset: number = 0): Promise<User[]> {
    const db = await getDatabase();
    return db.query<User>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  },
};

