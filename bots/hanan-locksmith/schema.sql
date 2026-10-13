-- מסד הנתונים של הבוט (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS customers (
  phone TEXT PRIMARY KEY,           -- 9725XXXXXXXX
  name TEXT,
  lang TEXT,
  first_seen TEXT NOT NULL,
  last_inbound_at TEXT,             -- להחלטה אם אפשר לשלוח טקסט חופשי (חלון 24 שעות)
  jobs_count INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  known INTEGER NOT NULL DEFAULT 0,     -- 1 = מישהו שחנן כבר מדבר איתו: הבוט לא עונה לו
  opted_out INTEGER NOT NULL DEFAULT 0  -- 1 = ביקש "הסר": לא שולחים לו תזכורות, מעקבים, ביקורות והמלצות
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'bot',   -- bot | handoff | closed | spam
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0,
  issue TEXT,
  address TEXT,
  photos TEXT NOT NULL DEFAULT '[]',     -- מזהי מדיה של תמונות שהלקוח שלח
  location TEXT,                       -- קישור וויז אם הלקוח שלח מיקום
  handed_off_at TEXT,
  followup_at TEXT,                    -- מתי לשלוח מעקב ללקוח שלא סגר
  followup_sent INTEGER NOT NULL DEFAULT 0,
  customer_nudges INTEGER NOT NULL DEFAULT 0,  -- כמה פעמים הזכרנו ללקוח שלא ענה (0 / 1 / 2 = הועבר לחנן חלקי)
  owner_replied_at TEXT,                       -- מתי חנן טיפל (ענה מהאפליקציה או שלח פקודה על הלקוח)
  owner_nudges INTEGER NOT NULL DEFAULT 0,     -- כמה תזכורות קיבל חנן על פנייה שלא טופלה
  owner_nudged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_phone ON conversations(phone, state);
-- לכל לקוח לכל היותר שיחה פתוחה אחת (גם כשכמה הודעות מגיעות באותו רגע)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_one_open ON conversations(phone) WHERE state IN ('bot', 'handoff');

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id INTEGER NOT NULL,
  role TEXT NOT NULL,                  -- user | assistant | owner
  text TEXT NOT NULL,
  wa_id TEXT UNIQUE,                   -- למניעת עיבוד כפול של אותה הודעה
  media_id TEXT,                       -- תמונה שהלקוח שלח בהודעה הזו
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  conv_id INTEGER,
  issue TEXT,
  address TEXT,
  scheduled_at TEXT,                   -- לעבודות מתואמות
  reminders_sent INTEGER NOT NULL DEFAULT 0,  -- 0 / 1 (יום לפני) / 2 (שעתיים לפני)
  owner_reminded INTEGER NOT NULL DEFAULT 0,  -- תזכורת לחנן לפני העבודה נשלחה
  done_check_sent INTEGER NOT NULL DEFAULT 0, -- שאלנו את חנן אם סיים (עבודה שעבר זמנה ולא סומנה)
  status TEXT NOT NULL DEFAULT 'open', -- open | done | cancelled
  done_at TEXT,
  invoice_doc_id TEXT,
  invoice_sent_at TEXT,
  review_sent_at TEXT,
  referral_sent_at TEXT,
  yearly_sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                  -- lead | urgent | handoff | spam | reminder | eta | invoice | review | followup | yearly | referral | voice
  phone TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);

-- הודעות שהבוט שלח לחנן על לקוח מסוים: כשחנן עונה (ציטוט) על הודעה כזו, הבוט יודע על מי מדובר
CREATE TABLE IF NOT EXISTS owner_refs (
  wamid TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL
);
