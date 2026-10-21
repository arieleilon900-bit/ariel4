-- פירוט לאירועים (למשל למה הודעת וואטסאפ לא נמסרה), בשביל הדוח היומי
ALTER TABLE events ADD COLUMN detail TEXT;
