-- Waitlist: a guest whose dates were taken asked to be told if they free up.
-- apt_id NULL = any apartment that fits. status: waiting | notified | expired | failed
CREATE TABLE IF NOT EXISTS waitlist (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,              -- WhatsApp number (digits with country code)
  name       TEXT,
  apt_id     TEXT,
  checkin    TEXT NOT NULL,
  checkout   TEXT NOT NULL,
  adults     INTEGER, children INTEGER, infants INTEGER,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'waiting'
);
CREATE INDEX IF NOT EXISTS waitlist_open ON waitlist(status, checkin);

-- Add-ons a guest with a confirmed booking asks for (late checkout, a gift basket...).
-- status: pending | confirmed | declined
CREATE TABLE IF NOT EXISTS addon_requests (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  addon_id   TEXT NOT NULL,
  name       TEXT,
  price      INTEGER,
  phone      TEXT NOT NULL,
  chat       TEXT,                       -- Instagram chat id if the guest wrote from there
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
