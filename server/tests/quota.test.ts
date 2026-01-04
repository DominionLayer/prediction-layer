/**
 * Quota Tests
 */

import { describe, it, expect } from 'vitest';

describe('Quota Enforcement', () => {
  describe('Daily Limits', () => {
    function checkDailyRequestLimit(used: number, limit: number): { allowed: boolean; remaining: number } {
      const remaining = Math.max(0, limit - used);
      return {
        allowed: used < limit,
        remaining,
      };
    }

    it('should allow requests under limit', () => {
      const result = checkDailyRequestLimit(50, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(950);
    });

    it('should deny requests at limit', () => {
      const result = checkDailyRequestLimit(1000, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should deny requests over limit', () => {
      const result = checkDailyRequestLimit(1500, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Token Limits', () => {
    function checkTokenLimit(usedTokens: number, limit: number): { allowed: boolean; remaining: number } {
      const remaining = Math.max(0, limit - usedTokens);
      return {
        allowed: usedTokens < limit,
        remaining,
      };
    }

    it('should allow requests under token limit', () => {
      const result = checkTokenLimit(50000, 100000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50000);
    });

    it('should deny requests over token limit', () => {
      const result = checkTokenLimit(150000, 100000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Monthly Spend Cap', () => {
    function checkMonthlyCap(spent: number, cap: number | null): { allowed: boolean; remaining: number | null } {
      if (cap === null) {
        return { allowed: true, remaining: null };
      }
      const remaining = Math.max(0, cap - spent);
      return {
        allowed: spent < cap,
        remaining,
      };
    }

    it('should allow spending under cap', () => {
      const result = checkMonthlyCap(25, 50);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(25);
    });

    it('should deny spending over cap', () => {
      const result = checkMonthlyCap(60, 50);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow unlimited spending when no cap', () => {
      const result = checkMonthlyCap(1000000, null);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeNull();
    });
  });

  describe('Cost Calculation', () => {
    const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    };

    function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
      const costs = TOKEN_COSTS[model] || { input: 0.001, output: 0.002 };
      return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
    }

    it('should calculate GPT-4o cost correctly', () => {
      const cost = calculateCost('gpt-4o', 1000, 500);
      // 1K input * 0.005 + 0.5K output * 0.015 = 0.005 + 0.0075 = 0.0125
      expect(cost).toBeCloseTo(0.0125, 4);
    });

    it('should calculate Claude Haiku cost correctly', () => {
      const cost = calculateCost('claude-3-haiku-20240307', 2000, 1000);
      // 2K input * 0.00025 + 1K output * 0.00125 = 0.0005 + 0.00125 = 0.00175
      expect(cost).toBeCloseTo(0.00175, 5);
    });

    it('should use default cost for unknown models', () => {
      const cost = calculateCost('unknown-model', 1000, 500);
      // 1K * 0.001 + 0.5K * 0.002 = 0.001 + 0.001 = 0.002
      expect(cost).toBeCloseTo(0.002, 4);
    });
  });
});

