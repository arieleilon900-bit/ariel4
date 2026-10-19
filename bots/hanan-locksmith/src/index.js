// נקודת הכניסה של השרת (Cloudflare Worker).
// GET /webhook  ← אימות של Meta בזמן החיבור
// POST /webhook ← הודעות נכנסות מוואטסאפ
// cron          ← תזכורות, מעקבים ודוח שבועי
import { flushDueSummaries, sameQuestion, sendToOwner, handleFailedStatus, handleInbound, handleOwnerEcho, importKnownContacts } from './handler.js';
import { runEvery15, weeklyReport } from './cron.js';
import { ensureUltraWebhook, runSetup } from './setup.js';
import { is360, isDual, isUltra, verifySignature } from './whatsapp.js';
import { ultraToMeta } from './ultramsg.js';
import { renderTable, tableAction, tableKey } from './table.js';
import { handleOwnerCommand } from './owner.js';
import { runTurn } from './ai.js';
import { setWindowAlwaysOpen } from './util.js';
import { FORM_HTML } from './form-page.js';
import { BUSINESS } from './config.js';
import { actionPage, ownerByEmail, sendTestEmail, serveMedia } from './email.js';

// בעל עסק שמקבל הכל במייל ואין לו מספר וואטסאפ נפרד: "email" במקום מספר, כדי שכל ההודעות אליו יגיעו למייל
const withOwner = (env) => (env.OWNER_EMAIL && !env.OWNER_PHONE ? { ...env, OWNER_PHONE: 'email' } : env);
// לחיצה על כפתור (בטבלה או במייל) כשההתראות במייל: האישור מוצג בדף, לא נשלח עוד מייל
const quietCommand = (e, ...a) => handleOwnerCommand(ownerByEmail(e) ? { ...e, __capture: [] } : e, ...a);

// השוואה בזמן קבוע (שלא יהיה אפשר לנחש את הסוד אות אחרי אות)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env, ctx) {
    env = withOwner(env);
    const url = new URL(request.url);

    // טופס השאלות לבעל העסק: הדף עצמו, וקבלת התשובות (נשמרות במסד הנתונים ונשלחות לאריאל בוואטסאפ)
    if (url.pathname === '/form' && request.method === 'GET') {
      return new Response(FORM_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
    }
    if (url.pathname === '/form' && request.method === 'OPTIONS') return new Response(null, { headers: FORM_CORS });
    if (url.pathname === '/form' && request.method === 'POST') {
      setWindowAlwaysOpen(isUltra(env));
      return receiveForm(env, request);
    }
    if (url.pathname === '/admin/forms' && request.method === 'GET') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, String(env.WA_VERIFY_TOKEN).trim())) return new Response('forbidden', { status: 403 });
      const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'form:%' ORDER BY key DESC LIMIT 20").all()).results;
      return new Response(rows.map((r) => `===== ${r.key.slice(5)} =====\n${r.value}`).join('\n\n') || 'אין טפסים', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // הקישורים במייל לבעל העסק: תמונות של לקוחות, ודף הכפתורים (בדרך / תור / סיימתי)
    if (url.pathname === '/media' && request.method === 'GET') return serveMedia(env, url);
    if (url.pathname === '/act' && (request.method === 'GET' || request.method === 'POST')) {
      setWindowAlwaysOpen(isUltra(env));
      return actionPage(env, request, url, handleOwnerCommand);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      if (isUltra(env)) {
        const w = await ensureUltraWebhook(env, env.WORKER_URL || url.origin).catch((e) => `error: ${e.message}`);
        return new Response(`${healthText(env)}\nUltraMsg: ${w === 'skip' ? 'not configured' : String(w).startsWith('error') ? w : 'connected'}`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return new Response(healthText(env), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // טבלת הלקוחות (הקישור נשלח לחנן כשהוא כותב לבוט "טבלה")
    if (url.pathname === '/table' && request.method === 'GET') {
      const k = await tableKey(env);
      if (!k || !safeEqual(url.searchParams.get('k') || '', k)) return new Response('forbidden', { status: 403 });
      return renderTable(env, url);
    }

    if (url.pathname === '/table/action' && request.method === 'POST') {
      const k = await tableKey(env);
      const form = await request.clone().formData().catch(() => null);
      if (!k || !form || !safeEqual(String(form.get('k') || ''), k)) return new Response('forbidden', { status: 403 });
      setWindowAlwaysOpen(isUltra(env));
      return tableAction(env, request, url, quietCommand);
    }

    // שליחת הקישור לטבלה לבעל העסק בוואטסאפ (מופעל ידנית מ-GitHub Actions)
    if (url.pathname === '/admin/send-table' && request.method === 'POST') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, String(env.WA_VERIFY_TOKEN).trim())) return new Response('forbidden', { status: 403 });
      setWindowAlwaysOpen(isUltra(env));
      await handleOwnerCommand(env, 'טבלה', new Date(), null, env.OWNER_PHONE);
      return new Response('sent');
    }

    // בדיקה עצמית אחרי כל העלאה: המוח האמיתי עונה על שיחה לדוגמה (בלי לשלוח כלום לאף אחד)
    if (url.pathname === '/admin/selftest' && request.method === 'GET') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, String(env.WA_VERIFY_TOKEN).trim())) return new Response('forbidden', { status: 403 });
      return new Response(await selfTest(env), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // שיחה לדוגמה עם המוח האמיתי (שום דבר לא נשלח ולא נשמר): רואים איך הבוט עונה בסגנון של חנן
    if (url.pathname === '/admin/demo' && request.method === 'GET') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, String(env.WA_VERIFY_TOKEN).trim())) return new Response('forbidden', { status: 403 });
      const which = url.searchParams.get('s');
      if (which === 'list') return new Response(String(DEMOS.length));
      return new Response(await demoConversation(env, Math.max(0, parseInt(which || '0', 10) || 0)), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // מייל בדיקה לבעל העסק (רק עם מילת הסוד). מופעל ידנית מ-GitHub Actions
    if (url.pathname === '/admin/test-email' && request.method === 'POST') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, String(env.WA_VERIFY_TOKEN).trim())) return new Response('forbidden', { status: 403 });
      return new Response(await sendTestEmail(env), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // הגדרה ובדיקה אוטומטית (רק עם מילת הסוד)
    if (url.pathname === '/admin/setup' && request.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      if (!env.WA_VERIFY_TOKEN || !safeEqual(key, env.WA_VERIFY_TOKEN)) return new Response('forbidden', { status: 403 });
      const text = await runSetup(env, { origin: url.origin, checkOnly: url.searchParams.get('check') === '1' });
      return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    if (url.pathname === '/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      // Dualhook: מילת האימות היא DUALHOOK_WEBHOOK_KEY (מוגדרת ב-Dualhook ובגיטהאב), גם לפני שעוברים ל-dualhook
      const dualOk = !!env.DUALHOOK_WEBHOOK_KEY && !!token && safeEqual(token, env.DUALHOOK_WEBHOOK_KEY);
      if (mode === 'subscribe' && token && (token === env.WA_VERIFY_TOKEN || dualOk)) return new Response(challenge || '');
      return new Response('forbidden', { status: 403 });
    }

    // Dualhook (מזוהה לפי המפתח בכתובת). בזמן החיבור Meta שולחים פעם אחת את אנשי הקשר וההיסטוריה מהאפליקציה:
    // שומרים אותם גם כשהבוט כבוי או עוד לא עבר ל-Dualhook, כדי שהבוט לא יענה אחר כך למשפחה ולחברים
    if (url.pathname === '/webhook' && request.method === 'POST' && env.DUALHOOK_WEBHOOK_KEY
      && safeEqual(url.searchParams.get('key') || '', env.DUALHOOK_WEBHOOK_KEY)) {
      let body;
      try { body = JSON.parse(await request.text()); } catch { return new Response('bad json', { status: 400 }); }
      if (!dualhookTrusted(env, body)) return new Response('wrong account', { status: 403 });
      const syncOnly = env.BOT_OFF === '1' || !isDual(env);
      ctx.waitUntil(processWebhook(env, body, new Date(), { syncOnly }).catch((err) => console.error('dualhook webhook failed', err)));
      return new Response('ok');
    }

    // הבוט כבוי (BOT_OFF = "1"): מקבלים ומתעלמים, בלי לענות לאף אחד
    if (url.pathname === '/webhook' && request.method === 'POST' && env.BOT_OFF === '1') return new Response('ok');

    // UltraMsg: אין חתימה, אז מילת הסוד נמצאת בכתובת (/webhook?key=WA_VERIFY_TOKEN). /admin/setup מגדיר את זה לבד
    if (url.pathname === '/webhook' && request.method === 'POST' && isUltra(env)) {
      if (!env.WA_VERIFY_TOKEN || !safeEqual(url.searchParams.get('key') || '', env.WA_VERIFY_TOKEN)) return new Response('forbidden', { status: 403 });
      let payload;
      try { payload = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
      ctx.waitUntil((async () => {
        const body = await ultraToMeta(env, payload);
        if (body) await processWebhook(env, body);
      })().catch((err) => console.error('ultramsg webhook failed', err, JSON.stringify(payload).slice(0, 500))));
      return new Response('ok');
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      const raw = await request.text();
      // בלי סוד: לא מקבלים כלום (חוץ מבדיקה מקומית עם ALLOW_UNSIGNED=1), כדי שאף אחד לא יתחזה ל-Meta.
      // דרך 360dialog אין חתימה של Meta: הם שולחים כותרת עם מילת סוד שהגדרנו (X-Bot-Secret = WA_VERIFY_TOKEN)
      // דרך Dualhook: Meta שולחים ישר אלינו, חתומים בסוד של Dualhook שלא נמסר ללקוחות. לכן המפתח נמצא בכתובת
      // (/webhook?key=DUALHOOK_WEBHOOK_KEY), ובנוסף בודקים שההודעה שייכת לחשבון ולמספר שלנו (dualhookTrusted למטה)
      const ok = isDual(env)
        ? !!env.DUALHOOK_WEBHOOK_KEY && safeEqual(url.searchParams.get('key') || '', env.DUALHOOK_WEBHOOK_KEY)
        : is360(env)
        ? !!env.WA_VERIFY_TOKEN && safeEqual(request.headers.get('x-bot-secret') || '', env.WA_VERIFY_TOKEN)
        : env.WA_APP_SECRET
          ? await verifySignature(env.WA_APP_SECRET, raw, request.headers.get('x-hub-signature-256'))
          : env.ALLOW_UNSIGNED === '1';
      if (!ok) return new Response('bad signature', { status: 401 });
      let body;
      try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
      if (isDual(env) && !dualhookTrusted(env, body)) return new Response('wrong account', { status: 403 });
      // עונים ל-Meta מיד, ומטפלים ברקע
      ctx.waitUntil(processWebhook(env, body).catch((err) => console.error('webhook processing failed', err)));
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    env = withOwner(env);
    const now = new Date(event.scheduledTime || Date.now());
    setWindowAlwaysOpen(isUltra(env));
    if (env.BOT_OFF === '1') return;
    // כל דקה: רק הסיכומים לחנן שהגיע הזמן שלהם (הלקוח סיים לכתוב)
    if (event.cron === '* * * * *') { ctx.waitUntil(flushDueSummaries(env, now)); return; }
    if (env.WORKER_URL) ctx.waitUntil(ensureUltraWebhook(env, env.WORKER_URL).catch((e) => console.error('ultramsg wiring', e)));
    if (event.cron === '0 6 * * SUN') ctx.waitUntil(weeklyReport(env, now));
    else ctx.waitUntil(runEvery15(env, now));
  },
};

const FORM_CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

// תשובות מהטופס: נשמרות קודם (כדי ששום דבר לא ילך לאיבוד), ואז נשלחות לאריאל
async function receiveForm(env, request) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...FORM_CORS } });
  let body;
  try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const text = String(body?.text || '').slice(0, 30000).trim();
  if (text.length < 20) return json({ ok: false }, 400);
  const now = new Date();
  // הגנה מהצפה: עד 10 טפסים בשעה
  const recent = (await env.DB.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'form:%' AND key >= ?").bind(`form:${new Date(now.getTime() - 3600000).toISOString()}`).first())?.n || 0;
  if (recent >= 10) return json({ ok: false }, 429);
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind(`form:${now.toISOString()}`, text).run();
  const to = env.ADMIN_PHONE || env.OWNER_PHONE;
  let notified = false;
  if (to && to !== 'email') {
    try { notified = !!(await sendToOwner(env, `📋 טופס חדש מבעל העסק:\n\n${text}`, now, null, to))?.ok; } catch (err) { console.error('form notify failed', err); }
  }
  return json({ ok: true, notified });
}

// שיחות לדוגמה עם המוח האמיתי (שום דבר לא נשלח ולא נשמר). ?s=מספר בוחר שיחה, ?s=list מחזיר כמה יש
// at: זמן מדומה (שעון ישראל), כדי לראות איך הבוט עונה בשבת או בלילה
export const DEMOS = [
  { title: 'נעילה רגילה: שלום, תקלה, כתובת, שאלות על מחיר ותשלום, תודה', at: '2026-10-19T11:00:00+03:00', turns: ['היי', 'ננעלתי מחוץ לבית, המפתח נשאר בפנים', 'אין לי איך לצלם, הטלפון כמעט מת', 'הרצל 12 נתניה, קומה 3 דירה 9, קוד לבניין 1234', 'כמה זה עולה בערך? ואפשר לשלם באשראי?', 'תודה רבה'] },
  { title: 'דחוף: ילד נעול ברכב', at: '2026-10-19T13:00:00+03:00', turns: ['דחוף!!! הילד שלי נעול באוטו והמפתח בפנים', 'קניון עיר ימים נתניה, חניון למטה'] },
  { title: 'מיקוח, אחריות וזמן הגעה', at: '2026-10-19T10:00:00+03:00', turns: ['שלום, צריך להחליף צילינדר בדלת', 'כמה זה עולה? מישהו אחר אמר לי 150', 'יש אחריות?', 'תוך כמה זמן אתה יכול להגיע?', 'סמילנסקי 20 נתניה'] },
  { title: 'לקוח באנגלית', at: '2026-10-19T16:00:00+03:00', turns: ["Hi, I'm locked out of my car, a Mazda 3 2018", 'Keys are inside. I am at Poleg beach parking, Netanya'] },
  { title: 'מחוץ לאזור השירות', at: '2026-10-19T12:00:00+03:00', turns: ['היי, אתם מגיעים לבאר שבע? נשבר לי המנעול בדלת'] },
  { title: 'שבת: לקוח כותב ביום שבת בצהריים', at: '2026-10-24T13:00:00+03:00', turns: ['שלום ננעלתי בחוץ, אפשר להגיע?', 'ויצמן 5 נתניה'] },
  { title: 'אחרי שעות העבודה, ושאלה אם זה בוט', at: '2026-10-19T21:30:00+03:00', turns: ['ערב טוב, צריך להתקין מנעול חכם בדלת', 'רגע, אני מדבר עם בוט?', 'אוקיי, הכתובת היא הרצל 40 נתניה'] },
];

async function demoConversation(env, idx = 0) {
  const demo = DEMOS[idx] || DEMOS[0];
  const now = new Date(demo.at);
  const history = [];
  const out = [`===== שיחה ${idx + 1} מתוך ${DEMOS.length}: ${demo.title} =====`, ''];
  let after = false;
  let usd = 0;
  let collected = { issue: '', address: '', urgent: false, notes: [], questions: [] };
  for (const text of demo.turns) {
    history.push({ role: 'user', text });
    const r = await runTurn(env, { history, now, afterHandoff: after });
    out.push(`לקוח: ${text}`, `בוט: ${r.reply || '(לא עונה)'}`);
    if (r.usage) usd += r.usage.usd;
    if (r.reply) history.push({ role: 'assistant', text: r.reply });
    collected = { issue: r.issue || collected.issue, address: r.address || collected.address, urgent: collected.urgent || r.urgent, notes: r.summary_for_owner ? [r.summary_for_owner] : collected.notes, questions: r.question_for_owner && !collected.questions.some((q) => sameQuestion(q, r.question_for_owner)) ? [...collected.questions, r.question_for_owner] : collected.questions };
    const flags = [r.ready_for_handoff && 'מעביר לחנן', r.urgent && 'דחוף', r.question_for_owner && `שאלה לחנן: ${r.question_for_owner}`, r.failed && 'תקלה במוח'].filter(Boolean);
    if (flags.length) out.push(`   [${flags.join(' | ')}]`);
    out.push('');
    if (r.ready_for_handoff) after = true;
  }
  if (after) {
    out.push(`--- המייל שחנן מקבל (${collected.urgent ? 'מיד, דחוף' : 'אחרי 3 דקות שקט'}) ---`,
      collected.urgent ? '🚨 פנייה דחופה!' : '🔔 פנייה חדשה',
      ...(collected.questions.length ? [`❓ הלקוח מחכה לתשובה ממך: ${collected.questions.join(' / ')}`] : []),
      `כתובת: ${collected.address || '(לא נמסרה)'}`, `תקלה: ${collected.issue || '(לא פורט)'}`, ...(collected.notes.length ? ['', collected.notes[0]] : []));
  }
  out.push('', `עלות השיחה ל-Anthropic: ${usd.toFixed(3)}$`, '');
  return out.join('\n');
}

async function selfTest(env) {
  const out = [];
  const cases = [
    { name: 'עברית', text: 'היי ננעלתי מחוץ לבית', lang: 'he' },
    { name: 'אנגלית', text: "Hi, I'm locked out of my apartment", lang: 'en' },
    { name: 'רק שלום', text: 'היי', menu: true },
    { name: 'דחוף', text: 'דחוף!! הילד שלי נעול באוטו בשמש', urgent: true },
  ];
  for (const c of cases) {
    const t = Date.now();
    const r = await runTurn(env, { history: [{ role: 'user', text: c.text }], now: new Date() });
    const problems = [];
    if (r.failed) problems.push(`המוח לא ענה: ${r.summary_for_owner}`);
    if (!r.reply) problems.push('תשובה ריקה');
    if (c.lang && r.language !== c.lang) problems.push(`שפה ${r.language} במקום ${c.lang}`);
    if (c.urgent && !r.urgent) problems.push('לא זיהה דחוף');
    if (c.menu && !BUSINESS.greeting && !/1\./.test(r.reply)) problems.push('לא שלח תפריט שירותים');
    out.push(`${problems.length ? 'FAIL' : 'OK'} ${c.name} (${Date.now() - t}ms): ${problems.join('; ') || r.reply}`);
  }
  await env.DB.prepare('SELECT COUNT(*) FROM conversations').first();
  out.push('OK מסד הנתונים');
  return out.join('\n');
}

// Dualhook: ההודעה צריכה להיות של חשבון הוואטסאפ שלנו (WABA_ID) ושל המספר שלנו (WA_PHONE_NUMBER_ID)
export function dualhookTrusted(env, body) {
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return false;
  return body.entry.every((e) => (!env.WABA_ID || String(e.id) === String(env.WABA_ID))
    && (e.changes || []).every((c) => {
      const pid = c.value?.metadata?.phone_number_id;
      return !pid || !env.WA_PHONE_NUMBER_ID || String(pid) === String(env.WA_PHONE_NUMBER_ID);
    }));
}

// מה חסר בהגדרות (רק שמות, אף פעם לא ערכים)
export function healthText(env) {
  const need = isUltra(env)
    ? { ULTRAMSG_INSTANCE: env.ULTRAMSG_INSTANCE, ULTRAMSG_TOKEN: env.ULTRAMSG_TOKEN, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE }
    : is360(env)
    ? { D360_API_KEY: env.D360_API_KEY, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE }
    : isDual(env)
    ? {
      DUALHOOK_API_KEY: env.DUALHOOK_API_KEY, DUALHOOK_WEBHOOK_KEY: env.DUALHOOK_WEBHOOK_KEY, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE, WABA_ID: env.WABA_ID,
      WA_PHONE_NUMBER_ID: env.WA_PHONE_NUMBER_ID && !String(env.WA_PHONE_NUMBER_ID).startsWith('REPLACE'),
    }
    : {
      WA_TOKEN: env.WA_TOKEN, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, WA_APP_SECRET: env.WA_APP_SECRET,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE,
      WA_PHONE_NUMBER_ID: env.WA_PHONE_NUMBER_ID && !String(env.WA_PHONE_NUMBER_ID).startsWith('REPLACE'),
    };
  const nice = { GOOGLE_SA_JSON: env.GOOGLE_SA_JSON, SHEET_ID: env.SHEET_ID, REVIEW_LINK: env.REVIEW_LINK, ADMIN_PHONE: env.ADMIN_PHONE, YESH_USERKEY: env.YESH_USERKEY, YESH_SECRET: env.YESH_SECRET };
  const missing = Object.keys(need).filter((k) => !need[k]);
  const optional = Object.keys(nice).filter((k) => !nice[k]);
  return [
    missing.length ? 'not ready' : 'ok',
    missing.length ? `missing: ${missing.join(', ')}` : '',
    optional.length ? `optional, not set: ${optional.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// syncOnly: רק שמירת אנשי הקשר מהסנכרון של החיבור, בלי לענות לאף אחד (הבוט כבוי)
export async function processWebhook(env, body, now = new Date(), { syncOnly = false } = {}) {
  setWindowAlwaysOpen(isUltra(env));
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (syncOnly) {
        if (change.field === 'smb_app_state_sync') console.log(`imported ${await importKnownContacts(env, v, now)} known contacts from ${change.field}`);
        continue;
      }
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      // כמה הודעות באותה משלוחה: במקביל, כדי שהבוט יענה עליהן ביחד ולא אחת אחת
      await Promise.all((v.messages || []).map((msg) => handleInbound(env, msg, names[msg.from], now)
        .catch((err) => console.error('message failed', msg.id, err))));
      // Coexistence: הודעות שחנן שולח מאפליקציית WhatsApp Business
      for (const echo of v.message_echoes || []) {
        await handleOwnerEcho(env, echo, now).catch((err) => console.error('echo failed', err));
      }
      // הודעות שלא נמסרו (מספר לא בוואטסאפ, תבנית שנעצרה וכו')
      for (const st of v.statuses || []) {
        if (st.status === 'failed') await handleFailedStatus(env, st, now).catch((err) => console.error('status failed', err));
      }
      // Coexistence: סנכרון אנשי קשר והיסטוריה מהאפליקציה בזמן החיבור
      // רק אנשי הקשר השמורים בטלפון (משפחה, חברים, ספקים) מסומנים כמוכרים, והבוט לא עונה להם.
      // מי שרק דיבר פעם עם העסק (היסטוריה, כולל לקוחות ישנים) מקבל את הבוט כרגיל
      if (change.field === 'smb_app_state_sync') {
        const n = await importKnownContacts(env, v, now);
        console.log(`imported ${n} known contacts from ${change.field}`);
      }
    }
  }
}
