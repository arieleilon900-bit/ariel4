-- הבדיקה של 20/10: הודעת הפתיחה האוטומטית של חנן נחשבה בטעות "חנן ענה", והבוט שתק לטלפון של השותף.
-- מאפסים רק את השיחה של טלפון הבדיקה, כדי שהבדיקה תתחיל מחדש
DELETE FROM messages WHERE conv_id IN (SELECT id FROM conversations WHERE phone = '972533776774');
DELETE FROM conversations WHERE phone = '972533776774';
UPDATE customers SET known = 0 WHERE phone = '972533776774';
