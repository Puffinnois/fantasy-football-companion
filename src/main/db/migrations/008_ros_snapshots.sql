-- One rest-of-season snapshot per week (the last sync while that week is current), so the realism
-- correction can later be backtested against actual points. Sleeper overwrites future-week
-- projections and FantasyPros ROS ranks are replaced on every sync; this is the only history.
CREATE TABLE ros_snapshots (
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,           -- the current week when taken; ROS = weeks after it
  player_id TEXT NOT NULL,
  position TEXT,
  scoring TEXT,                    -- FantasyPros bucket of the ranks; null when unranked
  raw_ros REAL NOT NULL,           -- Sleeper projected points for weeks after `week`, league scoring
  corrected_ros REAL NOT NULL,     -- the same after the realism correction
  factor REAL,
  capped INTEGER NOT NULL,
  shelved INTEGER NOT NULL,
  pos_rank INTEGER,                -- FantasyPros ROS consensus
  rank_ecr INTEGER,
  rank_std REAL,
  rank_min INTEGER,
  rank_max INTEGER,
  experts INTEGER,
  taken_at TEXT NOT NULL,
  PRIMARY KEY (season, week, player_id)
);
