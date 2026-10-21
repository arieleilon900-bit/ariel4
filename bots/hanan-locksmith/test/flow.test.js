// בדיקת זרימה מלאה: D1 מדומה על SQLite אמיתי, ו-fetch מדומה ל-Meta, Anthropic ו-Google.
// הרצה: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// ---------- D1 מדומה ----------
function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_settings.sql', '0003_knowledge.sql', '0004_ultramsg.sql', '0005_leads.sql', '0006_outbox_retry.sql', '0007_summary_settle.sql', '0008_owner_questions.sql', '0009_photo_nudge.sql', '0010_fresh_start.sql', '0011_reset_test_phone.sql']) db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
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
const translateRequests = [];
// ההוראות נשלחות כשני חלקים: קבוע (נשמר בזיכרון הזמני) ומשתנה
const sysText = (req) => req.system.map((b) => b.text).join('\n');
let outSeq = 0;
let yeshQueue = [], yeshRequests = [];
const dualRequests = [];
const sheet = [];        // גיליון הגוגל המדומה
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    const req = JSON.parse(init.body);
    // תרגום שדות לחנן לעברית: לא צורך תשובה מהתור
    if (String(req.system).startsWith('תרגם לעברית')) {
      translateRequests.push(req);
      const src = JSON.parse(req.messages[0].content);
      const he = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v ? `בעברית: ${v}` : '']));
      return new Response(JSON.stringify({ id: 'msg_tr', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(he) }], usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_tr' } });
    }
    aiRequests.push(req);
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
  if (url.startsWith('https://api.dualhook.com/')) {
    dualRequests.push({ url, auth: (init.headers || {}).Authorization, method: init.method || 'GET' });
    if (url.endsWith('/messages')) { sent.push(JSON.parse(init.body)); return Response.json({ messages: [{ id: `wamid.out${++outSeq}` }] }); }
    if (url.endsWith('/content')) return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
    if (url.endsWith('/media')) return Response.json({ id: 'dual-media' });
    return Response.json({ url: `${url}/content`, mime_type: 'image/jpeg' });
  }
  throw new Error('unexpected fetch ' + url);
};

const { processWebhook } = await import('../src/index.js');
const { runEvery15, weeklyReport } = await import('../src/cron.js');
const { parseCommand } = await import('../src/owner.js');
const util = await import('../src/util.js');
const { MESSAGES, FEATURES } = await import('../src/config.js');
// רוב הבדיקות של הקבלות רצות עם הקבלות דלוקות; הבדיקה האחרונה בודקת את המצב הכבוי (ברירת המחדל)
FEATURES.receipts = true;
// רוב הבדיקות בודקות את ההתנהגות הכללית (תזכורת יום לפני, בלי מצב שבת, דוח ביום ראשון). ההגדרות של חנן נבדקות בבדיקה נפרדת בסוף
const { BUSINESS: B0, TIMING: T0 } = await import('../src/config.js');
const HANAN = { shabbat: B0.shabbat.enabled, rem: T0.customerReminderHours, weekly: T0.weeklyReportAt, yearly: T0.yearlyAfterDays };
B0.shabbat.enabled = false; delete T0.customerReminderHours; T0.weeklyReportAt = null; T0.yearlyAfterDays = 365;

const OWNER = '972503429998';
const CUSTOMER = '972541234567';
function makeEnv() {
  return {
    DB: makeD1(), WA_TOKEN: 't', WA_PHONE_NUMBER_ID: '123', OWNER_PHONE: OWNER, ANTHROPIC_API_KEY: 'k',
    REVIEW_LINK: 'https://g.page/r/test/review', TEMPLATE_LANG: 'he', BURST_WAIT_MS: '0', SUMMARY_SETTLE_MIN: '0', ECHO_WAIT_MS: '0',
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
  assert.match(sysText(aiRequests[0]), /המוקדן הדיגיטלי/);

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

  // 4. אחרי ההעברה, חנן עוד לא ענה: הבוט עונה ללקוח, וחנן לא מקבל הודעה על "כמה זמן?"
  const ownerBefore = sent.filter((m) => m.to === OWNER).length;
  aiQueue = [ai({ reply: 'חנן קיבל את כל הפרטים ויחזור אליך בהקדם', summary_for_owner: '' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'עוד כמה זמן?' } }, 'w4'), t0);
  assert.ok(textsTo(CUSTOMER).includes('חנן קיבל את כל הפרטים ויחזור אליך בהקדם'));
  assert.ok(sysText(aiRequests.at(-1)).includes('כבר הועברה'), 'AI knows the lead is already with Hanan');
  assert.equal(sent.filter((m) => m.to === OWNER).length, ownerBefore, 'no extra message to Hanan');
  // פרט חדש וחשוב: חנן מקבל עדכון אחד
  aiQueue = [ai({ reply: 'עדכנתי את חנן', address: 'הרצל 7 חולון', ready_for_handoff: true, summary_for_owner: 'הלקוח עבר לכתובת הרצל 7 במקום 5' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'רגע, אני בעצם בהרצל 7' } }, 'w4b'), t0);
  assert.ok(JSON.stringify(sent.filter((m) => m.to === OWNER)).includes('הרצל 7 במקום 5'), 'one update to Hanan with the new detail');

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

  // 1. סנכרון אנשי הקשר השמורים בטלפון בזמן החיבור (OLD שמור). לקוח ישן שרק מופיע בהיסטוריה לא מסומן
  const PAST = '972551234567';
  await processWebhook(env, { entry: [{ changes: [{ field: 'smb_app_state_sync', value: { state_sync: [{ type: 'contact', action: 'add', contact: { full_name: 'דוד', phone_number: OLD } }] } }] }] }, t0);
  await processWebhook(env, { entry: [{ changes: [{ field: 'history', value: { history: [{ threads: [{ id: PAST, messages: [{ from: PAST, id: 'h1' }] }] }] } }] }] }, t0);
  assert.equal((await env.DB.prepare('SELECT known FROM customers WHERE phone = ?').bind(PAST).first())?.known ?? 0, 0, 'past customers from history are answered by the bot');
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
  // לקוח שנעלם: תזכורת אחרי שעה, ועוד אחת אחרי שעתיים
  const custNudges = () => textsTo(CUSTOMER).filter((t) => t === MESSAGES.customerNudge).length;
  await runEvery15(env, at(10, 45));
  assert.equal(custNudges(), 0, 'not before an hour');
  await runEvery15(env, at(11));
  assert.equal(custNudges(), 1, 'first nudge after an hour');
  await runEvery15(env, at(11, 45));
  assert.equal(custNudges(), 1);
  await runEvery15(env, at(12));
  assert.equal(custNudges(), 2, 'second nudge after two hours');
  await runEvery15(env, at(12, 45));
  assert.equal(custNudges(), 2, 'two nudges only');
  // שעה אחרי התזכורת האחרונה: חנן מקבל את מה שיש
  await runEvery15(env, at(13));
  assert.ok(textsTo(OWNER).some((t) => t.includes('התחיל לכתוב ולא סיים') && t.includes('נעול בחוץ')));

  // חנן כותב "טופל" על לקוח א' → אין תזכורות עליו
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'טופל 054-1234567' } }, 'n3'), at(13, 40));
  assert.ok(!textsTo(OWNER).some((t) => t.includes('עדיין לא חזרת') && t.includes('054-1234567')));

  // לקוח ב' מגיע עד הסוף, חנן לא מגיב: תזכורת לחנן אחרי שעה ואחרי שעתיים
  aiQueue = [ai({ reply: 'מעביר לחנן', issue: 'צילינדר', address: 'הרצל 1', ready_for_handoff: true })];
  await processWebhook(env, inbound(C2, { type: 'text', text: { body: 'צריך צילינדר בהרצל 1' } }, 'n2'), at(14));
  const nudges = () => textsTo(OWNER).filter((t) => t.includes('עדיין לא חזרת')).length;
  await runEvery15(env, at(14, 45));
  assert.equal(nudges(), 0);
  await runEvery15(env, at(15));
  assert.equal(nudges(), 1, 'owner reminded after an hour');
  await runEvery15(env, at(15, 45));
  assert.equal(nudges(), 1);
  await runEvery15(env, at(16));
  assert.equal(nudges(), 2, 'and again after two hours');
  assert.ok(textsTo(C2).includes(MESSAGES.customerReassure), 'customer reassured on second nudge');
  await runEvery15(env, at(17));
  assert.equal(nudges(), 2, 'max two');
  assert.ok(!textsTo(OWNER).some((t) => t.includes('עדיין לא חזרת') && t.includes('054-1234567')), 'no nudges after טופל');


  // עבודה שעבר זמנה ולא סומנה
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0547777777 13/10/2026 16:30' } }, 'n4'), at(16, 5));
  await runEvery15(env, at(19, 15));
  await runEvery15(env, at(19, 30));
  await runEvery15(env, at(19, 45));
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
  assert.ok(textsTo(CUSTOMER).some((t) => t.startsWith('נקבע לך תור עם חנן')), 'customer got appointment confirmation');
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-15T01:15:00Z')); // 04:15
  assert.ok(!sent.some((m) => m.to === CUSTOMER && (m.template?.name === 'appt_today_v1' || (m.text?.body || '').includes('06:30'))), 'no reminder at 04:15');

  // עבודה לאותו יום: בלי "יום לפני" (סביבה נפרדת, כדי שלא נחזור אחורה בזמן)
  sent.length = 0;
  const env2 = makeEnv();
  aiQueue = [ai({ reply: 'היי, מה קרה?' })];
  await processWebhook(env2, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'r0b'), t0);
  await processWebhook(env2, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 14/10/2026 13:00' } }, 'r2'), t0);
  await runEvery15(env2, new Date('2026-10-14T05:15:00Z'));
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

test('receipts off: no Yesh polling, PDFs are plain files, no receipt in help', async () => {
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
  // מה שנכתב לחנן תורגם לעברית, והכתובת נשארה כמו שהיא
  const conv = env.DB.raw.prepare('SELECT issue, address FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').get(CUSTOMER);
  assert.equal(conv.issue, 'בעברית: locked out');
  assert.equal(conv.address, '5 Herzl St Holon');
  assert.equal(translateRequests.length, 1);
  const { needsHebrew } = await import('../src/ai.js');
  assert.ok(needsHebrew('Car lockout, Mazda 3') && needsHebrew('Заперт снаружи') && !needsHebrew('ננעל ברכב Mazda 3') && !needsHebrew('') && !needsHebrew('5'));
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

test('OWNER_QUIET: ordinary chat from the owner number gets no reply; commands still work', async () => {
  sent.length = 0;
  const env = { ...makeEnv(), OWNER_QUIET: '1' };
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'מה קורה אחי, מתי נפגשים?' } }, 'q1'), new Date());
  assert.equal(sent.length, 0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'עזרה' } }, 'q2'), new Date());
  assert.ok(textsTo(OWNER).length >= 1);
});

test('UltraMsg media: photo seen by the AI and forwarded to Hanan as a link, video forwarded, voice transcribed', async () => {
  sent.length = 0; aiRequests = [];
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', WA_VERIFY_TOKEN: 'secret' };
  const waits = [];
  const post = async (data) => {
    await worker.fetch(new Request('https://bot.example/webhook?key=secret', { method: 'POST', body: JSON.stringify({ event_type: 'message_received', data: { from: '972546666666@c.us', fromMe: false, time: 1, ...data } }) }), env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits.splice(0));
  };
  aiQueue = [ai({ reply: 'רואה צילינדר רגיל. מה הכתובת?', issue: 'צילינדר תקוע' })];
  await post({ id: 'm1', type: 'image', body: 'זה המנעול', media: 'https://ultra-media.example/lock.jpg' });
  const last = aiRequests.at(-1).messages.at(-1);
  assert.equal(last.content[0].type, 'image', 'the AI receives the photo');
  aiQueue = [ai({ reply: 'קיבלתי, העברתי לחנן', issue: 'צילינדר תקוע', address: 'הרצל 5', ready_for_handoff: true })];
  await post({ id: 'm2', type: 'chat', body: 'הרצל 5 נתניה' });
  assert.ok(sent.some((m) => m.to === OWNER && m.type === 'image' && m.ultra.image === 'https://ultra-media.example/lock.jpg'), 'photo forwarded to Hanan as a link');
  aiQueue = [ai({ reply: 'קיבלתי את הסרטון והעברתי', ready_for_handoff: true, summary_for_owner: 'שלח סרטון של הדלת' })];
  await post({ id: 'm3', type: 'video', body: '', media: 'https://ultra-media.example/door.mp4' });
  assert.ok(sent.some((m) => m.to === OWNER && m.type === 'video' && m.ultra.video === 'https://ultra-media.example/door.mp4'), 'video forwarded to Hanan');
  sent.length = 0;
  aiQueue = [ai({ reply: 'הבנתי', issue: 'ננעל בחוץ' })];
  await post({ id: 'm4', from: '972545555555@c.us', type: 'ptt', body: '', media: 'https://ultra-media.example/v.ogg' });
  assert.match(JSON.stringify(aiRequests.at(-1).messages), /הודעה קולית\] ננעלתי בחוץ ברחוב הרצל/, 'voice transcribed into the conversation');
});

test('table "טופל" button: marks the job done like the WhatsApp command, review follows, protected by the key', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), WA_VERIFY_TOKEN: 'secret', WORKER_URL: 'https://bot.example' };
  const t0 = new Date();
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'ננעל בחוץ', address: 'הרצל 5 חולון', customer_name: 'דני', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ הרצל 5 חולון' } }, 'bt1'), t0);
  const { tableKey } = await import('../src/table.js');
  const k = await tableKey(env);
  const post = (key, act = 'done') => worker.fetch(new Request('https://bot.example/table/action', { method: 'POST', body: new URLSearchParams({ k: key, phone: CUSTOMER, act }) }), env, { waitUntil() {} });
  assert.equal((await post('wrong')).status, 403);
  const html = await (await worker.fetch(new Request(`https://bot.example/table?k=${k}`), env, { waitUntil() {} })).text();
  assert.ok(html.includes('✓ טופל'), 'button shown for an open lead');
  const res = await post(k);
  assert.equal(res.status, 303);
  assert.equal(env.DB.raw.prepare("SELECT status FROM jobs WHERE phone = ?").get(CUSTOMER).status, 'done');
  assert.ok(JSON.stringify(sent.filter((m) => m.to === OWNER)).includes('סומן כגמור'), 'owner gets the same confirmation as on WhatsApp');
  const after = await (await worker.fetch(new Request(`https://bot.example/table?k=${k}`), env, { waitUntil() {} })).text();
  assert.ok(after.includes('עבודה הסתיימה') && !after.includes('name="act" value="done"'), 'no button once done');
});

test('after handoff (UltraMsg): Hanan already answered → bot silent, nothing forwarded; before he answers a photo comes as one update', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', WA_VERIFY_TOKEN: 'secret' };
  const waits = [];
  const post = async (payload) => { await worker.fetch(new Request('https://bot.example/webhook?key=secret', { method: 'POST', body: JSON.stringify(payload) }), env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits.splice(0)); };
  const C = '972543333333';
  const recv = (data) => ({ event_type: 'message_received', data: { from: `${C}@c.us`, fromMe: false, time: 1, ...data } });
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'ננעל', address: 'הרצל 1', ready_for_handoff: true })];
  await post(recv({ id: 'h1', type: 'chat', body: 'ננעלתי בחוץ הרצל 1' }));
  // לפני שחנן ענה: תמונה של התקלה → סיכום מעודכן אחד לחנן + התמונה
  sent.length = 0;
  aiQueue = [ai({ reply: 'תודה, העברתי', ready_for_handoff: true, summary_for_owner: 'הלקוח שלח תמונה של הדלת' })];
  await post(recv({ id: 'h2', type: 'image', body: '', media: 'https://ultra-media.example/x.jpg' }));
  const toOwner = sent.filter((m) => m.to === OWNER);
  assert.equal(toOwner.filter((m) => m.type === 'text').length, 1, 'one update');
  assert.ok(toOwner.some((m) => m.type === 'image'));
  // חנן עונה מהטלפון
  await post({ event_type: 'message_create', data: { id: 'e1', from: '972500000000@c.us', to: `${C}@c.us`, fromMe: true, type: 'chat', body: 'אני בדרך אליך' } });
  sent.length = 0;
  const aiBefore = aiRequests.length;
  await post(recv({ id: 'h3', type: 'chat', body: 'מעולה תודה' }));
  assert.equal(sent.length, 0, 'bot silent, Hanan sees it in his app');
  assert.equal(aiRequests.length, aiBefore);
});

test('review3 (deep review fixes): late echo, quote resolution, photo quote, pause, spam once, Sunday reminders', async () => {
  const { default: worker } = await import('../src/index.js');
  const mk = () => ({ ...makeEnv(), WA_PROVIDER: 'ultramsg', ULTRAMSG_INSTANCE: 'instance1', ULTRAMSG_TOKEN: 'tok', WA_VERIFY_TOKEN: 'secret' });
  const waits = [];
  const post = async (env, payload) => { await worker.fetch(new Request('https://bot.example/webhook?key=secret', { method: 'POST', body: JSON.stringify(payload) }), env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits.splice(0)); };
  const recv = (from, data) => ({ event_type: 'message_received', data: { from: `${from}@c.us`, fromMe: false, time: 1, ...data } });

  // 1. הודעה של הבוט שחוזרת מ-UltraMsg באיחור (אחרי 20 דקות) לא נחשבת כאילו חנן ענה
  sent.length = 0;
  let env = mk();
  aiQueue = [ai({ reply: 'היי, מה קרה?' })];
  await post(env, recv(CUSTOMER, { id: 'x1', type: 'chat', body: 'היי' }));
  env.DB.raw.prepare("UPDATE ultra_sent SET created_at = ?").run(new Date(Date.now() - 20 * 60000).toISOString());
  await post(env, { event_type: 'message_create', data: { id: 'x2', from: '972500000000@c.us', to: `${CUSTOMER}@c.us`, fromMe: true, type: 'chat', body: 'היי, מה קרה?' } });
  const c1 = env.DB.raw.prepare('SELECT state, owner_replied_at FROM conversations').get();
  assert.equal(c1.state, 'bot'); assert.equal(c1.owner_replied_at, null);
  assert.equal(env.DB.raw.prepare('SELECT known FROM customers WHERE phone = ?').get(CUSTOMER).known, 0);

  // 2. ציטוט: שם עם מספר טלפון לא מבלבל; תשובה על הודעת העזרה לא נשלחת למספר הדוגמה
  sent.length = 0;
  env = mk();
  const C = '972549999999';
  aiQueue = [ai({ reply: 'העברתי', customer_name: 'יוסי 050-7654321', issue: 'ננעל', address: 'הרצל 1', ready_for_handoff: true })];
  await post(env, recv(C, { id: 'q1', type: 'chat', body: 'ננעלתי הרצל 1' }));
  const summary = sent.find((m) => m.to === OWNER && m.type === 'text').text.body;
  // 3. תשובה (ציטוט) על תמונה שהועברה לחנן מגיעה ללקוח הנכון
  sent.length = 0;
  aiQueue = [ai({ reply: 'תודה', ready_for_handoff: true, summary_for_owner: 'שלח תמונה' })];
  await post(env, recv(C, { id: 'q5', type: 'image', body: '', media: 'https://ultra-media.example/p.jpg' }));
  const photo = sent.find((m) => m.to === OWNER && m.type === 'image');
  assert.ok(photo && photo.ultra.caption.includes('054-9999999'));
  sent.length = 0;
  await post(env, recv(OWNER, { id: 'q6', type: 'chat', body: 'רואה, זה צילינדר רגיל', quotedMsg: { id: 'ph', body: photo.ultra.caption } }));
  assert.ok(sent.some((m) => m.to === C && m.text?.body === 'רואה, זה צילינדר רגיל'));

  sent.length = 0;
  await post(env, recv(OWNER, { id: 'q2', type: 'chat', body: 'אני מגיע תוך רבע שעה', quotedMsg: { id: 'zz', body: summary } }));
  assert.ok(sent.some((m) => m.to === C), 'goes to the customer');
  assert.ok(!sent.some((m) => m.to === '972507654321'), 'not to the number inside the name');
  await post(env, recv(OWNER, { id: 'q3', type: 'chat', body: 'עזרה' }));
  const help = sent.filter((m) => m.to === OWNER).at(-1).text.body;
  sent.length = 0;
  await post(env, recv(OWNER, { id: 'q4', type: 'chat', body: 'סיום', quotedMsg: { id: 'h', body: help } }));
  assert.ok(!sent.some((m) => m.to === '972541234567'), 'example number in help is never used');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE phone = '972541234567'").get().n, 0);

  // 4. "עצור בוט": אין תזכורות ללקוחות ולא לחנן
  sent.length = 0;
  env = mk();
  aiQueue = [ai({ reply: 'מה הכתובת?' })];
  await post(env, recv(CUSTOMER, { id: 'p1', type: 'chat', body: 'ננעלתי' }));
  await post(env, recv(OWNER, { id: 'p2', type: 'chat', body: 'עצור בוט' }));
  sent.length = 0;
  await runEvery15(env, new Date(Date.now() + 45 * 60000));
  await runEvery15(env, new Date(Date.now() + 5 * 3600000));
  assert.equal(sent.filter((m) => m.to === CUSTOMER).length, 0, 'no customer nudge while paused');

  // 5. ספאם חוזר: הודעה אחת לחנן, לא אחת על כל הודעה
  sent.length = 0;
  env = mk();
  const S = '972547777777';
  const day = new Date('2026-10-14T08:00:00Z');
  for (let i = 0; i < 3; i++) {
    aiQueue = [ai({ category: 'spam' })];
    await processWebhook(env, inbound(S, { type: 'text', text: { body: `מבצע מטורף ${i}` } }, `sp${i}`), new Date(day.getTime() + i * 120000));
  }
  assert.equal(sent.filter((m) => m.to === OWNER && (m.text?.body || '').includes('סיננתי')).length, 1);

  // 6. עבודה ביום ראשון 09:30: תזכורת "יום לפני" יוצאת ביום שישי, ותזכורת הבוקר כבר מ-07:00
  sent.length = 0;
  env = mk();
  const thu = new Date('2026-10-15T08:00:00Z'); // חמישי 11:00
  aiQueue = [ai({ reply: 'היי' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'sun0'), thu);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 18/10/2026 09:30' } }, 'sun1'), thu);
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-16T15:00:00Z')); // שישי 18:00
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('תזכורת')), 'day-before sent on Friday evening');
  sent.length = 0;
  await runEvery15(env, new Date('2026-10-18T04:15:00Z')); // ראשון 07:15
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('09:30')), 'morning reminder from 07:00');
});

test('after handoff: a new request is collected quietly, then ONE updated summary (not an update per message)', async () => {
  sent.length = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'פריצת רכב טיגואן', address: 'חלום יוסף 326 תקוע', customer_name: 'חנה', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרכב נעול' } }, 'n1'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סטטוס' } }, 'n0'), t0); // חנן כתב לבוט: נפתח לו חלון, אז ההודעות אליו מלאות
  const base = sent.filter((m) => m.to === OWNER).length;
  aiQueue = [ai({ reply: 'הבנתי, זה במקום הרכב או בנוסף?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'עכשיו גם ננעלתי מחוץ לבית' } }, 'n2'), t0);
  aiQueue = [ai({ reply: 'אפשר תמונה של הדלת?', issue: 'נעול מחוץ לבית' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'במקום' } }, 'n3'), t0);
  assert.equal(sent.filter((m) => m.to === OWNER).length, base, 'nothing to Hanan while the bot is still collecting');
  aiQueue = [ai({ reply: 'תודה, העברתי לחנן', issue: 'נעול מחוץ לבית (פריצת דלת), במקום הרכב', ready_for_handoff: true, summary_for_owner: 'עכשיו צריך פריצת דלת לבית במקום הרכב. דלת כהה, צירים מימין' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'image', image: { id: 'door1', caption: '' } }, 'n4'), t0);
  const updates = sent.filter((m) => m.to === OWNER).slice(base);
  const texts = updates.filter((m) => m.type !== 'image');
  assert.equal(texts.length, 1, 'exactly one updated summary');
  assert.match(JSON.stringify(texts[0]), /עדכון לפנייה/);
  assert.match(JSON.stringify(texts[0]), /פריצת דלת/);
});

test('after handoff: customer stops in the middle of new details → Hanan gets what was collected after 30 min, once; "תודה" never reaches him', async () => {
  sent.length = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'רכב', address: 'הרצל 1', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרכב נעול הרצל 1' } }, 'u1'), t0);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סטטוס' } }, 'u0'), t0);
  aiQueue = [ai({ reply: 'בשמחה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'תודה' } }, 'u2'), t0);
  const base = sent.filter((m) => m.to === OWNER).length;
  await runEvery15(env, new Date(t0.getTime() + 45 * 60000));
  assert.equal(sent.filter((m) => m.to === OWNER && /התחיל\/ה להוסיף/.test(m.text?.body || '')).length, 0, 'thanks never reaches Hanan');
  const t1 = new Date(t0.getTime() + 60 * 60000);
  aiQueue = [ai({ reply: 'גם הבית? מה הכתובת של הבית?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'גם ננעלתי מחוץ לבית' } }, 'u3'), t1);
  await runEvery15(env, new Date(t1.getTime() + 35 * 60000));
  await runEvery15(env, new Date(t1.getTime() + 50 * 60000));
  const partial = sent.filter((m) => m.to === OWNER && /התחיל\/ה להוסיף/.test(m.text?.body || ''));
  assert.equal(partial.length, 1, 'one partial update');
  assert.match(partial[0].text.body, /גם ננעלתי מחוץ לבית/);
});

test('one report at the end of the conversation: Hanan gets nothing while the customer is still writing, then ONE summary with everything', async () => {
  sent.length = 0;
  const { flushDueSummaries } = await import('../src/handler.js');
  const env = { ...makeEnv(), SUMMARY_SETTLE_MIN: '3' };
  const t0 = new Date('2026-10-14T08:00:00Z');
  const at = (min) => new Date(t0.getTime() + min * 60000);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סטטוס' } }, 's0'), t0); // חלון פתוח לחנן
  const base = () => sent.filter((m) => m.to === OWNER).length;
  const b0 = base();
  aiQueue = [ai({ reply: 'העברתי לחנן, אפשר תמונה של המנעול?', issue: 'ננעל מחוץ לבית', address: 'הרצל 5 חולון', customer_name: 'יוסי', ready_for_handoff: true, summary_for_owner: 'ננעל בחוץ' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ הרצל 5 חולון' } }, 's1'), at(0));
  aiQueue = [ai({ reply: 'תודה, קיבלתי', ready_for_handoff: true, summary_for_owner: 'ננעל בחוץ. צילינדר רגיל, הדלת של רב-בריח' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'image', image: { id: 'lock1', caption: '' } }, 's2'), at(1));
  aiQueue = [ai({ reply: 'בשמחה' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'תודה רבה' } }, 's3'), at(2));
  await flushDueSummaries(env, at(4)); // רק דקתיים מההודעה האחרונה
  await runEvery15(env, at(4));
  assert.equal(base(), b0, 'nothing reaches Hanan while the conversation is still going');
  await flushDueSummaries(env, at(5.5));
  const out = sent.filter((m) => m.to === OWNER).slice(b0);
  const texts = out.filter((m) => m.type === 'text');
  assert.equal(texts.length, 1, 'exactly one report');
  assert.match(texts[0].text.body, /פנייה חדשה/);
  assert.match(texts[0].text.body, /רב-בריח/);
  assert.match(texts[0].text.body, /הרצל 5 חולון/);
  assert.match(texts[0].text.body, /יוסי/);
  assert.equal(out.filter((m) => m.type === 'image').length, 1, 'the photo comes with it');
  await flushDueSummaries(env, at(10));
  assert.equal(sent.filter((m) => m.to === OWNER).length, b0 + out.length, 'sent once');
  // התזכורת לחנן נספרת מרגע שהדוח הגיע אליו
  const conv = env.DB.raw.prepare('SELECT * FROM conversations').get();
  assert.equal(conv.handed_off_at, at(5.5).toISOString());

  // לקוח שכותב בלי הפסקה: חנן לא מחכה יותר מ-15 דקות
  const C2 = '972547777777';
  aiQueue = [ai({ reply: 'העברתי', issue: 'רכב', address: 'בן יהודה 1', ready_for_handoff: true })];
  await processWebhook(env, inbound(C2, { type: 'text', text: { body: 'הרכב נעול בן יהודה 1' } }, 'c1'), at(20));
  for (let i = 1; i <= 7; i++) {
    aiQueue = [ai({ reply: 'אוקיי' })];
    await processWebhook(env, inbound(C2, { type: 'text', text: { body: `עוד פרט ${i}` } }, `c1-${i}`), at(20 + i * 2));
    await flushDueSummaries(env, at(20 + i * 2));
  }
  assert.equal(sent.filter((m) => m.to === OWNER && /בן יהודה/.test(m.text?.body || '')).length, 0, 'still writing at minute 14: not yet');
  await flushDueSummaries(env, at(35));
  assert.equal(sent.filter((m) => m.to === OWNER && /בן יהודה/.test(m.text?.body || '')).length, 1, 'cap: sent after 15 minutes even though he kept writing');

  // דחוף: מיד, בלי לחכות
  const C3 = '972546666666';
  aiQueue = [ai({ reply: 'חנן מקבל את זה עכשיו', issue: 'ילד נעול ברכב', address: 'הרצל 9', urgent: true, urgent_reason: 'ילד ברכב', ready_for_handoff: true })];
  await processWebhook(env, inbound(C3, { type: 'text', text: { body: 'הילד נעול ברכב!!' } }, 'u1'), at(60));
  assert.ok(sent.some((m) => m.to === OWNER && /פנייה דחופה/.test(m.text?.body || '') && /ילד נעול ברכב/.test(m.text.body)), 'urgent goes out at once');

  // לקוח שוויתר לפני שהדוח יצא: חנן לא מקבל כלום
  const C4 = '972545555555';
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'דלת', address: 'סוקולוב 3', ready_for_handoff: true })];
  await processWebhook(env, inbound(C4, { type: 'text', text: { body: 'ננעלתי סוקולוב 3' } }, 'd1'), at(90));
  aiQueue = [ai({ reply: 'אין בעיה, בהצלחה', customer_done: true })];
  await processWebhook(env, inbound(C4, { type: 'text', text: { body: 'הסתדרתי, תודה' } }, 'd2'), at(91));
  await flushDueSummaries(env, at(100));
  assert.equal(sent.filter((m) => m.to === OWNER && /סוקולוב/.test(m.text?.body || '')).length, 0, 'customer gave up before the report: nothing to Hanan');
  assert.equal(env.DB.raw.prepare('SELECT state FROM conversations WHERE phone = ?').get(C4).state, 'closed');
});

test('owner by email: one summary email with photos and a buttons link; buttons run commands without extra emails; Gmail dialogue', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const { flushDueSummaries } = await import('../src/handler.js');
  const { buildMime } = await import('../src/email.js');
  const mails = [];
  const env = { ...makeEnv(), OWNER_PHONE: undefined, OWNER_EMAIL: 'hanan@example.com', WORKER_URL: 'https://bot.example', WA_VERIFY_TOKEN: 'secret', SUMMARY_SETTLE_MIN: '3', __mail: async (m) => { mails.push(m); } };
  const ctx = { waitUntil: () => {} };
  const call = (path, init) => worker.fetch(new Request(`https://bot.example${path}`, init), env, ctx);
  const t0 = new Date('2026-10-14T08:00:00Z');
  const ownerEnv = { ...env, OWNER_PHONE: 'email' };
  aiQueue = [ai({ reply: 'תודה! מה הכתובת?', issue: 'ננעל בחוץ' })];
  await processWebhook(ownerEnv, inbound(CUSTOMER, { type: 'image', image: { id: 'door9', caption: 'ננעלתי' } }, 'e1'), t0);
  aiQueue = [ai({ reply: 'העברתי לחנן', issue: 'ננעל בחוץ', address: 'הרצל 5 חולון', customer_name: 'רון', ready_for_handoff: true, summary_for_owner: 'דלת פלדלת' })];
  await processWebhook(ownerEnv, inbound(CUSTOMER, { type: 'text', text: { body: 'הרצל 5 חולון' } }, 'e2'), new Date(t0.getTime() + 60000));
  assert.equal(mails.length, 0, 'nothing until the conversation settles');
  await flushDueSummaries(ownerEnv, new Date(t0.getTime() + 5 * 60000));
  assert.equal(mails.length, 1, 'one email');
  assert.equal(sent.filter((m) => m.to === OWNER).length, 0, 'nothing on WhatsApp');
  const m = mails[0];
  assert.equal(m.to, 'hanan@example.com');
  assert.match(m.subject, /פנייה חדשה/);
  assert.match(m.text, /הרצל 5 חולון/);
  assert.match(m.html, /\/media\?id=door9&amp;k=|\/media\?id=door9&k=/);
  const act = m.html.match(/https:\/\/bot\.example\/act\?p=(\d+)&k=([0-9a-f]+)/);
  assert.ok(act, 'buttons link');

  // התמונה נפתחת רק עם המפתח
  assert.equal((await call('/media?id=door9&k=bad')).status, 403);
  const img = m.html.match(/\/media\?id=door9&k=([0-9a-f]+)/);
  assert.equal((await call(`/media?id=door9&k=${img[1]}`)).status, 200);

  // דף הכפתורים: פתיחה לא מבצעת כלום, לחיצה כן
  assert.equal((await call(`/act?p=${act[1]}&k=nope`)).status, 403);
  const before = sent.length;
  const page = await (await call(`/act?p=${act[1]}&k=${act[2]}`)).text();
  assert.match(page, /רון/);
  assert.equal(sent.length, before, 'opening the page sends nothing');
  const form = new FormData(); form.set('act', 'eta'); form.set('min', '30');
  const res = await (await call(`/act?p=${act[1]}&k=${act[2]}`, { method: 'POST', body: form })).text();
  assert.ok(textsTo(CUSTOMER).some((t) => t.includes('30 דקות') || t === '[template:on_the_way_v1]'), 'customer told he is on the way');
  assert.match(res, /✓|בדרך/);
  assert.equal(mails.length, 1, 'no confirmation email');
  const form2 = new FormData(); form2.set('act', 'appt'); form2.set('date', new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)); form2.set('time', '14:30'); form2.set('address', 'הרצל 5 חולון');
  await call(`/act?p=${act[1]}&k=${act[2]}`, { method: 'POST', body: form2 });
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='open' AND scheduled_at IS NOT NULL").get().n, 1, 'appointment set');
  const form3 = new FormData(); form3.set('act', 'done');
  await call(`/act?p=${act[1]}&k=${act[2]}`, { method: 'POST', body: form3 });
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE status='done'").get().n, 1, 'job done → review follows');

  // מייל שנכשל: נשמר ונשלח שוב ב-cron
  const failing = { ...ownerEnv, __mail: async () => { throw new Error('down'); } };
  const { sendToOwner } = await import('../src/handler.js');
  await sendToOwner(failing, '⏰ בדיקה', t0, CUSTOMER);
  await runEvery15(ownerEnv, new Date(t0.getTime() + 15 * 60000));
  assert.ok(mails.some((x) => x.subject === '⏰ בדיקה'), 'retried');

  // המייל עצמו: נושא בעברית מקודד, גוף ב-base64
  const mime = buildMime({ from: 'bot@gmail.com', fromName: 'הבוט', to: 'h@x.com', subject: 'פנייה חדשה', text: 'שלום', html: '<b>שלום</b>' });
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /multipart\/alternative/);

  // שיחה מול שרת Gmail מדומה
  const { sendOwnerEmail } = await import('../src/email.js');
  const log = [];
  const fakeConnect = () => {
    const replies = ['220 smtp.gmail.com ready\r\n'];
    let pull;
    const readable = new ReadableStream({ start(c) { pull = c; c.enqueue(new TextEncoder().encode(replies.shift())); } });
    const writable = new WritableStream({ write(chunk) {
      const line = new TextDecoder().decode(chunk); log.push(line.split('\r\n')[0]);
      const r = line.startsWith('EHLO') ? '250-smtp.gmail.com\r\n250 AUTH PLAIN\r\n' : line.startsWith('AUTH') ? '235 ok\r\n' : line.startsWith('MAIL') || line.startsWith('RCPT') ? '250 ok\r\n' : line.startsWith('DATA') ? '354 go\r\n' : line.startsWith('QUIT') ? '221 bye\r\n' : '250 queued\r\n';
      pull.enqueue(new TextEncoder().encode(r));
    } });
    return { readable, writable, close: async () => {} };
  };
  const smtpEnv = { ...ownerEnv, __mail: undefined, __connect: fakeConnect, GMAIL_USER: 'onerishon@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };
  const r = await sendOwnerEmail(smtpEnv, '🔔 פנייה חדשה\nשם: רון', { about: CUSTOMER, now: t0 });
  assert.ok(r.ok, 'sent through SMTP');
  assert.deepEqual(log.slice(0, 5).map((l) => l.split(' ')[0].split(':')[0]), ['EHLO', 'AUTH', 'MAIL FROM', 'RCPT TO', 'DATA'].map((x) => x.split(' ')[0]));
  assert.ok(log.some((l) => l.startsWith('RCPT TO:<hanan@example.com>')));
});

test('questions: the bot answers what it knows; an unknown question gets a warm reply and reaches Hanan as "waiting for your answer"; a returning customer is answered again', async () => {
  sent.length = 0; aiRequests = [];
  const { flushDueSummaries } = await import('../src/handler.js');
  const env = { ...makeEnv(), SUMMARY_SETTLE_MIN: '3' };
  const t0 = new Date('2026-10-14T08:00:00Z');
  const at = (min) => new Date(t0.getTime() + min * 60000);
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סטטוס' } }, 'q0'), t0);
  const b0 = sent.filter((m) => m.to === OWNER).length;
  // שאלה שהבוט יודע: עונה וממשיך, שום דבר לחנן
  aiQueue = [ai({ reply: 'כן, אנחנו פותחים גם רכבים. מה הדגם?', issue: 'פריצת רכב' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'אתם פותחים רכבים?' } }, 'q1'), at(0));
  assert.match(sysText(aiRequests[0]), /ענה על כל שאלה של הלקוח/);
  await flushDueSummaries(env, at(10));
  assert.equal(sent.filter((m) => m.to === OWNER).length, b0, 'nothing to Hanan for a question the bot answered');
  // שאלה שהבוט לא יודע: תשובה חמה ללקוח, והשאלה מגיעה לחנן גם בלי כתובת
  aiQueue = [ai({ reply: 'שאלה מצוינת, אני בודק את זה עם חנן ותקבל תשובה בהקדם. מה הכתובת?', question_for_owner: 'יש אחריות על החלפת מנעול רכב?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'יש אחריות?' } }, 'q2'), at(11));
  assert.ok(textsTo(CUSTOMER).at(-1).includes('אני בודק את זה עם חנן'));
  // הלקוח ממשיך: הכתובת נכנסת לאותו סיכום
  aiQueue = [ai({ reply: 'תודה, קיבלתי', address: 'הרצל 5 חולון' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'הרצל 5 חולון' } }, 'q3'), at(12));
  assert.equal(sent.filter((m) => m.to === OWNER).length, b0, 'still talking: no message yet');
  await flushDueSummaries(env, at(16));
  const out = sent.filter((m) => m.to === OWNER).slice(b0).filter((m) => m.type === 'text');
  assert.equal(out.length, 1, 'one message');
  assert.match(out[0].text.body, /❓ הלקוח מחכה לתשובה ממך: יש אחריות על החלפת מנעול רכב\?/);
  assert.match(out[0].text.body, /הרצל 5 חולון/);
  // אחרי הסיכום: עוד שאלה שהבוט לא יודע → "לקוח מחכה לתשובה ממך"
  aiQueue = [ai({ reply: 'אבדוק עם חנן ואחזור אליך', question_for_owner: 'אפשר לשלם בביט?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'אפשר לשלם בביט?' } }, 'q4'), at(20));
  await flushDueSummaries(env, at(24));
  const upd = sent.filter((m) => m.to === OWNER && /^❓ שאלה חדשה מהלקוח/.test(m.text?.body || ''));
  assert.equal(upd.length, 1);
  assert.match(upd[0].text.body, /❓ הלקוח מחכה לתשובה ממך: אפשר לשלם בביט\?/);
  assert.match(upd[0].text.body, /בביט/);
  assert.doesNotMatch(upd[0].text.body, /אחריות/, 'old question not repeated');
  // חנן ענה ללקוח בעצמו, והשיחה שקטה יום: "אשמח לעוד טיפול" → הבוט עונה שוב
  await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'סיום 0541234567' } }, 'q5'), at(30));
  const conv = env.DB.raw.prepare('SELECT id FROM conversations ORDER BY id DESC LIMIT 1').get();
  env.DB.raw.prepare("UPDATE conversations SET state = 'handoff', owner_replied_at = ? WHERE id = ?").run(at(30).toISOString(), conv.id);
  aiQueue = [ai({ reply: 'היי, כיף לשמוע ממך שוב! במה אפשר לעזור הפעם?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי מה נשמע, אשמח לעוד טיפול' } }, 'q6'), at(30 + 24 * 60));
  assert.equal(textsTo(CUSTOMER).at(-1), 'היי, כיף לשמוע ממך שוב! במה אפשר לעזור הפעם?');
  assert.match(sysText(aiRequests.at(-1)), /לקוח חוזר/);
});

test('Hanan hours: Sun-Thu 08:00-17:00, no Fri/Sat/holidays; the bot tells the customer when Hanan is back; no owner nagging on days off', async () => {
  const { BUSINESS } = await import('../src/config.js');
  const { isOpen, nextOpenLabel } = util;
  const { ownerHours } = await import('../src/hours.js');
  const { buildSystemPrompt } = await import('../src/prompt.js');
  const il = (s) => new Date(`${s}+03:00`); // אוקטובר: שעון קיץ בישראל
  const h = BUSINESS.hours, hol = BUSINESS.holidays;
  assert.equal(isOpen(h, il('2026-10-15T10:00:00'), hol), true, 'Thursday 10:00 open');
  assert.equal(isOpen(h, il('2026-10-15T17:30:00'), hol), false, 'Thursday 17:30 closed');
  assert.equal(isOpen(h, il('2026-10-16T10:00:00'), hol), false, 'Friday closed');
  assert.equal(nextOpenLabel(h, il('2026-10-14T19:00:00'), hol), 'מחר ב-08:00');
  assert.equal(nextOpenLabel(h, il('2026-10-15T07:00:00'), hol), 'היום ב-08:00');
  assert.equal(nextOpenLabel(h, il('2026-10-15T18:00:00'), hol), 'ביום ראשון ב-08:00', 'Thursday evening → Sunday');
  assert.equal(nextOpenLabel(h, il('2026-10-17T12:00:00'), hol), 'מחר ב-08:00', 'Saturday → Sunday');
  // ערב ראש השנה 2027 (שישי 1/10) ← ראש השנה שבת-ראשון ← שני 4/10
  assert.equal(nextOpenLabel(h, il('2027-09-30T18:00:00'), hol), 'ביום שני ב-08:00', 'skips Rosh Hashana');
  assert.equal(isOpen(h, il('2027-10-11T10:00:00'), hol), false, 'Yom Kippur (Monday) closed');
  assert.equal(ownerHours(il('2026-10-16T10:00:00')), false, 'no reminders to Hanan on Friday');
  assert.equal(ownerHours(il('2026-10-18T10:00:00')), true, 'Sunday yes');
  const p = buildSystemPrompt({ now: il('2026-10-15T18:00:00') });
  assert.match(p, /חוזר לעבוד ביום ראשון ב-08:00/);
  assert.match(p, /מד"א 101/);
  assert.doesNotMatch(buildSystemPrompt({ now: il('2026-10-15T10:00:00') }), /מחוץ לשעות העבודה/);
});

test('form: answers are saved on the server and sent to Ariel, so nothing is lost; the page loads; reading them needs the secret', async () => {
  sent.length = 0;
  const { default: worker } = await import('../src/index.js');
  const env = { ...makeEnv(), ADMIN_PHONE: '972524666175', WA_VERIFY_TOKEN: 'secret' };
  const ctx = { waitUntil: () => {} };
  const call = (path, init) => worker.fetch(new Request(`https://bot.example${path}`, init), env, ctx);
  const page = await call('/form');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /שליחת התשובות/);
  const answers = 'תשובות לשאלון האפיון של הבוט (חנן המנעולן):\n\n5. אילו סוגי עבודות אתה עושה?\nפריצות, צילינדרים, רכבים';
  const r = await call('/form', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: answers, fields: {} }) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await r.json(), { ok: true, notified: true });
  assert.ok(sent.some((m) => m.to === '972524666175' && /טופס חדש/.test(JSON.stringify(m))), 'Ariel notified');
  assert.equal((await call('/admin/forms?key=nope')).status, 403);
  assert.match(await (await call('/admin/forms?key=secret')).text(), /פריצות, צילינדרים, רכבים/);
  assert.equal((await call('/form', { method: 'POST', body: '{"text":"x"}' })).status, 400, 'empty form rejected');
});


test("Hanan's own settings: Shabbat by sunset with his words, reminders 2h and 1h before, weekly report Friday 10:00, no yearly reminder, French falls back to English", async () => {
  const { buildSystemPrompt } = await import('../src/prompt.js');
  const { msg } = await import('../src/config.js');
  B0.shabbat.enabled = HANAN.shabbat; T0.customerReminderHours = HANAN.rem; T0.weeklyReportAt = HANAN.weekly; T0.yearlyAfterDays = HANAN.yearly;
  try {
    assert.equal(HANAN.shabbat, true);
    assert.deepEqual(HANAN.rem, [2, 1]);
    assert.equal(HANAN.yearly, 0);
    const friNight = new Date('2026-10-16T17:00:00Z'); // שישי 20:00
    assert.match(buildSystemPrompt({ now: friNight }), /העסק סגור עכשיו בשבת/);
    assert.match(buildSystemPrompt({ now: new Date('2027-10-11T08:00:00Z') }), /העסק סגור עכשיו בחג/, 'Yom Kippur');
    assert.match(buildSystemPrompt({ now: new Date('2026-10-14T08:00:00Z') }), /קומה ודירה, וקוד כניסה לבניין/);
    assert.match(msg('fr', 'reminderTwoHours', '14:30'), /Hanan will be with you today at 14:30/);
    // תזכורות: שעתיים לפני ושעה לפני, בלי "יום לפני"
    sent.length = 0;
    const env = makeEnv();
    const t0 = new Date('2026-10-14T08:00:00Z'); // רביעי 11:00
    aiQueue = [ai({ reply: 'העברתי', issue: 'צילינדר', address: 'הרצל 5', ready_for_handoff: true })];
    await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צילינדר הרצל 5' } }, 'hz1'), t0);
    await processWebhook(env, inbound(OWNER, { type: 'text', text: { body: 'תור 0541234567 15/10/2026 14:30 הרצל 5' } }, 'hz2'), t0);
    sent.length = 0;
    await runEvery15(env, new Date('2026-10-14T15:00:00Z')); // ערב לפני
    assert.equal(sent.filter((m) => m.to === CUSTOMER).length, 0, 'no day-before reminder');
    await runEvery15(env, new Date('2026-10-15T09:30:00Z')); // 12:30, שעתיים לפני
    await runEvery15(env, new Date('2026-10-15T10:30:00Z')); // 13:30, שעה לפני
    await runEvery15(env, new Date('2026-10-15T11:00:00Z'));
    assert.equal(sent.filter((m) => m.to === CUSTOMER).length, 2, 'two reminders: 2h and 1h');
    // דוח שבועי ביום שישי 10:00, פעם אחת
    sent.length = 0;
    await runEvery15(env, new Date('2026-10-16T07:00:00Z'));
    await runEvery15(env, new Date('2026-10-16T07:15:00Z'));
    assert.equal(sent.filter((m) => m.to === OWNER && /שבוע/.test(JSON.stringify(m))).length, 1, 'weekly report once on Friday 10:00');
  } finally { B0.shabbat.enabled = false; delete T0.customerReminderHours; T0.weeklyReportAt = null; T0.yearlyAfterDays = 365; }
});

test('prompt caching: the fixed instructions are one cached block that is identical for every customer and every hour; time, Shabbat and the customer come after it', async () => {
  const { buildSystemParts, buildSystemPrompt } = await import('../src/prompt.js');
  const il = (s) => new Date(`${s}+03:00`);
  const a = buildSystemParts({ now: il('2026-10-15T10:00:00') });
  const b = buildSystemParts({ now: il('2026-10-16T21:00:00'), returningCustomer: { name: 'דני', jobs_count: 2 }, profileName: 'Dani', knowledge: ['שכפול מפתח 20 ש"ח'], afterHandoff: true });
  assert.equal(a.stable, b.stable, 'the cached part never changes');
  assert.match(b.live, /לקוח חוזר/);
  assert.match(b.live, /Dani/);
  assert.match(b.live, /שכפול מפתח/);
  assert.match(b.live, /כבר הועברה/);
  assert.match(b.live, /זמן נוכחי בישראל/);
  assert.doesNotMatch(a.stable, /זמן נוכחי|לקוח חוזר|כבר הועברה/);
  assert.ok(a.stable.length > 3000, 'long enough to be cached');
  assert.equal(buildSystemPrompt({ now: il('2026-10-15T10:00:00') }), `${a.stable}\n${a.live}`);
  sent.length = 0; aiRequests = [];
  aiQueue = [ai({ reply: 'אהלן' })];
  await processWebhook(makeEnv(), inbound('972500000777', { type: 'text', text: { body: 'היי ננעלתי בחוץ' } }, 'cache1'), il('2026-10-15T10:00:00'));
  const sys = aiRequests.at(-1).system;
  assert.deepEqual(sys[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  assert.equal(sys[1].cache_control, undefined);
});

test('test email: needs the secret, goes to Hanan and to us, with a real buttons link for the test phone', async () => {
  const { default: worker } = await import('../src/index.js');
  const mails = [];
  const env = { ...makeEnv(), WA_VERIFY_TOKEN: 'secret', OWNER_EMAIL: 'owner@example.com', GMAIL_USER: 'bot@example.com', WORKER_URL: 'https://bot.example', TEST_PHONES: '972533776774', __mail: async (m) => { mails.push(m); } };
  const call = (path) => worker.fetch(new Request(`https://bot.example${path}`, { method: 'POST' }), env, { waitUntil: () => {} });
  assert.equal((await call('/admin/test-email?key=wrong')).status, 403);
  const ok = await (await call('/admin/test-email?key=secret')).text();
  assert.match(ok, /^OK/);
  assert.deepEqual(mails.map((m) => m.to), ['owner@example.com', 'bot@example.com']);
  const link = mails[0].html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.match(link, /^https:\/\/bot\.example\/act\?p=972533776774&k=/);
  assert.equal((await worker.fetch(new Request(link), env, { waitUntil: () => {} })).status, 200, 'the button opens the real page');
  const fail = await (await worker.fetch(new Request('https://bot.example/admin/test-email?key=secret', { method: 'POST' }), { ...makeEnv(), WA_VERIFY_TOKEN: 'secret', OWNER_EMAIL: 'owner@example.com' }, { waitUntil: () => {} })).text();
  assert.match(fail, /^FAIL: email not configured/);
});

test('Dualhook: replies go through api.dualhook.com with our key; webhooks need the key in the address and must belong to our account', async () => {
  const { default: worker } = await import('../src/index.js');
  const wa = await import('../src/whatsapp.js');
  const env = { ...makeEnv(), WA_PROVIDER: 'dualhook', DUALHOOK_API_KEY: 'dh_live_x', DUALHOOK_WEBHOOK_KEY: 'hook-secret', WABA_ID: '555', WA_PHONE_NUMBER_ID: '777', WA_VERIFY_TOKEN: 'admin' };
  const ctx = { waitUntil: () => {} };
  const post = (q, body) => worker.fetch(new Request(`https://bot.example/webhook${q}`, { method: 'POST', body: JSON.stringify(body) }), env, ctx);

  // שליחה
  sent.length = 0; dualRequests.length = 0;
  assert.equal((await wa.sendText(env, CUSTOMER, 'שלום')).ok, true);
  assert.equal(dualRequests[0].url, 'https://api.dualhook.com/v25.0/777/messages');
  assert.equal(dualRequests[0].auth, 'Bearer dh_live_x');
  assert.equal(sent[0].text.body, 'שלום');

  // תמונה מלקוח: מורידים דרך Dualhook עם אותו מפתח
  const media = await wa.downloadMedia(env, 'm1');
  assert.deepEqual([...media.bytes], [4, 5, 6]);
  assert.ok(dualRequests.slice(-2).every((r) => r.auth === 'Bearer dh_live_x' && r.url.startsWith('https://api.dualhook.com/v25.0/m1')));

  // אימות החיבור (GET): עובד עם המילה של Dualhook
  const verify = await worker.fetch(new Request('https://bot.example/webhook?hub.mode=subscribe&hub.verify_token=hook-secret&hub.challenge=42'), env, ctx);
  assert.equal(await verify.text(), '42');
  // מילה עם רווח בסוף (הודבקה ככה בגיטהאב), או מילת אימות שגויה אבל המילה בכתובת נכונה: עובר
  const spaced = { ...env, DUALHOOK_WEBHOOK_KEY: 'hook-secret \n' };
  assert.equal(await (await worker.fetch(new Request('https://bot.example/webhook?hub.mode=subscribe&hub.verify_token=hook-secret&hub.challenge=7'), spaced, ctx)).text(), '7');
  assert.equal(await (await worker.fetch(new Request('https://bot.example/webhook?key=hook-secret&hub.mode=subscribe&hub.verify_token=typo&hub.challenge=8'), env, ctx)).text(), '8');
  assert.equal((await worker.fetch(new Request('https://bot.example/webhook?key=nope&hub.mode=subscribe&hub.verify_token=typo&hub.challenge=9'), env, ctx)).status, 403);
  assert.equal(await (await worker.fetch(new Request('https://bot.example/webhook?hub.mode=subscribe&hub.verify_token=Hook-Secret&hub.challenge=10'), env, ctx)).text(), '10', 'capital letters do not matter');
  assert.match(await (await worker.fetch(new Request('https://bot.example/webhook?key=nope&hub.mode=subscribe&hub.verify_token=typo&hub.challenge=9'), env, ctx)).text(), /GitHub word: 11 chars, verify token: 4, address key: 4/);

  // הודעה נכנסת
  const good = { object: 'whatsapp_business_account', entry: [{ id: '555', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '777' }, messages: [] } }] }] };
  assert.equal((await post('', good)).status, 401, 'no key');
  assert.equal((await post('?key=wrong', good)).status, 401, 'wrong key');
  assert.equal((await post('?key=hook-secret', { ...good, entry: [{ ...good.entry[0], id: '999' }] })).status, 403, 'another account');
  const otherPhone = { object: 'whatsapp_business_account', entry: [{ id: '555', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '888' }, messages: [] } }] }] };
  assert.equal((await post('?key=hook-secret', otherPhone)).status, 403, 'another number');
  assert.equal((await post('?key=hook-secret', good)).status, 200);

  // בזמן החיבור (הבוט כבוי ועוד לא עבר ל-Dualhook): אנשי הקשר מהאפליקציה נשמרים, ולאף אחד לא עונים
  const waits = [];
  const offEnv = { ...makeEnv(), WA_PROVIDER: 'ultramsg', BOT_OFF: '1', DUALHOOK_WEBHOOK_KEY: 'hook-secret', WA_VERIFY_TOKEN: 'admin' };
  sent.length = 0;
  const sync = { object: 'whatsapp_business_account', entry: [{ id: '555', changes: [
    { field: 'smb_app_state_sync', value: { state_sync: [{ type: 'contact', action: 'add', contact: { full_name: 'אמא', phone_number: '972501112233' } }] } },
    { field: 'messages', value: { messages: [{ from: '972504445566', id: 'w-off', type: 'text', text: { body: 'היי' } }] } },
  ] }] };
  const r = await worker.fetch(new Request('https://bot.example/webhook?key=hook-secret', { method: 'POST', body: JSON.stringify(sync) }), offEnv, { waitUntil: (p) => waits.push(p) });
  assert.equal(r.status, 200);
  await Promise.all(waits);
  assert.equal((await offEnv.DB.prepare('SELECT known FROM customers WHERE phone = ?').bind('972501112233').first())?.known, 1);
  assert.equal(await offEnv.DB.prepare('SELECT * FROM customers WHERE phone = ?').bind('972504445566').first(), null, 'messages are ignored while off');
  assert.equal(sent.length, 0);
});

test('photo nudge: 5 minutes after handoff without a photo the customer is asked for one, once; not for cars', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0;
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'מעביר לחנן', issue: 'צילינדר תקוע', address: 'הרצל 5', ready_for_handoff: true })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צילינדר תקוע, הרצל 5' } }, 'ph1'), t0);
  await runEvery15(env, new Date(t0.getTime() + 2 * 60000));
  assert.ok(!textsTo(CUSTOMER).some((t) => t.includes('תמונה')), 'not before 5 minutes');
  await runEvery15(env, new Date(t0.getTime() + 6 * 60000));
  assert.equal(textsTo(CUSTOMER).filter((t) => t.includes('תמונה או סרטון')).length, 1);
  await runEvery15(env, new Date(t0.getTime() + 20 * 60000));
  assert.equal(textsTo(CUSTOMER).filter((t) => t.includes('תמונה או סרטון')).length, 1, 'only once');

  sent.length = 0;
  const env2 = makeEnv();
  aiQueue = [ai({ reply: 'מעביר לחנן', issue: 'ננעלו המפתחות ברכב', address: 'הרצל 5', ready_for_handoff: true })];
  await processWebhook(env2, inbound(CUSTOMER, { type: 'text', text: { body: 'מפתחות ברכב' } }, 'ph2'), t0);
  await runEvery15(env2, new Date(t0.getTime() + 6 * 60000));
  assert.ok(!textsTo(CUSTOMER).some((t) => t.includes('תמונה או סרטון')), 'no photo nudge for cars');
});

test('owner app auto-reply (greeting / away) a few seconds after the customer wrote does not silence the bot or mark the customer known', async () => {
  sent.length = 0; aiRequests = [];
  const env = makeEnv();
  const t0 = new Date('2026-10-14T08:00:00Z');
  aiQueue = [ai({ reply: 'אהלן, מה נשמע? במה אפשר לעזור?' }), ai({ reply: 'יש מישהו בפנים?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'au1'), t0);
  // הודעת הפתיחה של האפליקציה יוצאת 2 שניות אחרי
  await processWebhook(env, { entry: [{ changes: [{ value: { message_echoes: [{ from: '123', to: CUSTOMER, type: 'text', text: { body: 'שלום, הגעת לחנן המנעולן' } }] } }] }] }, new Date(t0.getTime() + 2000));
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'ננעלתי בחוץ' } }, 'au2'), new Date(t0.getTime() + 60000));
  assert.ok(textsTo(CUSTOMER).includes('יש מישהו בפנים?'), 'bot keeps answering');
  assert.ok(!env.DB.raw.prepare('SELECT known FROM customers WHERE phone = ?').get(CUSTOMER).known);
});

test('Yesh Invoice: tax invoice now, receipt a month later: both reach the customer with the right name, one job, one review', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0; yeshRequests = [];
  const env = { ...makeEnv(), YESH_USERKEY: 'uk', YESH_SECRET: 'sk' };
  const t0 = new Date('2026-10-14T07:00:00Z');
  aiQueue = [ai({ reply: 'מה הכתובת?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'צריך להחליף צילינדר' } }, 'tx0'), t0);
  await runEvery15(env, t0); // נקודת התחלה

  // חשבונית מס (8) בסוף העבודה
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 8, DocumentNumber: 500, CustomerPhone: '0541234567', pdfUrl: 'https://yesh.example/500.pdf' }] }];
  const t1 = new Date(t0.getTime() + 15 * 60000);
  await runEvery15(env, t1);
  const first = sent.filter((m) => m.to === CUSTOMER && m.type === 'document');
  assert.equal(first.length, 1);
  assert.equal(first[0].document.caption, 'מצורפת חשבונית מס על העבודה. תודה!');
  assert.equal(first[0].document.filename, 'חשבונית מס.pdf');
  await runEvery15(env, new Date(t1.getTime() + 20 * 60000));
  const reviews = () => sent.filter((m) => m.to === CUSTOMER && ((m.text?.body || '').includes('g.page') || m.template?.name === 'review_request_v1')).length;
  assert.equal(reviews(), 1);

  // קבלה (6) חודש אחרי, כשהלקוח שילם: נשלחת, בלי עוד ביקורת ובלי עבודה נוספת
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 6, DocumentNumber: 77, CustomerPhone: '0541234567', pdfUrl: 'https://yesh.example/r77.pdf' }] }];
  const t2 = new Date(t1.getTime() + 30 * 86400000);
  await runEvery15(env, t2);
  await runEvery15(env, new Date(t2.getTime() + 20 * 60000));
  const docs = sent.filter((m) => m.to === CUSTOMER && (m.type === 'document' || m.template?.name === 'invoice_v1'));
  assert.equal(docs.length, 2, 'receipt sent too');
  assert.equal(reviews(), 1, 'no second review');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'done'").get().n, 1);
  assert.equal(env.DB.raw.prepare('SELECT jobs_count FROM customers WHERE phone = ?').get(CUSTOMER).jobs_count, 1);
});

test('Yesh Invoice: the customer phone and PDF link are found even under other field names', async () => {
  const { findPhone, findPdf } = await import('../src/yesh.js');
  assert.equal(findPhone({ CustomerPhone: '' , CustomerMobile: '053-3776774' }), '972533776774');
  assert.equal(findPhone({ CustomerPhone: '09-8887777', Customer_Cell: '0533776774' }), '972533776774');
  assert.equal(findPhone({ Name: 'x' }), '');
  assert.equal(findPdf({ PdfLink: 'https://yesh.example/a.pdf' }), 'https://yesh.example/a.pdf');
  assert.equal(findPdf({ docURL: 'https://yesh.example/b' }), 'https://yesh.example/b');
  assert.equal(findPdf({ pdfUrl: 'not a link' }), '');
});

test('Yesh Invoice: Hanan gets "sent successfully"; a duplicate copy of the same document without a phone does not trigger "not sent"', async () => {
  sent.length = 0; aiRequests = []; outSeq = 0; yeshRequests = [];
  const mails = [];
  const env = { ...makeEnv(), YESH_USERKEY: 'uk', YESH_SECRET: 'sk', OWNER_PHONE: 'email', OWNER_EMAIL: 'h@example.com', GMAIL_USER: 'b@example.com', GMAIL_APP_PASSWORD: 'x', __mail: async (m) => { mails.push(m); } };
  const t0 = new Date('2026-10-14T07:00:00Z');
  await runEvery15(env, t0);
  yeshQueue = [{ Success: true, totalpage: 1, ReturnValue: [
    { DocumentType: 9, DocumentNumber: 900, CustomerName: 'בדיקה', CustomerPhone: '', pdfUrl: 'https://yesh.example/900.pdf' },
    { DocumentType: 9, DocumentNumber: 901, CustomerName: 'בדיקה', CustomerPhone: '0533776774', pdfUrl: 'https://yesh.example/901.pdf' },
  ] }];
  await runEvery15(env, new Date(t0.getTime() + 15 * 60000));
  assert.equal(sent.filter((m) => m.to === '972533776774' && (m.type === 'document' || m.template)).length, 1);
  const bodies = mails.map((m) => m.text).join('\n');
  assert.match(bodies, /נשלחה בהצלחה/);
  assert.doesNotMatch(bodies, /לא נשלח/);
});

test('Yesh Invoice: a document without a phone that Yesh keeps returning is reported to Hanan only once', async () => {
  sent.length = 0; yeshRequests = [];
  const mails = [];
  const env = { ...makeEnv(), YESH_USERKEY: 'uk', YESH_SECRET: 'sk', OWNER_PHONE: 'email', OWNER_EMAIL: 'h@example.com', GMAIL_USER: 'b@example.com', GMAIL_APP_PASSWORD: 'x', __mail: async (m) => { mails.push(m); } };
  const t0 = new Date('2026-10-14T07:00:00Z');
  await runEvery15(env, t0);
  const noPhone = () => [{ Success: true, totalpage: 1, ReturnValue: [{ DocumentType: 9, DocumentNumber: 950, CustomerName: 'יוסי', CustomerPhone: '', pdfUrl: 'https://yesh.example/950.pdf' }] }];
  for (let i = 1; i <= 4; i++) { yeshQueue = noPhone(); await runEvery15(env, new Date(t0.getTime() + i * 15 * 60000)); }
  assert.equal(mails.filter((m) => /לא נשלח/.test(m.text)).length, 1);
});

test('daily report: needs the secret; counts the last 24 hours and flags customers who got no answer and emails that failed', async () => {
  const { default: worker } = await import('../src/index.js');
  const { dailyReport } = await import('../src/daily.js');
  const env = { ...makeEnv(), WA_VERIFY_TOKEN: 'secret' };
  const res = await worker.fetch(new Request('https://bot.example/admin/daily?key=wrong'), env, { waitUntil: () => {} });
  assert.equal(res.status, 403);
  const now = new Date('2026-10-14T05:00:00Z');
  aiQueue = [ai({ reply: 'אהלן, מה נשמע?' })];
  await processWebhook(env, inbound(CUSTOMER, { type: 'text', text: { body: 'היי' } }, 'dr1'), new Date(now.getTime() - 3600000));
  let r = await dailyReport(env, now);
  assert.match(r, /ALL OK/);
  assert.match(r, /לקוחות שכתבו: 1/);
  env.DB.raw.prepare("INSERT INTO events (type, phone, created_at) VALUES ('owner_email_failed', NULL, ?)").run(new Date(now.getTime() - 600000).toISOString());
  r = await dailyReport(env, now);
  assert.match(r, /PROBLEMS: 1/);
  assert.match(r, /מיילים לחנן שלא יצאו: 1/);
});
