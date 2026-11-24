CREATE TABLE change_history (
  id INTEGER PRIMARY KEY,
  tool TEXT NOT NULL,
  summary TEXT NOT NULL,
  targets TEXT NOT NULL,
  before_state TEXT NOT NULL,
  after_state TEXT NOT NULL,
  undoes INTEGER REFERENCES change_history (id),
  undone_by INTEGER REFERENCES change_history (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
