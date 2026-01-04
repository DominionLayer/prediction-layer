/**
 * Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigSchema } from '../../src/core/config/schema.js';
import { clearConfigCache } from '../../src/core/config/loader.js';

describe('ConfigSchema', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
  });

  it('should parse minimal config with defaults', () => {
    const result = ConfigSchema.parse({});
    
    expect(result.general.name).toBe('Polymarket Analysis');
    expect(result.provider.default).toBe('stub');
    expect(result.database.path).toBe('./data/polymarket.db');
  });

  it('should parse full config', () => {
    const config = {
      general: {
        name: 'Test Config',
        environment: 'production',
      },
      provider: {
        default: 'openai',
        openai: {
          model: 'gpt-4',
          temperature: 0.5,
          max_tokens: 1000,
        },
      },
      polymarket: {
        base_url: 'https://custom.api.com',
        poll_interval_sec: 120,
      },
      scoring: {
        min_liquidity: 5000,
        min_volume: 500,
        max_spread: 0.05,
      },
      simulation: {
        fee_bps: 50,
        slippage_bps: 25,
        confidence_band: 0.15,
      },
    };

    const result = ConfigSchema.parse(config);
    
    expect(result.general.name).toBe('Test Config');
    expect(result.general.environment).toBe('production');
    expect(result.provider.default).toBe('openai');
    expect(result.provider.openai?.model).toBe('gpt-4');
    expect(result.scoring.min_liquidity).toBe(5000);
    expect(result.simulation.fee_bps).toBe(50);
  });

  it('should reject invalid provider', () => {
    expect(() => ConfigSchema.parse({
      provider: { default: 'invalid' },
    })).toThrow();
  });

  it('should reject invalid temperature', () => {
    expect(() => ConfigSchema.parse({
      provider: {
        openai: { temperature: 5 },
      },
    })).toThrow();
  });

  it('should reject negative liquidity', () => {
    expect(() => ConfigSchema.parse({
      scoring: { min_liquidity: -100 },
    })).toThrow();
  });
});

