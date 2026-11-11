-- Stay messages (sent once each), dates David blocks by hand, and the offers list.

ALTER TABLE bookings ADD COLUMN sent TEXT NOT NULL DEFAULT '{}';  -- JSON {reminder: ts, welcome: ts, ...}

CREATE TABLE IF NOT EXISTS blocks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  apt_id    TEXT NOT NULL,
  start     TEXT NOT NULL,                 -- YYYY-MM-DD
  end       TEXT NOT NULL,                 -- YYYY-MM-DD, exclusive
  note      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blocks_apt ON blocks(apt_id, start, end);

-- Guests who agreed to get offers (Israeli spam law: only with consent, and "הסר" removes).
CREATE TABLE IF NOT EXISTS subscribers (
  phone      TEXT PRIMARY KEY,
  name       TEXT,
  lang       TEXT,
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);
