// Reads the iCal export links that Airbnb, Booking and Google Calendar give for
// each listing, and turns them into busy ranges [{start, end}] (end = checkout day).

import { getIcalCache, putIcalCache } from './store.js';

export function parseIcal(text) {
  // Unfold lines (RFC 5545: a line starting with space/tab continues the previous one).
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.end && cur.end > cur.start) out.push(cur);
      cur = null;
    } else if (cur) {
      const m = line.match(/^(DTSTART|DTEND)[^:]*:(\d{4})(\d{2})(\d{2})/);
      if (m) cur[m[1] === 'DTSTART' ? 'start' : 'end'] = `${m[2]}-${m[3]}-${m[4]}`;
    }
  }
  return out;
}

const CACHE_MS = 15 * 60e3;

// Busy ranges for one apartment: its own bookings plus every calendar link,
// cached for 15 minutes so we don't fetch Airbnb on every message.
// onError(kind, detail) reports a calendar that can't be read.
export async function busyFor(apt, env, ownBookings = [], onError = () => {}) {
  const ranges = ownBookings.map(b => ({ start: b.checkin, end: b.checkout }));
  for (const url of apt.icalUrls || []) {
    let cached = await getIcalCache(env, url, CACHE_MS);
    if (!cached) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'booking-bot' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cached = parseIcal(await res.text());
        await putIcalCache(env, url, cached);
      } catch (e) {
        // Fall back to the last copy we have, however old, rather than "all free".
        cached = await getIcalCache(env, url, 1e13);
        await onError('יומן לא נטען', `${apt.name}: ${e.message}${cached ? ' (משתמש בעותק ישן)' : ' (אין עותק, הזמינות לא בטוחה)'}`);
      }
    }
    if (cached) ranges.push(...cached);
  }
  return ranges;
}
