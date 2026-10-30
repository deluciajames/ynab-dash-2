CREATE TABLE IF NOT EXISTS budget_preferences (
  user_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  settings JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, budget_id)
);
