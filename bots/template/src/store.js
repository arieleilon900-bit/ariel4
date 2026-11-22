// Everything the bot remembers lives in Cloudflare D1 (binding DB). Schema:
// migrations/0001_init.sql. Every query is indexed, so nothing scans all history.

import { weekStart } from './logic.js';

const HOLD_MS = 48 * 3600e3; // a pending request holds its dates for 48 hours
const KEEP_TURNS = 40;

export function newId(prefix) {
  return prefix + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase();
}

const db = (env) => env.DB;

// ---------- dedupe (WhatsApp retries webhooks) ----------
export async function alreadySeen(env, msgId) {
  const r = await db(env).prepare('INSERT OR IGNORE INTO seen_messages (id, ts) VALUES (?, ?)').bind(msgId, Date.now()).run();
  return r.meta.changes === 0;
}

// ---------- conversations ----------
export async function getConv(env, phone) {
  const row = await db(env).prepare('SELECT * FROM conversations WHERE phone = ?').bind(phone).first();
  if (!row) return { phone, name: '', messages: [], createdAt: Date.now(), followups: 0 };
  return {
    phone: row.phone, name: row.name, messages: JSON.parse(row.messages || '[]'),
    createdAt: row.created_at, lastUserAt: row.last_user_at, quotedAt: row.quoted_at,
    bookedAt: row.booked_at, referredAt: row.referred_at, followups: row.followups, optedOut: !!row.opted_out,
    humanUntil: row.human_until || 0, botAt: row.bot_at || 0,
  };
}

export async function saveConv(env, c) {
  c.messages = c.messages.slice(-KEEP_TURNS);
  while (c.messages.length && c.messages[0].role !== 'user') c.messages.shift(); // history starts with the guest
  await db(env).prepare(`INSERT INTO conversations
      (phone, name, messages, created_at, updated_at, last_user_at, quoted_at, booked_at, referred_at, followups, opted_out, human_until, bot_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(phone) DO UPDATE SET name=?2, messages=?3, updated_at=?5, last_user_at=?6, quoted_at=?7,
      booked_at=?8, referred_at=?9, followups=?10, opted_out=?11, human_until=?12, bot_at=?13`)
    .bind(c.phone, c.name || '', JSON.stringify(c.messages), c.createdAt || Date.now(), Date.now(),
      c.lastUserAt ?? null, c.quotedAt ?? null, c.bookedAt ?? null, c.referredAt ?? null, c.followups || 0, c.optedOut ? 1 : 0, c.humanUntil || null, c.botAt || null)
    .run();
}

// Guests who got a price, didn't book or get referred, and went quiet in this window.
export async function followUpCandidates(env, now, minQuietMs, maxQuietMs, followups) {
  const r = await db(env).prepare(`SELECT phone FROM conversations
      WHERE quoted_at IS NOT NULL AND booked_at IS NULL AND referred_at IS NULL AND opted_out = 0
        AND followups = ? AND last_user_at BETWEEN ? AND ?`)
    .bind(followups, now - maxQuietMs, now - minQuietMs).all();
  return Promise.all(r.results.map(x => getConv(env, x.phone)));
}

// ---------- bookings ----------
function toBooking(r) {
  return r && {
    id: r.id, status: r.status, createdAt: r.created_at, confirmedAt: r.confirmed_at,
    aptId: r.apt_id, aptName: r.apt_name, phone: r.phone, name: r.name,
    checkin: r.checkin, checkout: r.checkout,
    party: { adults: r.adults, children: r.children, infants: r.infants },
    total: r.total, arrival: r.arrival, notes: r.notes, chat: r.chat || null, gcalEventId: r.gcal_event_id || null,
  };
}

const ACTIVE = `(status = 'confirmed' OR (status = 'pending' AND created_at > ?))`;

export async function activeBookingsFor(env, aptId, now = Date.now()) {
  const r = await db(env).prepare(`SELECT * FROM bookings WHERE apt_id = ? AND ${ACTIVE} AND checkout >= date('now')`)
    .bind(aptId, now - HOLD_MS).all();
  return r.results.map(toBooking);
}

// Inserts only if no active booking overlaps. One SQL statement, so two guests
// asking for the same night at the same second can't both get it.
export async function insertBookingIfFree(env, b, now = Date.now()) {
  const r = await db(env).prepare(`INSERT INTO bookings
      (id, status, created_at, apt_id, apt_name, phone, name, checkin, checkout, adults, children, infants, total, arrival, notes, chat)
      SELECT ?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?16
      WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE apt_id = ?3
        AND (status = 'confirmed' OR (status = 'pending' AND created_at > ?15))
        AND checkin < ?8 AND checkout > ?7)`)
    .bind(b.id, now, b.aptId, b.aptName, b.phone, b.name, b.checkin, b.checkout,
      b.party.adults, b.party.children, b.party.infants, b.total, b.arrival, b.notes, now - HOLD_MS, b.chat ?? null)
    .run();
  return r.meta.changes === 1;
}

export async function getBooking(env, id) {
  return toBooking(await db(env).prepare('SELECT * FROM bookings WHERE id = ?').bind(String(id).toUpperCase()).first());
}

export async function setBookingStatus(env, id, status) {
  await db(env).prepare('UPDATE bookings SET status = ?, confirmed_at = CASE WHEN ? = \'confirmed\' THEN ? ELSE confirmed_at END WHERE id = ?')
    .bind(status, status, Date.now(), id).run();
}

export async function setBookingTotal(env, id, total) {
  await db(env).prepare('UPDATE bookings SET total = ? WHERE id = ?').bind(total, id).run();
}

export async function bookingsOnDay(env, day) {
  const r = await db(env).prepare(`SELECT * FROM bookings WHERE status = 'confirmed' AND (checkin = ?1 OR checkout = ?1)`).bind(day).all();
  return r.results.map(toBooking);
}

export async function pendingBookings(env, now = Date.now()) {
  const r = await db(env).prepare(`SELECT * FROM bookings WHERE status = 'pending' AND created_at > ? ORDER BY created_at`).bind(now - HOLD_MS).all();
  return r.results.map(toBooking);
}

// ---------- referrals ----------
function toReferral(r) {
  return r && { ...JSON.parse(r.data), id: r.id, status: r.status, createdAt: r.created_at, closedAt: r.closed_at,
    phone: r.phone, reason: r.reason, candidates: JSON.parse(r.candidates || '[]'), commission: r.commission };
}

export async function insertReferral(env, rec) {
  const { id, status, createdAt, phone, reason, candidates, ...data } = rec;
  await db(env).prepare('INSERT INTO referrals (id, status, created_at, phone, reason, data, candidates) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, status, createdAt, phone, reason, JSON.stringify(data), JSON.stringify(candidates || [])).run();
}

export async function getReferral(env, id) {
  return toReferral(await db(env).prepare('SELECT * FROM referrals WHERE id = ?').bind(String(id).toUpperCase()).first());
}

export async function closeReferralRow(env, id, status, commission) {
  await db(env).prepare('UPDATE referrals SET status = ?, commission = ?, closed_at = ? WHERE id = ?')
    .bind(status, commission, Date.now(), id).run();
}

export async function referralsBetween(env, from, to) {
  const r = await db(env).prepare('SELECT * FROM referrals WHERE created_at >= ? AND created_at < ? ORDER BY created_at').bind(from, to).all();
  return r.results.map(toReferral);
}

// ---------- weekly counters ----------
export async function bump(env, field, by = 1, t = Date.now()) {
  await db(env).prepare(`INSERT INTO stats (week, field, value) VALUES (?, ?, ?)
      ON CONFLICT(week, field) DO UPDATE SET value = value + excluded.value`)
    .bind(weekStart(t), field, by).run();
}

export async function getStats(env, week) {
  const r = await db(env).prepare('SELECT field, value FROM stats WHERE week = ?').bind(week).all();
  return Object.fromEntries(r.results.map(x => [x.field, x.value]));
}

// ---------- model usage / cost ----------
export async function logUsage(env, row) {
  await db(env).prepare(`INSERT INTO usage (ts, phone, model, input_tokens, output_tokens, cache_read, cache_write, cost_micros)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(Date.now(), row.phone, row.model, row.input, row.output, row.cacheRead, row.cacheWrite, row.costMicros).run();
}

export async function usageBetween(env, from, to) {
  return db(env).prepare(`SELECT COUNT(*) AS calls, COUNT(DISTINCT phone) AS guests,
      COALESCE(SUM(cost_micros), 0) AS micros, COALESCE(SUM(input_tokens), 0) AS input,
      COALESCE(SUM(output_tokens), 0) AS output, COALESCE(SUM(cache_read), 0) AS cache_read
      FROM usage WHERE ts >= ? AND ts < ?`).bind(from, to).first();
}

// ---------- errors ----------
export async function logError(env, kind, detail) {
  await db(env).prepare('INSERT INTO errors (ts, kind, detail) VALUES (?, ?, ?)').bind(Date.now(), kind, String(detail).slice(0, 2000)).run();
}

// True if this kind already alerted in the last `windowMs` (so we don't flood the phone).
export async function recentlyAlerted(env, kind, windowMs) {
  const r = await db(env).prepare('SELECT 1 FROM errors WHERE kind = ? AND alerted = 1 AND ts > ? LIMIT 1').bind(kind, Date.now() - windowMs).first();
  return !!r;
}

export async function markAlerted(env, kind) {
  await db(env).prepare('UPDATE errors SET alerted = 1 WHERE rowid = (SELECT MAX(rowid) FROM errors WHERE kind = ?)').bind(kind).run();
}

export async function errorsBetween(env, from, to) {
  const r = await db(env).prepare('SELECT kind, COUNT(*) AS n FROM errors WHERE ts >= ? AND ts < ? GROUP BY kind ORDER BY n DESC').bind(from, to).all();
  return r.results;
}

export async function lastError(env) {
  return db(env).prepare('SELECT ts, kind, detail FROM errors ORDER BY ts DESC LIMIT 1').first();
}

// ---------- iCal cache ----------
export async function getIcalCache(env, url, maxAgeMs) {
  const r = await db(env).prepare('SELECT data FROM ical_cache WHERE url = ? AND fetched_at > ?').bind(url, Date.now() - maxAgeMs).first();
  return r ? JSON.parse(r.data) : null;
}

export async function putIcalCache(env, url, ranges) {
  await db(env).prepare(`INSERT INTO ical_cache (url, data, fetched_at) VALUES (?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`)
    .bind(url, JSON.stringify(ranges), Date.now()).run();
}

// ---------- housekeeping (daily) ----------
export async function cleanup(env, now = Date.now()) {
  const d = (days) => now - days * 86400e3;
  await db(env).batch([
    db(env).prepare('DELETE FROM seen_messages WHERE ts < ?').bind(d(3)),
    db(env).prepare('DELETE FROM errors WHERE ts < ?').bind(d(90)),
    db(env).prepare('DELETE FROM waitlist WHERE created_at < ?').bind(d(120)),
    db(env).prepare('DELETE FROM conversations WHERE updated_at < ?').bind(d(180)),
  ]);
}

// ---------- stay messages ----------
// Confirmed bookings by date field, with what was already sent.
export async function confirmedWhere(env, field, day) {
  const col = { checkin: 'checkin', checkout: 'checkout' }[field];
  const r = await db(env).prepare(`SELECT * FROM bookings WHERE status = 'confirmed' AND ${col} = ?`).bind(day).all();
  return r.results.map(row => ({ ...toBooking(row), sent: JSON.parse(row.sent || '{}') }));
}

// Marks a stay message as sent. Returns false if it already was (so it goes once).
export async function markSent(env, bookingId, kind) {
  const r = await db(env).prepare(`UPDATE bookings SET sent = json_set(sent, '$.' || ?1, ?2)
      WHERE id = ?3 AND json_extract(sent, '$.' || ?1) IS NULL`).bind(kind, Date.now(), bookingId).run();
  return r.meta.changes === 1;
}

// ---------- dates David blocks by hand ----------
export async function addBlock(env, aptId, start, end, note) {
  const r = await db(env).prepare('INSERT INTO blocks (apt_id, start, end, note, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(aptId, start, end, note || '', Date.now()).first();
  return r.id;
}

// Returns the removed block ({ aptId, gcalEventId }) or null if there was none.
export async function removeBlock(env, id) {
  const r = await db(env).prepare('DELETE FROM blocks WHERE id = ? RETURNING apt_id, gcal_event_id').bind(Number(id)).first();
  return r ? { aptId: r.apt_id, gcalEventId: r.gcal_event_id } : null;
}

export async function setBlockGcal(env, id, eventId) {
  await db(env).prepare('UPDATE blocks SET gcal_event_id = ? WHERE id = ?').bind(eventId, Number(id)).run();
}

export async function setBookingGcal(env, id, eventId) {
  await db(env).prepare('UPDATE bookings SET gcal_event_id = ? WHERE id = ?').bind(eventId, id).run();
}

export async function expiredPendingWithEvents(env, now = Date.now()) {
  const r = await db(env).prepare(`SELECT * FROM bookings WHERE status = 'pending' AND created_at <= ? AND gcal_event_id IS NOT NULL`)
    .bind(now - HOLD_MS).all();
  return r.results.map(toBooking);
}

// Everything that blocks an apartment's nights, for the calendar feed Airbnb/Booking import.
export async function feedRanges(env, aptId, fromDay, now = Date.now()) {
  const b = await db(env).prepare(`SELECT id, checkin AS start, checkout AS end, status FROM bookings
      WHERE apt_id = ? AND checkout >= ? AND (status = 'confirmed' OR (status = 'pending' AND created_at > ?))`)
    .bind(aptId, fromDay, now - HOLD_MS).all();
  const k = await db(env).prepare('SELECT id, start, end FROM blocks WHERE apt_id = ? AND end >= ?').bind(aptId, fromDay).all();
  return [...b.results.map(r => ({ uid: `booking-${r.id}`, start: r.start, end: r.end })),
          ...k.results.map(r => ({ uid: `block-${r.id}`, start: r.start, end: r.end }))];
}

export async function blocksFor(env, aptId) {
  const r = await db(env).prepare(`SELECT * FROM blocks WHERE apt_id = ? AND end >= date('now') ORDER BY start`).bind(aptId).all();
  return r.results.map(b => ({ id: b.id, start: b.start, end: b.end, note: b.note }));
}

// ---------- offers list ----------
export async function subscribe(env, phone, name, lang) {
  await db(env).prepare(`INSERT INTO subscribers (phone, name, lang, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET removed_at = NULL, name = excluded.name`).bind(phone, name || '', lang || 'he', Date.now()).run();
}

export async function unsubscribe(env, phone) {
  await db(env).prepare('UPDATE subscribers SET removed_at = ? WHERE phone = ?').bind(Date.now(), phone).run();
}

export async function subscribers(env) {
  const r = await db(env).prepare('SELECT phone, name, lang FROM subscribers WHERE removed_at IS NULL').all();
  return r.results;
}

// ---------- missed calls ----------
export async function logMissedCall(env, row) {
  const r = await db(env).prepare(`INSERT INTO missed_calls (phone, ts, status, reason, sent_at, source)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(row.phone, row.ts ?? Date.now(), row.status, row.reason ?? null, row.sentAt ?? null, row.source ?? null).first();
  return r.id;
}

export async function setMissedCall(env, id, status, reason = null) {
  await db(env).prepare('UPDATE missed_calls SET status = ?, reason = ?, sent_at = CASE WHEN ? = \'sent\' THEN ? ELSE sent_at END WHERE id = ?')
    .bind(status, reason, status, Date.now(), id).run();
}

// The last call from this number we answered (or will answer at night's end).
export async function lastMissedCallMessage(env, phone, sinceTs) {
  return db(env).prepare(`SELECT * FROM missed_calls WHERE phone = ? AND status IN ('sent', 'queued') AND ts > ?
      ORDER BY ts DESC LIMIT 1`).bind(phone, sinceTs).first();
}

export async function queuedMissedCalls(env) {
  const r = await db(env).prepare(`SELECT * FROM missed_calls WHERE status = 'queued' ORDER BY ts`).all();
  return r.results;
}

// ---------- settings the bot maintains itself ----------
export async function getSetting(env, key) {
  const r = await db(env).prepare('SELECT value, updated_at FROM settings WHERE key = ?').bind(key).first();
  return r ? { value: r.value, updatedAt: r.updated_at } : null;
}

export async function putSetting(env, key, value) {
  await db(env).prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value, Date.now()).run();
}

// ---------- the owner's saved contacts (no missed-call message to them) ----------
export async function addContacts(env, rows, source) {
  const now = Date.now();
  const stmts = rows.map(r => db(env).prepare(`INSERT INTO contacts (phone, name, source, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET name = COALESCE(NULLIF(excluded.name, ''), contacts.name)`)
    .bind(r.phone, r.name || '', source, now));
  for (let i = 0; i < stmts.length; i += 50) await db(env).batch(stmts.slice(i, i + 50));
  return rows.length;
}

export async function removeContact(env, phone) {
  const r = await db(env).prepare('DELETE FROM contacts WHERE phone = ?').bind(phone).run();
  return r.meta.changes === 1;
}

export async function isContact(env, phone) {
  return !!(await db(env).prepare('SELECT 1 FROM contacts WHERE phone = ?').bind(phone).first());
}

export async function contactCount(env) {
  return (await db(env).prepare('SELECT COUNT(*) AS n FROM contacts').first()).n;
}

// ---------- month summary ----------
export async function bookingStatsBetween(env, from, to) {
  const req = await db(env).prepare('SELECT COUNT(*) n FROM bookings WHERE created_at >= ? AND created_at < ?').bind(from, to).first();
  const ok = await db(env).prepare("SELECT COUNT(*) n, COALESCE(SUM(total), 0) revenue FROM bookings WHERE status = 'confirmed' AND confirmed_at >= ? AND confirmed_at < ?").bind(from, to).first();
  return { requests: req.n, confirmed: ok.n, revenue: ok.revenue };
}

// ---------- waitlist (module: waitlist) ----------
const toWait = (r) => r && { id: r.id, phone: r.phone, name: r.name, aptId: r.apt_id, checkin: r.checkin, checkout: r.checkout,
  party: { adults: r.adults, children: r.children, infants: r.infants }, status: r.status };

export async function addWaitlist(env, w) {
  const dup = await db(env).prepare("SELECT id FROM waitlist WHERE phone = ?1 AND checkin = ?2 AND checkout = ?3 AND IFNULL(apt_id, '') = IFNULL(?4, '') AND status = 'waiting'")
    .bind(w.phone, w.checkin, w.checkout, w.aptId ?? null).first();
  if (dup) return dup.id;
  await db(env).prepare('INSERT INTO waitlist (id, phone, name, apt_id, checkin, checkout, adults, children, infants, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(w.id, w.phone, w.name || '', w.aptId ?? null, w.checkin, w.checkout, w.adults, w.children, w.infants, Date.now(), 'waiting').run();
  return w.id;
}

export async function waitingEntries(env, today) {
  const r = await db(env).prepare("SELECT * FROM waitlist WHERE status = 'waiting' AND checkin >= ? ORDER BY created_at").bind(today).all();
  return r.results.map(toWait);
}

export async function setWaitlistStatus(env, id, status) {
  await db(env).prepare('UPDATE waitlist SET status = ? WHERE id = ?').bind(status, id).run();
}

export async function expireWaitlist(env, today) {
  await db(env).prepare("UPDATE waitlist SET status = 'expired' WHERE status = 'waiting' AND checkin < ?").bind(today).run();
}

// ---------- add-ons (module: addons) ----------
export async function upcomingBookingFor(env, who, today) {
  const r = await db(env).prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND (phone = ?1 OR chat = ?1) AND checkout >= ?2 ORDER BY checkin LIMIT 1").bind(who, today).first();
  return toBooking(r);
}

export async function addAddonRequest(env, r) {
  await db(env).prepare('INSERT INTO addon_requests (id, booking_id, addon_id, name, price, phone, chat, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(r.id, r.bookingId, r.addonId, r.name, r.price ?? null, r.phone, r.chat ?? null, 'pending', Date.now()).run();
}

export async function getAddonRequest(env, id) {
  const r = await db(env).prepare('SELECT * FROM addon_requests WHERE id = ?').bind(String(id).toUpperCase()).first();
  return r && { id: r.id, bookingId: r.booking_id, addonId: r.addon_id, name: r.name, price: r.price, phone: r.phone, chat: r.chat, status: r.status };
}

export async function setAddonStatus(env, id, status) {
  await db(env).prepare('UPDATE addon_requests SET status = ? WHERE id = ?').bind(status, id).run();
}

// ---------- leads (service businesses) ----------
const toLead = (r) => r && { id: r.id, phone: r.phone, chat: r.chat, name: r.name, service: r.service, details: r.details,
  urgent: !!r.urgent, status: r.status, amount: r.amount, createdAt: r.created_at };

export async function addLead(env, l) {
  await db(env).prepare('INSERT INTO leads (id, phone, chat, name, service, details, urgent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(l.id, l.phone, l.chat ?? null, l.name || '', l.service || '', l.details || '', l.urgent ? 1 : 0, 'open', Date.now()).run();
}

export async function getLead(env, id) {
  return toLead(await db(env).prepare('SELECT * FROM leads WHERE id = ?').bind(String(id).toUpperCase()).first());
}

export async function setLeadStatus(env, id, status, amount = null) {
  await db(env).prepare('UPDATE leads SET status = ?, amount = COALESCE(?, amount), closed_at = ? WHERE id = ?').bind(status, amount, Date.now(), id).run();
}

export async function leadsSince(env, ts) {
  const r = await db(env).prepare('SELECT * FROM leads WHERE created_at >= ? ORDER BY created_at').bind(ts).all();
  return r.results.map(toLead);
}
