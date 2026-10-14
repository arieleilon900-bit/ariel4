-- טבלת הלקוחות של הבוט עצמו (בלי גוגל): הסטטוס של כל פנייה וההיסטוריה שלה
ALTER TABLE conversations ADD COLUMN lead_status TEXT;
ALTER TABLE conversations ADD COLUMN lead_log TEXT;
ALTER TABLE conversations ADD COLUMN lead_note TEXT;
