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
  };
}

export async function saveConv(env, c) {
  c.messages = c.messages.slice(-KEEP_TURNS);
  while (c.messages.length && c.messages[0].role !== 'user') c.messages.shift(); // history starts with the guest
  await db(env).prepare(`INSERT INTO conversations
      (phone, name, messages, created_at, updated_at, last_user_at, quoted_at, booked_at, referred_at, followups, opted_out)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(phone) DO UPDATE SET name=?2, messages=?3, updated_at=?5, last_user_at=?6, quoted_at=?7,
      booked_at=?8, referred_at=?9, followups=?10, opted_out=?11`)
    .bind(c.phone, c.name || '', JSON.stringify(c.messages), c.createdAt || Date.now(), Date.now(),
      c.lastUserAt ?? null, c.quotedAt ?? null, c.bookedAt ?? null, c.referredAt ?? null, c.followups || 0, c.optedOut ? 1 : 0)
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
    total: r.total, arrival: r.arrival, notes: r.notes,
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
      (id, status, created_at, apt_id, apt_name, phone, name, checkin, checkout, adults, children, infants, total, arrival, notes)
      SELECT ?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
      WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE apt_id = ?3
        AND (status = 'confirmed' OR (status = 'pending' AND created_at > ?15))
        AND checkin < ?8 AND checkout > ?7)`)
    .bind(b.id, now, b.aptId, b.aptName, b.phone, b.name, b.checkin, b.checkout,
      b.party.adults, b.party.children, b.party.infants, b.total, b.arrival, b.notes, now - HOLD_MS)
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

export async function removeBlock(env, id) {
  const r = await db(env).prepare('DELETE FROM blocks WHERE id = ?').bind(Number(id)).run();
  return r.meta.changes === 1;
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
