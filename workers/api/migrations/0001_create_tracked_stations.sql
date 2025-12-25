CREATE TABLE IF NOT EXISTS tracked_stations (
  eva_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ds100 TEXT,
  created_at TEXT NOT NULL
);
