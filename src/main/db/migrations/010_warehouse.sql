-- Stats warehouse (spec 2026-10-09 §3). Nothing in the app reads these tables yet.
-- One row per source × player × week. data_json: every column the source publishes for that row;
-- numbers as numbers, text as strings, arrays where a source lists several entries; empty / NA dropped.
CREATE TABLE wh_player_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,              -- 0 = a season-level row the source publishes itself (NGS, QBR)
  player_key TEXT NOT NULL,           -- the source's own id
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  team TEXT,
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, player_key)
);
CREATE INDEX idx_wh_player_week_key ON wh_player_week(player_key, season);

CREATE TABLE wh_team_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,
  team TEXT NOT NULL,                 -- nflverse team code
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, team)
);

-- The full schedules row (all 46 columns).
CREATE TABLE wh_game (
  game_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_wh_game_season ON wh_game(season, week);

-- Season-independent profiles (combine, latest roster bio).
CREATE TABLE wh_player (
  source TEXT NOT NULL,
  player_key TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, player_key)
);

-- Durable fetch record. sync_log is pruned after 30 days, so it cannot remember that 2019 is done.
-- season = 0 for sources published as one all-seasons file.
CREATE TABLE wh_source_state (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  version INTEGER NOT NULL,           -- the adapter version that wrote the rows
  rows INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  sealed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source, season)
);
