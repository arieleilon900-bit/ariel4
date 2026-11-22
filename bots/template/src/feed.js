// A calendar feed per apartment (iCal), for Airbnb, Booking and anything else that
// can "import a calendar". Bookings made through the bot and manual blocks show up there
// as unavailable, so the same night can't be sold twice across platforms.
//   https://<worker>/cal/<CAL_FEED_TOKEN>/<apartment id>.ics
// The platforms poll it every few hours (they decide, not us); the bot itself checks
// Airbnb/Booking's own feeds (icalUrls) every 15 minutes.
// No guest names or phones in the feed: just "unavailable".

import { feedRanges } from './store.js';
import { israelToday, addDays } from './logic.js';

const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (d) => d.replace(/-/g, '');

export function buildIcs(apt, ranges, now = Date.now()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//A.E Automations//booking-bot//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${apt.name}`,
  ];
  for (const r of ranges) {
    lines.push('BEGIN:VEVENT', `UID:${r.uid}-${apt.id}@booking-bot`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${day(r.start)}`, `DTEND;VALUE=DATE:${day(r.end)}`, 'SUMMARY:Not available', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export async function feedResponse(env, apartments, business, token, file, now = Date.now()) {
  if (!env.CAL_FEED_TOKEN || token !== env.CAL_FEED_TOKEN) return new Response('Not found', { status: 404 });
  if (business?.modules?.calendar === false) return new Response('Not found', { status: 404 });
  const apt = apartments.find(a => `${a.id}.ics` === file);
  if (!apt) return new Response('Not found', { status: 404 });
  const ranges = await feedRanges(env, apt.id, addDays(israelToday(now), -30), now);
  return new Response(buildIcs(apt, ranges, now), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}
