-- יומן גוגל: המזהה של התור ביומן של בעל העסק, כדי למחוק אותו בביטול
ALTER TABLE jobs ADD COLUMN gcal_event_id TEXT;
