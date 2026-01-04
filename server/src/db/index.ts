/**
 * Database Connection Manager
 * Supports PostgreSQL (production) and SQLite (MVP/development)
 */

import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { POSTGRES_SCHEMA, SQLITE_SCHEMA } from './schema.js';

export interface DatabaseClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
}

// PostgreSQL Client
class PostgresClient implements DatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const result = await this.pool.query(sql, params);
    return (result.rows[0] as T) || null;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.query(sql, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async initialize(): Promise<void> {
    await this.pool.query(POSTGRES_SCHEMA);
    logger.info('PostgreSQL schema initialized');
  }
}

// SQLite Client (for MVP)
class SqliteClient implements DatabaseClient {
  private db: any; // Better-sqlite3 instance

  constructor(dbPath: string) {
    // Dynamic import for better-sqlite3
    this.initDb(dbPath);
  }

  private async initDb(dbPath: string): Promise<void> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...(params || [])) as T[];
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).get(...(params || [])) as T | null;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (params && params.length > 0) {
      this.db.prepare(sql).run(...params);
    } else {
      this.db.exec(sql);
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async initialize(): Promise<void> {
    this.db.exec(SQLITE_SCHEMA);
    logger.info('SQLite schema initialized');
  }
}

// Database singleton
let db: DatabaseClient | null = null;

export async function getDatabase(): Promise<DatabaseClient> {
  if (db) return db;

  if (config.databaseUrl) {
    const client = new PostgresClient(config.databaseUrl);
    await (client as PostgresClient).initialize();
    db = client;
  } else if (config.sqlitePath) {
    const client = new SqliteClient(config.sqlitePath);
    await (client as SqliteClient).initialize();
    db = client;
  } else {
    // Default to SQLite in ./data
    const client = new SqliteClient('./data/gateway.db');
    await (client as SqliteClient).initialize();
    db = client;
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

