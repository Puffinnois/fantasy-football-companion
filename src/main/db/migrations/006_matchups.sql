-- Sleeper weekly matchups (slice 6a spec §3.2): one row per roster and week, replaced per week.
-- starters_json: Sleeper's `starters` in slot order ('0' = empty slot); players_json: the roster that week.
CREATE TABLE matchups (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  matchup_id INTEGER,
  starters_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, season, week, roster_id)
);
