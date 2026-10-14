-- הודעה לחנן שנכשלה בשליחה (למשל UltraMsg לא מחובר): נשלחת שוב מה-cron
ALTER TABLE owner_outbox ADD COLUMN failed INTEGER NOT NULL DEFAULT 0;
