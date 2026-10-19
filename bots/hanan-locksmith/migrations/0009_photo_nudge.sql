-- תזכורת אחת ללקוח לשלוח תמונה, אם הפנייה הועברה לחנן בלי תמונה
ALTER TABLE conversations ADD COLUMN photo_nudged INTEGER DEFAULT 0;
