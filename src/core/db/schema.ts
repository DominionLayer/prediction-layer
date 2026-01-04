/**
 * Database Schema - SQL table definitions
 */

export const SCHEMA_VERSION = 1;

export const TABLES = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Markets table
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  outcomes TEXT NOT NULL, -- JSON array
  end_date INTEGER,
  resolution_source TEXT,
  category TEXT,
  tags TEXT, -- JSON array
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);
CREATE INDEX IF NOT EXISTS idx_markets_end_date ON markets(end_date);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);

-- Market snapshots table
CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),
  yes_price REAL NOT NULL,
  no_price REAL NOT NULL,
  yes_bid REAL,
  yes_ask REAL,
  no_bid REAL,
  no_ask REAL,
  spread REAL,
  volume_24h REAL,
  liquidity REAL,
  open_interest REAL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  raw_data TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_snapshots_market ON market_snapshots(market_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON market_snapshots(timestamp);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES markets(id),
  market_prob REAL NOT NULL,
  model_prob REAL,
  model_confidence REAL,
  edge REAL,
  estimator_type TEXT NOT NULL, -- 'llm' | 'baseline'
  key_factors TEXT, -- JSON array
  assumptions TEXT, -- JSON array
  failure_modes TEXT, -- JSON array
  rationale TEXT,
  ev_yes REAL,
  ev_no REAL,
  recommendation TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_analyses_run ON analyses(run_id);
CREATE INDEX IF NOT EXISTS idx_analyses_market ON analyses(market_id);
CREATE INDEX IF NOT EXISTS idx_analyses_edge ON analyses(edge);

-- Simulations table
CREATE TABLE IF NOT EXISTS simulations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES markets(id),
  position TEXT NOT NULL, -- 'YES' | 'NO'
  entry_price REAL NOT NULL,
  position_size REAL NOT NULL,
  model_prob REAL NOT NULL,
  confidence_band REAL NOT NULL,
  expected_value REAL NOT NULL,
  best_case REAL NOT NULL,
  worst_case REAL NOT NULL,
  break_even_prob REAL NOT NULL,
  fee_bps INTEGER NOT NULL,
  slippage_bps INTEGER NOT NULL,
  scenarios TEXT, -- JSON array
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_simulations_run ON simulations(run_id);
CREATE INDEX IF NOT EXISTS idx_simulations_market ON simulations(market_id);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  completed_at INTEGER,
  error TEXT,
  metadata TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
`;

export const MIGRATIONS: Record<number, string> = {
  1: TABLES,
};

