/**
 * Database Manager - SQLite with migrations
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { SCHEMA_VERSION, MIGRATIONS } from './schema.js';
import { logger } from '../logging/logger.js';

export interface Market {
  id: string;
  condition_id: string;
  question: string;
  description: string | null;
  outcomes: string[];
  end_date: number | null;
  resolution_source: string | null;
  category: string | null;
  tags: string[];
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface MarketSnapshot {
  id: string;
  market_id: string;
  yes_price: number;
  no_price: number;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  spread: number | null;
  volume_24h: number | null;
  liquidity: number | null;
  open_interest: number | null;
  timestamp: number;
  raw_data: unknown | null;
}

export interface Analysis {
  id: string;
  run_id: string;
  market_id: string;
  market_prob: number;
  model_prob: number | null;
  model_confidence: number | null;
  edge: number | null;
  estimator_type: 'llm' | 'baseline';
  key_factors: string[];
  assumptions: string[];
  failure_modes: string[];
  rationale: string | null;
  ev_yes: number | null;
  ev_no: number | null;
  recommendation: string | null;
  created_at: number;
}

export interface Simulation {
  id: string;
  run_id: string;
  market_id: string;
  position: 'YES' | 'NO';
  entry_price: number;
  position_size: number;
  model_prob: number;
  confidence_band: number;
  expected_value: number;
  best_case: number;
  worst_case: number;
  break_even_prob: number;
  fee_bps: number;
  slippage_bps: number;
  scenarios: unknown[];
  created_at: number;
}

export interface Run {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  completed_at: number | null;
  error: string | null;
  metadata: unknown | null;
}

let dbInstance: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance) return dbInstance;

  const finalPath = dbPath || process.env.DATABASE_PATH || './data/polymarket.db';
  const dir = path.dirname(finalPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(finalPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  runMigrations(dbInstance);

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function runMigrations(db: Database.Database): void {
  // Get current version
  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number } | undefined;
    currentVersion = row?.version || 0;
  } catch {
    // Table doesn't exist yet
  }

  // Run pending migrations
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      logger.info(`Running migration to version ${v}`);
      db.exec(migration);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v);
    }
  }
}

// Repository functions

export const marketsRepo = {
  upsert(market: Omit<Market, 'created_at' | 'updated_at'>): void {
    const db = getDatabase();
    const now = Date.now();
    db.prepare(`
      INSERT INTO markets (id, condition_id, question, description, outcomes, end_date, resolution_source, category, tags, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        question = excluded.question,
        description = excluded.description,
        outcomes = excluded.outcomes,
        end_date = excluded.end_date,
        resolution_source = excluded.resolution_source,
        category = excluded.category,
        tags = excluded.tags,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).run(
      market.id,
      market.condition_id,
      market.question,
      market.description,
      JSON.stringify(market.outcomes),
      market.end_date,
      market.resolution_source,
      market.category,
      JSON.stringify(market.tags),
      market.active ? 1 : 0,
      now,
      now
    );
  },

  getById(id: string): Market | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? parseMarket(row) : null;
  },

  getActive(): Market[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM markets WHERE active = 1 ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map(parseMarket);
  },

  getAll(): Market[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM markets ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map(parseMarket);
  },

  search(query: string): Market[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM markets 
      WHERE active = 1 AND (question LIKE ? OR description LIKE ? OR category LIKE ?)
      ORDER BY updated_at DESC
    `).all(`%${query}%`, `%${query}%`, `%${query}%`) as Record<string, unknown>[];
    return rows.map(parseMarket);
  },
};

export const snapshotsRepo = {
  create(snapshot: Omit<MarketSnapshot, 'id' | 'timestamp'>): string {
    const db = getDatabase();
    const id = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO market_snapshots (id, market_id, yes_price, no_price, yes_bid, yes_ask, no_bid, no_ask, spread, volume_24h, liquidity, open_interest, timestamp, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      snapshot.market_id,
      snapshot.yes_price,
      snapshot.no_price,
      snapshot.yes_bid,
      snapshot.yes_ask,
      snapshot.no_bid,
      snapshot.no_ask,
      snapshot.spread,
      snapshot.volume_24h,
      snapshot.liquidity,
      snapshot.open_interest,
      now,
      snapshot.raw_data ? JSON.stringify(snapshot.raw_data) : null
    );
    return id;
  },

  getLatest(marketId: string): MarketSnapshot | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM market_snapshots WHERE market_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(marketId) as Record<string, unknown> | undefined;
    return row ? parseSnapshot(row) : null;
  },

  getHistory(marketId: string, limit: number = 100): MarketSnapshot[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM market_snapshots WHERE market_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all(marketId, limit) as Record<string, unknown>[];
    return rows.map(parseSnapshot);
  },
};

export const analysesRepo = {
  create(analysis: Omit<Analysis, 'id' | 'created_at'>): string {
    const db = getDatabase();
    const id = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO analyses (id, run_id, market_id, market_prob, model_prob, model_confidence, edge, estimator_type, key_factors, assumptions, failure_modes, rationale, ev_yes, ev_no, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      analysis.run_id,
      analysis.market_id,
      analysis.market_prob,
      analysis.model_prob,
      analysis.model_confidence,
      analysis.edge,
      analysis.estimator_type,
      JSON.stringify(analysis.key_factors),
      JSON.stringify(analysis.assumptions),
      JSON.stringify(analysis.failure_modes),
      analysis.rationale,
      analysis.ev_yes,
      analysis.ev_no,
      analysis.recommendation,
      now
    );
    return id;
  },

  getByMarket(marketId: string): Analysis[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM analyses WHERE market_id = ? ORDER BY created_at DESC
    `).all(marketId) as Record<string, unknown>[];
    return rows.map(parseAnalysis);
  },

  getByRun(runId: string): Analysis[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at DESC
    `).all(runId) as Record<string, unknown>[];
    return rows.map(parseAnalysis);
  },

  getTopByEdge(limit: number = 20): Analysis[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM analyses WHERE edge IS NOT NULL ORDER BY ABS(edge) DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(parseAnalysis);
  },
};

export const simulationsRepo = {
  create(sim: Omit<Simulation, 'id' | 'created_at'>): string {
    const db = getDatabase();
    const id = nanoid();
    const now = Date.now();
    db.prepare(`
      INSERT INTO simulations (id, run_id, market_id, position, entry_price, position_size, model_prob, confidence_band, expected_value, best_case, worst_case, break_even_prob, fee_bps, slippage_bps, scenarios, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sim.run_id,
      sim.market_id,
      sim.position,
      sim.entry_price,
      sim.position_size,
      sim.model_prob,
      sim.confidence_band,
      sim.expected_value,
      sim.best_case,
      sim.worst_case,
      sim.break_even_prob,
      sim.fee_bps,
      sim.slippage_bps,
      JSON.stringify(sim.scenarios),
      now
    );
    return id;
  },

  getByMarket(marketId: string): Simulation[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM simulations WHERE market_id = ? ORDER BY created_at DESC
    `).all(marketId) as Record<string, unknown>[];
    return rows.map(parseSimulation);
  },

  getByRun(runId: string): Simulation[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM simulations WHERE run_id = ? ORDER BY created_at DESC
    `).all(runId) as Record<string, unknown>[];
    return rows.map(parseSimulation);
  },
};

export const runsRepo = {
  create(command: string, metadata?: unknown): string {
    const db = getDatabase();
    const id = nanoid();
    db.prepare(`
      INSERT INTO runs (id, command, status, started_at, metadata)
      VALUES (?, ?, 'running', ?, ?)
    `).run(id, command, Date.now(), metadata ? JSON.stringify(metadata) : null);
    return id;
  },

  complete(id: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE runs SET status = 'completed', completed_at = ? WHERE id = ?
    `).run(Date.now(), id);
  },

  fail(id: string, error: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE runs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?
    `).run(Date.now(), error, id);
  },

  getById(id: string): Run | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? parseRun(row) : null;
  },

  getLatest(): Run | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 1').get() as Record<string, unknown> | undefined;
    return row ? parseRun(row) : null;
  },

  getRecent(limit: number = 10): Run[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit) as Record<string, unknown>[];
    return rows.map(parseRun);
  },
};

// Parse helpers
function parseMarket(row: Record<string, unknown>): Market {
  return {
    id: row.id as string,
    condition_id: row.condition_id as string,
    question: row.question as string,
    description: row.description as string | null,
    outcomes: JSON.parse(row.outcomes as string),
    end_date: row.end_date as number | null,
    resolution_source: row.resolution_source as string | null,
    category: row.category as string | null,
    tags: JSON.parse(row.tags as string),
    active: row.active === 1,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

function parseSnapshot(row: Record<string, unknown>): MarketSnapshot {
  return {
    id: row.id as string,
    market_id: row.market_id as string,
    yes_price: row.yes_price as number,
    no_price: row.no_price as number,
    yes_bid: row.yes_bid as number | null,
    yes_ask: row.yes_ask as number | null,
    no_bid: row.no_bid as number | null,
    no_ask: row.no_ask as number | null,
    spread: row.spread as number | null,
    volume_24h: row.volume_24h as number | null,
    liquidity: row.liquidity as number | null,
    open_interest: row.open_interest as number | null,
    timestamp: row.timestamp as number,
    raw_data: row.raw_data ? JSON.parse(row.raw_data as string) : null,
  };
}

function parseAnalysis(row: Record<string, unknown>): Analysis {
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    market_id: row.market_id as string,
    market_prob: row.market_prob as number,
    model_prob: row.model_prob as number | null,
    model_confidence: row.model_confidence as number | null,
    edge: row.edge as number | null,
    estimator_type: row.estimator_type as 'llm' | 'baseline',
    key_factors: JSON.parse(row.key_factors as string || '[]'),
    assumptions: JSON.parse(row.assumptions as string || '[]'),
    failure_modes: JSON.parse(row.failure_modes as string || '[]'),
    rationale: row.rationale as string | null,
    ev_yes: row.ev_yes as number | null,
    ev_no: row.ev_no as number | null,
    recommendation: row.recommendation as string | null,
    created_at: row.created_at as number,
  };
}

function parseSimulation(row: Record<string, unknown>): Simulation {
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    market_id: row.market_id as string,
    position: row.position as 'YES' | 'NO',
    entry_price: row.entry_price as number,
    position_size: row.position_size as number,
    model_prob: row.model_prob as number,
    confidence_band: row.confidence_band as number,
    expected_value: row.expected_value as number,
    best_case: row.best_case as number,
    worst_case: row.worst_case as number,
    break_even_prob: row.break_even_prob as number,
    fee_bps: row.fee_bps as number,
    slippage_bps: row.slippage_bps as number,
    scenarios: JSON.parse(row.scenarios as string || '[]'),
    created_at: row.created_at as number,
  };
}

function parseRun(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    command: row.command as string,
    status: row.status as 'running' | 'completed' | 'failed',
    started_at: row.started_at as number,
    completed_at: row.completed_at as number | null,
    error: row.error as string | null,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  };
}

