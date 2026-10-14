-- UltraMsg: מה שהבוט עצמו שלח, כדי להבדיל בין הודעה של הבוט לבין הודעה שחנן כתב מהטלפון (שתיהן מגיעות כ"נשלחה מהמספר")
CREATE TABLE IF NOT EXISTS ultra_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ultra_sent_phone ON ultra_sent (phone, created_at);
