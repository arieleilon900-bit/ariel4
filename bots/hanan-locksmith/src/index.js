// נקודת הכניסה של השרת (Cloudflare Worker).
// GET /webhook  ← אימות של Meta בזמן החיבור
// POST /webhook ← הודעות נכנסות מוואטסאפ
// cron          ← תזכורות, מעקבים ודוח שבועי
import { flushDueSummaries, sendToOwner, handleFailedStatus, handleInbound, handleOwnerEcho, importKnownContacts } from './handler.js';
import { runEvery15, weeklyReport } from './cron.js';
import { ensureUltraWebhook, runSetup } from './setup.js';
import { is360, isUltra, verifySignature } from './whatsapp.js';
import { ultraToMeta } from './ultramsg.js';
import { renderTable, tableAction, tableKey } from './table.js';
import { handleOwnerCommand } from './owner.js';
import { runTurn } from './ai.js';
import { setWindowAlwaysOpen } from './util.js';
import { FORM_HTML } from './form-page.js';
import { actionPage, ownerByEmail, serveMedia } from './email.js';

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
      return new Response(await demoConversation(env), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
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
      if (mode === 'subscribe' && token && token === env.WA_VERIFY_TOKEN) return new Response(challenge || '');
      return new Response('forbidden', { status: 403 });
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
      const ok = is360(env)
        ? !!env.WA_VERIFY_TOKEN && safeEqual(request.headers.get('x-bot-secret') || '', env.WA_VERIFY_TOKEN)
        : env.WA_APP_SECRET
          ? await verifySignature(env.WA_APP_SECRET, raw, request.headers.get('x-hub-signature-256'))
          : env.ALLOW_UNSIGNED === '1';
      if (!ok) return new Response('bad signature', { status: 401 });
      let body;
      try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
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

async function demoConversation(env) {
  const customer = [
    'היי',
    'ננעלתי מחוץ לבית, המפתח נשאר בפנים',
    'אין לי איך לצלם, הטלפון כמעט מת',
    'הרצל 12 נתניה, קומה 3',
    'כמה זה עולה בערך? ואפשר לשלם באשראי?',
    'תודה רבה',
  ];
  const history = [];
  const out = [];
  let after = false;
  let collected = { issue: '', address: '', notes: [], questions: [] };
  for (const text of customer) {
    history.push({ role: 'user', text });
    const r = await runTurn(env, { history, now: new Date(), afterHandoff: after });
    out.push(`לקוח: ${text}`, `בוט: ${r.reply || '(לא עונה)'}`);
    if (r.reply) history.push({ role: 'assistant', text: r.reply });
    collected = { issue: r.issue || collected.issue, address: r.address || collected.address, notes: r.summary_for_owner ? [r.summary_for_owner] : collected.notes, questions: r.question_for_owner ? [...collected.questions, r.question_for_owner] : collected.questions };
    const flags = [r.ready_for_handoff && 'מעביר לחנן', r.urgent && 'דחוף', r.question_for_owner && `שאלה לחנן: ${r.question_for_owner}`].filter(Boolean);
    if (flags.length) out.push(`   [${flags.join(' | ')}]`);
    out.push('');
    if (r.ready_for_handoff) after = true;
  }
  out.push('--- הדוח שחנן מקבל (אחרי 3 דקות שקט) ---',
    '🔔 פנייה חדשה',
    ...(collected.questions.length ? [`❓ הלקוח מחכה לתשובה ממך: ${collected.questions.join(' / ')}`] : []),
    `תקלה: ${collected.issue || '(לא פורט)'}`, `כתובת: ${collected.address || '(לא נמסרה)'}`, ...(collected.notes.length ? ['', collected.notes[0]] : []));
  return out.join('\n');
}

async function selfTest(env) {
  const out = [];
  const cases = [
    { name: 'עברית', text: 'היי ננעלתי מחוץ לבית', lang: 'he' },
    { name: 'אנגלית', text: "Hi, I'm locked out of my apartment", lang: 'en' },
    { name: 'רק שלום (תפריט)', text: 'היי', menu: true },
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
    if (c.menu && !/1\./.test(r.reply)) problems.push('לא שלח תפריט שירותים');
    out.push(`${problems.length ? 'FAIL' : 'OK'} ${c.name} (${Date.now() - t}ms): ${problems.join('; ') || r.reply}`);
  }
  await env.DB.prepare('SELECT COUNT(*) FROM conversations').first();
  out.push('OK מסד הנתונים');
  return out.join('\n');
}

// מה חסר בהגדרות (רק שמות, אף פעם לא ערכים)
export function healthText(env) {
  const need = isUltra(env)
    ? { ULTRAMSG_INSTANCE: env.ULTRAMSG_INSTANCE, ULTRAMSG_TOKEN: env.ULTRAMSG_TOKEN, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE }
    : is360(env)
    ? { D360_API_KEY: env.D360_API_KEY, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE }
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

export async function processWebhook(env, body, now = new Date()) {
  setWindowAlwaysOpen(isUltra(env));
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
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
      if (['history', 'smb_app_state_sync'].includes(change.field)) {
        const n = await importKnownContacts(env, v, now);
        console.log(`imported ${n} known contacts from ${change.field}`);
      }
    }
  }
}
