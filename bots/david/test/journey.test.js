// Voice, photos, stay messages, blocks, offers list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { scheduled } from '../src/owner.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from '../src/config.js';
import { insertBookingIfFree, setBookingStatus, subscribers } from '../src/store.js';
import { israelToday, addDays } from '../src/logic.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const TECH = '972500000002';
const business = { ...BUSINESS, ownerPhone: OWNER, reviewLinks: { google: 'https://g.page/r/x/review' } };
const apartments = APARTMENTS.map(a => ({
  ...a, photoUrls: [`https://example.com/${a.id}-1.jpg`, `https://example.com/${a.id}-2.jpg`],
  privateInfo: { address: 'הרצל 1', door: 'קוד 1234', wifi: 'david / 5555', parking: 'כחול-לבן' },
}));
const agency = { ...AGENCY, techPhone: TECH };
const templates = { ...TEMPLATES, reminder: { name: 'stay_reminder', lang: 'he' } };
const extra = (client) => ({ client, business, apartments, agency, templates, partners: [] });
const ctxOf = (env) => ({ env, business, apartments, agency, templates, partners: [] });

// Israel hour → a UTC timestamp today at that Israel hour (works in summer and winter).
function atIsraelHour(h, day = israelToday()) {
  for (const off of [2, 3]) {
    const t = Date.parse(`${day}T${String(h).padStart(2, '0')}:05:00Z`) - off * 3600e3;
    const got = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
    if (got === h && israelToday(t) === day) return t;
  }
  throw new Error('no hour');
}

async function confirmedBooking(env, id, checkin, checkout, phone = '972548888888') {
  await insertBookingIfFree(env, { id, aptId: 'apt3', aptName: apartments[2].name, phone, name: 'נועה ברק', checkin, checkout, party: { adults: 2, children: 2, infants: 0 }, total: 2000, arrival: '16:00', notes: '' }, Date.now());
  await setBookingStatus(env, id, 'confirmed');
}

test('voice note is transcribed and answered', async () => {
  const env = { ...fakeEnv(),
    AI: { run: async (model, input) => { assert.ok(input.audio); return { text: 'יש לכם מקום לזוג בסוף השבוע?' }; } },
    downloadMedia: async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'audio/ogg' }),
  };
  const c = scriptedClient([say('בטח! באיזה תאריכים?', (p) => assert.match(p.messages.at(-1).content.at(-1).text, /תמלול:\] יש לכם מקום לזוג/))]);
  await handleMessage(env, { from: '972541010101', id: 'v1', type: 'audio', mediaId: 'M1', text: '' }, extra(c));
  assert.match(env.OUTBOX.at(-1).text, /באיזה תאריכים/);
});

test('failed transcription asks the guest to type and alerts tech', async () => {
  const env = { ...fakeEnv(), downloadMedia: async () => { throw new Error('token expired'); }, AI: { run: async () => ({}) } };
  const c = scriptedClient([say('לא הצלחתי לשמוע, אפשר לכתוב?', (p) => assert.match(p.messages.at(-1).content.at(-1).text, /אי אפשר לשמוע/))]);
  await handleMessage(env, { from: '972541010102', id: 'v2', type: 'audio', mediaId: 'M2', text: '' }, extra(c));
  assert.match(env.OUTBOX.find(o => o.to === TECH).text, /תמלול נכשל/);
});

test('a photo reaches the model as an image', async () => {
  const env = { ...fakeEnv(), downloadMedia: async () => ({ bytes: new Uint8Array([255, 216, 255]), mime: 'image/jpeg' }) };
  const c = scriptedClient([say('אני רואה נזילה, מעדכן את דוד', (p) => {
    const content = p.messages.at(-1).content;
    assert.equal(content[0].type, 'image');
    assert.equal(content[0].source.media_type, 'image/jpeg');
    assert.match(content.at(-1).text, /שלח תמונה\] יש פה מים/);
  })]);
  await handleMessage(env, { from: '972541010103', id: 'i1', type: 'image', mediaId: 'I1', caption: 'יש פה מים', text: '' }, extra(c));
});

test('send_photos sends the apartment photos as images', async () => {
  const env = fakeEnv();
  const c = scriptedClient([
    toolUse('send_photos', { apartment_id: 'apt2' }),
    say('שלחתי תמונות, מה דעתך?', (p) => assert.equal(lastToolResult(p).sent, 2)),
  ]);
  await handleMessage(env, { from: '972541010104', id: 'p1', type: 'text', text: 'יש תמונות?' }, extra(c));
  assert.deepEqual(env.OUTBOX.filter(o => o.image).map(o => o.image), ['https://example.com/apt2-1.jpg', 'https://example.com/apt2-2.jpg']);
});

test('offers list: needs consent, "הסר" removes', async () => {
  const env = fakeEnv();
  const guest = '972541010105';
  const c = scriptedClient([toolUse('subscribe_offers', { customer_consented: true, language: 'he' }), say('מעולה, הוספתי!')]);
  await handleMessage(env, { from: guest, id: 's1', type: 'text', text: 'כן תשלחו לי מבצעים', name: 'דנה' }, extra(c));
  assert.equal((await subscribers(env)).length, 1);

  await handleMessage(env, { from: OWNER, id: 's2', type: 'text', text: 'מבצע: לילה שני בחצי מחיר בדירה 2' }, extra(null));
  assert.ok(env.OUTBOX.some(o => o.to === guest && /חצי מחיר/.test(o.text)));
  assert.match(env.OUTBOX.at(-1).text, /נשלח ל-1 אנשים/);

  await handleMessage(env, { from: guest, id: 's3', type: 'text', text: 'הסר' }, extra(null));
  assert.equal((await subscribers(env)).length, 0);
});

test('David blocks dates by text and the bot treats them as taken', async () => {
  const env = fakeEnv();
  await handleMessage(env, { from: OWNER, id: 'k1', type: 'text', text: 'חסום 3 2027-04-01 2027-04-05 משפחה שלי' }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /חסמתי את קו המים 3/);
  const c = scriptedClient([
    toolUse('find_apartments', { checkin: '2027-04-02', checkout: '2027-04-04', adults: 2, children: 2, infants: 0, needs: [], budget: null }),
    say('תפוס', (p) => assert.ok(lastToolResult(p).apartments.find(a => a.id === 'apt3').why_not.includes('כל הדירות תפוסות בתאריכים האלה'))),
  ]);
  await handleMessage(env, { from: '972541010106', id: 'k2', type: 'text', text: '2+2 באפריל' }, extra(c));

  const id = env.OUTBOX.find(o => /חסימה \d+/.test(o.text)).text.match(/חסימה (\d+)/)[1];
  await handleMessage(env, { from: OWNER, id: 'k3', type: 'text', text: `שחרר ${id}` }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /בוטלה/);
});

test('day-before reminder uses the template, includes door code, and goes once', async () => {
  const env = fakeEnv();
  const today = israelToday();
  await confirmedBooking(env, 'BREM1', addDays(today, 1), addDays(today, 3));
  const t = atIsraelHour(18);
  await scheduled(ctxOf(env), t);
  await scheduled(ctxOf(env), t);
  const sent = env.OUTBOX.filter(o => o.template === 'stay_reminder');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params[0], 'נועה');
  assert.match(sent[0].params[1], /קוד 1234/);
  assert.match(sent[0].params[1], /david \/ 5555/);
});

test('checkout morning and review request go on departure day', async () => {
  const env = fakeEnv();
  const today = israelToday();
  await confirmedBooking(env, 'BOUT1', addDays(today, -2), today);
  await scheduled(ctxOf(env), atIsraelHour(8));
  await scheduled(ctxOf(env), atIsraelHour(14));
  const guestMsgs = env.OUTBOX.filter(o => o.to === '972548888888').map(o => o.text);
  assert.ok(guestMsgs.some(t => /היציאה היום עד 11:00/.test(t)));
  assert.ok(guestMsgs.some(t => /g\.page\/r\/x\/review/.test(t)));
});

test('owner "פנוי" lists free nights', async () => {
  const env = fakeEnv();
  await handleMessage(env, { from: OWNER, id: 'f1', type: 'text', text: 'פנוי' }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /\*קו המים 1\*: \d\d\.\d\d-\d\d\.\d\d/);
});
