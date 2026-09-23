-- Slice 6c: Sleeper trending adds (latest fetch only), the two stash signals in the weekly
-- snapshot (history for a backtest), and each team's waiver priority.
CREATE TABLE trending_adds (
  player_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

ALTER TABLE ros_snapshots ADD COLUMN market_value INTEGER;
ALTER TABLE ros_snapshots ADD COLUMN trending_adds INTEGER;
ALTER TABLE teams ADD COLUMN waiver_position INTEGER;
