-- Ask spec §5.3 (report D9): verified question → tool-call pairs, for few-shot examples in Plan AG.
-- A question is stored masked ("who leads {position} in {metric} since week {n}") beside the call
-- that answered it; evaluation questions never enter it.
CREATE TABLE ask_examples (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  masked TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_hash TEXT,
  source TEXT NOT NULL CHECK (source IN ('user', 'seed')),
  verified_at TEXT NOT NULL,
  UNIQUE (masked, tool, args_json)
);
