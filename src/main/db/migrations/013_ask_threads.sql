-- Ask spec §5.3, §6.2 (Plan AG1): threads and their messages, and the model providers.
-- A message keeps its tool calls and results (the screen's cards) and, for the provider that
-- wrote it, the provider's own transcript of the turn, so a follow-up resends it unchanged.
CREATE TABLE ask_threads (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ask_messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES ask_threads (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  calls_json TEXT NOT NULL DEFAULT '[]',
  results_json TEXT NOT NULL DEFAULT '[]',
  flags_json TEXT NOT NULL DEFAULT '[]',
  outcome TEXT,
  model TEXT,
  provider_id INTEGER,
  transcript_json TEXT,
  state_json TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX ask_messages_thread ON ask_messages (thread_id, id);

-- A key is stored as safeStorage ciphertext (DPAPI on Windows), never as text.
CREATE TABLE ask_providers (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('anthropic', 'openai', 'ollama', 'lmstudio')),
  preset TEXT,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('full', 'compact')),
  mode TEXT NOT NULL CHECK (mode IN ('native', 'structured')),
  reasoning TEXT NOT NULL CHECK (reasoning IN ('off', 'low', 'high')),
  key_cipher BLOB,
  active INTEGER NOT NULL DEFAULT 0
);
