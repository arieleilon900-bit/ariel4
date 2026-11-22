// Packages (mazkira / pro / premium) and the service niche (movers, locksmith...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage } from '../src/index.js';
import { handleOwner, scheduled, weeklyText } from '../src/owner.js';
import { toolsFor } from '../src/tools.js';
import { buildSystemPrompt } from '../src/prompt.js';
import { moduleOn, PACKAGES, MODULE_NAMES, inHours, hoursText, weekStart } from '../src/logic.js';
import { AGENCY, TEMPLATES } from './fixture.js';
import { getLead, saveConv } from '../src/store.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const CUSTOMER = '972541000123';
const agency = { ...AGENCY, techPhone: '972500000002' };
const movers = (pkg, extra = {}) => ({
  niche: 'service', package: pkg, businessName: 'הובלות שלום', ownerName: 'שלום', botName: 'שלום', voice: 'male',
  style: 'קצר וחם', area: 'גוש דן', shabbat: 'הבוט עונה כרגיל', timezone: 'Asia/Jerusalem', ownerPhone: OWNER,
  services: ['הובלת דירות', 'הובלות משרדים'], intake: ['מאיפה לאן', 'תאריך', 'כמה חדרים', 'קומה ומעלית'],
  hours: { days: [0, 1, 2, 3, 4], from: '08:00', to: '18:00' }, afterHours: 'מחר בבוקר',
  urgent: 'הובלה היום', never: 'לא נותנים מחיר', reviewLinks: { google: 'https://g.page/r/test' },
  modules: {}, missedCall: { enabled: true }, referral: { mode: 'owner', tellCustomer: 'quiet', trackCommission: false },
  stay: {}, handoff: { pauseHours: 12 }, photoUrls: ['https://example.com/1.jpg'], ...extra,
});
const ctxOf = (env, b) => ({ env, business: b, apartments: [], partners: [], agency, templates: TEMPLATES });
const extra = (client, b) => ({ client, business: b, apartments: [], partners: [], agency, templates: TEMPLATES });
const msg = (id, text) => ({ from: CUSTOMER, id, type: 'text', text });

test('packages: each one switches on exactly its modules, and explicit settings win', () => {
  const on = (b) => MODULE_NAMES.filter(n => moduleOn(b, n)).sort();
  assert.deepEqual(on({ package: 'mazkira' }), [...PACKAGES.mazkira].sort());
  assert.deepEqual(on({ package: 'premium' }), [...PACKAGES.premium].sort());
  assert.ok(!moduleOn({ package: 'mazkira' }, 'instagram'));
  assert.ok(moduleOn({ package: 'pro' }, 'instagram'));
  assert.ok(!moduleOn({ package: 'pro' }, 'offers'));
  assert.ok(moduleOn({ package: 'mazkira', modules: { instagram: true } }, 'instagram'), 'explicit true wins');
  assert.ok(!moduleOn({ package: 'premium', modules: { offers: false } }, 'offers'), 'explicit false wins');
  // rentals-only parts never switch on for a service business
  assert.ok(!moduleOn(movers('premium'), 'calendar'));
  assert.ok(!moduleOn(movers('premium'), 'waitlist'));
  assert.ok(moduleOn(movers('premium'), 'offers'));
});

test('service: the prompt and tools are about collecting a lead, not apartments', () => {
  const b = movers('pro');
  const names = toolsFor(b).map(t => t.name);
  assert.deepEqual(names.sort(), ['notify_owner', 'send_examples', 'submit_lead']);
  assert.ok(toolsFor(movers('premium')).some(t => t.name === 'subscribe_offers'));
  const p = buildSystemPrompt(b, []);
  assert.match(p, /הובלות שלום/);
  assert.match(p, /קומה ומעלית/);
  assert.match(p, /submit_lead/);
  assert.doesNotMatch(p, /find_apartments|create_booking_request/);
  assert.equal(hoursText(b.hours), 'ראשון עד חמישי, 08:00-18:00');
  assert.ok(inHours(b.hours, Date.UTC(2027, 0, 10, 8)));   // Sunday 10:00 Israel
  assert.ok(!inHours(b.hours, Date.UTC(2027, 0, 15, 8)));  // Friday
});

test('service: a lead reaches the owner, then closed, done and the review request', async () => {
  const env = fakeEnv();
  const b = movers('pro');
  let id;
  const lead = { full_name: 'רונית', service: 'הובלת דירה', details: 'חולון ← רעננה\n12 לחודש\n3 חדרים\nקומה 2 בלי מעלית', urgent: false, wants_price: true, phone: '' };
  await handleMessage(env, msg('s1', 'כמה עולה הובלה מחולון לרעננה?'), extra(scriptedClient([
    toolUse('submit_lead', lead),
    say('העברתי לשלום, הוא יחזור אליך', (p) => {
      id = lastToolResult(p).lead_id;
      assert.match(p.messages.at(-3).content.at(-1).text, /בשעות העבודה|מחוץ לשעות העבודה/, 'the model is told if it is working hours');
    }),
  ]), b));
  assert.match(id, /^L/);
  const alert = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(alert.text, /פנייה חדשה/);
  assert.match(alert.text, /שאל על מחיר/);
  assert.match(alert.text, new RegExp(`נסגר ${id}`));
  assert.match(alert.text, new RegExp(`בוצע ${id}`));

  await handleOwner({ ...ctxOf(env, b), phone: OWNER }, `נסגר ${id} 3,200`);
  assert.equal((await getLead(env, id)).status, 'closed');
  assert.match(await weeklyText(ctxOf(env, b), weekStart(Date.now())), /₪3,200/);

  await handleOwner({ ...ctxOf(env, b), phone: OWNER }, `בוצע ${id}`);
  const review = env.OUTBOX.find(o => o.to === CUSTOMER && /ביקורת/.test(o.text));
  assert.match(review.text, /g\.page\/r\/test/);
  await handleOwner({ ...ctxOf(env, b), phone: OWNER }, `בוצע ${id}`);
  assert.match(env.OUTBOX.at(-1).text, /כבר סומנה/);
});

test('service, mazkira package: no review request even with a link', async () => {
  const env = fakeEnv();
  const b = movers('mazkira');
  let id;
  await handleMessage(env, msg('m1', 'צריך הובלה'), extra(scriptedClient([
    toolUse('submit_lead', { full_name: '', service: 'הובלה', details: 'פרטים', urgent: false, wants_price: false, phone: '' }),
    say('הועבר', (p) => { id = lastToolResult(p).lead_id; }),
  ]), b));
  assert.doesNotMatch(env.OUTBOX.find(o => o.to === OWNER).text, /בוצע/);
  await handleOwner({ ...ctxOf(env, b), phone: OWNER }, `בוצע ${id}`);
  assert.ok(!env.OUTBOX.some(o => o.to === CUSTOMER && /ביקורת/.test(o.text)));
});

test('service: a customer who talked but left no lead gets a follow-up', async () => {
  const env = fakeEnv();
  const b = movers('mazkira');
  await handleMessage(env, msg('f1', 'היי, צריך הובלה'), extra(scriptedClient([say('בשמחה! מאיפה לאן?')]), b));
  const now = Date.now() + 5 * 3600e3;
  // move the conversation 5 hours back
  const { getConv } = await import('../src/store.js');
  const c = await getConv(env, CUSTOMER);
  c.lastUserAt = now - 5 * 3600e3; c.quotedAt = now - 5 * 3600e3;
  await saveConv(env, c);
  await scheduled(ctxOf(env, b), now);
  const f = env.OUTBOX.filter(o => o.to === CUSTOMER).at(-1);
  assert.match(f.text, /עדיין צריך עזרה/);
});
