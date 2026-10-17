// WhatsApp Cloud API (Meta): שליחה, קבלת מדיה, ובדיקת חתימה.
import { TEMPLATE_DEFS } from './config.js';

// שני ספקים אפשריים, אותו מבנה הודעות:
// meta (ברירת מחדל): ישירות מול Meta, עם WA_TOKEN ו-WA_PHONE_NUMBER_ID
// 360dialog: ספק מורשה (בשביל מספר שעובד גם באפליקציה וגם בבוט), עם D360_API_KEY
// ultramsg: מחובר לוואטסאפ הרגיל כמו WhatsApp Web (סריקת QR), עם ULTRAMSG_INSTANCE ו-ULTRAMSG_TOKEN.
//   אין תבניות ואין חלון 24 שעות. לא רשמי של Meta: יש סיכון שוואטסאפ יחסמו את המספר.
// dualhook: ספק מורשה וזול (המספר עובד גם באפליקציה וגם בבוט). ההודעות מ-Meta מגיעות ישר אלינו,
//   ושולחים דרך api.dualhook.com באותו מבנה של Meta, עם DUALHOOK_API_KEY ו-WA_PHONE_NUMBER_ID
const D360 = 'https://waba-v2.360dialog.io';
export const DUAL = 'https://api.dualhook.com/v25.0';
export const is360 = (env) => env.WA_PROVIDER === '360dialog';
export const isUltra = (env) => env.WA_PROVIDER === 'ultramsg';
export const isDual = (env) => env.WA_PROVIDER === 'dualhook';
// המספר של בעל העסק עובד גם באפליקציה בטלפון שלו: הוא רואה שם את השיחות ועונה בעצמו
export const sharesOwnerApp = (env) => isUltra(env) || is360(env) || isDual(env);
const ultraBase = (env) => `https://api.ultramsg.com/${env.ULTRAMSG_INSTANCE}`;

// UltraMsg: כל שליחה נרשמת, כדי שההודעה שחוזרת אלינו כ"נשלחה" לא תיחשב כאילו חנן ענה
async function ultra(env, path, to, fields, logBody) {
  // נרשם לפני השליחה: ההודעה יכולה לחזור אלינו מ-UltraMsg עוד לפני שהשליחה מסתיימת
  const logged = await env.DB?.prepare('INSERT INTO ultra_sent (phone, body, created_at) VALUES (?, ?, ?)').bind(to, String(logBody || '').replace(/\s+/g, ' ').trim(), new Date().toISOString()).run().catch(() => null);
  const res = await fetch(`${ultraBase(env)}/messages/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: env.ULTRAMSG_TOKEN, to: `+${to}`, ...fields }),
  });
  const data = await res.json().catch(() => ({}));
  const ok = res.ok && String(data.sent) === 'true';
  if (!ok) {
    console.error('UltraMsg error', res.status, JSON.stringify(data));
    if (logged?.meta?.last_row_id) await env.DB.prepare('DELETE FROM ultra_sent WHERE id = ?').bind(logged.meta.last_row_id).run().catch(() => {});
    return { ok: false, status: res.status, data };
  }
  return { ok: true, data: { messages: [{ id: String(data.id ?? '') }] } };
}
const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v24.0'}`;
const authHeaders = (env) => (is360(env) ? { 'D360-API-KEY': env.D360_API_KEY }
  : { Authorization: `Bearer ${isDual(env) ? env.DUALHOOK_API_KEY : env.WA_TOKEN}` });
// כתובת לשליחה: ב-Meta וב-Dualhook דרך מזהה המספר, ב-360dialog ישירות
const endpoint = (env, path) => (is360(env) ? `${D360}/${path}` : `${isDual(env) ? DUAL : graph(env)}/${env.WA_PHONE_NUMBER_ID}/${path}`);

async function call(env, path, body) {
  const res = await fetch(endpoint(env, path), {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('WhatsApp API error', res.status, JSON.stringify(data));
    return { ok: false, status: res.status, data };
  }
  return { ok: true, data };
}

export function sendText(env, to, text) {
  if (isUltra(env)) return ultra(env, 'chat', to, { body: String(text).slice(0, 4000) }, String(text).slice(0, 4000));
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'text',
    text: { body: String(text).slice(0, 4000), preview_url: true },
  });
}

// מסמך לפי קישור (https://...) או לפי מזהה מדיה שהועלה ל-Meta
const docRef = (doc, filename) => (/^https?:\/\//.test(doc) ? { link: doc, filename } : { id: doc, filename });

// תבנית מאושרת. params = מחרוזות למשתנים {{1}}, {{2}}...; doc = PDF בכותרת (לקבלות): קישור או מזהה מדיה
export function sendTemplate(env, to, name, params = [], doc = null, filename = 'receipt.pdf') {
  // UltraMsg: אין תבניות. שולחים את הטקסט של התבנית עם המשתנים
  if (isUltra(env)) {
    const def = TEMPLATE_DEFS.find((d) => d.name === name);
    const text = String(def?.body || params.join('\n')).replace(/\{\{(\d+)\}\}/g, (_, i) => params[i - 1] ?? '');
    if (doc) return sendDocument(env, to, doc, filename, text);
    return sendText(env, to, text);
  }
  const components = [];
  if (doc) {
    components.push({ type: 'header', parameters: [{ type: 'document', document: docRef(doc, filename) }] });
  }
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) });
  }
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'template',
    template: { name, language: { code: env.TEMPLATE_LANG || 'he' }, components },
  });
}

export function sendDocument(env, to, doc, filename, caption) {
  if (isUltra(env)) return ultra(env, 'document', to, { document: doc, filename, caption: caption || '' }, caption);
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'document',
    document: { ...docRef(doc, filename), caption },
  });
}

export function sendImageById(env, to, mediaId, caption) {
  if (isUltra(env)) return ultra(env, 'image', to, { image: mediaId, caption: caption || '' }, caption);
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId, caption },
  });
}

// סרטון: ב-UltraMsg לפי קישור, ב-Meta לפי מזהה מדיה
export function sendVideoById(env, to, mediaId, caption) {
  if (isUltra(env)) return ultra(env, 'video', to, { video: mediaId, caption: caption || '' }, caption);
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'video', video: { id: mediaId, caption },
  });
}

export function markRead(env, messageId) {
  if (isUltra(env)) return Promise.resolve({ ok: true });
  return call(env, 'messages', {
    messaging_product: 'whatsapp', status: 'read', message_id: messageId,
  });
}

// מורידים מדיה שלקוח שלח (תמונה / הקלטה)
export async function downloadMedia(env, mediaId) {
  // UltraMsg: "מזהה המדיה" הוא קישור ישיר לקובץ
  if (isUltra(env)) {
    const file = await fetch(mediaId);
    if (!file.ok) throw new Error(`media download ${file.status}`);
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.headers.get('content-type') || 'application/octet-stream' };
  }
  const meta = await fetch(is360(env) ? `${D360}/${mediaId}` : `${isDual(env) ? DUAL : graph(env)}/${mediaId}`, { headers: authHeaders(env) });
  if (!meta.ok) throw new Error(`media meta ${meta.status}`);
  const info = await meta.json();
  // ב-360dialog מורידים דרך השרת שלהם: מחליפים את הכתובת של Meta בכתובת שלהם.
  // ב-Dualhook הכתובת כבר אצלם (/content), ומורידים עם אותו מפתח
  const url = is360(env) ? String(info.url).replace(/\\/g, '').replace('https://lookaside.fbsbx.com', D360)
    : isDual(env) ? (String(info.url || '').startsWith('https://api.dualhook.com/') ? info.url : `${DUAL}/${mediaId}/content`)
    : info.url;
  const file = await fetch(url, { headers: authHeaders(env) });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: info.mime_type || 'application/octet-stream' };
}

// מעלים מדיה מחדש כדי לשלוח אותה לחנן (מזהה מדיה של הודעה נכנסת לא תמיד אפשר לשלוח הלאה)
export async function uploadMedia(env, bytes, mime) {
  // UltraMsg מקבלים את הקובץ עצמו (base64) בזמן השליחה
  if (isUltra(env)) return toBase64(bytes);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([bytes], { type: mime }), 'file');
  const res = await fetch(endpoint(env, 'media'), {
    method: 'POST', headers: authHeaders(env), body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`media upload ${res.status} ${JSON.stringify(data)}`);
  return data.id;
}

// בדיקת חתימת Meta (X-Hub-Signature-256) כדי שרק Meta יוכלו לשלוח לשרת
export async function verifySignature(appSecret, rawBody, header) {
  if (!appSecret) return true; // אם לא הוגדר סוד, לא בודקים (רק בשלב בדיקות)
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expected = header.slice(7);
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function toBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
