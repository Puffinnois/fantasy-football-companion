-- Sleeper stats scoring spec §3.2: one Sleeper stat line per player-week, as Sleeper publishes it
-- (zeros are absent upstream). Team defenses use the team code, their `players.player_id`.
CREATE TABLE sleeper_week_stats (
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  team TEXT,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, season, week)
);
CREATE INDEX idx_sleeper_week_stats_week ON sleeper_week_stats(season, week);
