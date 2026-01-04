/**
 * Server Configuration
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  port: z.coerce.number().default(3100),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  databaseUrl: z.string().optional(),
  sqlitePath: z.string().optional(),
  
  // LLM Providers
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  
  // Admin
  adminToken: z.string().min(16),
  
  // Rate Limiting
  rateLimitMax: z.coerce.number().default(60),
  rateLimitWindowMs: z.coerce.number().default(60000),
  
  // Default Quotas
  defaultDailyRequests: z.coerce.number().default(1000),
  defaultDailyTokens: z.coerce.number().default(100000),
  defaultMonthlySpendCapUsd: z.coerce.number().default(50),
  
  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logPrompts: z.coerce.boolean().default(false),
  
  // JWT (optional)
  jwtSecret: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const raw = {
    port: process.env.PORT,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    sqlitePath: process.env.SQLITE_PATH,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    adminToken: process.env.ADMIN_TOKEN,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    defaultDailyRequests: process.env.DEFAULT_DAILY_REQUESTS,
    defaultDailyTokens: process.env.DEFAULT_DAILY_TOKENS,
    defaultMonthlySpendCapUsd: process.env.DEFAULT_MONTHLY_SPEND_CAP_USD,
    logLevel: process.env.LOG_LEVEL,
    logPrompts: process.env.LOG_PROMPTS,
    jwtSecret: process.env.JWT_SECRET,
  };

  const result = ConfigSchema.safeParse(raw);
  
  if (!result.success) {
    console.error('Configuration validation failed:');
    for (const error of result.error.errors) {
      console.error(`  ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

// Model allowlists
export const ALLOWED_MODELS = {
  openai: [
    'gpt-4-turbo-preview',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
};

// Cost per 1K tokens (approximate)
export const TOKEN_COSTS = {
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
} as Record<string, { input: number; output: number }>;

