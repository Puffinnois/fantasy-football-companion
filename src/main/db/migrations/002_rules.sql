CREATE TABLE rules (
  league_id TEXT PRIMARY KEY REFERENCES leagues(league_id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('sleeper', 'custom')),
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- position = '' means "all positions"; a named position is an override.
CREATE TABLE scoring_rules (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  stat_key TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, stat_key, position)
);

CREATE TABLE roster_slots (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  count INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, slot)
);
