-- Sleeper weekly projections (unofficial endpoint), stats in Sleeper's vocabulary; scored on read.
CREATE TABLE player_week_projections (
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  company TEXT,
  team TEXT,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, season, week)
);
CREATE INDEX idx_projections_week ON player_week_projections(season, week);

CREATE TABLE watchlist (
  player_id TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);

-- Kickoff wall-clock time in ET ("20:15"), from games.csv.
ALTER TABLE games ADD COLUMN gametime TEXT;
