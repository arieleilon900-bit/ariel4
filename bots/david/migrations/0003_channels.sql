-- Missed calls that became a WhatsApp message (or were skipped, and why).
-- One row per call; the cooldown and the night queue read from here.

CREATE TABLE IF NOT EXISTS missed_calls (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  phone   TEXT NOT NULL,                  -- digits with country code
  ts      INTEGER NOT NULL,               -- when the call came in
  status  TEXT NOT NULL,                  -- sent | queued | skipped | failed
  reason  TEXT,                           -- why skipped/failed
  sent_at INTEGER,
  source  TEXT                            -- twilio | android | voicenter | ...
);
CREATE INDEX IF NOT EXISTS missed_calls_phone ON missed_calls(phone, ts);
CREATE INDEX IF NOT EXISTS missed_calls_status ON missed_calls(status, ts);

-- Where the guest talks to us, when it isn't WhatsApp on bookings.phone
-- (e.g. "ig:<id>" for Instagram). Confirmation/cancellation go there;
-- stay messages still go to the phone on WhatsApp (templates work there).
ALTER TABLE bookings ADD COLUMN chat TEXT;

-- Values the bot updates by itself (e.g. the Instagram token, refreshed weekly:
-- Instagram tokens expire after 60 days and a Worker can't rewrite its own secrets).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
