// בדיקת זרימה מלאה: D1 מדומה על SQLite אמיתי, ו-fetch מדומה ל-Meta, Anthropic ו-Google.
// הרצה: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// ---------- D1 מדומה ----------
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
      return stmt;
    },
    raw: db,
  };
}

// ---------- fetch מדומה ----------
const sent = [];           // הודעות שנשלחו ב-WhatsApp
let aiQueue = [];          // תשובות שה-AI "יחזיר" לפי הסדר
let aiRequests = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    aiRequests.push(JSON.parse(init.body));
    const out = aiQueue.shift();
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 10 },
    }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }
  if (url.includes('graph.facebook.com')) {
    if (url.endsWith('/messages')) { sent.push(JSON.parse(init.body)); return Response.json({ messages: [{ id: 'wamid.out' }] }); }
    if (url.endsWith('/media')) return Response.json({ id: 'uploaded-media' });
    return Response.json({ url: 'https://lookaside.example/media', mime_type: 'image/jpeg' });
  }
  if (url.includes('lookaside.example')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  throw new Error('unexpected fetch ' + url);
};

const { processWebhook } = await import('../src/index.js');
const { runEvery15, weeklyReport } = await import('../src/cron.js');
const { parseCommand } = await import('../src/owner.js');
const util = await import('../src/util.js');
const { MESSAGES } = await import('../src/config.js');

const OWNER = '972503429998';
const CUSTOMER = '972541234567';
function makeEnv() {
  return {
    DB: makeD1(), WA_TOKEN: 't', WA_PHONE_NUMBER_ID: '123', OWNER_PHONE: OWNER, ANTHROPIC_API_KEY: 'k',
    REVIEW_LINK: 'https://g.page/r/test/review', TEMPLATE_LANG: 'he',
    AI: { run: async () => ({ text: 'ננעלתי בחוץ ברחוב הרצל' }) },
  };
}
const inbound = (from, msg, id) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'דני' } }], messages: [{ from, id, ...msg }] } }] }] });
const ai = (o) => ({ reply: '', language: 'he', category: 'service', urgent: false, urgent_reason: '', customer_name: '', issue: '', address: '', ready_for_handoff: false, summary_for_owner: '', ...o });
const textsTo = (to) => sent.filter((m) => m.to === to).map((m) => m.text?.body || `[${m.type}${m.template ? ':' + m.template.name : ''}]`);

test('util', () => {
  assert.equal(util.normalizePhone('054-123-4567'), CUSTOMER);
  assert.equal(util.normalizePhone('+972 54 1234567'), CUSTOMER);
  assert.equal(util.displayPhone(CUSTOMER), '054-1234567');
  const at = util.parseIlDateTime('17/10/2026', '14:30');
  assert.equal(util.ilTime(at), '14:30');
  assert.equal(parseCommand('בדרך 054-1234567 20').minutes, 20);
  assert.equal(parseCommand('תור 0541234567 17/10 14:30 הרצל 5 חולון').address, 'הרצל 5 חולון');
  assert.equal(parseCommand('סיום 0541234567').cmd, 'done');
  assert.equal(parseCommand('לא רלוונטי 0541234567').cmd, 'irrelevant');
  assert.equal(parseCommand('מה קורה').cmd, 'unknown');
});

test('lead → questions → handoff → owner commands → reminders → review', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z'); // 11:00 בישראל, יום רביעי

  // 1. הלקוח פונה
  aiQueue = [ai({ reply: 'היי, מה קרה בדיוק?', }) ];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'שלום ננעלתי בחוץ' } }, 'w1'), t0);
  assert.deepEqual(textsTo(CUSTOMER), ['היי, מה קרה בדיוק?']);
  assert.match(aiRequests[0].system, /המוקדן הדיגיטלי/);

  // הודעה כפולה מ-Meta לא מעובדת פעמיים
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'שלום ננעלתי בחוץ' } }, 'w1'), t0);
  assert.equal(aiRequests.length, 1);

  // 2. תמונה
  aiQueue = [ai({ reply: 'תודה! מה הכתובת המדויקת?', issue: 'ננעל מחוץ לדירה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'image', image: { id: 'img1', caption: '' } }, 'w2'), t0);
  const lastUser = aiRequests[1].messages.at(-1);
  assert.equal(lastUser.content[0].type, 'image');

  // 3. כתובת → העברה לחנן
  aiQueue = [ai({ reply: 'קיבלתי, העברתי לחנן', issue: 'ננעל מחוץ לדירה', address: 'הרצל 5 חולון', customer_name: 'דני', ready_for_handoff: true, summary_for_owner: 'ננעל בחוץ, ממתין ליד הדלת' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרצל 5 חולון' } }, 'w3'), t0);
  const ownerMsgs = sent.filter((m) => m.to === OWNER);
  assert.ok(ownerMsgs.some((m) => m.type === 'template' && m.template.name === 'owner_alert_v1'), 'owner alert via template (owner outside window)');
  assert.ok(ownerMsgs.some((m) => m.type === 'image'), 'photo forwarded to owner');
  const conv = env.DB.raw.prepare('SELECT * FROM conversations').get();
  assert.equal(conv.state, 'handoff');

  // 4. אחרי ההעברה: הלקוח כותב שוב → מועבר לחנן, בלי AI
  const before = aiRequests.length;
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'עוד כמה זמן?' } }, 'w4'), t0);
  assert.equal(aiRequests.length, before);
  assert.ok(textsTo(CUSTOMER).includes('העברתי גם את זה לחנן. הוא יחזור אליך בהקדם.'));

  // 5. חנן: "בדרך"  (חנן כותב לבוט → נפתח לו חלון, אז התשובות אליו בטקסט חופשי)
  sent.length = 0;
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בדרך 0541234567 15' } }, 'o1'), t0);
  assert.ok(textsTo(CUSTOMER)[0].includes('15 דקות'));
  assert.ok(textsTo(OWNER)[0].startsWith('✓'));

  // 6. חנן קובע עבודה מתואמת למחר 14:30
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 15/10/2026 14:30 הרצל 5 חולון' } }, 'o2'), t0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='open'").get().n, 1);

  // 7. תזכורת יום לפני (יום חמישי 15/10 14:30 בישראל = 11:30Z). רצים ב-14/10 17:00 בישראל
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-14T14:00:00Z'));
  assert.equal(sent.filter((m) => m.to === CUSTOMER).length, 1, 'day-before reminder');
  // תזכורת שעתיים לפני
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-15T09:20:00Z'));
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('14:30') || t.startsWith('[template')), 'two-hours reminder');

  // 8. סיום → אחרי 3 שעות בקשת ביקורת (הלקוח מחוץ לחלון → תבנית)
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'o3'), new Date('2026-10-15T12:00:00Z'));
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-15T15:30:00Z'));
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.template?.name === 'review_request_v1'), 'review template');

  // 9. המלצה אחרי שבוע
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-23T09:00:00Z'));
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.template?.name === 'referral_v1'), 'referral template');

  // 10. דוח שבועי
  sent.length = 0;
  await weeklyReport(env, new Date('2026-10-18T06:00:00Z'));
  const report = sent.find((m) => m.to === OWNER);
  assert.ok(report, 'weekly report sent');
});

test('urgent → immediate handoff; spam → silent; voice → transcribed', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'חנן מקבל את זה עכשיו. אם יש סכנת חיים התקשרו גם ל-101', urgent: true, urgent_reason: 'ילד נעול ברכב', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הילד שלי נעול באוטו!!' } }, 'u1'), t0);
  const alert = sent.find((m) => m.to === OWNER);
  assert.ok(alert, 'owner alerted');
  assert.equal(env.DB.raw.prepare("SELECT type FROM events WHERE type='urgent'").get()?.type, 'urgent');

  const SPAM = '972521111111';
  aiQueue = [ai({ category: 'spam' })];
  await processWebhook(env, inbound(SPAM, { type: 'text', text: { body: 'מבצע על הלוואות!' } }, 's1'), t0);
  assert.equal(sent.filter((m) => m.to === SPAM).length, 0);

  const VOICE = '972531111111';
  aiQueue = [ai({ reply: 'באיזה רחוב?' })];
  await processWebhook(env, inbound(VOICE, { type: 'audio', audio: { id: 'aud1' } }, 'v1'), t0);
  assert.match(aiRequests.at(-1).messages.at(-1).content, /\[הודעה קולית\] ננעלתי בחוץ/);
});

test('coexistence echo stops the bot', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'מה קרה?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'e1'), t0);
  await processWebhook(env, { entry: [{ changes: [{ value: { message_echoes: [{ from: '123', to: CUSTOMER, type: 'text', text: { body: 'אני בדרך' } }] } }] }] }, t0);
  const n = aiRequests.length;
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'תודה' } }, 'e2'), t0);
  assert.equal(aiRequests.length, n, 'bot does not answer after Hanan took over');
});

test('known contacts: bot stays silent', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  const FRIEND = '972521234567', OLD = '972531234567', NEWC = '972541111111';

  // 1. סנכרון היסטוריה מהאפליקציה בזמן החיבור
  await processWebhook(env, { entry: [{ changes: [{ field: 'history', value: { history: [{ threads: [{ id: OLD, messages: [{ from: OLD, id: 'h1' }] }] }] } }] }] }, t0);
  // 2. חנן מסמן חבר כמוכר
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'שקט 052-1234567' } }, 'k1'), t0);
  assert.ok(textsTo(OWNER).some((t) => t.includes('סומן כמוכר')));

  await processWebhook(env, inbound(FRIEND, { type: 'text', text: { body: 'אחי מה נשמע' } }, 'k2'), t0);
  await processWebhook(env, inbound(OLD, { type: 'text', text: { body: 'היי חנן' } }, 'k3'), t0);
  assert.equal(aiRequests.length, 0, 'no AI for known contacts');
  assert.equal(sent.filter((m) => m.to === FRIEND || m.to === OLD).length, 0, 'no bot reply to known contacts');

  // 3. מישהו חדש מקבל את הבוט כרגיל
  aiQueue = [ai({ reply: 'היי, מה קרה?' })];
  await processWebhook(env, inbound(NEWC, { type: 'text', text: { body: 'ננעלתי' } }, 'k4'), t0);
  assert.equal(aiRequests.length, 1);

  // 4. חנן כותב בעצמו למישהו מהאפליקציה → מעכשיו הוא מוכר
  await processWebhook(env, { entry: [{ changes: [{ value: { message_echoes: [{ from: '123', to: NEWC, type: 'text', text: { body: 'אני מטפל' } }] } }] }] }, t0);
  await processWebhook(env, inbound(NEWC, { type: 'text', text: { body: 'תודה' } }, 'k5'), t0);
  assert.equal(aiRequests.length, 1, 'silent after Hanan wrote to him');

  // 5. "בוט" מחזיר את הבוט
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בוט 052-1234567' } }, 'k6'), t0);
  aiQueue = [ai({ reply: 'היי!' })];
  await processWebhook(env, inbound(FRIEND, { type: 'text', text: { body: 'ננעלתי' } }, 'k7'), t0);
  assert.equal(aiRequests.length, 2);
});

test('receipts: Hanan forwards a PDF or a link → customer gets it, job closes, review follows', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'מה הכתובת?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי' } }, 'r1'), t0);

  // 1. PDF בלי טלפון בכיתוב → חנן מקבל הסבר
  await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdf1', filename: 'r.pdf', caption: 'קבלה' } }, 'r2'), t0);
  assert.ok(textsTo(OWNER).some((t) => t.includes('לא ראיתי טלפון')));

  // 2. PDF עם טלפון → נשלח ללקוח כמסמך (בתוך 24 שעות)
  await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdf1', filename: 'r.pdf', caption: '054-1234567' } }, 'r3'), t0);
  const doc = sent.find((m) => m.to === CUSTOMER && m.type === 'document');
  assert.equal(doc.document.id, 'uploaded-media');
  assert.ok(textsTo(OWNER).some((t) => t.includes('הקבלה נשלחה')));
  const job = env.DB.raw.prepare('SELECT * FROM jobs WHERE phone = ?').get(CUSTOMER);
  assert.equal(job.status, 'done');
  assert.ok(job.invoice_sent_at);

  // 3. ביקורת אחרי 3 שעות
  await runEvery15(env, new Date(t0.getTime() + 3.5 * 3600000));
  assert.ok(sent.some((m) => m.to === CUSTOMER && (m.text?.body || '').includes('g.page')));

  // 4. קבלה לפי קישור ללקוח ישן (מחוץ לחלון) → תבנית עם PDF
  const OLDC = '972549999999';
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'קבלה 0549999999 https://example.com/r.pdf' } }, 'r4'), t0);
  const tpl = sent.find((m) => m.to === OLDC);
  assert.equal(tpl.template.name, 'invoice_v1');
  assert.equal(tpl.template.components[0].parameters[0].document.link, 'https://example.com/r.pdf');
});

test('owner reminders: morning agenda and an hour before each job', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  // יום שלישי 13/10/2026, 06:00 בישראל (03:00 UTC)
  const t0 = new Date('2026-10-13T03:00:00Z');
  aiQueue = [ai({ reply: 'מה הכתובת?', customer_name: 'דני' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צריך להחליף צילינדר' } }, 'o1'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 13/10/2026 11:00 הרצל 5 חולון' } }, 'o2'), t0);
  assert.ok(textsTo(OWNER).some((t) => t.includes('תזכורת בבוקר ושעה לפני')));

  // 07:00 בבוקר: רשימת העבודות, פעם אחת בלבד
  const t7 = new Date('2026-10-13T04:00:00Z');
  await runEvery15(env, t7);
  await runEvery15(env, new Date(t7.getTime() + 10 * 60000));
  const agendas = textsTo(OWNER).filter((t) => t.includes('העבודות שלך היום'));
  assert.equal(agendas.length, 1);
  assert.ok(agendas[0].includes('הרצל 5 חולון') && agendas[0].includes('waze.com'));

  // 09:45: עוד לא; 10:00: שעה לפני → תזכורת לחנן, פעם אחת
  await runEvery15(env, new Date('2026-10-13T06:30:00Z'));
  assert.equal(textsTo(OWNER).filter((t) => t.startsWith('תזכורת: עבודה')).length, 0);
  await runEvery15(env, new Date('2026-10-13T07:00:00Z'));
  await runEvery15(env, new Date('2026-10-13T07:15:00Z'));
  const rem = textsTo(OWNER).filter((t) => t.startsWith('תזכורת: עבודה'));
  assert.equal(rem.length, 1);
  assert.ok(rem[0].includes('היום ב-11:00'));
  // והלקוח קיבל את שלו (שעתיים לפני)
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('11:00')));
});

test('nobody left hanging: customer nudge, partial handoff, owner nudges, done check', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 13, h - 3, m)); // שעון ישראל, יום שלישי
  const C2 = '972547777777';
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'n0'), at(9));

  // לקוח א' עונה פעם אחת ונעלם
  aiQueue = [ai({ reply: 'מה הכתובת?', issue: 'נעול בחוץ', customer_name: 'משה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ' } }, 'n1'), at(10));
  await runEvery15(env, at(10, 15));
  assert.ok(!textsTo(CUSTOMER).includes(MESSAGES.customerNudge), 'not before 30 min');
  await runEvery15(env, at(10, 30));
  await runEvery15(env, at(10, 45));
  assert.equal(textsTo(CUSTOMER).filter((t) => t === MESSAGES.customerNudge).length, 1, 'one nudge only');
  // 3 שעות אחרי התזכורת: חנן מקבל את מה שיש
  await runEvery15(env, at(13, 30));
  assert.ok(textsTo(OWNER).some((t) => t.includes('התחיל לכתוב ולא סיים') && t.includes('נעול בחוץ')));

  // חנן כותב "טופל" על לקוח א' → אין תזכורות עליו
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'טופל 054-1234567' } }, 'n3'), at(13, 40));
  assert.ok(!textsTo(OWNER).some((t) => t.includes('עדיין לא חזרת') && t.includes('054-1234567')));

  // לקוח ב' מגיע עד הסוף, חנן לא מגיב
  aiQueue = [ai({ reply: 'מעביר לחנן', issue: 'צילינדר', address: 'הרצל 1', ready_for_handoff: true })];
  await processWebhook(env, inbound(C2, { type: 'text', text: { body: 'צריך צילינדר בהרצל 1' } }, 'n2'), at(14));
  const nudges = () => textsTo(OWNER).filter((t) => t.includes('עדיין לא חזרת')).length;
  await runEvery15(env, at(14, 15));
  assert.equal(nudges(), 0);
  await runEvery15(env, at(14, 30));
  assert.equal(nudges(), 1);
  await runEvery15(env, at(15, 30));
  assert.equal(nudges(), 2);
  assert.ok(textsTo(C2).includes(MESSAGES.customerReassure), 'customer reassured on second nudge');
  await runEvery15(env, at(17));
  assert.equal(nudges(), 2, 'max two');
  assert.ok(!textsTo(OWNER).some((t) => t.includes('עדיין לא חזרת') && t.includes('054-1234567')), 'no nudges after טופל');


  // עבודה שעבר זמנה ולא סומנה
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0547777777 13/10/2026 16:00' } }, 'n4'), at(15, 40));
  await runEvery15(env, at(19, 15));
  await runEvery15(env, at(19, 30));
  assert.equal(textsTo(OWNER).filter((t) => t.startsWith('מה קרה עם העבודה')).length, 1);
});
