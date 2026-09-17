-- DynastyProcess id crosswalk, kept so identities can be re-resolved without re-downloading.
CREATE TABLE crosswalk (
  sleeper_id TEXT,
  gsis_id TEXT,
  pfr_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  name TEXT,
  position TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_crosswalk_sleeper ON crosswalk(sleeper_id);
CREATE INDEX idx_crosswalk_gsis ON crosswalk(gsis_id);

-- Sleeper player_id -> nflverse ids. nflverse_team is set for team defenses only.
CREATE TABLE player_ids (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  gsis_id TEXT,
  pfr_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  nflverse_team TEXT,
  resolution TEXT NOT NULL CHECK (resolution IN ('crosswalk', 'sleeper_gsis', 'sportradar', 'name', 'team', 'unresolved')),
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_player_ids_gsis ON player_ids(gsis_id);
CREATE INDEX idx_player_ids_team ON player_ids(nflverse_team);

-- Numeric nflverse columns live in stats_json keyed by column name; the file's column set changes between seasons.
CREATE TABLE player_week_stats (
  gsis_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  player_name TEXT,
  position TEXT,
  team TEXT,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (gsis_id, season, week)
);
CREATE INDEX idx_player_week_stats_season ON player_week_stats(season, week);

CREATE TABLE team_week_stats (
  team TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team, season, week)
);

CREATE TABLE player_week_snaps (
  pfr_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  team TEXT,
  opponent TEXT,
  position TEXT,
  offense_snaps INTEGER,
  offense_pct REAL,
  defense_snaps INTEGER,
  defense_pct REAL,
  st_snaps INTEGER,
  st_pct REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pfr_id, season, week)
);

CREATE TABLE games (
  game_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  game_type TEXT NOT NULL,
  gameday TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_games_season ON games(season, week);

-- Materialized fantasy points under the league's rules; rebuilt by recomputePoints.
CREATE TABLE player_week_points (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, player_id, season, week)
);
CREATE INDEX idx_player_week_points_week ON player_week_points(league_id, season, week);
