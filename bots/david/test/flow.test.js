// End-to-end flows: real SQL schema, fake WhatsApp outbox, scripted model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { weeklyText, dailyText, internalText, scheduled } from '../src/owner.js';
import { BUSINESS, APARTMENTS, AGENCY } from '../src/config.js';
import { insertBookingIfFree, saveConv, getConv } from '../src/store.js';
import { weekStart } from '../src/logic.js';
import { costMicros } from '../src/agent.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const TECH = '972500000002';
const business = { ...BUSINESS, ownerPhone: OWNER, referral: { mode: 'owner', tellCustomer: 'partners', trackCommission: true } };
const agency = { ...AGENCY, techPhone: TECH };
const partners = [{ id: 'p1', name: 'יוסי', phone: '972500000009', area: 'צפון', maxGuests: 8 }];
const extra = (client) => ({ client, business, apartments: APARTMENTS, partners, agency });
const ctxOf = (env) => ({ env, business, apartments: APARTMENTS, partners, agency });
const thisWeek = () => weekStart(Date.now());

test('couple + 3 kids becomes a referral lead for David, and the commission lands in the summary', async () => {
  const env = fakeEnv();
  const guest = { from: '972541111111', name: 'רונית', type: 'text' };

  const c1 = scriptedClient([
    toolUse('find_apartments', { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, infants: 0, needs: [], budget: null }),
    say('הדירות שלנו קטנות מדי לחמישה, אבל יש לנו דירות מתאימות אצל שותפים. אפשר להעביר את הפרטים?', (p) => {
      const r = lastToolResult(p);
      assert.equal(r.suggestReferral, true);
      assert.ok(r.apartments.every(a => !a.fits));
    }),
  ]);
  await handleMessage(env, { ...guest, id: 'm1', text: 'היי, זוג ושלושה ילדים 1-4 במרץ' }, extra(c1));
  assert.match(env.OUTBOX.at(-1).text, /שותפים/);
  assert.equal(c1.calls[0].model, 'claude-haiku-5-5');
  assert.equal(c1.calls[0].fallbacks, undefined, 'Haiku has no server-side fallback');

  const c2 = scriptedClient([
    toolUse('refer_lead', { customer_consented: true, full_name: 'רונית כהן', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, children_ages: '4, 8, 11', budget: '900 ללילה', area: 'צפון', needs: [], requests: '', reason: 'capacity' }),
    say('העברתי את הפרטים, יחזרו אלייך היום 🙏'),
  ]);
  await handleMessage(env, { ...guest, id: 'm2', text: 'כן בטח' }, extra(c2));
  assert.ok(c2.calls[0].messages[0].content.includes('זוג ושלושה ילדים'), 'history is sent');

  const toOwner = env.OUTBOX.filter(o => o.to === OWNER);
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].text, /🔁 \*ליד חדש להעברה\*/);
  assert.match(toOwner[0].text, /יותר מדי אורחים/);
  assert.match(toOwner[0].text, /יוסי/);
  const refId = toOwner[0].text.match(/(R\w+)/)[1];

  await handleMessage(env, { from: OWNER, id: 'm3', type: 'text', text: `נסגר ${refId} 300` }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /עמלה ₪300/);

  const summary = await weeklyText(ctxOf(env), thisWeek());
  assert.match(summary, /פניות חדשות: 1/);
  assert.match(summary, /לידים להעברה:\* 1/);
  assert.match(summary, /עמלות: ₪300/);
});

test('referral without consent is refused by the tool', async () => {
  const env = fakeEnv();
  const c = scriptedClient([
    toolUse('refer_lead', { customer_consented: false, full_name: 'x', checkin: 'גמיש', checkout: 'גמיש', adults: 2, children: 3, children_ages: '', budget: '', area: '', needs: [], requests: '', reason: 'capacity' }),
    say('אפשר להעביר את הפרטים שלך לשותף?', (p) => assert.match(lastToolResult(p).error, /אישור מפורש/)),
  ]);
  await handleMessage(env, { from: '972542222222', id: 'n1', type: 'text', text: 'אנחנו 5' }, extra(c));
  assert.equal(env.OUTBOX.filter(o => o.to === OWNER).length, 0);
});

test('booking request → David approves → guest confirmed, dates blocked', async () => {
  const env = fakeEnv();
  const guest = { from: '972543333333', name: 'אבי', type: 'text' };
  const c = scriptedClient([
    toolUse('create_booking_request', { apartment_id: 'apt3', full_name: 'אבי לוי', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 0, arrival_time: '16:00', notes: '' }),
    say('רשמתי! דוד יאשר בהקדם.', (p) => { const r = lastToolResult(p); assert.equal(r.total, 1000 * 3 + 2 * 100 * 3); assert.equal(r.discount_pending, true); }),
  ]);
  await handleMessage(env, { ...guest, id: 'b1', text: 'מאשר' }, extra(c));
  const alert = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(alert.text, /בקשת הזמנה חדשה/);
  const id = alert.text.match(/(B\w+)/)[1];

  await handleMessage(env, { from: OWNER, id: 'b2', type: 'text', text: `אושר ${id} 3,300` }, extra(null));
  assert.ok(env.OUTBOX.some(o => o.to === guest.from && /סה"כ: ₪3,300/.test(o.text)), 'David set the discounted price');
  assert.ok(env.OUTBOX.some(o => o.to === guest.from && /אושרה ✅/.test(o.text)));

  // Another family asking for the same dates: apt3 is now taken, the other two are offered.
  const c2 = scriptedClient([
    toolUse('find_apartments', { checkin: '2027-03-02', checkout: '2027-03-03', adults: 2, children: 2, infants: 0, needs: [], budget: null }),
    say('יש לי את קו המים 1 ו-2', (p) => {
      const r = lastToolResult(p);
      assert.equal(r.suggestReferral, false);
      assert.deepEqual(r.apartments.filter(a => a.fits).map(a => a.id), ['apt1', 'apt2']);
      assert.ok(r.apartments.find(a => a.id === 'apt3').why_not.includes('כל הדירות תפוסות בתאריכים האלה'));
    }),
  ]);
  await handleMessage(env, { from: '972544444444', id: 'b3', type: 'text', text: '2+2 ב-2 במרץ' }, extra(c2));

  assert.match(await dailyText(ctxOf(env), '2027-03-01'), /אבי לוי/);
});

test('two guests grabbing the same nights at once: only one gets them', async () => {
  const env = fakeEnv();
  const base = { aptId: 'apt3', aptName: 'x', phone: '1', name: 'a', checkin: '2027-05-01', checkout: '2027-05-03', party: { adults: 2, children: 0, infants: 0 }, total: 1, arrival: '', notes: '' };
  const results = await Promise.all([
    insertBookingIfFree(env, { ...base, id: 'B1' }),
    insertBookingIfFree(env, { ...base, id: 'B2', checkin: '2027-05-02', checkout: '2027-05-04' }),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  // Back-to-back stays are fine.
  assert.equal(await insertBookingIfFree(env, { ...base, id: 'B3', checkin: '2027-05-03', checkout: '2027-05-05' }), true);
});

test('a crashing tool alerts the tech partner (once per 15 minutes), guest still gets an answer', async () => {
  const env = fakeEnv();
  const broken = APARTMENTS.map(a => ({ ...a, prices: null })); // makes quote() throw
  for (const id of ['e1', 'e2']) {
    const c = scriptedClient([
      toolUse('find_apartments', { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 0, infants: 0, needs: [], budget: null }),
      say('בודק ונחזור אליך', (p) => assert.match(lastToolResult(p).error, /תקלה זמנית/)),
    ]);
    await handleMessage(env, { from: '972545555555', id, type: 'text', text: 'יש מקום?' }, { ...extra(c), apartments: broken });
  }
  const toTech = env.OUTBOX.filter(o => o.to === TECH);
  assert.equal(toTech.length, 1, 'throttled');
  assert.match(toTech[0].text, /⚠️ \*תקלה בבוט של דוד\*/);
  assert.match(toTech[0].text, /find_apartments/);
  assert.match(toTech[0].text, /\+972545555555/);
  assert.equal(env.OUTBOX.filter(o => o.to === OWNER).length, 0, 'David is not bothered with tech problems');
});

test('a refusal sends the fallback reply and alerts tech', async () => {
  const env = fakeEnv();
  const c = scriptedClient([() => ({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] })]);
  await handleMessage(env, { from: '972546666666', id: 'r1', type: 'text', text: 'שאלה' }, extra(c));
  assert.match(env.OUTBOX.find(o => o.to === '972546666666').text, /נחזור אליך/);
  assert.match(env.OUTBOX.find(o => o.to === TECH).text, /סירב/);
});

test('cost is recorded per model call and shows in the internal report only', async () => {
  const env = fakeEnv();
  const c = scriptedClient([say('היי! לאיזה תאריכים?')]);
  await handleMessage(env, { from: '972547777777', id: 'u1', type: 'text', text: 'היי' }, extra(c));
  // 9,000 input × $0.10/M + 400 output × $0.50/M = $0.0009 + $0.0002
  assert.equal(costMicros({ input_tokens: 9000, output_tokens: 400 }), 1100);
  const report = await internalText(ctxOf(env), thisWeek());
  assert.match(report, /קריאות למודל: 1, לקוחות: 1/);
  assert.match(report, /\$0\.00/);
  assert.doesNotMatch(await weeklyText(ctxOf(env), thisWeek()), /עלות/);
});

test('follow-ups go once at 3h and once at 22h, not to opted-out guests', async () => {
  const env = fakeEnv();
  const now = Date.now();
  const mk = async (phone, quietHours, extraFields = {}) => saveConv(env, {
    phone, messages: [{ role: 'user', text: 'כמה עולה?' }, { role: 'assistant', text: '₪2,300' }],
    lastUserAt: now - quietHours * 3600e3, quotedAt: now - quietHours * 3600e3, followups: 0, ...extraFields,
  });
  await mk('9721', 4);
  await mk('9722', 4, { optedOut: true });
  await mk('9723', 4, { bookedAt: now });
  await mk('9724', 1);
  await mk('9725', 22.5, { followups: 1 });

  await scheduled(ctxOf(env), now);
  const to = env.OUTBOX.map(o => o.to).filter(t => t.startsWith('972') && t.length === 4).sort();
  assert.deepEqual(to, ['9721', '9725']);
  assert.equal((await getConv(env, '9721')).followups, 1);

  env.OUTBOX.length = 0;
  await scheduled(ctxOf(env), now); // running again sends nothing new
  assert.equal(env.OUTBOX.filter(o => o.to === '9721').length, 0);
});

test('owner gets help for unknown text', async () => {
  const env = fakeEnv();
  await handleMessage(env, { from: OWNER, id: 'h1', type: 'text', text: 'מה אפשר?' }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /פקודות/);
});

test("David's setup: lead goes to his private number, organized, no partners or commission talk", async () => {
  const env = fakeEnv();
  const davidBusiness = { ...BUSINESS, ownerPhone: OWNER }; // the real config: quiet, no commission
  const c = scriptedClient([
    toolUse('refer_lead', { customer_consented: true, full_name: 'רונית כהן', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, children_ages: '4, 8, 11', budget: '900 ללילה', area: 'צפון', needs: ['pool'], requests: 'קרוב לים', reason: 'capacity' }),
    say('רשמתי, נחזור אלייך עם אפשרות מתאימה 🙏'),
  ]);
  await handleMessage(env, { from: '972541212121', id: 'd1', type: 'text', text: 'כן' }, { ...extra(c), business: davidBusiness, partners: [] });
  const lead = env.OUTBOX.filter(o => o.to === OWNER);
  assert.equal(lead.length, 1);
  const t = lead[0].text;
  for (const part of [/🔁 \*ליד חדש להעברה\*/, /למה לא אצלך: יותר מדי אורחים/, /👤 רונית כהן/, /📞 \+972541212121/, /📅 2027-03-01 עד 2027-03-04/, /👨‍👩‍👧 2 מבוגרים, 3 ילדים \(4, 8, 11\)/, /💰 900 ללילה/, /📍 צפון/, /✳️ צריך: בריכה/, /📝 קרוב לים/, /wa\.me\/972541212121/]) assert.match(t, part);
  assert.doesNotMatch(t, /נסגר|עמלה|מתאים ל/);
  const davidCtx = { ...ctxOf(env), business: davidBusiness };
  assert.doesNotMatch(await weeklyText(davidCtx, thisWeek()), /עמלות/);
  assert.match(await weeklyText(davidCtx, thisWeek()), /לידים להעברה:\* 1/);
  assert.equal(BUSINESS.referral.tellCustomer, 'quiet');
  assert.equal(BUSINESS.referral.trackCommission, false);
});
