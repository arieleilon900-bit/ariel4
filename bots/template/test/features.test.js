// David answers a guest himself (the bot goes quiet), deposit payment, monthly summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { handleOwner, scheduled, monthlyText } from '../src/owner.js';
import { handleEcho } from '../src/handoff.js';
import { whatsappEchoes } from '../src/whatsapp.js';
import { instagramEchoes } from '../src/instagram.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from './fixture.js';
import { getConv, saveConv, insertBookingIfFree, getBooking, bump, setBookingStatus } from '../src/store.js';
import { fakeEnv, scriptedClient, say } from './helpers.js';

const OWNER = '972500000001';
const GUEST = '972541000009';
const business = { ...BUSINESS, ownerPhone: OWNER, bookingFlow: 'owner_confirms', paymentLink: '' };
const agency = { ...AGENCY, techPhone: '972500000002' };
const ctxOf = (env, b = business) => ({ env, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const extra = (client, b = business) => ({ client, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const msg = (id, text) => ({ from: GUEST, id, type: 'text', text });

test('WhatsApp and Instagram echoes of David\'s own messages are parsed', () => {
  const wa = whatsappEchoes({ entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ id: 'm1', from: '972500000001', to: GUEST, type: 'text', text: { body: 'אני מגיע' } }] } }] }] });
  assert.deepEqual(wa, [{ id: 'm1', to: GUEST, text: 'אני מגיע', type: 'text' }]);
  const ig = instagramEchoes({ object: 'instagram', entry: [{ id: 'PAGE', messaging: [
    { sender: { id: 'PAGE' }, recipient: { id: 'G1' }, message: { mid: 'e1', is_echo: true, text: 'היי' } },
    { sender: { id: 'G1' }, recipient: { id: 'PAGE' }, message: { mid: 'e2', text: 'שלום' } },
  ] }] });
  assert.deepEqual(ig, [{ id: 'e1', to: 'ig:G1', text: 'היי', type: 'text' }]);
});

test('David answers a guest himself: the bot stays quiet, and "הפעל" gives the chat back', async () => {
  const env = fakeEnv();
  await handleMessage(env, msg('h1', 'היי'), extra(scriptedClient([say('שלום, במה אפשר לעזור?')])));
  assert.equal(env.OUTBOX.length, 1);

  // David types an answer in the app, long after the bot's last message.
  const now = Date.now() + 5 * 60e3;
  assert.equal(await handleEcho(ctxOf(env), { to: GUEST, text: 'היי, כאן דוד, יש לי פנוי' }, now), true);

  // The guest writes again: no model call, no reply.
  await handleMessage(env, msg('h2', 'מעולה, כמה עולה?'), extra(scriptedClient([])));
  assert.equal(env.OUTBOX.length, 1, 'nothing new was sent');
  const conv = await getConv(env, GUEST);
  assert.match(conv.messages.map(m => m.text).join('|'), /דוד ענה בעצמו.*יש לי פנוי/);
  assert.match(conv.messages.at(-1).text, /כמה עולה/);

  // David hands the chat back.
  await handleOwner({ ...ctxOf(env), phone: OWNER }, 'הפעל 054-100-0009');
  await handleMessage(env, msg('h3', 'אז כמה?'), extra(scriptedClient([say('הנה המחיר')])));
  assert.equal(env.OUTBOX.at(-1).text, 'הנה המחיר');
});

test('the echo of the bot\'s own message does not pause the chat', async () => {
  const env = fakeEnv();
  await handleMessage(env, msg('b1', 'היי'), extra(scriptedClient([say('שלום, במה אפשר לעזור?')])));
  // right after the bot wrote
  assert.equal(await handleEcho(ctxOf(env), { to: GUEST, text: 'משהו אחר' }, Date.now() + 5e3), false);
  // later, but the same text the bot said
  assert.equal(await handleEcho(ctxOf(env), { to: GUEST, text: 'שלום, במה אפשר לעזור?' }, Date.now() + 10 * 60e3), false);
  await handleMessage(env, msg('b2', 'שאלה'), extra(scriptedClient([say('בבקשה')])));
  assert.equal(env.OUTBOX.at(-1).text, 'בבקשה');
});

test('"השתק" pauses a chat by hand; the pause ends by itself', async () => {
  const env = fakeEnv();
  await handleOwner({ ...ctxOf(env), phone: OWNER }, 'השתק 0541000009');
  assert.match(env.OUTBOX.at(-1).text, /לא יענה/);
  assert.ok((await getConv(env, GUEST)).humanUntil > Date.now());
  const c = await getConv(env, GUEST);
  c.humanUntil = Date.now() - 1000;
  await saveConv(env, c);
  await handleMessage(env, msg('p1', 'היי'), extra(scriptedClient([say('חזרתי')])));
  assert.equal(env.OUTBOX.at(-1).text, 'חזרתי');
});

const pay = { ...business, bookingFlow: 'pay_to_confirm', paymentLink: 'https://pay.example/dvd' };
const booking = (id, createdAt) => ({
  id, status: 'pending', createdAt, aptId: APARTMENTS[0].id, aptName: APARTMENTS[0].name, phone: GUEST, name: 'רן',
  checkin: '2027-03-04', checkout: '2027-03-06', party: { adults: 2, children: 0, infants: 0 }, total: 2000, arrival: '16:00', notes: '',
});

test('deposit: "שולם B123" confirms the booking and the guest is told', async () => {
  const env = fakeEnv();
  assert.ok(await insertBookingIfFree(env, booking('BPAY1', Date.now())));
  await handleOwner({ ...ctxOf(env, pay), phone: OWNER }, 'שולם BPAY1');
  assert.equal((await getBooking(env, 'BPAY1')).status, 'confirmed');
  assert.ok(env.OUTBOX.some(o => o.to === GUEST && /אושרה/.test(o.text)));
});

test('deposit: an unpaid guest gets one reminder with the link, 5 to 20 hours later', async () => {
  const env = fakeEnv();
  const now = Date.now();
  await insertBookingIfFree(env, booking('BPAY2', 0), now - 6 * 3600e3);
  await scheduled(ctxOf(env, pay), now);
  const rem = env.OUTBOX.filter(o => o.to === GUEST);
  assert.equal(rem.length, 1);
  assert.match(rem[0].text, /https:\/\/pay\.example\/dvd/);
  assert.match(rem[0].text, /₪600/); // 30% of 2000
  await scheduled(ctxOf(env, pay), now + 60e3);
  assert.equal(env.OUTBOX.filter(o => o.to === GUEST).length, 1, 'only once');
  // no payment link in config: no reminders
  const env2 = fakeEnv();
  await insertBookingIfFree(env2, booking('BPAY3', 0), now - 6 * 3600e3);
  await scheduled(ctxOf(env2, business), now);
  assert.equal(env2.OUTBOX.filter(o => o.to === GUEST).length, 0);
});

test('monthly summary: last month\'s inquiries, bookings and revenue', async () => {
  const env = fakeEnv();
  const feb = Date.UTC(2027, 1, 10, 10);
  await bump(env, 'inquiries', 7, feb);
  await bump(env, 'inquiries', 3, Date.UTC(2027, 1, 20, 10));
  await bump(env, 'inquiries', 50, Date.UTC(2027, 2, 15, 10)); // March: not counted
  await insertBookingIfFree(env, { ...booking('BMON1', feb), total: 1800 }, feb);
  await setBookingStatus(env, 'BMON1', 'confirmed');
  env.DB.raw.prepare('UPDATE bookings SET confirmed_at = ? WHERE id = ?').run(feb + 3600e3, 'BMON1');
  const text = await monthlyText(ctxOf(env), Date.UTC(2027, 2, 1, 7));
  assert.match(text, /סיכום חודשי/);
  assert.match(text, /פניות חדשות: 10\b/);
  assert.match(text, /בקשות הזמנה: 1/);
  assert.match(text, /הזמנות שאושרו: 1/);
  assert.match(text, /₪1,800/);
  // the cron sends it on the 1st at 09:00 Israel time
  await scheduled(ctxOf(env), Date.UTC(2027, 2, 1, 7));
  assert.ok(env.OUTBOX.some(o => o.to === OWNER && /סיכום חודשי/.test(o.text)));
});
