/**
 * Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { StubProvider } from '../../src/core/providers/stub.js';
import { z } from 'zod';

describe('StubProvider', () => {
  it('should be available', async () => {
    const provider = new StubProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should return text response', async () => {
    const provider = new StubProvider();
    
    const response = await provider.complete({
      messages: [
        { role: 'user', content: 'Hello' },
      ],
    });

    expect(response.content).toBeTruthy();
    expect(response.usage).toBeDefined();
  });

  it('should return JSON response for probability requests', async () => {
    const provider = new StubProvider();
    
    const response = await provider.complete({
      messages: [
        { role: 'user', content: 'Estimate the probability of this event' },
      ],
      responseFormat: 'json',
    });

    const parsed = JSON.parse(response.content);
    expect(parsed.estimated_probability).toBeDefined();
    expect(parsed.confidence).toBeDefined();
    expect(parsed.key_factors).toBeDefined();
  });

  it('should return structured response', async () => {
    const provider = new StubProvider();
    
    const schema = z.object({
      estimated_probability: z.number(),
      confidence: z.number(),
      key_factors: z.array(z.string()),
      assumptions: z.array(z.string()),
      failure_modes: z.array(z.string()),
    });

    const response = await provider.completeStructured(
      {
        messages: [
          { role: 'user', content: 'Estimate probability' },
        ],
        responseFormat: 'json',
      },
      schema
    );

    expect(response.data.estimated_probability).toBeGreaterThan(0);
    expect(response.data.estimated_probability).toBeLessThan(1);
    expect(response.data.confidence).toBeGreaterThan(0);
    expect(Array.isArray(response.data.key_factors)).toBe(true);
  });

  it('should be deterministic when configured', async () => {
    const provider = new StubProvider(true);
    
    const response1 = await provider.complete({
      messages: [{ role: 'user', content: 'probability' }],
      responseFormat: 'json',
    });

    const response2 = await provider.complete({
      messages: [{ role: 'user', content: 'probability' }],
      responseFormat: 'json',
    });

    expect(response1.content).toBe(response2.content);
  });
});

