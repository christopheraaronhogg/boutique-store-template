CREATE TABLE photo_upload_links (
  token_hash TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  publish_on_upload INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE owner_sign_in_attempts (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX owner_sign_in_attempts_ip ON owner_sign_in_attempts (ip, at);
CREATE INDEX owner_sign_in_attempts_at ON owner_sign_in_attempts (at);
