CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE nfl_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  display_week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE leagues (
  league_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL,
  total_rosters INTEGER NOT NULL,
  sleeper_raw TEXT NOT NULL,
  synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE teams (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL,
  owner_id TEXT,
  display_name TEXT NOT NULL,
  team_name TEXT,
  avatar TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  fpts REAL NOT NULL DEFAULT 0,
  fpts_against REAL NOT NULL DEFAULT 0,
  is_me INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, roster_id)
);

CREATE TABLE players (
  player_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  fantasy_positions TEXT,
  team TEXT,
  status TEXT,
  injury_status TEXT,
  age INTEGER,
  years_exp INTEGER,
  depth_chart_order INTEGER,
  search_rank INTEGER,
  gsis_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team);

CREATE TABLE roster_players (
  league_id TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('starter', 'bench', 'ir', 'taxi')),
  starter_index INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, roster_id, player_id),
  FOREIGN KEY (league_id, roster_id) REFERENCES teams(league_id, roster_id) ON DELETE CASCADE
);

CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  message TEXT,
  rows_written INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sync_log_source ON sync_log(source, id);
