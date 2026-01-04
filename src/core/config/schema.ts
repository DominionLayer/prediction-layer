/**
 * Configuration Schema - Zod validation for all config
 */

import { z } from 'zod';

export const OpenAIConfigSchema = z.object({
  model: z.string().default('gpt-4-turbo-preview'),
  temperature: z.number().min(0).max(2).default(0.2),
  max_tokens: z.number().positive().default(2048),
});

export const AnthropicConfigSchema = z.object({
  model: z.string().default('claude-3-5-sonnet-20241022'),
  temperature: z.number().min(0).max(1).default(0.2),
  max_tokens: z.number().positive().default(2048),
});

export const StubConfigSchema = z.object({
  deterministic: z.boolean().default(true),
});

export const ProviderConfigSchema = z.object({
  default: z.enum(['openai', 'anthropic', 'stub']).default('stub'),
  openai: OpenAIConfigSchema.optional(),
  anthropic: AnthropicConfigSchema.optional(),
  stub: StubConfigSchema.optional(),
});

export const PolymarketConfigSchema = z.object({
  base_url: z.string().url().default('https://clob.polymarket.com'),
  gamma_url: z.string().url().default('https://gamma-api.polymarket.com'),
  poll_interval_sec: z.number().positive().default(60),
  timeout_ms: z.number().positive().default(30000),
});

export const ScoringConfigSchema = z.object({
  min_liquidity: z.number().nonnegative().default(1000),
  min_volume: z.number().nonnegative().default(100),
  max_spread: z.number().min(0).max(1).default(0.10),
  default_top_n: z.number().positive().default(20),
});

export const SimulationConfigSchema = z.object({
  fee_bps: z.number().nonnegative().default(100),
  slippage_bps: z.number().nonnegative().default(50),
  confidence_band: z.number().min(0).max(0.5).default(0.10),
  default_position_size: z.number().positive().default(10),
});

export const ReportingConfigSchema = z.object({
  out_dir: z.string().default('./reports'),
  include_raw_data: z.boolean().default(false),
});

export const RateLimitsConfigSchema = z.object({
  polymarket_rps: z.number().positive().default(5),
  llm_rpm: z.number().positive().default(20),
  max_retries: z.number().nonnegative().default(3),
  base_delay_ms: z.number().positive().default(1000),
  max_delay_ms: z.number().positive().default(30000),
});

export const DatabaseConfigSchema = z.object({
  path: z.string().default('./data/polymarket.db'),
  wal_mode: z.boolean().default(true),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),
  file: z.string().optional(),
});

export const GeneralConfigSchema = z.object({
  name: z.string().default('Polymarket Analysis'),
  environment: z.enum(['development', 'production']).default('development'),
});

export const GatewayConfigSchema = z.object({
  url: z.string().url().default('https://web-production-2fb66.up.railway.app'),
  token: z.string().optional(),
});

export const ConfigSchema = z.object({
  general: GeneralConfigSchema.default({}),
  provider: ProviderConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  polymarket: PolymarketConfigSchema.default({}),
  scoring: ScoringConfigSchema.default({}),
  simulation: SimulationConfigSchema.default({}),
  reporting: ReportingConfigSchema.default({}),
  rate_limits: RateLimitsConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type PolymarketConfig = z.infer<typeof PolymarketConfigSchema>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;

