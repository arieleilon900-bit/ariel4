-- Numbers saved in the business owner's phone. A missed call from one of these
-- does NOT get the automatic WhatsApp message (only unknown callers do).
-- Filled by: David sending contact cards to the bot, the "שמור" command,
-- or scripts/import-contacts.js (export from Google Contacts / iPhone).
CREATE TABLE IF NOT EXISTS contacts (
  phone      TEXT PRIMARY KEY,           -- digits with country code
  name       TEXT,
  source     TEXT,                       -- card | command | import
  created_at INTEGER NOT NULL
);
