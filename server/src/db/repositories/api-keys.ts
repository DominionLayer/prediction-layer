/**
 * API Keys Repository
 */

import { nanoid } from 'nanoid';
import * as argon2 from 'argon2';
import { getDatabase } from '../index.js';

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string | null;
  status: 'active' | 'revoked';
  last_used_at: number | null;
  created_at: number | string;
}

export interface CreateKeyResult {
  keyId: string;
  apiKey: string; // Plaintext - only returned once!
  prefix: string;
}

export const apiKeysRepo = {
  /**
   * Generate and store a new API key
   * Returns plaintext key ONCE - it cannot be retrieved later
   */
  async create(userId: string, name?: string): Promise<CreateKeyResult> {
    const db = await getDatabase();
    
    // Generate a secure API key: dom_<random>
    const keyId = nanoid();
    const rawKey = nanoid(32);
    const apiKey = `dom_${rawKey}`;
    const prefix = apiKey.slice(0, 12); // dom_XXXXXXX
    
    // Hash the key for storage
    const keyHash = await argon2.hash(apiKey);

    await db.execute(
      `INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [keyId, userId, keyHash, prefix, name || null, Date.now()]
    );

    return {
      keyId,
      apiKey, // Return plaintext only once!
      prefix,
    };
  },

  /**
   * Verify an API key and return the associated user ID
   */
  async verify(apiKey: string): Promise<{ userId: string; keyId: string } | null> {
    const db = await getDatabase();
    
    // Extract prefix for faster lookup
    const prefix = apiKey.slice(0, 12);
    
    // Find keys with matching prefix
    const keys = await db.query<ApiKey>(
      `SELECT * FROM api_keys WHERE key_prefix = ? AND status = 'active'`,
      [prefix]
    );

    // Verify against each matching key
    for (const key of keys) {
      try {
        if (await argon2.verify(key.key_hash, apiKey)) {
          // Update last_used_at
          await db.execute(
            'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
            [Date.now(), key.id]
          );
          
          return { userId: key.user_id, keyId: key.id };
        }
      } catch {
        // Continue to next key
      }
    }

    return null;
  },

  async getById(id: string): Promise<ApiKey | null> {
    const db = await getDatabase();
    return db.queryOne<ApiKey>('SELECT * FROM api_keys WHERE id = ?', [id]);
  },

  async getByUser(userId: string): Promise<ApiKey[]> {
    const db = await getDatabase();
    return db.query<ApiKey>(
      'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  },

  async revoke(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE api_keys SET status = 'revoked' WHERE id = ?`,
      [id]
    );
  },

  async revokeAllForUser(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE api_keys SET status = 'revoked' WHERE user_id = ?`,
      [userId]
    );
  },
};

