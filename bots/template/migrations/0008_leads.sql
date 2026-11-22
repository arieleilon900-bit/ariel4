-- Service businesses: one row per lead the bot handed to the owner.
-- status: open | closed (deal closed, amount in ILS) | lost | done (job done, review asked)
CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  chat       TEXT,                       -- Instagram chat id if the customer wrote from there
  name       TEXT,
  service    TEXT,
  details    TEXT,
  urgent     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open',
  amount     INTEGER,
  created_at INTEGER NOT NULL,
  closed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
