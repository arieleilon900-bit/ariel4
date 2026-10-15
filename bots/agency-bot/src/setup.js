// הגדרה ובדיקה אוטומטית: https://<השרת>/admin/setup?key=<WA_VERIFY_TOKEN>
// עושה בעצמו את מה שהיה צריך ללחוץ ב-Meta (חיבור ה-webhook, יצירת 9 התבניות), ובודק שכל המפתחות עובדים.
// &check=1 = רק בדיקה, בלי לשנות כלום. בטוח להריץ שוב ושוב: מה שכבר קיים לא נוצר מחדש.
import Anthropic from '@anthropic-ai/sdk';
import { BUSINESS, FEATURES, TEMPLATE_DEFS } from './config.js';
import { MODEL } from './ai.js';
import { ensureHeader, getAccessToken } from './sheets.js';
import { yeshCall, yeshConfigured } from './yesh.js';
import { is360, isUltra } from './whatsapp.js';

const D360 = 'https://waba-v2.360dialog.io';
const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v24.0'}`;
const WEBHOOK_FIELDS = ['messages', 'smb_message_echoes', 'history', 'smb_app_state_sync'];
// קובץ PDF קטן לדוגמה: Meta דורשים דוגמה לתבנית עם מסמך (הקבלה)
const SAMPLE_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

async function j(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.meta?.developer_message || `HTTP ${res.status}`);
  return data;
}

// UltraMsg: מחבר לבד את ההודעות לשרת (בבדיקת המצב וכל 15 דקות), בלי שמישהו יצטרך לפתוח את /admin/setup.
// לא נוגע אם כבר מחובר נכון.
let ultraWired = '';
export async function ensureUltraWebhook(env, origin) {
  if (!isUltra(env) || !env.ULTRAMSG_INSTANCE || !env.ULTRAMSG_TOKEN || !env.WA_VERIFY_TOKEN || !origin) return 'skip';
  const hook = `${origin}/webhook?key=${encodeURIComponent(env.WA_VERIFY_TOKEN)}`;
  if (ultraWired === hook) return 'cached';
  const U = `https://api.ultramsg.com/${env.ULTRAMSG_INSTANCE}`;
  const cur = await j(await fetch(`${U}/instance/settings?token=${encodeURIComponent(env.ULTRAMSG_TOKEN)}`));
  if (cur.webhook_url !== hook || String(cur.webhook_message_received) !== 'true' || String(cur.webhook_message_create) !== 'true' || String(cur.webhook_message_download_media) !== 'true') {
    await j(await fetch(`${U}/instance/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.ULTRAMSG_TOKEN, webhook_url: hook, webhook_message_received: true, webhook_message_create: true, webhook_message_ack: false, webhook_message_download_media: true, sendDelay: 1 }),
    }));
    console.log('UltraMsg webhook wired');
  }
  ultraWired = hook;
  return 'wired';
}

export async function runSetup(env, { origin, checkOnly = false } = {}) {
  const out = [];
  const ok = (t) => out.push(`✓ ${t}`);
  const bad = (t) => out.push(`✗ ${t}`);
  const warn = (t) => out.push(`⚠ ${t}`);
  const step = async (name, fn) => { try { await fn(); } catch (e) { bad(`${name}: ${e.message}`); } };
  const bearer = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const d360 = { 'D360-API-KEY': env.D360_API_KEY, 'Content-Type': 'application/json' };

  out.push(checkOnly ? 'בדיקה בלבד (לא משנה כלום)' : 'הגדרה ובדיקה', '');

  await step('מסד הנתונים', async () => {
    await env.DB.prepare('SELECT COUNT(*) AS n FROM knowledge').first();
    ok('מסד הנתונים: כל הטבלאות קיימות');
  });

  // ---------- וואטסאפ ----------
  if (isUltra(env)) {
    const U = `https://api.ultramsg.com/${env.ULTRAMSG_INSTANCE}`;
    if (!env.ULTRAMSG_INSTANCE || !env.ULTRAMSG_TOKEN) bad('UltraMsg: חסרים ULTRAMSG_INSTANCE או ULTRAMSG_TOKEN');
    else {
      await step('UltraMsg מחובר', async () => {
        const st = await j(await fetch(`${U}/instance/status?token=${encodeURIComponent(env.ULTRAMSG_TOKEN)}`));
        const s = st.status?.accountStatus?.status || st.status?.accountStatus || JSON.stringify(st).slice(0, 80);
        s === 'authenticated' ? ok('UltraMsg: המספר מחובר') : bad(`UltraMsg: המספר לא מחובר (${s}). צריך לסרוק QR בלוח של UltraMsg`);
      });
      await step('UltraMsg webhook', async () => {
        const hook = `${origin}/webhook?key=${encodeURIComponent(env.WA_VERIFY_TOKEN || '')}`;
        if (!checkOnly) {
          await j(await fetch(`${U}/instance/settings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: env.ULTRAMSG_TOKEN, webhook_url: hook, webhook_message_received: true, webhook_message_create: true, webhook_message_ack: false, webhook_message_download_media: true, sendDelay: 1 }),
          }));
        }
        const cur = await j(await fetch(`${U}/instance/settings?token=${encodeURIComponent(env.ULTRAMSG_TOKEN)}`));
        String(cur.webhook_url || '').startsWith(`${origin}/webhook`) ? ok('UltraMsg: ההודעות מגיעות לשרת') : bad(`UltraMsg: ההודעות מגיעות ל-${cur.webhook_url || 'שום מקום'}, לא לשרת הזה`);
        String(cur.webhook_message_create) === 'true' ? ok('UltraMsg: הבוט רואה כשחנן עונה מהטלפון') : warn('UltraMsg: webhook_message_create כבוי, הבוט לא יידע כשחנן עונה בעצמו');
      });
      // אנשי הקשר השמורים בטלפון (משפחה, חברים, ספקים): הבוט לא עונה להם. בזמן בדיקה (TEST_PHONES) לא מייבאים
      if (env.TEST_PHONES) warn(`מצב בדיקה: הבוט עונה רק ל-${env.TEST_PHONES} ולחנן. כשעוברים ללקוחות אמיתיים מוחקים את TEST_PHONES`);
      else if (!checkOnly) await step('אנשי קשר', async () => {
        const list = await j(await fetch(`${U}/contacts?token=${encodeURIComponent(env.ULTRAMSG_TOKEN)}`));
        const arr = Array.isArray(list) ? list : list.contacts || list.data || [];
        const saved = arr.filter((c) => /@c\.us$/.test(String(c.id || '')) && (c.isMyContact === true || (c.isMyContact === undefined && c.name)));
        let n = 0;
        for (const c of saved) {
          const p = String(c.id).split('@')[0];
          if (!/^\d{9,15}$/.test(p) || p === env.OWNER_PHONE || p === env.ADMIN_PHONE) continue;
          await env.DB.prepare('INSERT INTO customers (phone, name, first_seen, known) VALUES (?, ?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(p, c.name || null, new Date().toISOString()).run();
          n++;
        }
        ok(`אנשי קשר: ${n} אנשי קשר שמורים בטלפון סומנו כמוכרים. הבוט לא יענה להם (אפשר להחזיר אחד: בוט <טלפון>)`);
      });
    }
  } else if (is360(env)) {
    if (!env.D360_API_KEY) bad('360dialog: חסר D360_API_KEY');
    else await step('360dialog webhook', async () => {
      if (!checkOnly) {
        await j(await fetch(`${D360}/v1/configs/webhook`, { method: 'POST', headers: d360, body: JSON.stringify({ url: `${origin}/webhook`, headers: { 'X-Bot-Secret': env.WA_VERIFY_TOKEN } }) }));
      }
      const cur = await j(await fetch(`${D360}/v1/configs/webhook`, { headers: d360 }));
      cur.url === `${origin}/webhook` ? ok(`360dialog: ההודעות מגיעות לשרת (${cur.url})`) : bad(`360dialog: ההודעות מגיעות ל-${cur.url || 'שום מקום'}, לא לשרת הזה`);
    });
  } else {
    if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID || String(env.WA_PHONE_NUMBER_ID).startsWith('REPLACE')) bad('וואטסאפ: חסרים WA_TOKEN או WA_PHONE_NUMBER_ID');
    else await step('המספר בוואטסאפ', async () => {
      const p = await j(await fetch(`${graph(env)}/${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,status`, { headers: bearer }));
      ok(`וואטסאפ: המספר ${p.display_phone_number} בשם "${p.verified_name}" (איכות: ${p.quality_rating || '?'}, סטטוס: ${p.status || p.code_verification_status || '?'})`);
    });

    if (!env.META_APP_ID || !env.WA_APP_SECRET) warn('webhook: חסרים META_APP_ID או WA_APP_SECRET, אז את החיבור של Meta לשרת צריך לעשות ידנית (SETUP.md שלב 7)');
    else await step('webhook', async () => {
      if (!checkOnly) {
        const body = new URLSearchParams({
          object: 'whatsapp_business_account', callback_url: `${origin}/webhook`, verify_token: env.WA_VERIFY_TOKEN,
          fields: WEBHOOK_FIELDS.join(','), include_values: 'true', access_token: `${env.META_APP_ID}|${env.WA_APP_SECRET}`,
        });
        await j(await fetch(`${graph(env)}/${env.META_APP_ID}/subscriptions`, { method: 'POST', body }));
      }
      ok(`webhook: Meta שולחים הודעות ל-${origin}/webhook (${WEBHOOK_FIELDS.join(', ')})`);
    });

    if (!env.WABA_ID) warn('חסר WABA_ID (מזהה חשבון הוואטסאפ העסקי): בלי זה אי אפשר לחבר את החשבון ולהקים תבניות');
    else await step('חיבור החשבון', async () => {
      if (!checkOnly) await j(await fetch(`${graph(env)}/${env.WABA_ID}/subscribed_apps`, { method: 'POST', headers: bearer }));
      const subs = await j(await fetch(`${graph(env)}/${env.WABA_ID}/subscribed_apps`, { headers: bearer }));
      subs.data?.length ? ok(`חשבון הוואטסאפ מחובר לאפליקציה (${subs.data.map((s) => s.whatsapp_business_api_data?.name).join(', ')})`) : bad('חשבון הוואטסאפ לא מחובר לאפליקציה');
    });
  }

  // ---------- תבניות ----------
  const canTemplates = isUltra(env) ? false : is360(env) ? !!env.D360_API_KEY : !!(env.WABA_ID && env.WA_TOKEN);
  if (isUltra(env)) ok('תבניות: לא צריך ב-UltraMsg (כל ההודעות נשלחות כטקסט רגיל)');
  if (canTemplates) await step('תבניות', async () => {
    const listUrl = is360(env) ? `${D360}/message_templates?limit=200` : `${graph(env)}/${env.WABA_ID}/message_templates?fields=name,status,language&limit=200`;
    const listed = await j(await fetch(listUrl, { headers: is360(env) ? d360 : bearer }));
    const existing = listed.waba_templates || listed.data || [];
    const lang = env.TEMPLATE_LANG || 'he';
    for (const def of TEMPLATE_DEFS.filter((d) => FEATURES.receipts || !d.documentHeader)) {
      const have = existing.find((t) => t.name === def.name && (!t.language || t.language === lang));
      if (have) { (have.status === 'APPROVED' ? ok : warn)(`תבנית ${def.name}: ${statusHe(have.status)}`); continue; }
      if (checkOnly) { bad(`תבנית ${def.name}: לא קיימת`); continue; }
      try {
        const components = [];
        if (def.documentHeader) {
          if (is360(env) || !env.META_APP_ID) { warn(`תבנית ${def.name}: עם מסמך (קבלה) צריך ליצור ידנית ב-WhatsApp Manager. הטקסט: ${def.body}`); continue; }
          components.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [await uploadSample(env)] } });
        }
        const body = { type: 'BODY', text: def.body };
        if (def.examples?.length) body.example = { body_text: [def.examples] };
        components.push(body);
        if (def.quickReplies?.length) components.push({ type: 'BUTTONS', buttons: def.quickReplies.map((text) => ({ type: 'QUICK_REPLY', text })) });
        const url = is360(env) ? `${D360}/message_templates` : `${graph(env)}/${env.WABA_ID}/message_templates`;
        const r = await j(await fetch(url, {
          method: 'POST', headers: is360(env) ? d360 : { ...bearer, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: def.name, language: lang, category: def.category, allow_category_change: true, components }),
        }));
        ok(`תבנית ${def.name}: נוצרה, ${statusHe(r.status)}`);
      } catch (e) { bad(`תבנית ${def.name}: ${e.message}`); }
    }
  });

  // ---------- AI ----------
  if (!env.ANTHROPIC_API_KEY) bad('AI: חסר ANTHROPIC_API_KEY');
  else await step('AI', async () => {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 8000 });
    const m = await client.models.retrieve(env.CLAUDE_MODEL || MODEL);
    ok(`AI: המפתח עובד (${m.display_name || m.id})`);
  });

  // ---------- גיליון ----------
  if (!env.SHEET_ID || !env.GOOGLE_SA_JSON) warn('גיליון: לא מוגדר (SHEET_ID / GOOGLE_SA_JSON). הבוט עובד גם בלי');
  else await step('גיליון', async () => {
    const token = await getAccessToken(env);
    const r = checkOnly ? 'נבדק' : await ensureHeader(env, token);
    ok(`גיליון: יש גישה${r === 'created' ? ', ונוספה שורת כותרות' : ''}`);
  });

  // ---------- יש חשבונית ----------
  if (!FEATURES.receipts) { /* קבלות כבויות: לא בודקים את יש חשבונית */ } else if (!yeshConfigured(env)) warn('יש חשבונית: לא מחובר (YESH_USERKEY / YESH_SECRET). חנן שולח קבלות ידנית בינתיים');
  else await step('יש חשבונית', async () => {
    await yeshCall(env, 'getInvoices', { CustomerID: -1, PageSize: 1, PageNumber: 1, docTypes: [], Search: '', from: '2020-01-01 00:00', to: '2100-01-01 00:00' });
    ok('יש חשבונית: המפתחות עובדים, קבלות חדשות יישלחו ללקוחות לבד');
  });

  // ---------- הגדרות ----------
  if (env.OWNER_EMAIL) {
    ok(`התראות ל${BUSINESS.ownerName}: במייל`);
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) bad(`חסר GMAIL_USER או GMAIL_APP_PASSWORD: המיילים ל${BUSINESS.ownerName} לא יישלחו`);
  } else env.OWNER_PHONE ? ok(`התראות ל${BUSINESS.ownerName}: ${env.OWNER_PHONE}`) : bad('חסר OWNER_PHONE או OWNER_EMAIL');
  env.ADMIN_PHONE ? ok(`התראות תקלה: ${env.ADMIN_PHONE}`) : warn('אין ADMIN_PHONE: התראות על תקלות לא יישלחו');
  env.REVIEW_LINK ? ok('קישור לביקורת בגוגל: מוגדר') : warn('אין REVIEW_LINK: בקשות ביקורת לא יישלחו');

  const fails = out.filter((l) => l.startsWith('✗')).length;
  out.push('', fails ? `יש ${fails} דברים לתקן (מסומנים ב-✗).` : 'הכל מוכן.');
  return out.join('\n');
}

function statusHe(s) {
  return { APPROVED: 'מאושרת', PENDING: 'מחכה לאישור של Meta', REJECTED: 'נדחתה (צריך לשנות את הטקסט)', PAUSED: 'מושהית', DISABLED: 'מושבתת' }[s] || s || 'נשלחה';
}

// Meta: העלאת קובץ דוגמה כדי לקבל "handle" לתבנית עם מסמך
async function uploadSample(env) {
  const bytes = new TextEncoder().encode(SAMPLE_PDF);
  const q = new URLSearchParams({ file_name: 'receipt-sample.pdf', file_length: String(bytes.length), file_type: 'application/pdf', access_token: env.WA_TOKEN });
  const session = await j(await fetch(`${graph(env)}/${env.META_APP_ID}/uploads?${q}`, { method: 'POST' }));
  const up = await j(await fetch(`${graph(env)}/${session.id}`, { method: 'POST', headers: { Authorization: `OAuth ${env.WA_TOKEN}`, file_offset: '0' }, body: bytes }));
  return up.h;
}
