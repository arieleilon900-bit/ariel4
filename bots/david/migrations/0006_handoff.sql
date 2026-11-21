-- David answers a guest himself: the bot stays quiet in that chat until human_until.
-- bot_at = when the bot last wrote, so the echo of its own message is not mistaken for David.
ALTER TABLE conversations ADD COLUMN human_until INTEGER;
ALTER TABLE conversations ADD COLUMN bot_at INTEGER;
