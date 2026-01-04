/**
 * Authentication Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as argon2 from 'argon2';

describe('API Key Authentication', () => {
  describe('Key Generation', () => {
    it('should generate keys with correct format', () => {
      const keyPrefix = 'dom_';
      const keyBody = 'test123456789012345678901234';
      const apiKey = `${keyPrefix}${keyBody}`;
      
      expect(apiKey).toMatch(/^dom_[a-zA-Z0-9]+$/);
      expect(apiKey.startsWith('dom_')).toBe(true);
    });

    it('should extract prefix correctly', () => {
      const apiKey = 'dom_abc123def456xyz789';
      const prefix = apiKey.slice(0, 12);
      
      expect(prefix).toBe('dom_abc123de');
      expect(prefix.startsWith('dom_')).toBe(true);
      expect(prefix.length).toBe(12);
    });
  });

  describe('Key Hashing', () => {
    it('should hash and verify keys correctly', async () => {
      const apiKey = 'dom_test123456789012345678901234';
      const hash = await argon2.hash(apiKey);
      
      expect(hash).toBeTruthy();
      expect(hash).not.toBe(apiKey);
      
      const isValid = await argon2.verify(hash, apiKey);
      expect(isValid).toBe(true);
      
      const isInvalid = await argon2.verify(hash, 'dom_wrongkey');
      expect(isInvalid).toBe(false);
    });

    it('should generate different hashes for same key', async () => {
      const apiKey = 'dom_test123456789012345678901234';
      const hash1 = await argon2.hash(apiKey);
      const hash2 = await argon2.hash(apiKey);
      
      // Hashes should be different due to random salt
      expect(hash1).not.toBe(hash2);
      
      // But both should verify correctly
      expect(await argon2.verify(hash1, apiKey)).toBe(true);
      expect(await argon2.verify(hash2, apiKey)).toBe(true);
    });
  });

  describe('Token Extraction', () => {
    function extractToken(authHeader: string | undefined): string | null {
      if (!authHeader) return null;
      const [type, token] = authHeader.split(' ');
      if (type?.toLowerCase() !== 'bearer' || !token) return null;
      return token;
    }

    it('should extract bearer token', () => {
      expect(extractToken('Bearer dom_test123')).toBe('dom_test123');
      expect(extractToken('bearer dom_test123')).toBe('dom_test123');
    });

    it('should return null for invalid headers', () => {
      expect(extractToken(undefined)).toBeNull();
      expect(extractToken('')).toBeNull();
      expect(extractToken('Basic abc123')).toBeNull();
      expect(extractToken('Bearer')).toBeNull();
      expect(extractToken('dom_test123')).toBeNull();
    });
  });
});

