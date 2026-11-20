// Google Calendar (write + read) and the iCal feed for Airbnb/Booking.
// Google is simulated: a fake token endpoint that verifies the JWT signature with
// the service account's real public key, and an in-memory calendar.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import worker, { handleMessage } from '../src/index.js';
import { handleOwner, scheduled } from '../src/owner.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from '../src/config.js';
import { getBooking } from '../src/store.js';
import { eventRange, eventForApartment, signJwt, _resetTokenCache } from '../src/gcal.js';
import { buildIcs } from '../src/feed.js';
import { addDays, israelToday } from '../src/logic.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const TECH = '972500000002';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bot@project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const CAL = { apt1: 'cal-apt1@group.calendar.google.com', apt2: 'cal-apt2@group.calendar.google.com', apt3: 'cal-apt3@group.calendar.google.com' };
const business = { ...BUSINESS, ownerPhone: OWNER, calendar: { perApartment: CAL } };
const agency = { ...AGENCY, techPhone: TECH };
const extra = (client, b = business) => ({ client, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const ownerCtx = (env, b = business) => ({ env, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES, phone: OWNER });

// ---------- fake Google ----------
function fakeGoogle({ failWrites = false } = {}) {
  const cals = Object.fromEntries(Object.values(CAL).map(id => [id, new Map()]));
  const g = { cals, tokens: 0, calls: [] };
  let n = 0;
  g.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    g.calls.push(`${init.method || 'GET'} ${u.pathname}`);
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
      const assertion = new URLSearchParams(String(init.body)).get('assertion');
      const [h, p, s] = assertion.split('.');
      const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'));
      const claims = JSON.parse(Buffer.from(p, 'base64url'));
      if (!ok || claims.iss !== SA.client_email || !claims.scope.includes('calendar')) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      g.tokens++;
      return Response.json({ access_token: 'tok-' + g.tokens, expires_in: 3600 });
    }
    assert.match(init.headers?.authorization || '', /^Bearer tok-/);
    const m = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/);
    const cal = m && cals[decodeURIComponent(m[1])];
    if (!cal) return Response.json({ error: { message: 'Not Found' } }, { status: 404 });
    const method = init.method || 'GET';
    if (!u.pathname.includes('/events')) return Response.json({ id: decodeURIComponent(m[1]), summary: 'דירות דוד' });
    if (failWrites && method !== 'GET') return Response.json({ error: { message: 'Backend Error' } }, { status: 500 });
    if (method === 'POST') { const id = 'ev' + (++n); cal.set(id, { id, ...JSON.parse(init.body) }); return Response.json(cal.get(id)); }
    if (method === 'PATCH') { const id = decodeURIComponent(m[2]); if (!cal.has(id)) return Response.json({ error: { message: 'Not Found' } }, { status: 404 }); cal.set(id, { ...cal.get(id), ...JSON.parse(init.body) }); return Response.json(cal.get(id)); }
    if (method === 'DELETE') { const id = decodeURIComponent(m[2]); return cal.delete(id) ? new Response(null, { status: 204 }) : Response.json({ error: { message: 'Not Found' } }, { status: 404 }); }
    return Response.json({ items: [...cal.values()] });
  };
  return g;
}

let realFetch;
function useGoogle(g) { realFetch = realFetch || globalThis.fetch; globalThis.fetch = g.fetch; }
beforeEach(() => { if (realFetch) globalThis.fetch = realFetch; _resetTokenCache(); });

const envWithGoogle = () => ({ ...fakeEnv(), GCAL_SA_JSON: JSON.stringify(SA) });
const CHECKIN = addDays(israelToday(), 40);
const CHECKOUT = addDays(CHECKIN, 2);
const bookingInput = { apartment_id: 'apt1', full_name: 'נועה לוי', checkin: CHECKIN, checkout: CHECKOUT, adults: 2, children: 0, infants: 0, arrival_time: '16:00', notes: '', phone: '' };

async function book(env, from = '972541112233', input = bookingInput, b = business) {
  const c = scriptedClient([toolUse('create_booking_request', input), say('רשמתי!', (p) => assert.ok(lastToolResult(p).booking_id, JSON.stringify(lastToolResult(p))))]);
  await handleMessage(env, { from, id: 'm' + Math.random(), type: 'text', text: 'מאשר' }, extra(c, b));
  return env.OUTBOX.find(o => o.to === OWNER && /בקשת הזמנה/.test(o.text)).text.match(/(B\w+)/)[1];
}

// ---------- tests ----------
test('the service-account JWT is a valid RS256 signature', async () => {
  const jwt = await signJwt(SA, 1_700_000_000);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url')));
  // A key pasted with literal "\n" (how it often lands in a secret) works too.
  const flat = { ...SA, private_key: SA.private_key.replace(/\n/g, '\\n') };
  assert.ok((await signJwt(flat)).split('.').length === 3);
});

test('booking → calendar right away as "waiting"; David approves → ✅; cancel → removed', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  const id = await book(env);
  const cal = g.cals[CAL.apt1];
  assert.equal(cal.size, 1);
  let ev = [...cal.values()][0];
  assert.match(ev.summary, /⏳ ממתין לאישור: נועה לוי · קו המים 1/);
  assert.deepEqual([ev.start.date, ev.end.date], [CHECKIN, CHECKOUT]);
  assert.match(ev.description, /\+972541112233/);
  assert.equal((await getBooking(env, id)).gcalEventId, ev.id);

  await handleOwner(ownerCtx(env), `אושר ${id}`);
  ev = [...cal.values()][0];
  assert.equal(cal.size, 1, 'same event, updated');
  assert.match(ev.summary, /^✅ נועה לוי/);
  assert.equal(ev.colorId, '10');

  await handleOwner(ownerCtx(env), `בוטל ${id}`);
  assert.equal(cal.size, 0, 'cancelled booking leaves the calendar');
  assert.equal(g.tokens, 1, 'one token reused for all calls');
});

test('a night David marks in Google Calendar is not offered, and the guest gets another apartment', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  // David adds "משפחה" by hand on apt1 for those nights.
  g.cals[CAL.apt1].set('manual', { id: 'manual', summary: 'משפחה', start: { date: CHECKIN }, end: { date: CHECKOUT } });
  const c = scriptedClient([
    toolUse('find_apartments', { checkin: CHECKIN, checkout: CHECKOUT, adults: 2, children: 0, infants: 0, needs: [], budget: null }),
    say('קו המים 1 תפוס, אבל 2 פנויה', (p) => {
      const r = lastToolResult(p);
      assert.equal(r.apartments.find(a => a.id === 'apt1').fits, false);
      assert.ok(r.apartments.find(a => a.id === 'apt1').why_not.length);
      assert.equal(r.apartments.find(a => a.id === 'apt2').fits, true);
    }),
  ]);
  await handleMessage(env, { from: '972549990000', id: 'x1', type: 'text', text: 'זוג, בעוד 40 יום' }, extra(c));

  // And booking apt1 directly is refused in code.
  const c2 = scriptedClient([toolUse('create_booking_request', bookingInput), say('תפוס', (p) => assert.match(lastToolResult(p).error, /לא מתאימה/))]);
  await handleMessage(env, { from: '972549990000', id: 'x2', type: 'text', text: 'בכל זאת 1' }, extra(c2));
  assert.equal(g.cals[CAL.apt1].size, 1, 'nothing added');
});

test('two guests, same nights: the second never gets them (and the calendar has one booking)', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  await book(env, '972541111111');
  const c = scriptedClient([toolUse('create_booking_request', { ...bookingInput, full_name: 'אחר' }), say('תפוס', (p) => assert.ok(lastToolResult(p).error))]);
  await handleMessage(env, { from: '972542222222', id: 'y', type: 'text', text: 'אני רוצה' }, extra(c));
  assert.equal(g.cals[CAL.apt1].size, 1);
});

test('the bot\'s own expired request doesn\'t keep the dates, and the hourly job removes it from the calendar', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  const id = await book(env);
  env.DB.raw.prepare('UPDATE bookings SET created_at = ? WHERE id = ?').run(Date.now() - 49 * 3600e3, id);
  await scheduled({ env, business, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES }, Date.now());
  assert.equal(g.cals[CAL.apt1].size, 0);
  // Now someone else can book those nights.
  env.OUTBOX.length = 0;
  await book(env, '972543333333');
});

test('David\'s "חסום" and "שחרר" show in the calendar; "יומן" checks the connection', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  await handleOwner(ownerCtx(env), `חסום 2 ${CHECKIN} ${CHECKOUT} שיפוץ`);
  const blockId = env.OUTBOX.at(-1).text.match(/חסימה (\d+)/)[1];
  const ev = [...g.cals[CAL.apt2].values()][0];
  assert.match(ev.summary, /🔒 חסום · קו המים 2 \(שיפוץ\)/);
  await handleOwner(ownerCtx(env), `שחרר ${blockId}`);
  assert.equal(g.cals[CAL.apt2].size, 0);
  await handleOwner(ownerCtx(env), 'יומן');
  assert.match(env.OUTBOX.at(-1).text, /✅ קו המים 1: מחובר ל"דירות דוד"/);
});

test('Google down: the booking still goes through, the tech partner is alerted, last known calendar is used', async () => {
  const g = fakeGoogle({ failWrites: true }); useGoogle(g);
  const env = envWithGoogle();
  const id = await book(env);
  assert.equal((await getBooking(env, id)).status, 'pending');
  assert.ok(env.OUTBOX.some(o => o.to === TECH && /יומן גוגל/.test(o.text)));
});

test('calendar not shared with the service account: clear error to the tech partner, guest still served', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  const b = { ...business, calendar: { googleCalendarId: 'not-shared@gmail.com' } };
  const c = scriptedClient([
    toolUse('find_apartments', { checkin: CHECKIN, checkout: CHECKOUT, adults: 2, children: 0, infants: 0, needs: [], budget: null }),
    say('יש פנוי'),
  ]);
  await handleMessage(env, { from: '972549990001', id: 'z', type: 'text', text: 'פנוי?' }, extra(c, b));
  const alert = env.OUTBOX.find(o => o.to === TECH);
  assert.match(alert.text, /לא שותף עם חשבון השירות/);
  assert.equal(env.OUTBOX.at(-1).text, 'יש פנוי');
});

test('no calendar configured: no calls to Google at all', async () => {
  const g = fakeGoogle(); useGoogle(g);
  const env = envWithGoogle();
  await book(env, '972541112233', bookingInput, { ...business, calendar: {} });
  assert.equal(g.calls.length, 0);
  await book(fakeEnv(), '972541112244', bookingInput, { ...business, modules: { calendar: false } });
  assert.equal(g.calls.length, 0, 'module off');
});

test('event ranges: all-day, timed, overnight, ending at midnight', () => {
  assert.deepEqual(eventRange({ start: { date: '2027-03-01' }, end: { date: '2027-03-03' } }), { start: '2027-03-01', end: '2027-03-03' });
  // 10:00-12:00 Israel on 1 March blocks that night (better safe).
  assert.deepEqual(eventRange({ start: { dateTime: '2027-03-01T10:00:00+02:00' }, end: { dateTime: '2027-03-01T12:00:00+02:00' } }), { start: '2027-03-01', end: '2027-03-02' });
  // A stay 15:00 on the 1st to 11:00 on the 3rd: nights of the 1st and 2nd, the 3rd is free.
  assert.deepEqual(eventRange({ start: { dateTime: '2027-03-01T15:00:00+02:00' }, end: { dateTime: '2027-03-03T11:00:00+02:00' } }), { start: '2027-03-01', end: '2027-03-03' });
  // Ending in the evening takes that night too.
  assert.deepEqual(eventRange({ start: { dateTime: '2027-03-01T15:00:00+02:00' }, end: { dateTime: '2027-03-03T20:00:00+02:00' } }), { start: '2027-03-01', end: '2027-03-04' });
  assert.deepEqual(eventRange({ start: { dateTime: '2027-03-01T18:00:00+02:00' }, end: { dateTime: '2027-03-03T00:00:00+02:00' } }), { start: '2027-03-01', end: '2027-03-03' });
});

test('one calendar for all apartments: an event naming an apartment blocks only it, one naming none blocks all', () => {
  const apts = APARTMENTS;
  assert.ok(eventForApartment({ summary: 'קו המים 2 - משפחה' }, apts[1], apts));
  assert.ok(!eventForApartment({ summary: 'קו המים 2 - משפחה' }, apts[0], apts));
  assert.ok(eventForApartment({ summary: 'דירה 3 שיפוץ' }, apts[2], apts));
  assert.ok(!eventForApartment({ summary: 'דירה 3 שיפוץ' }, apts[1], apts));
  assert.ok(eventForApartment({ summary: 'חופש' }, apts[0], apts));
  assert.ok(eventForApartment({ summary: 'חופש' }, apts[2], apts));
  assert.ok(eventForApartment({ summary: 'כלום' }, apts[0], [apts[0]]), 'own calendar: everything counts');
});

test('calendar feed for Airbnb/Booking: secret link, .ics, bookings and blocks, no guest details', async () => {
  const env = { ...fakeEnv(), CAL_FEED_TOKEN: 'feed-secret', ALLOW_DRAFT: '1' };
  await book(env, '972541112233', bookingInput, { ...business, calendar: {} });
  await handleOwner(ownerCtx(env, { ...business, calendar: {} }), `חסום 1 ${addDays(CHECKIN, 10)} ${addDays(CHECKIN, 12)}`);
  const get = (path) => worker.fetch(new Request('https://bot' + path), env, { waitUntil() {} });

  assert.equal((await get('/cal/wrong/apt1.ics')).status, 404);
  assert.equal((await get('/cal/feed-secret/nope.ics')).status, 404);
  const res = await get('/cal/feed-secret/apt1.ics');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  const ics = await res.text();
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes(`DTSTART;VALUE=DATE:${CHECKIN.replace(/-/g, '')}`));
  assert.ok(!/נועה|9725/.test(ics), 'no guest name or phone');
  const other = await (await get('/cal/feed-secret/apt2.ics')).text();
  assert.equal((other.match(/BEGIN:VEVENT/g) || []).length, 0);
});

test('our own feed round-trips through our own iCal reader', async () => {
  const { parseIcal } = await import('../src/ical.js');
  const ics = buildIcs(APARTMENTS[0], [{ uid: 'b1', start: '2027-03-01', end: '2027-03-03' }]);
  assert.deepEqual(parseIcal(ics), [{ start: '2027-03-01', end: '2027-03-03' }]);
});
