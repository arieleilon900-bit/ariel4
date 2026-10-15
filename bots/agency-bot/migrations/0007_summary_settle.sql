-- סיכום אחד לחנן בסוף השיחה: הסיכום מחכה עד שהלקוח שותק כמה דקות, ורק אז נשלח
ALTER TABLE conversations ADD COLUMN summary_due_at TEXT;   -- מתי לשלוח (ריק = אין סיכום שמחכה)
ALTER TABLE conversations ADD COLUMN summary_since TEXT;    -- מתי התחיל לחכות (יש תקרה, כדי שלא יחכה לנצח)
ALTER TABLE conversations ADD COLUMN summary_kind TEXT;     -- new = פנייה חדשה, update = עדכון, cancel = הלקוח ביטל
ALTER TABLE conversations ADD COLUMN owner_note TEXT;       -- הסיכום האחרון של ה-AI לחנן
