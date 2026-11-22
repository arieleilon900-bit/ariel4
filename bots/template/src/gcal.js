// Google Calendar: every booking goes into the owner's calendar the moment it is made,
// and anything the owner puts in that calendar by hand makes those nights unavailable.
//
// How it connects (no Google login screens, nothing to renew):
// 1. We create a Google Cloud "service account" and save its key as the secret GCAL_SA_JSON.
// 2. The owner makes a calendar per apartment (or one for all), and in its settings
//    shares it with the service account's email with "Make changes to events".
// 3. The calendar ids go in config: BUSINESS.calendar.
//
// A calendar shared by several apartments: an event blocks an apartment when its title
// names that apartment ("קו המים 2" or "דירה 2"). An event that names none blocks all of
// them (safer to miss a sale than to double-book).

import { getIcalCache, putIcalCache, setBookingGcal, setBlockGcal } from './store.js';
import { addDays, israelToday } from './logic.js';

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const READ_CACHE_MS = 3 * 60e3;   // the owner's manual changes show up within 3 minutes
const LOOKAHEAD_DAYS = 400;

export function calendarConfig(business) {
  const c = business?.calendar || {};
  if (business?.modules?.calendar === false) return null;
  if (!c.googleCalendarId && !Object.keys(c.perApartment || {}).length) return null;
  return c;
}

export function calendarIdFor(business, aptId) {
  const c = calendarConfig(business);
  return c ? (c.perApartment?.[aptId] || c.googleCalendarId || null) : null;
}

// ---------- auth: a signed JWT exchanged for a 1-hour access token ----------
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function pemToPkcs8(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}

export async function signJwt(sa, now = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

let tokenCache = null; // { token, exp } per Worker instance

async function accessToken(env) {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3 && tokenCache.key === env.GCAL_SA_JSON) return tokenCache.token;
  if (!env.GCAL_SA_JSON) throw new Error('GCAL_SA_JSON לא מוגדר (מפתח של חשבון השירות של גוגל)');
  let sa;
  try { sa = JSON.parse(env.GCAL_SA_JSON); } catch { throw new Error('GCAL_SA_JSON הוא לא JSON תקין'); }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signJwt(sa) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Google token: ${json.error_description || json.error || res.status}`);
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000, key: env.GCAL_SA_JSON };
  return json.access_token;
}

export function _resetTokenCache() { tokenCache = null; }

async function gapi(env, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${await accessToken(env)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(res.status === 404 || res.status === 403
      ? `גוגל קלנדר: ${msg}. כנראה היומן לא שותף עם חשבון השירות ("Make changes to events").`
      : `גוגל קלנדר: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const enc = (s) => encodeURIComponent(s);
const nis = (n) => (n == null ? '' : '₪' + Number(n).toLocaleString('en-US'));

// ---------- writing: bookings and blocks ----------
export function bookingEvent(b, status = b.status) {
  const p = b.party || {};
  const who = [p.adults && `${p.adults} מבוגרים`, p.children && `${p.children} ילדים`, p.infants && `${p.infants} תינוקות`].filter(Boolean).join(', ');
  return {
    summary: `${status === 'confirmed' ? '✅' : '⏳ ממתין לאישור:'} ${b.name} · ${b.aptName}`,
    description: [`הזמנה ${b.id}`, `טלפון: +${b.phone}`, who, b.total != null ? `סה"כ: ${nis(b.total)}` : '', b.arrival ? `הגעה: ${b.arrival}` : '', b.notes ? `הערות: ${b.notes}` : '',
      status === 'confirmed' ? '' : `לאישור שלח לבוט: אושר ${b.id}`].filter(Boolean).join('\n'),
    start: { date: b.checkin },
    end: { date: b.checkout },          // all-day, end is exclusive = checkout day, like ours
    colorId: status === 'confirmed' ? '10' : '5',
    transparency: 'opaque',
    extendedProperties: { private: { bookingId: b.id, source: 'bot' } },
  };
}

// Creates or updates the booking's event. Returns the event id.
export async function syncBookingEvent(ctx, b, status = b.status) {
  const calId = calendarIdFor(ctx.business, b.aptId);
  if (!calId) return null;
  if (status === 'cancelled') return removeBookingEvent(ctx, b);
  const body = bookingEvent(b, status);
  if (b.gcalEventId) {
    try {
      await gapi(ctx.env, 'PATCH', `/calendars/${enc(calId)}/events/${enc(b.gcalEventId)}`, body);
      return b.gcalEventId;
    } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; } // deleted by hand: make a new one
  }
  const ev = await gapi(ctx.env, 'POST', `/calendars/${enc(calId)}/events`, body);
  await setBookingGcal(ctx.env, b.id, ev.id);
  return ev.id;
}

export async function removeBookingEvent(ctx, b) {
  const calId = calendarIdFor(ctx.business, b.aptId);
  if (!calId || !b.gcalEventId) return null;
  try { await gapi(ctx.env, 'DELETE', `/calendars/${enc(calId)}/events/${enc(b.gcalEventId)}`); }
  catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
  await setBookingGcal(ctx.env, b.id, null);
  return null;
}

export async function syncBlockEvent(ctx, apt, blk) {
  const calId = calendarIdFor(ctx.business, apt.id);
  if (!calId) return null;
  const ev = await gapi(ctx.env, 'POST', `/calendars/${enc(calId)}/events`, {
    summary: `🔒 חסום · ${apt.name}${blk.note ? ` (${blk.note})` : ''}`,
    description: `חסימה ${blk.id} מהבוט. לביטול שלח לבוט: שחרר ${blk.id}`,
    start: { date: blk.start }, end: { date: blk.end }, colorId: '8', transparency: 'opaque',
    extendedProperties: { private: { blockId: String(blk.id), source: 'bot' } },
  });
  await setBlockGcal(ctx.env, blk.id, ev.id);
  return ev.id;
}

export async function removeBlockEvent(ctx, aptId, eventId) {
  const calId = calendarIdFor(ctx.business, aptId);
  if (!calId || !eventId) return;
  try { await gapi(ctx.env, 'DELETE', `/calendars/${enc(calId)}/events/${enc(eventId)}`); }
  catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
}

// ---------- reading: what's in the calendar ----------
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const israelClock = (iso) => clock.format(new Date(Date.parse(iso)));

function israelDate(iso) {
  return israelToday(Date.parse(iso));
}

// An event → the nights it covers [start, end). Timed events block every night they touch.
export function eventRange(ev) {
  if (ev.start?.date) return { start: ev.start.date, end: ev.end?.date || addDays(ev.start.date, 1) };
  if (!ev.start?.dateTime) return null;
  const start = israelDate(ev.start.dateTime);
  const endIso = ev.end?.dateTime || ev.start.dateTime;
  const endDay = israelDate(endIso);
  // A multi-day event that ends by 14:00 (a checkout) frees that evening's night;
  // otherwise the end day's night is taken too. Same-day events block that night.
  const endsByCheckout = israelClock(endIso) <= '14:00';
  return { start, end: endsByCheckout && endDay > start ? endDay : addDays(endDay, 1) };
}

async function listEvents(env, calId) {
  const key = `gcal:${calId}`;
  const cached = await getIcalCache(env, key, READ_CACHE_MS);
  if (cached) return cached;
  const today = israelToday();
  const params = new URLSearchParams({
    timeMin: `${addDays(today, -1)}T00:00:00Z`, timeMax: `${addDays(today, LOOKAHEAD_DAYS)}T00:00:00Z`,
    singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', showDeleted: 'false',
  });
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const r = await gapi(env, 'GET', `/calendars/${enc(calId)}/events?${params}${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`);
    for (const ev of r.items || []) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue; // "free" events don't block
      const range = eventRange(ev);
      if (range && range.end > range.start) out.push({ ...range, summary: ev.summary || '', bot: ev.extendedProperties?.private?.source === 'bot' });
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  await putIcalCache(env, key, out);
  return out;
}

// Does an event in a shared calendar belong to this apartment?
export function eventForApartment(ev, apt, sharedWith) {
  if (sharedWith.length <= 1) return true;
  const title = ev.summary || '';
  const mentions = (a, i) => title.includes(a.name) || new RegExp(`דירה\\s*${i + 1}(?!\\d)`).test(title) || title.includes(a.id);
  const idx = sharedWith.findIndex(a => a.id === apt.id);
  if (mentions(apt, idx)) return true;
  return !sharedWith.some((a, i) => mentions(a, i)); // names no apartment: blocks all
}

// Busy ranges from Google for one apartment. Throws if Google can't be read.
export async function googleBusy(ctx, apt) {
  const calId = calendarIdFor(ctx.business, apt.id);
  if (!calId) return [];
  const events = await listEvents(ctx.env, calId);
  const sharedWith = (ctx.apartments || [apt]).filter(a => calendarIdFor(ctx.business, a.id) === calId);
  // The bot's own events are already in its database (and an expired request's event
  // must not keep the dates), so only what the owner added by hand counts here.
  return events.filter(ev => !ev.bot && eventForApartment(ev, apt, sharedWith)).map(ev => ({ start: ev.start, end: ev.end }));
}

// Quick check for setup day: can we read and write each calendar?
export async function checkCalendars(ctx) {
  const out = [];
  for (const apt of ctx.apartments) {
    const calId = calendarIdFor(ctx.business, apt.id);
    if (!calId) { out.push({ apt: apt.name, ok: false, error: 'אין יומן מוגדר' }); continue; }
    try {
      const cal = await gapi(ctx.env, 'GET', `/calendars/${enc(calId)}`);
      out.push({ apt: apt.name, ok: true, calendar: cal.summary });
    } catch (e) { out.push({ apt: apt.name, ok: false, error: e.message }); }
  }
  return out;
}
