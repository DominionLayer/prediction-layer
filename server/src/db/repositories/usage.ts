/**
 * Usage Records Repository
 */

import { nanoid } from 'nanoid';
import { getDatabase } from '../index.js';
import { TOKEN_COSTS } from '../../config/index.js';

export interface UsageRecord {
  id: string;
  user_id: string;
  request_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_estimate_usd: number;
  latency_ms: number;
  status: 'success' | 'error';
  error_message: string | null;
  created_at: number | string;
}

export interface DailyUsage {
  user_id: string;
  date: string;
  request_count: number;
  total_tokens: number;
  total_cost_usd: number;
}

export interface CreateUsageInput {
  userId: string;
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export const usageRepo = {
  async record(input: CreateUsageInput): Promise<UsageRecord> {
    const db = await getDatabase();
    const id = nanoid();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Calculate cost estimate
    const costs = TOKEN_COSTS[input.model] || { input: 0.001, output: 0.002 };
    const costEstimate = 
      (input.inputTokens / 1000) * costs.input +
      (input.outputTokens / 1000) * costs.output;

    // Insert usage record
    await db.execute(
      `INSERT INTO usage_records 
       (id, user_id, request_id, provider, model, input_tokens, output_tokens, cost_estimate_usd, latency_ms, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.userId,
        input.requestId,
        input.provider,
        input.model,
        input.inputTokens,
        input.outputTokens,
        costEstimate,
        input.latencyMs,
        input.status,
        input.errorMessage || null,
        new Date().toISOString(),
      ]
    );

    // Update daily usage summary (upsert)
    await db.execute(
      `INSERT INTO daily_usage (user_id, date, request_count, total_tokens, total_cost_usd)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         request_count = daily_usage.request_count + 1,
         total_tokens = daily_usage.total_tokens + ?,
         total_cost_usd = daily_usage.total_cost_usd + ?`,
      [
        input.userId,
        today,
        input.inputTokens + input.outputTokens,
        costEstimate,
        input.inputTokens + input.outputTokens,
        costEstimate,
      ]
    );

    return {
      id,
      user_id: input.userId,
      request_id: input.requestId,
      provider: input.provider,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_estimate_usd: costEstimate,
      latency_ms: input.latencyMs,
      status: input.status,
      error_message: input.errorMessage || null,
      created_at: now,
    };
  },

  async getDailyUsage(userId: string, date?: string): Promise<DailyUsage | null> {
    const db = await getDatabase();
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    return db.queryOne<DailyUsage>(
      'SELECT * FROM daily_usage WHERE user_id = ? AND date = ?',
      [userId, targetDate]
    );
  },

  async getMonthlyUsage(userId: string, year: number, month: number): Promise<DailyUsage[]> {
    const db = await getDatabase();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    
    return db.query<DailyUsage>(
      `SELECT * FROM daily_usage 
       WHERE user_id = ? AND date >= ? AND date < ?
       ORDER BY date`,
      [userId, startDate, endDate]
    );
  },

  async getUsageHistory(
    userId: string,
    options: { limit?: number; offset?: number; startDate?: string; endDate?: string } = {}
  ): Promise<UsageRecord[]> {
    const db = await getDatabase();
    const { limit = 100, offset = 0, startDate, endDate } = options;

    let sql = 'SELECT * FROM usage_records WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(new Date(startDate).getTime());
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(new Date(endDate).getTime());
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.query<UsageRecord>(sql, params);
  },

  async getUsageStats(userId: string): Promise<{
    today: { requests: number; tokens: number; cost: number };
    thisMonth: { requests: number; tokens: number; cost: number };
    allTime: { requests: number; tokens: number; cost: number };
  }> {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

    // Today
    const todayUsage = await db.queryOne<DailyUsage>(
      'SELECT * FROM daily_usage WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    // This month
    const monthRows = await db.query<DailyUsage>(
      'SELECT * FROM daily_usage WHERE user_id = ? AND date >= ?',
      [userId, monthStart]
    );
    const monthStats = monthRows.reduce(
      (acc, row) => ({
        requests: acc.requests + row.request_count,
        tokens: acc.tokens + row.total_tokens,
        cost: acc.cost + row.total_cost_usd,
      }),
      { requests: 0, tokens: 0, cost: 0 }
    );

    // All time
    const allTimeRows = await db.query<DailyUsage>(
      'SELECT * FROM daily_usage WHERE user_id = ?',
      [userId]
    );
    const allTimeStats = allTimeRows.reduce(
      (acc, row) => ({
        requests: acc.requests + row.request_count,
        tokens: acc.tokens + row.total_tokens,
        cost: acc.cost + row.total_cost_usd,
      }),
      { requests: 0, tokens: 0, cost: 0 }
    );

    return {
      today: {
        requests: todayUsage?.request_count || 0,
        tokens: todayUsage?.total_tokens || 0,
        cost: todayUsage?.total_cost_usd || 0,
      },
      thisMonth: monthStats,
      allTime: allTimeStats,
    };
  },
};

