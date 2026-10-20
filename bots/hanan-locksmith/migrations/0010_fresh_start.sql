-- יום החיבור של חנן (20/10/2026): מוחקים את כל נתוני הבדיקות (שיחות, לקוחות, אנשי הקשר של המספר של אריאל, סטטיסטיקות),
-- כדי שחנן יתחיל נקי: הטלפון של השותף ייחשב לקוח חדש, ורק אנשי הקשר של חנן יסומנו כמוכרים.
-- נשארים: מה שחנן לימד את הבוט (knowledge) ותשובות הטפסים.
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM jobs;
DELETE FROM customers;
DELETE FROM events;
DELETE FROM owner_refs;
DELETE FROM owner_outbox;
DELETE FROM owner_pending_file;
DELETE FROM ultra_sent;
DELETE FROM settings WHERE key IN ('paused', 'weekly_sent');
