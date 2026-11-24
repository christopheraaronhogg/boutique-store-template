CREATE TABLE owner_sessions (
  token_hash TEXT PRIMARY KEY,
  password_tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
