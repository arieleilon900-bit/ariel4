-- David's bot: everything it remembers. Cloudflare D1 (SQLite).
-- Apply: npx wrangler d1 migrations apply david-bot --remote

CREATE TABLE IF NOT EXISTS conversations (
  phone        TEXT PRIMARY KEY,
  name         TEXT,
  messages     TEXT NOT NULL DEFAULT '[]',   -- JSON [{role, text}], text only
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER,
  last_user_at INTEGER,
  quoted_at    INTEGER,                      -- got a price
  booked_at    INTEGER,
  referred_at  INTEGER,
  followups    INTEGER NOT NULL DEFAULT 0,
  opted_out    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS conv_followup ON conversations(quoted_at, last_user_at);

CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL,                -- pending | confirmed | cancelled
  created_at   INTEGER NOT NULL,
  confirmed_at INTEGER,
  apt_id       TEXT NOT NULL,
  apt_name     TEXT,
  phone        TEXT NOT NULL,
  name         TEXT,
  checkin      TEXT NOT NULL,                -- YYYY-MM-DD
  checkout     TEXT NOT NULL,                -- YYYY-MM-DD, exclusive
  adults       INTEGER, children INTEGER, infants INTEGER,
  total        INTEGER,
  arrival      TEXT,
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS bookings_apt ON bookings(apt_id, checkin, checkout);
CREATE INDEX IF NOT EXISTS bookings_days ON bookings(checkin, checkout);

CREATE TABLE IF NOT EXISTS referrals (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,                 -- sent | closed | lost
  created_at  INTEGER NOT NULL,
  closed_at   INTEGER,
  phone       TEXT NOT NULL,
  reason      TEXT,
  data        TEXT NOT NULL,                 -- JSON: what the guest asked for
  candidates  TEXT,                          -- JSON partner ids
  commission  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS referrals_created ON referrals(created_at);

CREATE TABLE IF NOT EXISTS stats (
  week  TEXT NOT NULL,                       -- Sunday that starts the week
  field TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, field)
);

-- One row per model call: what the bot costs us (internal, never shown to David).
CREATE TABLE IF NOT EXISTS usage (
  ts            INTEGER NOT NULL,
  phone         TEXT,
  model         TEXT,
  input_tokens  INTEGER, output_tokens INTEGER,
  cache_read    INTEGER, cache_write INTEGER,
  cost_micros   INTEGER NOT NULL             -- USD × 1,000,000
);
CREATE INDEX IF NOT EXISTS usage_ts ON usage(ts);

CREATE TABLE IF NOT EXISTS seen_messages (id TEXT PRIMARY KEY, ts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS ical_cache (url TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL);

-- Problems, for alert throttling and the /health page.
CREATE TABLE IF NOT EXISTS errors (
  ts      INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  detail  TEXT,
  alerted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS errors_kind ON errors(kind, ts);
