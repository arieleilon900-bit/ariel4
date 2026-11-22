-- Google Calendar: the event created for each booking and each manual block,
-- so confirming updates it and cancelling/releasing deletes it.
ALTER TABLE bookings ADD COLUMN gcal_event_id TEXT;
ALTER TABLE blocks ADD COLUMN gcal_event_id TEXT;
