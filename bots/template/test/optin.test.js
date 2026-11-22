// Opt-in extras: waitlist, add-ons and the one-more-night offer. All OFF by default;
// switching one on is one line in config (modules.waitlist / modules.addons = true).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { handleOwner, scheduled } from '../src/owner.js';
import { checkWaitlist } from '../src/waitlist.js';
import { toolsFor } from '../src/tools.js';
import { buildSystemPrompt } from '../src/prompt.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from './fixture.js';
import { addBlock, removeBlock, insertBookingIfFree, setBookingStatus, getAddonRequest, getStats } from '../src/store.js';
import { weekStart, moduleOn } from '../src/logic.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const GUEST = '972541000077';
const agency = { ...AGENCY, techPhone: '972500000002' };
const ADDONS = [{ id: 'late', name: 'יציאה מאוחרת', price: 150 }];
const on = { ...BUSINESS, ownerPhone: OWNER, modules: { ...BUSINESS.modules, waitlist: true, addons: true }, addons: ADDONS };
const off = { ...BUSINESS, ownerPhone: OWNER };
const ctxOf = (env, b) => ({ env, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const extra = (client, b) => ({ client, business: b, apartments: APARTMENTS, partners: [], agency, templates: TEMPLATES });
const msg = (id, text) => ({ from: GUEST, id, type: 'text', text });
const APT = APARTMENTS[0].id;

test('off by default: no tools, no prompt text, no cron work', async () => {
  assert.ok(!moduleOn(off, 'waitlist') && !moduleOn(off, 'addons'));
  assert.ok(moduleOn(on, 'waitlist') && moduleOn(on, 'addons'));
  const names = toolsFor(off).map(t => t.name);
  assert.ok(!names.includes('join_waitlist') && !names.includes('request_addon'));
  assert.doesNotMatch(buildSystemPrompt(off, APARTMENTS), /join_waitlist|request_addon/);
  const onNames = toolsFor(on).map(t => t.name);
  assert.ok(onNames.includes('join_waitlist') && onNames.includes('request_addon'));
  assert.match(buildSystemPrompt(on, APARTMENTS), /join_waitlist/);
  assert.match(buildSystemPrompt(on, APARTMENTS), /request_addon/);
  // addons on but no list: no add-on tool
  assert.ok(!toolsFor({ ...on, addons: [] }).some(t => t.name === 'request_addon'));
});

test('waitlist: needs consent, then the guest is told once when the dates free up', async () => {
  const env = fakeEnv();
  const ci = '2027-06-09', co = '2027-06-11';
  const blockId = await addBlock(env, APT, ci, co, 'משפחה');
  const party = { adults: 2, children: 0, infants: 0 };
  const call = (consented) => ({ customer_consented: consented, full_name: 'רן כהן', apartment_id: APT, checkin: ci, checkout: co, ...party, phone: '' });

  // no consent: refused
  await handleMessage(env, msg('w1', 'תעדכן אותי אם יתפנה'), extra(scriptedClient([
    toolUse('join_waitlist', call(false)),
    say('צריך שתאשר', (p) => assert.match(lastToolResult(p).error, /הסכמה/)),
  ]), on));
  // consent: registered
  await handleMessage(env, msg('w2', 'כן, תעדכן'), extra(scriptedClient([
    toolUse('join_waitlist', call(true)),
    say('רשמתי', (p) => assert.match(lastToolResult(p).waitlist_id, /^W/)),
  ]), on));

  assert.equal(await checkWaitlist(ctxOf(env, on)), 0, 'still blocked: nothing sent');
  const before = env.OUTBOX.length;
  await removeBlock(env, blockId);
  assert.equal(await checkWaitlist(ctxOf(env, on)), 1);
  const note = env.OUTBOX.slice(before).find(o => o.to === GUEST);
  assert.match(note.text, /התפנה/);
  assert.match(note.text, new RegExp(ci));
  assert.equal(await checkWaitlist(ctxOf(env, on)), 0, 'only once');
  assert.equal((await getStats(env, weekStart(Date.now()))).waitlistNotified, 1);
});

test('waitlist: David cancelling a booking frees the dates and the waiting guest hears at once', async () => {
  const env = fakeEnv();
  const now = Date.now();
  const rec = { id: 'BWL1', status: 'pending', createdAt: now, aptId: APT, aptName: 'x', phone: '972541000055', name: 'דנה',
    checkin: '2027-07-07', checkout: '2027-07-09', party: { adults: 2, children: 0, infants: 0 }, total: 1500, arrival: '', notes: '' };
  assert.ok(await insertBookingIfFree(env, rec, now));
  await setBookingStatus(env, 'BWL1', 'confirmed');
  await handleMessage(env, msg('c1', 'כן'), extra(scriptedClient([
    toolUse('join_waitlist', { customer_consented: true, full_name: 'רן', apartment_id: 'any', checkin: '2027-07-07', checkout: '2027-07-09', adults: 2, children: 0, infants: 0, phone: '' }),
    say('רשמתי'),
  ]), on));
  const before = env.OUTBOX.length;
  await handleOwner({ ...ctxOf(env, on), phone: OWNER }, 'בוטל BWL1');
  assert.ok(env.OUTBOX.slice(before).some(o => o.to === GUEST && /התפנ/.test(o.text)));
});

test('addons: a guest with a confirmed booking asks, David approves, the guest is told', async () => {
  const env = fakeEnv();
  const now = Date.now();
  const rec = { id: 'BAD1', status: 'pending', createdAt: now, aptId: APT, aptName: 'דירה', phone: GUEST, name: 'רן',
    checkin: '2027-08-04', checkout: '2027-08-06', party: { adults: 2, children: 0, infants: 0 }, total: 1500, arrival: '', notes: '' };
  assert.ok(await insertBookingIfFree(env, rec, now));
  // not confirmed yet: refused
  await handleMessage(env, msg('a0', 'אפשר יציאה מאוחרת?'), extra(scriptedClient([
    toolUse('request_addon', { addon_id: 'late' }),
    say('קודם נסגור הזמנה', (p) => assert.match(lastToolResult(p).error, /הזמנה מאושרת/)),
  ]), on));
  await setBookingStatus(env, 'BAD1', 'confirmed');
  let id;
  await handleMessage(env, msg('a1', 'אפשר יציאה מאוחרת?'), extra(scriptedClient([
    toolUse('request_addon', { addon_id: 'late' }),
    say('הועבר לאישור', (p) => { id = lastToolResult(p).request_id; assert.match(id, /^T/); }),
  ]), on));
  const alert = env.OUTBOX.find(o => o.to === OWNER && /בקשת תוספת/.test(o.text));
  assert.match(alert.text, new RegExp(`אושר ${id}`));
  await handleOwner({ ...ctxOf(env, on), phone: OWNER }, `אושר ${id}`);
  assert.ok(env.OUTBOX.some(o => o.to === GUEST && /אושר/.test(o.text)));
  assert.equal((await getAddonRequest(env, id)).status, 'confirmed');
  assert.equal((await getStats(env, weekStart(Date.now()))).addonRevenue, 150);
  // handled twice: no double count
  await handleOwner({ ...ctxOf(env, on), phone: OWNER }, `אושר ${id}`);
  assert.match(env.OUTBOX.at(-1).text, /כבר טופלה/);
  // module off: David is told it's not active
  await handleOwner({ ...ctxOf(env, off), phone: OWNER }, `אושר ${id}`);
  assert.match(env.OUTBOX.at(-1).text, /לא פעילות/);
});

test('addons: the evening before checkout a guest is offered one more night, once, only if it is free', async () => {
  const env = fakeEnv();
  const now = Date.UTC(2027, 0, 10, 16, 0); // 18:00 Israel
  const rec = (id, apt, ci, co) => ({ id, status: 'pending', createdAt: now, aptId: apt, aptName: 'x', phone: GUEST, name: 'רן כהן',
    checkin: ci, checkout: co, party: { adults: 2, children: 0, infants: 0 }, total: 1500, arrival: '', notes: '' });
  assert.ok(await insertBookingIfFree(env, rec('BEX1', APT, '2027-01-08', '2027-01-11'), now));
  await setBookingStatus(env, 'BEX1', 'confirmed');
  await scheduled(ctxOf(env, on), now);
  const offer = env.OUTBOX.filter(o => o.to === GUEST && /עוד לילה/.test(o.text));
  assert.equal(offer.length, 1);
  await scheduled(ctxOf(env, on), now + 60e3);
  assert.equal(env.OUTBOX.filter(o => o.to === GUEST && /עוד לילה/.test(o.text)).length, 1, 'only once');
  // module off: nothing
  const env2 = fakeEnv();
  assert.ok(await insertBookingIfFree(env2, rec('BEX2', APT, '2027-01-08', '2027-01-11'), now));
  await setBookingStatus(env2, 'BEX2', 'confirmed');
  await scheduled(ctxOf(env2, off), now);
  assert.equal(env2.OUTBOX.filter(o => /עוד לילה/.test(o.text)).length, 0);
});
