// Instagram DMs and missed calls → WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleMessage } from '../src/index.js';
import { handleOwner, weeklyText } from '../src/owner.js';
import { incomingInstagram, splitForInstagram } from '../src/instagram.js';
import { handleMissedCall, flushQueuedMissedCalls, callerFrom } from '../src/missedcall.js';
import { normalizePhone, isIsraeliMobile, inQuietHours, weekStart } from '../src/logic.js';
import { BUSINESS, APARTMENTS, AGENCY, TEMPLATES } from '../src/config.js';
import { saveConv, getConv } from '../src/store.js';
import { fakeEnv, scriptedClient, toolUse, say, lastToolResult } from './helpers.js';

const OWNER = '972500000001';
const TECH = '972500000002';
const missedCall = { ...BUSINESS.missedCall, enabled: true };
const business = { ...BUSINESS, ownerPhone: OWNER, missedCall };
const agency = { ...AGENCY, techPhone: TECH };
const templates = { ...TEMPLATES, missed_call: { name: 'missed_call', lang: 'he' } };
const ctxOf = (env, b = business) => ({ env, business: b, apartments: APARTMENTS, partners: [], agency, templates });
const extra = (client) => ({ client, business, apartments: APARTMENTS, partners: [], agency, templates });

// Israel is UTC+2 in January.
const NOON = Date.UTC(2027, 0, 10, 10, 0);      // 12:00 Israel
const NIGHT = Date.UTC(2027, 0, 10, 21, 0);     // 23:00 Israel
const MORNING = Date.UTC(2027, 0, 11, 6, 30);   // 08:30 Israel
const LATE = Date.UTC(2027, 0, 10, 21, 30);     // 23:30 Israel

// ---------- phone numbers ----------
test('phone numbers are normalized; landlines and hidden numbers are recognized', () => {
  assert.equal(normalizePhone('054-123-4567'), '972541234567');
  assert.equal(normalizePhone('+972 54 123 4567'), '972541234567');
  assert.equal(normalizePhone('00972541234567'), '972541234567');
  assert.equal(normalizePhone('972541234567'), '972541234567');
  assert.equal(normalizePhone('+44 7700 900123'), '447700900123');
  assert.equal(normalizePhone('anonymous'), '');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone('12'), '');
  assert.ok(isIsraeliMobile('972541234567'));
  assert.ok(!isIsraeliMobile('97236001234'), 'Tel Aviv landline');
  assert.ok(inQuietHours(23, { from: 22, to: 8 }));
  assert.ok(inQuietHours(3, { from: 22, to: 8 }));
  assert.ok(!inQuietHours(8, { from: 22, to: 8 }));
  assert.ok(!inQuietHours(12, { from: 22, to: 8 }));
  assert.equal(callerFrom({ From: '+972541234567', CallSid: 'CA1' }), '+972541234567');
  assert.equal(callerFrom({ caller: '0541234567' }), '0541234567');
});

// ---------- missed calls ----------
test('missed call at noon: WhatsApp template to the caller, David is told, second call within 24h is not messaged', async () => {
  const env = fakeEnv();
  const ctx = ctxOf(env);
  const r = await handleMissedCall(ctx, { from: '054-111-2233', source: 'twilio' }, NOON);
  assert.equal(r.status, 'sent');
  const msg = env.OUTBOX.find(o => o.to === '972541112233');
  assert.equal(msg.template, 'missed_call');
  assert.deepEqual(msg.params, [business.botName]);
  assert.match(msg.text, /ראינו שהתקשרת ל/);
  assert.doesNotMatch(msg.text, /—/, 'no long dash (ANTI_AI_RULES)');
  const alert = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(alert.text, /שיחה שלא נענתה/);
  assert.match(alert.text, /wa\.me\/972541112233/);

  const again = await handleMissedCall(ctx, { from: '0541112233' }, NOON + 2 * 3600e3);
  assert.equal(again.status, 'skipped');
  assert.equal(again.reason, 'cooldown');
  assert.equal(env.OUTBOX.filter(o => o.to === '972541112233').length, 1);

  const nextDay = await handleMissedCall(ctx, { from: '0541112233' }, NOON + 25 * 3600e3);
  assert.equal(nextDay.status, 'sent');
});

test('missed call: landline, hidden number, staff and opted-out callers get nothing', async () => {
  const env = fakeEnv();
  const ctx = ctxOf(env);
  assert.equal((await handleMissedCall(ctx, { from: '03-6001234' }, NOON)).reason, 'landline');
  assert.equal((await handleMissedCall(ctx, { from: 'anonymous' }, NOON)).reason, 'hidden_number');
  assert.equal((await handleMissedCall(ctx, { from: '+' + OWNER }, NOON)).reason, 'staff');
  assert.equal((await handleMissedCall(ctx, { from: TECH }, NOON)).reason, 'staff');
  await saveConv(env, { phone: '972549998877', name: '', messages: [], optedOut: true });
  assert.equal((await handleMissedCall(ctx, { from: '0549998877' }, NOON)).reason, 'opted_out');
  assert.equal(env.OUTBOX.length, 0);

  const off = ctxOf(env, { ...business, missedCall: { ...missedCall, enabled: false } });
  assert.equal((await handleMissedCall(off, { from: '0541112233' }, NOON)).reason, 'disabled');
  const noForeign = ctxOf(env, { ...business, missedCall: { ...missedCall, foreignNumbers: false } });
  assert.equal((await handleMissedCall(noForeign, { from: '+447700900123' }, NOON)).reason, 'foreign');
  assert.equal(env.OUTBOX.length, 0);
});

test('missed call while the caller is already chatting with the bot: no extra message', async () => {
  const env = fakeEnv();
  await saveConv(env, { phone: '972541112233', name: '', messages: [{ role: 'user', text: 'היי' }], lastUserAt: NOON - 10 * 60e3 });
  const r = await handleMissedCall(ctxOf(env), { from: '0541112233' }, NOON);
  assert.equal(r.reason, 'active_chat');
  assert.equal(env.OUTBOX.length, 0);
});

test('missed call at night waits for 08:00, and is dropped if the caller wrote meanwhile', async () => {
  const env = fakeEnv();
  const ctx = ctxOf(env);
  assert.equal((await handleMissedCall(ctx, { from: '0541112233' }, NIGHT)).status, 'queued');
  assert.equal((await handleMissedCall(ctx, { from: '0542223344' }, NIGHT)).status, 'queued');
  assert.equal((await handleMissedCall(ctx, { from: '0541112233' }, NIGHT + 60e3)).reason, 'cooldown', 'two night calls, one message');
  assert.equal(env.OUTBOX.length, 0, 'nothing at night');

  assert.equal(await flushQueuedMissedCalls(ctx, LATE), 0, 'still night');
  assert.equal(env.OUTBOX.length, 0);

  // The second caller wrote to us on WhatsApp at 06:00.
  await saveConv(env, { phone: '972542223344', name: '', messages: [{ role: 'user', text: 'היי' }], lastUserAt: MORNING - 2.5 * 3600e3 });
  assert.equal(await flushQueuedMissedCalls(ctx, MORNING), 1);
  assert.equal(env.OUTBOX.filter(o => o.template === 'missed_call').length, 1);
  assert.equal(env.OUTBOX.find(o => o.template === 'missed_call').to, '972541112233');

  assert.equal(await flushQueuedMissedCalls(ctx, MORNING + 3600e3), 0, 'sent once');
});

test('the caller answers the missed-call message: the bot knows they called, and it shows in the weekly summary', async () => {
  const env = fakeEnv();
  const ctx = ctxOf(env, { ...business, missedCall: { ...missedCall, quietHours: null } });
  assert.equal((await handleMissedCall(ctx, { from: '0541112233' })).status, 'sent');

  const c = scriptedClient([
    say('בשמחה! לאילו תאריכים?', (p) => {
      const text = p.messages.at(-1).content.at(-1).text;
      assert.match(text, /התקשר ל.* ולא נענה/);
      assert.match(text, /אל תתנצל שוב/);
    }),
  ]);
  await handleMessage(env, { from: '972541112233', id: 'mc1', type: 'text', text: 'כן רציתי לשאול על דירה' }, { ...extra(c), business: ctx.business });
  assert.equal(env.OUTBOX.at(-1).text, 'בשמחה! לאילו תאריכים?');

  // The next message is a normal conversation, no note.
  const c2 = scriptedClient([say('מעולה', (p) => assert.doesNotMatch(p.messages.at(-1).content.at(-1).text, /ולא נענה/))]);
  await handleMessage(env, { from: '972541112233', id: 'mc2', type: 'text', text: 'מרץ' }, { ...extra(c2), business: ctx.business });

  const summary = await weeklyText(ctx, weekStart(Date.now()));
  assert.match(summary, /שיחות שלא נענו שקיבלו וואטסאפ: 1 \(1 ענו\)/);
});

test('missed call with no approved template fails loudly: tech partner is alerted, the next call retries', async () => {
  const env = fakeEnv();
  delete env.OUTBOX;
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    if (body.type === 'template' && body.template.name === 'missed_call') {
      return new Response(JSON.stringify({ error: { message: 'Template name does not exist', code: 132001 } }), { status: 400 });
    }
    return new Response('{}', { status: 200 });
  };
  try {
    const ctx = ctxOf(env);
    const r = await handleMissedCall(ctx, { from: '0541112233' }, NOON);
    assert.equal(r.status, 'failed');
    const alert = sent.find(b => b.to === TECH);
    assert.match(alert.text.body, /שיחה שלא נענתה לא נשלחה/);
    assert.ok(!sent.some(b => b.to === OWNER), 'David is not told a message went out');
    const retry = await handleMissedCall(ctx, { from: '0541112233' }, NOON + 60e3);
    assert.equal(retry.status, 'failed', 'a failed attempt does not start the cooldown');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('/missed-call endpoint: token required, Twilio gets TwiML, others get JSON', async () => {
  const env = { ...fakeEnv(), MISSED_CALL_TOKEN: 'secret', ALLOW_DRAFT: '1' };
  const waits = [];
  const exec = { waitUntil: (p) => waits.push(p) };

  const denied = await worker.fetch(new Request('https://bot/missed-call?from=0541112233'), env, exec);
  assert.equal(denied.status, 403);

  const twilio = await worker.fetch(new Request('https://bot/missed-call?token=secret', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'CallSid=CA123&From=%2B972541112233&To=%2B97233333333',
  }), env, exec);
  assert.match(twilio.headers.get('content-type'), /xml/);
  assert.match(await twilio.text(), /<Reject reason="busy"\/>/);
  await Promise.all(waits);

  const json = await worker.fetch(new Request('https://bot/missed-call?token=secret', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: '0541112233', source: 'android' }),
  }), env, exec);
  const out = await json.json();
  // config.js ships with missedCall.enabled = false until a provider is connected.
  assert.equal(out.status, 'skipped');
  assert.equal(out.reason, BUSINESS.missedCall.enabled ? 'cooldown' : 'disabled');
});

// ---------- Instagram ----------
const igPayload = (messaging) => ({ object: 'instagram', entry: [{ id: '17841400000000000', time: 1, messaging }] });

test('Instagram webhook: text, voice and photo come in; echoes and reactions are skipped', () => {
  const msgs = incomingInstagram(igPayload([
    { sender: { id: '111' }, recipient: { id: '17841400000000000' }, message: { mid: 'm1', text: 'היי, יש פנוי בסופ"ש?' } },
    { sender: { id: '111' }, recipient: { id: '17841400000000000' }, message: { mid: 'm2', attachments: [{ type: 'audio', payload: { url: 'https://cdn/a.mp4' } }] } },
    { sender: { id: '111' }, recipient: { id: '17841400000000000' }, message: { mid: 'm3', attachments: [{ type: 'image', payload: { url: 'https://cdn/i.jpg' } }] } },
    { sender: { id: '17841400000000000' }, recipient: { id: '111' }, message: { mid: 'm4', text: 'our reply', is_echo: true } },
    { sender: { id: '111' }, recipient: { id: '17841400000000000' }, reaction: { mid: 'm1', action: 'react' } },
    { sender: { id: '111' }, recipient: { id: '17841400000000000' }, read: { mid: 'm4' } },
  ]));
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map(m => [m.from, m.type]), [['ig:111', 'text'], ['ig:111', 'audio'], ['ig:111', 'image']]);
  assert.equal(msgs[1].mediaUrl, 'https://cdn/a.mp4');
  assert.deepEqual(incomingInstagram({ object: 'whatsapp_business_account', entry: [] }), []);
});

test('long replies are split under Instagram\'s 1000-byte limit', () => {
  const long = Array.from({ length: 40 }, (_, i) => `שורה ${i}: הדירה כוללת מרפסת, מזגן ו-Wi-Fi מהיר`).join('\n');
  const parts = splitForInstagram(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 1000);
  assert.equal(parts.join('\n').replace(/\s+/g, ''), long.replace(/\s+/g, ''));
});

test('Instagram guest: reply goes back to Instagram, booking needs a phone, David confirms and the guest hears on Instagram', async () => {
  const env = fakeEnv();
  const guest = { from: 'ig:555', name: '', type: 'text', channel: 'instagram' };

  const c1 = scriptedClient([
    say('היי! לאילו תאריכים ובכמה אנשים?', (p) => {
      const text = p.messages.at(-1).content.at(-1).text;
      assert.match(text, /ערוץ: אינסטגרם/);
      assert.match(text, /מבקשים מספר נייד/);
    }),
  ]);
  await handleMessage(env, { ...guest, id: 'ig1', text: 'היי ראיתי את הפוסט' }, extra(c1));
  assert.equal(env.OUTBOX.at(-1).to, 'ig:555');

  const input = { apartment_id: 'apt1', full_name: 'נועה לוי', checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 0, infants: 0, arrival_time: '16:00', notes: '' };
  const c2 = scriptedClient([
    toolUse('create_booking_request', { ...input, phone: '' }),
    say('מה המספר נייד שלך? האישור והתזכורת נשלחים בוואטסאפ', (p) => assert.match(lastToolResult(p).error, /מספר נייד/)),
  ]);
  await handleMessage(env, { ...guest, id: 'ig2', text: 'מאשרת' }, extra(c2));
  assert.equal(env.OUTBOX.filter(o => o.to === OWNER).length, 0, 'no booking without a phone');

  const c3 = scriptedClient([
    toolUse('create_booking_request', { ...input, phone: '054-777-8899' }),
    say('רשמתי! דוד יאשר בהקדם.', (p) => assert.ok(lastToolResult(p).booking_id)),
  ]);
  await handleMessage(env, { ...guest, id: 'ig3', text: '0547778899' }, extra(c3));
  const alert = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(alert.text, /טלפון: \+972547778899 \(הזמין מאינסטגרם\)/);
  const id = alert.text.match(/(B\w+)/)[1];

  await handleOwner({ env, business, apartments: APARTMENTS, partners: [], agency, phone: OWNER }, `אושר ${id}`);
  const confirm = env.OUTBOX.find(o => /ההזמנה שלך אושרה/.test(o.text || ''));
  assert.equal(confirm.to, 'ig:555', 'confirmation goes back to Instagram');

  const conv = await getConv(env, 'ig:555');
  assert.equal(conv.messages.length, 6);
});

test('Instagram lead: refer_lead uses the phone the guest gave, and David gets a WhatsApp link to it', async () => {
  const env = fakeEnv();
  const c = scriptedClient([
    toolUse('refer_lead', { customer_consented: true, full_name: 'רונית', checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, children_ages: '4, 8, 11', budget: '', area: '', needs: [], requests: '', reason: 'capacity', phone: '0541231234' }),
    say('העברתי את הפרטים 🙏'),
  ]);
  await handleMessage(env, { from: 'ig:777', id: 'ig9', type: 'text', text: 'כן', channel: 'instagram' }, extra(c));
  const lead = env.OUTBOX.find(o => o.to === OWNER);
  assert.match(lead.text, /📞 \+972541231234 \(מאינסטגרם\)/);
  assert.match(lead.text, /wa\.me\/972541231234/);
});

test('webhook accepts an Instagram payload signed with IG_APP_SECRET and rejects a bad signature', async () => {
  const env = { ...fakeEnv(), WA_APP_SECRET: 'wa-secret', IG_APP_SECRET: 'ig-secret', ALLOW_DRAFT: '1' };
  const body = JSON.stringify(igPayload([{ sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'e1', text: 'x', is_echo: true } }]));
  const sign = async (secret) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return 'sha256=' + [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const waits = [];
  const exec = { waitUntil: (p) => waits.push(p) };
  const ok = await worker.fetch(new Request('https://bot/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': await sign('ig-secret') } }), env, exec);
  assert.equal(ok.status, 200);
  await Promise.all(waits);
  assert.equal(env.OUTBOX.length, 0, 'echo of our own message is ignored');
  const bad = await worker.fetch(new Request('https://bot/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': await sign('wrong') } }), env, exec);
  assert.equal(bad.status, 401);
});

test('Instagram token is refreshed weekly into D1 and used from there; a failed refresh alerts the tech partner', async () => {
  const { scheduled } = await import('../src/owner.js');
  const env = fakeEnv();
  env.IG_TOKEN = 'old-token';
  const calls = [];
  const realFetch = globalThis.fetch;
  let refreshOk = true;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), auth: init.headers?.authorization, body: init.body });
    if (String(url).includes('refresh_access_token')) {
      return refreshOk
        ? new Response(JSON.stringify({ access_token: 'new-token', expires_in: 5184000 }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: 'Session has expired' } }), { status: 400 });
    }
    return new Response('{}', { status: 200 });
  };
  const ctx = { ...ctxOf(env), env };
  const MONDAY_4AM = Date.UTC(2027, 0, 11, 2, 0); // Monday 04:00 Israel
  try {
    delete env.OUTBOX;
    await scheduled(ctx, MONDAY_4AM);
    assert.ok(calls.some(c => c.url.includes('access_token=old-token')));
    const { sendInstagramText } = await import('../src/instagram.js');
    await sendInstagramText(env, 'ig:1', 'היי');
    assert.equal(calls.at(-1).auth, 'Bearer new-token', 'replies use the refreshed token');

    refreshOk = false;
    calls.length = 0;
    await scheduled(ctx, MONDAY_4AM + 7 * 86400e3);
    const alert = calls.find(c => c.body && JSON.parse(c.body).to === TECH);
    assert.match(JSON.parse(alert.body).text.body, /חידוש טוקן אינסטגרם/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- only callers NOT saved in the owner's phone ----------
test('saved contacts never get the missed-call message: contact cards, "שמור" command, and the provider flag', async () => {
  const { incomingMessages } = await import('../src/whatsapp.js');
  const env = fakeEnv();
  const ctx = ctxOf(env);
  const owner = { ...ctx, phone: OWNER };

  // David shares two contact cards from his phone.
  const [card] = incomingMessages({ entry: [{ changes: [{ value: { contacts: [{ wa_id: OWNER }], messages: [{
    id: 'c1', from: OWNER, type: 'contacts',
    contacts: [
      { name: { formatted_name: 'יוסי אינסטלטור' }, phones: [{ phone: '+972 54-333-4444', wa_id: '972543334444' }] },
      { name: { formatted_name: 'אמא' }, phones: [{ phone: '052-555-6666' }, { phone: '03-6001234' }] },
    ],
  }] } }] }] });
  await handleMessage(env, card, { business, apartments: APARTMENTS, partners: [], agency, templates });
  assert.match(env.OUTBOX.at(-1).text, /שמרתי 3 מספרים \(יוסי אינסטלטור, אמא\)/);

  await handleOwner(owner, 'שמור 054-777-1111 דני');
  assert.match(env.OUTBOX.at(-1).text, /שמרתי את \+972547771111/);
  await handleOwner(owner, 'שמורים');
  assert.match(env.OUTBOX.at(-1).text, /יש 4 מספרים שמורים/);
  env.OUTBOX.length = 0;

  for (const from of ['0543334444', '+972525556666', '0547771111']) {
    const r = await handleMissedCall(ctx, { from }, NOON);
    assert.equal(r.reason, 'saved_contact', from);
  }
  assert.equal((await handleMissedCall(ctx, { from: '0548889999', saved: true }, NOON)).reason, 'saved_contact', 'provider says saved');
  assert.equal(env.OUTBOX.length, 0, 'no message to anyone saved');

  // An unknown number does get it.
  assert.equal((await handleMissedCall(ctx, { from: '0541010101' }, NOON)).status, 'sent');

  // Removing from saved: next call gets a message.
  await handleOwner(owner, 'לא שמור 0547771111');
  assert.match(env.OUTBOX.at(-1).text, /מחקתי/);
  assert.equal((await handleMissedCall(ctx, { from: '0547771111' }, NOON)).status, 'sent');
});

test('/missed-call reads saved=1 from the provider', async () => {
  const { savedFrom } = await import('../src/missedcall.js');
  assert.equal(savedFrom({ saved: '1' }), true);
  assert.equal(savedFrom({ known: 'true' }), true);
  assert.equal(savedFrom({ saved: '0' }), false);
  assert.equal(savedFrom({}), false);
});

test('a partner calling is not messaged either', async () => {
  const env = fakeEnv();
  const ctx = { ...ctxOf(env), partners: [{ id: 'p1', name: 'יוסי', phone: '972501234567' }] };
  assert.equal((await handleMissedCall(ctx, { from: '050-123-4567' }, NOON)).reason, 'staff');
});

test('contacts import: iPhone vCard and Google CSV become normalized numbers and safe SQL', async () => {
  const { parseVcf, parseCsv, contactsToRows, toSql } = await import('../scripts/import-contacts.js');
  const vcf = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:כהן;דנה;;;', 'FN:דנה כהן',
    'item1.TEL;type=CELL;type=pref:+972 54-123-4567', 'TEL;type=HOME:03-6001234', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', "FN:O'Brien", 'TEL;TYPE=CELL:052-999-8888', 'END:VCARD',
  ].join('\r\n');
  const v = contactsToRows(parseVcf(vcf));
  assert.deepEqual(v, [
    { phone: '972541234567', name: 'דנה כהן' },
    { phone: '97236001234', name: 'דנה כהן' },
    { phone: '972529998888', name: "O'Brien" },
  ]);
  const csv = '﻿First Name,Last Name,Phone 1 - Label,Phone 1 - Value,Phone 2 - Value\n'
    + 'משה,לוי,Mobile,054-111-2222 ::: 054-111-3333,\n'
    + '"רות, הגננת",,Mobile,,+972 50 444 5555\n'
    + 'בלי,טלפון,,,\n';
  const c = contactsToRows(parseCsv(csv));
  assert.deepEqual(c.map(r => r.phone), ['972541112222', '972541113333', '972504445555']);
  assert.equal(c[2].name, 'רות, הגננת');

  // The generated SQL runs against the real schema and quotes names safely.
  const env = fakeEnv();
  env.DB.raw.exec(toSql([...v, ...c, v[0]]));
  const { isContact, contactCount } = await import('../src/store.js');
  assert.equal(await contactCount(env), 6);
  assert.ok(await isContact(env, '972529998888'));
});

test('Instagram: shared posts, reels, stickers and ice-breaker taps still get an answer', () => {
  const msgs = incomingInstagram(igPayload([
    { sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'a', attachments: [{ type: 'share', payload: { url: 'https://x' } }] } },
    { sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'b', attachments: [{ type: 'ig_reel', payload: { reel_video_id: '9' } }] } },
    { sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'c', attachments: [{ type: 'like_heart' }] } },
    { sender: { id: '1' }, recipient: { id: '2' }, message: { mid: 'd', attachments: [{ type: 'video', payload: { url: 'https://v' } }] } },
    { sender: { id: '1' }, recipient: { id: '2' }, timestamp: 5, postback: { mid: 'e', title: 'מה המחירים?', payload: 'PRICES' } },
  ]));
  assert.equal(msgs.length, 5);
  for (const m of msgs) assert.ok(m.text.length > 0, `${m.type} has text for the bot`);
  assert.match(msgs[0].text, /פוסט/);
  assert.equal(msgs[4].text, 'מה המחירים?');
});
