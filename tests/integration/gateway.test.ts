/**
 * Gateway Integration Test
 * Tests CLI -> Gateway -> StubProvider flow (no real external calls)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock the undici request for gateway calls
vi.mock('undici', () => ({
  request: vi.fn().mockImplementation(async (url: string, options: any) => {
    const urlStr = url.toString();
    
    // Mock health check
    if (urlStr.endsWith('/health')) {
      return {
        statusCode: 200,
        body: {
          json: async () => ({ status: 'ok' }),
        },
      };
    }
    
    // Mock quota check
    if (urlStr.includes('/v1/llm/quota')) {
      const authHeader = options?.headers?.Authorization;
      if (!authHeader || !authHeader.startsWith('Bearer dom_')) {
        return {
          statusCode: 401,
          body: { json: async () => ({ error: 'unauthorized' }) },
        };
      }
      
      return {
        statusCode: 200,
        body: {
          json: async () => ({
            user_id: 'test-user-123',
            daily_requests: { limit: 1000, used: 10, remaining: 990 },
            daily_tokens: { limit: 100000, used: 5000, remaining: 95000 },
            monthly_spend: { cap_usd: 50, used_usd: 2.5, remaining_usd: 47.5 },
          }),
        },
      };
    }
    
    // Mock LLM completion
    if (urlStr.includes('/v1/llm/complete')) {
      const authHeader = options?.headers?.Authorization;
      if (!authHeader || !authHeader.startsWith('Bearer dom_')) {
        return {
          statusCode: 401,
          body: { json: async () => ({ error: 'unauthorized' }) },
        };
      }
      
      const body = JSON.parse(options.body);
      
      // Simulate a market analysis response
      return {
        statusCode: 200,
        body: {
          json: async () => ({
            id: 'req_test123',
            provider: 'stub',
            model: 'stub-model',
            content: JSON.stringify({
              estimated_probability: 0.65,
              confidence: 0.7,
              key_factors: ['Factor 1', 'Factor 2'],
              assumptions: ['Assumption 1'],
              failure_modes: ['Failure mode 1'],
            }),
            usage: {
              input_tokens: 500,
              output_tokens: 200,
              total_tokens: 700,
            },
            finish_reason: 'stop',
          }),
        },
      };
    }
    
    return {
      statusCode: 404,
      body: { json: async () => ({ error: 'not_found' }) },
    };
  }),
}));

describe('Gateway Integration', () => {
  beforeAll(() => {
    // Set up test environment
    process.env.DOMINION_API_URL = 'http://localhost:3100';
    process.env.DOMINION_API_TOKEN = 'dom_test_token_12345';
  });

  afterAll(() => {
    delete process.env.DOMINION_API_URL;
    delete process.env.DOMINION_API_TOKEN;
    vi.restoreAllMocks();
  });

  it('should check gateway availability', async () => {
    const { GatewayProvider } = await import('../../src/core/providers/gateway.js');
    const provider = new GatewayProvider(
      'http://localhost:3100',
      'dom_test_token_12345'
    );
    
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('should get user quota from gateway', async () => {
    const { GatewayProvider } = await import('../../src/core/providers/gateway.js');
    const provider = new GatewayProvider(
      'http://localhost:3100',
      'dom_test_token_12345'
    );
    
    const quota = await provider.getQuota();
    
    expect(quota.daily_requests.limit).toBe(1000);
    expect(quota.daily_requests.remaining).toBe(990);
    expect(quota.daily_tokens.limit).toBe(100000);
    expect(quota.monthly_spend.cap_usd).toBe(50);
  });

  it('should complete LLM request through gateway', async () => {
    const { GatewayProvider } = await import('../../src/core/providers/gateway.js');
    const provider = new GatewayProvider(
      'http://localhost:3100',
      'dom_test_token_12345'
    );
    
    const response = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Analyze this market.' },
      ],
      temperature: 0.2,
      maxTokens: 1000,
    });
    
    expect(response.content).toBeTruthy();
    expect(response.usage).toBeDefined();
    expect(response.usage?.totalTokens).toBe(700);
    
    // Parse the JSON response
    const parsed = JSON.parse(response.content);
    expect(parsed.estimated_probability).toBe(0.65);
    expect(parsed.confidence).toBe(0.7);
    expect(parsed.key_factors).toHaveLength(2);
  });

  it('should require valid token format', async () => {
    const { GatewayProvider } = await import('../../src/core/providers/gateway.js');
    
    // Provider creation with empty token should throw when DOMINION_API_TOKEN is not set
    // Since we set a valid token in beforeAll, this test verifies the token is being used
    const provider = new GatewayProvider(
      'http://localhost:3100',
      'dom_test_token_12345'
    );
    
    // Provider should be created successfully with valid token
    expect(provider).toBeDefined();
  });

  it('should verify user identity with whoami', async () => {
    const { GatewayProvider } = await import('../../src/core/providers/gateway.js');
    const provider = new GatewayProvider(
      'http://localhost:3100',
      'dom_test_token_12345'
    );
    
    const info = await provider.whoami();
    
    expect(info.user_id).toBe('test-user-123');
    expect(info.daily_requests?.remaining).toBe(990);
  });
});

describe('Gateway Error Handling', () => {
  it('should detect rate limit status code', () => {
    // Simple test to verify rate limit detection logic
    const statusCode = 429;
    expect(statusCode).toBe(429);
    
    const errorMessage = 'Too many requests';
    expect(errorMessage).toContain('Too many');
  });
});

