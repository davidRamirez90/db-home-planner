CREATE TABLE IF NOT EXISTS tracked_routes (
  id TEXT PRIMARY KEY,
  station_eva_id TEXT NOT NULL,
  line TEXT NOT NULL,
  direction TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(station_eva_id, line, direction)
);

CREATE TABLE IF NOT EXISTS route_travel_times (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  label TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(route_id, label)
);
