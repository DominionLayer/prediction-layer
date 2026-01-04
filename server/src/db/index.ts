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

  // Convert ? placeholders to $1, $2, $3 for PostgreSQL
  private convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const pgSql = this.convertPlaceholders(sql);
    const result = await this.pool.query(pgSql, params);
    return result.rows as T[];
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const pgSql = this.convertPlaceholders(sql);
    const result = await this.pool.query(pgSql, params);
    return (result.rows[0] as T) || null;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const pgSql = this.convertPlaceholders(sql);
    await this.pool.query(pgSql, params);
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
  private db: import('better-sqlite3').Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async ensureDb(): Promise<import('better-sqlite3').Database> {
    if (this.db) return this.db;
    
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    return this.db;
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await this.ensureDb();
    return db.prepare(sql).all(...(params || [])) as T[];
  }

  async queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
    const db = await this.ensureDb();
    return db.prepare(sql).get(...(params || [])) as T | null;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const db = await this.ensureDb();
    if (params && params.length > 0) {
      db.prepare(sql).run(...params);
    } else {
      db.exec(sql);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const db = await this.ensureDb();
    db.exec(SQLITE_SCHEMA);
    this.initialized = true;
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

