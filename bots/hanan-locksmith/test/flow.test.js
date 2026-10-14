// בדיקת זרימה מלאה: D1 מדומה על SQLite אמיתי, ו-fetch מדומה ל-Meta, Anthropic ו-Google.
// הרצה: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// ---------- D1 מדומה ----------
function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_settings.sql', '0003_knowledge.sql', '0004_ultramsg.sql', '0005_leads.sql']) db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
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
let outSeq = 0;
let yeshQueue = [], yeshRequests = [];
const sheet = [];        // גיליון הגוגל המדומה
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
    if (url.endsWith('/messages') || url === 'https://waba-v2.360dialog.io/messages') { sent.push(JSON.parse(init.body)); return Response.json({ messages: [{ id: `wamid.out${++outSeq}` }] }); }
    if (url.endsWith('/media')) return Response.json({ id: 'uploaded-media' });
    return Response.json({ url: 'https://lookaside.example/media', mime_type: 'image/jpeg' });
  }
  if (url.includes('lookaside.example')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  if (url.includes('api.ultramsg.com/instance1/contacts')) return Response.json([{ id: '972509999999@c.us', name: 'אמא', isMyContact: true }, { id: '972508888888@c.us', name: '', isMyContact: false }, { id: '120@g.us', name: 'קבוצה' }]);
  if (url.includes('api.ultramsg.com/instance1/instance/status')) return Response.json({ status: { accountStatus: { status: 'authenticated' } } });
  if (url.includes('api.ultramsg.com/instance1/instance/settings')) return Response.json(init.method === 'POST' ? { changed: true } : { webhook_url: 'https://bot.example/webhook?key=secret', webhook_message_create: 'true' });
  if (url.startsWith('https://api.ultramsg.com/')) {
    const b = JSON.parse(init.body);
    const type = url.split('/messages/')[1];
    sent.push({ to: b.to.replace('+', ''), type: type === 'chat' ? 'text' : type, text: type === 'chat' ? { body: b.body } : undefined, ultra: b });
    return Response.json({ sent: 'true', message: 'ok', id: ++outSeq });
  }
  if (url.startsWith('https://ultra-media.example/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'g', expires_in: 3600 });
  if (url.startsWith('https://sheets.googleapis.com/')) {
    const range = decodeURIComponent(url.split('/values/')[1].split('?')[0]);
    if (!init.method) return Response.json({ values: range === 'A1:J1' ? sheet.slice(0, 1) : sheet });
    const row = JSON.parse(init.body).values[0];
    if (range.endsWith(':append')) sheet.push(row);
    else sheet[Number(range.match(/^A(\d+)/)[1]) - 1] = row;
    return Response.json({});
  }
  if (url.includes('api.yeshinvoice.co.il')) { yeshRequests.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return Response.json(yeshQueue.shift() || { Success: true, ReturnValue: [], totalpage: 1 }); }
  throw new Error('unexpected fetch ' + url);
};

const { processWebhook } = await import('../src/index.js');
const { runEvery15, weeklyReport } = await import('../src/cron.js');
const { parseCommand } = await import('../src/owner.js');
const util = await import('../src/util.js');
const { MESSAGES, FEATURES } = await import('../src/config.js');
// רוב הבדיקות של הקבלות רצות עם הקבלות דלוקות; הבדיקה האחרונה בודקת את המצב הכבוי (ברירת המחדל)
FEATURES.receipts = true;

const OWNER = '972503429998';
const CUSTOMER = '972541234567';
function makeEnv() {
  return {
    DB: makeD1(), WA_TOKEN: 't', WA_PHONE_NUMBER_ID: '123', OWNER_PHONE: OWNER, ANTHROPIC_API_KEY: 'k',
    REVIEW_LINK: 'https://g.page/r/test/review', TEMPLATE_LANG: 'he', BURST_WAIT_MS: '0',
    AI: { run: async () => ({ text: 'ננעלתי בחוץ ברחוב הרצל' }) },
  };
}
const inbound = (from, msg, id) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'דני' } }], messages: [{ from, id, ...msg }] } }] }] });
const ai = (o) => ({ reply: '', language: 'he', category: 'service', urgent: false, urgent_reason: '', customer_name: '', issue: '', address: '', ready_for_handoff: false, customer_done: false, summary_for_owner: '', ...o });
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
  // חנן לא כתב לבוט ב-24 שעות: אי אפשר לשלוח לו תמונה, אז הוא מקבל הסבר איך לבקש אותה
  assert.ok(!ownerMsgs.some((m) => m.type === 'image'));
  assert.ok(ownerMsgs.some((m) => m.template?.components?.[0]?.parameters?.[0]?.text.includes('תמונות 054-1234567')));
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
  // ברגע שחנן כותב, הוא מקבל במלואם את הסיכום והתמונה שהגיעו קודם בקיצור
  assert.ok(textsTo(OWNER)[0].includes('פנייה חדשה') && textsTo(OWNER)[0].includes('הרצל 5 חולון'));
  assert.ok(sent.some((m) => m.to === OWNER && m.type === 'image'));
  assert.ok(textsTo(OWNER).some((t) => t.startsWith('✓')));
  // ופעם אחת בלבד
  const n = sent.length;
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תודה' } }, 'o1b'), t0);
  assert.equal(sent.length, n);

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
  assert.ok(textsTo(OWNER).some((t) => t.includes('של איזה לקוח הקבלה')));
  // חנן שולח את הטלפון בהודעה נפרדת → הקבלה יוצאת ללקוח
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: '054-1234567' } }, 'r2b'), t0);
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.type === 'document'));
  sent.length = 0;
  env.DB.raw.exec("UPDATE jobs SET invoice_sent_at = NULL, status = 'open', done_at = NULL");

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

// ---------- בעיות שתוקנו ----------
const lastSentTo = (to) => sent.filter((m) => m.to === to).at(-1);
const wamidOf = (m) => `wamid.out${sent.indexOf(m) + 1}`;

test('burst: three messages at once get one answer, and one summary to Hanan', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = { ...makeEnv(), BURST_WAIT_MS: '30' };
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'קיבלתי, מעביר לחנן', issue: 'ננעל', address: 'הרצל 5', ready_for_handoff: true })];
  const burst = { entry: [{ changes: [{ value: { contacts: [{ wa_id: CUSTOMER, profile: { name: 'דני' } }], messages: [
    { from: CUSTOMER, id: 'b1', type: 'text', text: { body: 'היי' } },
    { from: CUSTOMER, id: 'b2', type: 'text', text: { body: 'ננעלתי בחוץ' } },
    { from: CUSTOMER, id: 'b3', type: 'text', text: { body: 'הרצל 5 חולון' } },
  ] } }] }] };
  await processWebhook(env, burst, t0);
  assert.equal(aiRequests.length, 1, 'one AI call');
  assert.ok(JSON.stringify(aiRequests[0].messages).includes('ננעלתי בחוץ'));
  assert.equal(textsTo(CUSTOMER).length, 1, 'one reply');
  assert.equal(sent.filter((m) => m.to === OWNER).length, 1, 'one summary');
});

test('Hanan answers by quoting: commands without phone, free text goes to customer, acks are silent', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'q0'), t0);
  aiQueue = [ai({ reply: 'מעביר לחנן', issue: 'צילינדר', address: 'הרצל 5', ready_for_handoff: true, customer_name: 'דני' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צריך צילינדר, הרצל 5' } }, 'q1'), t0);
  const summary = lastSentTo(OWNER);
  assert.ok(summary.text.body.includes('פנייה חדשה'));

  // "בדרך 15" בציטוט על הסיכום
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בדרך 15' }, context: { id: wamidOf(summary) } }, 'q2'), t0);
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('15 דקות')));

  // טקסט חופשי בציטוט → ללקוח
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'אני מגיע עם הכלים, תחכה ליד הדלת' }, context: { id: wamidOf(summary) } }, 'q3'), t0);
  assert.equal(lastSentTo(CUSTOMER).text.body, 'אני מגיע עם הכלים, תחכה ליד הדלת');

  // "תודה" → שקט
  const before = sent.length;
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תודה' } }, 'q4'), t0);
  assert.equal(sent.length, before);

  // פקודה בלי טלפון ובלי ציטוט → שאלה על איזה לקוח
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום' } }, 'q5'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('על איזה לקוח'));

  // "סיום" בציטוט → העבודה נסגרה
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום' }, context: { id: wamidOf(summary) } }, 'q6'), t0);
  assert.equal(env.DB.raw.prepare("SELECT status FROM jobs WHERE phone = ?").get(CUSTOMER).status, 'done');

  // לקוח שלא כתב 24 שעות: חנן מקבל הסבר במקום שליחה
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עוד משהו?' }, context: { id: wamidOf(summary) } }, 'q7'), new Date(t0.getTime() + 25 * 3600000));
  assert.ok(lastSentTo(OWNER).text.body.includes('לא כתב ב-24 השעות'));
});

test('opt-out, reactions, photos on request', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');

  // לייק על הודעה: לא עושים כלום
  await processWebhook(env, inbound(CUSTOMER, { type: 'reaction', reaction: { emoji: '👍' } }, 'o0'), t0);
  assert.equal(aiRequests.length, 0);
  assert.equal(sent.length, 0);

  // תמונה + כתובת → חנן (שכתב לבוט היום) מקבל את התמונה, ואפשר לבקש שוב עם "תמונות"
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'o1'), t0);
  aiQueue = [ai({ reply: 'מה הכתובת?' }), ai({ reply: 'מעביר', issue: 'דלת', address: 'הרצל 5', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'image', image: { id: 'img9' } }, 'o2'), t0);
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרצל 5' } }, 'o3'), t0);
  assert.equal(sent.filter((m) => m.to === OWNER && m.type === 'image').length, 1);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תמונות 0541234567' } }, 'o4'), t0);
  assert.equal(sent.filter((m) => m.to === OWNER && m.type === 'image').length, 2);

  // "הסר" → מאשרים, ואחרי עבודה לא נשלחת בקשת ביקורת
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הסר' } }, 'o5'), t0);
  assert.equal(lastSentTo(CUSTOMER).text.body, MESSAGES.optedOut);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'o6'), t0);
  await runEvery15(env, new Date(t0.getTime() + 4 * 3600000));
  assert.ok(!textsTo(CUSTOMER).some((t) => t.includes('g.page')), 'no review after opt-out');
});

test('Shabbat mode and health check', async () => {
  const { BUSINESS } = await import('../src/config.js');
  const { buildSystemPrompt } = await import('../src/ai.js');
  const { healthText } = await import('../src/index.js');
  const friNight = new Date('2026-10-16T17:00:00Z'); // שישי 20:00
  assert.ok(!buildSystemPrompt({ now: friNight }).includes('עכשיו שבת'));
  BUSINESS.shabbat.enabled = true;
  try {
    assert.ok(buildSystemPrompt({ now: friNight }).includes('עכשיו שבת'));
    assert.ok(!buildSystemPrompt({ now: new Date('2026-10-17T17:30:00Z') }).includes('עכשיו שבת'), 'after havdalah');
  } finally { BUSINESS.shabbat.enabled = false; }

  assert.ok(healthText(makeEnv()).startsWith('not ready'), 'missing secrets reported');
  const full = { ...makeEnv(), WA_VERIFY_TOKEN: 'v', WA_APP_SECRET: 's' };
  assert.ok(healthText(full).startsWith('ok'));
  assert.ok(!healthText(full).includes('t'.repeat(0) + full.WA_TOKEN + 'x'), 'never prints values');
});

test('customer says never mind: conversation closes, no nudges', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 13, h - 3, m));
  aiQueue = [ai({ reply: 'מה הכתובת?' }), ai({ reply: 'מעולה, שמחים שהסתדר. אפשר לכתוב שוב בכל זמן.', customer_done: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי' } }, 'd1'), at(10));
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'עזוב, אשתי הגיעה עם מפתח' } }, 'd2'), at(10, 5));
  await runEvery15(env, at(11));
  await runEvery15(env, at(14));
  assert.ok(!textsTo(CUSTOMER).includes(MESSAGES.customerNudge));
  assert.equal(env.DB.raw.prepare('SELECT state FROM conversations').get().state, 'closed');
});

// ---------- ממצאי הבודק החיצוני ----------
test('review: message during a slow AI turn is not lost (urgent wins)', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  // ה-AI של ההודעה הראשונה "איטי": בזמן שהוא חושב, מגיעה הודעה שנייה
  let release;
  const gate = new Promise((r) => { release = r; });
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.anthropic.com') && ++calls === 1) await gate;
    return origFetch(url, init);
  };
  try {
    // התשובה הראשונה שחוזרת שייכת להודעה השנייה (הראשונה תקועה), והיא רואה את כל ההיסטוריה
    aiQueue = [
      ai({ reply: 'מעביר לחנן מיד!', issue: 'תינוק נעול בבית', address: 'הרצל 5', urgent: true, ready_for_handoff: true }),
      ai({ reply: 'מעביר לחנן', issue: 'נעול', address: 'הרצל 5', ready_for_handoff: true }),
    ];
    const first = processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרצל 5 חולון' } }, 'x1'), t0);
    await new Promise((r) => setTimeout(r, 20));
    const second = processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'יש תינוק בפנים!!' } }, 'x2'), t0);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await Promise.all([first, second]);
  } finally { globalThis.fetch = origFetch; }
  const conv = env.DB.raw.prepare('SELECT * FROM conversations').get();
  assert.equal(conv.urgent, 1, 'urgent recorded');
  assert.equal(textsTo(CUSTOMER).length, 1, 'customer gets one answer');
  assert.ok(aiRequests.some((r) => JSON.stringify(r).includes('יש תינוק בפנים') && JSON.stringify(r).includes('הרצל 5 חולון')), 'the answering turn saw both messages');
  const toOwner = sent.filter((m) => m.to === OWNER);
  assert.equal(toOwner.length, 1, 'one summary');
  assert.ok(JSON.stringify(toOwner[0]).includes('דחופה'));
});

test('review: Friday-evening partial lead reaches Hanan on Sunday; stuck turn is swept', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const fri = new Date('2026-10-16T17:45:00Z'); // שישי 20:45
  aiQueue = [ai({ reply: 'מה הכתובת?', issue: 'דלת תקועה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הדלת תקועה' } }, 'y1'), fri);
  for (let h = 1; h <= 33; h += 1) await runEvery15(env, new Date(fri.getTime() + h * 3600000)); // עד ראשון 06:45
  assert.equal(sent.filter((m) => m.to === OWNER).length, 0, 'nothing on Shabbat');
  await runEvery15(env, new Date('2026-10-18T05:00:00Z')); // ראשון 08:00
  assert.ok(JSON.stringify(sent.filter((m) => m.to === OWNER)).includes('דלת תקועה'));

  // תור "תקוע": הלקוח כתב, הבוט לא ענה (למשל התהליך נקטע) → אחרי 5 דקות לחנן
  const C3 = '972548888888';
  env.DB.raw.prepare("INSERT INTO customers (phone, first_seen, last_inbound_at) VALUES (?, ?, ?)").run(C3, '2026-10-18T05:00:00Z', '2026-10-18T05:00:00Z');
  const id = Number(env.DB.raw.prepare("INSERT INTO conversations (phone, started_at, updated_at) VALUES (?, ?, ?)").run(C3, '2026-10-18T05:00:00Z', '2026-10-18T05:00:00Z').lastInsertRowid);
  env.DB.raw.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'user', 'ננעלתי', ?)").run(id, '2026-10-18T05:00:00Z');
  await runEvery15(env, new Date('2026-10-18T05:15:00Z'));
  assert.ok(JSON.stringify(sent.filter((m) => m.to === OWNER)).includes('054-8888888'));
});

test('review: follow-up skipped after Hanan answered; owner images are not receipts; caption number not trusted over quote', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'z0'), t0);
  aiQueue = [ai({ reply: 'מעביר', issue: 'צילינדר', address: 'הרצל 5', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צילינדר, הרצל 5' } }, 'z1'), t0);
  const summary = lastSentTo(OWNER);
  // חנן עונה מהאפליקציה (echo)
  await processWebhook(env, { entry: [{ changes: [{ value: { message_echoes: [{ from: '123', to: CUSTOMER, type: 'text', text: { body: 'מגיע' } }] } }] }] }, t0);
  await runEvery15(env, new Date(t0.getTime() + 26 * 3600000));
  assert.ok(!sent.some((m) => m.to === CUSTOMER && m.template?.name === 'followup_v1'), 'no "still need help?"');

  // תמונה מחנן בציטוט: נשלחת ללקוח כתמונה, לא כקבלה, והעבודה לא נסגרת
  await processWebhook(env, inbound(OWNER, { type: 'image', image: { id: 'p1', caption: '250 ש"ח' }, context: { id: wamidOf(summary) } }, 'z2'), t0);
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.type === 'image'));
  assert.ok(!sent.some((m) => m.to === CUSTOMER && m.type === 'document'));
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 0);

  // קבלה עם "מספר קבלה" בכיתוב, בציטוט: הולכת ללקוח שבציטוט
  await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdf7', filename: 'r.pdf', mime_type: 'application/pdf', caption: 'קבלה מס 100234567' }, context: { id: wamidOf(summary) } }, 'z3'), t0);
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.type === 'document'));
  assert.ok(!sent.some((m) => m.to === '972100234567'));

  // "👍👍" בציטוט: לא נשלח ללקוח
  const n = sent.filter((m) => m.to === CUSTOMER).length;
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: '👍👍' }, context: { id: wamidOf(summary) } }, 'z4'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סבבה תודה' }, context: { id: wamidOf(summary) } }, 'z5'), t0);
  assert.equal(sent.filter((m) => m.to === CUSTOMER).length, n);
  // "סיים" עם שגיאה → מתפרש כסיום
  assert.equal(parseCommand('סיים.').cmd, 'done');
  assert.equal(parseCommand('סיום 054 123 4567').phone, CUSTOMER);
});

test('review: no 2h reminder at night, no day-before for same-day jobs, no past appointments', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T05:00:00Z'); // 08:00
  aiQueue = [ai({ reply: 'היי, מה קרה?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'r0'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 15/10/2026 06:30' } }, 'r1'), t0);
  await runEvery15(env, new Date('2026-10-15T01:15:00Z')); // 04:15
  assert.ok(!sent.some((m) => m.to === CUSTOMER && (m.template?.name === 'appt_today_v1' || (m.text?.body || '').includes('06:30'))), 'no reminder at 04:15');

  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 14/10/2026 13:00' } }, 'r2'), t0);
  await runEvery15(env, new Date('2026-10-14T05:15:00Z'));
  assert.ok(!textsTo(CUSTOMER).some((t) => t.startsWith('תזכורת: חנן מגיע אליך')), 'no day-before for same-day job');

  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 13/10/2026 10:00' } }, 'r3'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('כבר עברו'));
});

// ---------- סבב בדיקה שני ----------
test('review2: night spam misfire reaches Hanan; "בוט" makes the bot answer', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const night = new Date('2026-10-13T21:30:00Z'); // 00:30
  aiQueue = [ai({ category: 'spam' }), ai({ reply: 'מה הכתובת?', issue: 'ננעל עם תינוק בבית', urgent: true, ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 's1'), night);
  assert.equal(sent.filter((m) => m.to === OWNER).length, 0, 'no ping at 00:30');
  // ההודעה הבאה כבר לא נזרקת: ה-AI בודק אותה מחדש
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ עם תינוק בבית! הרצל 5' } }, 's2'), new Date(night.getTime() + 3 * 60000));
  assert.ok(JSON.stringify(sent.filter((m) => m.to === OWNER)).includes('דחופה'));

  // ובבוקר, כשחנן כותב, הוא מקבל את שורת הספאם, ויכול לכתוב "בוט" בתשובה עליה
  const C4 = '972546666666';
  aiQueue = [ai({ category: 'spam' })];
  await processWebhook(env, inbound(C4, { type: 'text', text: { body: 'שלום' } }, 's3'), night);
  const morning = new Date('2026-10-14T05:00:00Z');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 's4'), morning);
  const note = sent.find((m) => m.to === OWNER && (m.text?.body || '').includes('סיננתי כספאם') && m.text.body.includes('054-6666666'));
  assert.ok(note, 'spam note delivered in the morning');
  aiQueue = [ai({ reply: 'היי! במה אפשר לעזור?' })];
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בוט' }, context: { id: wamidOf(note) } }, 's5'), morning);
  assert.equal(lastSentTo(C4).text.body, 'היי! במה אפשר לעזור?');
  await runEvery15(env, new Date(morning.getTime() + 15 * 60000));
  assert.ok(!textsTo(OWNER).some((t) => t.includes('הבוט לא הצליח לענות')), 'no false stuck alert');
});

test('review2: receipts FIFO, caption vs quote, opt-out sticks on "תודה", quiet closes', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  const A = '972541111111', B = '972542222222';
  for (const [p, id] of [[A, 'f1'], [B, 'f2']]) {
    aiQueue = [ai({ reply: 'מה הכתובת?' })];
    await processWebhook(env, inbound(p, { type: 'text', text: { body: 'היי' } }, id), t0);
  }
  await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdfA', filename: 'a.pdf', mime_type: 'application/pdf' } }, 'f3'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdfB', filename: 'b.pdf', mime_type: 'application/pdf' } }, 'f4'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: '054-1111111' } }, 'f5'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: '054-2222222' } }, 'f6'), t0);
  assert.equal(sent.find((m) => m.to === A && m.type === 'document').document.filename, 'a.pdf');
  assert.equal(sent.find((m) => m.to === B && m.type === 'document').document.filename, 'b.pdf');

  // "הסר" ואז "תודה": נשאר מוסר, בלי "עדיין צריך עזרה?"
  aiQueue = [ai({ reply: 'בשמחה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הסר' } }, 'f7'), t0);
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'תודה' } }, 'f8'), t0);
  assert.equal(env.DB.raw.prepare('SELECT opted_out FROM customers WHERE phone = ?').get(CUSTOMER).opted_out, 1);
  await runEvery15(env, new Date(t0.getTime() + 45 * 60000));
  assert.ok(!textsTo(CUSTOMER).includes(MESSAGES.customerNudge));

  // "שקט" על מספר באמצע שיחה: נסגר, בלי תזכורות ובלי התראה לחנן
  const Q = '972543333333';
  aiQueue = [ai({ reply: 'מה הכתובת?' })];
  await processWebhook(env, inbound(Q, { type: 'text', text: { body: 'אחי' } }, 'f9'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'שקט 054-3333333' } }, 'f10'), t0);
  for (let h = 1; h <= 8; h++) await runEvery15(env, new Date(t0.getTime() + h * 3600000));
  assert.equal(sent.filter((m) => m.to === Q).length, 1, 'only the first bot reply');
  assert.ok(!textsTo(OWNER).some((t) => t.includes('054-3333333') && t.includes('לא סיים')));
});

test('review2: command parsing edge cases and helpers', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-13T08:00:00Z');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'e0'), t0);
  aiQueue = [ai({ reply: 'מעביר', issue: 'דלת', address: 'הרצל 5', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'דלת, הרצל 5' } }, 'e1'), t0);
  const summary = lastSentTo(OWNER);
  const ctx = { context: { id: wamidOf(summary) } };

  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור מחר בשעה 14:30' }, ...ctx }, 'e2'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('מחר ב-14:30'));
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 12/10 14:30' }, ...ctx }, 'e3'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('כבר עברו'));
  // פקודה שלא הבנו בציטוט: לא נשלחת ללקוח
  const n = sent.filter((m) => m.to === CUSTOMER).length;
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בדרך בעוד רבע שעה' }, ...ctx }, 'e4'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'כן' }, ...ctx }, 'e5'), t0);
  assert.equal(sent.filter((m) => m.to === CUSTOMER).length, n);
  assert.ok(lastSentTo(OWNER).text.body.includes('לא נשלח'));

  assert.equal(util.normalizePhone('+1 415 555 1234'), '14155551234');
  assert.equal(util.normalizePhone('+972 54 1234567'), CUSTOMER);
  assert.equal(util.normalizePhone('100234567'), '');
});

test('control: pause/resume and status, from Hanan or from Ariel', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const ADMIN = '972524666175';
  const env = { ...makeEnv(), ADMIN_PHONE: ADMIN };
  const t0 = new Date('2026-10-14T08:00:00Z');
  await processWebhook(env, inbound(ADMIN, { type: 'text', text: { body: 'עצור בוט' } }, 'c1'), t0);
  assert.ok(lastSentTo(ADMIN).text.body.includes('בהפסקה'), 'answer goes to Ariel');
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי' } }, 'c2'), t0);
  assert.equal(aiRequests.length, 0, 'no AI while paused');
  assert.ok(sent.some((m) => m.to === OWNER && JSON.stringify(m).includes('ננעלתי')), 'forwarded to Hanan');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'הפעל בוט' } }, 'c3'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סטטוס' } }, 'c4'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('הבוט פועל'));
});

test('Hanan teaches the bot: למד / מה למדת / שכח, and it reaches the AI', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'למד החלפת צילינדר עולה 250-450 ש"ח כולל הגעה' } }, 'l1'), t0);
  assert.ok(lastSentTo(OWNER).text.body.startsWith('✓ למדתי (1)'));
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'למד: אני לא עובד בשבת' } }, 'l2'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'מה למדת' } }, 'l3'), t0);
  assert.ok(lastSentTo(OWNER).text.body.includes('2. אני לא עובד בשבת'));
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'שכח 2' } }, 'l4'), t0);
  aiQueue = [ai({ reply: 'בין 250 ל-450 כולל הגעה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'כמה עולה צילינדר?' } }, 'l5'), t0);
  const sys = JSON.stringify(aiRequests.at(-1).system);
  assert.ok(sys.includes('250-450'), 'taught fact in prompt');
  assert.ok(!sys.includes('לא עובד בשבת'), 'forgotten fact removed');
});

test('template definitions match what the bot sends and Meta rules', async () => {
  const { TEMPLATES, TEMPLATE_DEFS } = await import('../src/config.js');
  const names = new Set(TEMPLATE_DEFS.map((d) => d.name));
  for (const n of Object.values(TEMPLATES)) assert.ok(names.has(n), `template ${n} defined`);
  for (const d of TEMPLATE_DEFS) {
    const vars = d.body.match(/\{\{\d+\}\}/g) || [];
    assert.equal(vars.length, (d.examples || []).length, `${d.name}: one example per variable`);
    assert.ok(!/^\s*\{\{/.test(d.body) && !/\}\}\s*$/.test(d.body), `${d.name}: no variable at start/end`);
    assert.ok(d.body.length <= 1024);
  }
});

test('Yesh Invoice: new receipts go to customers automatically, no backlog, no double send', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0; yeshRequests = [];
  const env = { ...makeEnv(), YESH_USERKEY: 'uk', YESH_SECRET: 'sk' };
  const t0 = new Date('2026-10-14T07:00:00Z');
  aiQueue = [ai({ reply: 'מה הכתובת?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי' } }, 'y0'), t0);

  // פעם ראשונה: רק מסמנים, לא שולחים קבלות ישנות
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 9, DocumentNumber: 100, CustomerPhone: '0541234567', pdfUrl: 'https://yesh.example/100.pdf', CustomerName: 'דני' }] }];
  await runEvery15(env, t0);
  assert.equal(yeshRequests.length, 0, 'first run only stores the starting point');

  // אחר כך: קבלה חדשה → ללקוח, עם הקישור ל-PDF
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 9, DocumentNumber: 101, CustomerPhone: '054-1234567', pdfUrl: 'https://yesh.example/101.pdf', CustomerName: 'דני' }] }];
  await runEvery15(env, new Date(t0.getTime() + 15 * 60000));
  assert.equal(JSON.parse(yeshRequests[0].auth).userkey, 'uk');
  assert.deepEqual(yeshRequests[0].body.docTypes, [6, 8, 9]);
  const doc = sent.find((m) => m.to === CUSTOMER && m.type === 'document');
  assert.equal(doc.document.link, 'https://yesh.example/101.pdf');
  assert.equal(env.DB.raw.prepare('SELECT invoice_doc_id FROM jobs').get().invoice_doc_id, '9-101');

  // אותו מסמך שוב (חפיפה בזמנים): לא נשלח פעמיים
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 9, DocumentNumber: 101, CustomerPhone: '054-1234567', pdfUrl: 'https://yesh.example/101.pdf' }] }];
  await runEvery15(env, new Date(t0.getTime() + 30 * 60000));
  assert.equal(sent.filter((m) => m.to === CUSTOMER && m.type === 'document').length, 1);

  // חנן שלח קבלה ידנית ללקוח אחר, ואחר כך היא מגיעה גם מיש חשבונית: לא נשלחת שוב
  const B = '972542222222';
  aiQueue = [ai({ reply: 'מה קרה?' })];
  await processWebhook(env, inbound(B, { type: 'text', text: { body: 'היי' } }, 'y1'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'קבלה 0542222222 https://x.example/m.pdf' } }, 'y2'), new Date(t0.getTime() + 40 * 60000));
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 6, DocumentNumber: 7, CustomerPhone: '0542222222', pdfUrl: 'https://yesh.example/7.pdf' }] }];
  await runEvery15(env, new Date(t0.getTime() + 45 * 60000));
  assert.equal(sent.filter((m) => m.to === B && (m.type === 'document' || m.template?.name === 'invoice_v1')).length, 1);
});

test('360dialog provider: same messages, different address and key; webhook needs the secret header', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { if (String(url).includes('360dialog')) { calls.push({ url: String(url), headers: init.headers }); if (String(url).endsWith('/messages')) { sent.push(JSON.parse(init.body)); return Response.json({ messages: [{ id: 'd360.1' }] }); } } return orig(url, init); };
  try {
    const env = { ...makeEnv(), WA_PROVIDER: '360dialog', D360_API_KEY: 'dk', WA_VERIFY_TOKEN: 'sec' };
    aiQueue = [ai({ reply: 'מה קרה?' })];
    await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'd1'), new Date('2026-10-14T08:00:00Z'));
    const send = calls.find((c) => c.url === 'https://waba-v2.360dialog.io/messages');
    assert.ok(send, 'sent through 360dialog');
    assert.equal(send.headers['D360-API-KEY'], 'dk');

    const worker = (await import('../src/index.js')).default;
    const post = (h) => worker.fetch(new Request('https://bot.example/webhook', { method: 'POST', headers: h, body: '{"entry":[]}' }), env, { waitUntil() {} });
    assert.equal((await post({})).status, 401, 'no secret header → rejected');
    assert.equal((await post({ 'x-bot-secret': 'sec' })).status, 200);
  } finally { globalThis.fetch = orig; }
});

test('/admin/setup: wires the webhook, creates missing templates, checks keys; needs the secret', async () => {
  const reqs = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const method = init.method || 'GET';
    reqs.push({ url, method, body: init.body, headers: init.headers });
    const G = 'https://graph.facebook.com/v24.0';
    if (url.startsWith(`${G}/123?fields=`)) return Response.json({ display_phone_number: '+1 555 0100', verified_name: 'חנן המנעולן', quality_rating: 'GREEN', status: 'CONNECTED' });
    if (url === `${G}/APP1/subscriptions`) return Response.json({ success: true });
    if (url === `${G}/WABA1/subscribed_apps`) return method === 'POST' ? Response.json({ success: true }) : Response.json({ data: [{ whatsapp_business_api_data: { name: 'Onerishon' } }] });
    if (url.startsWith(`${G}/WABA1/message_templates?`)) return Response.json({ data: [{ name: 'followup_v1', status: 'APPROVED', language: 'he' }] });
    if (url.startsWith(`${G}/APP1/uploads?`)) return Response.json({ id: 'upload:77' });
    if (url === `${G}/upload:77`) return Response.json({ h: '4::handle' });
    if (url === `${G}/WABA1/message_templates`) return Response.json({ id: 't1', status: 'PENDING', category: 'UTILITY' });
    if (url.includes('api.anthropic.com/v1/models')) return Response.json({ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' });
    return orig(url, init);
  };
  try {
    const env = { ...makeEnv(), WA_VERIFY_TOKEN: 'sec', WA_APP_SECRET: 'appsec', META_APP_ID: 'APP1', WABA_ID: 'WABA1', ADMIN_PHONE: '972524666175' };
    const worker = (await import('../src/index.js')).default;
    const get = (q) => worker.fetch(new Request(`https://bot.example/admin/setup${q}`), env, { waitUntil() {} });
    assert.equal((await get('?key=nope')).status, 403);
    const text = await (await get('?key=sec')).text();
    assert.ok(text.includes('✓ וואטסאפ: המספר +1 555 0100'), text);
    assert.ok(text.includes('✓ webhook'));
    const sub = reqs.find((r) => r.url.endsWith('/APP1/subscriptions'));
    const params = new URLSearchParams(sub.body);
    assert.equal(params.get('callback_url'), 'https://bot.example/webhook');
    assert.equal(params.get('access_token'), 'APP1|appsec');
    assert.ok(params.get('fields').includes('smb_message_echoes'));
    const created = reqs.filter((r) => r.url.endsWith('/WABA1/message_templates') && r.method === 'POST').map((r) => JSON.parse(r.body));
    assert.equal(created.length, 8, 'all but the existing one');
    assert.ok(!created.some((t) => t.name === 'followup_v1'));
    const inv = created.find((t) => t.name === 'invoice_v1');
    assert.deepEqual(inv.components[0], { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: ['4::handle'] } });
    const alert = created.find((t) => t.name === 'owner_alert_v1');
    assert.equal(alert.components.at(-1).buttons[0].text, 'קיבלתי');
    assert.deepEqual(created.find((t) => t.name === 'appt_reminder_v1').components[0].example.body_text, [['מחר ב-14:30', 'הרצל 5 חולון']]);
    assert.ok(text.includes('✓ AI: המפתח עובד'));
    assert.ok(text.includes('הכל מוכן'), text);
    // check=1 לא משנה כלום
    const before = reqs.filter((r) => r.method === 'POST').length;
    await get('?key=sec&check=1');
    assert.equal(reqs.filter((r) => r.method === 'POST').length, before);
  } finally { globalThis.fetch = orig; }
});

test('receipts off (the default for Hanan): no Yesh polling, PDFs are plain files, no receipt in help', async () => {
  FEATURES.receipts = false;
  try {
    sent.length = 0; aiRequests = []; outSeq = 0; yeshRequests = [];
    const env = { ...makeEnv(), YESH_USERKEY: 'uk', YESH_SECRET: 'sk' };
    const t0 = new Date('2026-10-14T08:00:00Z');
    await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'x0'), t0);
    assert.ok(!lastSentTo(OWNER).text.body.includes('קבלה'), 'help has no receipt line');
    aiQueue = [ai({ reply: 'מעביר', issue: 'דלת', address: 'הרצל 5', ready_for_handoff: true })];
    await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'דלת, הרצל 5' } }, 'x1'), t0);
    const summary = lastSentTo(OWNER);
    for (let i = 1; i <= 3; i++) await runEvery15(env, new Date(t0.getTime() + i * 15 * 60000));
    assert.equal(yeshRequests.length, 0, 'Yesh never called');
    await processWebhook(env, inbound(OWNER, { type: 'document', document: { id: 'pdfz', filename: 'מחירון.pdf', mime_type: 'application/pdf' }, context: { id: wamidOf(summary) } }, 'x2'), t0);
    const d = sent.find((m) => m.to === CUSTOMER && m.type === 'document');
    assert.equal(d.document.filename, 'מחירון.pdf');
    assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'done'").get().n, 0, 'a file does not close the job');
  } finally { FEATURES.receipts = true; }
});

test('customer table: one row per lead, status updated to the end; no review link → referral still goes out', async () => {
  sent.length = 0; sheet.length = 0;
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { ...makeEnv(), SHEET_ID: 'S', GOOGLE_SA_JSON: JSON.stringify({ client_email: 'bot@x.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }), REVIEW_LINK: '' };
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'ננעל בחוץ', address: 'הרצל 5 חולון', customer_name: 'דני', ready_for_handoff: true, summary_for_owner: 'מחכה ליד הדלת' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ, הרצל 5 חולון' } }, 'sh1'), t0);
  assert.equal(sheet[0][0], 'תאריך פנייה', 'header row written');
  assert.equal(sheet.length, 2);
  assert.equal(sheet[1][1], 'הועבר לחנן');
  assert.equal(sheet[1][2], 'דני');
  assert.equal(sheet[1][3], '054-1234567');
  assert.equal(sheet[1][5], 'הרצל 5 חולון');

  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בדרך 0541234567 20' } }, 'sh2'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'sh3'), new Date('2026-10-14T10:00:00Z'));
  assert.equal(sheet.length, 2, 'same row, not a new one');
  assert.equal(sheet[1][1], 'עבודה הסתיימה');
  assert.match(sheet[1][8], /הועבר לחנן \| .*חנן בדרך .* \| .*עבודה הסתיימה/);

  // אין קישור לביקורות: מדלגים על הביקורת, וההמלצה עדיין יוצאת אחרי שבוע
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-14T14:00:00Z'));
  assert.ok(!sent.some((m) => m.template?.name === 'review_request_v1'));
  await runEvery15(env, new Date('2026-10-22T09:00:00Z'));
  assert.ok(sent.some((m) => m.to === CUSTOMER && m.template?.name === 'referral_v1'), 'referral without review link');

  // פנייה חדשה של אותו לקוח, חודש אחרי: שורה חדשה
  aiQueue = [ai({ reply: 'העברתי', issue: 'החלפת צילינדר', address: 'הרצל 5 חולון', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צריך להחליף צילינדר' } }, 'sh4'), new Date('2026-11-15T08:00:00Z'));
  assert.equal(sheet.length, 3);
  assert.equal(sheet[2][4], 'החלפת צילינדר');
});

test('UltraMsg: customer → handoff, Hanan commands, Hanan answering from his phone stops the bot, bot messages are not "Hanan"', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', WA_VERIFY_TOKEN: 'secret' };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const post = async (payload, key = 'secret') => {
    const res = await worker.fetch(new Request(`https://bot.example/webhook?key=${key}`, { method: 'POST', body: JSON.stringify(payload) }), env, ctx);
    await Promise.all(waits.splice(0));
    return res;
  };
  const recv = (from, data) => ({ event_type: 'message_received', instanceId: '1', data: { from: `${from}@c.us`, to: '972500000000@c.us', fromMe: false, pushname: 'דני', time: 1, ...data } });

  // בלי מילת הסוד: לא נכנס
  assert.equal((await post(recv(CUSTOMER, { id: 'u0', type: 'chat', body: 'היי' }), 'wrong')).status, 403);

  // לקוח כותב (גם בלילה/אחרי יממה אין תבניות: הכל טקסט רגיל)
  aiQueue = [ai({ reply: 'קיבלתי, העברתי לחנן', issue: 'ננעל בחוץ', address: 'הרצל 5 חולון', customer_name: 'דני', ready_for_handoff: true, summary_for_owner: 'מחכה ליד הדלת' })];
  await post(recv(CUSTOMER, { id: 'u1', type: 'chat', body: 'ננעלתי בחוץ הרצל 5 חולון' }));
  assert.deepEqual(textsTo(CUSTOMER), ['קיבלתי, העברתי לחנן']);
  const alert = sent.find((m) => m.to === OWNER);
  assert.ok(alert && alert.type === 'text' && alert.text.body.includes('הרצל 5 חולון'), 'owner gets the full summary as plain text, no template');

  // הבוט שלח ללקוח: חוזר אלינו כ-message_create, ולא נחשב "חנן ענה"
  await post({ event_type: 'message_create', data: { id: 'c1', from: '972500000000@c.us', to: `${CUSTOMER}@c.us`, fromMe: true, type: 'chat', body: 'קיבלתי, העברתי לחנן' } });
  assert.equal(env.DB.raw.prepare('SELECT owner_replied_at FROM conversations').get().owner_replied_at, null);

  // חנן עונה על הסיכום (ציטוט) עם "בדרך 15": הטלפון נלקח מהטקסט המצוטט
  sent.length = 0;
  await post(recv(OWNER, { id: 'u2', type: 'chat', body: 'בדרך 15', quotedMsg: { id: 'x', body: alert.text.body } }));
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('15 דקות')));

  // תמונה מהלקוח מגיעה כקישור
  aiQueue = [];
  await post(recv(CUSTOMER, { id: 'u3', type: 'image', body: '', media: 'https://ultra-media.example/a.jpg' }));

  // לקוח חדש, וחנן עונה לו בעצמו מהטלפון: הבוט מפסיק איתו
  const C2 = '972541111111';
  aiQueue = [ai({ reply: 'היי, מה קרה?' })];
  await post(recv(C2, { id: 'u4', type: 'chat', body: 'שלום' }));
  await post({ event_type: 'message_create', data: { id: 'c2', from: '972500000000@c.us', to: `${C2}@c.us`, fromMe: true, type: 'chat', body: 'אחי אני מתקשר אליך עכשיו' } });
  const conv2 = env.DB.raw.prepare('SELECT state, owner_replied_at FROM conversations WHERE phone = ?').get(C2);
  assert.equal(conv2.state, 'handoff');
  assert.ok(conv2.owner_replied_at);

  // קבוצות: מתעלמים
  const n = sent.length;
  await post({ event_type: 'message_received', data: { id: 'g1', from: '1203@g.us', fromMe: false, type: 'chat', body: 'היי' } });
  assert.equal(sent.length, n);

  // תזכורת שבוע אחרי, ללקוח שלא כתב מזמן: טקסט רגיל
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'u5'), new Date());
  const { runEvery15 } = await import('../src/cron.js');
  sent.length = 0;
  await runEvery15(env, new Date(Date.now() + 8 * 86400000));
  assert.ok(sent.filter((m) => m.to === CUSTOMER).every((m) => m.type === 'text'));
});

test('UltraMsg setup: saved contacts become known (bot stays quiet with family); test mode answers only listed phones', async () => {
  sent.length = 0;
  const { runSetup } = await import('../src/setup.js');
  const env = { ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', WA_VERIFY_TOKEN: 'secret', ANTHROPIC_API_KEY: '' };
  const text = await runSetup(env, { origin: 'https://bot.example' });
  assert.match(text, /המספר מחובר/);
  assert.match(text, /1 אנשי קשר שמורים/);
  assert.equal(env.DB.raw.prepare("SELECT known FROM customers WHERE phone = '972509999999'").get().known, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM customers WHERE phone = '972508888888'").get().n, 0);

  // מצב בדיקה
  const t = { ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', TEST_PHONES: CUSTOMER };
  aiQueue = [ai({ reply: 'היי' })];
  await processWebhook(t, inbound('972507777777', { type: 'text', text: { body: 'שלום' } }, 't1'), new Date());
  assert.equal(sent.length, 0, 'stranger ignored in test mode');
  await processWebhook(t, inbound(CUSTOMER, { type: 'text', text: { body: 'שלום' } }, 't2'), new Date());
  assert.deepEqual(textsTo(CUSTOMER), ['היי']);
});

test('language: an English-speaking customer gets the fixed messages in English; empty or emoji-only messages are ignored', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'Got it, I passed it to Hanan', language: 'en', issue: 'locked out', address: '5 Herzl St Holon', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: "Hi, I'm locked out, 5 Herzl St Holon" } }, 'l1'), t0);
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'how long?' } }, 'l2'), t0);
  assert.ok(textsTo(CUSTOMER).includes("I passed this on to Hanan too. He'll get back to you shortly."));
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'בדרך 0541234567 20' } }, 'l3'), t0);
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('about 20 minutes')));

  const n = sent.length, ai0 = aiRequests.length;
  await processWebhook(env, inbound('972547777777', { type: 'text', text: { body: '👍' } }, 'l4'), t0);
  await processWebhook(env, inbound('972547777777', { type: 'text', text: { body: ' ?! ' } }, 'l5'), t0);
  assert.equal(sent.length, n);
  assert.equal(aiRequests.length, ai0);
});

test('built-in customer table: one row per lead with live status, link via "טבלה", CSV export, protected', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), WA_VERIFY_TOKEN: 'secret', WORKER_URL: 'https://bot.example' };
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'ננעל בחוץ', address: 'הרצל 5 חולון', customer_name: 'דני', ready_for_handoff: true, summary_for_owner: 'מחכה ליד הדלת' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ הרצל 5 חולון' } }, 'tb1'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'tb2'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'טבלה' } }, 'tb3'), t0);
  const link = textsTo(OWNER).join('\n').match(/https:\/\/bot\.example\/table\?k=\w+/)?.[0];
  assert.ok(link, 'owner gets the table link');
  const page = await worker.fetch(new Request(link), env, { waitUntil() {} });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes('דני') && html.includes('עבודה הסתיימה') && html.includes('054-1234567') && html.includes('מחכה ליד הדלת'));
  const csv = await (await worker.fetch(new Request(`${link}&format=csv`), env, { waitUntil() {} })).text();
  assert.ok(csv.includes('עבודה הסתיימה'));
  assert.equal((await worker.fetch(new Request('https://bot.example/table?k=nope'), env, { waitUntil() {} })).status, 403);
});
