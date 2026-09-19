-- FantasyPros consensus rankings (slice 5 spec §3.4): week 0 = rest of season, 1–18 = weekly start/sit.
CREATE TABLE expert_ranks (
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  player_id TEXT NOT NULL,        -- Sleeper id (team code for DEF)
  scoring TEXT NOT NULL CHECK (scoring IN ('PPR', 'HALF', 'STD')),
  rank_ecr INTEGER NOT NULL,      -- overall consensus rank
  pos_rank INTEGER NOT NULL,      -- numeric part of "RB12"
  rank_ave REAL,
  rank_std REAL,
  rank_min INTEGER,
  rank_max INTEGER,
  experts INTEGER NOT NULL,
  grade TEXT,                     -- weekly start_sit_grade, null for ROS
  proj_pts REAL,                  -- weekly r2p_pts, null for ROS
  updated_at TEXT NOT NULL,
  PRIMARY KEY (season, week, player_id)
);

-- FantasyCalc redraft trade values (format-agnostic market consensus, top ~130 players).
CREATE TABLE market_values (
  season INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  overall_rank INTEGER NOT NULL,
  pos_rank INTEGER NOT NULL,
  tier INTEGER,
  trend_30d INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (season, player_id)
);

-- FantasyPros rows join to Sleeper ids through this column. Forget the crosswalk step's freshness
-- (source = SOURCE_CROSSWALK in sync/nflverseSync.ts) so the next refresh re-downloads the file with it.
ALTER TABLE crosswalk ADD COLUMN fantasypros_id TEXT;
CREATE INDEX idx_crosswalk_fantasypros ON crosswalk(fantasypros_id);
DELETE FROM sync_log WHERE source = 'nflverse:crosswalk';
