// 150 guests, 4 messages each, 10 at a time: nothing fails, nothing double-booked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { BUSINESS, APARTMENTS, AGENCY } from '../src/config.js';
import { fakeEnv, toolUse, say } from './helpers.js';

test('150 guests in a busy week', async () => {
  const env = fakeEnv();
  const ctx = { business: { ...BUSINESS, ownerPhone: '972500000001' }, apartments: APARTMENTS, agency: { ...AGENCY, techPhone: '972500000002' }, partners: [] };
  // A model that searches, then tries to book apt3 for 2027-06-01..03 (everyone wants the same weekend).
  const client = { messages: { create: async (p) => {
    const last = p.messages.at(-1);
    const usage = { input_tokens: 9000, output_tokens: 300 };
    if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') return { usage, stop_reason: 'end_turn', content: [{ type: 'text', text: 'בסדר' }] };
    const text = last.content.at(-1).text;
    if (/להזמין/.test(text)) return { usage, ...toolUse('create_booking_request', { apartment_id: 'apt3', full_name: 'אורח', checkin: '2027-06-01', checkout: '2027-06-03', adults: 2, children: 2, infants: 0, arrival_time: '', notes: '' })() };
    if (/תאריכים/.test(text)) return { usage, ...toolUse('find_apartments', { checkin: '2027-06-01', checkout: '2027-06-03', adults: 2, children: 2, infants: 0, needs: [], budget: null })() };
    return { usage, ...say('היי! לאיזה תאריכים?')() };
  } } };

  const guests = Array.from({ length: 150 }, (_, i) => '97254' + String(1000000 + i));
  const script = ['היי', 'תאריכים 1-3 ביוני, 2+2', 'יש חניה?', 'רוצה להזמין'];
  const t0 = Date.now();
  for (let i = 0; i < guests.length; i += 10) {
    await Promise.all(guests.slice(i, i + 10).map(async (g) => {
      for (const [j, text] of script.entries()) await handleMessage(env, { from: g, id: `${g}-${j}`, type: 'text', text }, { ...ctx, client });
    }));
  }
  const ms = Date.now() - t0;
  const booked = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM bookings WHERE apt_id = 'apt3'").get().n;
  const errors = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM errors').get().n;
  const replies = env.OUTBOX.filter(o => guests.includes(o.to)).length;
  assert.equal(booked, 1, 'the same weekend is booked exactly once');
  assert.equal(errors, 0);
  assert.equal(replies, 150 * 4);
  console.log(`# 600 messages in ${ms}ms, 1 booking, 0 errors`);
});
