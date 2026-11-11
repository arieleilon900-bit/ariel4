// End-to-end flows with a fake KV, a fake WhatsApp outbox and a scripted model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { weeklyText, dailyText } from '../src/owner.js';
import { BUSINESS, APARTMENTS, PARTNERS } from '../src/config.js';

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}

// Each step returns a model response; it also sees the request so it can check tool results.
function scriptedClient(steps) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(params);
      const step = steps.shift();
      assert.ok(step, 'model called more times than scripted');
      return step(params);
    } } },
  };
}
const toolUse = (name, input) => () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_' + name, name, input }] });
const say = (text, check) => (params) => { check?.(params); return { stop_reason: 'end_turn', content: [{ type: 'text', text }] }; };
const lastToolResult = (params) => JSON.parse(params.messages.at(-1).content[0].content);

const OWNER = '972500000001';
const business = { ...BUSINESS, ownerPhone: OWNER, referral: { mode: 'owner', tellCustomer: 'partners' } };
const partners = [{ id: 'p1', name: 'יוסי', phone: '972500000009', area: 'צפון', maxGuests: 8 }];

function setup() {
  const env = { BOT_KV: fakeKV(), OUTBOX: [] };
  return { env, extra: (client) => ({ client, business, apartments: APARTMENTS, partners }) };
}

test('couple + 3 kids becomes a referral lead for David, and the commission lands in the summary', async () => {
  const { env, extra } = setup();
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
  assert.equal(c1.calls[0].model, 'claude-opus-5-5');
  assert.equal(c1.calls[0].fallbacks, 'default');

  const c2 = scriptedClient([
    toolUse('refer_lead', { customer_consented: true, full_name: 'רונית כהן', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, children_ages: '4, 8, 11', budget: '900 ללילה', area: 'צפון', needs: [], requests: '', reason: 'capacity' }),
    say('העברתי את הפרטים, יחזרו אלייך היום 🙏'),
  ]);
  await handleMessage(env, { ...guest, id: 'm2', text: 'כן בטח' }, extra(c2));
  // The history sent to the model includes the first exchange.
  assert.equal(c2.calls[0].messages[0].content.includes('זוג ושלושה ילדים'), true);

  const toOwner = env.OUTBOX.filter(o => o.to === OWNER);
  assert.equal(toOwner.length, 1);
  assert.match(toOwner[0].text, /🔁 \*ליד להעברה\*/);
  assert.match(toOwner[0].text, /יותר מדי אורחים/);
  assert.match(toOwner[0].text, /יוסי/);
  const refId = toOwner[0].text.match(/(R\w+)/)[1];

  await handleMessage(env, { from: OWNER, id: 'm3', type: 'text', text: `נסגר ${refId} 300` }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /עמלה ₪300/);

  const ctx = { env, business, apartments: APARTMENTS, partners };
  const summary = await weeklyText(ctx, Object.keys(Object.fromEntries(env.BOT_KV.m)).find(k => k.startsWith('stat:')).slice(5));
  assert.match(summary, /לידים שהועברו: 1/);
  assert.match(summary, /עמלות: ₪300/);
});

test('referral without consent is refused by the tool', async () => {
  const { env, extra } = setup();
  const c = scriptedClient([
    toolUse('refer_lead', { customer_consented: false, full_name: 'x', checkin: 'גמיש', checkout: 'גמיש', adults: 2, children: 3, children_ages: '', budget: '', area: '', needs: [], requests: '', reason: 'capacity' }),
    say('אפשר להעביר את הפרטים שלך לשותף?', (p) => assert.match(lastToolResult(p).error, /אישור מפורש/)),
  ]);
  await handleMessage(env, { from: '972542222222', id: 'n1', type: 'text', text: 'אנחנו 5' }, extra(c));
  assert.equal(env.OUTBOX.filter(o => o.to === OWNER).length, 0);
});

test('booking request → David approves → guest confirmed, dates blocked', async () => {
  const { env, extra } = setup();
  const guest = { from: '972543333333', name: 'אבי', type: 'text' };
  const c = scriptedClient([
    toolUse('create_booking_request', { apartment_id: 'apt3', full_name: 'אבי לוי', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 0, arrival_time: '16:00', notes: '' }),
    say('רשמתי! דוד יאשר בהקדם.', (p) => {
      const r = lastToolResult(p);
      assert.equal(r.total, 700 * 3 + 200);
    }),
  ]);
  await handleMessage(env, { ...guest, id: 'b1', text: 'מאשר' }, extra(c));
  const alert = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(alert.text, /בקשת הזמנה חדשה/);
  const id = alert.text.match(/(B\w+)/)[1];

  await handleMessage(env, { from: OWNER, id: 'b2', type: 'text', text: `אושר ${id}` }, extra(null));
  assert.ok(env.OUTBOX.some(o => o.to === guest.from && /אושרה ✅/.test(o.text)));

  // Another family asking for the same dates: apt3 is now taken → referral.
  const c2 = scriptedClient([
    toolUse('find_apartments', { checkin: '2027-03-02', checkout: '2027-03-03', adults: 2, children: 2, infants: 0, needs: [], budget: null }),
    say('תפוס', (p) => assert.equal(lastToolResult(p).suggestReferral, true)),
  ]);
  await handleMessage(env, { from: '972544444444', id: 'b3', type: 'text', text: '2+2 ב-2 במרץ' }, extra(c2));

  const ctx = { env, business, apartments: APARTMENTS, partners };
  assert.match(await dailyText(ctx, '2027-03-01'), /אבי לוי/);
});

test('owner gets help for unknown text', async () => {
  const { env, extra } = setup();
  await handleMessage(env, { from: OWNER, id: 'h1', type: 'text', text: 'מה אפשר?' }, extra(null));
  assert.match(env.OUTBOX.at(-1).text, /פקודות/);
});
