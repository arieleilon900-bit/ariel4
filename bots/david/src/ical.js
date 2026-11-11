// Reads the iCal export links that Airbnb, Booking and Google Calendar give for
// each listing, and turns them into busy ranges [{start, end}] (end = checkout day).

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

// Busy ranges for one apartment: its own bookings plus every calendar link,
// cached in KV for 15 minutes so we don't fetch Airbnb on every message.
export async function busyFor(apt, env, ownBookings = []) {
  const ranges = ownBookings.map(b => ({ start: b.checkin, end: b.checkout }));
  for (const url of apt.icalUrls || []) {
    const key = 'ical:' + url;
    let cached = env.BOT_KV ? await env.BOT_KV.get(key, 'json') : null;
    if (!cached) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'booking-bot' } });
        if (res.ok) {
          cached = parseIcal(await res.text());
          if (env.BOT_KV) await env.BOT_KV.put(key, JSON.stringify(cached), { expirationTtl: 900 });
        }
      } catch (e) {
        console.error('ical fetch failed', apt.id, e);
      }
    }
    if (cached) ranges.push(...cached);
  }
  return ranges;
}
